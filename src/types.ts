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

export type SlideshowBundle = {
  key: string;
  workflowRunId?: WorkflowRunId;
  contentRequestId?: ContentRequestId;
  title: string;
  subtitle: string;
  reviewStatus: string;
  artifacts: ArtifactDoc[];
};
