import {
  TEXT_STYLES,
  DEFAULT_CONFIG,
  EXPORT_BASE_SIZE,
  getDimensions,
} from "./styles";
import { TextElement, Slide } from "./types";

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function sanitizeForFilename(text: string): string {
  return text.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

export function extractSlideCountFromPrompt(prompt: string): number {
  const slideCountMatch = prompt.match(/(\d+)\s+slides?/i);
  return slideCountMatch ? parseInt(slideCountMatch[1]) : 5;
}

export function clampSlideCount(count: number): number {
  return Math.max(3, Math.min(10, count));
}

// Canvas rendering for slide export
interface ConfigData {
  aspectRatio?: string;
}

/**
 * Ensure TikTok Display font is loaded before canvas rendering
 * This is critical for accurate text measurement and wrapping
 */
async function ensureFontLoaded(): Promise<void> {
  // Check if the Font Loading API is available
  if (!document.fonts) {
    console.warn("Font Loading API not available");
    return;
  }

  // Try to load the font with the weight we use (700 = bold)
  try {
    await document.fonts.load('700 48px "TikTok Display"');

    // Force the font to be used by rendering to an off-screen canvas
    // This ensures the font is actually available for measureText()
    const testCanvas = document.createElement("canvas");
    const testCtx = testCanvas.getContext("2d")!;
    testCtx.font = '700 48px "TikTok Display"';
    testCtx.fillText("Test", 0, 0);

    // Small delay to ensure font is fully rendered
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify font is loaded
    document.fonts.check('700 48px "TikTok Display"');
  } catch (e) {
    console.warn("TikTok Display font could not be loaded:", e);
  }
}

/**
 * Render a single text element to the canvas
 */
function renderTextElement(
  ctx: CanvasRenderingContext2D,
  element: TextElement,
  canvasWidth: number,
  canvasHeight: number
) {
  const fontSize = element.fontSize;
  const fontColor = element.fontColor || "#ffffff";
  const fontWeight = element.fontWeight || 700;
  const textAlign = element.textAlign || "center";
  const maxWidthPercent = TEXT_STYLES.maxWidthPercent;

  // Calculate position in pixels
  const x = (element.position.x / 100) * canvasWidth;
  const y = (element.position.y / 100) * canvasHeight;
  const maxWidth = (maxWidthPercent / 100) * canvasWidth;

  // Set font - must match TEXT_STYLES.fontFamily
  ctx.font = `${fontWeight} ${fontSize}px ${TEXT_STYLES.fontFamily}`;
  ctx.textAlign = textAlign;
  ctx.textBaseline = "middle";

  const strokeOffset = TEXT_STYLES.getStrokeOffset(canvasWidth);

  // Helper to draw text with stroke effect
  const drawTextWithStroke = (text: string, drawX: number, drawY: number) => {
    ctx.fillStyle = TEXT_STYLES.strokeColor;
    ctx.fillText(text, drawX - strokeOffset, drawY - strokeOffset);
    ctx.fillText(text, drawX + strokeOffset, drawY - strokeOffset);
    ctx.fillText(text, drawX - strokeOffset, drawY + strokeOffset);
    ctx.fillText(text, drawX + strokeOffset, drawY + strokeOffset);
    ctx.fillStyle = fontColor;
    ctx.fillText(text, drawX, drawY);
  };

  // Word wrap text
  const wrapText = (text: string): string[] => {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  };

  const lines = wrapText(element.content);
  const lineHeight = fontSize * TEXT_STYLES.lineHeight;
  const totalHeight = lines.length * lineHeight;
  const startY = y - totalHeight / 2 + lineHeight / 2;

  lines.forEach((line, index) => {
    drawTextWithStroke(line, x, startY + index * lineHeight);
  });
}

export async function renderSlideToCanvas(
  slide: Slide,
  config: ConfigData
): Promise<Blob> {
  // Ensure font is loaded before rendering
  await ensureFontLoaded();

  const aspectRatio = config.aspectRatio || DEFAULT_CONFIG.aspectRatio;

  // Get canvas dimensions
  const { width, height } = getDimensions(aspectRatio, EXPORT_BASE_SIZE);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Load and draw background image
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = slide.imageUrl;
  });

  // Draw image to cover canvas (center crop)
  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;
  let drawWidth, drawHeight, drawX, drawY;

  if (imgRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = img.width * (height / img.height);
    drawX = (width - drawWidth) / 2;
    drawY = 0;
  } else {
    drawWidth = width;
    drawHeight = img.height * (width / img.width);
    drawX = 0;
    drawY = (height - drawHeight) / 2;
  }

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

  // Draw overlay if enabled
  if (slide.overlay) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, width, height);
  }

  // Render each text element
  if (slide.textElements) {
    for (const element of slide.textElements) {
      renderTextElement(ctx, element, width, height);
    }
  }

  // Convert canvas to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

/**
 * Render a slide to WebP base64 data URI
 * Used for TikTok posting - renders the fully composed slide with text overlay
 */
export async function renderSlideToWebPBase64(
  slide: Slide,
  config: ConfigData
): Promise<string> {
  // Ensure font is loaded before rendering
  await ensureFontLoaded();

  const aspectRatio = config.aspectRatio || DEFAULT_CONFIG.aspectRatio;

  // Get canvas dimensions
  const { width, height } = getDimensions(aspectRatio, EXPORT_BASE_SIZE);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Load and draw background image
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = slide.imageUrl;
  });

  // Draw image to cover canvas (center crop)
  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;
  let drawWidth, drawHeight, drawX, drawY;

  if (imgRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = img.width * (height / img.height);
    drawX = (width - drawWidth) / 2;
    drawY = 0;
  } else {
    drawWidth = width;
    drawHeight = img.height * (width / img.width);
    drawX = 0;
    drawY = (height - drawHeight) / 2;
  }

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

  // Draw overlay if enabled
  if (slide.overlay) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, width, height);
  }

  // Render each text element
  if (slide.textElements) {
    for (const element of slide.textElements) {
      renderTextElement(ctx, element, width, height);
    }
  }

  // Convert canvas to WebP base64 data URI
  // Quality 0.9 gives good balance of size and quality
  return canvas.toDataURL("image/webp", 0.9);
}

/**
 * Render all slides to WebP base64 for TikTok posting
 */
export async function renderSlidesToWebPBase64(
  slides: Slide[],
  config: ConfigData
): Promise<string[]> {
  const renderedSlides = await Promise.all(
    slides.map((slide) => renderSlideToWebPBase64(slide, config))
  );
  return renderedSlides;
}
