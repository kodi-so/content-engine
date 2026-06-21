import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { storeGeneratedAsset } from "../content/assetStorage";
import {
  DEFAULT_ANALYSIS_MODEL,
  GEMINI_PROVIDER,
  cleanOptionalText,
  sourcePlatformForUrl,
} from "../analyze/videoAnalysisModel";
import { getModelProvider } from "../providers";
import type { ModelProviderName } from "../providers/model";
import { waitForGeneratedVideo } from "../workflows/runtime/generationWaiters";
import {
  artifactDurationSeconds,
  artifactMediaKind,
  artifactMimeType,
  isRecord,
  referenceFromArtifact,
  resolveToolReferences,
  type ToolReferenceAsset,
} from "./referenceResolution";
import { listReferencesForToolCall } from "./referenceDiscovery";
import {
  analysisJobIdFromToolOutput,
  analysisContextForThreadToolOutputs,
  briefWithAnalysisContext,
  hasPendingAnalysisContextForThreadToolOutputs,
} from "./sourceAnalysisContext";
import { buildCreateAgentStudioDraft } from "./studioComposition";
import { createStudioRenderRequest } from "./studioRenderRequests";
import { createWorkflowDraftFromThread } from "./workflowExport";

export type MediaGenerationMode = "image" | "video" | "audio" | "lipsync";

const STUDIO_RENDER_NOT_CONFIGURED_MESSAGE =
  "Automatic Studio rendering is not configured yet. Set STUDIO_RENDER_WORKER_URL and STUDIO_RENDER_WORKER_API_KEY so Create can render the final video in chat.";

function providerForMediaMode(
  workspace: Doc<"workspaces"> | null,
  mode: MediaGenerationMode
) {
  const settings = workspace?.aiGenerationSettings;
  if (mode === "image") return settings?.imageProvider ?? "fal";
  if (mode === "video") return settings?.videoProvider ?? "fal";
  if (mode === "audio") return settings?.audioProvider ?? "fal";
  return settings?.lipsyncProvider ?? "fal";
}

function modelProviderFromInput(value: unknown): ModelProviderName | undefined {
  return value === "bulkapis" ||
    value === "gemini" ||
    value === "fal" ||
    value === "openrouter" ||
    value === "manual"
    ? value
    : undefined;
}

const DEFAULT_CREATE_FAL_IMAGE_MODEL = "fal-ai/gemini-3.1-flash-image-preview";

function isEditableFalImageModel(model: string) {
  return model === "fal-ai/gemini-3-pro-image-preview" ||
    model === "fal-ai/gemini-3.1-flash-image-preview" ||
    model === "fal-ai/nano-banana-pro" ||
    model === "fal-ai/nano-banana-2";
}

function effectiveQueuedModelForToolOutput(args: {
  mode: MediaGenerationMode;
  model?: string;
  provider: ModelProviderName;
  referenceCount: number;
}) {
  if (args.provider !== "fal" || args.mode !== "image") return args.model;

  const model = args.model?.trim() || DEFAULT_CREATE_FAL_IMAGE_MODEL;
  if (args.referenceCount > 0 && isEditableFalImageModel(model)) return `${model}/edit`;
  return model;
}

function mediaModeForToolName(toolName: string): MediaGenerationMode | null {
  if (toolName === "media.generateImage") return "image";
  if (toolName === "media.generateVideo") return "video";
  if (toolName === "media.generateAudio") return "audio";
  if (toolName === "media.lipsync") return "lipsync";
  return null;
}

function textArtifactTypeFromInput(value: unknown): "text_draft" | "caption" | "script" | "scene_spec" | "shot_list" {
  if (value === "caption" || value === "captions") return "caption";
  if (value === "script") return "script";
  if (value === "scene_spec" || value === "outline" || value === "treatment") return "scene_spec";
  if (value === "shot_list" || value === "shots") return "shot_list";
  return "text_draft";
}

function isRevisionBrief(brief: string) {
  return /\b(revise|revision|change|update|modify|improve|redo|edit)\b/i.test(brief);
}

function errorMessageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : "Tool execution failed.";
}

function contentRequestIdFromToolOutput(output: unknown): Id<"contentRequests"> | null {
  if (!isRecord(output) || typeof output.contentRequestId !== "string") return null;
  return output.contentRequestId as Id<"contentRequests">;
}

function videoProjectIdFromToolOutput(output: unknown): Id<"videoProjects"> | null {
  if (!isRecord(output) || typeof output.projectId !== "string") return null;
  return output.projectId as Id<"videoProjects">;
}

function studioRenderRequestIdFromToolOutput(output: unknown): Id<"studioRenderRequests"> | null {
  if (!isRecord(output) || typeof output.studioRenderRequestId !== "string") return null;
  return output.studioRenderRequestId as Id<"studioRenderRequests">;
}

type MutableResolvedReferences = Awaited<ReturnType<typeof resolveToolReferences>>;
type VideoRenderProviderName = "bulkapis" | "gemini" | "fal" | "openrouter" | "manual";

type AnalysisSourceForToolCall = {
  artifactId?: Id<"artifacts">;
  creativeAssetId?: Id<"creativeAssets">;
  fileName?: string;
  label: string;
  libraryAssetId?: string;
  mimeType?: string;
  sourcePlatform: Doc<"videoAnalysisJobs">["sourcePlatform"];
  sourceType: "url" | "upload";
  sourceUrl?: string;
  storageUrl?: string;
  byteLength?: number;
};

function referenceKey(reference: ToolReferenceAsset) {
  return `${reference.mimeType}:${reference.url}`;
}

function appendUniqueReference(target: ToolReferenceAsset[], reference: ToolReferenceAsset) {
  const key = referenceKey(reference);
  if (target.some((existing) => referenceKey(existing) === key)) return;
  target.push(reference);
}

function pushDiscoveredReferenceByMediaKind(
  references: MutableResolvedReferences,
  mediaKind: string,
  reference: ToolReferenceAsset
) {
  if (mediaKind === "image") {
    appendUniqueReference(references.imageReferences, reference);
    return;
  }
  if (mediaKind === "video") {
    appendUniqueReference(references.videoReferences, reference);
    return;
  }
  if (mediaKind === "audio") {
    appendUniqueReference(references.audioReferences, reference);
  }
}

async function appendDiscoveredReferencesForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId: Id<"createToolCalls"> | undefined,
  references: MutableResolvedReferences
) {
  const threadToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  const seenCreativeAssetIds = new Set(
    references.creativeAssetReferences.map((reference) => String(reference.assetId))
  );

  for (const candidate of threadToolCalls) {
    if (excludeToolCallId && candidate._id === excludeToolCallId) continue;
    if (candidate.toolName !== "references.list" || candidate.status !== "succeeded") continue;
    const output = isRecord(candidate.output) ? candidate.output : {};
    if (!Array.isArray(output.references)) continue;

    for (const item of output.references) {
      if (!isRecord(item)) continue;
      const storageUrl = typeof item.storageUrl === "string" ? item.storageUrl.trim() : "";
      const mediaKind = typeof item.mediaKind === "string" ? item.mediaKind : "";
      if (!storageUrl || (mediaKind !== "image" && mediaKind !== "video" && mediaKind !== "audio")) {
        continue;
      }

      const source = typeof item.source === "string" ? item.source : "";
      const sourceId = typeof item.sourceId === "string" ? item.sourceId : "";
      const creativeAssetId = typeof item.creativeAssetId === "string"
        ? item.creativeAssetId
        : source === "creative_asset"
          ? sourceId
          : "";
      if (creativeAssetId && !seenCreativeAssetIds.has(creativeAssetId)) {
        references.creativeAssetReferences.push({
          assetId: creativeAssetId as Id<"creativeAssets">,
          instruction: typeof item.prompt === "string" ? item.prompt : undefined,
        });
        seenCreativeAssetIds.add(creativeAssetId);
      }

      pushDiscoveredReferenceByMediaKind(references, mediaKind, {
        alias: typeof item.title === "string" ? item.title : undefined,
        description: typeof item.prompt === "string" ? item.prompt : undefined,
        mimeType: typeof item.mimeType === "string"
          ? item.mimeType
          : mediaKind === "image"
            ? "image/png"
            : mediaKind === "video"
              ? "video/mp4"
              : "audio/mpeg",
        url: storageUrl,
      });
    }
  }
}

async function appendAgentMessage(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  args: {
    content: string;
    artifactIds?: Id<"artifacts">[];
    kind?: "chat" | "clarification" | "plan" | "status" | "tool_result" | "final_review";
  }
) {
  const now = Date.now();
  return await ctx.db.insert("createMessages", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    createThreadId: thread._id,
    role: "agent",
    content: args.content,
    kind: args.kind,
    artifactIds: args.artifactIds,
    createdAt: now,
  });
}

function recordBelongsToCreateThread(
  thread: Doc<"createThreads">,
  record: { userId: string; workspaceId?: Id<"workspaces"> }
) {
  return thread.workspaceId
    ? record.workspaceId === thread.workspaceId
    : record.userId === thread.userId;
}

function cleanOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanOptionalStringFromRecord(input: Record<string, unknown>, key: string) {
  return cleanOptionalString(input[key]);
}

function finitePositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function positiveIntegerFromInput(value: unknown) {
  const number = finitePositiveNumber(value);
  return number ? Math.floor(number) : undefined;
}

function zeroBasedIndexFromInput(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function selectedPriorArtifacts<T>(artifacts: T[], input: Record<string, unknown>, key: string) {
  const index = zeroBasedIndexFromInput(input[key]);
  if (index === undefined) return artifacts;
  const artifact = artifacts[index];
  return artifact ? [artifact] : [];
}

function defaultCreateVideoModel(args: {
  mode: MediaGenerationMode;
  model?: string;
  provider: ModelProviderName;
  referenceImageCount: number;
}) {
  if (args.model || args.mode !== "video" || args.provider !== "fal") return args.model;
  return args.referenceImageCount > 0
    ? "fal-ai/kling-video/v3/pro/image-to-video"
    : "fal-ai/kling-video/v3/pro/text-to-video";
}

function uniqueReferenceAssets(assets: ToolReferenceAsset[]) {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = `${asset.url}:${asset.mimeType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mediaAssetsFromInput(input: Record<string, unknown>) {
  const mediaAssets = Array.isArray(input.mediaAssets) ? input.mediaAssets : [];
  return mediaAssets.flatMap((item): ToolReferenceAsset[] => {
    if (!isRecord(item)) return [];
    const url = cleanOptionalString(item.url) ??
      cleanOptionalString(item.storageUrl) ??
      cleanOptionalString(item.sourceUrl);
    const mimeType = cleanOptionalString(item.mimeType);
    if (!url || !mimeType) return [];
    return [{
      alias: cleanOptionalString(item.alias) ?? cleanOptionalString(item.title),
      description: cleanOptionalString(item.description) ?? cleanOptionalString(item.prompt),
      mimeType,
      url,
    }];
  });
}

function byteLengthFromRecord(record: Record<string, unknown>) {
  return finitePositiveNumber(record.byteLength) ??
    finitePositiveNumber(record.fileSize) ??
    finitePositiveNumber(record.sizeBytes);
}

async function createTextGenerationForToolCall(
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

  await ctx.scheduler.runAfter(0, internal.create.toolExecution.executeTextGeneration, {
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

export const completeTextGeneration = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    costUsd: v.optional(v.number()),
    model: v.string(),
    provider: v.union(
      v.literal("bulkapis"),
      v.literal("gemini"),
      v.literal("fal"),
      v.literal("openrouter"),
      v.literal("manual")
    ),
    text: v.string(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return;
    if (toolCall.status === "canceled") return;

    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "succeeded",
      output: {
        artifactId: args.artifactId,
        text: args.text,
        provider: args.provider,
        model: args.model,
      },
      artifactIds: [args.artifactId],
      costUsd: args.costUsd,
      errorMessage: undefined,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: "Generated a text draft.",
      artifactIds: [args.artifactId],
      kind: "tool_result",
    });

    const remainingQueuedToolCalls = await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread_status", (q) =>
        q.eq("createThreadId", thread._id).eq("status", "queued")
      )
      .collect();
    if (remainingQueuedToolCalls.length) {
      await executeRunnableQueuedTools(ctx, thread);
      return;
    }

    await ctx.db.patch(thread._id, {
      status: "ready",
      finalArtifactIds: [args.artifactId],
      updatedAt: now,
    });
  },
});

export const failTextGeneration = internalMutation({
  args: {
    errorMessage: v.string(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return;
    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: `${toolCall.label} failed: ${args.errorMessage}`,
      kind: "status",
    });
    await ctx.db.patch(thread._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      updatedAt: now,
    });
  },
});

async function createVideoRenderForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
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

  await ctx.scheduler.runAfter(0, internal.create.toolExecution.executeVideoRender, {
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

const modelProviderNameValidator = v.union(
  v.literal("bulkapis"),
  v.literal("gemini"),
  v.literal("fal"),
  v.literal("openrouter"),
  v.literal("manual")
);

const toolReferenceAssetValidator = v.object({
  alias: v.optional(v.string()),
  description: v.optional(v.string()),
  mimeType: v.string(),
  url: v.string(),
});

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
    try {
      const provider = getModelProvider(args.provider);
      if (!provider.capabilities.videoRender) {
        throw new Error(`${provider.displayName} does not support AI video render.`);
      }

      const result = await provider.generateVideoRender({
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
      });
      const videoAsset = await waitForGeneratedVideo(provider, {
        jobId: result.jobId,
        model: result.metadata.model,
        metadata: result.metadata,
      });
      const stored = await storeGeneratedAsset(ctx, videoAsset);
      const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
        userId: args.userId,
        workspaceId: args.workspaceId,
        parentArtifactIds: args.parentArtifactIds,
        type: "video",
        title: "AI rendered video",
        storageUrl: stored.storageUrl,
        data: {
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
        },
        provider: result.metadata.provider,
        model: result.metadata.model,
        prompt: args.prompt,
        reviewStatus: "not_required",
      });

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
      await ctx.runMutation(internal.create.toolExecution.failVideoRender, {
        errorMessage: errorMessageFromUnknown(error),
        threadId: args.threadId,
        toolCallId: args.toolCallId,
      });
    }
  },
});

export const completeVideoRender = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    costUsd: v.optional(v.number()),
    jobId: v.string(),
    mediaAssetCount: v.number(),
    model: v.string(),
    provider: modelProviderNameValidator,
    storageUrl: v.string(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return;
    if (toolCall.status === "canceled") return;

    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "succeeded",
      output: {
        artifactId: args.artifactId,
        jobId: args.jobId,
        mediaAssetCount: args.mediaAssetCount,
        model: args.model,
        provider: args.provider,
        status: "ready",
        storageUrl: args.storageUrl,
      },
      artifactIds: [args.artifactId],
      costUsd: args.costUsd,
      errorMessage: undefined,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: "AI video render completed.",
      artifactIds: [args.artifactId],
      kind: "tool_result",
    });

    const remainingQueuedToolCalls = await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread_status", (q) =>
        q.eq("createThreadId", thread._id).eq("status", "queued")
      )
      .collect();
    if (remainingQueuedToolCalls.length) {
      await executeRunnableQueuedTools(ctx, thread);
      return;
    }

    await ctx.db.patch(thread._id, {
      status: "ready",
      finalArtifactIds: [args.artifactId],
      updatedAt: now,
    });
  },
});

export const failVideoRender = internalMutation({
  args: {
    errorMessage: v.string(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return;
    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: `${toolCall.label} failed: ${args.errorMessage}`,
      kind: "status",
    });
    await ctx.db.patch(thread._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      updatedAt: now,
    });
  },
});

function sourcePlatformForStoredMedia(args: {
  mimeType?: string;
  storageUrl: string;
}): Doc<"videoAnalysisJobs">["sourcePlatform"] {
  if (
    args.mimeType?.startsWith("image/") ||
    args.mimeType?.startsWith("video/") ||
    args.mimeType?.startsWith("audio/")
  ) {
    return "direct_file";
  }

  try {
    return sourcePlatformForUrl(args.storageUrl);
  } catch {
    return "unknown";
  }
}

function libraryAssetParts(source: string) {
  const [kind, firstId, secondId] = source.split(":");
  return {
    kind,
    firstId,
    secondId,
  };
}

async function analysisSourceFromArtifact(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  artifactIdValue: string,
  libraryAssetId?: string
): Promise<AnalysisSourceForToolCall> {
  const artifactId = ctx.db.normalizeId("artifacts", artifactIdValue);
  if (!artifactId) throw new Error("Analyze Source could not find that artifact.");
  const artifact = await ctx.db.get(artifactId);
  if (!artifact || !recordBelongsToCreateThread(thread, artifact)) {
    throw new Error("Analyze Source could not access that artifact.");
  }
  if (!artifact.storageUrl) {
    throw new Error("Analyze Source needs an artifact with stored media.");
  }

  const data = isRecord(artifact.data) ? artifact.data : {};
  const mimeType = artifactMimeType(artifact) ?? cleanOptionalString(data.sourceMimeType);

  return {
    artifactId: artifact._id,
    byteLength: byteLengthFromRecord(data),
    fileName: cleanOptionalString(data.fileName) ?? artifact.title ?? "Create artifact",
    label: artifact.title?.trim() || "Create artifact",
    libraryAssetId,
    mimeType,
    sourcePlatform: sourcePlatformForStoredMedia({
      mimeType,
      storageUrl: artifact.storageUrl,
    }),
    sourceType: "upload",
    sourceUrl: artifact.storageUrl,
    storageUrl: artifact.storageUrl,
  };
}

async function analysisSourceFromCreativeAsset(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  creativeAssetIdValue: string,
  libraryAssetId?: string
): Promise<AnalysisSourceForToolCall> {
  const creativeAssetId = ctx.db.normalizeId("creativeAssets", creativeAssetIdValue);
  if (!creativeAssetId) throw new Error("Analyze Source could not find that library asset.");
  const asset = await ctx.db.get(creativeAssetId);
  if (!asset || !recordBelongsToCreateThread(thread, asset)) {
    throw new Error("Analyze Source could not access that library asset.");
  }

  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  const mimeType = cleanOptionalString(metadata.mimeType);

  return {
    byteLength: byteLengthFromRecord(metadata),
    creativeAssetId: asset._id,
    fileName: cleanOptionalString(metadata.fileName) ?? asset.name,
    label: asset.name,
    libraryAssetId,
    mimeType,
    sourcePlatform: sourcePlatformForStoredMedia({
      mimeType,
      storageUrl: asset.storageUrl,
    }),
    sourceType: "upload",
    sourceUrl: asset.storageUrl,
    storageUrl: asset.storageUrl,
  };
}

async function analysisSourceFromWorkflowExportAsset(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  source: string
): Promise<AnalysisSourceForToolCall> {
  const { firstId, secondId } = libraryAssetParts(source);
  if (!firstId) throw new Error("Analyze Source could not find that workflow export.");

  if (secondId) {
    const artifactId = ctx.db.normalizeId("artifacts", secondId);
    if (artifactId) {
      const artifact = await ctx.db.get(artifactId);
      if (artifact?.storageUrl && recordBelongsToCreateThread(thread, artifact)) {
        return await analysisSourceFromArtifact(ctx, thread, String(artifact._id), source);
      }
    }
  }

  const exportArtifactId = ctx.db.normalizeId("artifacts", firstId);
  if (!exportArtifactId) throw new Error("Analyze Source could not find that workflow export.");
  const exportArtifact = await ctx.db.get(exportArtifactId);
  if (!exportArtifact || !recordBelongsToCreateThread(thread, exportArtifact)) {
    throw new Error("Analyze Source could not access that workflow export.");
  }
  const data = isRecord(exportArtifact.data) ? exportArtifact.data : {};
  const mediaItems = Array.isArray(data.mediaItems) ? data.mediaItems : [];
  const itemIndex = secondId ? Number(secondId) : 0;
  const selectedItem = mediaItems.find((item, index) => {
    if (!isRecord(item)) return false;
    const itemArtifactId = typeof item.artifactId === "string" ? item.artifactId : undefined;
    return secondId
      ? itemArtifactId === secondId || index === itemIndex
      : index === 0;
  });

  if (!isRecord(selectedItem)) {
    throw new Error("Analyze Source could not find media in that workflow export.");
  }

  const storageUrl = cleanOptionalString(selectedItem.storageUrl);
  if (!storageUrl) throw new Error("Analyze Source needs workflow export media with a stored URL.");
  const mimeType = cleanOptionalString(selectedItem.mimeType);
  const title = cleanOptionalString(selectedItem.title) ?? exportArtifact.title ?? "Workflow export";

  return {
    artifactId: exportArtifact._id,
    byteLength: byteLengthFromRecord(selectedItem),
    fileName: cleanOptionalString(selectedItem.fileName) ?? title,
    label: title,
    libraryAssetId: source,
    mimeType,
    sourcePlatform: sourcePlatformForStoredMedia({ mimeType, storageUrl }),
    sourceType: "upload",
    sourceUrl: storageUrl,
    storageUrl,
  };
}

async function analysisSourceFromLibraryAsset(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  source: string
) {
  const parts = libraryAssetParts(source);
  if (parts.kind === "artifact" && parts.firstId) {
    return await analysisSourceFromArtifact(ctx, thread, parts.firstId, source);
  }
  if (parts.kind === "creative_asset" && parts.firstId) {
    return await analysisSourceFromCreativeAsset(ctx, thread, parts.firstId, source);
  }
  if (parts.kind === "workflow_export") {
    return await analysisSourceFromWorkflowExportAsset(ctx, thread, source);
  }

  const artifactId = ctx.db.normalizeId("artifacts", source);
  if (artifactId) return await analysisSourceFromArtifact(ctx, thread, String(artifactId), source);

  const creativeAssetId = ctx.db.normalizeId("creativeAssets", source);
  if (creativeAssetId) {
    return await analysisSourceFromCreativeAsset(ctx, thread, String(creativeAssetId), source);
  }

  throw new Error("Analyze Source could not resolve that library asset.");
}

async function resolveAnalysisSourceForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  sourceType: string | undefined,
  source: string
): Promise<AnalysisSourceForToolCall> {
  if (!source) throw new Error("Analyze Source needs a source to analyze.");

  if (sourceType === "url") {
    return {
      label: source,
      sourcePlatform: sourcePlatformForUrl(source),
      sourceType: "url",
      sourceUrl: source,
    };
  }

  if (sourceType === "artifact") {
    return await analysisSourceFromArtifact(ctx, thread, source);
  }

  if (sourceType === "library_asset") {
    return await analysisSourceFromLibraryAsset(ctx, thread, source);
  }

  if (sourceType === "file") {
    try {
      return {
        label: source,
        sourcePlatform: sourcePlatformForStoredMedia({ storageUrl: source }),
        sourceType: "upload",
        sourceUrl: source,
        storageUrl: source,
      };
    } catch {
      throw new Error("Analyze Source file inputs need a stored media URL.");
    }
  }

  throw new Error("Analyze Source sourceType must be url, file, artifact, or library_asset.");
}

async function createAnalysisJobForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const sourceType = typeof input.sourceType === "string" ? input.sourceType : undefined;
  const source = typeof input.source === "string" ? input.source.trim() : "";

  const analysisSource = await resolveAnalysisSourceForToolCall(ctx, thread, sourceType, source);

  const now = Date.now();
  const jobId = await ctx.db.insert("videoAnalysisJobs", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    sourceType: analysisSource.sourceType,
    sourcePlatform: analysisSource.sourcePlatform,
    sourceUrl: analysisSource.sourceUrl,
    storageUrl: analysisSource.storageUrl,
    fileName: analysisSource.fileName,
    mimeType: analysisSource.mimeType,
    byteLength: analysisSource.byteLength,
    provider: GEMINI_PROVIDER,
    model: DEFAULT_ANALYSIS_MODEL,
    mode: "inspiration",
    customPrompt: cleanOptionalText(
      typeof input.instructions === "string" ? input.instructions : undefined
    ),
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.analyze.videoAnalysis.executeJob, { jobId });

  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      analysisJobId: jobId,
      artifactId: analysisSource.artifactId,
      creativeAssetId: analysisSource.creativeAssetId,
      libraryAssetId: analysisSource.libraryAssetId,
      sourceType: sourceType ?? analysisSource.sourceType,
      sourceUrl: analysisSource.sourceUrl,
      storageUrl: analysisSource.storageUrl,
      status: "queued",
    },
    completedAt: now,
    updatedAt: now,
  });

  await appendAgentMessage(ctx, thread, {
    content: `Started source analysis for ${analysisSource.label}. I will use the analysis job as context before generating new assets.`,
    kind: "tool_result",
  });

  return jobId;
}

async function createGenerationRequestForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">,
  mode: MediaGenerationMode
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const brief = cleanOptionalStringFromRecord(input, "brief") ??
    cleanOptionalStringFromRecord(input, "prompt") ??
    cleanOptionalStringFromRecord(input, "text") ??
    "";
  if (!brief) throw new Error("Generation brief is required.");
  const effectiveBrief = briefWithAnalysisContext(
    brief,
    await analysisContextForThreadToolOutputs(ctx, thread, toolCall._id)
  );

  const workspace = thread.workspaceId ? await ctx.db.get(thread.workspaceId) : null;
  const provider = modelProviderFromInput(input.provider) ?? providerForMediaMode(workspace, mode);
  let model = cleanOptionalStringFromRecord(input, "model");
  const aspectRatio = cleanOptionalStringFromRecord(input, "aspectRatio");
  const durationSeconds = finitePositiveNumber(input.durationSeconds);
  const audioMode = cleanOptionalStringFromRecord(input, "mode");
  const count = mode === "image"
    ? Math.max(1, Math.min(4, Math.floor(finitePositiveNumber(input.count) ?? 1)))
    : undefined;
  const references = await resolveToolReferences(ctx, thread, input);
  await appendDiscoveredReferencesForThread(ctx, thread, toolCall._id, references);
  if (
    mode === "image" &&
    (isRevisionBrief(brief) || input.usePriorImageOutputs === true)
  ) {
    const previousImages = await readyArtifactsForThreadToolOutputs(
      ctx,
      thread,
      toolCall._id,
      "image"
    );
    references.imageReferences.push(
      ...previousImages.flatMap((artifact) => {
        const reference = referenceFromArtifact(artifact);
        return reference ? [reference] : [];
      })
    );
  }
  if (mode === "video") {
    const previousImages = selectedPriorArtifacts(
      await readyArtifactsForThreadToolOutputs(
        ctx,
        thread,
        toolCall._id,
        "image"
      ),
      input,
      "priorImageOutputIndex"
    );
    references.imageReferences.push(
      ...previousImages.flatMap((artifact) => {
        const reference = referenceFromArtifact(artifact);
        return reference ? [reference] : [];
      })
    );
    if (isRevisionBrief(brief)) {
      const previousVideos = await readyArtifactsForThreadToolOutputs(
        ctx,
        thread,
        toolCall._id,
        "video"
      );
      references.videoReferences.push(
        ...previousVideos.flatMap((artifact) => {
          const reference = referenceFromArtifact(artifact);
          return reference ? [reference] : [];
        })
      );
    }
  }
  if (mode === "audio" && isRevisionBrief(brief)) {
    const previousAudios = await readyArtifactsForThreadToolOutputs(
      ctx,
      thread,
      toolCall._id,
      "audio"
    );
    references.audioReferences.push(
      ...previousAudios.flatMap((artifact) => {
        const reference = referenceFromArtifact(artifact);
        return reference ? [reference] : [];
      })
    );
  }
  if (mode === "lipsync") {
    const previousImages = await readyArtifactsForThreadToolOutputs(
      ctx,
      thread,
      toolCall._id,
      "image"
    );
    references.imageReferences.push(
      ...previousImages.flatMap((artifact) => {
        const reference = referenceFromArtifact(artifact);
        return reference ? [reference] : [];
      })
    );
    const previousVideos = await readyArtifactsForThreadToolOutputs(
      ctx,
      thread,
      toolCall._id,
      "video"
    );
    references.videoReferences.push(
      ...previousVideos.flatMap((artifact) => {
        const reference = referenceFromArtifact(artifact);
        return reference ? [reference] : [];
      })
    );
    const previousAudios = await readyArtifactsForThreadToolOutputs(
      ctx,
      thread,
      toolCall._id,
      "audio"
    );
    references.audioReferences.push(
      ...previousAudios.flatMap((artifact) => {
        const reference = referenceFromArtifact(artifact);
        return reference ? [reference] : [];
      })
    );
  }
  const now = Date.now();
  const referenceCount =
    references.imageReferences.length +
    references.videoReferences.length +
    references.audioReferences.length;
  model = defaultCreateVideoModel({
    mode,
    model,
    provider,
    referenceImageCount: references.imageReferences.length,
  });
  const effectiveModel = effectiveQueuedModelForToolOutput({
    mode,
    model,
    provider,
    referenceCount,
  });
  const requestId = await ctx.db.insert("contentRequests", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    contentFormat: mode,
    prompt: brief,
    requestedRenderingMode: "background_plus_overlay",
    generation: {
      mode,
      provider,
      model,
      providerInput: mode === "audio"
        ? { text: effectiveBrief }
        : mode === "lipsync"
          ? { prompt: effectiveBrief }
        : { prompt: effectiveBrief },
      aspectRatio,
      count,
      durationSeconds: mode === "video" ? durationSeconds : undefined,
      resolution: mode === "lipsync" ? cleanOptionalStringFromRecord(input, "resolution") : undefined,
      audioMode: mode === "audio" ? audioMode : undefined,
      referenceImages:
        mode === "image" || mode === "video" || mode === "lipsync" ? references.imageReferences : [],
      referenceVideos: mode === "video" || mode === "lipsync" ? references.videoReferences : [],
      voiceReferenceAudios: mode === "audio" || mode === "lipsync" ? references.audioReferences : [],
    },
    referenceAssets: references.creativeAssetReferences,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.content.requests.execute, { requestId });

  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      contentRequestId: requestId,
      mode,
      provider,
      model,
      effectiveModel,
      aspectRatio,
      count,
      durationSeconds: mode === "video" ? durationSeconds : undefined,
      resolution: mode === "lipsync" ? cleanOptionalStringFromRecord(input, "resolution") : undefined,
      audioMode: mode === "audio" ? audioMode : undefined,
      status: "queued",
      usedAnalysisContext: effectiveBrief !== brief,
      referenceCount,
    },
    completedAt: now,
    updatedAt: now,
  });

  return requestId;
}

async function createSlideshowRequestForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const brief = typeof input.brief === "string" ? input.brief.trim() : "";
  if (!brief) throw new Error("Slideshow brief is required.");
  const effectiveBrief = briefWithAnalysisContext(
    brief,
    await analysisContextForThreadToolOutputs(ctx, thread, toolCall._id)
  );

  const workspace = thread.workspaceId ? await ctx.db.get(thread.workspaceId) : null;
  const provider = providerForMediaMode(workspace, "image");
  const references = await resolveToolReferences(ctx, thread, input);
  await appendDiscoveredReferencesForThread(ctx, thread, toolCall._id, references);
  const previousImages = await readyArtifactsForThreadToolOutputs(
    ctx,
    thread,
    toolCall._id,
    "image"
  );
  references.imageReferences.push(
    ...previousImages.flatMap((artifact) => {
      const reference = referenceFromArtifact(artifact);
      return reference ? [reference] : [];
    })
  );
  const now = Date.now();
  const requestId = await ctx.db.insert("contentRequests", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    contentFormat: "slideshow",
    prompt: effectiveBrief,
    requestedRenderingMode: "background_plus_overlay",
    generation: {
      mode: "slideshow",
      provider,
      providerInput: {},
      referenceImages: references.imageReferences,
    },
    referenceAssets: references.creativeAssetReferences,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.content.requests.execute, { requestId });

  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      contentRequestId: requestId,
      mode: "slideshow",
      provider,
      status: "queued",
      usedAnalysisContext: effectiveBrief !== brief,
      referenceCount: references.imageReferences.length + references.creativeAssetReferences.length,
    },
    completedAt: now,
    updatedAt: now,
  });

  return requestId;
}

async function saveReadyOutputsForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const result = await saveReadyOutputsForThread(ctx, thread, toolCall._id);

  if (!result.savedRequestIds.length) return false;

  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      savedRequestIds: result.savedRequestIds,
      savedAt: result.savedAt,
    },
    completedAt: result.savedAt,
    updatedAt: result.savedAt,
  });

  return true;
}

export async function saveReadyOutputsForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">,
  targetArtifactIds?: Id<"artifacts">[]
) {
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread, excludeToolCallId);
  const targetArtifactIdSet = targetArtifactIds?.length
    ? new Set(targetArtifactIds.map(String))
    : null;
  const readyRequests = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request) continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }
    if (request.status === "ready" || request.status === "saved") {
      if (!targetArtifactIdSet) {
        readyRequests.push(request);
        continue;
      }

      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
        .collect();
      if (artifacts.some((artifact) => targetArtifactIdSet.has(String(artifact._id)))) {
        readyRequests.push(request);
      }
    }
  }

  if (!readyRequests.length) {
    await appendAgentMessage(ctx, thread, {
      content: "There are no ready previews to save yet. Wait for the current generation or render request to finish, then continue.",
      kind: "status",
    });
    return { savedRequestIds: [], savedAt: Date.now() };
  }

  const now = Date.now();
  for (const request of readyRequests) {
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    for (const artifact of artifacts) {
      if (targetArtifactIdSet && !targetArtifactIdSet.has(String(artifact._id))) {
        continue;
      }
      if (thread.workspaceId ? artifact.workspaceId !== thread.workspaceId : artifact.userId !== thread.userId) {
        continue;
      }
      await ctx.db.patch(artifact._id, {
        lifecycle: "saved",
        reviewStatus: "approved",
        updatedAt: now,
      });
    }

    const slideshows = await ctx.db
      .query("slideshows")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    for (const slideshow of slideshows) {
      if (targetArtifactIdSet) continue;
      if (thread.workspaceId ? slideshow.workspaceId !== thread.workspaceId : slideshow.userId !== thread.userId) {
        continue;
      }
      await ctx.db.patch(slideshow._id, {
        status: "saved",
        savedAt: now,
        updatedAt: now,
      });
    }

    if (!targetArtifactIdSet) {
      await ctx.db.patch(request._id, {
        status: "saved",
        savedAt: now,
        updatedAt: now,
      });
    }
  }

  await appendAgentMessage(ctx, thread, {
    content: `Saved ${readyRequests.length} ready preview${readyRequests.length === 1 ? "" : "s"} to the library.`,
    kind: "tool_result",
  });

  return {
    savedRequestIds: readyRequests.map((request) => request._id),
    savedAt: now,
  };
}

async function contentRequestIdsForThreadToolOutputs(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">
) {
  const threadToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  return [
    ...new Set(
      threadToolCalls.flatMap((candidate) => {
        if (excludeToolCallId && candidate._id === excludeToolCallId) return [];
        const requestId = contentRequestIdFromToolOutput(candidate.output);
        return requestId ? [requestId] : [];
      })
    ),
  ];
}

async function hasPendingContentRequestsForThreadToolOutputs(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">
) {
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread, excludeToolCallId);

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request) continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }
    if (
      request.status === "queued" ||
      request.status === "planning" ||
      request.status === "generating"
    ) {
      return true;
    }
  }

  return false;
}

async function asyncFailureMessageForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const requestId = contentRequestIdFromToolOutput(toolCall.output);
  if (requestId) {
    const request = await ctx.db.get(requestId);
    if (
      request &&
      (thread.workspaceId ? request.workspaceId === thread.workspaceId : request.userId === thread.userId) &&
      (request.status === "failed" || request.status === "discarded")
    ) {
      if (request.status === "discarded" && request.errorMessage === "Stopped by user.") {
        return null;
      }
      return request.errorMessage ?? "The queued generation request failed.";
    }
  }

  const jobId = analysisJobIdFromToolOutput(toolCall.output);
  if (jobId) {
    const job = await ctx.db.get(jobId);
    if (
      job &&
      (thread.workspaceId ? job.workspaceId === thread.workspaceId : job.userId === thread.userId) &&
      job.status === "failed"
    ) {
      return job.errorMessage ?? "The queued source analysis failed.";
    }
  }

  const renderRequestId = studioRenderRequestIdFromToolOutput(toolCall.output);
  if (renderRequestId) {
    const request = await ctx.db.get(renderRequestId);
    if (
      request &&
      (thread.workspaceId ? request.workspaceId === thread.workspaceId : request.userId === thread.userId) &&
      (request.status === "failed" || request.status === "canceled")
    ) {
      return request.errorMessage ?? "The Studio render request failed.";
    }
  }

  return null;
}

async function reconcileAsyncToolFailures(ctx: MutationCtx, thread: Doc<"createThreads">) {
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const now = Date.now();

  for (const toolCall of toolCalls) {
    if (toolCall.status !== "succeeded" && toolCall.status !== "blocked") continue;
    const errorMessage = await asyncFailureMessageForToolCall(ctx, thread, toolCall);
    if (!errorMessage) continue;

    await ctx.db.patch(toolCall._id, {
      status: "failed",
      errorMessage,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: `${toolCall.label} failed after it was queued: ${errorMessage}`,
      kind: "status",
    });
    await ctx.db.patch(thread._id, {
      status: "failed",
      errorMessage,
      updatedAt: now,
    });

    return { failedToolCallId: toolCall._id, errorMessage };
  }

  return null;
}

async function readyArtifactIdsForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  targetArtifactIds?: Id<"artifacts">[]
) {
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread);
  const targetArtifactIdSet = targetArtifactIds?.length
    ? new Set(targetArtifactIds.map(String))
    : null;
  const artifactIds: Id<"artifacts">[] = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request || (request.status !== "ready" && request.status !== "saved")) continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    artifactIds.push(
      ...artifacts.flatMap((artifact) =>
        artifact.storageUrl &&
        (!targetArtifactIdSet || targetArtifactIdSet.has(String(artifact._id))) &&
        (thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
          ? [artifact._id]
          : []
      )
    );
  }

  return [...new Set(artifactIds)];
}

async function reviewedCheckpointArtifactIdSet(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const checkpoints = await ctx.db
    .query("createCheckpoints")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  return new Set(
    checkpoints.flatMap((checkpoint) => checkpoint.artifactIds ?? []).map(String)
  );
}

async function hasOpenCheckpoint(ctx: MutationCtx, thread: Doc<"createThreads">) {
  const checkpoints = await ctx.db
    .query("createCheckpoints")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  return checkpoints.some((checkpoint) => checkpoint.status === "open");
}

async function readyUnreviewedArtifactIdsForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const reviewedArtifactIds = await reviewedCheckpointArtifactIdSet(ctx, thread);
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread);
  const artifactIds: Id<"artifacts">[] = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request || (request.status !== "ready" && request.status !== "saved")) continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    artifactIds.push(
      ...artifacts.flatMap((artifact) =>
        artifact.storageUrl &&
        !reviewedArtifactIds.has(String(artifact._id)) &&
        (thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
          ? [artifact._id]
          : []
      )
    );
  }

  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  for (const toolCall of toolCalls) {
    for (const artifactId of toolCall.artifactIds ?? []) {
      if (reviewedArtifactIds.has(String(artifactId))) continue;
      const artifact = await ctx.db.get(artifactId);
      if (
        artifact &&
        (thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
      ) {
        artifactIds.push(artifact._id);
      }
    }
  }

  return [...new Set(artifactIds)];
}

async function createDebugReadyOutputCheckpointIfNeeded(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  if (thread.checkpointMode !== "debug") return false;
  if (await hasOpenCheckpoint(ctx, thread)) return true;

  const artifactIds = await readyUnreviewedArtifactIdsForThread(ctx, thread);
  if (!artifactIds.length) return false;

  const now = Date.now();
  await ctx.db.insert("createCheckpoints", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    createThreadId: thread._id,
    status: "open",
    label: artifactIds.length === 1 ? "Review generated output" : "Review generated outputs",
    message:
      "Debug Mode is pausing here so you can approve these generated assets before the agent uses them in the next step.",
    artifactIds,
    createdAt: now,
    updatedAt: now,
  });
  await appendAgentMessage(ctx, thread, {
    content: "Paused for Debug Mode review. Approve the generated assets to continue, or ask for a revision.",
    kind: "status",
  });
  await ctx.db.patch(thread._id, {
    status: "waiting_for_user",
    updatedAt: now,
  });

  return true;
}

export async function prepareDistributionDraftForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  targetArtifactIds?: Id<"artifacts">[],
  options: { recordToolCall?: boolean } = {}
) {
  const artifactIds = await readyArtifactIdsForThread(ctx, thread, targetArtifactIds);
  if (!artifactIds.length) {
    await appendAgentMessage(ctx, thread, {
      content: "There are no ready media artifacts to prepare for publishing yet.",
      kind: "status",
    });
    return { distributionPlanId: null, artifactCount: 0 };
  }

  const now = Date.now();
  const distributionPlanId = await ctx.db.insert("distributionPlans", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    artifactIds,
    socialAccountIds: [],
    provider: "manual",
    status: "draft",
    caption: "Prepared from Create Agent. Add accounts, caption, and schedule before publishing.",
    providerPayload: {
      source: "create_agent",
      createThreadId: thread._id,
      note: "Manual draft distribution plan created from Create Agent final review.",
    },
    createdAt: now,
    updatedAt: now,
  });

  if (options.recordToolCall ?? true) {
    await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      toolName: "publishing.prepare",
      status: "succeeded",
      label: "Prepared publishing draft",
      input: {
        artifactIds,
        provider: "manual",
      },
      output: {
        distributionPlanId,
        artifactIds,
        status: "draft",
      },
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await appendAgentMessage(ctx, thread, {
    content: `Prepared a draft distribution plan with ${artifactIds.length} media artifact${artifactIds.length === 1 ? "" : "s"}. Add accounts and scheduling before publishing.`,
    kind: "tool_result",
  });

  return { distributionPlanId, artifactCount: artifactIds.length };
}

export async function prepareArtifactExportForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  targetArtifactIds?: Id<"artifacts">[],
  options: { recordToolCall?: boolean } = {}
) {
  const artifactIds = await readyArtifactIdsForThread(ctx, thread, targetArtifactIds);
  if (!artifactIds.length) {
    await appendAgentMessage(ctx, thread, {
      content: "There are no ready media artifacts to export yet.",
      kind: "status",
    });
    return { artifactIds: [], exportUrls: [], exportedAt: Date.now() };
  }

  const exportUrls = [];
  for (const artifactId of artifactIds) {
    const artifact = await ctx.db.get(artifactId);
    if (!artifact?.storageUrl) continue;
    if (thread.workspaceId ? artifact.workspaceId !== thread.workspaceId : artifact.userId !== thread.userId) {
      continue;
    }
    exportUrls.push({
      artifactId,
      title: artifact.title ?? "Exported artifact",
      storageUrl: artifact.storageUrl,
      mediaKind: artifactMediaKind(artifact),
      mimeType: artifactMimeType(artifact),
    });
  }

  if (!exportUrls.length) {
    await appendAgentMessage(ctx, thread, {
      content: "The selected artifacts are not exportable yet.",
      kind: "status",
    });
    return { artifactIds: [], exportUrls: [], exportedAt: Date.now() };
  }

  const now = Date.now();
  if (options.recordToolCall ?? true) {
    await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      toolName: "artifact.export",
      status: "succeeded",
      label: "Exported output",
      input: {
        artifactIds,
        destination: "download",
      },
      output: {
        artifactIds,
        exportUrls,
        destination: "download",
      },
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await appendAgentMessage(ctx, thread, {
    content: `Prepared ${exportUrls.length} exportable artifact${exportUrls.length === 1 ? "" : "s"} for download.`,
    kind: "tool_result",
  });

  return { artifactIds, exportUrls, exportedAt: now };
}

async function createWorkflowDraftForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const name = typeof input.name === "string" ? input.name.trim() : undefined;
  const result = await createWorkflowDraftFromThread(ctx, thread, { name });
  const now = Date.now();

  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      workflowId: result.workflowId,
      convertedToolCount: result.convertedToolCount,
      unsupportedToolNames: result.unsupportedToolNames,
    },
    completedAt: now,
    updatedAt: now,
  });

  await appendAgentMessage(ctx, thread, {
    content: result.unsupportedToolNames.length
      ? `Saved this conversation as a workflow draft. Some Studio steps were preserved as comments because they are not repeatable workflow nodes yet: ${result.unsupportedToolNames.join(", ")}.`
      : "Saved this conversation as a workflow draft.",
    kind: "tool_result",
  });

  return result;
}

async function readyArtifactsForThreadToolOutputs(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId: Id<"createToolCalls"> | undefined,
  mediaKind: "image" | "video" | "audio"
) {
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread, excludeToolCallId);
  const artifacts: Doc<"artifacts">[] = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "ready") continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }
    const requestArtifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    artifacts.push(
      ...requestArtifacts.filter((artifact) =>
        artifact.storageUrl &&
        artifactMediaKind(artifact) === mediaKind &&
        (thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
      )
    );
  }

  return artifacts;
}

async function createStudioProjectForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread, toolCall._id);
  const videoArtifacts: Doc<"artifacts">[] = [];
  const imageArtifacts: Doc<"artifacts">[] = [];
  const audioArtifacts: Doc<"artifacts">[] = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "ready") continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    for (const artifact of artifacts) {
      if (
        !artifact.storageUrl ||
        !(thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
      ) {
        continue;
      }
      const mediaKind = artifactMediaKind(artifact);
      if (mediaKind === "image") imageArtifacts.push(artifact);
      if (mediaKind === "video") videoArtifacts.push(artifact);
      if (mediaKind === "audio") audioArtifacts.push(artifact);
    }
  }

  if (!videoArtifacts.length && !imageArtifacts.length) {
    await appendAgentMessage(ctx, thread, {
      content: "There are no ready visual assets to open in Studio yet. Wait for image or video generation to finish, then continue.",
      kind: "status",
    });
    return false;
  }

  const now = Date.now();
  const draft = buildCreateAgentStudioDraft({
    audioArtifacts,
    aspectRatio: input.aspectRatio,
    imageArtifacts,
    input,
    videoArtifacts,
  });
  const projectId = await ctx.db.insert("videoProjects", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    title: "Create Agent composition",
    status: "draft",
    draft,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  });

  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      projectId,
      audioArtifactIds: audioArtifacts.map((artifact) => artifact._id),
      imageArtifactIds: imageArtifacts.map((artifact) => artifact._id),
      clipArtifactIds: videoArtifacts.map((artifact) => artifact._id),
      audioTrackCount: draft.audioTracks.length,
      imageClipCount: imageArtifacts.length,
      textOverlayCount: draft.textOverlays.length,
      status: "ready",
    },
    completedAt: now,
    updatedAt: now,
  });

  await appendAgentMessage(ctx, thread, {
    content: `Created a Studio project with ${videoArtifacts.length} video clip${videoArtifacts.length === 1 ? "" : "s"}${imageArtifacts.length ? `, ${imageArtifacts.length} image clip${imageArtifacts.length === 1 ? "" : "s"}` : ""}${audioArtifacts.length ? `, and ${audioArtifacts.length} audio track${audioArtifacts.length === 1 ? "" : "s"}` : ""}.`,
    kind: "tool_result",
  });

  return true;
}

async function latestVideoProjectForThreadToolOutputs(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">
) {
  const threadToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  const projectIds = threadToolCalls.flatMap((candidate) => {
    if (excludeToolCallId && candidate._id === excludeToolCallId) return [];
    const projectId = videoProjectIdFromToolOutput(candidate.output);
    return projectId ? [projectId] : [];
  });

  for (const projectId of projectIds.reverse()) {
    const project = await ctx.db.get(projectId);
    if (!project || project.status === "archived") continue;
    if (thread.workspaceId ? project.workspaceId !== thread.workspaceId : project.userId !== thread.userId) {
      continue;
    }
    return project;
  }

  return null;
}

async function createStudioRenderRequestForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const inputProjectId = typeof input.projectId === "string"
    ? input.projectId as Id<"videoProjects">
    : undefined;
  const project = inputProjectId
    ? await ctx.db.get(inputProjectId)
    : await latestVideoProjectForThreadToolOutputs(ctx, thread, toolCall._id);

  if (!project || project.status === "archived") {
    await appendAgentMessage(ctx, thread, {
      content: "There is no Studio project ready to render yet. Create or open a Studio composition first.",
      kind: "status",
    });
    return false;
  }
  if (thread.workspaceId ? project.workspaceId !== thread.workspaceId : project.userId !== thread.userId) {
    throw new Error("Studio project does not belong to this Create thread.");
  }

  const result = await createStudioRenderRequest(ctx, {
    createThreadId: thread._id,
    createToolCallId: toolCall._id,
    project,
    renderSettings: input.renderSettings,
  });
  const now = Date.now();

  await ctx.db.patch(toolCall._id, {
    status: result.status === "queued" ? "running" : "blocked",
    output: {
      studioRenderRequestId: result.requestId,
      projectId: project._id,
      status: result.status,
      errorMessage: result.errorMessage,
    },
    errorMessage: result.errorMessage,
    updatedAt: now,
  });

  await appendAgentMessage(ctx, thread, {
    content: result.status === "queued"
      ? "Studio render is queued on the server render worker. I will attach the final video here when it finishes."
      : STUDIO_RENDER_NOT_CONFIGURED_MESSAGE,
    kind: "status",
  });
  await ctx.db.patch(thread._id, {
    status: result.status === "queued" ? "running" : "waiting_for_user",
    updatedAt: now,
  });

  return true;
}

async function waitForPendingAnalysisIfNeeded(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const hasPendingAnalysis = await hasPendingAnalysisContextForThreadToolOutputs(
    ctx,
    thread,
    toolCall._id
  );
  if (!hasPendingAnalysis) return false;

  await appendAgentMessage(ctx, thread, {
    content:
      "Waiting for source analysis to finish before generating new assets, so the recreation can use what was actually found in the source.",
    kind: "status",
  });
  return true;
}

async function waitForPendingContentRequestsIfNeeded(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const hasPendingContent = await hasPendingContentRequestsForThreadToolOutputs(
    ctx,
    thread,
    toolCall._id
  );
  if (!hasPendingContent) return false;

  await appendAgentMessage(ctx, thread, {
    content:
      "Waiting for the current preview to finish before using it in the next creation step.",
    kind: "status",
  });
  return true;
}

export async function executeRunnableQueuedTools(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const asyncFailure = await reconcileAsyncToolFailures(ctx, thread);
  if (asyncFailure) {
    return {
      executedCount: 0,
      queuedCount: 0,
      failedToolCallId: asyncFailure.failedToolCallId,
      errorMessage: asyncFailure.errorMessage,
    };
  }

  const queuedToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "queued")
    )
    .order("asc")
    .collect();

  if (queuedToolCalls.length && await createDebugReadyOutputCheckpointIfNeeded(ctx, thread)) {
    return { executedCount: 0, queuedCount: queuedToolCalls.length, checkpointCreated: true };
  }

  let executedCount = 0;
  let pausedForPendingAnalysis = false;
  let pausedForPendingContent = false;
  for (const toolCall of queuedToolCalls) {
    try {
      const mediaMode = mediaModeForToolName(toolCall.toolName);
      if (toolCall.toolName === "analyze.source") {
        await createAnalysisJobForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        break;
      }
      if (toolCall.toolName === "references.list") {
        const references = await listReferencesForToolCall(ctx, thread, toolCall);
        await appendAgentMessage(ctx, thread, {
          content: references.length
            ? `Found ${references.length} reusable reference${references.length === 1 ? "" : "s"} in the library for this thread.`
            : "I did not find matching reusable references in the library.",
          kind: "tool_result",
        });
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "text.generate") {
        const started = await createTextGenerationForToolCall(ctx, thread, toolCall);
        if (started) executedCount += 1;
        break;
      }
      if (toolCall.toolName === "media.renderVideo") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        if (await waitForPendingAnalysisIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingAnalysis = true;
          break;
        }
        const started = await createVideoRenderForToolCall(ctx, thread, toolCall);
        if (started) executedCount += 1;
        break;
      }
      if (toolCall.toolName === "slideshow.render") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        if (await waitForPendingAnalysisIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingAnalysis = true;
          break;
        }
        await createSlideshowRequestForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        break;
      }
      if (toolCall.toolName === "artifact.save") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        const saved = await saveReadyOutputsForToolCall(ctx, thread, toolCall);
        if (saved) executedCount += 1;
        break;
      }
      if (toolCall.toolName === "artifact.export") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        const result = await prepareArtifactExportForThread(ctx, thread, undefined, {
          recordToolCall: false,
        });
        if (result.exportUrls.length) {
          const now = Date.now();
          await ctx.db.patch(toolCall._id, {
            status: "succeeded",
            output: {
              artifactIds: result.artifactIds,
              exportUrls: result.exportUrls,
              destination: "download",
            },
            completedAt: now,
            updatedAt: now,
          });
          executedCount += 1;
        }
        break;
      }
      if (toolCall.toolName === "publishing.prepare") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        const result = await prepareDistributionDraftForThread(ctx, thread, undefined, {
          recordToolCall: false,
        });
        if (result.distributionPlanId) {
          const now = Date.now();
          await ctx.db.patch(toolCall._id, {
            status: "succeeded",
            output: {
              distributionPlanId: result.distributionPlanId,
              artifactCount: result.artifactCount,
              status: "draft",
            },
            completedAt: now,
            updatedAt: now,
          });
          executedCount += 1;
        }
        break;
      }
      if (toolCall.toolName === "workflow.createDraft") {
        await createWorkflowDraftForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        break;
      }
      if (toolCall.toolName === "studio.compose") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        const composed = await createStudioProjectForToolCall(ctx, thread, toolCall);
        if (composed) executedCount += 1;
        break;
      }
      if (toolCall.toolName === "studio.render") {
        const requested = await createStudioRenderRequestForToolCall(ctx, thread, toolCall);
        if (requested) executedCount += 1;
        break;
      }
      if (!mediaMode) break;
      if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
        pausedForPendingContent = true;
        break;
      }
      if (await waitForPendingAnalysisIfNeeded(ctx, thread, toolCall)) {
        pausedForPendingAnalysis = true;
        break;
      }
      await createGenerationRequestForToolCall(ctx, thread, toolCall, mediaMode);
      executedCount += 1;
      break;
    } catch (error) {
      const now = Date.now();
      const errorMessage = errorMessageFromUnknown(error);
      await ctx.db.patch(toolCall._id, {
        status: "failed",
        errorMessage,
        completedAt: now,
        updatedAt: now,
      });
      await appendAgentMessage(ctx, thread, {
        content: `${toolCall.label} failed: ${errorMessage}`,
        kind: "status",
      });
      await ctx.db.patch(thread._id, {
        status: "failed",
        errorMessage,
        updatedAt: now,
      });
      return {
        executedCount,
        queuedCount: queuedToolCalls.length,
        failedToolCallId: toolCall._id,
        errorMessage,
      };
    }
  }

  const now = Date.now();
  if (
    executedCount === 0 &&
    queuedToolCalls.length &&
    !pausedForPendingAnalysis &&
    !pausedForPendingContent
  ) {
    await appendAgentMessage(ctx, thread, {
      content:
        "The next planned tool is queued, but its executable wrapper is not connected yet. I will keep the plan visible here while we wire the remaining creation tools.",
      kind: "status",
    });
  }

  const remainingQueuedToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "queued")
    )
    .collect();
  const blockedToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "blocked")
    )
    .collect();
  await ctx.db.patch(thread._id, {
    status: blockedToolCalls.length
      ? "waiting_for_user"
      : remainingQueuedToolCalls.length
        ? "planning"
        : "idle",
    updatedAt: now,
  });

  return { executedCount, queuedCount: remainingQueuedToolCalls.length };
}
