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
