export function getSlideDimensions(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  if (aspectRatio === "4:5") return { width: 1080, height: 1350 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 };
}
