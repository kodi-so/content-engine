import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { internalAction, type MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import { getModelProvider } from "../../providers";
import {
  appendAgentMessage,
  cleanOptionalStringFromRecord,
  errorMessageFromUnknown,
  finitePositiveNumber,
  modelProviderFromInput,
} from "./toolExecutionShared";
import { isRecord } from "../references/referenceResolution";

function textArtifactTypeFromInput(value: unknown): "text_draft" | "caption" | "script" | "scene_spec" | "shot_list" {
  if (value === "caption" || value === "captions") return "caption";
  if (value === "script") return "script";
  if (value === "scene_spec" || value === "outline" || value === "treatment") return "scene_spec";
  if (value === "shot_list" || value === "shots") return "shot_list";
  return "text_draft";
}

export async function createTextGenerationForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const prompt = cleanOptionalStringFromRecord(input, "prompt") ??
    cleanOptionalStringFromRecord(input, "brief") ??
    cleanOptionalStringFromRecord(input, "text") ??
    "";
  if (!prompt) throw new Error("Text generation prompt is required.");

  const provider = modelProviderFromInput(input.provider) ?? "openrouter";
  const model = cleanOptionalStringFromRecord(input, "model");
  const now = Date.now();
  await ctx.db.patch(toolCall._id, {
    status: "running",
    startedAt: toolCall.startedAt ?? now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.create.execution.textGenerationExecution.executeTextGeneration, {
    input,
    model,
    prompt,
    provider,
    threadId: thread._id,
    toolCallId: toolCall._id,
    userId: thread.userId,
    workspaceId: thread.workspaceId,
  });

  await appendAgentMessage(ctx, thread, {
    content: "Started text generation. I will show the draft here when it finishes.",
    kind: "status",
  });
  return true;
}

export const executeTextGeneration = internalAction({
  args: {
    input: v.any(),
    model: v.optional(v.string()),
    prompt: v.string(),
    provider: v.union(
      v.literal("bulkapis"),
      v.literal("gemini"),
      v.literal("fal"),
      v.literal("openrouter"),
      v.literal("manual")
    ),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const input = isRecord(args.input) ? args.input : {};
    try {
      const provider = getModelProvider(args.provider);
      if (!provider.capabilities.text) {
        throw new Error(`${provider.displayName} does not support text generation.`);
      }

      const result = await provider.generateText({
        prompt: args.prompt,
        systemPrompt: cleanOptionalStringFromRecord(input, "systemPrompt"),
        model: args.model,
        maxTokens: finitePositiveNumber(input.maxTokens),
        temperature: finitePositiveNumber(input.temperature),
        metadata: {
          createThreadId: String(args.threadId),
          createToolCallId: String(args.toolCallId),
          toolName: "text.generate",
        },
      });
      const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
        userId: args.userId,
        workspaceId: args.workspaceId,
        type: textArtifactTypeFromInput(input.kind),
        title: cleanOptionalStringFromRecord(input, "title") ?? "Generated text",
        data: {
          text: result.text.trim(),
          kind: cleanOptionalStringFromRecord(input, "kind") ?? "text_draft",
          providerMetadata: result.metadata,
        },
        provider: result.metadata.provider,
        model: result.metadata.model,
        prompt: args.prompt,
        reviewStatus: "not_required",
      });

      await ctx.runMutation(internal.create.toolExecution.completeTextGeneration, {
        artifactId,
        costUsd: result.metadata.costUsd,
        model: result.metadata.model,
        provider: result.metadata.provider,
        text: result.text.trim(),
        threadId: args.threadId,
        toolCallId: args.toolCallId,
      });
    } catch (error) {
      await ctx.runMutation(internal.create.toolExecution.failTextGeneration, {
        errorMessage: errorMessageFromUnknown(error),
        threadId: args.threadId,
        toolCallId: args.toolCallId,
      });
    }
  },
});
