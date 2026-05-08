import type { Doc } from "../_generated/dataModel";

export type ArtifactType = Doc<"artifacts">["type"];
export type ContentFormat = Doc<"workflows">["contentFormat"];

export const slideshowSpecSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "aspectRatio", "hook", "slides"],
  properties: {
    format: { type: "string", enum: ["slideshow"] },
    aspectRatio: { type: "string", enum: ["9:16", "4:5", "1:1"] },
    hook: { type: "string" },
    slides: {
      type: "array",
      minItems: 2,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "index",
          "role",
          "headline",
          "body",
          "visualPrompt",
          "layout",
        ],
        properties: {
          index: { type: "number" },
          role: {
            type: "string",
            enum: ["hook", "setup", "insight", "proof", "payoff", "cta"],
          },
          headline: { type: "string" },
          body: { type: "string" },
          visualPrompt: { type: "string" },
          layout: {
            type: "object",
            additionalProperties: false,
            required: ["textPosition", "contrastStrategy"],
            properties: {
              textPosition: {
                type: "string",
                enum: ["top", "center", "bottom", "split"],
              },
              contrastStrategy: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export function defaultStructuredArtifactType(format: ContentFormat): ArtifactType {
  switch (format) {
    case "slideshow":
      return "slide_spec";
    case "hook_demo_video":
    case "ai_ugc_video":
    case "talking_avatar":
    case "short_educational_video":
      return "scene_spec";
    case "thread":
      return "text_draft";
    case "caption_set":
      return "caption";
    case "static_image":
      return "image_prompt";
  }
}

export function defaultStructuredSchema(format: ContentFormat): unknown | undefined {
  if (format === "slideshow") {
    return slideshowSpecSchema;
  }

  return undefined;
}

export function buildStructuredGenerationPrompt(args: {
  format: ContentFormat;
  brandName: string;
  audience?: string;
  voice?: string;
  visualStyle?: string;
  offer?: string;
  constraints?: string[];
  workflowName: string;
  workflowDescription?: string;
  stepName: string;
}): string {
  if (args.format === "slideshow") {
    return [
      `Create a short-form slideshow spec for ${args.brandName}.`,
      `Workflow: ${args.workflowName}`,
      args.workflowDescription ? `Workflow goal: ${args.workflowDescription}` : undefined,
      args.audience ? `Audience: ${args.audience}` : undefined,
      args.voice ? `Brand voice: ${args.voice}` : undefined,
      args.visualStyle ? `Visual style: ${args.visualStyle}` : undefined,
      args.offer ? `Offer: ${args.offer}` : undefined,
      args.constraints?.length ? `Constraints: ${args.constraints.join("; ")}` : undefined,
      "Return one cohesive slideshow with 4-8 slides.",
      "Each slide needs concise overlay text and a detailed visual prompt suitable for image generation.",
      "Make the sequence feel specific, useful, and scroll-stopping.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Create a structured ${args.format} content spec for ${args.brandName}.`,
    `Workflow: ${args.workflowName}`,
    args.workflowDescription ? `Workflow goal: ${args.workflowDescription}` : undefined,
    args.audience ? `Audience: ${args.audience}` : undefined,
    args.voice ? `Brand voice: ${args.voice}` : undefined,
    args.visualStyle ? `Visual style: ${args.visualStyle}` : undefined,
    args.constraints?.length ? `Constraints: ${args.constraints.join("; ")}` : undefined,
    `Step: ${args.stepName}`,
  ]
    .filter(Boolean)
    .join("\n");
}
