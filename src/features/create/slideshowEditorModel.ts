import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SlideshowTextBlock,
} from "../../types";

export type TextStylePreset =
  | "outline"
  | "white"
  | "black"
  | "yellow"
  | "white_background"
  | "white_50_background";

export function activeSlides(spec: CanonicalSlideshowSpec) {
  return [...(spec.slides ?? [])]
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

export function blockText(block: SlideshowTextBlock | undefined) {
  if (!block) return "";
  return editableBlockText(block).trim();
}

export function editableBlockText(block: SlideshowTextBlock | undefined) {
  if (!block) return "";
  if (block.text !== undefined) return block.text;
  return block.items?.filter(Boolean).join("\n") ?? "";
}

export function withAutoTextBlockHeight(block: SlideshowTextBlock) {
  const fontSize = Math.max(20, block.fontSize ?? 72);
  const widthPercent = Math.max(12, block.width ?? 80);
  const textWidthPx = (widthPercent / 100) * 1080;
  const averageCharacterWidth = fontSize * 0.54;
  const charactersPerLine = Math.max(1, Math.floor(textWidthPx / averageCharacterWidth));
  const text = editableBlockText(block) || " ";
  const lineCount = text.split("\n").reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / charactersPerLine));
  }, 0);
  const strokeAllowance = Math.max(0, block.strokeWidth ?? 0) * 0.4;
  const contentHeightPx = lineCount * fontSize * 1.08 + fontSize * 0.16 + strokeAllowance;
  const estimatedHeight = Math.max(4, (contentHeightPx / 1920) * 100);
  const maxHeight = Math.max(4, 100 - (block.y ?? 0));

  return {
    ...block,
    height: Math.min(maxHeight, Math.max(block.height ?? 4, estimatedHeight)),
  };
}

export function createTextBlock(index: number): SlideshowTextBlock {
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

export function normalizedTextBlocks(slide: CanonicalSlideshowSlide) {
  const blocks = slide.textBlocks !== undefined
    ? slide.textBlocks
    : slide.visibleText
      ? [{ ...createTextBlock(0), text: slide.visibleText }]
      : [createTextBlock(0)];

  return blocks.map((block, index) =>
    withAutoTextBlockHeight({
      ...createTextBlock(index),
      ...block,
      id: block.id?.trim() || `text-${index + 1}`,
      text: block.text !== undefined
        ? block.text
        : blockText(block) || (index === 0 ? "New headline" : "New text"),
      items: [],
    })
  );
}

export function slideImagePrompt(slide: CanonicalSlideshowSlide) {
  return slide.finalImagePrompt ?? slide.backgroundPrompt ?? "";
}

export function textShadow(block: SlideshowTextBlock) {
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

export function hexToRgba(hex: string, alpha: number) {
  const match = hex.match(/^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (!match) return hex;
  const [, red, green, blue] = match;
  return `rgba(${parseInt(red, 16)}, ${parseInt(green, 16)}, ${parseInt(blue, 16)}, ${alpha})`;
}

export function applyPreset(
  block: SlideshowTextBlock,
  preset: TextStylePreset
): SlideshowTextBlock {
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

export function presetForBlock(block: SlideshowTextBlock): TextStylePreset {
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

export function selectedSlideWindow(
  slides: CanonicalSlideshowSlide[],
  selectedSlide: CanonicalSlideshowSlide
) {
  const selectedIndex = slides.findIndex((slide) => slide.slideId === selectedSlide.slideId);
  if (selectedIndex < 0) return [];
  const windowSize = Math.min(5, slides.length);
  const maxStart = Math.max(0, slides.length - windowSize);
  const start = Math.min(Math.max(0, selectedIndex - 2), maxStart);
  return slides.slice(start, start + windowSize);
}
