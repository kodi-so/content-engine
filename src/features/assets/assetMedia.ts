import type { MediaLightboxItem } from "../../components/MediaLightbox";
import type { AssetPreviewItem, SelectableLibraryAsset } from "./assetTypes";

export function isImageAsset(asset: Pick<AssetPreviewItem, "mimeType" | "mediaKind" | "kind" | "type">) {
  return (
    asset.mimeType?.startsWith("image/") ||
    asset.mediaKind === "image" ||
    asset.kind === "image" ||
    asset.type === "image"
  );
}

export function isVideoAsset(asset: Pick<AssetPreviewItem, "mimeType" | "mediaKind" | "kind" | "type">) {
  return (
    asset.mimeType?.startsWith("video/") ||
    asset.mediaKind === "video" ||
    asset.kind === "video" ||
    asset.type === "video"
  );
}

export function isAudioAsset(asset: Pick<AssetPreviewItem, "mimeType" | "mediaKind" | "kind" | "type">) {
  return (
    asset.mimeType?.startsWith("audio/") ||
    asset.mediaKind === "audio" ||
    asset.kind === "audio" ||
    asset.type === "audio"
  );
}

export function assetMatchesQuery(
  asset: SelectableLibraryAsset,
  query: string,
  sourceLabel: string
) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return true;

  return [
    asset.title,
    asset.prompt,
    asset.provider,
    asset.model,
    sourceLabel,
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(cleanQuery));
}

export function mediaLightboxItemForAsset(
  asset: AssetPreviewItem,
  meta?: string
): MediaLightboxItem | null {
  if (!asset.storageUrl || (!isImageAsset(asset) && !isVideoAsset(asset))) {
    return null;
  }

  return {
    kind: isVideoAsset(asset) ? "video" : "image",
    src: asset.storageUrl,
    title: asset.title,
    meta,
  };
}
