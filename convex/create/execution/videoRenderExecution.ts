import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { internalAction, type MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import { dataWithArtifactCaption } from "../../content/artifactCaptions";
import { storeGeneratedAsset } from "../../content/assets/assetStorage";
import { getModelProvider } from "../../providers";
import { waitForGeneratedVideo } from "../../content/requestExecution/generationWaiters";
import { referenceFromArtifact, resolveToolReferences } from "../references/referenceResolution";
import {
  analysisContextForThreadToolOutputs,
  briefWithAnalysisContext,
} from "../references/sourceAnalysisContext";
import {
  appendAgentMessage,
  cleanOptionalStringFromRecord,
  errorMessageFromUnknown,
  finitePositiveNumber,
  mediaAssetsFromInput,
  modelProviderFromInput,
  modelProviderNameValidator,
  positiveIntegerFromInput,
  toolReferenceAssetValidator,
  uniqueReferenceAssets,
} from "./toolExecutionShared";
import { appendDiscoveredReferencesForThread } from "./toolReferenceCollection";
import { readyArtifactsForThreadToolOutputs } from "./threadToolOutputs";
import type { ModelProviderName } from "../../providers/model";

type VideoRenderProviderName = Extract<
  ModelProviderName,
  "bulkapis" | "gemini" | "fal" | "openrouter" | "manual"
>;

export async function createVideoRenderForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = typeof toolCall.input === "object" && toolCall.input && !Array.isArray(toolCall.input)
    ? toolCall.input as Record<string, unknown>
    : {};
  const prompt = cleanOptionalStringFromRecord(input, "prompt") ??
    cleanOptionalStringFromRecord(input, "brief") ??
    "";
  if (!prompt) throw new Error("Video render prompt is required.");
  const effectivePrompt = briefWithAnalysisContext(
    prompt,
    await analysisContextForThreadToolOutputs(ctx, thread, toolCall._id)
  );

  const resolvedReferences = await resolveToolReferences(ctx, thread, input);
  await appendDiscoveredReferencesForThread(ctx, thread, toolCall._id, resolvedReferences);
  const priorArtifacts = [
    ...(await readyArtifactsForThreadToolOutputs(ctx, thread, toolCall._id, "image")),
    ...(await readyArtifactsForThreadToolOutputs(ctx, thread, toolCall._id, "video")),
    ...(await readyArtifactsForThreadToolOutputs(ctx, thread, toolCall._id, "audio")),
  ];
  const priorReferenceAssets = priorArtifacts.flatMap((artifact) => {
    const reference = referenceFromArtifact(artifact);
    return reference ? [reference] : [];
  });
  const mediaAssets = uniqueReferenceAssets([
    ...mediaAssetsFromInput(input),
    ...resolvedReferences.imageReferences,
    ...resolvedReferences.videoReferences,
    ...resolvedReferences.audioReferences,
    ...priorReferenceAssets,
  ]);
  const parentArtifactIds = priorArtifacts.map((artifact) => artifact._id);
  const provider = (modelProviderFromInput(input.provider) ?? "bulkapis") as VideoRenderProviderName;
  const model = cleanOptionalStringFromRecord(input, "model");
  const now = Date.now();
  await ctx.db.patch(toolCall._id, {
    status: "running",
    output: {
      provider,
      model,
      mediaAssetCount: mediaAssets.length,
      status: "running",
      usedAnalysisContext: effectivePrompt !== prompt,
    },
    startedAt: toolCall.startedAt ?? now,
    updatedAt: now,
  });

  const uniqueParentArtifactIds = [
    ...new Map(parentArtifactIds.map((artifactId) => [String(artifactId), artifactId])).values(),
  ];

  await ctx.scheduler.runAfter(0, internal.create.execution.videoRenderExecution.executeVideoRender, {
    aspectRatio: cleanOptionalStringFromRecord(input, "aspectRatio"),
    fps: positiveIntegerFromInput(input.fps),
    height: positiveIntegerFromInput(input.height),
    knowledgeBase: cleanOptionalStringFromRecord(input, "knowledgeBase"),
    maxDurationSeconds: finitePositiveNumber(input.maxDurationSeconds) ??
      finitePositiveNumber(input.durationSeconds),
    mediaAssets,
    model,
    parentArtifactIds: uniqueParentArtifactIds,
    prompt: effectivePrompt,
    provider,
    systemPrompt: cleanOptionalStringFromRecord(input, "systemPrompt"),
    threadId: thread._id,
    toolCallId: toolCall._id,
    userId: thread.userId,
    width: positiveIntegerFromInput(input.width),
    workspaceId: thread.workspaceId,
  });

  await appendAgentMessage(ctx, thread, {
    content: mediaAssets.length
      ? `Started AI video render with ${mediaAssets.length} media reference${mediaAssets.length === 1 ? "" : "s"}.`
      : "Started AI video render from the prompt.",
    kind: "status",
  });
  return true;
}

export const executeVideoRender = internalAction({
  args: {
    aspectRatio: v.optional(v.string()),
    fps: v.optional(v.number()),
    height: v.optional(v.number()),
    knowledgeBase: v.optional(v.string()),
    maxDurationSeconds: v.optional(v.number()),
    mediaAssets: v.array(toolReferenceAssetValidator),
    model: v.optional(v.string()),
    parentArtifactIds: v.optional(v.array(v.id("artifacts"))),
    prompt: v.string(),
    provider: modelProviderNameValidator,
    systemPrompt: v.optional(v.string()),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
    userId: v.string(),
    width: v.optional(v.number()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const operationId = `tool:${args.toolCallId}:video-render-provider`;
    const startedAt = Date.now();
    let providerCompleted = false;
    try {
      const provider = getModelProvider(args.provider);
      if (!provider.capabilities.videoRender) {
        throw new Error(`${provider.displayName} does not support AI video render.`);
      }

      const renderInput = {
        prompt: args.prompt,
        model: args.model,
        systemPrompt: args.systemPrompt,
        knowledgeBase: args.knowledgeBase,
        mediaAssets: args.mediaAssets.length ? args.mediaAssets : undefined,
        aspectRatio: args.aspectRatio,
        width: args.width,
        height: args.height,
        fps: args.fps,
        maxDurationSeconds: args.maxDurationSeconds,
        metadata: {
          createThreadId: String(args.threadId),
          createToolCallId: String(args.toolCallId),
          mediaAssetCount: args.mediaAssets.length,
          toolName: "media.renderVideo",
        },
      };
      await ctx.runMutation(internal.create.observability.runEvents.record, {
        threadId: args.threadId,
        createToolCallId: args.toolCallId,
        operationId,
        parentOperationId: `tool:${args.toolCallId}`,
        scope: "provider",
        eventType: "provider.call.started",
        status: "running",
        provider: args.provider,
        modelId: args.model,
        startedAt,
        summary: "Started the AI video-render provider call.",
        details: { input: renderInput },
      });
      const result = await provider.generateVideoRender(renderInput);
      const submittedAt = Date.now();
      await ctx.runMutation(internal.create.observability.runEvents.record, {
        threadId: args.threadId,
        createToolCallId: args.toolCallId,
        operationId,
        parentOperationId: `tool:${args.toolCallId}`,
        scope: "provider",
        eventType: "provider.submitted",
        status: "running",
        provider: result.metadata.provider,
        modelId: result.metadata.model,
        providerRequestId: result.jobId,
        inputTokens: result.metadata.usage?.inputTokens,
        outputTokens: result.metadata.usage?.outputTokens,
        totalTokens: result.metadata.usage?.totalTokens,
        actualCostUsd: result.metadata.costUsd,
        pricingSource: "provider_metadata",
        startedAt,
        completedAt: submittedAt,
        durationMs: submittedAt - startedAt,
        summary: "The AI video-render provider accepted the request.",
        details: {
          providerStatus: result.status,
          metadata: result.metadata,
        },
      });
      await ctx.runMutation(internal.usage.records.recordToolCharge, {
        threadId: args.threadId,
        toolCallId: args.toolCallId,
        provider: result.metadata.provider,
        modelId: result.metadata.model,
        operationKey: `tool:${args.toolCallId}:video-render`,
        actualCostUsd: result.metadata.costUsd,
        parameters: {
          maxDurationSeconds: args.maxDurationSeconds,
          mediaAssetCount: args.mediaAssets.length,
          width: args.width,
          height: args.height,
          fps: args.fps,
        },
      });
      const videoAsset = await waitForGeneratedVideo(
        provider,
        {
          jobId: result.jobId,
          model: result.metadata.model,
          metadata: result.metadata,
        },
        async (status, observation) => {
          await ctx.runMutation(internal.create.observability.runEvents.record, {
            threadId: args.threadId,
            createToolCallId: args.toolCallId,
            operationId,
            parentOperationId: `tool:${args.toolCallId}`,
            scope: "provider",
            eventType: status === "failed" || status === "canceled"
              ? "provider.failed"
              : "provider.poll",
            status: status === "failed" || status === "canceled" ? "failed" : "running",
            provider: result.metadata.provider,
            modelId: result.metadata.model,
            providerRequestId: result.jobId,
            attempt: observation.attempt,
            summary: `Video-render provider poll ${observation.attempt}: ${status}.`,
            details: observation,
            errorMessage: observation.errorMessage,
          });
        }
      );
      const stored = await storeGeneratedAsset(ctx, videoAsset);
      const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
        userId: args.userId,
        workspaceId: args.workspaceId,
        parentArtifactIds: args.parentArtifactIds,
        type: "video",
        title: "AI rendered video",
        storageUrl: stored.storageUrl,
        data: dataWithArtifactCaption({
          storageId: stored.storageId,
          mimeType: stored.mimeType,
          fileSize: stored.byteLength,
          sourceMimeType: videoAsset.mimeType,
          jobId: result.jobId,
          status: "succeeded",
          aspectRatio: args.aspectRatio,
          maxDurationSeconds: args.maxDurationSeconds,
          width: args.width,
          height: args.height,
          fps: args.fps,
          mediaAssetCount: args.mediaAssets.length,
          providerMetadata: result.metadata,
        }, args.prompt),
        provider: result.metadata.provider,
        model: result.metadata.model,
        prompt: args.prompt,
        reviewStatus: "not_required",
      });

      const completedAt = Date.now();
      await ctx.runMutation(internal.create.observability.runEvents.record, {
        threadId: args.threadId,
        createToolCallId: args.toolCallId,
        operationId,
        parentOperationId: `tool:${args.toolCallId}`,
        scope: "provider",
        eventType: "provider.completed",
        status: "succeeded",
        provider: result.metadata.provider,
        modelId: result.metadata.model,
        providerRequestId: result.jobId,
        actualCostUsd: result.metadata.costUsd,
        pricingSource: "provider_metadata",
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        summary: "The AI video render completed and its artifact was stored.",
        details: { artifactId },
      });
      await ctx.runMutation(internal.create.observability.runEvents.record, {
        threadId: args.threadId,
        createToolCallId: args.toolCallId,
        artifactId,
        operationId: `artifact:${artifactId}`,
        parentOperationId: operationId,
        scope: "artifact",
        eventType: "artifact.created",
        status: "succeeded",
        provider: result.metadata.provider,
        modelId: result.metadata.model,
        providerRequestId: result.jobId,
        completedAt,
        summary: "Stored the AI-rendered video artifact.",
      });
      providerCompleted = true;

      await ctx.runMutation(internal.create.toolExecution.completeVideoRender, {
        artifactId,
        costUsd: result.metadata.costUsd,
        jobId: result.jobId,
        mediaAssetCount: args.mediaAssets.length,
        model: result.metadata.model,
        provider: result.metadata.provider,
        storageUrl: stored.storageUrl,
        threadId: args.threadId,
        toolCallId: args.toolCallId,
      });
    } catch (error) {
      if (!providerCompleted) {
        const completedAt = Date.now();
        await ctx.runMutation(internal.create.observability.runEvents.record, {
          threadId: args.threadId,
          createToolCallId: args.toolCallId,
          operationId,
          parentOperationId: `tool:${args.toolCallId}`,
          scope: "provider",
          eventType: "provider.failed",
          status: "failed",
          provider: args.provider,
          modelId: args.model,
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
          summary: "The AI video-render pipeline failed.",
          errorMessage: errorMessageFromUnknown(error),
          details: { error },
        });
      }
      await ctx.runMutation(internal.create.toolExecution.failVideoRender, {
        errorMessage: errorMessageFromUnknown(error),
        threadId: args.threadId,
        toolCallId: args.toolCallId,
      });
    }
  },
});
