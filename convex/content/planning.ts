import type { Doc } from "../_generated/dataModel";
import { clampText } from "../lib/text";
import type {
  ContrastStrategy,
  CreativeBrief,
  FullGraphicPlannerSlide,
  LayoutStrategy,
  OverlayPlannerSlide,
  SlideTemplate,
  SlideshowPlan,
  SlideshowRenderingMode,
  SlideshowSlide,
  SlideshowSlideRole,
  SlideshowTextBlock,
  SlideshowPlannerOutput,
  TextBlockAlign,
  TextBlockBackgroundStyle,
  TextDensity,
  TextPlacement,
} from "./types";

export type PlannerReference = {
  assetId: string;
  name: string;
  type: string;
  description?: string;
  instruction?: string;
};

export type RequestedRenderingMode = SlideshowRenderingMode;
export type BrandPromptContext = Pick<
  Doc<"brands">,
  "name" | "audience" | "voice" | "visualStyle" | "constraints"
>;

export const IMAGE_PROMPT_WRITER_SYSTEM_PROMPT =
  "You are a specialist image prompt writer for short-form social visuals. You write natural, concrete image generation prompts that faithfully expand the user's creative brief without turning it into a rigid template.";

type PromptArgs = {
  prompt: string;
  revisionPrompt?: string;
  brand: BrandPromptContext;
  socialAccount?: Doc<"socialAccounts"> | null;
  references: PlannerReference[];
};

type ImagePromptWriterArgs = PromptArgs & {
  plan: SlideshowPlannerOutput;
  requestedRenderingMode: RequestedRenderingMode;
};

type SingleImagePromptWriterArgs = ImagePromptWriterArgs & {
  slide: unknown;
};

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

function overlayPromptPlannerSlide(slide: OverlayPlannerSlide) {
  return {
    slideId: slide.slideId,
    purpose: slide.purpose,
    useReferenceImage: slide.useReferenceImage,
    sceneCues: slide.textBlocks.map((block) => block.text).filter((cue) => Boolean(cue.trim())),
  };
}

function promptCreativeBriefForImageWriter(plan: SlideshowPlannerOutput) {
  return {
    narrativePattern: plan.creativeBrief.narrativePattern,
    reasoning: plan.creativeBrief.reasoning,
    visualStyle: plan.creativeBrief.visualStyle,
    tone: plan.creativeBrief.tone,
  };
}

function promptPlanForImageWriter(
  plan: SlideshowPlannerOutput,
  renderingMode: RequestedRenderingMode
) {
  if (renderingMode === "full_graphic_generation") return plan;
  if (plan.renderingMode !== "background_plus_overlay") return plan;

  return {
    format: plan.format,
    creativeBrief: promptCreativeBriefForImageWriter(plan),
    visualSystem: plan.visualSystem,
    title: plan.title,
    aspectRatio: plan.aspectRatio,
    slides: plan.slides.map(overlayPromptPlannerSlide),
  };
}

function promptSlideForImageWriter(
  slide: unknown,
  renderingMode: RequestedRenderingMode
) {
  if (renderingMode === "full_graphic_generation") return slide;
  const data = slide as Partial<OverlayPlannerSlide>;
  if (!data || typeof data !== "object") return slide;
  return overlayPromptPlannerSlide({
    slideId: data.slideId,
    purpose: data.purpose ?? "",
    useReferenceImage: data.useReferenceImage === true,
    textBlocks: Array.isArray(data.textBlocks) ? data.textBlocks as SlideshowTextBlock[] : [],
    layout: {
      intent: data.layout?.intent ?? "",
      density: data.layout?.density ?? "sparse",
      contrastStrategy: data.layout?.contrastStrategy ?? "none",
    },
  });
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

function sharedPromptLines(args: PromptArgs): Array<string | undefined> {
  const referenceLines = args.references.length
    ? args.references.flatMap((reference, index) => [
        `Reference ${index + 1}: ${reference.name}`,
        `- Asset id: ${reference.assetId}`,
        `- Type: ${reference.type}`,
        reference.description ? `- Description: ${reference.description}` : undefined,
        reference.instruction ? `- User instruction: ${reference.instruction}` : undefined,
      ])
    : ["Reference assets: []"];

  return [
    "Create a production slideshow plan from the user's prompt.",
    "",
    "SOURCE OF TRUTH:",
    "- Treat the user prompt as the creative source of truth.",
    "- Preserve a named slideshow title as title and hook.",
    "- Preserve explicit slide count, slide order, slide text, visual style, subjects, camera direction, references, and examples from the user prompt.",
    "- When the user provides a sequence of scenes and a sequence of slides, pair them by order.",
    "- Fill unspecified choices with simple, coherent defaults that match the prompt.",
    "- Use aspectRatio 9:16 for TikTok, Reels, Shorts, vertical, or mobile slideshow requests.",
    "- Choose the slide count semantically from the requested format, explicit slide list, numbered list, and narrative needs.",
    "REFERENCES:",
    ...referenceLines,
    "- Set useReferenceImage true for a slide when selected reference assets are part of that slide image.",
    "- For a selected person or character reference, useReferenceImage true applies when that person or character appears as the subject, reflection, visible face, visible body, or visible body part.",
    "- Selfie, mirror selfie, portrait, and creator-in-frame scenes are person-visible scenes for selected person references.",
    "- Do not turn object closeups, POV shots, food, phone/app, sink, or routine detail scenes into person-visible scenes just because a person reference is selected.",
    "- Set useReferenceImage false for a slide when selected reference assets are background context for the slideshow.",
    "",
    "BRAND CONTEXT:",
    `Brand: ${args.brand.name}`,
    args.brand.audience ? `Audience: ${args.brand.audience}` : undefined,
    args.brand.voice ? `Voice: ${args.brand.voice}` : undefined,
    args.brand.visualStyle ? `Visual style: ${args.brand.visualStyle}` : undefined,
    args.brand.constraints?.length ? `Constraints: ${args.brand.constraints.join("; ")}` : undefined,
    args.socialAccount ? `Account/platform: ${args.socialAccount.username} on ${args.socialAccount.platform}` : undefined,
    `User prompt: ${args.prompt}`,
    args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
  ];
}

export function buildOverlayPlannerPrompt(args: PromptArgs): string {
  return [
    ...sharedPromptLines(args),
    "",
    "PRODUCTION MODE:",
    "- Use renderingMode exactly: background_plus_overlay.",
    "- Plan on-screen copy and one visual purpose per slide.",
    "- Each slide purpose should preserve the paired scene cue from the user prompt, including subject, setting, action, camera/framing, and reference visibility when specified.",
    "- Preserve object/detail scenes as object/detail scenes unless the user explicitly says a person, reflection, body, hand, or selfie is visible.",
    "- Do not add hands, faces, bodies, or reflections to object/detail scenes when the user only names the object or place.",
    "- visualSystem summarizes the image style requested by the user.",
    "",
    "SLIDE COPY:",
    "- Each slide has textBlocks: independent editable text boxes, not primary/secondary/bullet fields.",
    "- Preserve user-provided slide text exactly inside textBlocks when the prompt gives explicit slides.",
    "- Use one text block for a title-only slide. Use multiple text blocks only when the user asks for separate labels, captions, CTA text, or supporting copy.",
    "- Give each block sensible default geometry: x/y/width as percentages of the 9:16 slide, large readable font sizes, and mobile-safe placement.",
    "- For TikTok-style overlay copy, default to white text, 16px black stroke, high font weight, centered alignment, and no background unless the user requests a sticker/card/background.",
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}

export function buildFullGraphicPlannerPrompt(args: PromptArgs): string {
  return [
    ...sharedPromptLines(args),
    "",
    "PRODUCTION MODE:",
    "- Use renderingMode exactly: full_graphic_generation.",
    "- visibleText is the text intended inside the generated image.",
    "- visualSystem summarizes the finished graphic style requested by the user.",
    "",
    "FULL GRAPHIC SLIDES:",
    "- Match explicit user-provided slide text in visibleText.",
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}

export function buildImagePromptWriterPrompt(args: ImagePromptWriterArgs): string {
  const referenceLines = args.references.length
    ? args.references.flatMap((reference, index) => [
        `Reference ${index + 1}: ${reference.name}`,
        `- Asset id: ${reference.assetId}`,
        `- Type: ${reference.type}`,
        reference.description ? `- Description: ${reference.description}` : undefined,
        reference.instruction ? `- User instruction: ${reference.instruction}` : undefined,
      ])
    : ["Reference assets: []"];
  const planJson = JSON.stringify(
    promptPlanForImageWriter(args.plan, args.requestedRenderingMode),
    null,
    2
  );
  const sourceRequestLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "SOURCE REQUEST:",
        `User prompt: ${args.prompt}`,
        args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
      ]
    : [
        "SOURCE REQUEST:",
        `User prompt: ${args.prompt}`,
        args.revisionPrompt ? `Revision context: ${args.revisionPrompt}` : undefined,
      ];

  const sharedLines = [
    "Write image prompts for the planned slideshow.",
    "",
    ...sourceRequestLines,
    "",
    "REFERENCES:",
    ...referenceLines,
    "- useReferenceImage true means selected reference assets are attached to that slide generation.",
    "- useReferenceImage false means visual continuity comes from the written prompt, visualSystem, scene, objects, and style.",
    "- For useReferenceImage true, write as if the selected reference assets are the visible subject, character, or style source; avoid weak wording like 'resembling the reference'.",
    "- For useReferenceImage false, do not mention selected reference assets in the image prompt.",
    "- For useReferenceImage false object/detail scenes, do not add a creator, person, face, body, hand, or reflection unless the current slide purpose explicitly includes one.",
    "",
    "BRAND CONTEXT:",
    `Brand: ${args.brand.name}`,
    args.brand.audience ? `Audience: ${args.brand.audience}` : undefined,
    args.brand.voice ? `Voice: ${args.brand.voice}` : undefined,
    args.brand.visualStyle ? `Visual style: ${args.brand.visualStyle}` : undefined,
    args.brand.constraints?.length ? `Constraints: ${args.brand.constraints.join("; ")}` : undefined,
    args.socialAccount ? `Account/platform: ${args.socialAccount.username} on ${args.socialAccount.platform}` : undefined,
    "",
    "SLIDESHOW PLAN:",
    planJson,
    "",
    "PROMPT WRITING:",
    "- Treat the user prompt and slideshow plan as the source material.",
    "- Preserve concrete user-specified style, subjects, camera angles, text, colors, references, and examples.",
    "- Faithfully expand compact scene cues into plausible visual specifics that match the user's stated aesthetic.",
    "- Prefer concrete visible details over abstract labels like motivating, premium, cinematic, or professional.",
    "- Name setting-specific objects, materials, textures, and spatial relationships instead of broad categories.",
    "- Add grounded details for setting, objects, composition, lighting, camera/framing, style, and reference usage when they help the image render clearly.",
    "- Avoid adding inferred emotions, body transformations, or narrative labels when concrete camera-visible details would be more useful.",
    "- Avoid generic stock-photo staging unless the user asked for it.",
  ];

  const modeLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "",
        "FULL GRAPHIC PROMPTS:",
        "- Use renderingMode exactly: full_graphic_generation.",
        "- Return visualBrief and one finalImagePrompt for each slideId in the slideshow plan.",
        "- finalImagePrompt describes a complete finished graphic with the image scene and designed text.",
        "- Use visibleText as the text inside the graphic.",
        "- Write finalImagePrompt as one plain text prompt using markdown-style section headings in this exact order: ### Create, ### Shared style, ### Visible text exact line breaks, ### Typography, ### Scene, ### Camera and framing, ### Style consistency.",
        "- Typography section states placement, style, color, and treatment for the visible text.",
        "- Scene section states the subject, action, objects, environment, and spatial relationships.",
        "- Camera and framing section states angle, crop, distance, subject scale, and visible frame geometry.",
      ]
    : [
        "",
        "BACKGROUND PROMPTS:",
        "- Use renderingMode exactly: background_plus_overlay.",
        "- Return visualBrief and one backgroundPrompt for each slideId in the slideshow plan.",
        "- backgroundPrompt describes only the generated picture: scene, subject, setting, action, objects, lighting, palette, mood, camera/framing, style, and reference usage.",
        "- On-screen copy belongs to textBlocks; backgroundPrompt focuses on the photo or illustration content.",
        "- Write backgroundPrompt as natural plain text, usually one or two concise paragraphs. Do not use markdown headings or production checklist labels.",
        "- For candid, UGC, camera-roll, selfie, POV, or phone-photo requests, expand with lived-in details such as imperfect crop, mundane surroundings, visible clutter, reflections, motion blur, low light, phone-camera grain, and non-centered handheld framing when appropriate.",
        "- For realistic public spaces, include incidental background activity when it fits the user's brief.",
        "- Do not over-constrain identity visibility; let normal phone-photo framing apply unless the user asks for a clear portrait.",
        "- Do not request slide headlines, captions, typography, labels, or designed text overlays in overlay background images.",
        "- Fixed app, phone, screenshot, or CTA placeholder scenes may include realistic UI text only inside the photographed/screenshot content.",
      ];

  return [
    ...sharedLines,
    ...modeLines,
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}

export function buildSingleImagePromptWriterPrompt(args: SingleImagePromptWriterArgs): string {
  const referenceLines = args.references.length
    ? args.references.flatMap((reference, index) => [
        `Reference ${index + 1}: ${reference.name}`,
        `- Asset id: ${reference.assetId}`,
        `- Type: ${reference.type}`,
        reference.description ? `- Description: ${reference.description}` : undefined,
        reference.instruction ? `- User instruction: ${reference.instruction}` : undefined,
      ])
    : ["Reference assets: []"];
  const planJson = JSON.stringify(
    promptPlanForImageWriter(args.plan, args.requestedRenderingMode),
    null,
    2
  );
  const slideJson = JSON.stringify(
    promptSlideForImageWriter(args.slide, args.requestedRenderingMode),
    null,
    2
  );
  const sourceRequestLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "SOURCE REQUEST:",
        `User prompt: ${args.prompt}`,
        args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
      ]
    : [
        "SOURCE REQUEST:",
        `User prompt: ${args.prompt}`,
        args.revisionPrompt ? `Revision context: ${args.revisionPrompt}` : undefined,
      ];

  const sharedLines = [
    "Write one image prompt for the current slideshow slide.",
    "",
    ...sourceRequestLines,
    "",
    "REFERENCES:",
    ...referenceLines,
    "- useReferenceImage true means selected reference assets are attached to this slide generation.",
    "- useReferenceImage false means visual continuity comes from the written prompt, visualSystem, scene, objects, and style.",
    "- For useReferenceImage true, write as if the selected reference assets are the visible subject, character, or style source; avoid weak wording like 'resembling the reference'.",
    "- For useReferenceImage false, do not mention selected reference assets in the image prompt.",
    "- For useReferenceImage false object/detail scenes, do not add a creator, person, face, body, hand, or reflection unless the current slide purpose explicitly includes one.",
    "",
    "BRAND CONTEXT:",
    `Brand: ${args.brand.name}`,
    args.brand.audience ? `Audience: ${args.brand.audience}` : undefined,
    args.brand.voice ? `Voice: ${args.brand.voice}` : undefined,
    args.brand.visualStyle ? `Visual style: ${args.brand.visualStyle}` : undefined,
    args.brand.constraints?.length ? `Constraints: ${args.brand.constraints.join("; ")}` : undefined,
    args.socialAccount ? `Account/platform: ${args.socialAccount.username} on ${args.socialAccount.platform}` : undefined,
    "",
    "FULL SLIDESHOW PLAN:",
    planJson,
    "",
    "CURRENT SLIDE:",
    slideJson,
    "",
    "PROMPT WRITING:",
    "- Treat the user prompt, slideshow plan, and current slide as the source material.",
    "- Preserve concrete user-specified style, subjects, camera angles, text, colors, references, and examples.",
    "- Faithfully expand compact scene cues into plausible visual specifics that match the user's stated aesthetic.",
    "- Prefer concrete visible details over abstract labels like motivating, premium, cinematic, or professional.",
    "- Name setting-specific objects, materials, textures, and spatial relationships instead of broad categories.",
    "- Add grounded details for setting, objects, composition, lighting, camera/framing, style, and reference usage when they help the image render clearly.",
    "- Avoid adding inferred emotions, body transformations, or narrative labels when concrete camera-visible details would be more useful.",
    "- Avoid generic stock-photo staging unless the user asked for it.",
  ];

  const modeLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "",
        "FULL GRAPHIC PROMPT:",
        "- Return visualBrief and one finalImagePrompt for the current slideId.",
        "- finalImagePrompt describes a complete finished graphic with the image scene and designed text.",
        "- Use visibleText as the text inside the graphic.",
        "- Write finalImagePrompt as one plain text prompt using markdown-style section headings in this exact order: ### Create, ### Shared style, ### Visible text exact line breaks, ### Typography, ### Scene, ### Camera and framing, ### Style consistency.",
        "- Typography section states placement, style, color, and treatment for the visible text.",
        "- Scene section states the subject, action, objects, environment, and spatial relationships.",
        "- Camera and framing section states angle, crop, distance, subject scale, and visible frame geometry.",
      ]
    : [
        "",
        "BACKGROUND PROMPT:",
        "- Return visualBrief and one backgroundPrompt for the current slideId.",
        "- backgroundPrompt describes only the generated picture: scene, subject, setting, action, objects, lighting, palette, mood, camera/framing, style, and reference usage.",
        "- On-screen copy belongs to textBlocks; backgroundPrompt focuses on the photo or illustration content.",
        "- Write backgroundPrompt as natural plain text, usually one or two concise paragraphs. Do not use markdown headings or production checklist labels.",
        "- For candid, UGC, camera-roll, selfie, POV, or phone-photo requests, expand with lived-in details such as imperfect crop, mundane surroundings, visible clutter, reflections, motion blur, low light, phone-camera grain, and non-centered handheld framing when appropriate.",
        "- For realistic public spaces, include incidental background activity when it fits the user's brief.",
        "- Do not over-constrain identity visibility; let normal phone-photo framing apply unless the user asks for a clear portrait.",
        "- Do not request slide headlines, captions, typography, labels, or designed text overlays in overlay background images.",
        "- Fixed app, phone, screenshot, or CTA placeholder scenes may include realistic UI text only inside the photographed/screenshot content.",
      ];

  return [
    ...sharedLines,
    ...modeLines,
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}
