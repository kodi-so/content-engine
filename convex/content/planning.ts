import { clampText } from "../lib/text";
import type {
  ContrastStrategy,
  CreativeBrief,
  FullGraphicPlannerSlide,
  LayoutStrategy,
  OverlayPlannerSlide,
  SlideTemplate,
  SlideshowPlan,
  SlideshowSlide,
  SlideshowSlideRole,
  SlideshowTextBlock,
  TextBlockAlign,
  TextBlockBackgroundStyle,
  TextDensity,
  TextPlacement,
} from "./types";
import type { RequestedRenderingMode } from "./planningPrompts";
export {
  IMAGE_PROMPT_WRITER_SYSTEM_PROMPT,
  buildFullGraphicPlannerPrompt,
  buildImagePromptWriterPrompt,
  buildOverlayPlannerPrompt,
  buildSingleImagePromptWriterPrompt,
} from "./planningPrompts";
export type {
  BrandPromptContext,
  PlannerReference,
  RequestedRenderingMode,
} from "./planningPrompts";

function failPlanning(message: string): never {
  throw new Error(`Planner output is invalid: ${message}`);
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failPlanning(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    failPlanning(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    failPlanning(`${label} must be a boolean`);
  }
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failPlanning(`${label} must be a finite number`);
  }
  return value;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    failPlanning(`${label} must be an array`);
  }
  return value;
}

function requiredPlacement(value: unknown, label: string, allowSplit: boolean): TextPlacement {
  if (value === "top" || value === "center" || value === "bottom" || (allowSplit && value === "split")) {
    return value;
  }
  failPlanning(`${label} must be ${allowSplit ? "top, center, bottom, or split" : "top, center, or bottom"}`);
}

function requiredDensity(value: unknown, label: string): TextDensity {
  if (value === "sparse" || value === "medium" || value === "dense") return value;
  failPlanning(`${label} must be sparse, medium, or dense`);
}

function requiredContrast(value: unknown, label: string): ContrastStrategy {
  if (value === "none" || value === "shadow" || value === "gradient_scrim" || value === "solid_scrim") return value;
  failPlanning(`${label} must be none, shadow, gradient_scrim, or solid_scrim`);
}

function requiredTextAlign(value: unknown, label: string): TextBlockAlign {
  if (value === "left" || value === "center" || value === "right") return value;
  failPlanning(`${label} must be left, center, or right`);
}

function requiredBackgroundStyle(value: unknown, label: string): TextBlockBackgroundStyle {
  if (value === "none" || value === "solid") return value;
  failPlanning(`${label} must be none or solid`);
}

function requiredAspectRatio(value: unknown): SlideshowPlan["aspectRatio"] {
  if (value === "9:16" || value === "4:5" || value === "1:1") return value;
  failPlanning("aspectRatio must be 9:16, 4:5, or 1:1");
}

function aspectRatioForPrompt(prompt: string, plannedAspectRatio: SlideshowPlan["aspectRatio"]): SlideshowPlan["aspectRatio"] {
  return /\b(tiktok|reels?|shorts?|vertical|mobile)\b/i.test(prompt)
    ? "9:16"
    : plannedAspectRatio;
}

function normalizeLayoutStrategy(value: unknown): LayoutStrategy {
  const data = requiredObject(value, "creativeBrief.layoutStrategy");
  return {
    hookPlacement: requiredPlacement(data.hookPlacement, "creativeBrief.layoutStrategy.hookPlacement", false) as LayoutStrategy["hookPlacement"],
    contentPlacement: requiredPlacement(data.contentPlacement, "creativeBrief.layoutStrategy.contentPlacement", false) as LayoutStrategy["contentPlacement"],
  };
}

function normalizeBrief(
  value: unknown,
  targetSlideCount: number,
  layoutStrategy: LayoutStrategy
): CreativeBrief {
  const data = requiredObject(value, "creativeBrief");
  return {
    narrativePattern: clampText(requiredString(data.narrativePattern, "creativeBrief.narrativePattern"), 160),
    targetSlideCount,
    reasoning: clampText(requiredString(data.reasoning, "creativeBrief.reasoning"), 240),
    visualStyle: clampText(requiredString(data.visualStyle, "creativeBrief.visualStyle"), 140),
    tone: clampText(requiredString(data.tone, "creativeBrief.tone"), 120),
    layoutStrategy,
  };
}

function templateForSlide(
  slide: Pick<OverlayPlannerSlide, "textBlocks"> & { layout: OverlayPlannerSlide["layout"] & { textPlacement: TextPlacement } },
  index: number
): SlideTemplate {
  if (slide.textBlocks.length > 2) return "checklist";
  if (index === 0 || slide.layout.textPlacement === "center") return "center_punch";
  if (slide.layout.textPlacement === "top") return "top_hook_bottom_body";
  return "bottom_stack";
}

function roleForPurpose(purpose: string, index: number, total: number): SlideshowSlideRole {
  const normalized = purpose.toLowerCase();
  if (index === 0 || normalized.includes("hook") || normalized.includes("title")) return "hook";
  if (index === total - 1 && (normalized.includes("cta") || normalized.includes("save") || normalized.includes("payoff"))) return "cta";
  if (normalized.includes("proof") || normalized.includes("example")) return "proof";
  if (normalized.includes("setup") || normalized.includes("problem")) return "setup";
  if (normalized.includes("payoff") || normalized.includes("takeaway")) return "payoff";
  return "insight";
}

function normalizeHexColor(value: unknown, label: string, fallback: string): string {
  const color = requiredString(value, label);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : fallback;
}

function normalizeTextBlock(value: unknown, slideIndex: number, blockIndex: number): SlideshowTextBlock {
  const data = requiredObject(value, `slides[${slideIndex}].textBlocks[${blockIndex}]`);
  const role = blockIndex === 0 ? "headline" : "body";
  const fontWeight = requiredNumber(data.fontWeight, `slides[${slideIndex}].textBlocks[${blockIndex}].fontWeight`);
  const backgroundStyle = requiredBackgroundStyle(data.backgroundStyle, `slides[${slideIndex}].textBlocks[${blockIndex}].backgroundStyle`);

  return {
    id: clampText(requiredString(data.id, `slides[${slideIndex}].textBlocks[${blockIndex}].id`), 48),
    role,
    text: clampText(requiredString(data.text, `slides[${slideIndex}].textBlocks[${blockIndex}].text`), 180),
    items: [],
    emphasis: blockIndex === 0 ? "primary" : "secondary",
    x: clampNumber(requiredNumber(data.x, `slides[${slideIndex}].textBlocks[${blockIndex}].x`), 0, 88),
    y: clampNumber(requiredNumber(data.y, `slides[${slideIndex}].textBlocks[${blockIndex}].y`), 0, 92),
    width: clampNumber(requiredNumber(data.width, `slides[${slideIndex}].textBlocks[${blockIndex}].width`), 12, 96),
    align: requiredTextAlign(data.align, `slides[${slideIndex}].textBlocks[${blockIndex}].align`),
    fontSize: clampNumber(requiredNumber(data.fontSize, `slides[${slideIndex}].textBlocks[${blockIndex}].fontSize`), 28, 128),
    fontWeight: [400, 500, 600, 700, 800, 900].includes(fontWeight) ? fontWeight : 800,
    color: normalizeHexColor(data.color, `slides[${slideIndex}].textBlocks[${blockIndex}].color`, "#FFFFFF"),
    strokeColor: normalizeHexColor(data.strokeColor, `slides[${slideIndex}].textBlocks[${blockIndex}].strokeColor`, "#000000"),
    strokeWidth: clampNumber(requiredNumber(data.strokeWidth, `slides[${slideIndex}].textBlocks[${blockIndex}].strokeWidth`), 0, 48),
    backgroundStyle,
    backgroundColor: backgroundStyle === "none"
      ? "#000000"
      : normalizeHexColor(data.backgroundColor, `slides[${slideIndex}].textBlocks[${blockIndex}].backgroundColor`, "#FFFFFF"),
    backgroundOpacity: backgroundStyle === "none" ? 0 : 1,
  };
}

function normalizeOverlayPlannerSlide(value: unknown, index: number): OverlayPlannerSlide {
  const data = requiredObject(value, `slides[${index}]`);
  const layout = requiredObject(data.layout, `slides[${index}].layout`);
  const textBlocks = requiredArray(data.textBlocks, `slides[${index}].textBlocks`)
    .map((block, blockIndex) => normalizeTextBlock(block, index, blockIndex))
    .filter((block) => block.text.trim())
    .slice(0, 4);
  if (!textBlocks.length) {
    failPlanning(`slides[${index}].textBlocks must include at least one non-empty text block`);
  }

  return {
    slideId: requiredString(data.slideId, `slides[${index}].slideId`),
    purpose: clampText(requiredString(data.purpose, `slides[${index}].purpose`), 90),
    useReferenceImage: requiredBoolean(data.useReferenceImage, `slides[${index}].useReferenceImage`),
    textBlocks,
    layout: {
      intent: clampText(requiredString(layout.intent, `slides[${index}].layout.intent`), 140),
      density: requiredDensity(layout.density, `slides[${index}].layout.density`),
      contrastStrategy: requiredContrast(layout.contrastStrategy, `slides[${index}].layout.contrastStrategy`),
    },
  };
}

function normalizeFullGraphicPlannerSlide(value: unknown, index: number): FullGraphicPlannerSlide {
  const data = requiredObject(value, `slides[${index}]`);
  const visibleText = clampText(requiredString(data.visibleText, `slides[${index}].visibleText`), 200);
  return {
    slideId: requiredString(data.slideId, `slides[${index}].slideId`),
    purpose: clampText(requiredString(data.purpose, `slides[${index}].purpose`), 90),
    useReferenceImage: requiredBoolean(data.useReferenceImage, `slides[${index}].useReferenceImage`),
    visibleText,
  };
}

function normalizeSharedPlan(
  source: Record<string, unknown>,
  prompt: string,
  slideCount: number
) {
  const sourceBrief = requiredObject(source.creativeBrief, "creativeBrief");
  const layoutStrategy = normalizeLayoutStrategy(sourceBrief.layoutStrategy);
  const strategy = normalizeBrief(source.creativeBrief, slideCount, layoutStrategy);
  const aspectRatio = aspectRatioForPrompt(prompt, requiredAspectRatio(source.aspectRatio));
  return {
    aspectRatio,
    strategy,
    title: clampText(requiredString(source.title, "title"), 90),
    visualSystem: requiredString(source.visualSystem, "visualSystem"),
  };
}

function normalizeImagePromptMap(
  value: unknown,
  renderingMode: RequestedRenderingMode,
  promptKey: "backgroundPrompt" | "finalImagePrompt"
): Map<string, string> {
  const source = requiredObject(value, "image prompt writer output");
  if (source.renderingMode !== renderingMode) {
    failPlanning(`image prompt renderingMode must be ${renderingMode}`);
  }

  const map = new Map<string, string>();
  requiredArray(source.slides, "image prompt writer output.slides").forEach((slide, index) => {
    const data = requiredObject(slide, `image prompt writer output.slides[${index}]`);
    const slideId = requiredString(data.slideId, `image prompt writer output.slides[${index}].slideId`);
    const imagePrompt = requiredString(data[promptKey], `image prompt writer output.slides[${index}].${promptKey}`);
    validateImagePromptSections(imagePrompt, renderingMode, slideId);
    map.set(slideId, imagePrompt);
  });
  return map;
}

function validateImagePromptSections(
  imagePrompt: string,
  renderingMode: RequestedRenderingMode,
  slideId: string
) {
  if (renderingMode === "background_plus_overlay") {
    if (!imagePrompt.trim()) {
      failPlanning(`image prompt for ${slideId} cannot be empty`);
    }
    return;
  }

  const requiredSections = [
    "### Create",
    "### Shared style",
    "### Visible text exact line breaks",
    "### Typography",
    "### Scene",
    "### Camera and framing",
    "### Style consistency",
  ];
  const missingSection = requiredSections.find((section) => !imagePrompt.includes(section));
  if (missingSection) {
    failPlanning(`image prompt for ${slideId} must include section ${missingSection}`);
  }
}

function normalizeOverlayPlan(
  value: unknown,
  imagePromptValue: unknown,
  prompt: string
): SlideshowPlan {
  const source = requiredObject(value, "planner output");
  if (source.dryRun) failPlanning("dryRun planner output cannot be normalized into production content");
  if (source.renderingMode !== "background_plus_overlay") {
    failPlanning("renderingMode must be background_plus_overlay");
  }
  const rawSlides = requiredArray(source.slides, "slides");
  if (rawSlides.length < 2 || rawSlides.length > 9) {
    failPlanning(`slides must contain between 2 and 9 items, received ${rawSlides.length}`);
  }
  const plannerSlides = rawSlides.map((slide, index) => normalizeOverlayPlannerSlide(slide, index));
  const imagePromptMap = normalizeImagePromptMap(imagePromptValue, "background_plus_overlay", "backgroundPrompt");
  const shared = normalizeSharedPlan(source, prompt, plannerSlides.length);

  return {
    format: "slideshow",
    renderingMode: "background_plus_overlay",
    aspectRatio: shared.aspectRatio,
    title: shared.title,
    hook: clampText(plannerSlides[0].textBlocks.map((block) => block.text).join(" "), 120),
    visualSystem: shared.visualSystem,
    creativeBrief: `${shared.strategy.narrativePattern} ${shared.strategy.reasoning}`.trim(),
    strategy: shared.strategy,
    slides: plannerSlides.map((slide, index): SlideshowSlide => {
      const role = roleForPurpose(slide.purpose, index, plannerSlides.length);
      const textPlacement = index === 0 ? shared.strategy.layoutStrategy.hookPlacement : shared.strategy.layoutStrategy.contentPlacement;
      const layout = { ...slide.layout, textPlacement };
      const slideId = requiredString(slide.slideId, `normalized slides[${index}].slideId`);
      return {
        renderingMode: "background_plus_overlay",
        slideId,
        index: index + 1,
        role,
        purpose: slide.purpose,
        useReferenceImage: slide.useReferenceImage ? true : undefined,
        backgroundPrompt: requiredString(imagePromptMap.get(slideId), `image prompt for ${slideId}`),
        textBlocks: slide.textBlocks,
        layout: {
          intent: layout.intent,
          template: templateForSlide({ ...slide, layout }, index),
          textZone: layout.textPlacement,
          density: layout.density,
          contrast: layout.contrastStrategy,
          stylePreset: "dark_minimal_tiktok",
        },
      };
    }),
  };
}

function normalizeFullGraphicPlan(
  value: unknown,
  imagePromptValue: unknown,
  prompt: string
): SlideshowPlan {
  const source = requiredObject(value, "planner output");
  if (source.dryRun) failPlanning("dryRun planner output cannot be normalized into production content");
  if (source.renderingMode !== "full_graphic_generation") {
    failPlanning("renderingMode must be full_graphic_generation");
  }
  const rawSlides = requiredArray(source.slides, "slides");
  if (rawSlides.length < 2 || rawSlides.length > 9) {
    failPlanning(`slides must contain between 2 and 9 items, received ${rawSlides.length}`);
  }
  const plannerSlides = rawSlides.map((slide, index) => normalizeFullGraphicPlannerSlide(slide, index));
  const imagePromptMap = normalizeImagePromptMap(imagePromptValue, "full_graphic_generation", "finalImagePrompt");
  const shared = normalizeSharedPlan(source, prompt, plannerSlides.length);

  return {
    format: "slideshow",
    renderingMode: "full_graphic_generation",
    aspectRatio: shared.aspectRatio,
    title: shared.title,
    hook: clampText(plannerSlides[0].visibleText, 120),
    visualSystem: shared.visualSystem,
    creativeBrief: `${shared.strategy.narrativePattern} ${shared.strategy.reasoning}`.trim(),
    strategy: shared.strategy,
    slides: plannerSlides.map((slide, index): SlideshowSlide => {
      const slideId = requiredString(slide.slideId, `normalized slides[${index}].slideId`);
      return {
        renderingMode: "full_graphic_generation",
        slideId,
        index: index + 1,
        role: roleForPurpose(slide.purpose, index, plannerSlides.length),
        purpose: slide.purpose,
        useReferenceImage: slide.useReferenceImage ? true : undefined,
        visibleText: clampText(slide.visibleText, 200),
        finalImagePrompt: requiredString(imagePromptMap.get(slideId), `image prompt for ${slideId}`),
      };
    }),
  };
}

export function normalizePlan(
  value: unknown,
  imagePromptValue: unknown,
  prompt: string,
  _revisionPrompt?: string,
  requestedRenderingMode: RequestedRenderingMode = "background_plus_overlay"
): SlideshowPlan {
  return requestedRenderingMode === "full_graphic_generation"
    ? normalizeFullGraphicPlan(value, imagePromptValue, prompt)
    : normalizeOverlayPlan(value, imagePromptValue, prompt);
}
