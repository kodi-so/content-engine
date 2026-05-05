import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { slideFromCopy } from "../content/slideshowAdapter";
import {
  fetchImageDataUri,
  getSlideDimensions,
  renderSlideSvg,
} from "../content/slideshowRenderer";
import {
  createArtifact,
  getArtifactsForRefs,
  reviewStatusForWorkflow,
  type StepOutputs,
  type WorkflowExecutionContext,
  type WorkflowStep,
} from "./execution";

type SlideshowSpec = {
  format?: string;
  aspectRatio?: string;
  hook?: string;
  caption?: string;
  slides?: Array<{
    index?: number;
    role?: string;
    headline?: string;
    body?: string;
    visualPrompt?: string;
    layout?: unknown;
  }>;
};

function isSlideshowSpec(value: unknown): value is SlideshowSpec {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as SlideshowSpec).slides)
  );
}

function getArtifactUrl(artifact: Doc<"artifacts">): string | undefined {
  if (artifact.storageUrl) return artifact.storageUrl;
  if (!artifact.data || typeof artifact.data !== "object") return undefined;

  const data = artifact.data as Record<string, unknown>;
  return typeof data.url === "string" ? data.url : undefined;
}

function getSlideIndexFromImageArtifact(artifact: Doc<"artifacts">): number | undefined {
  const parentTitle = artifact.title ?? "";
  const match = parentTitle.match(/Slide\s+(\d+)/i);
  if (match?.[1]) return Number(match[1]);

  if (!artifact.data || typeof artifact.data !== "object") return undefined;
  const data = artifact.data as Record<string, unknown>;
  const slide = data.slide;
  if (!slide || typeof slide !== "object") return undefined;

  const index = (slide as Record<string, unknown>).index;
  return typeof index === "number" ? index : undefined;
}

export async function executeRenderSlideshowStep(
  ctx: ActionCtx,
  context: WorkflowExecutionContext,
  step: WorkflowStep,
  outputs: StepOutputs
): Promise<Id<"artifacts">[]> {
  const slideSpecs = await getArtifactsForRefs(ctx, outputs, step.inputRefs, "slide_spec");
  const images = await getArtifactsForRefs(ctx, outputs, step.inputRefs, "image");
  const imageBySlideIndex = new Map<number, Doc<"artifacts">>();

  for (const image of images) {
    const slideIndex = getSlideIndexFromImageArtifact(image);
    if (slideIndex && !imageBySlideIndex.has(slideIndex)) {
      imageBySlideIndex.set(slideIndex, image);
    }
  }

  const artifactIds: Id<"artifacts">[] = [];
  for (const slideSpecArtifact of slideSpecs) {
    if (!isSlideshowSpec(slideSpecArtifact.data)) continue;

    const aspectRatio = slideSpecArtifact.data.aspectRatio ?? "9:16";
    const dimensions = getSlideDimensions(aspectRatio);

    for (const slide of slideSpecArtifact.data.slides ?? []) {
      const slideIndex = slide.index ?? artifactIds.length + 1;
      const image = imageBySlideIndex.get(slideIndex);
      const imageUrl = image ? getArtifactUrl(image) : undefined;
      const backgroundImageDataUri = await fetchImageDataUri(imageUrl);
      const renderableSlide = slideFromCopy({
        index: slideIndex,
        role: slide.role,
        headline: slide.headline,
        body: slide.body,
        visualPrompt: slide.visualPrompt,
        layout: slide.layout,
      });
      const svg = renderSlideSvg({
        dimensions,
        backgroundImageDataUri,
        slide: renderableSlide,
      });
      const storageId = await ctx.storage.store(
        new Blob([svg], { type: "image/svg+xml" })
      );
      const renderedImageUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;

      artifactIds.push(
        await createArtifact(ctx, context, step, {
          type: "rendered_slide",
          title: `Rendered slide ${slideIndex}`,
          storageUrl: renderedImageUrl,
          data: {
            format: "rendered_slide",
            mimeType: "image/svg+xml",
            slideIndex,
            aspectRatio,
            dimensions,
            renderedImageUrl,
            storageId,
            backgroundImageUrl: imageUrl,
            backgroundEmbedded: Boolean(backgroundImageDataUri),
            headline: slide.headline,
            body: slide.body,
            role: renderableSlide.role,
            textBlocks: renderableSlide.textBlocks,
            visualPrompt: slide.visualPrompt,
            layout: renderableSlide.layout,
            sourceSlideSpecArtifactId: slideSpecArtifact._id,
            sourceImageArtifactId: image?._id,
          },
          parentArtifactIds: [
            slideSpecArtifact._id,
            ...(image ? [image._id] : []),
          ],
          reviewStatus: reviewStatusForWorkflow(context),
        })
      );
    }
  }

  return artifactIds;
}

export async function executeImagePromptStep(
  ctx: ActionCtx,
  context: WorkflowExecutionContext,
  step: WorkflowStep,
  outputs: StepOutputs
): Promise<Id<"artifacts">[]> {
  const slideSpecs = await getArtifactsForRefs(ctx, outputs, step.inputRefs, "slide_spec");
  const artifactIds: Id<"artifacts">[] = [];

  for (const slideSpecArtifact of slideSpecs) {
    if (!isSlideshowSpec(slideSpecArtifact.data)) continue;

    for (const slide of slideSpecArtifact.data.slides ?? []) {
      if (!slide.visualPrompt?.trim()) continue;

      artifactIds.push(
        await createArtifact(ctx, context, step, {
          type: "image_prompt",
          title: `Slide ${slide.index ?? artifactIds.length + 1} image prompt`,
          data: {
            prompt: slide.visualPrompt,
            slide,
            aspectRatio: slideSpecArtifact.data.aspectRatio,
            hook: slideSpecArtifact.data.hook,
          },
          prompt: slide.visualPrompt,
          parentArtifactIds: [slideSpecArtifact._id],
          reviewStatus: reviewStatusForWorkflow(context),
        })
      );
    }
  }

  return artifactIds;
}
