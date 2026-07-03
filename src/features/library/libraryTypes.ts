import type { Id } from "../../../convex/_generated/dataModel";
import type { WorkflowDoc, WorkflowRunDoc } from "../../types";

export type LibraryOutput = {
  id: string;
  artifactId?: Id<"artifacts">;
  creativeAssetId?: Id<"creativeAssets">;
  title: string;
  type: string;
  source: "create" | "workflow" | "creative_asset";
  createdAt: number;
  workflowId?: string;
  workflowRunId?: string;
  provider?: string;
  model?: string;
  prompt?: string;
  latestEditPrompt?: string;
  summary?: string;
  storageUrl: string;
  mimeType?: string;
  aspectRatio?: string;
};

export type LibraryRunGroup = {
  id: string;
  workflowId: string;
  run?: WorkflowRunDoc;
  outputs: LibraryOutput[];
  createdAt: number;
};

export type LibraryWorkflowGroup = {
  id: string;
  workflow?: WorkflowDoc;
  runs: LibraryRunGroup[];
  outputCount: number;
  latestAt: number;
};

export type CandidateImage = {
  artifactId: Id<"artifacts">;
  storageUrl: string;
  title: string;
};
