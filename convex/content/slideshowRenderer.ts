import { escapeXml, wrapText } from "../lib/text";
import { TIKTOK_SANS_FONT_FACE } from "./fonts/tiktokSans";
import type { SlideshowSlide, SlideshowTextBlock } from "./types";

const TIKTOK_FONT_STACK = "'TikTok Sans', 'Arial Black', Impact, sans-serif";

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

type TextStyle = {
  size: number;
  weight: number;
  opacity: number;
  maxChars: number;
  tracking: number;
};

type RenderedBlock = {
  block: SlideshowTextBlock;
  lines: string[];
  style: TextStyle;
};

function styleForBlock(block: SlideshowTextBlock, width: number, maxTextWidth: number): TextStyle {
  const charsForWidth = (base: number) => Math.max(10, Math.floor(base * (maxTextWidth / width)));
  if (block.role === "eyebrow") {
    return {
      size: Math.round(width * 0.028),
      weight: 800,
      opacity: 1,
      maxChars: charsForWidth(28),
      tracking: Math.round(width * 0.003),
    };
  }
  if (block.role === "headline" || block.role === "cta") {
    return {
      size: Math.round(width * 0.074),
      weight: 900,
      opacity: 1,
      maxChars: charsForWidth(24),
      tracking: -1,
    };
  }
  if (block.role === "bullet_list") {
    return {
      size: Math.round(width * 0.041),
      weight: 800,
      opacity: 1,
      maxChars: charsForWidth(29),
      tracking: 0,
    };
  }
  return {
    size: Math.round(width * 0.039),
    weight: 700,
    opacity: 1,
    maxChars: charsForWidth(33),
    tracking: 0,
  };
}

function blockLines(block: SlideshowTextBlock, width: number, maxTextWidth: number) {
  const style = styleForBlock(block, width, maxTextWidth);
  if (block.role === "bullet_list") {
    return block.items.length
      ? block.items.flatMap((item) => wrapText(`• ${item}`, style.maxChars))
      : wrapText(block.text, style.maxChars);
  }

  return wrapText(block.text, style.maxChars);
}

function renderTextBlock(item: RenderedBlock, args: {
  width: number;
  x: number;
  y: number;
}) {
  const { block, lines, style } = item;
  const tspans = lines.map((line, index) =>
    `<tspan x="${args.x}" dy="${index === 0 ? 0 : style.size * 1.12}">${escapeXml(line)}</tspan>`
  ).join("");
  const shadow = block.role === "headline" || block.role === "cta"
    ? `paint-order="stroke" stroke="#050505" stroke-width="${Math.max(8, Math.round(args.width * 0.009))}" stroke-linejoin="round"`
    : `paint-order="stroke" stroke="#050505" stroke-width="${Math.max(5, Math.round(args.width * 0.005))}" stroke-linejoin="round"`;

  return {
    svg: `<text x="${args.x}" y="${args.y}" fill="#ffffff" opacity="${style.opacity}" font-family="${TIKTOK_FONT_STACK}" font-size="${style.size}" font-weight="${style.weight}" letter-spacing="${style.tracking}" text-anchor="middle" ${shadow}>${tspans}</text>`,
    height: Math.max(lines.length, 1) * style.size * 1.18,
  };
}

function textBlockHeight(item: Pick<RenderedBlock, "lines" | "style">) {
  return Math.max(item.lines.length, 1) * item.style.size * 1.2;
}

function totalBlocksHeight(blocks: RenderedBlock[], height: number) {
  const gap = Math.round(height * 0.018);
  return blocks.reduce((total, item, index) =>
    total + textBlockHeight(item) + (index < blocks.length - 1 ? gap : 0),
  0);
}

function fitBlocksToSafeArea(blocks: RenderedBlock[], height: number, maxHeight: number) {
  const currentHeight = totalBlocksHeight(blocks, height);
  if (currentHeight <= maxHeight) return blocks;

  const scale = Math.max(0.35, Math.min(1, maxHeight / currentHeight));
  return blocks.map((item) => ({
    ...item,
    style: {
      ...item.style,
      size: Math.max(16, Math.round(item.style.size * scale)),
      tracking: Math.round(item.style.tracking * scale),
    },
  }));
}

export function renderSlideSvg(args: {
  dimensions: { width: number; height: number };
  backgroundImageDataUri?: string;
  slide: SlideshowSlide;
}): string {
  const { width, height } = args.dimensions;
  const safeTop = Math.round(height * 0.09);
  const safeBottom = Math.round(height * 0.16);
  const maxContentWidth = Math.round(width * 0.78);
  const maxContentHeight = height - safeTop - safeBottom;
  const textCenterX = Math.round(width / 2);
  const blocks = args.slide.textBlocks
    .filter((block) => block.role !== "eyebrow")
    .filter((block) => block.text || block.items.length);
  const sizeScale = args.slide.layout.density === "sparse"
    ? 1.08
    : args.slide.layout.density === "dense"
      ? 0.88
      : 1;
  const renderedBlocks = fitBlocksToSafeArea(blocks.map((block) => ({
    block,
    lines: blockLines(block, width, maxContentWidth),
    style: {
      ...styleForBlock(block, width, maxContentWidth),
      size: Math.round(styleForBlock(block, width, maxContentWidth).size * sizeScale),
    },
  })), height, maxContentHeight);
  const totalTextHeight = totalBlocksHeight(renderedBlocks, height);
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
  const scrim = args.slide.layout.contrast === "gradient_scrim"
      ? `<linearGradient id="textScrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="${textZone === "bottom" ? 0 : 0.34}" />
          <stop offset="45%" stop-color="#000000" stop-opacity="${textZone === "center" ? 0.18 : 0.06}" />
          <stop offset="100%" stop-color="#000000" stop-opacity="${textZone === "bottom" ? 0.5 : 0}" />
        </linearGradient>
        <rect width="${width}" height="${height}" fill="url(#textScrim)" />`
      : "";

  let cursorY = contentY;
  const textSvg = renderedBlocks.map((item) => {
    const rendered = renderTextBlock(item, {
      width,
      x: textCenterX,
      y: cursorY + item.style.size,
    });
    cursorY += rendered.height + Math.round(height * 0.018);
    return rendered.svg;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(args.slide.role)} slide">
    <defs>
      <style type="text/css">${TIKTOK_SANS_FONT_FACE}</style>
      <clipPath id="safeContent"><rect x="${Math.round((width - maxContentWidth) / 2)}" y="${safeTop}" width="${maxContentWidth}" height="${height - safeTop - safeBottom}" /></clipPath>
    </defs>
    ${background}
    <rect width="${width}" height="${height}" fill="#050505" opacity="${args.backgroundImageDataUri ? 0.04 : 0}" />
    ${scrim}
    <g clip-path="url(#safeContent)">
      ${textSvg}
    </g>
  </svg>`;
}
