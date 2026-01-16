// Shared text styles for slides - used by both preview and canvas export
// This ensures consistency between what users see and what they download

export const TEXT_STYLES = {
  fontFamily: '"TikTok Display", system-ui, sans-serif',
  fontWeight: 700,
  fontColor: "#ffffff",
  textAlign: "center" as const,
  strokeColor: "rgb(0, 0, 0)",
  lineHeight: 1.2,

  // Text stroke/shadow offset scales with display size
  getStrokeOffset: (displayWidth: number) => {
    // At 275px preview width, offset is 0.714286px
    return (0.714286 / 275) * displayWidth;
  },

  // CSS text-shadow string for React components (4-corner outline effect)
  getTextShadow: (displayWidth: number) => {
    const offset = TEXT_STYLES.getStrokeOffset(displayWidth);
    return `rgb(0, 0, 0) ${-offset}px ${-offset}px 0px, rgb(0, 0, 0) ${offset}px ${-offset}px 0px, rgb(0, 0, 0) ${-offset}px ${offset}px 0px, rgb(0, 0, 0) ${offset}px ${offset}px 0px`;
  },
};

// Default config values
export const DEFAULT_CONFIG = {
  fontSize: 48,
  textPosition: { x: 50, y: 50 },
  textSize: { width: 80, height: 25 }, // Default text box size (percentage of slide)
  aspectRatio: "4:5" as const,
};

// Canvas export size (1080p base)
export const EXPORT_BASE_SIZE = 1080;

// Preview display width
export const PREVIEW_SLIDE_WIDTH = 275;

// Get scaled font size for preview (preview is smaller than export)
export const getPreviewFontSize = (fontSize: number) => {
  return fontSize * (PREVIEW_SLIDE_WIDTH / EXPORT_BASE_SIZE);
};

// Get dimensions for aspect ratio
export const getDimensions = (aspectRatio: string, baseWidth: number) => {
  let height = baseWidth;

  if (aspectRatio === "4:5") {
    height = baseWidth * (5 / 4);
  } else if (aspectRatio === "9:16") {
    height = baseWidth * (16 / 9);
  }

  return { width: baseWidth, height };
};
