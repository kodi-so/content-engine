import type { PublishingProvider } from "../../types";
import type { WorkflowGraph } from "./workflowGraph";

export type WorkflowTemplateId =
  | "persona_image_set"
  | "ai_ugc_ad"
  | "before_after_transformation"
  | "slideshow_carousel"
  | "app_demo_video"
  | "talking_avatar"
  | "hook_broll_voiceover_short";

export type WorkflowTemplateCategory =
  | "persona"
  | "ugc"
  | "transformation"
  | "slideshow"
  | "app_demo"
  | "video";

export type WorkflowTemplatePlaceholderKind =
  | "brand_context"
  | "persona"
  | "media"
  | "prompt"
  | "product_context"
  | "voice"
  | "platform";

export type WorkflowTemplatePlaceholder = {
  key: string;
  label: string;
  kind: WorkflowTemplatePlaceholderKind;
  required: boolean;
  description: string;
};

export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  name: string;
  category: WorkflowTemplateCategory;
  description: string;
  purpose: string;
  outputType: "image_set" | "video" | "slideshow" | "carousel" | "post_package";
  defaultPublishingProvider: PublishingProvider;
  requiredInputs: WorkflowTemplatePlaceholder[];
  graph: WorkflowGraph;
};

export type WorkflowTemplateDraftInput = {
  creativeRequest?: string;
};
