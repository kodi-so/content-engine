import type { Doc } from "../_generated/dataModel";
import { clampText, compactText } from "../lib/text";
import type {
  ContrastStrategy,
  CreativeBrief,
  FullGraphicPlannerSlide,
  FullGraphicSlideshowPlannerOutput,
  LayoutStrategy,
  OverlayPlannerSlide,
  OverlaySlideshowPlannerOutput,
  SlideTemplate,
  SlideshowPlan,
  SlideshowRenderingMode,
  SlideshowSlide,
  SlideshowSlideRole,
  SlideshowTextBlock,
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

function slug(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return normalized || fallback;
}

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

function normalizePlacement(value: unknown, fallback: TextPlacement): TextPlacement {
  return value === "top" || value === "center" || value === "bottom" || value === "split"
    ? value
    : fallback;
}

function normalizeLayoutPlacement(value: unknown, fallback: LayoutStrategy["hookPlacement"]): LayoutStrategy["hookPlacement"] {
  const placement = normalizePlacement(value, fallback);
  return placement === "split" ? fallback : placement;
}

function normalizeDensity(value: unknown): TextDensity {
  return value === "sparse" || value === "medium" || value === "dense" ? value : "medium";
}

function normalizeContrast(value: unknown): ContrastStrategy {
  if (value === "none" || value === "shadow" || value === "gradient_scrim" || value === "solid_scrim") return value;
  return "shadow";
}

function normalizeAspectRatio(value: unknown): SlideshowPlan["aspectRatio"] {
  return value === "9:16" || value === "4:5" || value === "1:1" ? value : "9:16";
}

function normalizeLayoutStrategy(value: unknown): LayoutStrategy {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    hookPlacement: normalizeLayoutPlacement(data.hookPlacement, "center"),
    contentPlacement: normalizeLayoutPlacement(data.contentPlacement, "center"),
  };
}

function normalizeBrief(
  value: unknown,
  prompt: string,
  targetSlideCount: number,
  layoutStrategy: LayoutStrategy
): CreativeBrief {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    narrativePattern: clampText(compactText(data.narrativePattern, "Flexible slideshow with a strong hook and clear payoff."), 160),
    targetSlideCount,
    reasoning: clampText(compactText(data.reasoning, `Planned around the user's request: ${prompt}`), 240),
    visualStyle: clampText(compactText(data.visualStyle, "cohesive social-first visuals"), 140),
    tone: clampText(compactText(data.tone, "direct, confident, useful"), 120),
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
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const layout = data.layout && typeof data.layout === "object"
    ? data.layout as Record<string, unknown>
    : {};
  const bullets = Array.isArray(data.bullets)
    ? data.bullets.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 4)
    : [];
  const primaryText = compactText(data.primaryText, `Slide ${index + 1}`);

  return {
    slideId: compactText(data.slideId, `slide-${index + 1}-${slug(primaryText, "generated")}`),
    purpose: clampText(compactText(data.purpose, index === 0 ? "Hook/title slide" : "Content slide"), 90),
    primaryText: clampText(primaryText, 90),
    secondaryText: clampText(compactText(data.secondaryText), 160),
    bullets: bullets.map((item) => clampText(item, 58)),
    backgroundPrompt: compactText(
      data.backgroundPrompt,
      `Full-bleed vertical image representing ${primaryText}, composed to remain readable behind app-rendered overlay text.`
    ),
    layout: {
      intent: clampText(compactText(layout.intent, "Readable mobile social slide with clear text hierarchy."), 140),
      density: normalizeDensity(layout.density),
      contrastStrategy: normalizeContrast(layout.contrastStrategy),
    },
  };
}

function normalizeFullGraphicPlannerSlide(value: unknown, index: number): FullGraphicPlannerSlide {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const visibleText = clampText(compactText(data.visibleText, `Slide ${index + 1}`), 140);
  return {
    slideId: compactText(data.slideId, `slide-${index + 1}-${slug(visibleText, "generated")}`),
    purpose: clampText(compactText(data.purpose, index === 0 ? "Hook/title slide" : "Content slide"), 90),
    visibleText,
    finalImagePrompt: compactText(
      data.finalImagePrompt,
      `Create a finished 9:16 social slideshow graphic. Include visible text: "${visibleText}".`
    ),
  };
}

function fallbackOverlayOutput(prompt: string, targetSlideCount: number, revisionPrompt?: string): OverlaySlideshowPlannerOutput {
  const mergedPrompt = revisionPrompt ? `${prompt}. Revision: ${revisionPrompt}` : prompt;
  const topic = clampText(mergedPrompt, 84);
  const contentCount = Math.max(3, targetSlideCount - 1);
  const slides: OverlayPlannerSlide[] = [
    {
      slideId: `slide-1-${slug(topic, "title")}`,
      purpose: "Hook/title slide",
      primaryText: topic,
      secondaryText: "",
      bullets: [],
      backgroundPrompt: `Full-bleed vertical image evoking ${topic}, clear subject, uncluttered composition, and space for app-rendered overlay text.`,
      layout: {
        intent: "Large centered title over atmospheric hero image.",
        density: "sparse",
        contrastStrategy: "gradient_scrim",
      },
    },
  ];

  for (let index = 1; index <= contentCount; index += 1) {
    slides.push({
      slideId: `slide-${index + 1}-point-${index}`,
      purpose: `Point ${index}`,
      primaryText: `Point ${index}`,
      secondaryText: `Make this point specific and actionable for: ${topic}`,
      bullets: [],
      backgroundPrompt: `Full-bleed vertical image representing point ${index} of ${topic}, clear subject, uncluttered composition, and space for app-rendered overlay text.`,
      layout: {
        intent: "Strong heading with concise supporting text over a clean background.",
        density: "medium",
        contrastStrategy: "gradient_scrim",
      },
    });
  }

  return {
    format: "slideshow",
    renderingMode: "background_plus_overlay",
    creativeBrief: {
      narrativePattern: "Title slide followed by concise practical content slides.",
      targetSlideCount: slides.length,
      reasoning: `Fallback plan generated from the prompt: ${mergedPrompt}`,
      visualStyle: "modern, minimal, professional",
      tone: "direct, confident, useful",
      layoutStrategy: { hookPlacement: "center", contentPlacement: "center" },
    },
    visualSystem: "Prompt-driven social slideshow with app-rendered overlay text.",
    title: topic,
    caption: "Save this for later.",
    aspectRatio: "9:16",
    slides,
  };
}

function fallbackFullGraphicOutput(prompt: string, targetSlideCount: number, revisionPrompt?: string): FullGraphicSlideshowPlannerOutput {
  const mergedPrompt = revisionPrompt ? `${prompt}. Revision: ${revisionPrompt}` : prompt;
  const topic = clampText(mergedPrompt, 84);
  const contentCount = Math.max(3, targetSlideCount - 1);
  const slides: FullGraphicPlannerSlide[] = [
    {
      slideId: `slide-1-${slug(topic, "title")}`,
      purpose: "Hook/title slide",
      visibleText: topic,
      finalImagePrompt: `Create a finished 9:16 social slideshow graphic for this title: "${topic}". Use a cohesive visual design based on the user's prompt.`,
    },
  ];

  for (let index = 1; index <= contentCount; index += 1) {
    const visibleText = `Point ${index}`;
    slides.push({
      slideId: `slide-${index + 1}-point-${index}`,
      purpose: `Point ${index}`,
      visibleText,
      finalImagePrompt: `Create a finished 9:16 social slideshow graphic for visible text: "${visibleText}". Make it specific to ${topic}.`,
    });
  }

  return {
    format: "slideshow",
    renderingMode: "full_graphic_generation",
    creativeBrief: {
      narrativePattern: "Title slide followed by concise graphic content slides.",
      targetSlideCount: slides.length,
      reasoning: `Fallback plan generated from the prompt: ${mergedPrompt}`,
      visualStyle: "cohesive finished social graphics",
      tone: "direct, confident, useful",
      layoutStrategy: { hookPlacement: "center", contentPlacement: "center" },
    },
    visualSystem: "Prompt-driven finished social graphics.",
    title: topic,
    caption: "Save this for later.",
    aspectRatio: "9:16",
    slides,
  };
}

function normalizeSharedPlan(
  source: Record<string, unknown>,
  prompt: string,
  slideCount: number
) {
  const sourceBrief = source.creativeBrief && typeof source.creativeBrief === "object"
    ? source.creativeBrief as Record<string, unknown>
    : {};
  const layoutStrategy = normalizeLayoutStrategy(sourceBrief.layoutStrategy);
  const strategy = normalizeBrief(source.creativeBrief, prompt, slideCount, layoutStrategy);
  const aspectRatio = normalizeAspectRatio(source.aspectRatio);
  return {
    aspectRatio,
    strategy,
    title: clampText(compactText(source.title, prompt), 90),
    caption: clampText(compactText(source.caption, "Save this for later."), 280),
    visualSystem: clampText(compactText(source.visualSystem, "Prompt-driven social slideshow with a cohesive visual system."), 360),
  };
}

function normalizeOverlayPlan(
  value: unknown,
  prompt: string,
  revisionPrompt: string | undefined,
  targetSlideCount: number
): SlideshowPlan {
  const source = !value || typeof value !== "object" || (value as Record<string, unknown>).dryRun
    ? fallbackOverlayOutput(prompt, targetSlideCount, revisionPrompt)
    : value as Record<string, unknown>;
  const rawSlides = Array.isArray(source.slides) ? source.slides : [];
  const targetCount = Math.max(4, Math.min(Math.round(targetSlideCount), 9));
  const plannerSlides = rawSlides.slice(0, targetCount).map((slide, index) => normalizeOverlayPlannerSlide(slide, index));
  const fallback = fallbackOverlayOutput(prompt, targetCount, revisionPrompt);
  const slides = (plannerSlides.length >= 4 ? plannerSlides : fallback.slides).slice(0, 9);
  const shared = normalizeSharedPlan(source, prompt, slides.length);

  return {
    format: "slideshow",
    renderingMode: "background_plus_overlay",
    aspectRatio: shared.aspectRatio,
    title: shared.title,
    hook: clampText(slides[0]?.primaryText || prompt, 120),
    caption: shared.caption,
    visualSystem: shared.visualSystem,
    creativeBrief: `${shared.strategy.narrativePattern} ${shared.strategy.reasoning}`.trim(),
    strategy: shared.strategy,
    slides: slides.map((slide, index): SlideshowSlide => {
      const role = roleForPurpose(slide.purpose, index, slides.length);
      const textPlacement = index === 0 ? shared.strategy.layoutStrategy.hookPlacement : shared.strategy.layoutStrategy.contentPlacement;
      const layout = { ...slide.layout, textPlacement };
      return {
        renderingMode: "background_plus_overlay",
        slideId: slide.slideId || `slide-${index + 1}-${slug(slide.primaryText, "generated")}`,
        index: index + 1,
        role,
        purpose: slide.purpose,
        backgroundPrompt: clampText(slide.backgroundPrompt, 700),
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
  prompt: string,
  revisionPrompt: string | undefined,
  targetSlideCount: number
): SlideshowPlan {
  const source = !value || typeof value !== "object" || (value as Record<string, unknown>).dryRun
    ? fallbackFullGraphicOutput(prompt, targetSlideCount, revisionPrompt)
    : value as Record<string, unknown>;
  const rawSlides = Array.isArray(source.slides) ? source.slides : [];
  const targetCount = Math.max(4, Math.min(Math.round(targetSlideCount), 9));
  const plannerSlides = rawSlides.slice(0, targetCount).map((slide, index) => normalizeFullGraphicPlannerSlide(slide, index));
  const fallback = fallbackFullGraphicOutput(prompt, targetCount, revisionPrompt);
  const slides = (plannerSlides.length >= 4 ? plannerSlides : fallback.slides).slice(0, 9);
  const shared = normalizeSharedPlan(source, prompt, slides.length);

  return {
    format: "slideshow",
    renderingMode: "full_graphic_generation",
    aspectRatio: shared.aspectRatio,
    title: shared.title,
    hook: clampText(slides[0]?.visibleText || prompt, 120),
    caption: shared.caption,
    visualSystem: shared.visualSystem,
    creativeBrief: `${shared.strategy.narrativePattern} ${shared.strategy.reasoning}`.trim(),
    strategy: shared.strategy,
    slides: slides.map((slide, index): SlideshowSlide => ({
      renderingMode: "full_graphic_generation",
      slideId: slide.slideId || `slide-${index + 1}-${slug(slide.visibleText, "generated")}`,
      index: index + 1,
      role: roleForPurpose(slide.purpose, index, slides.length),
      purpose: slide.purpose,
      visibleText: clampText(slide.visibleText, 140),
      finalImagePrompt: clampText(slide.finalImagePrompt, 1200),
    })),
  };
}

export function normalizePlan(
  value: unknown,
  prompt: string,
  revisionPrompt?: string,
  targetSlideCount = inferSlideCount(prompt).targetSlideCount,
  requestedRenderingMode: RequestedRenderingMode = "background_plus_overlay"
): SlideshowPlan {
  return requestedRenderingMode === "full_graphic_generation"
    ? normalizeFullGraphicPlan(value, prompt, revisionPrompt, targetSlideCount)
    : normalizeOverlayPlan(value, prompt, revisionPrompt, targetSlideCount);
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
    : ["No reference assets were selected."];

  return [
    `Generate a production-ready ${args.targetSlideCount}-slide social slideshow from the user's rough idea.`,
    "",
    "CREATIVE STRATEGY:",
    "- Infer the best narrative pattern instead of forcing every slideshow into a listicle.",
    "- If the prompt describes a numbered list, use a title/hook slide plus one slide per item unless that would be obviously worse.",
    "- If the prompt is a how-to, story, comparison, myth-busting, or explainer, choose a slide sequence that fits that idea.",
    `- Slide count hint: ${args.targetSlideCount}. ${args.slideCountReasoning}`,
    "- Do not ask clarifying questions unless the prompt is impossible to execute; make reasonable creative-director decisions.",
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
    "- Each slide needs app-rendered overlay copy and a backgroundPrompt for the image model.",
    "- backgroundPrompt should create an image that works behind overlay text.",
    "- The app renders slide copy separately, so backgroundPrompt should focus on subject, environment, composition, and open areas for legibility.",
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
    "- Each slide needs visibleText and finalImagePrompt.",
    "- finalImagePrompt should describe the complete finished slide image, including its visual design, composition, subject placement, and visible text.",
    "- visibleText is the intended text that should appear in the generated image.",
    "- Only include text that belongs in the final slide.",
    "",
    "FULL GRAPHIC SLIDES:",
    "- The slide schema for this mode uses visibleText and finalImagePrompt for copy and design.",
    "- Make each finalImagePrompt specific to that slide.",
    "- Preserve the slideshow-level visualSystem across all slides.",
    "- Keep visibleText concise enough for an image model to render legibly.",
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}
