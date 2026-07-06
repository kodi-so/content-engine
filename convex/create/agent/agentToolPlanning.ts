import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  enrichPlannedToolInput,
  hasExplicitPriorOutputSelection,
  normalizePlannedToolInputForToolCall,
  referenceMentionsForPlannedToolInput,
  toolDescriptorMap,
  type CreateReferenceMention,
} from "../planning";
import { toolCallHasPendingAsyncOutput } from "../execution/toolCallReadiness";
import type {
  CreateDecisionIntent,
  CreatePlannedToolCall,
} from "./agentDecision";
import {
  rosterModelById,
  type RosterModelMode,
} from "../../../src/lib/generation/modelRoster";

function requiresDebugReviewBeforeExecution(toolCall: CreatePlannedToolCall) {
  const tool = toolDescriptorMap().get(toolCall.toolName);
  if (!tool) return true;
  return tool.checkpoint.behavior !== "none" &&
    tool.checkpoint.defaultInDebugMode === true;
}

export function hasDebugGatedToolCalls(intent: CreateDecisionIntent) {
  return intent.toolCalls.some(requiresDebugReviewBeforeExecution);
}

type DependencyCandidate = {
  input?: Record<string, unknown>;
  toolName: string;
};

function dependsOnAllPreviousCalls(toolCall: DependencyCandidate) {
  if (
    toolCall.toolName === "media.renderVideo" ||
    toolCall.toolName === "slideshow.render" ||
    toolCall.toolName === "studio.compose" ||
    toolCall.toolName === "studio.render" ||
    toolCall.toolName === "artifact.save" ||
    toolCall.toolName === "artifact.export" ||
    toolCall.toolName === "publishing.prepare"
  ) {
    return true;
  }
  if (
    toolCall.toolName === "media.generateImage" ||
    toolCall.toolName === "media.generateVideo" ||
    toolCall.toolName === "media.generateAudio" ||
    toolCall.toolName === "media.lipsync"
  ) {
    return hasExplicitPriorOutputSelection(toolCall.input);
  }
  return false;
}

function dependsOnEarlierAnalysis(toolName: string) {
  return toolName === "text.generate" ||
    toolName === "media.generateImage" ||
    toolName === "media.generateVideo" ||
    toolName === "media.generateAudio" ||
    toolName === "media.lipsync";
}

function modelModeForToolName(toolName: string): RosterModelMode | undefined {
  if (toolName === "media.generateImage") return "image";
  if (toolName === "media.generateVideo") return "video";
  if (toolName === "media.generateAudio") return "audio";
  if (toolName === "media.lipsync") return "lipsync";
  return undefined;
}

function currentModelOverrideForTool(
  toolName: string,
  currentReferenceMentions?: CreateReferenceMention[]
) {
  const mode = modelModeForToolName(toolName);
  if (!mode) return undefined;

  return [...(currentReferenceMentions ?? [])]
    .reverse()
    .map((mention) =>
      mention.entityType === "model" ? rosterModelById(mention.entityId) : undefined
    )
    .find((model) => model?.mode === mode);
}

export function applyCurrentModelOverride(args: {
  currentReferenceMentions?: CreateReferenceMention[];
  input: Record<string, unknown>;
  toolName: string;
}) {
  const model = currentModelOverrideForTool(args.toolName, args.currentReferenceMentions);
  return model ? { ...args.input, model: model.id } : args.input;
}

type ExistingOpenToolCall = {
  id: Id<"createToolCalls">;
  toolName: string;
};

async function existingOpenToolCalls(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const openToolCalls: ExistingOpenToolCall[] = [];

  for (const toolCall of toolCalls) {
    if (
      toolCall.status === "queued" ||
      toolCall.status === "running" ||
      toolCall.status === "blocked" ||
      (toolCall.status === "succeeded" && await toolCallHasPendingAsyncOutput(ctx, thread, toolCall))
    ) {
      openToolCalls.push({
        id: toolCall._id,
        toolName: toolCall.toolName,
      });
    }
  }

  return openToolCalls;
}

export function dependencyIndexesForPlannedToolCalls(
  toolCalls: DependencyCandidate[]
) {
  return toolCalls.map((toolCall, index) => {
    const previousCalls = toolCalls.slice(0, index);
    if (toolCall.toolName === "analyze.source" || toolCall.toolName === "references.list") {
      return [];
    }
    if (dependsOnAllPreviousCalls(toolCall)) {
      return previousCalls.map((_previous, previousIndex) => previousIndex);
    }
    if (dependsOnEarlierAnalysis(toolCall.toolName)) {
      return previousCalls.flatMap((previous, previousIndex) =>
        previous.toolName === "analyze.source" ? [previousIndex] : []
      );
    }
    return [];
  });
}

export async function recordPlannedTools(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  messageId: Id<"createMessages">,
  intent: CreateDecisionIntent,
  content: string,
  threadReferenceMentions?: CreateReferenceMention[],
  currentReferenceMentions?: CreateReferenceMention[]
) {
  const descriptors = toolDescriptorMap();
  const now = Date.now();
  const siblingToolNames = intent.toolCalls.map((toolCall) => toolCall.toolName);
  const existingDependencies = await existingOpenToolCalls(ctx, thread);
  const existingDependencyIds = existingDependencies.map((toolCall) => toolCall.id);
  const existingAnalysisDependencyIds = existingDependencies.flatMap((toolCall) =>
    toolCall.toolName === "analyze.source" ? [toolCall.id] : []
  );

  const insertedCalls: Array<{
    id: Id<"createToolCalls">;
    input: Record<string, unknown>;
    toolName: string;
  }> = [];

  for (const plannedCall of intent.toolCalls) {
    const tool = descriptors.get(plannedCall.toolName);
    const callContent = plannedCall.prompt || content;
    const referenceMentions = referenceMentionsForPlannedToolInput({
      currentReferenceMentions,
      plannedInput: plannedCall.input,
      threadReferenceMentions,
    });
    const inferredInput = enrichPlannedToolInput({
      content: callContent,
      outputType: intent.outputType,
      referenceMentions,
      toolName: plannedCall.toolName,
    });
    const normalizedInput = normalizePlannedToolInputForToolCall({
      input: {
        ...inferredInput,
        ...(plannedCall.input ?? {}),
        ...(plannedCall.prompt ? { prompt: plannedCall.prompt, brief: callContent } : {}),
      },
      planStep: plannedCall.planStep,
      prompt: plannedCall.prompt,
      siblingToolNames,
      toolName: plannedCall.toolName,
    });
    const input = applyCurrentModelOverride({
      currentReferenceMentions,
      input: normalizedInput,
      toolName: plannedCall.toolName,
    });
    const id = await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      messageId,
      toolName: plannedCall.toolName,
      dependsOnToolCallIds: [],
      status: "queued",
      label: plannedCall.planStep || tool?.label || plannedCall.toolName,
      input,
      createdAt: now,
      updatedAt: now,
    });
    insertedCalls.push({
      id,
      input,
      toolName: plannedCall.toolName,
    });
  }

  const dependencyIndexes = dependencyIndexesForPlannedToolCalls(insertedCalls);
  for (const [index, dependencies] of dependencyIndexes.entries()) {
    const existingDependencyIdsForCall = dependsOnAllPreviousCalls(insertedCalls[index])
      ? existingDependencyIds
      : dependsOnEarlierAnalysis(insertedCalls[index].toolName)
        ? existingAnalysisDependencyIds
        : [];
    if (!dependencies.length && !existingDependencyIdsForCall.length) continue;
    await ctx.db.patch(insertedCalls[index].id, {
      dependsOnToolCallIds: [
        ...existingDependencyIdsForCall,
        ...dependencies.map((dependencyIndex) => insertedCalls[dependencyIndex].id),
      ],
      updatedAt: now,
    });
  }
}
