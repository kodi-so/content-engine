export type TextBlockRole = "eyebrow" | "headline" | "body" | "bullet_list" | "cta";
export type TextBlockEmphasis = "primary" | "secondary" | "muted";
export type TextBlockAlign = "left" | "center" | "right";
export type TextBlockBackgroundStyle = "none" | "solid";
export type SlideTemplate = "center_punch" | "bottom_stack" | "top_hook_bottom_body" | "checklist";
export type TextPlacement = "top" | "center" | "bottom" | "split";
export type TextBlockZone = "top" | "center" | "bottom";
export type TextDensity = "sparse" | "medium" | "dense";
export type ContrastStrategy = "none" | "shadow" | "gradient_scrim" | "solid_scrim";
export type SlideshowRenderingMode = "background_plus_overlay" | "full_graphic_generation";

export type LayoutStrategy = {
  hookPlacement: Exclude<TextPlacement, "split">;
  contentPlacement: Exclude<TextPlacement, "split">;
};

export type SlideshowTextBlock = {
  id?: string;
  role: TextBlockRole;
  text: string;
  items: string[];
  emphasis: TextBlockEmphasis;
  zone?: TextBlockZone;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  align?: TextBlockAlign;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  backgroundStyle?: TextBlockBackgroundStyle;
  backgroundOpacity?: number;
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
  useReferenceImage?: boolean;
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
  useReferenceImage?: boolean;
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
  useReferenceImage: boolean;
  textBlocks: SlideshowTextBlock[];
  layout: {
    intent: string;
    density: TextDensity;
    contrastStrategy: ContrastStrategy;
  };
};

export type FullGraphicPlannerSlide = {
  slideId?: string;
  purpose: string;
  useReferenceImage: boolean;
  visibleText: string;
};

export type OverlaySlideshowPlannerOutput = {
  format: "slideshow";
  renderingMode: "background_plus_overlay";
  creativeBrief: CreativeBrief;
  visualSystem: string;
  title: string;
  aspectRatio: "9:16" | "4:5" | "1:1";
  slides: OverlayPlannerSlide[];
};

export type FullGraphicSlideshowPlannerOutput = {
  format: "slideshow";
  renderingMode: "full_graphic_generation";
  creativeBrief: CreativeBrief;
  visualSystem: string;
  title: string;
  aspectRatio: "9:16" | "4:5" | "1:1";
  slides: FullGraphicPlannerSlide[];
};

export type SlideshowPlannerOutput = OverlaySlideshowPlannerOutput | FullGraphicSlideshowPlannerOutput;

export type OverlayImagePromptWriterOutput = {
  renderingMode: "background_plus_overlay";
    slides: Array<{
    slideId: string;
    visualBrief: string;
    backgroundPrompt: string;
  }>;
};

export type FullGraphicImagePromptWriterOutput = {
  renderingMode: "full_graphic_generation";
  slides: Array<{
    slideId: string;
    visualBrief: string;
    finalImagePrompt: string;
  }>;
};

export type ImagePromptWriterOutput = OverlayImagePromptWriterOutput | FullGraphicImagePromptWriterOutput;
export type SingleOverlayImagePromptWriterOutput = OverlayImagePromptWriterOutput["slides"][number];
export type SingleFullGraphicImagePromptWriterOutput = FullGraphicImagePromptWriterOutput["slides"][number];
export type SingleImagePromptWriterOutput =
  | SingleOverlayImagePromptWriterOutput
  | SingleFullGraphicImagePromptWriterOutput;

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

// Strict structured-output schemas (OpenAI/Azure via OpenRouter) require every key in
// `properties` to appear in `required`, so this schema carries only the semantic fields
// the planner must always produce. Concrete geometry/styling is computed downstream by
// the overlay layout designer; explicit geometry still validates when supplied through
// editing paths, it is just never requested from the planner.
const overlayTextBlockSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "role", "text", "emphasis", "zone", "align"],
  properties: {
    id: { type: "string" },
    role: { type: "string", enum: ["eyebrow", "headline", "body", "bullet_list", "cta"] },
    text: { type: "string" },
    emphasis: { type: "string", enum: ["primary", "secondary", "muted"] },
    zone: {
      type: "string",
      enum: ["top", "center", "bottom"],
      description: "Semantic placement zone chosen to match negative space reserved in backgroundPrompt.",
    },
    align: { type: "string", enum: ["left", "center", "right"] },
  },
};

export const overlaySlideshowPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "renderingMode", "creativeBrief", "visualSystem", "title", "aspectRatio", "slides"],
  properties: {
    format: { type: "string", enum: ["slideshow"] },
    renderingMode: { type: "string", enum: ["background_plus_overlay"] },
    creativeBrief: creativeBriefSchema,
    visualSystem: {
      type: "string",
      description: "Generated image visual system requested by the user: style, subject treatment, environment, references, composition, platform feel, and finish level.",
    },
    title: { type: "string" },
    aspectRatio: { type: "string", enum: ["9:16", "4:5", "1:1"] },
    slides: {
      type: "array",
      minItems: 2,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideId", "purpose", "useReferenceImage", "textBlocks", "layout"],
        properties: {
          slideId: { type: "string" },
          purpose: {
            type: "string",
            description: "The paired visual scene for this slide, preserving user-specified subject, setting, action, camera/framing, and reference visibility.",
          },
          useReferenceImage: {
            type: "boolean",
            description: "True when selected reference assets are part of this slide image generation.",
          },
          textBlocks: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: overlayTextBlockSchema,
          },
          layout: overlayLayoutSchema,
        },
      },
    },
  },
};

export const fullGraphicSlideshowPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "renderingMode", "creativeBrief", "visualSystem", "title", "aspectRatio", "slides"],
  properties: {
    format: { type: "string", enum: ["slideshow"] },
    renderingMode: { type: "string", enum: ["full_graphic_generation"] },
    creativeBrief: creativeBriefSchema,
    visualSystem: {
      type: "string",
      description: "Finished graphic system requested by the user: colors, typography, text treatment, recurring elements, references, composition, platform style, and finish level.",
    },
    title: { type: "string" },
    aspectRatio: { type: "string", enum: ["9:16", "4:5", "1:1"] },
    slides: {
      type: "array",
      minItems: 2,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideId", "purpose", "useReferenceImage", "visibleText"],
        properties: {
          slideId: { type: "string" },
          purpose: { type: "string" },
          useReferenceImage: {
            type: "boolean",
            description: "True when selected reference assets are part of this slide image generation.",
          },
          visibleText: { type: "string" },
        },
      },
    },
  },
};

export const overlayImagePromptWriterSchema = {
  type: "object",
  additionalProperties: false,
  required: ["renderingMode", "slides"],
  properties: {
    renderingMode: { type: "string", enum: ["background_plus_overlay"] },
    slides: {
      type: "array",
      minItems: 2,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideId", "visualBrief", "backgroundPrompt"],
        properties: {
          slideId: { type: "string" },
          visualBrief: {
            type: "string",
            description: "A concrete visual brief for this slide image using the user prompt and planned slide.",
          },
          backgroundPrompt: {
            type: "string",
            description: "A natural plain-text image generation prompt for the slide picture with concrete scene, subject, setting, objects, composition, lighting, camera/framing, style, and reference usage. Do not require markdown headings.",
          },
        },
      },
    },
  },
};

export const fullGraphicImagePromptWriterSchema = {
  type: "object",
  additionalProperties: false,
  required: ["renderingMode", "slides"],
  properties: {
    renderingMode: { type: "string", enum: ["full_graphic_generation"] },
    slides: {
      type: "array",
      minItems: 2,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideId", "visualBrief", "finalImagePrompt"],
        properties: {
          slideId: { type: "string" },
          visualBrief: {
            type: "string",
            description: "A concrete visual brief for this finished graphic using the user prompt and planned slide.",
          },
          finalImagePrompt: {
            type: "string",
            description: "A direct image generation prompt for a complete finished graphic with visible text, typography, scene, composition, camera/framing, style, and reference usage.",
          },
        },
      },
    },
  },
};

export const singleOverlayImagePromptWriterSchema = {
  type: "object",
  additionalProperties: false,
  required: ["slideId", "visualBrief", "backgroundPrompt"],
  properties: {
    slideId: { type: "string" },
    visualBrief: {
      type: "string",
      description: "A concrete visual brief for this slide image using the user prompt and planned slide.",
    },
    backgroundPrompt: {
      type: "string",
      description: "A natural plain-text image generation prompt for the slide picture with concrete scene, subject, setting, objects, composition, lighting, camera/framing, style, and reference usage. Do not use markdown headings or production checklist labels.",
    },
  },
};

export const singleFullGraphicImagePromptWriterSchema = {
  type: "object",
  additionalProperties: false,
  required: ["slideId", "visualBrief", "finalImagePrompt"],
  properties: {
    slideId: { type: "string" },
    visualBrief: {
      type: "string",
      description: "A concrete visual brief for this finished graphic using the user prompt and planned slide.",
    },
    finalImagePrompt: {
      type: "string",
      description: "A direct image generation prompt for a complete finished graphic. Write as one plain text prompt using markdown-style section headings: ### Create, ### Shared style, ### Visible text exact line breaks, ### Typography, ### Scene, ### Camera and framing, ### Style consistency.",
    },
  },
};
