import type { CanonicalSlideshowSlide, CanonicalSlideshowSpec, SlideshowTextBlock } from "../types";

type RenderOptions = {
  mimeType?: "image/png" | "image/webp" | "image/jpeg";
  quality?: number;
};

function activeSlides(spec: CanonicalSlideshowSpec) {
  return [...(spec.slides ?? [])]
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

function blockText(block: SlideshowTextBlock) {
  if (block.text?.trim()) return block.text.trim();
  return block.items?.filter(Boolean).join("\n") ?? "";
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

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  strokeWidth: number
) {
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.86)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = Math.max(4, strokeWidth * 3);
  ctx.shadowOffsetY = Math.max(2, strokeWidth);
  ctx.fillText(text, x, y);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawTextBlocks(
  ctx: CanvasRenderingContext2D,
  slide: CanonicalSlideshowSlide,
  width: number,
  height: number
) {
  const blocks = slide.textBlocks?.filter((block) => blockText(block)) ?? [];
  if (!blocks.length) return;

  const maxWidth = width * 0.82;
  const renderedLines = blocks.flatMap((block) => {
    const isPrimary =
      block.emphasis === "primary" ||
      block.role === "headline" ||
      block.role === "cta";
    const fontSize = isPrimary ? Math.round(height * 0.055) : Math.round(height * 0.024);
    ctx.font = `800 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const lines = wrapText(ctx, blockText(block), maxWidth);
    return lines.map((line) => ({
      line,
      fontSize,
      lineHeight: Math.round(fontSize * 1.12),
      strokeWidth: isPrimary ? Math.max(3, Math.round(fontSize * 0.055)) : Math.max(2, Math.round(fontSize * 0.05)),
    }));
  });

  const totalHeight = renderedLines.reduce((sum, line) => sum + line.lineHeight, 0);
  const textZone = slide.layout?.textZone;
  let y = height / 2 - totalHeight / 2;
  if (textZone === "top") y = height * 0.14;
  if (textZone === "bottom") y = height * 0.86 - totalHeight;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const line of renderedLines) {
    ctx.font = `800 ${line.fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    drawOutlinedText(ctx, line.line, width / 2, y, line.strokeWidth);
    y += line.lineHeight;
  }
}

export async function renderSlideToBlob(
  slide: CanonicalSlideshowSlide,
  spec: CanonicalSlideshowSpec,
  options: RenderOptions = {}
): Promise<Blob> {
  const width = spec.dimensions?.width ?? slide.dimensions?.width ?? 1080;
  const height = spec.dimensions?.height ?? slide.dimensions?.height ?? 1920;
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
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fillRect(0, 0, width, height);
  drawTextBlocks(ctx, slide, width, height);

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
