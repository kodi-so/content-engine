import { getSlideDimensions } from "./slideshowDimensions";
import type { SlideshowSlide, SlideshowTextBlock } from "./types";

type SlideRole = SlideshowSlide["role"];
type SlideLayout = SlideshowSlide["layout"];

const slideRoles: SlideRole[] = ["hook", "setup", "insight", "proof", "payoff", "cta"];
const textZones: SlideLayout["textZone"][] = ["top", "center", "bottom", "split"];
const contrasts: SlideLayout["contrast"][] = ["none", "shadow", "gradient_scrim", "solid_scrim"];
const densities: SlideLayout["density"][] = ["sparse", "medium", "dense"];

function normalizeSlideRole(value: unknown, fallback: SlideRole = "insight"): SlideRole {
  return typeof value === "string" && slideRoles.includes(value as SlideRole)
    ? value as SlideRole
    : fallback;
}

function normalizeLayout(value: unknown): SlideLayout {
  const layout = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const textZone = typeof layout.textZone === "string" && textZones.includes(layout.textZone as SlideLayout["textZone"])
    ? layout.textZone as SlideLayout["textZone"]
    : "center";
  const contrast = typeof layout.contrast === "string" && contrasts.includes(layout.contrast as SlideLayout["contrast"])
    ? layout.contrast as SlideLayout["contrast"]
    : "gradient_scrim";
  const density = typeof layout.density === "string" && densities.includes(layout.density as SlideLayout["density"])
    ? layout.density as SlideLayout["density"]
    : "medium";
  const intent = typeof layout.intent === "string" && layout.intent.trim()
    ? layout.intent.trim()
    : "Readable mobile social slide with clear text hierarchy.";

  return {
    intent,
    template: textZone === "center" ? "center_punch" : textZone === "top" ? "top_hook_bottom_body" : "bottom_stack",
    textZone,
    density,
    contrast,
    stylePreset: "dark_minimal_tiktok",
  };
}

function isTextBlock(value: unknown): value is SlideshowTextBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Record<string, unknown>;
  return (
    typeof block.role === "string" &&
    typeof block.text === "string" &&
    Array.isArray(block.items) &&
    typeof block.emphasis === "string"
  );
}

function textBlocksFromCopy(args: {
  role: SlideRole;
  headline?: string;
  body?: string;
}): SlideshowTextBlock[] {
  const blocks: SlideshowTextBlock[] = [];

  if (args.headline?.trim()) {
    blocks.push({
      role: args.role === "cta" ? "cta" : "headline",
      text: args.headline.trim(),
      items: [],
      emphasis: "primary",
    });
  }
  if (args.body?.trim()) {
    blocks.push({
      role: "body",
      text: args.body.trim(),
      items: [],
      emphasis: "secondary",
    });
  }

  return blocks.length
    ? blocks
    : [{ role: "headline", text: "Untitled slide", items: [], emphasis: "primary" }];
}

export function slideFromCopy(args: {
  index: number;
  role?: unknown;
  headline?: string;
  body?: string;
  visualPrompt?: string;
  layout?: unknown;
  textBlocks?: unknown;
}): SlideshowSlide {
  const role = normalizeSlideRole(args.role);
  const existingBlocks = Array.isArray(args.textBlocks)
    ? args.textBlocks.filter(isTextBlock)
    : [];

  return {
    slideId: `slide-${args.index}`,
    index: args.index,
    role,
    purpose: typeof args.role === "string" ? args.role : "Slide",
    visualPrompt: args.visualPrompt ?? "",
    textBlocks: existingBlocks.length
      ? existingBlocks
      : textBlocksFromCopy({
          role,
          headline: args.headline,
          body: args.body,
        }),
    layout: normalizeLayout(args.layout),
  };
}

export function getSlideDimensionsFromData(data: Record<string, unknown>): {
  width: number;
  height: number;
} {
  const dimensions = data.dimensions;
  if (dimensions && typeof dimensions === "object") {
    const width = (dimensions as Record<string, unknown>).width;
    const height = (dimensions as Record<string, unknown>).height;
    if (typeof width === "number" && typeof height === "number") {
      return { width, height };
    }
  }

  return getSlideDimensions(typeof data.aspectRatio === "string" ? data.aspectRatio : "9:16");
}
