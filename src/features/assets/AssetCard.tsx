import { Check, Maximize2 } from "lucide-react";
import { AssetThumbnail } from "./AssetThumbnail";
import type { AssetPreviewItem } from "./assetTypes";

export function AssetCard({
  asset,
  meta,
  onPreview,
  onSelect,
  selected = false,
}: {
  asset: AssetPreviewItem;
  meta?: string;
  onPreview?: (asset: AssetPreviewItem) => void;
  onSelect?: (asset: AssetPreviewItem) => void;
  selected?: boolean;
}) {
  return (
    <article
      aria-selected={selected}
      className={`group grid min-w-0 gap-[var(--space-2)] rounded-[var(--radius-md)] border p-[var(--space-2)] text-left transition ${
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
          : "border-[var(--color-border)] bg-[var(--color-page)] hover:border-[var(--color-border-strong)]"
      } ${onSelect ? "cursor-pointer" : ""}`}
      onClick={() => onSelect?.(asset)}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(asset);
        }
      }}
      role={onSelect ? "option" : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-page-quiet)]">
        {onPreview ? (
          <button
            aria-label={`Preview ${asset.title}`}
            className="block h-full w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
            onClick={(event) => {
              event.stopPropagation();
              onPreview(asset);
            }}
            type="button"
          >
            <AssetThumbnail asset={asset} />
          </button>
        ) : (
          <AssetThumbnail asset={asset} />
        )}
        {selected ? (
          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[var(--color-primary)] text-white">
            <Check size={14} />
          </span>
        ) : onPreview ? (
          <span className="pointer-events-none absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/45 text-white opacity-0 shadow-[0_8px_18px_rgb(15_23_42_/_0.2)] transition group-hover:opacity-100">
            <Maximize2 size={13} />
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[0.78rem] font-[760] text-[var(--color-ink)]">
          {asset.title}
        </div>
        {meta ? (
          <div className="truncate text-[0.7rem] text-[var(--color-ink-muted)]">
            {meta}
          </div>
        ) : null}
      </div>
    </article>
  );
}
