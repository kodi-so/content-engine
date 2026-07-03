import { MediaLightbox } from "../../components/MediaLightbox";
import { mediaLightboxItemForAsset } from "./assetMedia";
import type { AssetPreviewItem } from "./assetTypes";

export function AssetPreviewModal({
  asset,
  meta,
  onClose,
}: {
  asset: AssetPreviewItem | null;
  meta?: string;
  onClose: () => void;
}) {
  return (
    <MediaLightbox
      media={asset ? mediaLightboxItemForAsset(asset, meta) : null}
      onClose={onClose}
    />
  );
}
