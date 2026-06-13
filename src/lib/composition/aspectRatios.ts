export type CompositionAspectRatio = "9:16" | "4:5" | "1:1" | "16:9";

export const COMPOSITION_ASPECT_RATIO_OPTIONS: Array<{
  value: CompositionAspectRatio;
  label: string;
  description: string;
}> = [
  { value: "9:16", label: "9:16", description: "TikTok, Reels, Shorts" },
  { value: "4:5", label: "4:5", description: "Portrait feed" },
  { value: "1:1", label: "1:1", description: "Square feed" },
  { value: "16:9", label: "16:9", description: "YouTube landscape" },
];

export function isCompositionAspectRatio(value: string): value is CompositionAspectRatio {
  return value === "9:16" || value === "4:5" || value === "1:1" || value === "16:9";
}

export function dimensionsForAspectRatio(
  aspectRatio: string | undefined
): { width: number; height: number } {
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  if (aspectRatio === "4:5") return { width: 1080, height: 1350 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 };
}

export function cssAspectRatio(dimensions: { width: number; height: number }) {
  return `${dimensions.width} / ${dimensions.height}`;
}
