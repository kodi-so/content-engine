import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { storeGeneratedAsset } from "../assets/assetStorage";
import {
  IMAGE_PROMPT_WRITER_SYSTEM_PROMPT,
  buildSingleImagePromptWriterPrompt,
  normalizePlan,
  type RequestedRenderingMode,
} from "../planning";
import {
  type ImagePromptWriterOutput,
  type SingleImagePromptWriterOutput,
  type SlideshowPlannerOutput,
  type SlideshowPlan,
} from "../types";
import { getSlideDimensions } from "../slideshow/slideshowDimensions";
import { buildCanonicalSlideshowSpec } from "../slideshow/slideshowAdapter";
import { getModelProvider } from "../../providers/index";
import type {
  GenerateImageResult,
  GenerateStructuredInput,
  GenerateStructuredResult,
  ModelProvider,
  ModelProviderName,
} from "../../providers/model";
import { isProviderError } from "../../providers/errors";
import { waitForGeneratedImage } from "../../workflows/runtime/generationWaiters";
import {
  createRequestArtifact,
  imageModelForProviderRenderingMode,
  planPromptForMode,
  planSchemaForMode,
  plannerReferenceFromAsset,
  promptForSlide,
  providerImagePrompt,
  referenceAssetIdsForSlide,
  referenceImagesFromAssets,
  singleImagePromptSchemaForMode,
  sumCost,
} from "./requestExecutionHelpers";
import {
  runCreateAudioRequest,
  runCreateImageRequest,
  runCreateLipsyncRequest,
  runCreateVideoRequest,
  type CreateReferenceAsset,
} from "../createAssetRunner";

type CreateGenerationMode = "image" | "video" | "audio" | "lipsync" | "slideshow";

export type CreateGenerationPayload = {
  mode: CreateGenerationMode;
  provider?: ModelProviderName;
  model?: string;
  generationOperation?: string;
  providerInput?: Record<string, unknown>;
  aspectRatio?: string;
  count?: number;
  durationSeconds?: number;
  resolution?: string;
  audioMode?: string;
  referenceImages?: CreateReferenceAsset[];
  referenceVideos?: CreateReferenceAsset[];
  voiceReferenceAudios?: CreateReferenceAsset[];
};

type SlideshowDebugPromptReviewItem = {
  slideIndex: number;
  prompt: string;
  textBlocks: string[];
};

export function requestErrorMessage(error: unknown) {
  if (!isProviderError(error)) {
    return error instanceof Error ? error.message : "Content generation failed";
  }

  const parts = [error.message];
  if (error.statusCode !== undefined) parts.push(`status ${error.statusCode}`);
  if (error.code) parts.push(error.code);

  const details = typeof error.details === "string"
    ? error.details
    : error.details === undefined
      ? ""
      : JSON.stringify(error.details);
  const trimmedDetails = details.trim();
  if (trimmedDetails) {
    parts.push(trimmedDetails.length > 700 ? `${trimmedDetails.slice(0, 700)}...` : trimmedDetails);
  }

  return parts.join(" · ");
}

type StructuredTextProviderName = Extract<ModelProviderName, "openrouter" | "bulkapis" | "gemini">;

const structuredTextProviderDefaults: Record<StructuredTextProviderName, string | undefined> = {
  openrouter: process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() || "openai/gpt-4.1",
  bulkapis: process.env.CONTENT_ENGINE_BULKAPIS_TEXT_MODEL?.trim() || undefined,
  gemini: process.env.CONTENT_ENGINE_GEMINI_TEXT_MODEL?.trim() || undefined,
};

function structuredTextProviderCandidates(): StructuredTextProviderName[] {
  const configured = process.env.CONTENT_ENGINE_TEXT_PROVIDER?.trim() as StructuredTextProviderName | undefined;
  const ordered: StructuredTextProviderName[] = configured &&
    ["openrouter", "bulkapis", "gemini"].includes(configured)
    ? [configured, "openrouter", "bulkapis", "gemini"]
    : ["openrouter", "bulkapis", "gemini"];

  return [...new Set(ordered)];
}

async function generateStructuredWithFallback<T>(
  input: GenerateStructuredInput<T>
): Promise<GenerateStructuredResult<T>> {
  const failures: string[] = [];

  for (const providerName of structuredTextProviderCandidates()) {
    const provider = getModelProvider(providerName);
    try {
      return await provider.generateStructured<T>({
        ...input,
        model: providerName === "openrouter"
          ? input.model ?? structuredTextProviderDefaults[providerName]
          : structuredTextProviderDefaults[providerName],
      });
    } catch (error) {
      failures.push(`${provider.displayName}: ${requestErrorMessage(error)}`);
    }
  }

  throw new Error(`Slideshow planning failed for every text provider: ${failures.join(" | ")}`);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function slideshowDebugContext(generation: CreateGenerationPayload | null) {
  const providerInput = recordValue(generation?.providerInput);
  if (providerInput?.debugPauseAfterPlanning !== true) return null;
  const createThreadId = typeof providerInput.createThreadId === "string"
    ? providerInput.createThreadId as Id<"createThreads">
    : undefined;
  const createToolCallId = typeof providerInput.createToolCallId === "string"
    ? providerInput.createToolCallId as Id<"createToolCalls">
    : undefined;
  if (!createThreadId) return null;
  return { createThreadId, createToolCallId };
}

function previewTextBlocksForSlide(slide: SlideshowPlan["slides"][number]) {
  if (slide.renderingMode === "full_graphic_generation") {
    const text = slide.visibleText.trim();
    return text ? [text] : [];
  }

  return slide.textBlocks.flatMap((block) => {
    const lines = [
      block.text.trim(),
      ...block.items.map((item) => `- ${item.trim()}`),
    ].filter(Boolean);
    return lines.length ? [lines.join("\n")] : [];
  });
}

function promptReviewItemsForPlan(plan: SlideshowPlan): SlideshowDebugPromptReviewItem[] {
  return plan.slides.map((slide) => ({
    slideIndex: slide.index,
    prompt: promptForSlide(slide),
    textBlocks: previewTextBlocksForSlide(slide),
  }));
}

export function generationPayload(value: unknown): CreateGenerationPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Partial<CreateGenerationPayload>;
  if (
    payload.mode !== "image" &&
    payload.mode !== "video" &&
    payload.mode !== "audio" &&
    payload.mode !== "lipsync" &&
    payload.mode !== "slideshow"
  ) {
    return null;
  }
  return {
    ...payload,
    mode: payload.mode,
  };
}

async function runNonSlideshowRequest(
  ctx: ActionCtx,
  args: {
    generation: CreateGenerationPayload;
    request: Doc<"contentRequests">;
    requestId: Id<"contentRequests">;
  }
) {
  await ctx.runMutation(internal.content.requests.transition, {
    requestId: args.requestId,
    status: "generating",
  });

  if (args.generation.mode === "image") {
    const result = await runCreateImageRequest(ctx, {
      userId: args.request.userId,
      workspaceId: args.request.workspaceId,
      contentRequestId: args.request._id,
      prompt: args.request.prompt,
      provider: args.generation.provider,
      model: args.generation.model,
      aspectRatio: args.generation.aspectRatio,
      count: args.generation.count,
      providerInput: args.generation.providerInput,
      referenceImages: args.generation.referenceImages,
    });
    await ctx.runMutation(internal.content.requests.transition, {
      requestId: args.requestId,
      status: "ready",
      summary: `${result.assets.length} image${result.assets.length === 1 ? "" : "s"} ready to review.`,
      costUsd: result.costUsd,
      completedAt: Date.now(),
    });
    return true;
  }

  if (args.generation.mode === "video") {
    const result = await runCreateVideoRequest(ctx, {
      userId: args.request.userId,
      workspaceId: args.request.workspaceId,
      contentRequestId: args.request._id,
      prompt: args.request.prompt,
      provider: args.generation.provider,
      model: args.generation.model,
      aspectRatio: args.generation.aspectRatio,
      durationSeconds: args.generation.durationSeconds,
      providerInput: args.generation.providerInput,
      referenceImages: args.generation.referenceImages,
      referenceVideos: args.generation.referenceVideos,
    });
    await ctx.runMutation(internal.content.requests.transition, {
      requestId: args.requestId,
      status: "ready",
      summary: "Video ready to review.",
      costUsd: result.costUsd,
      completedAt: Date.now(),
    });
    return true;
  }

  if (args.generation.mode === "audio") {
    const result = await runCreateAudioRequest(ctx, {
      userId: args.request.userId,
      workspaceId: args.request.workspaceId,
      contentRequestId: args.request._id,
      text: args.request.prompt,
      provider: args.generation.provider,
      model: args.generation.model,
      mode: args.generation.audioMode,
      providerInput: args.generation.providerInput,
      voiceReferenceAudios: args.generation.voiceReferenceAudios,
    });
    await ctx.runMutation(internal.content.requests.transition, {
      requestId: args.requestId,
      status: "ready",
      summary: "Audio ready to review.",
      costUsd: result.costUsd,
      completedAt: Date.now(),
    });
    return true;
  }

  if (args.generation.mode === "lipsync") {
    const result = await runCreateLipsyncRequest(ctx, {
      userId: args.request.userId,
      workspaceId: args.request.workspaceId,
      contentRequestId: args.request._id,
      prompt: args.request.prompt,
      provider: args.generation.provider,
      model: args.generation.model,
      resolution: args.generation.resolution,
      providerInput: args.generation.providerInput,
      referenceImages: args.generation.referenceImages,
      referenceVideos: args.generation.referenceVideos,
      voiceReferenceAudios: args.generation.voiceReferenceAudios,
    });
    await ctx.runMutation(internal.content.requests.transition, {
      requestId: args.requestId,
      status: "ready",
      summary: "Lip-synced video ready to review.",
      costUsd: result.costUsd,
      completedAt: Date.now(),
    });
    return true;
  }

  return false;
}

export async function executeContentRequest(
  ctx: ActionCtx,
  args: { requestId: Id<"contentRequests"> }
) {
  const context = await ctx.runQuery(internal.content.requests.getExecutionContext, {
    requestId: args.requestId,
  });
  if (!context) throw new Error("Content request not found");

  let costUsd = context.request.contentFormat === "slideshow" &&
    context.request.plan &&
    typeof context.request.costUsd === "number"
    ? context.request.costUsd
    : 0;
  try {
    const generation = generationPayload(
      (context.request as Doc<"contentRequests"> & { generation?: unknown }).generation
    );
    if (generation && generation.mode !== "slideshow") {
      const handled = await runNonSlideshowRequest(ctx, {
        generation,
        request: context.request,
        requestId: args.requestId,
      });
      if (handled) return;
    }

    await ctx.runMutation(internal.content.requests.transition, {
      requestId: args.requestId,
      status: "planning",
    });

    const requestedRenderingMode = (context.request.requestedRenderingMode ?? "background_plus_overlay") as RequestedRenderingMode;
    const plannerReferences = context.referenceAssets.map(({ asset, instruction }) =>
      plannerReferenceFromAsset(asset, instruction)
    );
    let plan = context.request.plan as SlideshowPlan | undefined;
    let specArtifactId = context.request.planArtifactId;

    if (!plan) {
      const structured = await generateStructuredWithFallback<SlideshowPlannerOutput>({
        systemPrompt: "You are a senior short-form content creative director and slideshow planner.",
        prompt: planPromptForMode({
          prompt: context.request.prompt,
          revisionPrompt: context.request.revisionPrompt,
          socialAccount: context.socialAccount,
          requestedRenderingMode,
          references: plannerReferences,
        }),
        schema: planSchemaForMode(requestedRenderingMode),
        schemaName: "slideshow_create_plan",
        temperature: 0.7,
        parser: (text) => JSON.parse(text) as SlideshowPlannerOutput,
      });
      costUsd = sumCost(costUsd, structured.metadata);
      const rawSlides = Array.isArray((structured.object as { slides?: unknown }).slides)
        ? (structured.object as { slides: unknown[] }).slides
        : [];
      const imagePromptSlides = await Promise.all(rawSlides.map(async (slide) => {
        const imagePrompt = await generateStructuredWithFallback<SingleImagePromptWriterOutput>({
          systemPrompt: IMAGE_PROMPT_WRITER_SYSTEM_PROMPT,
          prompt: buildSingleImagePromptWriterPrompt({
            prompt: context.request.prompt,
            revisionPrompt: context.request.revisionPrompt,
            socialAccount: context.socialAccount,
            requestedRenderingMode,
            references: plannerReferences,
            plan: structured.object,
            slide,
          }),
          schema: singleImagePromptSchemaForMode(requestedRenderingMode),
          schemaName: "slideshow_single_image_prompt",
          model: process.env.CONTENT_ENGINE_IMAGE_PROMPT_TEXT_MODEL?.trim() ||
            process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() ||
            "openai/gpt-4.1",
          temperature: 0.2,
          parser: (text) => JSON.parse(text) as SingleImagePromptWriterOutput,
        });
        costUsd = sumCost(costUsd, imagePrompt.metadata);
        return imagePrompt.object;
      }));
      const imagePrompts = {
        renderingMode: requestedRenderingMode,
        slides: imagePromptSlides,
      } as ImagePromptWriterOutput;
      plan = normalizePlan(
        structured.object,
        imagePrompts,
        context.request.prompt,
        context.request.revisionPrompt,
        requestedRenderingMode
      );

      specArtifactId = await createRequestArtifact(ctx, {
        request: context.request,
        type: "slide_spec",
        title: plan.title,
        data: plan,
        provider: structured.metadata.provider,
        model: structured.metadata.model,
        prompt: context.request.prompt,
      });

      await ctx.runMutation(internal.content.requests.transition, {
        requestId: args.requestId,
        status: "planning",
        plan,
        planArtifactId: specArtifactId,
        summary: plan.creativeBrief,
        costUsd,
      });

      const debugContext = slideshowDebugContext(generation);
      if (debugContext) {
        await ctx.runMutation(internal.content.requests.pauseSlideshowForDebugPromptReview, {
          requestId: args.requestId,
          createThreadId: debugContext.createThreadId,
          createToolCallId: debugContext.createToolCallId,
          specArtifactId,
          prompts: promptReviewItemsForPlan(plan),
        });
        return;
      }
    }

    if (!specArtifactId) {
      specArtifactId = await createRequestArtifact(ctx, {
        request: context.request,
        type: "slide_spec",
        title: plan.title,
        data: plan,
        provider: "manual",
        prompt: context.request.prompt,
      });
    }

    await ctx.runMutation(internal.content.requests.transition, {
      requestId: args.requestId,
      status: "generating",
      plan,
      planArtifactId: specArtifactId,
      summary: plan.creativeBrief,
      costUsd,
    });

    const referenceAssets = context.referenceAssets.map(({ asset }) => asset);
    const anySlideUsesReferences = plan.slides.some((slide) => slide.useReferenceImage === true);
    const referenceImages = anySlideUsesReferences
      ? await referenceImagesFromAssets(referenceAssets)
      : [];
    const dimensions = getSlideDimensions(plan.aspectRatio);
    const imageBySlideIndex = new Map<number, { artifactId: Id<"artifacts">; url?: string }>();
    const imageErrors: string[] = [];
    const pendingImages: Array<{
      slide: SlideshowPlan["slides"][number];
      prompt: string;
      imageProvider: ModelProvider;
      referenceAssetIds: string[];
      image: GenerateImageResult;
    }> = [];

    const pendingImageResults = await Promise.all(plan.slides.map(async (slide) => {
      const prompt = providerImagePrompt(promptForSlide(slide), plan.aspectRatio, plan.renderingMode);
      const referenceImagesForSlide = slide.useReferenceImage === true ? referenceImages : [];
      const referenceAssetIds = referenceImagesForSlide.length > 0
        ? referenceAssetIdsForSlide(slide, referenceAssets)
        : [];
      const imageProviderName = referenceImagesForSlide.length > 0
        ? context.request.generation?.provider ??
          (process.env.CONTENT_ENGINE_REFERENCE_IMAGE_PROVIDER?.trim() as ModelProviderName | undefined) ??
          "fal"
        : context.request.generation?.provider ??
          (process.env.CONTENT_ENGINE_IMAGE_PROVIDER?.trim() as ModelProviderName | undefined) ??
          "fal";
      const imageModel = context.request.generation?.model?.trim() ||
        imageModelForProviderRenderingMode(imageProviderName, plan.renderingMode);
      const imageProvider = getModelProvider(imageProviderName);
      try {
        const image = await imageProvider.generateImage({
          prompt,
          model: imageModel,
          aspectRatio: plan.aspectRatio,
          count: 1,
          referenceImages: referenceImagesForSlide.length > 0 ? referenceImagesForSlide : undefined,
          metadata: {
            arguments: {
              aspect_ratio: plan.aspectRatio,
              output_format: "png",
              resolution: "2K",
            },
            renderingMode: plan.renderingMode,
            useReferenceImage: slide.useReferenceImage === true,
            referenceAssetIds,
          },
        });
        costUsd = sumCost(costUsd, image.metadata);
        return { slide, prompt, imageProvider, referenceAssetIds, image };
      } catch (error) {
        imageErrors.push(`Slide ${slide.index}: ${error instanceof Error ? error.message : "Image generation failed"}`);
        await createRequestArtifact(ctx, {
          request: context.request,
          type: "image_prompt",
          title: `Slide ${slide.index} image prompt`,
          data: {
            slideIndex: slide.index,
            prompt,
            referenceAssetIds,
            errorMessage: error instanceof Error ? error.message : "Image generation failed",
          },
          provider: "manual",
          prompt,
          parentArtifactIds: [specArtifactId],
        });
        return null;
      }
    }));
    pendingImages.push(
      ...pendingImageResults.filter(
        (pending): pending is NonNullable<typeof pending> => Boolean(pending)
      )
    );

    const resolvedImages = await Promise.all(pendingImages.map(async (pending) => {
      try {
        const asset = pending.image.images[0] ?? await waitForGeneratedImage(pending.imageProvider, {
          jobId: pending.image.jobId,
          model: pending.image.metadata.model,
          metadata: pending.image.metadata,
        });
        return { ...pending, asset };
      } catch (error) {
        return {
          ...pending,
          errorMessage: error instanceof Error ? error.message : "Image generation failed",
        };
      }
    }));

    for (const result of resolvedImages) {
      if ("errorMessage" in result) {
        imageErrors.push(`Slide ${result.slide.index}: ${result.errorMessage}`);
        await createRequestArtifact(ctx, {
          request: context.request,
          type: "image_prompt",
          title: `Slide ${result.slide.index} image prompt`,
          data: {
            slideIndex: result.slide.index,
            prompt: result.prompt,
            errorMessage: result.errorMessage,
            jobId: result.image.jobId,
            provider: result.image.metadata.provider,
            model: result.image.metadata.model,
            statusUrl: typeof result.image.metadata.statusUrl === "string" ? result.image.metadata.statusUrl : undefined,
            responseUrl: typeof result.image.metadata.responseUrl === "string" ? result.image.metadata.responseUrl : undefined,
            useReferenceImage: result.slide.useReferenceImage === true,
            referenceAssetIds: result.referenceAssetIds,
          },
          provider: "manual",
          prompt: result.prompt,
          parentArtifactIds: [specArtifactId],
        });
        continue;
      }

      const stored = await storeGeneratedAsset(ctx, result.asset);
      const artifactId = await createRequestArtifact(ctx, {
        request: context.request,
        type: "image",
        title: `Slide ${result.slide.index} image`,
        storageUrl: stored.storageUrl,
        data: {
          format: plan.renderingMode === "full_graphic_generation"
            ? "slideshow_full_graphic"
            : "slideshow_background",
          slideIndex: result.slide.index,
          storageId: stored.storageId,
          mimeType: stored.mimeType,
          fileSize: stored.byteLength,
          width: dimensions.width,
          height: dimensions.height,
          jobId: result.image.jobId,
          status: "succeeded",
          renderingMode: plan.renderingMode,
          useReferenceImage: result.slide.useReferenceImage === true,
          referenceAssetIds: result.referenceAssetIds,
        },
        provider: result.image.metadata.provider,
        model: result.image.metadata.model,
        prompt: result.prompt,
        captionPrefix: `Slide ${result.slide.index}`,
        parentArtifactIds: [specArtifactId],
      });
      imageBySlideIndex.set(result.slide.index, { artifactId, url: stored.storageUrl });
    }

    if (imageErrors.length) {
      throw new Error(`Image generation failed for ${imageErrors.length} slide${imageErrors.length === 1 ? "" : "s"}: ${imageErrors.join("; ")}`);
    }

    const canonicalSpec = buildCanonicalSlideshowSpec({
      plan,
      dimensions,
      imageBySlideIndex,
    });
    await ctx.runMutation(internal.content.slideshows.createFromRunner, {
      userId: context.request.userId,
      socialAccountId: context.request.socialAccountId,
      contentRequestId: context.request._id,
      title: canonicalSpec.title,
      status: "preview",
      spec: canonicalSpec,
    });

    await ctx.runMutation(internal.content.requests.transition, {
      requestId: args.requestId,
      status: "ready",
      summary: `${plan.slides.length} slide preview ready.`,
      costUsd,
      completedAt: Date.now(),
    });
  } catch (error) {
    const errorMessage = requestErrorMessage(error);
    console.error("Content request execution failed", {
      requestId: args.requestId,
      errorMessage,
      error,
    });
    await ctx.runMutation(internal.content.requests.transition, {
      requestId: args.requestId,
      status: "failed",
      errorMessage,
      costUsd,
      completedAt: Date.now(),
    });
  }
}
