import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  dependencyIndexesForCreateCommands,
  enqueueCreateCommands,
} from "../commands/runtime";
import {
  enrichPlannedToolInput,
  normalizePlannedToolInputForToolCall,
  referenceMentionsForPlannedToolInput,
  toolDescriptorMap,
  type CreateReferenceMention,
} from "../planning";
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

export function dependencyIndexesForPlannedToolCalls(
  toolCalls: Array<{ input?: Record<string, unknown>; toolName: string }>
) {
  return dependencyIndexesForCreateCommands(
    toolCalls.map((toolCall) => ({
      input: toolCall.input ?? {},
      toolName: toolCall.toolName as CreatePlannedToolCall["toolName"],
    }))
  );
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
  const siblingToolNames = intent.toolCalls.map((toolCall) => toolCall.toolName);
  const commands: Array<{
    input: Record<string, unknown>;
    label?: string;
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
    commands.push({
      input,
      label: plannedCall.planStep || tool?.label || plannedCall.toolName,
      toolName: plannedCall.toolName,
    });
  }

  await enqueueCreateCommands(ctx, thread, {
    commands: commands as Array<{
      input: Record<string, unknown>;
      label?: string;
      toolName: CreatePlannedToolCall["toolName"];
    }>,
    messageId,
  });
}
