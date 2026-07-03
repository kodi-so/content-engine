import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { RequestedRenderingMode } from "../planning";
import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SlideshowTextBlock,
} from "../types";
import {
  clampNumber,
  normalizeHexColor,
  normalizeMediaTextOverlayBlocks,
} from "../../lib/mediaTextOverlays";
export function normalizeCanonicalSpec(value: unknown): CanonicalSlideshowSpec {
  if (!value || typeof value !== "object") {
    throw new Error("Slideshow spec is missing");
  }
  return value as CanonicalSlideshowSpec;
}

export function getArtifactData(artifact: Doc<"artifacts">): Record<string, unknown> {
  return artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data)
    ? artifact.data as Record<string, unknown>
    : {};
}

export function activeSlides(spec: CanonicalSlideshowSpec) {
  return spec.slides
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

export function renderingModeForSlide(
  spec: CanonicalSlideshowSpec,
  slide: CanonicalSlideshowSlide
): RequestedRenderingMode {
  return (slide.renderingMode ?? spec.renderingMode ?? "background_plus_overlay") as RequestedRenderingMode;
}

export function reindexActiveSlides(spec: CanonicalSlideshowSpec): CanonicalSlideshowSpec {
  const activeIds = new Set(activeSlides(spec).map((slide) => slide.slideId));
  let index = 1;
  return {
    ...spec,
    slides: spec.slides.map((slide) => {
      if (!activeIds.has(slide.slideId)) return slide;
      const nextSlide = { ...slide, index, updatedAt: Date.now() };
      index += 1;
      return nextSlide;
    }),
  };
}

export async function getOwnedSlideshow(
  ctx: MutationCtx,
  args: { slideshowId: Id<"slideshows">; userId: string }
) {
  const slideshow = await ctx.db.get(args.slideshowId);
  if (!slideshow || slideshow.userId !== args.userId) {
    throw new Error("Slideshow not found");
  }
  return slideshow;
}

export { clampNumber, normalizeHexColor };

export function normalizeEditableTextBlocks(value: unknown): SlideshowTextBlock[] {
  if (!Array.isArray(value)) throw new Error("Text blocks are required");
  return normalizeMediaTextOverlayBlocks(value) as SlideshowTextBlock[];
}

export async function cleanupArtifactStorage(ctx: MutationCtx, artifact: Doc<"artifacts">) {
  const data = getArtifactData(artifact);
  const storageIds = [data.storageId, data.publishStorageId].filter(
    (value): value is Id<"_storage"> => typeof value === "string"
  );

  for (const storageId of storageIds) {
    try {
      await ctx.storage.delete(storageId);
    } catch {
      // Storage cleanup is best-effort; rows are still the durable state.
    }
  }
}

export async function deleteArtifactsForRequest(
  ctx: MutationCtx,
  args: { requestId: Id<"contentRequests">; userId: string }
) {
  const artifacts = await ctx.db
    .query("artifacts")
    .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.requestId))
    .collect();

  for (const artifact of artifacts) {
    if (artifact.userId !== args.userId) continue;
    await cleanupArtifactStorage(ctx, artifact);
    await ctx.db.delete(artifact._id);
  }
}

export async function deleteSlideshowsForRequest(
  ctx: MutationCtx,
  args: { requestId: Id<"contentRequests">; userId: string }
) {
  const slideshows = await ctx.db
    .query("slideshows")
    .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.requestId))
    .collect();

  for (const slideshow of slideshows) {
    if (slideshow.userId === args.userId) {
      await ctx.db.delete(slideshow._id);
    }
  }
}
