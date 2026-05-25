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
  strokeWidth: number,
  fillColor: string,
  strokeColor: string
) {
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  if (strokeWidth > 0) ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = Math.max(4, strokeWidth * 3);
  ctx.shadowOffsetY = Math.max(2, strokeWidth);
  ctx.fillText(text, x, y);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
  ctx.fill();
}

function drawTextBlocks(
  ctx: CanvasRenderingContext2D,
  slide: CanonicalSlideshowSlide,
  width: number,
  height: number
) {
  const blocks = slide.textBlocks?.filter((block) => blockText(block)) ?? [];
  if (!blocks.length) return;

  ctx.textBaseline = "top";
  blocks.forEach((block, index) => {
    const isPrimary =
      block.emphasis === "primary" ||
      block.role === "headline" ||
      block.role === "cta" ||
      index === 0;
    const fontSize = Math.round(block.fontSize ?? (isPrimary ? height * 0.055 : height * 0.024));
    const fontWeight = Math.round(block.fontWeight ?? (isPrimary ? 800 : 700));
    const maxWidth = width * ((block.width ?? 82) / 100);
    const x = width * ((block.x ?? 9) / 100);
    let y = height * ((block.y ?? (slide.layout?.textZone === "top" ? 14 : slide.layout?.textZone === "bottom" ? 76 : 44)) / 100);
    const lineHeight = Math.round(fontSize * 1.12);

    ctx.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const lines = wrapText(ctx, blockText(block), maxWidth);
    ctx.textAlign = block.align ?? "center";
    const textX = block.align === "left"
      ? x
      : block.align === "right"
        ? x + maxWidth
        : x + maxWidth / 2;
    for (const line of lines) {
      const measuredWidth = ctx.measureText(line).width;
      if (block.backgroundStyle === "solid") {
        const paddingX = Math.round(fontSize * 0.48);
        const paddingY = Math.round(fontSize * 0.16);
        const backgroundX = block.align === "left"
          ? textX - paddingX
          : block.align === "right"
            ? textX - measuredWidth - paddingX
            : textX - measuredWidth / 2 - paddingX;
        ctx.fillStyle = block.backgroundColor ?? "#FFFFFF";
        ctx.globalAlpha = block.backgroundOpacity ?? 1;
        drawRoundedRect(
          ctx,
          backgroundX,
          y - paddingY,
          measuredWidth + paddingX * 2,
          lineHeight + paddingY * 2,
          Math.round(fontSize * 0.48)
        );
        ctx.globalAlpha = 1;
      }
      drawOutlinedText(
        ctx,
        line,
        textX,
        y,
        Math.round(block.strokeWidth ?? (isPrimary ? Math.max(3, fontSize * 0.055) : Math.max(2, fontSize * 0.05))),
        block.color ?? "#FFFFFF",
        block.strokeColor ?? "rgba(0, 0, 0, 0.86)"
      );
      y += lineHeight;
    }
  });
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
  const isFullGraphic =
    spec.renderingMode === "full_graphic_generation" ||
    slide.renderingMode === "full_graphic_generation";

  if (!isFullGraphic) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.fillRect(0, 0, width, height);
    drawTextBlocks(ctx, slide, width, height);
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
