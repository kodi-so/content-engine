import { X } from "lucide-react";
import { AssetThumbnail } from "./AssetThumbnail";
import type { AssetPreviewItem } from "./assetTypes";

export function AssetMentionChip({
  asset,
  meta,
  onRemove,
  size = "default",
  tone = "default",
}: {
  asset: AssetPreviewItem;
  meta?: string;
  onRemove?: () => void;
  size?: "default" | "inline";
  tone?: "default" | "inverse";
}) {
  const inverse = tone === "inverse";
  const inline = size === "inline";

  return (
    <span
      className={`inline-grid max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center text-left align-baseline ${
        inline
          ? "mx-[0.1rem] min-h-7 gap-[0.32rem] rounded-full px-[0.35rem] py-[0.16rem]"
          : "min-h-10 gap-[0.45rem] rounded-[var(--radius-sm)] px-[0.45rem] py-[0.35rem]"
      } border ${
        inverse
          ? "border-white/20 bg-white/15 text-white"
          : "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink)]"
      }`}
    >
      <span
        className={`block overflow-hidden border border-black/10 bg-[var(--color-page-quiet)] ${
          inline ? "size-5 rounded-full" : "size-8 rounded-[var(--radius-xs)]"
        }`}
      >
        <AssetThumbnail asset={asset} videoPlayIndicator="centerCompact" />
      </span>
      <span className="grid min-w-0 gap-[0.04rem]">
        <span
          className={`truncate font-[800] leading-tight ${
            inline ? "text-[0.78em]" : "text-[0.76rem]"
          }`}
        >
          {asset.title}
        </span>
        {meta && !inline ? (
          <span
            className={`truncate text-[0.68rem] font-[690] leading-tight ${
              inverse ? "text-white/72" : "text-[var(--color-ink-muted)]"
            }`}
          >
            {meta}
          </span>
        ) : null}
      </span>
      {onRemove ? (
        <button
          aria-label={`Remove ${asset.title}`}
          className={`grid place-items-center rounded-full transition ${
            inline ? "size-4" : "size-5"
          } ${
            inverse
              ? "text-white/72 hover:bg-white/15 hover:text-white"
              : "text-[var(--color-ink-muted)] hover:bg-[var(--color-page-quiet)] hover:text-[var(--color-danger)]"
          }`}
          onClick={onRemove}
          type="button"
        >
          <X size={12} />
        </button>
      ) : null}
    </span>
  );
}
