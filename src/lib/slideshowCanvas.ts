import type { CanonicalSlideshowSlide, CanonicalSlideshowSpec } from "../types";
import {
  slideshowDimensionsForSpec,
  slideshowText,
} from "./slideshowRendering";
import { drawCoverImage, drawTextOverlays } from "./composition/canvasText";

type RenderOptions = {
  mimeType?: "image/png" | "image/webp" | "image/jpeg";
  quality?: number;
};

function activeSlides(spec: CanonicalSlideshowSpec) {
  return [...(spec.slides ?? [])]
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load slide image"));
    image.src = url;
  });
}

export async function renderSlideToBlob(
  slide: CanonicalSlideshowSlide,
  spec: CanonicalSlideshowSpec,
  options: RenderOptions = {}
): Promise<Blob> {
  const { width, height } = slideshowDimensionsForSpec(spec, slide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  ctx.fillStyle = "#111513";
  ctx.fillRect(0, 0, width, height);
  if (slide.backgroundImageUrl) {
    const image = await loadImage(slide.backgroundImageUrl);
    drawCoverImage(ctx, image, width, height);
  }
  const isFullGraphic =
    spec.renderingMode === "full_graphic_generation" ||
    slide.renderingMode === "full_graphic_generation";

  if (!isFullGraphic) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.fillRect(0, 0, width, height);
    drawTextOverlays(
      ctx,
      slide.textBlocks?.filter((block) => slideshowText(block)) ?? [],
      { width, height }
    );
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not render slide")),
      options.mimeType ?? "image/png",
      options.quality ?? 0.92
    );
  });
}

export async function renderSlideshowToBlobs(
  spec: CanonicalSlideshowSpec,
  options: RenderOptions = {}
) {
  return await Promise.all(
    activeSlides(spec).map((slide) => renderSlideToBlob(slide, spec, options))
  );
}
