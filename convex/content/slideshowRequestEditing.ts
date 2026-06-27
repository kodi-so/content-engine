import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { r2 } from "../storage/r2";
import type { RequestedRenderingMode } from "./planning";
import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SlideshowTextBlock,
} from "./types";
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

export function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(number, min), max);
}

export function normalizeHexColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toUpperCase()
    : fallback;
}

export function normalizeEditableTextBlocks(value: unknown): SlideshowTextBlock[] {
  if (!Array.isArray(value)) throw new Error("Text blocks are required");

  const blocks = value.map((item, index): SlideshowTextBlock | null => {
    if (!item || typeof item !== "object") return null;
    const block = item as Record<string, unknown>;
    const text = typeof block.text === "string"
      ? block.text.trim()
      : Array.isArray(block.items)
        ? block.items.filter((line) => typeof line === "string" && line.trim()).join("\n")
        : "";
    if (!text) return null;

    const role = index === 0 ? "headline" : "body";
    const emphasis = index === 0 ? "primary" : "secondary";
    const backgroundStyle = block.backgroundStyle === "solid" ? "solid" : "none";

    return {
      id: typeof block.id === "string" && block.id.trim()
        ? block.id.trim().slice(0, 64)
        : `text-${index + 1}`,
      role,
      text: text.slice(0, 280),
      items: [],
      emphasis,
      x: clampNumber(block.x, 10, 0, 96),
      y: clampNumber(block.y, index === 0 ? 42 : 56, 0, 96),
      width: clampNumber(block.width, 80, 12, 100),
      height: clampNumber(block.height, index === 0 ? 14 : 10, 4, 100),
      align: block.align === "left" || block.align === "right" ? block.align : "center",
      fontSize: clampNumber(block.fontSize, index === 0 ? 72 : 44, 20, 150),
      fontWeight: clampNumber(block.fontWeight, role === "body" ? 700 : 800, 400, 900),
      color: normalizeHexColor(block.color, "#FFFFFF"),
      strokeColor: normalizeHexColor(block.strokeColor, "#000000"),
      strokeWidth: clampNumber(block.strokeWidth, 16, 0, 48),
      backgroundStyle,
      backgroundColor: backgroundStyle === "solid" ? normalizeHexColor(block.backgroundColor, "#FFFFFF") : "#000000",
      backgroundOpacity: backgroundStyle === "solid" ? 1 : 0,
    };
  }).filter((block): block is SlideshowTextBlock => Boolean(block));

  return blocks.slice(0, 12);
}

export async function cleanupArtifactStorage(ctx: MutationCtx, artifact: Doc<"artifacts">) {
  const data = getArtifactData(artifact);
  const storageKeys = [data.storageId, data.publishStorageId].filter(
    (value): value is string => typeof value === "string"
  );

  for (const storageKey of storageKeys) {
    try {
      await r2.deleteObject(ctx, storageKey);
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
