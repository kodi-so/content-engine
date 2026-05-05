import { escapeXml, wrapText } from "../lib/text";
import type { SlideshowSlide, SlideshowTextBlock } from "./types";

export function getSlideDimensions(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  if (aspectRatio === "4:5") return { width: 1080, height: 1350 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 };
}

export async function fetchImageDataUri(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;

  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;

    const contentType = response.headers.get("content-type") ?? "image/png";
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const chunkSize = 8192;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
    }

    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return undefined;
  }
}

function styleForBlock(block: SlideshowTextBlock, width: number) {
  if (block.role === "eyebrow") {
    return {
      size: Math.round(width * 0.033),
      weight: 800,
      opacity: 0.78,
      maxChars: 28,
      tracking: Math.round(width * 0.003),
    };
  }
  if (block.role === "headline" || block.role === "cta") {
    return {
      size: Math.round(width * 0.081),
      weight: 900,
      opacity: 1,
      maxChars: 20,
      tracking: -1,
    };
  }
  if (block.role === "bullet_list") {
    return {
      size: Math.round(width * 0.045),
      weight: 800,
      opacity: 0.95,
      maxChars: 30,
      tracking: 0,
    };
  }
  return {
    size: Math.round(width * 0.043),
    weight: 700,
    opacity: block.emphasis === "muted" ? 0.72 : 0.9,
    maxChars: 34,
    tracking: 0,
  };
}

function blockLines(block: SlideshowTextBlock, width: number) {
  const style = styleForBlock(block, width);
  if (block.role === "bullet_list") {
    return block.items.length
      ? block.items.flatMap((item) => wrapText(`• ${item}`, style.maxChars).slice(0, 2))
      : wrapText(block.text, style.maxChars).slice(0, 4);
  }

  const maxLines = block.role === "headline" || block.role === "cta" ? 3 : 2;
  return wrapText(block.text, style.maxChars).slice(0, maxLines);
}

function renderTextBlock(block: SlideshowTextBlock, args: {
  width: number;
  x: number;
  y: number;
}) {
  const style = styleForBlock(block, args.width);
  const lines = blockLines(block, args.width);
  const tspans = lines.map((line, index) =>
    `<tspan x="${args.x}" dy="${index === 0 ? 0 : style.size * 1.12}">${escapeXml(line)}</tspan>`
  ).join("");
  const shadow = block.role === "headline" || block.role === "cta"
    ? `paint-order="stroke" stroke="#050505" stroke-width="${Math.max(7, Math.round(args.width * 0.008))}" stroke-linejoin="round"`
    : `paint-order="stroke" stroke="#050505" stroke-width="${Math.max(4, Math.round(args.width * 0.004))}" stroke-linejoin="round"`;

  return {
    svg: `<text x="${args.x}" y="${args.y}" fill="#ffffff" opacity="${style.opacity}" font-family="'Arial Black', Impact, sans-serif" font-size="${style.size}" font-weight="${style.weight}" letter-spacing="${style.tracking}" ${shadow}>${tspans}</text>`,
    height: Math.max(lines.length, 1) * style.size * 1.18,
  };
}

export function renderSlideSvg(args: {
  dimensions: { width: number; height: number };
  backgroundImageDataUri?: string;
  slide: SlideshowSlide;
}): string {
  const { width, height } = args.dimensions;
  const marginX = Math.round(width * 0.075);
  const safeTop = Math.round(height * 0.09);
  const safeBottom = Math.round(height * 0.16);
  const maxContentWidth = width - marginX * 2;
  const blocks = args.slide.textBlocks.slice(0, 4);
  const renderedBlocks = blocks.map((block) => ({
    block,
    lines: blockLines(block, width),
    style: styleForBlock(block, width),
  }));
  const totalTextHeight = renderedBlocks.reduce((total, item) =>
    total + Math.max(item.lines.length, 1) * item.style.size * 1.2 + Math.round(height * 0.018),
  0);
  const textZone = args.slide.layout.textZone;
  const contentY = textZone === "center"
    ? Math.round((height - totalTextHeight) / 2)
    : textZone === "top"
      ? safeTop
      : height - safeBottom - totalTextHeight;
  const background = args.backgroundImageDataUri
    ? `<image href="${args.backgroundImageDataUri}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />`
    : `<linearGradient id="fallbackBackground" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#080808" />
        <stop offset="54%" stop-color="#161616" />
        <stop offset="100%" stop-color="#303030" />
      </linearGradient>
      <rect width="${width}" height="${height}" fill="url(#fallbackBackground)" />`;
  const scrim = args.slide.layout.contrast === "solid_scrim"
    ? `<rect x="${Math.round(width * 0.045)}" y="${Math.max(safeTop / 2, contentY - Math.round(height * 0.035))}" width="${Math.round(width * 0.91)}" height="${Math.min(height - safeTop - safeBottom, totalTextHeight + Math.round(height * 0.07))}" rx="${Math.round(width * 0.035)}" fill="#000000" opacity="0.54" />`
    : args.slide.layout.contrast === "gradient_scrim"
      ? `<linearGradient id="textScrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="${textZone === "bottom" ? 0 : 0.62}" />
          <stop offset="45%" stop-color="#000000" stop-opacity="${textZone === "center" ? 0.46 : 0.12}" />
          <stop offset="100%" stop-color="#000000" stop-opacity="${textZone === "bottom" ? 0.82 : 0}" />
        </linearGradient>
        <rect width="${width}" height="${height}" fill="url(#textScrim)" />`
      : "";

  let cursorY = contentY;
  const textSvg = renderedBlocks.map((item) => {
    const rendered = renderTextBlock(item.block, {
      width,
      x: marginX,
      y: cursorY + item.style.size,
    });
    cursorY += rendered.height + Math.round(height * 0.018);
    return rendered.svg;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(args.slide.role)} slide">
    <defs>
      <clipPath id="safeContent"><rect x="${marginX}" y="${safeTop}" width="${maxContentWidth}" height="${height - safeTop - safeBottom}" /></clipPath>
    </defs>
    ${background}
    <rect width="${width}" height="${height}" fill="#050505" opacity="${args.backgroundImageDataUri ? 0.08 : 0}" />
    ${scrim}
    <g clip-path="url(#safeContent)">
      ${textSvg}
    </g>
  </svg>`;
}
