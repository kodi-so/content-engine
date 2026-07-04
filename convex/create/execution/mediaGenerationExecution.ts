import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { ModelProviderName } from "../../providers/model";
import { explicitSlideshowRenderingMode } from "../planning";
import { referenceFromArtifact, resolveToolReferences } from "../references/referenceResolution";
import {
  analysisContextForThreadToolOutputs,
  briefWithAnalysisContext,
} from "../references/sourceAnalysisContext";
import {
  cleanOptionalStringFromRecord,
  finitePositiveNumber,
  modelProviderFromInput,
  selectedPriorArtifacts,
} from "./toolExecutionShared";
import { appendDiscoveredReferencesForThread } from "./toolReferenceCollection";
import { readyArtifactsForThreadToolOutputs } from "./threadToolOutputs";
import {
  defaultDurationForFalVideoModel,
  normalizeFalVideoDurationForModel,
} from "../../../src/lib/generation/videoDurationConstraints";

export type MediaGenerationMode = "image" | "video" | "audio" | "lipsync";

const DEFAULT_CREATE_FAL_IMAGE_MODEL = "fal-ai/gemini-3.1-flash-image-preview";

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

export function mediaModeForToolName(toolName: string): MediaGenerationMode | null {
  if (toolName === "media.generateImage") return "image";
  if (toolName === "media.generateVideo") return "video";
  if (toolName === "media.generateAudio") return "audio";
  if (toolName === "media.lipsync") return "lipsync";
  return null;
}

function isRevisionBrief(brief: string) {
  return /\b(revise|revision|change|update|modify|improve|redo|edit)\b/i.test(brief);
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

function normalizedCreateDurationSeconds(args: {
  durationSeconds?: number;
  mode: MediaGenerationMode;
  model?: string;
  provider: ModelProviderName;
}) {
  if (args.mode !== "video" || !args.durationSeconds) return undefined;
  if (args.provider === "fal" && args.model) {
    const normalized = normalizeFalVideoDurationForModel(args.model, args.durationSeconds);
    if (typeof normalized === "number") return normalized;
    if (typeof normalized === "string") {
      const parsed = Number(normalized);
      return Number.isFinite(parsed)
        ? parsed
        : defaultDurationForFalVideoModel(args.model);
    }
    return Math.round(args.durationSeconds);
  }
  return args.durationSeconds;
}

export async function createGenerationRequestForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">,
  mode: MediaGenerationMode
) {
  const input = typeof toolCall.input === "object" && toolCall.input && !Array.isArray(toolCall.input)
    ? toolCall.input as Record<string, unknown>
    : {};
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
  const requestedDurationSeconds = finitePositiveNumber(input.durationSeconds);
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
  const durationSeconds = normalizedCreateDurationSeconds({
    durationSeconds: requestedDurationSeconds,
    mode,
    model,
    provider,
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

export async function createSlideshowRequestForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = typeof toolCall.input === "object" && toolCall.input && !Array.isArray(toolCall.input)
    ? toolCall.input as Record<string, unknown>
    : {};
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
  const requestedRenderingMode =
    explicitSlideshowRenderingMode(input.requestedRenderingMode) ??
    explicitSlideshowRenderingMode(input.renderingMode) ??
    explicitSlideshowRenderingMode(input.slideshowStyle) ??
    "background_plus_overlay";
  const providerInput = typeof input.providerInput === "object" && input.providerInput && !Array.isArray(input.providerInput)
    ? input.providerInput as Record<string, unknown>
    : {};
  const now = Date.now();
  const requestId = await ctx.db.insert("contentRequests", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    contentFormat: "slideshow",
    prompt: effectiveBrief,
    requestedRenderingMode,
    generation: {
      mode: "slideshow",
      provider,
      providerInput: {
        ...providerInput,
        debugPauseAfterPlanning: thread.checkpointMode === "debug",
        createThreadId: thread._id,
        createToolCallId: toolCall._id,
      },
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
      requestedRenderingMode,
      status: "queued",
      usedAnalysisContext: effectiveBrief !== brief,
      referenceCount: references.imageReferences.length + references.creativeAssetReferences.length,
    },
    completedAt: now,
    updatedAt: now,
  });

  return requestId;
}
