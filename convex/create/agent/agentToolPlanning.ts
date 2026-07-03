import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  buildPlannedToolInput,
  normalizePlannedToolInputForToolCall,
  toolDescriptorMap,
  type CreateReferenceMention,
} from "../planning";
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
    await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      messageId,
      toolName: plannedCall.toolName,
      status: "queued",
      label: plannedCall.planStep || tool?.label || plannedCall.toolName,
      input,
      createdAt: now,
      updatedAt: now,
    });
  }
}
