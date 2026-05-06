export type TextBlockRole = "eyebrow" | "headline" | "body" | "bullet_list" | "cta";
export type TextBlockEmphasis = "primary" | "secondary" | "muted";
export type SlideTemplate = "center_punch" | "bottom_stack" | "top_hook_bottom_body" | "checklist";
export type TextPlacement = "top" | "center" | "bottom" | "split";
export type TextDensity = "sparse" | "medium" | "dense";
export type ContrastStrategy = "none" | "shadow" | "gradient_scrim" | "solid_scrim";
export type SlideshowRenderingMode = "background_plus_overlay" | "full_graphic_generation";

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

export type SlideshowSlideRole = "hook" | "setup" | "insight" | "proof" | "payoff" | "cta";

export type SlideshowSlideLayout = {
  intent: string;
  template: SlideTemplate;
  textZone: TextPlacement;
  density: TextDensity;
  contrast: ContrastStrategy;
  stylePreset: "dark_minimal_tiktok";
};

export type OverlaySlideshowSlide = {
  renderingMode: "background_plus_overlay";
  slideId: string;
  index: number;
  role: SlideshowSlideRole;
  purpose: string;
  backgroundPrompt: string;
  textBlocks: SlideshowTextBlock[];
  layout: SlideshowSlideLayout;
};

export type FullGraphicSlideshowSlide = {
  renderingMode: "full_graphic_generation";
  slideId: string;
  index: number;
  role: SlideshowSlideRole;
  purpose: string;
  visibleText: string;
  finalImagePrompt: string;
};

export type SlideshowSlide = OverlaySlideshowSlide | FullGraphicSlideshowSlide;

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
  renderingMode: SlideshowRenderingMode;
  aspectRatio: "9:16" | "4:5" | "1:1";
  title: string;
  hook: string;
  caption: string;
  visualSystem: string;
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
  renderingMode: SlideshowRenderingMode;
  title: string;
  caption: string;
  aspectRatio: SlideshowPlan["aspectRatio"];
  dimensions: { width: number; height: number };
  exportSettings: SlideshowExportSettings;
  visualSystem: string;
  creativeBrief: string;
  strategy: CreativeBrief;
  slides: CanonicalSlideshowSlide[];
};

export type OverlayPlannerSlide = {
  slideId?: string;
  purpose: string;
  primaryText: string;
  secondaryText?: string;
  bullets: string[];
  backgroundPrompt: string;
  layout: {
    intent: string;
    density: TextDensity;
    contrastStrategy: ContrastStrategy;
  };
};

export type FullGraphicPlannerSlide = {
  slideId?: string;
  purpose: string;
  visibleText: string;
  finalImagePrompt: string;
};

export type OverlaySlideshowPlannerOutput = {
  format: "slideshow";
  renderingMode: "background_plus_overlay";
  creativeBrief: CreativeBrief;
  visualSystem: string;
  title: string;
  caption: string;
  aspectRatio: "9:16" | "4:5" | "1:1";
  slides: OverlayPlannerSlide[];
};

export type FullGraphicSlideshowPlannerOutput = {
  format: "slideshow";
  renderingMode: "full_graphic_generation";
  creativeBrief: CreativeBrief;
  visualSystem: string;
  title: string;
  caption: string;
  aspectRatio: "9:16" | "4:5" | "1:1";
  slides: FullGraphicPlannerSlide[];
};

export type SlideshowPlannerOutput = OverlaySlideshowPlannerOutput | FullGraphicSlideshowPlannerOutput;

const creativeBriefSchema = {
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
        hookPlacement: { type: "string", enum: ["top", "center", "bottom"] },
        contentPlacement: { type: "string", enum: ["top", "center", "bottom"] },
      },
    },
  },
};

const overlayLayoutSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "density", "contrastStrategy"],
  properties: {
    intent: { type: "string" },
    density: { type: "string", enum: ["sparse", "medium", "dense"] },
    contrastStrategy: { type: "string", enum: ["none", "shadow", "gradient_scrim", "solid_scrim"] },
  },
};

export const overlaySlideshowPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "renderingMode", "creativeBrief", "visualSystem", "title", "caption", "aspectRatio", "slides"],
  properties: {
    format: { type: "string", enum: ["slideshow"] },
    renderingMode: { type: "string", enum: ["background_plus_overlay"] },
    creativeBrief: creativeBriefSchema,
    visualSystem: { type: "string" },
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
        required: ["slideId", "purpose", "primaryText", "secondaryText", "bullets", "backgroundPrompt", "layout"],
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
          backgroundPrompt: { type: "string" },
          layout: overlayLayoutSchema,
        },
      },
    },
  },
};

export const fullGraphicSlideshowPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "renderingMode", "creativeBrief", "visualSystem", "title", "caption", "aspectRatio", "slides"],
  properties: {
    format: { type: "string", enum: ["slideshow"] },
    renderingMode: { type: "string", enum: ["full_graphic_generation"] },
    creativeBrief: creativeBriefSchema,
    visualSystem: { type: "string" },
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
        required: ["slideId", "purpose", "visibleText", "finalImagePrompt"],
        properties: {
          slideId: { type: "string" },
          purpose: { type: "string" },
          visibleText: { type: "string" },
          finalImagePrompt: { type: "string" },
        },
      },
    },
  },
};
