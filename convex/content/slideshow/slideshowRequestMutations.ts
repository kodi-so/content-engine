import { internal } from "../../_generated/api";
import type { ActionCtx, MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { storeGeneratedAsset } from "../assets/assetStorage";
import { getSlideDimensions } from "./slideshowDimensions";
import { getModelProvider } from "../../providers/index";
import { waitForGeneratedImage } from "../../workflows/runtime/generationWaiters";
import {
  createRequestArtifact,
  imageModelForRenderingMode,
  normalizeImagePromptFormatting,
  providerImagePrompt,
  referenceAssetIdsForSlide,
  referenceImagesFromAssets,
} from "../requestExecution/requestExecutionHelpers";
import {
  activeSlides,
  clampNumber,
  cleanupArtifactStorage,
  getOwnedSlideshow,
  normalizeCanonicalSpec,
  normalizeEditableTextBlocks,
  reindexActiveSlides,
  renderingModeForSlide,
} from "./slideshowRequestEditing";

type EditableAspectRatio = "9:16" | "4:5" | "1:1";

function isEditableAspectRatio(value: string): value is EditableAspectRatio {
  return value === "9:16" || value === "4:5" || value === "1:1";
}

function clampTextBlockToCanvas(block: Record<string, unknown>) {
  const x = clampNumber(block.x, 10, 0, 96);
  const y = clampNumber(block.y, 42, 0, 96);
  const width = clampNumber(block.width, 80, 12, 100 - x);
  const height = clampNumber(block.height, 10, 4, 100 - y);
  return { ...block, x, y, width, height };
}

export async function deleteSlideForRequest(
  ctx: MutationCtx,
  args: { slideshowId: Id<"slideshows">; slideId: string; userId: string }
) {
  const slideshow = await getOwnedSlideshow(ctx, {
    slideshowId: args.slideshowId,
    userId: args.userId,
  });
  const spec = normalizeCanonicalSpec(slideshow.spec);
  if (activeSlides(spec).length <= 1) throw new Error("A slideshow needs at least one slide");
  const deletedSlide = spec.slides.find(
    (slide) => slide.slideId === args.slideId && slide.status !== "deleted"
  );

  const nextSpec = reindexActiveSlides({
    ...spec,
    slides: spec.slides.map((slide) =>
      slide.slideId === args.slideId
        ? { ...slide, status: "deleted", updatedAt: Date.now() }
        : slide
    ),
  });

  await ctx.db.patch(slideshow._id, {
    spec: nextSpec,
    updatedAt: Date.now(),
  });

  if (deletedSlide?.sourceImageArtifactId) {
    const artifact = await ctx.db.get(deletedSlide.sourceImageArtifactId as Id<"artifacts">);
    if (artifact && artifact.userId === args.userId) {
      await cleanupArtifactStorage(ctx, artifact);
      await ctx.db.delete(artifact._id);
    }
  }
}

export async function createSlideForRequest(
  ctx: MutationCtx,
  args: { slideshowId: Id<"slideshows">; afterSlideId: string; userId: string }
) {
  const slideshow = await getOwnedSlideshow(ctx, {
    slideshowId: args.slideshowId,
    userId: args.userId,
  });
  const spec = normalizeCanonicalSpec(slideshow.spec);
  const slides = activeSlides(spec);
  const sourceSlide = slides.find((slide) => slide.slideId === args.afterSlideId) ?? slides[slides.length - 1];
  if (!sourceSlide) throw new Error("A source slide is required");

  const now = Date.now();
  const newSlideId = `slide-${now}`;
  const sourceIndex = sourceSlide.index;
  const copiedTextBlocks = "textBlocks" in sourceSlide && Array.isArray(sourceSlide.textBlocks)
    ? sourceSlide.textBlocks.map((block, index) => ({
        ...block,
        id: `text-${now}-${index + 1}`,
      }))
    : undefined;
  const nextSlide = {
    ...sourceSlide,
    slideId: newSlideId,
    index: sourceIndex + 1,
    ...(copiedTextBlocks !== undefined ? { textBlocks: copiedTextBlocks } : {}),
    sourceImageArtifactId: undefined,
    updatedAt: now,
  };

  const nextSpec = reindexActiveSlides({
    ...spec,
    slides: [
      ...spec.slides.map((slide) =>
        slide.status !== "deleted" && slide.index > sourceIndex
          ? { ...slide, index: slide.index + 1, updatedAt: now }
          : slide
      ),
      nextSlide,
    ],
  });

  await ctx.db.patch(slideshow._id, {
    spec: nextSpec,
    updatedAt: now,
  });

  return newSlideId;
}

export async function moveSlideForRequest(
  ctx: MutationCtx,
  args: {
    slideshowId: Id<"slideshows">;
    slideId: string;
    direction: "left" | "right";
    userId: string;
  }
) {
  const slideshow = await getOwnedSlideshow(ctx, {
    slideshowId: args.slideshowId,
    userId: args.userId,
  });
  const spec = normalizeCanonicalSpec(slideshow.spec);
  const slides = activeSlides(spec);
  const currentIndex = slides.findIndex((slide) => slide.slideId === args.slideId);
  const targetIndex = args.direction === "left" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= slides.length) return;

  const current = slides[currentIndex];
  const target = slides[targetIndex];
  const now = Date.now();
  const nextSpec = reindexActiveSlides({
    ...spec,
    slides: spec.slides.map((slide) => {
      if (slide.slideId === current.slideId) {
        return { ...slide, index: target.index, updatedAt: now };
      }
      if (slide.slideId === target.slideId) {
        return { ...slide, index: current.index, updatedAt: now };
      }
      return slide;
    }),
  });

  await ctx.db.patch(slideshow._id, {
    spec: nextSpec,
    updatedAt: now,
  });
}

export async function reorderSlidesForRequest(
  ctx: MutationCtx,
  args: {
    slideshowId: Id<"slideshows">;
    slideIds: string[];
    userId: string;
  }
) {
  const slideshow = await getOwnedSlideshow(ctx, {
    slideshowId: args.slideshowId,
    userId: args.userId,
  });
  const spec = normalizeCanonicalSpec(slideshow.spec);
  const slides = activeSlides(spec);
  const activeIds = new Set(slides.map((slide) => slide.slideId));
  const uniqueIds = [...new Set(args.slideIds)];
  const hasSameSlides =
    uniqueIds.length === activeIds.size &&
    uniqueIds.every((slideId) => activeIds.has(slideId));
  if (!hasSameSlides) throw new Error("Slide order does not match the active slideshow");

  const now = Date.now();
  const indexBySlideId = new Map(
    uniqueIds.map((slideId, index) => [slideId, index + 1])
  );
  const nextSpec = {
    ...spec,
    slides: spec.slides.map((slide) => {
      const nextIndex = indexBySlideId.get(slide.slideId);
      return nextIndex === undefined
        ? slide
        : { ...slide, index: nextIndex, updatedAt: now };
    }),
  };

  await ctx.db.patch(slideshow._id, {
    spec: nextSpec,
    updatedAt: now,
  });
}

export async function updateSlideshowAspectRatioForRequest(
  ctx: MutationCtx,
  args: {
    slideshowId: Id<"slideshows">;
    aspectRatio: string;
    userId: string;
  }
) {
  if (!isEditableAspectRatio(args.aspectRatio)) {
    throw new Error("Slide format must be 9:16, 4:5, or 1:1");
  }
  const slideshow = await getOwnedSlideshow(ctx, {
    slideshowId: args.slideshowId,
    userId: args.userId,
  });
  const spec = normalizeCanonicalSpec(slideshow.spec);
  if (spec.aspectRatio === args.aspectRatio) return;

  const now = Date.now();
  const dimensions = getSlideDimensions(args.aspectRatio);
  const nextSpec = {
    ...spec,
    aspectRatio: args.aspectRatio,
    dimensions,
    exportSettings: {
      ...spec.exportSettings,
      width: dimensions.width,
      height: dimensions.height,
    },
    slides: spec.slides.map((slide) => ({
      ...slide,
      dimensions,
      ...("textBlocks" in slide && Array.isArray(slide.textBlocks)
        ? {
            textBlocks: slide.textBlocks.map((block) =>
              clampTextBlockToCanvas(block as unknown as Record<string, unknown>)
            ),
          }
        : {}),
      updatedAt: now,
    })),
  };

  await ctx.db.patch(slideshow._id, {
    spec: nextSpec,
    updatedAt: now,
  });
}

export async function updateSlideTextForRequest(
  ctx: MutationCtx,
  args: {
    slideshowId: Id<"slideshows">;
    slideId: string;
    textBlocks: unknown[];
    userId: string;
  }
) {
  const slideshow = await getOwnedSlideshow(ctx, {
    slideshowId: args.slideshowId,
    userId: args.userId,
  });
  const spec = normalizeCanonicalSpec(slideshow.spec);
  const textBlocks = normalizeEditableTextBlocks(args.textBlocks);
  const nextSpec = {
    ...spec,
    slides: spec.slides.map((slide) => {
      const canEditText =
        slide.slideId === args.slideId &&
        slide.status !== "deleted" &&
        renderingModeForSlide(spec, slide) === "background_plus_overlay";
      return canEditText ? { ...slide, textBlocks, updatedAt: Date.now() } : slide;
    }),
  };

  await ctx.db.patch(slideshow._id, {
    spec: nextSpec,
    updatedAt: Date.now(),
  });
}

export async function updateSlideImagePromptForRequest(
  ctx: MutationCtx,
  args: {
    slideshowId: Id<"slideshows">;
    slideId: string;
    prompt: string;
    userId: string;
  }
) {
  const slideshow = await getOwnedSlideshow(ctx, {
    slideshowId: args.slideshowId,
    userId: args.userId,
  });
  const prompt = normalizeImagePromptFormatting(args.prompt);
  if (!prompt) throw new Error("Image prompt is required");

  const spec = normalizeCanonicalSpec(slideshow.spec);
  const now = Date.now();
  const nextSpec = {
    ...spec,
    slides: spec.slides.map((slide) => {
      if (slide.slideId !== args.slideId || slide.status === "deleted") return slide;
      const renderingMode = renderingModeForSlide(spec, slide);
      return {
        ...slide,
        ...(renderingMode === "full_graphic_generation"
          ? { finalImagePrompt: prompt }
          : { backgroundPrompt: prompt }),
        updatedAt: now,
      };
    }),
  };

  await ctx.db.patch(slideshow._id, {
    spec: nextSpec,
    updatedAt: now,
  });
}

export async function applyRegeneratedSlideImageForRequest(
  ctx: MutationCtx,
  args: {
    slideshowId: Id<"slideshows">;
    userId: string;
    slideId: string;
    prompt: string;
    useReferenceImage?: boolean;
    storageUrl: string;
    sourceImageArtifactId: string;
  }
) {
  const slideshow = await getOwnedSlideshow(ctx, {
    slideshowId: args.slideshowId,
    userId: args.userId,
  });
  const spec = normalizeCanonicalSpec(slideshow.spec);
  const now = Date.now();
  const replacedSlide = spec.slides.find(
    (slide) => slide.slideId === args.slideId && slide.status !== "deleted"
  );
  const replacedArtifactId = replacedSlide?.sourceImageArtifactId;
  const nextSpec = {
    ...spec,
    slides: spec.slides.map((slide) => {
      if (slide.slideId !== args.slideId || slide.status === "deleted") return slide;
      const renderingMode = renderingModeForSlide(spec, slide);
      return {
        ...slide,
        ...(renderingMode === "full_graphic_generation"
          ? { finalImagePrompt: args.prompt }
          : { backgroundPrompt: args.prompt }),
        useReferenceImage: args.useReferenceImage === true ? true : undefined,
        backgroundImageUrl: args.storageUrl,
        sourceImageArtifactId: args.sourceImageArtifactId,
        updatedAt: now,
      };
    }),
  };

  await ctx.db.patch(slideshow._id, {
    spec: nextSpec,
    updatedAt: now,
  });

  if (
    replacedArtifactId &&
    replacedArtifactId !== args.sourceImageArtifactId
  ) {
    const artifact = await ctx.db.get(replacedArtifactId as Id<"artifacts">);
    if (artifact && artifact.userId === args.userId) {
      await cleanupArtifactStorage(ctx, artifact);
      await ctx.db.delete(artifact._id);
    }
  }
}

export async function regenerateSlideImageForRequest(
  ctx: ActionCtx,
  args: {
    slideshowId: Id<"slideshows">;
    slideId: string;
    prompt: string;
    useReferenceImage?: boolean;
    userId: string;
  }
): Promise<{ artifactId: Id<"artifacts">; storageUrl: string }> {
  const prompt = normalizeImagePromptFormatting(args.prompt);
  if (!prompt) throw new Error("Image prompt is required");

  const context = await ctx.runQuery(internal.content.requests.getSlideRegenerationContext, {
    slideshowId: args.slideshowId,
    slideId: args.slideId,
    userId: args.userId,
  });
  if (!context) throw new Error("Slide not found");

  const renderingMode = renderingModeForSlide(context.spec, context.slide);
  const aspectRatio = context.spec.aspectRatio ?? "9:16";
  const useReferenceImage = args.useReferenceImage ?? (context.slide.useReferenceImage === true);
  const referenceAssetsForSlide = useReferenceImage ? context.referenceAssets : [];
  const referenceImages = await referenceImagesFromAssets(referenceAssetsForSlide);
  const referenceAssetIds = referenceImages.length > 0
    ? referenceAssetIdsForSlide({ useReferenceImage }, referenceAssetsForSlide)
    : [];
  const imageProviderName = referenceImages.length > 0
    ? process.env.CONTENT_ENGINE_REFERENCE_IMAGE_PROVIDER?.trim() || "fal"
    : process.env.CONTENT_ENGINE_IMAGE_PROVIDER?.trim() || "fal";
  const imageProvider = getModelProvider(imageProviderName as "gemini" | "fal");
  const imageModel = imageModelForRenderingMode(renderingMode);
  const dimensions = context.spec.dimensions ?? getSlideDimensions(aspectRatio);
  const providerPrompt = providerImagePrompt(prompt, aspectRatio, renderingMode);

  const image = await imageProvider.generateImage({
    prompt: providerPrompt,
    model: imageModel,
    aspectRatio,
    count: 1,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    metadata: {
      arguments: {
        aspect_ratio: aspectRatio,
        output_format: "png",
        resolution: "2K",
      },
      renderingMode,
      slideId: args.slideId,
      referenceAssetIds,
    },
  });
  const asset = image.images[0] ?? await waitForGeneratedImage(imageProvider, {
    jobId: image.jobId,
    model: image.metadata.model,
    metadata: image.metadata,
  });
  const stored = await storeGeneratedAsset(ctx, asset);
  const artifactId: Id<"artifacts"> = await createRequestArtifact(ctx, {
    request: context.request,
    type: "image",
    title: `Slide ${context.slide.index} regenerated image`,
    storageUrl: stored.storageUrl,
    data: {
      format: renderingMode === "full_graphic_generation"
        ? "slideshow_full_graphic"
        : "slideshow_background",
      slideIndex: context.slide.index,
      storageId: stored.storageId,
      mimeType: stored.mimeType,
      fileSize: stored.byteLength,
      width: dimensions.width,
      height: dimensions.height,
      jobId: image.jobId,
      status: "succeeded",
      renderingMode,
      useReferenceImage,
      sourceSlideshowId: args.slideshowId,
      sourceSlideId: args.slideId,
      referenceAssetIds,
    },
    provider: image.metadata.provider,
    model: image.metadata.model,
    prompt: providerPrompt,
  });

  await ctx.runMutation(internal.content.requests.applyRegeneratedSlideImage, {
    slideshowId: args.slideshowId,
    userId: args.userId,
    slideId: args.slideId,
    prompt,
    useReferenceImage,
    storageUrl: stored.storageUrl,
    sourceImageArtifactId: String(artifactId),
  });

  return { artifactId, storageUrl: stored.storageUrl };
}
