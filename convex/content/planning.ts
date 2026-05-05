import type { Doc } from "../_generated/dataModel";
import { clampText, compactText } from "../lib/text";
import type {
  SlideTemplate,
  SlideshowPlan,
  SlideshowSlide,
  SlideshowTextBlock,
  TextBlockEmphasis,
  TextBlockRole,
} from "./types";

function normalizeTextBlocks(value: unknown, slideIndex: number): SlideshowTextBlock[] {
  const blocks = Array.isArray(value) ? value : [];
  const normalized = blocks
    .map((block): SlideshowTextBlock | null => {
      if (!block || typeof block !== "object") return null;
      const data = block as Record<string, unknown>;
      const role = compactText(data.role, "body") as TextBlockRole;
      const emphasis = compactText(data.emphasis, role === "headline" ? "primary" : "secondary") as TextBlockEmphasis;
      const items = Array.isArray(data.items)
        ? data.items.filter((item): item is string => typeof item === "string").map((item) => clampText(item, 48)).slice(0, 4)
        : [];

      return {
        role: ["eyebrow", "headline", "body", "bullet_list", "cta"].includes(role) ? role : "body",
        text: clampText(compactText(data.text), role === "headline" ? 72 : 140),
        items,
        emphasis: ["primary", "secondary", "muted"].includes(emphasis) ? emphasis : "secondary",
      };
    })
    .filter((block): block is SlideshowTextBlock => Boolean(block && (block.text || block.items.length)));

  if (normalized.length > 0) return normalized.slice(0, 4);

  return [
    {
      role: "headline",
      text: `Slide ${slideIndex}`,
      items: [],
      emphasis: "primary",
    },
  ];
}

export function fallbackPlan(prompt: string, revisionPrompt?: string): SlideshowPlan {
  const mergedPrompt = revisionPrompt ? `${prompt}. Revision: ${revisionPrompt}` : prompt;
  return {
    format: "slideshow",
    aspectRatio: "9:16",
    title: "Morning Habits Slideshow",
    hook: "5 morning habits that quietly change your day",
    caption: "Small mornings compound. Save this for tomorrow.",
    creativeBrief: `Create a dark minimalist TikTok slideshow from: ${mergedPrompt}`,
    slides: [
      ["hook", "5 morning habits that quietly change your day", "A dark minimalist morning room with soft dawn light, clean negative space, cinematic shadows, no text"],
      ["insight", "Drink water before caffeine", "A glass of water on a black bedside table, subtle morning light, minimalist composition, no text"],
      ["insight", "Get sunlight in your eyes", "A person standing near a window with warm light cutting through a dark room, calm minimalist mood, no text"],
      ["insight", "Move for 5 minutes", "A silhouette stretching on a dark exercise mat, soft highlights, clean negative space, no text"],
      ["insight", "Write your top 3 priorities", "A black notebook and white pen on a clean desk, focused spotlight, no text"],
      ["insight", "Delay your phone", "A phone face-down beside a coffee cup in a quiet dark morning scene, no text"],
      ["cta", "Save this for tomorrow morning", "A minimal glowing checklist on a dark background, premium shadow lighting, no readable text"],
    ].map((item, index) => ({
      index: index + 1,
      role: item[0] as SlideshowSlide["role"],
      visualPrompt: item[2],
      textBlocks: [
        {
          role: index === 0 || index === 6 ? "headline" : "eyebrow",
          text: index === 0 || index === 6 ? "" : `Habit ${String(index).padStart(2, "0")}`,
          items: [],
          emphasis: "muted",
        },
        {
          role: "headline",
          text: item[1],
          items: [],
          emphasis: "primary",
        },
      ].filter((block) => block.text) as SlideshowTextBlock[],
      layout: {
        template: index === 0 ? "center_punch" : index === 6 ? "center_punch" : "bottom_stack",
        textZone: index === 0 || index === 6 ? "center" : "bottom",
        contrast: "gradient_scrim",
        stylePreset: "dark_minimal_tiktok",
      },
    })),
  };
}

export function normalizePlan(value: unknown, prompt: string, revisionPrompt?: string): SlideshowPlan {
  if (!value || typeof value !== "object" || (value as Record<string, unknown>).dryRun) {
    return fallbackPlan(prompt, revisionPrompt);
  }

  const data = value as Record<string, unknown>;
  const slides = Array.isArray(data.slides) ? data.slides : [];
  const normalizedSlides = slides.map((slide, index): SlideshowSlide => {
    const slideData = slide && typeof slide === "object" ? slide as Record<string, unknown> : {};
    const layout = slideData.layout && typeof slideData.layout === "object"
      ? slideData.layout as Record<string, unknown>
      : {};
    const role = compactText(slideData.role, index === 0 ? "hook" : "insight") as SlideshowSlide["role"];
    const template = compactText(layout.template, index === 0 ? "center_punch" : "bottom_stack") as SlideTemplate;
    const textZone = compactText(layout.textZone, template === "center_punch" ? "center" : "bottom") as SlideshowSlide["layout"]["textZone"];
    const contrast = compactText(layout.contrast, "gradient_scrim") as SlideshowSlide["layout"]["contrast"];

    return {
      index: typeof slideData.index === "number" ? slideData.index : index + 1,
      role: ["hook", "setup", "insight", "proof", "payoff", "cta"].includes(role) ? role : "insight",
      visualPrompt: compactText(
        slideData.visualPrompt,
        "Dark minimalist vertical social media background, cinematic shadows, clean negative space, no text"
      ),
      textBlocks: normalizeTextBlocks(slideData.textBlocks, index + 1),
      layout: {
        template: ["center_punch", "bottom_stack", "top_hook_bottom_body", "checklist"].includes(template) ? template : "bottom_stack",
        textZone: ["top", "center", "bottom", "split"].includes(textZone) ? textZone : "bottom",
        contrast: ["none", "shadow", "gradient_scrim", "solid_scrim"].includes(contrast) ? contrast : "gradient_scrim",
        stylePreset: "dark_minimal_tiktok",
      },
    };
  }).slice(0, 9);

  if (normalizedSlides.length < 4) {
    return fallbackPlan(prompt, revisionPrompt);
  }

  const aspectRatio = compactText(data.aspectRatio, "9:16") as SlideshowPlan["aspectRatio"];
  return {
    format: "slideshow",
    aspectRatio: ["9:16", "4:5", "1:1"].includes(aspectRatio) ? aspectRatio : "9:16",
    title: clampText(compactText(data.title, normalizedSlides[0]?.textBlocks[0]?.text || "Generated slideshow"), 90),
    hook: clampText(compactText(data.hook, normalizedSlides[0]?.textBlocks[0]?.text || prompt), 120),
    caption: clampText(compactText(data.caption, "Save this for later."), 280),
    creativeBrief: clampText(compactText(data.creativeBrief, prompt), 500),
    slides: normalizedSlides,
  };
}

export function buildPlannerPrompt(args: {
  prompt: string;
  revisionPrompt?: string;
  brand: Doc<"brands">;
  socialAccount?: Doc<"socialAccounts"> | null;
}): string {
  return [
    "Turn the user's rough idea into a production-ready TikTok-style slideshow plan.",
    "Do not ask clarifying questions unless the prompt is impossible to execute; make reasonable creative-director decisions.",
    "Use semantic text blocks, not raw pixel values. Keep copy short, glanceable, and suitable for mobile.",
    "Image prompts must describe only the background/visual asset and must explicitly avoid text, captions, watermarks, or UI.",
    "Default to dark minimalist TikTok style when the prompt asks for dark/minimalist styling.",
    `Brand: ${args.brand.name}`,
    args.brand.audience ? `Audience: ${args.brand.audience}` : undefined,
    args.brand.voice ? `Voice: ${args.brand.voice}` : undefined,
    args.brand.visualStyle ? `Visual style: ${args.brand.visualStyle}` : undefined,
    args.brand.constraints?.length ? `Constraints: ${args.brand.constraints.join("; ")}` : undefined,
    args.socialAccount ? `Account/platform: ${args.socialAccount.username} on ${args.socialAccount.platform}` : undefined,
    `User prompt: ${args.prompt}`,
    args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
    "Return 4-9 slides. Include a hook/title slide and a CTA slide only if useful.",
    "Use bullet_list blocks only when the slide truly needs bullets; otherwise use headline/body blocks.",
  ].filter(Boolean).join("\n");
}
