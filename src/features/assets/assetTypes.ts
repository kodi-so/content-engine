import type { LocalReferenceFileKind } from "../../lib/create/createConfigFields";

export type AssetSource = "create" | "creative_asset";

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
};

export const assetSourceLongLabels: Record<AssetSource, string> = {
  create: "Create",
  creative_asset: "Library asset",
};
