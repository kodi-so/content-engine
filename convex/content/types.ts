export type TextBlockRole = "eyebrow" | "headline" | "body" | "bullet_list" | "cta";
export type TextBlockEmphasis = "primary" | "secondary" | "muted";
export type SlideTemplate = "center_punch" | "bottom_stack" | "top_hook_bottom_body" | "checklist";
export type TextPlacement = "top" | "center" | "bottom" | "split";
export type TextDensity = "sparse" | "medium" | "dense";
export type ContrastStrategy = "none" | "shadow" | "gradient_scrim" | "solid_scrim";

export type LayoutStrategy = {
  hookPlacement: Exclude<TextPlacement, "split">;
  contentPlacement: Exclude<TextPlacement, "split">;
};

export type SlideshowTextBlock = {
  role: TextBlockRole;
  text: string;
  items: string[];
  emphasis: TextBlockEmphasis;
};

export type SlideshowSlide = {
  slideId: string;
  index: number;
  role: "hook" | "setup" | "insight" | "proof" | "payoff" | "cta";
  purpose: string;
  visualPrompt: string;
  textBlocks: SlideshowTextBlock[];
  layout: {
    intent: string;
    template: SlideTemplate;
    textZone: TextPlacement;
    density: TextDensity;
    contrast: ContrastStrategy;
    stylePreset: "dark_minimal_tiktok";
  };
};

export type CreativeBrief = {
  narrativePattern: string;
  targetSlideCount: number;
  reasoning: string;
  visualStyle: string;
  tone: string;
  layoutStrategy: LayoutStrategy;
};

export type SlideshowPlan = {
  format: "slideshow";
  aspectRatio: "9:16" | "4:5" | "1:1";
  title: string;
  hook: string;
  caption: string;
  creativeBrief: string;
  strategy: CreativeBrief;
  slides: SlideshowSlide[];
};

export type SlideshowExportSettings = {
  previewMimeType: "image/png";
  publishMimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
};

export type CanonicalSlideshowSlide = SlideshowSlide & {
  status: "active" | "deleted";
  dimensions: { width: number; height: number };
  backgroundImageUrl?: string;
  sourceImageArtifactId?: string;
  updatedAt: number;
};

export type CanonicalSlideshowSpec = {
  format: "slideshow";
  title: string;
  caption: string;
  aspectRatio: SlideshowPlan["aspectRatio"];
  dimensions: { width: number; height: number };
  exportSettings: SlideshowExportSettings;
  creativeBrief: string;
  strategy: CreativeBrief;
  slides: CanonicalSlideshowSlide[];
};

export type PlannerSlide = {
  slideId?: string;
  purpose: string;
  primaryText: string;
  secondaryText?: string;
  bullets: string[];
  imagePrompt: string;
  layout: {
    intent: string;
    density: TextDensity;
    contrastStrategy: ContrastStrategy;
  };
};

export type SlideshowPlannerOutput = {
  format: "slideshow";
  creativeBrief: CreativeBrief;
  title: string;
  caption: string;
  aspectRatio: "9:16" | "4:5" | "1:1";
  slides: PlannerSlide[];
};

export const slideshowPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "creativeBrief", "title", "caption", "aspectRatio", "slides"],
  properties: {
    format: { type: "string", enum: ["slideshow"] },
    creativeBrief: {
      type: "object",
      additionalProperties: false,
      required: ["narrativePattern", "targetSlideCount", "reasoning", "visualStyle", "tone", "layoutStrategy"],
      properties: {
        narrativePattern: { type: "string" },
        targetSlideCount: { type: "number" },
        reasoning: { type: "string" },
        visualStyle: { type: "string" },
        tone: { type: "string" },
        layoutStrategy: {
          type: "object",
          additionalProperties: false,
          required: ["hookPlacement", "contentPlacement"],
          properties: {
            hookPlacement: {
              type: "string",
              enum: ["top", "center", "bottom"],
            },
            contentPlacement: {
              type: "string",
              enum: ["top", "center", "bottom"],
            },
          },
        },
      },
    },
    title: { type: "string" },
    caption: { type: "string" },
    aspectRatio: { type: "string", enum: ["9:16", "4:5", "1:1"] },
    slides: {
      type: "array",
      minItems: 4,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideId", "purpose", "primaryText", "secondaryText", "bullets", "imagePrompt", "layout"],
        properties: {
          slideId: { type: "string" },
          purpose: { type: "string" },
          primaryText: { type: "string" },
          secondaryText: { type: "string" },
          bullets: {
            type: "array",
            maxItems: 4,
            items: { type: "string" },
          },
          imagePrompt: { type: "string" },
          layout: {
            type: "object",
            additionalProperties: false,
            required: ["intent", "density", "contrastStrategy"],
            properties: {
              intent: { type: "string" },
              density: {
                type: "string",
                enum: ["sparse", "medium", "dense"],
              },
              contrastStrategy: {
                type: "string",
                enum: ["none", "shadow", "gradient_scrim", "solid_scrim"],
              },
            },
          },
        },
      },
    },
  },
};
