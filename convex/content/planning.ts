import type { Doc } from "../_generated/dataModel";
import { clampText, compactText } from "../lib/text";
import type {
  ContrastStrategy,
  CreativeBrief,
  LayoutStrategy,
  PlannerSlide,
  SlideTemplate,
  SlideshowPlan,
  SlideshowPlannerOutput,
  SlideshowSlide,
  SlideshowTextBlock,
  TextDensity,
  TextPlacement,
} from "./types";

type LegacyPlannerSlide = PlannerSlide & {
  layout: PlannerSlide["layout"] & { textPlacement?: unknown };
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

function normalizeBrief(
  value: unknown,
  prompt: string,
  targetSlideCount: number,
  layoutStrategy: LayoutStrategy
): CreativeBrief {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    narrativePattern: clampText(compactText(data.narrativePattern, "Flexible educational slideshow with a strong hook and practical payoff."), 160),
    targetSlideCount,
    reasoning: clampText(compactText(data.reasoning, `Planned around the user's request: ${prompt}`), 240),
    visualStyle: clampText(compactText(data.visualStyle, "modern, minimal, high-contrast social visuals"), 120),
    tone: clampText(compactText(data.tone, "direct, confident, useful"), 120),
    layoutStrategy,
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

function fallbackContentPlacement(slides: PlannerSlide[]): LayoutStrategy["contentPlacement"] {
  const placements = slides
    .slice(1)
    .map((slide) => normalizePlacement((slide as LegacyPlannerSlide).layout.textPlacement, "center"))
    .filter((placement) => placement !== "split");
  const uniquePlacements = Array.from(new Set(placements));
  return uniquePlacements.length === 1 ? uniquePlacements[0] : "center";
}

function normalizeLayoutStrategy(value: unknown, slides: PlannerSlide[]): LayoutStrategy {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    hookPlacement: normalizeLayoutPlacement(data.hookPlacement, "center"),
    contentPlacement: normalizeLayoutPlacement(data.contentPlacement, fallbackContentPlacement(slides)),
  };
}

function normalizeDensity(value: unknown): TextDensity {
  return value === "sparse" || value === "medium" || value === "dense" ? value : "medium";
}

function normalizeContrast(value: unknown): ContrastStrategy {
  if (value === "none" || value === "shadow" || value === "gradient_scrim") return value;
  return "shadow";
}

function templateForSlide(
  slide: Pick<PlannerSlide, "bullets"> & { layout: PlannerSlide["layout"] & { textPlacement: TextPlacement } },
  index: number
): SlideTemplate {
  if (slide.bullets.length > 0) return "checklist";
  if (index === 0 || slide.layout.textPlacement === "center") return "center_punch";
  if (slide.layout.textPlacement === "top") return "top_hook_bottom_body";
  return "bottom_stack";
}

function roleForSlide(slide: PlannerSlide, index: number, total: number): SlideshowSlide["role"] {
  const purpose = slide.purpose.toLowerCase();
  if (index === 0 || purpose.includes("hook") || purpose.includes("title")) return "hook";
  if (index === total - 1 && (purpose.includes("cta") || purpose.includes("save") || purpose.includes("payoff"))) return "cta";
  if (purpose.includes("proof") || purpose.includes("example")) return "proof";
  if (purpose.includes("setup") || purpose.includes("problem")) return "setup";
  if (purpose.includes("payoff") || purpose.includes("takeaway")) return "payoff";
  return "insight";
}

function textBlocksForSlide(slide: PlannerSlide, role: SlideshowSlide["role"]): SlideshowTextBlock[] {
  const blocks: SlideshowTextBlock[] = [];

  blocks.push({
    role: role === "cta" ? "cta" : "headline",
    text: clampText(slide.primaryText, 82),
    items: [],
    emphasis: "primary",
  });

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

function normalizePlannerSlide(value: unknown, index: number): PlannerSlide {
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
    imagePrompt: compactText(
      data.imagePrompt,
      "Full-bleed vertical lifestyle photograph with a clear subject, natural setting, soft cinematic light, uncluttered composition, and room for app-rendered overlay copy. Background image only, without embedded writing or graphic design elements."
    ),
      layout: {
        intent: clampText(compactText(layout.intent, "Readable mobile social slide with clear text hierarchy."), 140),
        density: normalizeDensity(layout.density),
        contrastStrategy: normalizeContrast(layout.contrastStrategy),
      },
  };
}

function fallbackPlannerOutput(prompt: string, targetSlideCount: number, revisionPrompt?: string): SlideshowPlannerOutput {
  const mergedPrompt = revisionPrompt ? `${prompt}. Revision: ${revisionPrompt}` : prompt;
  const itemMatch = mergedPrompt.match(countablePattern);
  const itemCount = itemMatch?.[1] ? numberFromToken(itemMatch[1]) : undefined;
  const contentCount = Math.max(3, Math.min((itemCount ?? targetSlideCount - 1), targetSlideCount - 1));
  const topic = clampText(mergedPrompt, 84);
  const slides: PlannerSlide[] = [
    {
      slideId: `slide-1-${slug(topic, "title")}`,
      purpose: "Hook/title slide",
      primaryText: topic,
      secondaryText: "",
      bullets: [],
      imagePrompt: `Full-bleed vertical lifestyle photograph evoking ${topic}, clear subject, natural setting, soft cinematic morning light, uncluttered composition, room in the center for app-rendered overlay copy. Background image only, without embedded writing or graphic design elements.`,
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
      imagePrompt: `Full-bleed vertical lifestyle photograph representing point ${index} of ${topic}, clear subject, natural setting, soft cinematic light, uncluttered composition, room in the center for app-rendered overlay copy. Background image only, without embedded writing or graphic design elements.`,
      layout: {
        intent: "Strong heading with concise supporting text over a clean background.",
        density: "medium",
        contrastStrategy: "gradient_scrim",
      },
    });
  }

  return {
    format: "slideshow",
    creativeBrief: {
      narrativePattern: "Title slide followed by concise practical content slides.",
      targetSlideCount: slides.length,
      reasoning: `Fallback plan generated from the prompt: ${mergedPrompt}`,
      visualStyle: "modern, minimal, professional",
      tone: "direct, confident, useful",
      layoutStrategy: {
        hookPlacement: "center",
        contentPlacement: "center",
      },
    },
    title: topic,
    caption: "Save this for later.",
    aspectRatio: "9:16",
    slides,
  };
}

export function normalizePlan(
  value: unknown,
  prompt: string,
  revisionPrompt?: string,
  targetSlideCount = inferSlideCount(prompt).targetSlideCount
): SlideshowPlan {
  const source = !value || typeof value !== "object" || (value as Record<string, unknown>).dryRun
    ? fallbackPlannerOutput(prompt, targetSlideCount, revisionPrompt)
    : value as Record<string, unknown>;

  const rawSlides = Array.isArray(source.slides) ? source.slides : [];
  const targetCountFromModel =
    source.creativeBrief &&
    typeof source.creativeBrief === "object" &&
    typeof (source.creativeBrief as Record<string, unknown>).targetSlideCount === "number"
      ? (source.creativeBrief as Record<string, unknown>).targetSlideCount as number
      : targetSlideCount;
  const targetCount = Math.max(4, Math.min(Math.round(targetCountFromModel), 9));
  const plannerSlides = rawSlides
    .slice(0, targetCount)
    .map((slide, index) => normalizePlannerSlide(slide, index));

  const slides = (plannerSlides.length >= 4
    ? plannerSlides
    : fallbackPlannerOutput(prompt, targetCount, revisionPrompt).slides
  ).slice(0, 9);
  const sourceBrief = source.creativeBrief && typeof source.creativeBrief === "object"
    ? source.creativeBrief as Record<string, unknown>
    : {};
  const layoutStrategy = normalizeLayoutStrategy(sourceBrief.layoutStrategy, slides);
  const strategy = normalizeBrief(source.creativeBrief, prompt, slides.length, layoutStrategy);
  const aspectRatio = compactText(source.aspectRatio, "9:16") as SlideshowPlan["aspectRatio"];
  const normalizedAspectRatio = ["9:16", "4:5", "1:1"].includes(aspectRatio) ? aspectRatio : "9:16";

  return {
    format: "slideshow",
    aspectRatio: normalizedAspectRatio,
    title: clampText(compactText(source.title, slides[0]?.primaryText || prompt), 90),
    hook: clampText(slides[0]?.primaryText || prompt, 120),
    caption: clampText(compactText(source.caption, "Save this for later."), 280),
    creativeBrief: `${strategy.narrativePattern} ${strategy.reasoning}`.trim(),
    strategy,
    slides: slides.map((slide, index) => {
      const role = roleForSlide(slide, index, slides.length);
      const textPlacement = index === 0 ? layoutStrategy.hookPlacement : layoutStrategy.contentPlacement;
      const layout = { ...slide.layout, textPlacement };
      return {
        slideId: slide.slideId || `slide-${index + 1}-${slug(slide.primaryText, "generated")}`,
        index: index + 1,
        role,
        purpose: slide.purpose,
        visualPrompt: clampText(slide.imagePrompt, 420),
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

export function buildPlannerPrompt(args: {
  prompt: string;
  revisionPrompt?: string;
  brand: Doc<"brands">;
  socialAccount?: Doc<"socialAccounts"> | null;
  targetSlideCount: number;
  slideCountReasoning: string;
}): string {
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
    "TEXT RULES:",
    "- Write in a direct, confident, action-oriented tone unless the brand says otherwise.",
    "- Be specific and actionable, not vague motivation.",
    "- Keep text concise enough to fit on a mobile image.",
    "- Primary text should usually be 3-10 words.",
    "- Secondary text should be 0-2 short sentences.",
    "- Avoid all-caps words except acronyms.",
    "- Avoid exclamation points unless one is clearly justified.",
    "- Use bullets only when the slide truly benefits from a checklist.",
    "",
    "IMAGE PROMPT RULES:",
    "- Write each imagePrompt as one polished natural-language prompt string.",
    "- Describe the subject/action, setting, composition, lighting, style, camera feel, and an uncluttered area for app-rendered overlay copy.",
    "- Prefer phrases like full-bleed vertical photograph, lifestyle photo, cinematic phone-camera realism, natural light, uncluttered composition.",
    "- Create visual cohesion across slides with a consistent style, mood, lighting, and palette.",
    "- The title slide should use a thematic hero image, not a literal diagram.",
    "- Content slides should visualize the specific concept of the slide.",
    "- Do not describe a poster, slide, carousel, social graphic, typography layout, UI, caption, or text overlay.",
    "- End each imagePrompt with this exact sentence: Background image only, without embedded writing or graphic design elements.",
    "",
    "LAYOUT RULES:",
    "- Choose creativeBrief.layoutStrategy once for the whole slideshow.",
    "- Set creativeBrief.layoutStrategy.hookPlacement to center unless the user explicitly asks for another title treatment.",
    "- Set creativeBrief.layoutStrategy.contentPlacement to one shared placement for all non-title slides. Default to center unless the visual style clearly needs top or bottom.",
    "- Let the slideshow-level layout strategy control placement for every slide; use each slide's layout.intent to describe readability and composition needs.",
    "- For each slide, describe layout.intent in natural language. This is internal metadata, not display copy.",
    "- Choose density and contrastStrategy per slide as semantic layout hints, not exact pixel values.",
    "- Use shadow or gradient_scrim by default. Use solid_scrim only if the slide has unusually dense text.",
    "- The backend renderer will decide exact font sizes and positions.",
    "",
    `Brand: ${args.brand.name}`,
    args.brand.audience ? `Audience: ${args.brand.audience}` : undefined,
    args.brand.voice ? `Voice: ${args.brand.voice}` : undefined,
    args.brand.visualStyle ? `Visual style: ${args.brand.visualStyle}` : undefined,
    args.brand.constraints?.length ? `Constraints: ${args.brand.constraints.join("; ")}` : undefined,
    args.socialAccount ? `Account/platform: ${args.socialAccount.username} on ${args.socialAccount.platform}` : undefined,
    `User prompt: ${args.prompt}`,
    args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
    "",
    "Return exactly the requested JSON schema. Use exactly the target slide count unless there is a strong creative reason to use fewer or more within the schema limits.",
  ].filter((line) => line !== undefined).join("\n");
}
