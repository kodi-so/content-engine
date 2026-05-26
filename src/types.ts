import type { Doc, Id } from "../convex/_generated/dataModel";

export type BrandId = Id<"brands">;
export type CreativeAssetId = Id<"creativeAssets">;
export type PersonaId = Id<"personas">;
export type SocialAccountId = Id<"socialAccounts">;
export type WorkflowId = Id<"workflows">;
export type WorkflowRunId = Id<"workflowRuns">;
export type DistributionPlanId = Id<"distributionPlans">;
export type ContentRequestId = Id<"contentRequests">;

export type PublishingProvider = "postiz" | "post_bridge" | "manual";
export type Platform = "tiktok" | "instagram" | "youtube" | "x" | "linkedin";
export type ContentFormat =
  | "slideshow"
  | "hook_demo_video"
  | "ai_ugc_video"
  | "talking_avatar"
  | "short_educational_video"
  | "static_image"
  | "thread"
  | "caption_set";
export type CreativeAssetKind =
  | "product"
  | "style_reference"
  | "mascot"
  | "persona"
  | "voice"
  | "logo"
  | "character"
  | "person"
  | "other";

export type ArtifactDoc = Doc<"artifacts">;
export type DistributionPlanDoc = Doc<"distributionPlans">;
export type WorkflowDoc = Doc<"workflows">;
export type WorkflowRunDoc = Doc<"workflowRuns">;
export type ContentRequestDoc = Doc<"contentRequests">;
export type SlideshowDoc = Doc<"slideshows">;
export type CreativeAssetDoc = Doc<"creativeAssets">;
export type PersonaDoc = Doc<"personas">;
export type PersonaType =
  | "ai_influencer"
  | "ugc_actor"
  | "transformation_identity"
  | "mascot"
  | "spokesperson"
  | "customer_avatar"
  | "other";

export type SlideshowRenderingMode = "background_plus_overlay" | "full_graphic_generation";

export type SlideshowTextBlock = {
  id?: string;
  role?: "eyebrow" | "headline" | "body" | "bullet_list" | "cta";
  text?: string;
  items?: string[];
  emphasis?: "primary" | "secondary" | "muted";
  x?: number;
  y?: number;
  width?: number;
  align?: "left" | "center" | "right";
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundStyle?: "none" | "solid";
  backgroundColor?: string;
  backgroundOpacity?: number;
};

export type CanonicalSlideshowSlide = {
  slideId: string;
  index: number;
  renderingMode?: SlideshowRenderingMode;
  role?: string;
  purpose?: string;
  useReferenceImage?: boolean;
  backgroundPrompt?: string;
  finalImagePrompt?: string;
  visibleText?: string;
  textBlocks?: SlideshowTextBlock[];
  layout?: {
    intent?: string;
    template?: string;
    textZone?: "top" | "center" | "bottom" | "split";
    density?: "sparse" | "medium" | "dense";
    contrast?: "none" | "shadow" | "gradient_scrim" | "solid_scrim";
  };
  status?: "active" | "deleted";
  dimensions?: { width: number; height: number };
  backgroundImageUrl?: string;
  sourceImageArtifactId?: string;
  updatedAt?: number;
};

export type CanonicalSlideshowSpec = {
  format?: "slideshow";
  renderingMode?: SlideshowRenderingMode;
  title?: string;
  aspectRatio?: "9:16" | "4:5" | "1:1";
  dimensions?: { width: number; height: number };
  exportSettings?: {
    previewMimeType?: string;
    publishMimeType?: string;
    width?: number;
    height?: number;
  };
  visualSystem?: string;
  creativeBrief?: string;
  strategy?: Record<string, unknown>;
  slides?: CanonicalSlideshowSlide[];
};
