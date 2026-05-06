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
  primaryText: string;
  secondaryText?: string;
  bullets: string[];
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

export const overlaySlideshowPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "renderingMode", "creativeBrief", "visualSystem", "title", "aspectRatio", "slides"],
  properties: {
    format: { type: "string", enum: ["slideshow"] },
    renderingMode: { type: "string", enum: ["background_plus_overlay"] },
    creativeBrief: creativeBriefSchema,
    visualSystem: { type: "string" },
    title: { type: "string" },
    aspectRatio: { type: "string", enum: ["9:16", "4:5", "1:1"] },
    slides: {
      type: "array",
      minItems: 4,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideId", "purpose", "primaryText", "secondaryText", "bullets", "layout"],
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
    visualSystem: { type: "string" },
    title: { type: "string" },
    aspectRatio: { type: "string", enum: ["9:16", "4:5", "1:1"] },
    slides: {
      type: "array",
      minItems: 4,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideId", "purpose", "visibleText"],
        properties: {
          slideId: { type: "string" },
          purpose: { type: "string" },
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
      minItems: 4,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideId", "visualBrief", "backgroundPrompt"],
        properties: {
          slideId: { type: "string" },
          visualBrief: {
            type: "string",
            minLength: 500,
            description: "A concrete visual grounding brief for this slide. Use most of the brief for unique slide-specific scene/action facts: subject mechanics, object or equipment components, spatial relationships, subject orientation, interaction points, object positions, direction of motion, and action moment. When a named concept has multiple visual variants, identify the specific variant that fits the user prompt. Also include composition, camera/framing, style, and reference usage.",
          },
          backgroundPrompt: {
            type: "string",
            minLength: 700,
            description: "A detailed production image generation prompt describing the slide image scene with concrete visible details: subject, placement, pose/action/state, environment, important objects, spatial relationships, camera angle, framing, lighting, color palette, texture, mood, visual style, and reference usage. For demonstrations, include setup, object geometry, subject-object interaction, direction of motion, and action moment.",
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
      minItems: 4,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideId", "visualBrief", "finalImagePrompt"],
        properties: {
          slideId: { type: "string" },
          visualBrief: {
            type: "string",
            minLength: 600,
            description: "A concrete visual grounding brief for this slide. Use most of the brief for unique slide-specific scene/action facts: subject mechanics, object or equipment components, spatial relationships, subject orientation, interaction points, object positions, direction of motion, and action moment. When a named concept has multiple visual variants, identify the specific variant that fits the user prompt. Also include exact text, typography, composition, camera/framing, style, and reference usage.",
          },
          finalImagePrompt: {
            type: "string",
            minLength: 900,
            description: "A detailed production image generation prompt for a complete finished graphic. Write as one concise plain text prompt using markdown-style section headings: ### Create, ### Shared style, ### Visible text exact line breaks, ### Typography, ### Scene, ### Camera and framing, ### Style consistency. Use affirmative visual descriptions of included subjects, objects, spaces, styling, and composition. Include exact visible text, line breaks, typography placement and treatment for complete named phrases, font style, text color/treatment, relationship between text and imagery, requested graphic elements, subject placement, pose/action/state, environment, important objects, spatial relationships, camera angle, framing, lighting, color palette, texture, visual style, and reference usage. For demonstrations, choose the clearest view for the action and include setup, object geometry, subject-object interaction, direction of motion, and action moment.",
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
      minLength: 500,
      description: "A concrete visual grounding brief for this slide. Use most of the brief for unique slide-specific scene/action facts: subject mechanics, object or equipment components, spatial relationships, subject orientation, interaction points, object positions, direction of motion, and action moment. Also include composition, camera/framing, style, and reference usage.",
    },
    backgroundPrompt: {
      type: "string",
      minLength: 700,
      description: "A detailed production image generation prompt describing the slide image scene with concrete visible details. Write as one plain text prompt using markdown-style section headings: ### Create, ### Scene, ### Camera and framing, ### Visual style, ### Reference usage. Use affirmative visual descriptions of included subjects, objects, spaces, styling, and composition. Include subject, placement, pose/action/state, environment, important objects, spatial relationships, camera angle, framing, lighting, color palette, texture, mood, visual style, and reference usage. For demonstrations, include exact setup, object geometry, subject-object interaction, direction of motion, and action moment.",
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
      minLength: 600,
      description: "A concrete visual grounding brief for this slide. Use most of the brief for unique slide-specific scene/action facts: subject mechanics, object or equipment components, spatial relationships, subject orientation, interaction points, object positions, direction of motion, and action moment. Also include exact text, typography, composition, camera/framing, style, and reference usage.",
    },
    finalImagePrompt: {
      type: "string",
      minLength: 900,
      description: "A detailed production image generation prompt for a complete finished graphic. Write as one concise plain text prompt using markdown-style section headings: ### Create, ### Shared style, ### Visible text exact line breaks, ### Typography, ### Scene, ### Camera and framing, ### Style consistency. Use affirmative visual descriptions of included subjects, objects, spaces, styling, and composition. Include exact visible text, line breaks, typography placement and treatment for complete named phrases, font style, text color/treatment, relationship between text and imagery, requested graphic elements, subject placement, pose/action/state, environment, important objects, spatial relationships, camera angle, framing, lighting, color palette, texture, visual style, and reference usage. For demonstrations, choose the clearest view for the action and include setup, object geometry, subject-object interaction, direction of motion, and action moment.",
    },
  },
};
