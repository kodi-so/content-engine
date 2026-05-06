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
  targetSlideCount: number;
  slideCountReasoning: string;
  references: PlannerReference[];
};

type ImagePromptWriterArgs = PromptArgs & {
  plan: SlideshowPlannerOutput;
  requestedRenderingMode: RequestedRenderingMode;
};

type SingleImagePromptWriterArgs = ImagePromptWriterArgs & {
  slide: unknown;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const countablePattern =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(habits?|tips?|mistakes?|ways?|steps?|rules?|ideas?|lessons?|reasons?|tools?|exercises?|things?)\b/i;

function numberFromToken(value: string): number | undefined {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return NUMBER_WORDS[value.toLowerCase()];
}

export function inferSlideCount(prompt: string, explicitSlideCount?: number): {
  targetSlideCount: number;
  reasoning: string;
} {
  if (explicitSlideCount && explicitSlideCount >= 4 && explicitSlideCount <= 9) {
    return {
      targetSlideCount: explicitSlideCount,
      reasoning: `The user explicitly requested ${explicitSlideCount} slides.`,
    };
  }

  const explicit = prompt.match(/\b(?:make|create|generate|use|with)\s+(\d+)\s+slides?\b/i);
  const explicitCount = explicit?.[1] ? Number(explicit[1]) : undefined;
  if (explicitCount && explicitCount >= 4 && explicitCount <= 9) {
    return {
      targetSlideCount: explicitCount,
      reasoning: `The prompt explicitly asks for ${explicitCount} slides.`,
    };
  }

  const countable = prompt.match(countablePattern);
  const itemCount = countable?.[1] ? numberFromToken(countable[1]) : undefined;
  if (itemCount && itemCount >= 2 && itemCount <= 8) {
    return {
      targetSlideCount: Math.min(itemCount + 1, 9),
      reasoning: `The prompt appears to describe ${itemCount} list items, so use a title/hook slide plus one slide per item.`,
    };
  }

  return {
    targetSlideCount: 6,
    reasoning: "No explicit slide count was found, so use a concise 6-slide structure.",
  };
}

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
    visualSystem: clampText(requiredString(source.visualSystem, "visualSystem"), 1200),
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

function normalizeOverlayPlan(
  value: unknown,
  imagePromptValue: unknown,
  prompt: string,
  targetSlideCount: number
): SlideshowPlan {
  const source = requiredObject(value, "planner output");
  if (source.dryRun) failPlanning("dryRun planner output cannot be normalized into production content");
  if (source.renderingMode !== "background_plus_overlay") {
    failPlanning("renderingMode must be background_plus_overlay");
  }
  const rawSlides = requiredArray(source.slides, "slides");
  const targetCount = Math.max(4, Math.min(Math.round(targetSlideCount), 9));
  if (rawSlides.length < targetCount) {
    failPlanning(`expected at least ${targetCount} slides, received ${rawSlides.length}`);
  }
  const plannerSlides = rawSlides.slice(0, targetCount).map((slide, index) => normalizeOverlayPlannerSlide(slide, index));
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
        backgroundPrompt: clampText(
          requiredString(imagePromptMap.get(slideId), `image prompt for ${slideId}`),
          4000
        ),
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
  prompt: string,
  targetSlideCount: number
): SlideshowPlan {
  const source = requiredObject(value, "planner output");
  if (source.dryRun) failPlanning("dryRun planner output cannot be normalized into production content");
  if (source.renderingMode !== "full_graphic_generation") {
    failPlanning("renderingMode must be full_graphic_generation");
  }
  const rawSlides = requiredArray(source.slides, "slides");
  const targetCount = Math.max(4, Math.min(Math.round(targetSlideCount), 9));
  if (rawSlides.length < targetCount) {
    failPlanning(`expected at least ${targetCount} slides, received ${rawSlides.length}`);
  }
  const plannerSlides = rawSlides.slice(0, targetCount).map((slide, index) => normalizeFullGraphicPlannerSlide(slide, index));
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
        visibleText: clampText(slide.visibleText, 200),
        finalImagePrompt: clampText(
          requiredString(imagePromptMap.get(slideId), `image prompt for ${slideId}`),
          6000
        ),
      };
    }),
  };
}

export function normalizePlan(
  value: unknown,
  imagePromptValue: unknown,
  prompt: string,
  revisionPrompt?: string,
  targetSlideCount = inferSlideCount(prompt).targetSlideCount,
  requestedRenderingMode: RequestedRenderingMode = "background_plus_overlay"
): SlideshowPlan {
  return requestedRenderingMode === "full_graphic_generation"
    ? normalizeFullGraphicPlan(value, imagePromptValue, prompt, targetSlideCount)
    : normalizeOverlayPlan(value, imagePromptValue, prompt, targetSlideCount);
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
    : ["Reference assets: none selected."];

  return [
    `Generate a production-ready ${args.targetSlideCount}-slide social slideshow from the user's rough idea.`,
    "",
    "CREATIVE STRATEGY:",
    "- Infer the best narrative pattern for the user's specific idea.",
    "- When the prompt describes a numbered list, use a title/hook slide plus one slide per item.",
    "- When the user provides an explicit slide list, use those slide lines as the complete slide copy for the matching slides.",
    "- When the prompt is a how-to, story, comparison, myth-busting, or explainer, choose a slide sequence that fits that idea.",
    "- When the user mentions TikTok, Reels, Shorts, vertical, or mobile content, use aspectRatio exactly: 9:16.",
    `- Slide count hint: ${args.targetSlideCount}. ${args.slideCountReasoning}`,
    "- Make reasonable creative-director decisions from the available context.",
    "- Preserve the user's explicit visual instructions in visualSystem, including colors, typography, recurring graphic elements, reference usage, composition, platform style, and finish level.",
    "REFERENCES:",
    ...referenceLines,
    "- Use selected references according to the user's prompt.",
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
    "- Each slide needs app-rendered overlay copy and a clear visual purpose.",
    "- Image prompts are written in a separate pass.",
    "",
    "SLIDE COPY:",
    "- primaryText should usually be 3-10 words.",
    "- secondaryText should be 0-2 short sentences.",
    "- Use bullets only when the slide truly benefits from a checklist.",
    "- Keep all copy concise enough to fit on a mobile image.",
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
    "- Each slide needs concise visibleText for the finished graphic.",
    "- visibleText is the intended text that should appear in the generated image.",
    "",
    "FULL GRAPHIC SLIDES:",
    "- The slide schema for this mode uses visibleText for the copy that belongs inside the generated image.",
    "- When the user provides exact slide text, visibleText should match that text exactly for each slide.",
    "- Keep visibleText concise enough for an image model to render legibly.",
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
    : ["Reference assets: none selected."];
  const planJson = JSON.stringify(args.plan, null, 2);

  const sharedLines = [
    "Write production image prompts for the already-planned slideshow.",
    "",
    "SOURCE REQUEST:",
    `User prompt: ${args.prompt}`,
    args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
    "",
    "REFERENCES:",
    ...referenceLines,
    "- Use selected references according to the user's prompt.",
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
    "IMAGE PROMPT QUALITY:",
    "- Write each image prompt with the specificity of a professional visual director.",
    "- First produce a visualBrief for each slide: a concrete grounding brief that the final prompt will include.",
    "- Use most of each visualBrief for the unique slide-specific scene or action: subject mechanics, object or equipment components, spatial relationships, subject orientation, interaction points, object positions, direction of motion, and action moment.",
    "- Use the remaining visualBrief space for exact text, typography, composition, camera/framing, style, and reference usage.",
    "- Build each image prompt as compact labeled sections so the image model receives clear separated instructions.",
    "- Use affirmative visual descriptions: describe the subjects, objects, spaces, styling, and composition that should appear in the image.",
    "- Describe simple scenes with positive visual terms such as clean, minimal, uncluttered, sparse, centered, isolated, or focused.",
    "- Express spacing and separation with concrete placement language, such as text above the subject, subject centered below the headline, or badge anchored in a corner.",
    "- Describe the generated image accurately enough that an illustrator or image model can render the intended result from the prompt alone.",
    "- Convert abstract ideas, named actions, objects, scenes, products, styles, and techniques into concrete visible details.",
    "- For every named action, technique, product, object, place, tool, outfit, or visual style, spell out the visible parts that make it recognizable and accurate.",
    "- Include the main subject, placement in the frame, pose or state, object orientation, surrounding environment, important objects, spatial relationships, camera angle, distance, framing, perspective, lighting, color palette, texture, mood, polish level, visual style, and reference usage when references are selected.",
    "- For demonstrations, choose the camera angle that reveals the clearest silhouette and object geometry, then describe the setup, subject-object interaction, direction of motion, action moment, and camera angle.",
    "- For demonstrations, the Scene section should begin by naming the chosen view and the named action or technique.",
    "- When a subject interacts with a surface, tool, machine, product, or prop, state how the object sits in the frame and how the subject interacts with it.",
    "- For asymmetric demonstrations, distinguish each side or role of the subject and describe one clear action moment with consistent subject and object positions.",
    "- Treat named items, product names, exercise names, step names, places, and titles as complete typography units when assigning color, outline, size, or highlight treatment.",
    "- For machinery, tools, furniture, products, vehicles, appliances, instruments, or specialized objects, name the visible parts, their placement, and how the subject interacts with them.",
    "- A production prompt should unpack named concepts into observable mechanics inside the prompt text itself.",
    "- Use the original user prompt as the strongest source for visual-system details, recurring graphic elements, typography, color, references, and layout requests.",
    "- When the user requests a recurring visual element, carry its placement and styling consistently across the prompt set.",
    "- Use the slideshow plan for slide order and slide text.",
    "- Keep the final image prompt concise and direct, usually 120-190 words per slide.",
    "- Maintain the slideshow visualSystem across every slide prompt.",
  ];

  const modeLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "",
        "FULL GRAPHIC PROMPTS:",
        "- Use renderingMode exactly: full_graphic_generation.",
        "- Return visualBrief and one finalImagePrompt for each slideId in the slideshow plan.",
        "- Each finalImagePrompt describes a complete finished graphic, including the image scene and the designed text system.",
        "- Use the slide's visibleText as the exact text that appears in the graphic.",
        "- Write finalImagePrompt as one plain text prompt using markdown-style section headings in this exact order: ### Create, ### Shared style, ### Visible text exact line breaks, ### Typography, ### Scene, ### Camera and framing, ### Style consistency.",
        "- In Create, write one sentence naming the finished asset type, aspect ratio, visual genre, main subject, and main action or state.",
        "- In Shared style, write a compact style guide from the user prompt and plan: background, character or reference usage, typography family/style, colors, recurring graphic elements, and overall composition.",
        "- In Visible text exact line breaks, write the intended text with line breaks that support legibility on a vertical mobile graphic; break title/subtitle structures across lines when it improves readability.",
        "- In Typography, specify placement and treatment for each line of visible text, including complete named phrases that receive color, outline, shadow, size, or weight treatment.",
        "- In Scene, write 3-5 direct sentences describing the subject, action, objects, environment, spatial relationships, and visible mechanics with enough detail for accurate rendering.",
        "- In Scene for demonstration slides, start with the chosen view and named action, then include the exact object or environment type, subject-object interaction, object direction, and action moment.",
        "- In Camera and framing, specify angle, distance, crop, orientation, subject scale, and the key body parts or object components that are visible; for demonstrations, frame the full subject and the relevant equipment or prop.",
        "- In Style consistency, use one concise sentence connecting this slide back to the selected reference assets and cohesive slideshow look.",
      ]
    : [
        "",
        "BACKGROUND PROMPTS:",
        "- Use renderingMode exactly: background_plus_overlay.",
        "- Return visualBrief and one backgroundPrompt for each slideId in the slideshow plan.",
        "- Each backgroundPrompt describes the generated image scene itself with strong visual specificity.",
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
    : ["Reference assets: none selected."];
  const planJson = JSON.stringify(args.plan, null, 2);
  const slideJson = JSON.stringify(args.slide, null, 2);

  const sharedLines = [
    "Write one production image prompt for the current slideshow slide.",
    "",
    "SOURCE REQUEST:",
    `User prompt: ${args.prompt}`,
    args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
    "",
    "REFERENCES:",
    ...referenceLines,
    "- Use selected references according to the user's prompt.",
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
    "IMAGE PROMPT QUALITY:",
    "- Focus all detail on the current slide.",
    "- First produce a visualBrief: a concrete grounding brief that the final prompt will include.",
    "- Use most of the visualBrief for the current slide's unique scene or action: subject mechanics, object or equipment components, spatial relationships, subject orientation, interaction points, object positions, direction of motion, and action moment.",
    "- Use the remaining visualBrief space for exact text, typography, composition, camera/framing, style, and reference usage.",
    "- Build the image prompt as compact labeled sections so the image model receives clear separated instructions.",
    "- Use affirmative visual descriptions: describe the subjects, objects, spaces, styling, and composition that should appear in the image.",
    "- Describe simple scenes with positive visual terms such as clean, minimal, uncluttered, sparse, centered, isolated, or focused.",
    "- Express spacing and separation with concrete placement language, such as text above the subject, subject centered below the headline, or badge anchored in a corner.",
    "- Describe the generated image accurately enough that an illustrator or image model can render the intended result from the prompt alone.",
    "- Convert abstract ideas, named actions, objects, scenes, products, styles, and techniques into concrete visible details.",
    "- For every named action, technique, product, object, place, tool, outfit, or visual style, spell out the visible parts that make it recognizable and accurate.",
    "- When a named concept can refer to multiple visual variants, choose the variant that best fits the user prompt and describe that specific visible setup, object type, orientation, interaction points, and action moment.",
    "- For demonstrations, choose the camera angle that reveals the clearest silhouette and object geometry, then describe the setup, subject-object interaction, direction of motion, action moment, and camera angle.",
    "- For demonstrations, the Scene section should begin by naming the chosen view and the named action or technique.",
    "- When a subject interacts with a surface, tool, machine, product, or prop, state how the object sits in the frame and how the subject interacts with it.",
    "- For asymmetric demonstrations, distinguish each side or role of the subject and describe one clear action moment with consistent subject and object positions.",
    "- Treat named items, product names, exercise names, step names, places, and titles as complete typography units when assigning color, outline, size, or highlight treatment.",
    "- For machinery, tools, furniture, products, vehicles, appliances, instruments, or specialized objects, name the visible parts, their placement, and how the subject interacts with them.",
    "- Use the original user prompt as the strongest source for visual-system details, recurring graphic elements, typography, color, references, and layout requests.",
    "- When the user requests a recurring visual element, carry its placement and styling consistently across the prompt set.",
    "- Use the slideshow plan for slide order and slide text.",
    "- Maintain the slideshow visualSystem in this slide prompt.",
    "- When the user requests a cohesive visual system, repeat the same typography, placement, color treatment, recurring graphic elements, background, subject styling, and composition rules in every prompt.",
  ];

  const modeLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "",
        "FULL GRAPHIC PROMPT:",
        "- Return visualBrief and one finalImagePrompt for the current slideId.",
        "- The finalImagePrompt describes a complete finished graphic, including the image scene and the designed text system.",
        "- Use the slide's visibleText as the exact text that appears in the graphic.",
        "- Write finalImagePrompt as one plain text prompt using markdown-style section headings in this exact order: ### Create, ### Shared style, ### Visible text exact line breaks, ### Typography, ### Scene, ### Camera and framing, ### Style consistency.",
        "- In Create, write one sentence naming the finished asset type, aspect ratio, visual genre, main subject, and main action or state.",
        "- In Shared style, write a compact style guide from the user prompt and plan: background, character or reference usage, typography family/style, colors, recurring graphic elements, and overall composition.",
        "- In Visible text exact line breaks, write the intended text with line breaks that support legibility on a vertical mobile graphic; break title/subtitle structures across lines when it improves readability.",
        "- In Typography, specify placement and treatment for each line of visible text, including complete named phrases that receive color, outline, shadow, size, or weight treatment.",
        "- In Scene, write 3-5 direct sentences describing the subject, action, objects, environment, spatial relationships, and visible mechanics with enough detail for accurate rendering.",
        "- In Scene for demonstration slides, start with the chosen view and named action, then include the exact object or environment type, subject-object interaction, object direction, and action moment.",
        "- In Camera and framing, specify angle, distance, crop, orientation, subject scale, and the key body parts or object components that are visible; for demonstrations, frame the full subject and the relevant equipment or prop.",
        "- In Style consistency, use one concise sentence connecting this slide back to the selected reference assets and cohesive slideshow look.",
      ]
    : [
        "",
        "BACKGROUND PROMPT:",
        "- Return visualBrief and one backgroundPrompt for the current slideId.",
        "- The backgroundPrompt describes the generated image scene itself with strong visual specificity.",
        "- Write backgroundPrompt as one plain text prompt using markdown-style section headings in this exact order: ### Create, ### Scene, ### Camera and framing, ### Visual style, ### Reference usage.",
      ];

  return [
    ...sharedLines,
    ...modeLines,
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}
