import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
} from "../types";
import {
  COMPOSITION_ASPECT_RATIO_OPTIONS,
  cssAspectRatio,
  dimensionsForAspectRatio,
  isCompositionAspectRatio,
  type CompositionAspectRatio,
} from "./composition/aspectRatios";
export {
  TEXT_OVERLAY_FONT_FAMILY as SLIDESHOW_FONT_FAMILY,
  estimateTextOverlayBlockHeight as estimateSlideshowTextBlockHeight,
  hexToRgba,
  textOverlayBlockFrame as slideshowTextBlockFrame,
  textOverlayFontSize as slideshowTextFontSize,
  textOverlayFontWeight as slideshowTextFontWeight,
  textOverlayShadow as slideshowTextShadow,
  textOverlayText as slideshowText,
} from "./composition/textOverlays";

export type SlideshowAspectRatio = Extract<CompositionAspectRatio, "9:16" | "4:5" | "1:1">;

export const SLIDESHOW_ASPECT_RATIO_OPTIONS: Array<{
  value: SlideshowAspectRatio;
  label: string;
  description: string;
}> = COMPOSITION_ASPECT_RATIO_OPTIONS.filter(
  (option): option is { value: SlideshowAspectRatio; label: string; description: string } =>
    option.value !== "16:9"
);

export function isSlideshowAspectRatio(value: string): value is SlideshowAspectRatio {
  return isCompositionAspectRatio(value) && value !== "16:9";
}

export function slideshowDimensionsForAspectRatio(
  aspectRatio: string | undefined
): { width: number; height: number } {
  return dimensionsForAspectRatio(aspectRatio);
}

export function slideshowAspectRatioForSpec(
  spec?: CanonicalSlideshowSpec
): SlideshowAspectRatio {
  const aspectRatio = spec?.aspectRatio;
  return isSlideshowAspectRatio(aspectRatio ?? "")
    ? aspectRatio as SlideshowAspectRatio
    : "9:16";
}

export function slideshowDimensionsForSpec(
  spec?: CanonicalSlideshowSpec,
  slide?: CanonicalSlideshowSlide
) {
  return spec?.dimensions ??
    slide?.dimensions ??
    slideshowDimensionsForAspectRatio(spec?.aspectRatio);
}

export function slideshowCssAspectRatio(dimensions: { width: number; height: number }) {
  return cssAspectRatio(dimensions);
}
