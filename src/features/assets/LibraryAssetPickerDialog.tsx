import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LocalReferenceFileKind } from "../../lib/create/createConfigFields";
import { AssetCard } from "./AssetCard";
import { assetMatchesQuery } from "./assetMedia";
import { AssetPreviewModal } from "./AssetPreviewModal";
import {
  assetSourceLabels,
  type AssetPreviewItem,
  type SelectableLibraryAsset,
} from "./assetTypes";

type LibraryAssetPickerDialogProps = {
  assets?: SelectableLibraryAsset[];
  description: string;
  kind?: LocalReferenceFileKind;
  maxSelection?: number;
  multiple?: boolean;
  onClose: () => void;
  onSelect: (assets: SelectableLibraryAsset[]) => void;
  open: boolean;
  title?: string;
};

export function LibraryAssetPickerDialog({
  assets,
  description,
  kind = "media",
  maxSelection,
  multiple = false,
  onClose,
  onSelect,
  open,
  title = "Choose from Library",
}: LibraryAssetPickerDialogProps) {
  const [previewAsset, setPreviewAsset] = useState<AssetPreviewItem | null>(null);
  const [query, setQuery] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const selectableAssets = useMemo(
    () => (assets ?? []).filter((asset) => kind === "media" || asset.mediaKind === kind),
    [assets, kind]
  );
  const filteredAssets = useMemo(
    () => selectableAssets.filter((asset) =>
      assetMatchesQuery(asset, query, assetSourceLabels[asset.source])
    ),
    [query, selectableAssets]
  );
  const selectedAssets = selectableAssets.filter((asset) =>
    selectedAssetIds.includes(asset.id)
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedAssetIds([]);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !previewAsset) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open, previewAsset]);

  if (!open) return null;

  const toggleSelectedAsset = (asset: SelectableLibraryAsset) => {
    setSelectedAssetIds((current) => {
      if (current.includes(asset.id)) {
        return current.filter((id) => id !== asset.id);
      }
      if (!multiple) return [asset.id];
      if (maxSelection && current.length >= maxSelection) return current;
      return [...current, asset.id];
    });
  };

  const useSelectedAssets = () => {
    if (!selectedAssets.length) return;
    onSelect(selectedAssets);
    onClose();
  };

  return (
    <>
      <div
        aria-modal="true"
        className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-[var(--space-4)]"
        role="dialog"
      >
        <div className="grid max-h-[min(44rem,92vh)] w-full max-w-[54rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]">
          <div className="flex items-start justify-between gap-[var(--space-3)] border-b border-[var(--color-border)] p-[var(--space-4)]">
            <div>
              <h3 className="m-0 text-[1rem] font-[800] text-[var(--color-ink)]">
                {title}
              </h3>
              <p className="m-0 mt-1 text-[0.84rem] text-[var(--color-ink-muted)]">
                {description}
              </p>
            </div>
            <button
              aria-label="Close library picker"
              className="grid size-8 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
              onClick={onClose}
              type="button"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-[var(--space-3)] overflow-hidden p-[var(--space-4)]">
            <label className="flex min-h-[2.4rem] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-3)]">
              <Search className="text-[var(--color-ink-muted)]" size={15} />
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-[0.86rem] outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search saved assets"
                value={query}
              />
            </label>

            <div className="max-h-[25rem] overflow-auto" role="listbox">
              {filteredAssets.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-[var(--space-3)]">
                  {filteredAssets.map((asset) => (
                    <AssetCard
                      asset={asset}
                      key={asset.id}
                      meta={`${assetSourceLabels[asset.source]}${asset.model ? ` · ${asset.model}` : ""}`}
                      onPreview={setPreviewAsset}
                      onSelect={() => toggleSelectedAsset(asset)}
                      selected={selectedAssetIds.includes(asset.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">No matching library assets.</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)] border-t border-[var(--color-border)] p-[var(--space-4)]">
            <span className="text-[0.8rem] text-[var(--color-ink-muted)]">
              {selectedAssetIds.length} selected
            </span>
            <div className="flex flex-wrap gap-[var(--space-2)]">
              <button className="secondary-button" onClick={onClose} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={!selectedAssets.length}
                onClick={useSelectedAssets}
                type="button"
              >
                Use selected
              </button>
            </div>
          </div>
        </div>
      </div>

      <AssetPreviewModal
        asset={previewAsset}
        onClose={() => setPreviewAsset(null)}
      />
    </>
  );
}
