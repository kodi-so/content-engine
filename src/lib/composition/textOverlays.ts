import type { SlideshowTextBlock } from "../../types";

export type TextOverlayBlock = SlideshowTextBlock;

export type TextStylePreset =
  | "outline"
  | "white"
  | "black"
  | "yellow"
  | "white_background"
  | "white_50_background";

export const TEXT_OVERLAY_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function textOverlayText(block: TextOverlayBlock | undefined, trim = true) {
  if (!block) return "";
  const text = block.text !== undefined
    ? block.text
    : block.items?.filter(Boolean).join("\n") ?? "";
  return trim ? text.trim() : text;
}

export function createTextOverlayBlock(index: number): TextOverlayBlock {
  return {
    id: `text-${Date.now()}-${index + 1}`,
    role: index === 0 ? "headline" : "body",
    text: index === 0 ? "New headline" : "New text",
    items: [],
    emphasis: index === 0 ? "primary" : "secondary",
    x: 10,
    y: index === 0 ? 42 : 56,
    width: 80,
    height: index === 0 ? 14 : 10,
    align: "center",
    fontSize: index === 0 ? 72 : 44,
    fontWeight: index === 0 ? 850 : 760,
    color: "#FFFFFF",
    strokeColor: "#111111",
    strokeWidth: index === 0 ? 8 : 5,
    backgroundStyle: "none",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
  };
}

export function hexToRgba(hex: string, alpha: number) {
  const match = hex.match(/^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (!match) return hex;
  const [, red, green, blue] = match;
  return `rgba(${parseInt(red, 16)}, ${parseInt(green, 16)}, ${parseInt(blue, 16)}, ${alpha})`;
}

export function textOverlayShadow(block: TextOverlayBlock) {
  const strokeWidth = block.strokeWidth ?? 0;
  if (strokeWidth <= 0) return "none";
  const strokeColor = block.strokeColor ?? "#111111";
  const softShadow = `0 ${Math.max(1, strokeWidth * 0.18)}px ${Math.max(4, strokeWidth * 0.75)}px rgba(0,0,0,0.45)`;
  return [
    `${strokeWidth * 0.06}px 0 0 ${strokeColor}`,
    `-${strokeWidth * 0.06}px 0 0 ${strokeColor}`,
    `0 ${strokeWidth * 0.06}px 0 ${strokeColor}`,
    `0 -${strokeWidth * 0.06}px 0 ${strokeColor}`,
    softShadow,
  ].join(", ");
}

export function textOverlayBlockFrame(
  block: TextOverlayBlock,
  dimensions: { width: number; height: number }
) {
  const x = Math.max(0, Math.min(100, block.x ?? 10));
  const y = Math.max(0, Math.min(100, block.y ?? 42));
  const width = Math.max(12, Math.min(100 - x, block.width ?? 80));
  const height = Math.max(4, Math.min(100 - y, block.height ?? 10));

  return {
    x: dimensions.width * (x / 100),
    y: dimensions.height * (y / 100),
    width: dimensions.width * (width / 100),
    minHeight: dimensions.height * (height / 100),
  };
}

export function textOverlayFontSize(block: TextOverlayBlock, index = 0) {
  const fallback = index === 0 || block.emphasis === "primary" || block.role === "headline"
    ? 72
    : 44;
  return Math.max(20, block.fontSize ?? fallback);
}

export function textOverlayFontWeight(block: TextOverlayBlock, index = 0) {
  const fallback = index === 0 || block.emphasis === "primary" || block.role === "headline"
    ? 850
    : 760;
  return Math.round(block.fontWeight ?? fallback);
}

export function estimateTextOverlayBlockHeight(
  block: TextOverlayBlock,
  dimensions: { width: number; height: number },
  index = 0
) {
  const fontSize = textOverlayFontSize(block, index);
  const frame = textOverlayBlockFrame(block, dimensions);
  const averageCharacterWidth = fontSize * 0.54;
  const charactersPerLine = Math.max(1, Math.floor(frame.width / averageCharacterWidth));
  const text = textOverlayText(block, false) || " ";
  const lineCount = text.split("\n").reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / charactersPerLine));
  }, 0);
  const strokeAllowance = Math.max(0, block.strokeWidth ?? 0) * 0.4;
  const contentHeightPx = lineCount * fontSize * 1.08 + fontSize * 0.16 + strokeAllowance;
  return Math.max(4, (contentHeightPx / dimensions.height) * 100);
}

export function withAutoTextOverlayBlockHeight(
  block: TextOverlayBlock,
  dimensions: { width: number; height: number },
  index = 0
) {
  const estimatedHeight = estimateTextOverlayBlockHeight(block, dimensions, index);
  const maxHeight = Math.max(4, 100 - (block.y ?? 0));

  return {
    ...block,
    height: Math.min(maxHeight, Math.max(block.height ?? 4, estimatedHeight)),
  };
}

export function applyTextStylePreset(
  block: TextOverlayBlock,
  preset: TextStylePreset
): TextOverlayBlock {
  switch (preset) {
    case "outline":
      return {
        ...block,
        color: "#FFFFFF",
        strokeColor: "#111111",
        strokeWidth: Math.max(block.strokeWidth ?? 0, 8),
        backgroundStyle: "none",
        backgroundOpacity: 0,
      };
    case "white":
      return {
        ...block,
        color: "#FFFFFF",
        strokeWidth: 0,
        backgroundStyle: "none",
        backgroundOpacity: 0,
      };
    case "black":
      return {
        ...block,
        color: "#111111",
        strokeWidth: 0,
        backgroundStyle: "none",
        backgroundOpacity: 0,
      };
    case "yellow":
      return {
        ...block,
        color: "#FFE45C",
        strokeColor: "#111111",
        strokeWidth: Math.max(block.strokeWidth ?? 0, 5),
        backgroundStyle: "none",
        backgroundOpacity: 0,
      };
    case "white_background":
      return {
        ...block,
        color: "#111111",
        strokeWidth: 0,
        backgroundStyle: "solid",
        backgroundColor: "#FFFFFF",
        backgroundOpacity: 1,
      };
    case "white_50_background":
      return {
        ...block,
        color: "#111111",
        strokeWidth: 0,
        backgroundStyle: "solid",
        backgroundColor: "#FFFFFF",
        backgroundOpacity: 0.5,
      };
  }
}

export function textStylePresetForBlock(block: TextOverlayBlock): TextStylePreset {
  if (block.backgroundStyle === "solid" && (block.backgroundOpacity ?? 1) < 0.75) {
    return "white_50_background";
  }
  if (block.backgroundStyle === "solid") return "white_background";
  if ((block.color ?? "").toUpperCase() === "#FFE45C") return "yellow";
  if ((block.color ?? "").toUpperCase() === "#111111" && (block.strokeWidth ?? 0) === 0) {
    return "black";
  }
  if ((block.strokeWidth ?? 0) === 0) return "white";
  return "outline";
}
