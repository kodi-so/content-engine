import type { Doc, Id } from "../convex/_generated/dataModel";

export type BrandId = Id<"brands">;
export type SocialAccountId = Id<"socialAccounts">;
export type WorkflowId = Id<"workflows">;
export type WorkflowRunId = Id<"workflowRuns">;
export type DistributionPlanId = Id<"distributionPlans">;
export type ContentRequestId = Id<"contentRequests">;

export type PublishingProvider = "postiz" | "post_bridge" | "reel_farm" | "manual";
export type Platform = "tiktok" | "instagram" | "youtube" | "x" | "linkedin";
export type ContentFormat = "slideshow" | "hook_demo_video" | "ai_ugc_video";

export type ArtifactDoc = Doc<"artifacts">;
export type DistributionPlanDoc = Doc<"distributionPlans">;
export type WorkflowDoc = Doc<"workflows">;
export type WorkflowRunDoc = Doc<"workflowRuns">;
export type ContentRequestDoc = Doc<"contentRequests">;
export type SlideshowDoc = Doc<"slideshows">;

export type SlideshowTextBlock = {
  role?: "eyebrow" | "headline" | "body" | "bullet_list" | "cta";
  text?: string;
  items?: string[];
  emphasis?: "primary" | "secondary" | "muted";
};

export type CanonicalSlideshowSlide = {
  slideId: string;
  index: number;
  role?: string;
  purpose?: string;
  visualPrompt?: string;
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
  title?: string;
  caption?: string;
  aspectRatio?: "9:16" | "4:5" | "1:1";
  dimensions?: { width: number; height: number };
  exportSettings?: {
    previewMimeType?: string;
    publishMimeType?: string;
    width?: number;
    height?: number;
  };
  creativeBrief?: string;
  strategy?: Record<string, unknown>;
  slides?: CanonicalSlideshowSlide[];
};
