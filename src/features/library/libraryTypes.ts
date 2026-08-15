import type { Id } from "../../../convex/_generated/dataModel";

export type LibraryOutput = {
  id: string;
  artifactId?: Id<"artifacts">;
  creativeAssetId?: Id<"creativeAssets">;
  title: string;
  type: string;
  source: "create" | "creative_asset";
  createdAt: number;
  provider?: string;
  model?: string;
  prompt?: string;
  latestEditPrompt?: string;
  summary?: string;
  storageUrl: string;
  mimeType?: string;
  aspectRatio?: string;
};

export type CandidateImage = {
  artifactId: Id<"artifacts">;
  storageUrl: string;
  title: string;
};

export type LibraryTextDraft = {
  artifactId: Id<"artifacts">;
  title: string;
  type: "text_draft" | "caption" | "script" | "scene_spec" | "shot_list";
  text: string;
  createdAt: number;
  provider?: string;
  model?: string;
  prompt?: string;
  reviewStatus: "not_required" | "pending" | "approved" | "rejected" | "needs_revision";
};
