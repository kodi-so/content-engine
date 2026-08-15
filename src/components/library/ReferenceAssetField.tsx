import {
  ClipboardPaste,
  Library,
  Upload,
  X,
} from "lucide-react";
import { useState, type ChangeEvent, type ClipboardEvent } from "react";
import { isImageAsset, isVideoAsset } from "../../features/assets/assetMedia";
import { AssetPreviewModal } from "../../features/assets/AssetPreviewModal";
import { AssetThumbnail } from "../../features/assets/AssetThumbnail";
import { LibraryAssetPickerDialog } from "../../features/assets/LibraryAssetPickerDialog";
import {
  type AssetPreviewItem,
  type SelectableLibraryAsset,
} from "../../features/assets/assetTypes";
import type { LocalReferenceFileKind } from "../../lib/create/createConfigFields";
import { LoadingSignal } from "../ui";
export type { SelectableLibraryAsset } from "../../features/assets/assetTypes";

export type SelectedReferenceFile = {
  alias?: string;
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
  onUpdateFileAlias?: (fileId: string, alias: string) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  required?: boolean;
};

function extensionFromMimeType(mimeType: string) {
  const subtype = mimeType.split("/")[1]?.split("+")[0];
  if (!subtype) return "bin";
  if (subtype === "jpeg") return "jpg";
  return subtype;
}

function fileMatchesKind(file: File, kind: LocalReferenceFileKind) {
  if (kind === "media") {
    return file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      file.type.startsWith("audio/");
  }

  return file.type.startsWith(`${kind}/`);
}

function clipboardFilesFromPaste(event: ClipboardEvent<HTMLDivElement>) {
  return Array.from(event.clipboardData.files);
}

async function clipboardFilesFromRead() {
  if (!navigator.clipboard) return [];
  const read = (navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>;
  }).read;
  if (!read) return [];

  const items = await read.call(navigator.clipboard);
  const files: File[] = [];

  for (const item of items) {
    const type = item.types.find((itemType) =>
      itemType.startsWith("image/") ||
        itemType.startsWith("video/") ||
        itemType.startsWith("audio/")
    );
    if (!type) continue;

    const blob = await item.getType(type);
    files.push(
      new File([blob], `pasted-${Date.now()}.${extensionFromMimeType(type)}`, {
        type,
      })
    );
  }

  return files;
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
  onUpdateFileAlias,
  onUpload,
  required = false,
}: ReferenceAssetFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pasteStatus, setPasteStatus] = useState("");
  const [previewAsset, setPreviewAsset] = useState<AssetPreviewItem | null>(null);
  const remainingSlots = maxCount
    ? Math.max(0, maxCount - files.length)
    : multiple
      ? Number.POSITIVE_INFINITY
      : files.length
        ? 0
        : 1;
  const canAddMore = remainingSlots > 0;
  const previewMeta =
    previewAsset &&
    "alias" in previewAsset &&
    typeof previewAsset.alias === "string"
      ? previewAsset.alias
      : undefined;

  const openPicker = () => {
    setPickerOpen(true);
  };

  const uploadFiles = async (files: File[]) => {
    setPasteStatus("");
    const matchingFiles = files.filter((file) => fileMatchesKind(file, kind));
    if (!matchingFiles.length) {
      setPasteStatus("Clipboard does not contain a matching file.");
      return;
    }

    await onUpload(matchingFiles);
  };

  const handleClipboardRead = async () => {
    try {
      const files = await clipboardFilesFromRead();
      await uploadFiles(files);
    } catch (error) {
      setPasteStatus(
        error instanceof Error ? error.message : "Unable to read from clipboard."
      );
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = clipboardFilesFromPaste(event);
    if (!files.length || disabled || isUploading || !canAddMore) return;
    event.preventDefault();
    void uploadFiles(files);
  };

  return (
    <div
      className="grid min-w-0 gap-[var(--space-2)]"
      onPaste={handlePaste}
      tabIndex={disabled || !canAddMore ? undefined : 0}
    >
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
          {isUploading ? <LoadingSignal label="Uploading" size="sm" /> : <Upload size={15} />}
          <span>{isUploading ? "Uploading" : "Upload"}</span>
          <input
            accept={accept}
            className="hidden"
            disabled={disabled || isUploading || !canAddMore}
            multiple={multiple}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) void onUpload(files);
            }}
            type="file"
          />
        </label>
        <button
          className="secondary-button min-h-[2.3rem]"
          disabled={disabled || isUploading || !canAddMore}
          onClick={() => void handleClipboardRead()}
          type="button"
        >
          <ClipboardPaste size={15} />
          Paste
        </button>
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

      {pasteStatus ? (
        <small className="text-[0.72rem] leading-[1.35] text-[var(--color-danger)]">
          {pasteStatus}
        </small>
      ) : null}

      {files.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,8.75rem),1fr))] gap-[var(--space-2)]">
          {files.map((file) => (
            <div
              className="grid min-w-0 gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-2)]"
              key={file.id}
            >
              <div className="relative aspect-square overflow-hidden rounded-[var(--radius-xs)] bg-[var(--color-page-quiet)]">
                {isImageAsset(file) || isVideoAsset(file) ? (
                  <button
                    aria-label={`View ${file.title}`}
                    className="block h-full w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
                    onClick={() => setPreviewAsset(file)}
                    type="button"
                  >
                    <AssetThumbnail asset={file} />
                  </button>
                ) : (
                  <AssetThumbnail asset={file} />
                )}

                <label className="absolute bottom-2 left-2 max-w-[calc(100%-3.35rem)]">
                  <span className="sr-only">Reference alias</span>
                  <input
                    className="h-7 max-w-full rounded-full border border-white/70 bg-white/90 px-2.5 text-[0.72rem] font-[820] text-[var(--color-primary-strong)] shadow-[0_6px_16px_rgb(15_23_42_/_0.14)] outline-none transition focus:border-[var(--color-primary)] focus:bg-white disabled:bg-white/80"
                    disabled={disabled || !onUpdateFileAlias}
                    onChange={(event) => onUpdateFileAlias?.(file.id, event.target.value)}
                    size={Math.max(7, Math.min(16, (file.alias ?? "").length + 1))}
                    spellCheck={false}
                    value={file.alias ?? ""}
                  />
                </label>

                <button
                  aria-label={`Remove ${file.title}`}
                  className="absolute right-2 top-2 grid size-7 shrink-0 place-items-center rounded-full border border-white/70 bg-white/90 text-[var(--color-ink-muted)] shadow-[0_6px_16px_rgb(15_23_42_/_0.14)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                  disabled={disabled}
                  onClick={() => onRemoveFile(file.id)}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>

              <span
                className="min-h-[2rem] overflow-hidden text-[0.76rem] font-[720] leading-[1.25] text-[var(--color-ink)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                title={file.title}
              >
                {file.title}
              </span>
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

      <AssetPreviewModal
        asset={previewAsset}
        meta={previewMeta}
        onClose={() => setPreviewAsset(null)}
      />

      {disabled && files.length ? (
        <small className="text-[0.72rem] leading-[1.35] text-[var(--color-ink-muted)]">
          {disabledCopy ?? "Selected files are saved here but ignored while this field is disabled."}
        </small>
      ) : null}

      <LibraryAssetPickerDialog
        assets={libraryAssets}
        description={`Select ${multiple ? "assets" : "one asset"} for ${label.toLowerCase()}.`}
        kind={kind}
        maxSelection={Number.isFinite(remainingSlots) ? remainingSlots : undefined}
        multiple={multiple}
        onClose={() => setPickerOpen(false)}
        onSelect={onLibraryAssetsSelect}
        open={pickerOpen}
      />
    </div>
  );
}
