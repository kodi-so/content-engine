import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SlideshowTextBlock,
} from "../../../types";
import {
  slideshowDimensionsForSpec,
  slideshowText,
} from "../../../lib/slideshowRendering";
import {
  applyTextStylePreset,
  createTextOverlayBlock,
  textStylePresetForBlock,
  type TextStylePreset,
  withAutoTextOverlayBlockHeight,
} from "../../../lib/composition/textOverlays";

export type { TextStylePreset };

export function activeSlides(spec: CanonicalSlideshowSpec) {
  return [...(spec.slides ?? [])]
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

export function blockText(block: SlideshowTextBlock | undefined) {
  return slideshowText(block);
}

export function editableBlockText(block: SlideshowTextBlock | undefined) {
  return slideshowText(block, false);
}

export function withAutoTextBlockHeight(
  block: SlideshowTextBlock,
  spec?: CanonicalSlideshowSpec,
  slide?: CanonicalSlideshowSlide,
  index = 0
) {
  const dimensions = slideshowDimensionsForSpec(spec, slide);
  return withAutoTextOverlayBlockHeight(block, dimensions, index);
}

export function createTextBlock(index: number): SlideshowTextBlock {
  return createTextOverlayBlock(index);
}

export function normalizedTextBlocks(
  slide: CanonicalSlideshowSlide,
  spec?: CanonicalSlideshowSpec
) {
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
    }, spec, slide, index)
  );
}

export function slideImagePrompt(slide: CanonicalSlideshowSlide) {
  return slide.finalImagePrompt ?? slide.backgroundPrompt ?? "";
}

export function applyPreset(
  block: SlideshowTextBlock,
  preset: TextStylePreset
): SlideshowTextBlock {
  return applyTextStylePreset(block, preset);
}

export function presetForBlock(block: SlideshowTextBlock): TextStylePreset {
  return textStylePresetForBlock(block);
}
