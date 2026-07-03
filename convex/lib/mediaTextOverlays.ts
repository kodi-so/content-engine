export type MediaTextOverlayRole = "eyebrow" | "headline" | "body" | "bullet_list" | "cta";
export type MediaTextOverlayEmphasis = "primary" | "secondary" | "muted";
export type MediaTextOverlayAlign = "left" | "center" | "right";
export type MediaTextOverlayBackgroundStyle = "none" | "solid";

export type MediaTextOverlayBlock = {
  id: string;
  role: MediaTextOverlayRole;
  text: string;
  items: string[];
  emphasis: MediaTextOverlayEmphasis;
  x: number;
  y: number;
  width: number;
  height: number;
  align: MediaTextOverlayAlign;
  fontSize: number;
  fontWeight: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  backgroundStyle: MediaTextOverlayBackgroundStyle;
  backgroundColor: string;
  backgroundOpacity: number;
};

export type TimedMediaTextOverlayBlock = MediaTextOverlayBlock & {
  startSeconds: number;
  endSeconds?: number;
};

export function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = finiteNumber(value) ?? fallback;
  return Math.min(Math.max(number, min), max);
}

export function normalizeHexColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toUpperCase()
    : fallback;
}

export function textFromMediaOverlayInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const block = value as Record<string, unknown>;
  const text = optionalText(block.text);
  if (text) return text;

  if (Array.isArray(block.items)) {
    return block.items
      .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      .map((line) => line.trim())
      .join("\n");
  }

  return "";
}

export function normalizeMediaTextOverlayBlock(
  value: unknown,
  index: number,
  options: {
    defaultIdPrefix?: string;
    defaultText?: string;
  } = {}
): MediaTextOverlayBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const block = value as Record<string, unknown>;
  const text = textFromMediaOverlayInput(block).slice(0, 280);
  if (!text) return null;

  const role: MediaTextOverlayRole =
    block.role === "eyebrow" ||
    block.role === "headline" ||
    block.role === "body" ||
    block.role === "bullet_list" ||
    block.role === "cta"
      ? block.role
      : index === 0
        ? "headline"
        : "body";
  const emphasis: MediaTextOverlayEmphasis =
    block.emphasis === "primary" ||
    block.emphasis === "secondary" ||
    block.emphasis === "muted"
      ? block.emphasis
      : index === 0
        ? "primary"
        : "secondary";
  const backgroundStyle: MediaTextOverlayBackgroundStyle =
    block.backgroundStyle === "solid" ? "solid" : "none";
  const x = clampNumber(block.x, 10, 0, 96);
  const y = clampNumber(block.y, index === 0 ? 42 : 56, 0, 96);
  const width = clampNumber(block.width, 80, 12, 100 - x);
  const height = clampNumber(block.height, index === 0 ? 14 : 10, 4, 100 - y);

  return {
    id: optionalText(block.id)?.slice(0, 64) ??
      `${options.defaultIdPrefix ?? "text"}-${index + 1}`,
    role,
    text: text || options.defaultText || (index === 0 ? "New headline" : "New text"),
    items: [],
    emphasis,
    x,
    y,
    width,
    height,
    align: block.align === "left" || block.align === "right" ? block.align : "center",
    fontSize: clampNumber(block.fontSize, index === 0 ? 72 : 44, 20, 150),
    fontWeight: clampNumber(block.fontWeight, role === "body" ? 700 : 800, 400, 900),
    color: normalizeHexColor(block.color, "#FFFFFF"),
    strokeColor: normalizeHexColor(block.strokeColor, "#000000"),
    strokeWidth: clampNumber(block.strokeWidth, index === 0 ? 8 : 5, 0, 48),
    backgroundStyle,
    backgroundColor: backgroundStyle === "solid"
      ? normalizeHexColor(block.backgroundColor, "#FFFFFF")
      : "#000000",
    backgroundOpacity: backgroundStyle === "solid"
      ? clampNumber(block.backgroundOpacity, 1, 0, 1)
      : 0,
  };
}

export function normalizeMediaTextOverlayBlocks(
  value: unknown,
  options: { defaultIdPrefix?: string } = {}
) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeMediaTextOverlayBlock(item, index, options))
    .filter((block): block is MediaTextOverlayBlock => Boolean(block))
    .slice(0, 12);
}

export function normalizeTimedMediaTextOverlayBlock(
  value: unknown,
  index: number,
  totalDurationSeconds: number,
  options: { defaultIdPrefix?: string } = {}
): TimedMediaTextOverlayBlock | null {
  const block = normalizeMediaTextOverlayBlock(value, index, options);
  if (!block || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const safeDuration = Math.max(0.5, totalDurationSeconds);
  const startSeconds = clampNumber(record.startSeconds ?? record.start, 0, 0, safeDuration);
  const endCandidate = finiteNumber(record.endSeconds) ?? finiteNumber(record.end);
  const endSeconds = endCandidate === undefined
    ? undefined
    : clampNumber(endCandidate, safeDuration, startSeconds + 0.1, safeDuration);

  return {
    ...block,
    startSeconds,
    ...(endSeconds !== undefined ? { endSeconds } : {}),
  };
}
