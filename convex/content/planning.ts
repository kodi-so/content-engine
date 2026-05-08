import type { Doc } from "../_generated/dataModel";
import { clampText } from "../lib/text";
import type {
  ContrastStrategy,
  CreativeBrief,
  FullGraphicPlannerSlide,
  ImagePromptWriterOutput,
  LayoutStrategy,
  OverlayPlannerSlide,
  SlideTemplate,
  SlideshowPlan,
  SlideshowRenderingMode,
  SlideshowSlide,
  SlideshowSlideRole,
  SlideshowTextBlock,
  SlideshowPlannerOutput,
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

type PromptArgs = {
  prompt: string;
  revisionPrompt?: string;
  brand: Doc<"brands">;
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

function optionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    failPlanning(`${label} must be a string`);
  }
  return value.trim();
}

function requiredStringArray(value: unknown, label: string, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    failPlanning(`${label} must be an array`);
  }
  return value
    .map((item, index) => requiredString(item, `${label}[${index}]`))
    .slice(0, maxItems);
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
  slide: Pick<OverlayPlannerSlide, "bullets"> & { layout: OverlayPlannerSlide["layout"] & { textPlacement: TextPlacement } },
  index: number
): SlideTemplate {
  if (slide.bullets.length > 0) return "checklist";
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

function textBlocksForSlide(slide: OverlayPlannerSlide, role: SlideshowSlideRole): SlideshowTextBlock[] {
  const blocks: SlideshowTextBlock[] = [
    {
      role: role === "cta" ? "cta" : "headline",
      text: clampText(slide.primaryText, 82),
      items: [],
      emphasis: "primary",
    },
  ];

  if (slide.bullets.length > 0) {
    blocks.push({
      role: "bullet_list",
      text: "",
      items: slide.bullets.map((item) => clampText(item, 58)).slice(0, 4),
      emphasis: "secondary",
    });
  } else if (slide.secondaryText?.trim()) {
    blocks.push({
      role: "body",
      text: clampText(slide.secondaryText, 150),
      items: [],
      emphasis: "secondary",
    });
  }

  return blocks.filter((block) => block.text || block.items.length).slice(0, 4);
}

function normalizeOverlayPlannerSlide(value: unknown, index: number): OverlayPlannerSlide {
  const data = requiredObject(value, `slides[${index}]`);
  const layout = requiredObject(data.layout, `slides[${index}].layout`);
  const bullets = requiredStringArray(data.bullets, `slides[${index}].bullets`, 4);
  const primaryText = requiredString(data.primaryText, `slides[${index}].primaryText`);

  return {
    slideId: requiredString(data.slideId, `slides[${index}].slideId`),
    purpose: clampText(requiredString(data.purpose, `slides[${index}].purpose`), 90),
    useReferenceImage: requiredBoolean(data.useReferenceImage, `slides[${index}].useReferenceImage`),
    primaryText: clampText(primaryText, 90),
    secondaryText: clampText(optionalString(data.secondaryText, `slides[${index}].secondaryText`), 160),
    bullets: bullets.map((item) => clampText(item, 58)),
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
  const requiredSections = renderingMode === "full_graphic_generation"
    ? [
        "### Create",
        "### Shared style",
        "### Visible text exact line breaks",
        "### Typography",
        "### Scene",
        "### Camera and framing",
        "### Style consistency",
      ]
    : [
        "### Create",
        "### Scene",
        "### Camera and framing",
        "### Visual style",
        "### Reference usage",
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
    sceneCues: [
      slide.primaryText,
      slide.secondaryText,
      ...slide.bullets,
    ].filter((cue): cue is string => Boolean(cue?.trim())),
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
    primaryText: data.primaryText ?? "",
    secondaryText: data.secondaryText,
    bullets: Array.isArray(data.bullets) ? data.bullets : [],
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
    hook: clampText(plannerSlides[0].primaryText, 120),
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
        textBlocks: textBlocksForSlide(slide, role),
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
    "- visualSystem summarizes the image style requested by the user.",
    "",
    "SLIDE COPY:",
    "- primaryText preserves user-provided slide text when the prompt gives explicit slides.",
    "- secondaryText represents supporting copy requested or clearly described by the user prompt.",
    "- bullets represent checklist items requested or clearly described by the user prompt.",
    "- For an explicit slide list with titles only, set secondaryText to an empty string and bullets to an empty array.",
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
    "- The Reference usage section contains exactly one sentence.",
    "- For useReferenceImage true, use this sentence pattern: Use selected reference assets for [subject, character, identity, or style].",
    "- For useReferenceImage false, use this sentence pattern: Visual continuity comes from [style, scene, object, or camera sources].",
    "- For useReferenceImage false, that sentence names the style, scene, object, or camera sources guiding the slide.",
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
    "- Add only the visual details needed to make the slide render clearly.",
    "- Write direct prompts with concrete subjects, setting, objects, composition, lighting, camera/framing, style, and reference usage.",
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
        "- backgroundPrompt describes the generated picture: scene, subject, setting, action, objects, lighting, palette, mood, camera/framing, style, and reference usage.",
        "- On-screen copy belongs to textBlocks; backgroundPrompt focuses on the photo or illustration content.",
        "- Write backgroundPrompt as one plain text prompt using markdown-style section headings in this exact order: ### Create, ### Scene, ### Camera and framing, ### Visual style, ### Reference usage.",
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
    "- The Reference usage section contains exactly one sentence.",
    "- For useReferenceImage true, use this sentence pattern: Use selected reference assets for [subject, character, identity, or style].",
    "- For useReferenceImage false, use this sentence pattern: Visual continuity comes from [style, scene, object, or camera sources].",
    "- For useReferenceImage false, that sentence names the style, scene, object, or camera sources guiding the slide.",
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
    "- Add only the visual details needed to make the slide render clearly.",
    "- Write a direct prompt with concrete subjects, setting, objects, composition, lighting, camera/framing, style, and reference usage.",
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
        "- backgroundPrompt describes the generated picture: scene, subject, setting, action, objects, lighting, palette, mood, camera/framing, style, and reference usage.",
        "- On-screen copy belongs to textBlocks; backgroundPrompt focuses on the photo or illustration content.",
        "- Write backgroundPrompt as one plain text prompt using markdown-style section headings in this exact order: ### Create, ### Scene, ### Camera and framing, ### Visual style, ### Reference usage.",
      ];

  return [
    ...sharedLines,
    ...modeLines,
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}
