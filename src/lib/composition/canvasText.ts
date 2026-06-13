import {
  TEXT_OVERLAY_FONT_FAMILY,
  textOverlayBlockFrame,
  textOverlayFontSize,
  textOverlayFontWeight,
  textOverlayText,
  type TextOverlayBlock,
} from "./textOverlays";

export function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
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

export function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number },
  width: number,
  height: number
) {
  const sourceWidth = image instanceof HTMLVideoElement
    ? image.videoWidth
    : image instanceof HTMLImageElement
      ? image.naturalWidth
      : image.width ?? width;
  const sourceHeight = image instanceof HTMLVideoElement
    ? image.videoHeight
    : image instanceof HTMLImageElement
      ? image.naturalHeight
      : image.height ?? height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
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

export function drawTextOverlays(
  ctx: CanvasRenderingContext2D,
  blocks: TextOverlayBlock[],
  dimensions: { width: number; height: number }
) {
  const visibleBlocks = blocks.filter((block) => textOverlayText(block));
  if (!visibleBlocks.length) return;

  ctx.textBaseline = "top";
  visibleBlocks.forEach((block, index) => {
    const fontSize = Math.round(textOverlayFontSize(block, index));
    const fontWeight = textOverlayFontWeight(block, index);
    const frame = textOverlayBlockFrame(block, dimensions);
    let y = frame.y;
    const lineHeight = Math.round(fontSize * 1.08);

    ctx.font = `${fontWeight} ${fontSize}px ${TEXT_OVERLAY_FONT_FAMILY}`;
    const lines = wrapCanvasText(ctx, textOverlayText(block), frame.width);
    ctx.textAlign = block.align ?? "center";
    const textX = block.align === "left"
      ? frame.x
      : block.align === "right"
        ? frame.x + frame.width
        : frame.x + frame.width / 2;
    for (const line of lines) {
      const measuredWidth = ctx.measureText(line).width;
      if (block.backgroundStyle === "solid") {
        const paddingX = Math.round(fontSize * 0.18);
        const paddingY = Math.round(fontSize * 0.08);
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
        Math.round(block.strokeWidth ?? 0),
        block.color ?? "#FFFFFF",
        block.strokeColor ?? "rgba(0, 0, 0, 0.86)"
      );
      y += lineHeight;
    }
  });
}
