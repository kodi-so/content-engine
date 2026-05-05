export type TextBlockRole = "eyebrow" | "headline" | "body" | "bullet_list" | "cta";
export type TextBlockEmphasis = "primary" | "secondary" | "muted";
export type SlideTemplate = "center_punch" | "bottom_stack" | "top_hook_bottom_body" | "checklist";

export type SlideshowTextBlock = {
  role: TextBlockRole;
  text: string;
  items: string[];
  emphasis: TextBlockEmphasis;
};

export type SlideshowSlide = {
  index: number;
  role: "hook" | "setup" | "insight" | "proof" | "payoff" | "cta";
  visualPrompt: string;
  textBlocks: SlideshowTextBlock[];
  layout: {
    template: SlideTemplate;
    textZone: "top" | "center" | "bottom" | "split";
    contrast: "none" | "shadow" | "gradient_scrim" | "solid_scrim";
    stylePreset: "dark_minimal_tiktok";
  };
};

export type SlideshowPlan = {
  format: "slideshow";
  aspectRatio: "9:16" | "4:5" | "1:1";
  title: string;
  hook: string;
  caption: string;
  creativeBrief: string;
  slides: SlideshowSlide[];
};

export const slideshowPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "aspectRatio", "title", "hook", "caption", "creativeBrief", "slides"],
  properties: {
    format: { type: "string", enum: ["slideshow"] },
    aspectRatio: { type: "string", enum: ["9:16", "4:5", "1:1"] },
    title: { type: "string" },
    hook: { type: "string" },
    caption: { type: "string" },
    creativeBrief: { type: "string" },
    slides: {
      type: "array",
      minItems: 4,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "role", "visualPrompt", "textBlocks", "layout"],
        properties: {
          index: { type: "number" },
          role: {
            type: "string",
            enum: ["hook", "setup", "insight", "proof", "payoff", "cta"],
          },
          visualPrompt: { type: "string" },
          textBlocks: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["role", "text", "items", "emphasis"],
              properties: {
                role: {
                  type: "string",
                  enum: ["eyebrow", "headline", "body", "bullet_list", "cta"],
                },
                text: { type: "string" },
                items: {
                  type: "array",
                  maxItems: 4,
                  items: { type: "string" },
                },
                emphasis: {
                  type: "string",
                  enum: ["primary", "secondary", "muted"],
                },
              },
            },
          },
          layout: {
            type: "object",
            additionalProperties: false,
            required: ["template", "textZone", "contrast", "stylePreset"],
            properties: {
              template: {
                type: "string",
                enum: ["center_punch", "bottom_stack", "top_hook_bottom_body", "checklist"],
              },
              textZone: {
                type: "string",
                enum: ["top", "center", "bottom", "split"],
              },
              contrast: {
                type: "string",
                enum: ["none", "shadow", "gradient_scrim", "solid_scrim"],
              },
              stylePreset: { type: "string", enum: ["dark_minimal_tiktok"] },
            },
          },
        },
      },
    },
  },
};
