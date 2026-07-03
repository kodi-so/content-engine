import { File, Image, Mic, UserRound, Video } from "lucide-react";
import { AssetThumbnail } from "./AssetThumbnail";
import { isAudioAsset, isImageAsset, isVideoAsset } from "./assetMedia";
import type { AssetPreviewItem } from "./assetTypes";

function fallbackIcon(asset: AssetPreviewItem) {
  if (isImageAsset(asset)) return Image;
  if (isVideoAsset(asset)) return Video;
  if (isAudioAsset(asset)) return Mic;
  return asset.storageUrl ? File : UserRound;
}

export function AssetListItem({
  active = false,
  asset,
  disabled = false,
  meta,
  onPreview,
  onSelect,
}: {
  active?: boolean;
  asset: AssetPreviewItem;
  disabled?: boolean;
  meta?: string;
  onPreview?: (asset: AssetPreviewItem) => void;
  onSelect: (asset: AssetPreviewItem) => void;
}) {
  const Icon = fallbackIcon(asset);
  const canPreview = Boolean(onPreview && asset.storageUrl && (isImageAsset(asset) || isVideoAsset(asset)));

  return (
    <div
      aria-disabled={disabled}
      aria-selected={active}
      className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-[var(--space-2)] rounded-[var(--radius-xs)] px-[var(--space-2)] py-[var(--space-2)] text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active ? "bg-[var(--color-primary-soft)]" : "hover:bg-[var(--color-page-quiet)]"
      } ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
      onMouseDown={(event) => {
        event.preventDefault();
        if (disabled) return;
        onSelect(asset);
      }}
      role="option"
    >
      {asset.storageUrl ? (
        <button
          aria-label={canPreview ? `Preview ${asset.title}` : asset.title}
          className={`relative block size-9 overflow-hidden rounded-[var(--radius-xs)] border border-[var(--color-border)] bg-[var(--color-page)] p-0 text-left ${
            canPreview ? "cursor-zoom-in" : "cursor-pointer"
          }`}
          disabled={disabled}
          onMouseDown={(event) => {
            if (!canPreview) return;
            event.preventDefault();
            event.stopPropagation();
            onPreview?.(asset);
          }}
          type="button"
        >
          <AssetThumbnail asset={asset} videoPlayIndicator="centerCompact" />
        </button>
      ) : (
        <span className="grid size-9 place-items-center rounded-[var(--radius-xs)] border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-primary)]">
          <Icon size={16} />
        </span>
      )}
      <span className="grid min-w-0 gap-[0.08rem]">
        <span className="truncate text-[0.84rem] font-[780] text-[var(--color-ink)]">
          {asset.title}
        </span>
        {meta ? (
          <span className="truncate text-[0.72rem] text-[var(--color-ink-muted)]">
            {meta}
          </span>
        ) : null}
      </span>
    </div>
  );
}
