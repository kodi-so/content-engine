import {
  Check,
  Library,
  Music,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import type { LocalReferenceFileKind } from "../../lib/workflow/workflowConfigFields";

export type SelectableLibraryAsset = {
  id: string;
  source: "create" | "workflow_export" | "creative_asset";
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

export type SelectedReferenceFile = {
  id: string;
  storageUrl: string;
  title: string;
  mimeType?: string;
  kind: string;
};

type ReferenceAssetFieldProps = {
  accept: string;
  disabled?: boolean;
  disabledCopy?: string;
  files: SelectedReferenceFile[];
  helperText?: string;
  isUploading: boolean;
  kind: LocalReferenceFileKind;
  label: string;
  libraryAssets?: SelectableLibraryAsset[];
  maxCount?: number;
  multiple: boolean;
  onLibraryAssetsSelect: (assets: SelectableLibraryAsset[]) => void;
  onRemoveFile: (fileId: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
};

const sourceLabels: Record<SelectableLibraryAsset["source"], string> = {
  create: "Create",
  creative_asset: "Asset",
  workflow_export: "Workflow",
};

function isImage(asset: { mimeType?: string; mediaKind?: string; kind?: string }) {
  return asset.mimeType?.startsWith("image/") || asset.mediaKind === "image" || asset.kind === "image";
}

function isVideo(asset: { mimeType?: string; mediaKind?: string; kind?: string }) {
  return asset.mimeType?.startsWith("video/") || asset.mediaKind === "video" || asset.kind === "video";
}

function libraryAssetMatches(asset: SelectableLibraryAsset, query: string) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return true;

  return [
    asset.title,
    asset.prompt,
    asset.provider,
    asset.model,
    sourceLabels[asset.source],
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(cleanQuery));
}

function AssetPreview({
  asset,
  className = "",
}: {
  asset: Pick<SelectableLibraryAsset, "storageUrl" | "title" | "mimeType" | "mediaKind">;
  className?: string;
}) {
  if (isImage(asset)) {
    return (
      <img
        alt=""
        className={`h-full w-full object-cover ${className}`}
        src={asset.storageUrl}
      />
    );
  }

  if (isVideo(asset)) {
    return (
      <video
        className={`h-full w-full object-cover ${className}`}
        muted
        playsInline
        src={asset.storageUrl}
      />
    );
  }

  return (
    <div className={`grid h-full w-full place-items-center bg-[var(--color-page-quiet)] text-[var(--color-ink-muted)] ${className}`}>
      <Music size={18} />
    </div>
  );
}

export function ReferenceAssetField({
  accept,
  disabled = false,
  disabledCopy,
  files,
  helperText,
  isUploading,
  kind,
  label,
  libraryAssets,
  maxCount,
  multiple,
  onLibraryAssetsSelect,
  onRemoveFile,
  onUpload,
  required = false,
}: ReferenceAssetFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const remainingSlots = maxCount
    ? Math.max(0, maxCount - files.length)
    : multiple
      ? Number.POSITIVE_INFINITY
      : files.length
        ? 0
        : 1;
  const canAddMore = remainingSlots > 0;
  const filteredAssets = useMemo(
    () =>
      (libraryAssets ?? [])
        .filter((asset) => kind === "media" || asset.mediaKind === kind)
        .filter((asset) => libraryAssetMatches(asset, query)),
    [kind, libraryAssets, query]
  );
  const selectedAssets = filteredAssets.filter((asset) =>
    selectedAssetIds.includes(asset.id)
  );

  const openPicker = () => {
    setQuery("");
    setSelectedAssetIds([]);
    setPickerOpen(true);
  };

  const toggleSelectedAsset = (asset: SelectableLibraryAsset) => {
    setSelectedAssetIds((current) => {
      if (current.includes(asset.id)) {
        return current.filter((id) => id !== asset.id);
      }

      if (!multiple) return [asset.id];
      if (Number.isFinite(remainingSlots) && current.length >= remainingSlots) {
        return current;
      }

      return [...current, asset.id];
    });
  };

  const useSelectedAssets = () => {
    if (!selectedAssets.length) return;
    onLibraryAssetsSelect(selectedAssets);
    setPickerOpen(false);
    setSelectedAssetIds([]);
  };

  return (
    <div className="grid min-w-0 gap-[var(--space-2)]">
      <span className="text-[0.74rem] font-[780] text-[var(--color-ink-soft)]">
        {label}
        {required ? " *" : ""}
      </span>

      <div className="flex flex-wrap gap-[var(--space-2)]">
        <label
          className={`secondary-button min-h-[2.3rem] ${
            disabled || !canAddMore ? "pointer-events-none opacity-55" : ""
          }`}
        >
          <Upload size={15} />
          <span>{isUploading ? "Uploading..." : "Upload"}</span>
          <input
            accept={accept}
            className="hidden"
            disabled={disabled || isUploading || !canAddMore}
            multiple={multiple}
            onChange={onUpload}
            type="file"
          />
        </label>
        <button
          className="secondary-button min-h-[2.3rem]"
          disabled={disabled || !canAddMore}
          onClick={openPicker}
          type="button"
        >
          <Library size={15} />
          Library
        </button>
      </div>

      {files.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))] gap-[var(--space-2)]">
          {files.map((file) => (
            <div
              className="grid min-w-0 gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-2)]"
              key={file.id}
            >
              <div className="aspect-square overflow-hidden rounded-[var(--radius-xs)] bg-[var(--color-page-quiet)]">
                {isImage(file) ? (
                  <img alt="" className="h-full w-full object-cover" src={file.storageUrl} />
                ) : isVideo(file) ? (
                  <video className="h-full w-full object-cover" muted playsInline src={file.storageUrl} />
                ) : (
                  <div className="grid h-full place-items-center text-[var(--color-ink-muted)]">
                    <Music size={18} />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-[var(--space-2)]">
                <span className="min-w-0 flex-1 truncate text-[0.76rem] font-[720] text-[var(--color-ink)]">
                  {file.title}
                </span>
                <button
                  aria-label={`Remove ${file.title}`}
                  className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-xs)] border border-[var(--color-border)] text-[var(--color-ink-muted)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                  disabled={disabled}
                  onClick={() => onRemoveFile(file.id)}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <small className="text-[0.72rem] leading-[1.35] text-[var(--color-ink-muted)]">
          {disabled
            ? disabledCopy ?? "This field is disabled."
            : helperText ??
              (required ? "At least one file is required." : "No files selected.")}
          {maxCount
            ? ` Up to ${maxCount} allowed.`
            : !multiple
              ? " One file allowed."
              : null}
        </small>
      )}

      {disabled && files.length ? (
        <small className="text-[0.72rem] leading-[1.35] text-[var(--color-ink-muted)]">
          {disabledCopy ?? "Selected files are saved here but ignored while this field is disabled."}
        </small>
      ) : null}

      {pickerOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-[var(--space-4)]"
          role="dialog"
        >
          <div className="grid max-h-[min(44rem,92vh)] w-full max-w-[54rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]">
            <div className="flex items-start justify-between gap-[var(--space-3)] border-b border-[var(--color-border)] p-[var(--space-4)]">
              <div>
                <h3 className="m-0 text-[1rem] font-[800] text-[var(--color-ink)]">
                  Choose from Library
                </h3>
                <p className="m-0 mt-1 text-[0.84rem] text-[var(--color-ink-muted)]">
                  Select {multiple ? "assets" : "one asset"} for {label.toLowerCase()}.
                </p>
              </div>
              <button
                aria-label="Close library picker"
                className="grid size-8 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                onClick={() => setPickerOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-[var(--space-3)] overflow-hidden p-[var(--space-4)]">
              <label className="flex min-h-[2.4rem] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-3)]">
                <Search size={15} className="text-[var(--color-ink-muted)]" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[0.86rem] outline-none"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search saved assets"
                  value={query}
                />
              </label>

              <div className="max-h-[25rem] overflow-auto">
                {filteredAssets.length ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-[var(--space-3)]">
                    {filteredAssets.map((asset) => {
                      const selected = selectedAssetIds.includes(asset.id);
                      return (
                        <button
                          className={`grid min-w-0 gap-[var(--space-2)] rounded-[var(--radius-md)] border p-[var(--space-2)] text-left transition ${
                            selected
                              ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                              : "border-[var(--color-border)] bg-[var(--color-page)] hover:border-[var(--color-border-strong)]"
                          }`}
                          key={asset.id}
                          onClick={() => toggleSelectedAsset(asset)}
                          type="button"
                        >
                          <div className="relative aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-page-quiet)]">
                            <AssetPreview asset={asset} />
                            {selected ? (
                              <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[var(--color-primary)] text-white">
                                <Check size={14} />
                              </span>
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[0.78rem] font-[760] text-[var(--color-ink)]">
                              {asset.title}
                            </div>
                            <div className="truncate text-[0.7rem] text-[var(--color-ink-muted)]">
                              {sourceLabels[asset.source]}
                              {asset.model ? ` · ${asset.model}` : ""}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    No matching library assets.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)] border-t border-[var(--color-border)] p-[var(--space-4)]">
              <span className="text-[0.8rem] text-[var(--color-ink-muted)]">
                {selectedAssetIds.length} selected
              </span>
              <div className="flex flex-wrap gap-[var(--space-2)]">
                <button
                  className="secondary-button"
                  onClick={() => setPickerOpen(false)}
                  type="button"
                >
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
      ) : null}
    </div>
  );
}
