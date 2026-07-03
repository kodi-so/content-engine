import type { LocalReferenceFileKind } from "../../lib/workflow/workflowConfigFields";

export type AssetSource = "create" | "workflow_export" | "creative_asset";

export type SelectableLibraryAsset = {
  id: string;
  source: AssetSource;
  sourceId: string;
  title: string;
  storageUrl: string;
  mimeType?: string;
  mediaKind: LocalReferenceFileKind;
  prompt?: string;
  provider?: string;
  model?: string;
  createdAt: number;
};

export type AssetPreviewItem = {
  id?: string;
  title: string;
  storageUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  mediaKind?: string;
  kind?: string;
  type?: string;
  aspectRatio?: string;
};

export const assetSourceLabels: Record<AssetSource, string> = {
  create: "Create",
  creative_asset: "Asset",
  workflow_export: "Workflow",
};

export const assetSourceLongLabels: Record<AssetSource, string> = {
  create: "Create",
  creative_asset: "Library asset",
  workflow_export: "Workflow export",
};
