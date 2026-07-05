import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  buildPlannedToolInput,
  normalizePlannedToolInputForToolCall,
  toolDescriptorMap,
  type CreateReferenceMention,
} from "../planning";
import { toolCallHasPendingAsyncOutput } from "../execution/toolCallReadiness";
import type {
  CreateDecisionIntent,
  CreatePlannedToolCall,
} from "./agentDecision";

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
    toolCall.toolName === "publishing.prepare" ||
    toolCall.toolName === "workflow.createDraft"
  ) {
    return true;
  }
  if (
    toolCall.toolName === "media.generateImage" ||
    toolCall.toolName === "media.generateVideo" ||
    toolCall.toolName === "media.generateAudio" ||
    toolCall.toolName === "media.lipsync"
  ) {
    return toolCall.input?.usePriorImageOutputs === true ||
      typeof toolCall.input?.priorImageOutputIndex === "number";
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

async function existingOpenToolCallIds(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const ids: Id<"createToolCalls">[] = [];

  for (const toolCall of toolCalls) {
    if (
      toolCall.status === "queued" ||
      toolCall.status === "running" ||
      toolCall.status === "blocked" ||
      (toolCall.status === "succeeded" && await toolCallHasPendingAsyncOutput(ctx, thread, toolCall))
    ) {
      ids.push(toolCall._id);
    }
  }

  return ids;
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
  referenceMentions?: CreateReferenceMention[]
) {
  const descriptors = toolDescriptorMap();
  const now = Date.now();
  const siblingToolNames = intent.toolCalls.map((toolCall) => toolCall.toolName);
  const existingDependencyIds = await existingOpenToolCallIds(ctx, thread);

  const insertedCalls: Array<{
    id: Id<"createToolCalls">;
    input: Record<string, unknown>;
    toolName: string;
  }> = [];

  for (const plannedCall of intent.toolCalls) {
    const tool = descriptors.get(plannedCall.toolName);
    const callContent = plannedCall.prompt || content;
    const inferredInput = buildPlannedToolInput({
      content: callContent,
      outputType: intent.outputType,
      referenceMentions,
      toolName: plannedCall.toolName,
    });
    const input = normalizePlannedToolInputForToolCall({
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
    const existingDependencies = dependsOnAllPreviousCalls(insertedCalls[index])
      ? existingDependencyIds
      : [];
    if (!dependencies.length && !existingDependencies.length) continue;
    await ctx.db.patch(insertedCalls[index].id, {
      dependsOnToolCallIds: [
        ...existingDependencies,
        ...dependencies.map((dependencyIndex) => insertedCalls[dependencyIndex].id),
      ],
      updatedAt: now,
    });
  }
}
