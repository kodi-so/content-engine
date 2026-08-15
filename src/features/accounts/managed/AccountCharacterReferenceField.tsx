import { useMutation, useQuery } from "convex/react";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useWorkspace } from "../../../contexts/WorkspaceContext";
import { AssetPreviewModal } from "../../assets/AssetPreviewModal";
import { AssetThumbnail } from "../../assets/AssetThumbnail";
import { LibraryAssetPickerDialog } from "../../assets/LibraryAssetPickerDialog";
import type {
  AssetPreviewItem,
  SelectableLibraryAsset,
} from "../../assets/assetTypes";

type AccountReference = Doc<"accountReferences"> & {
  asset: Doc<"creativeAssets">;
};

export function AccountCharacterReferenceField({
  accountId,
  references,
}: {
  accountId: Id<"socialAccounts">;
  references: AccountReference[];
}) {
  const { activeWorkspaceId } = useWorkspace();
  const libraryAssets = useQuery(api.library.assets.listSelectable, {
    ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
    mediaKind: "image",
  });
  const setCharacterReference = useMutation(
    api.accounts.managedAccounts.setCharacterReference
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<AssetPreviewItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const characterReference = useMemo(
    () => references
      .filter((reference) => reference.role === "identity" && reference.isActive)
      .sort((first, second) => second.updatedAt - first.updatedAt)[0],
    [references]
  );
  const characterAsset = characterReference?.asset;
  const selectableCharacterAssets = useMemo(
    () => (libraryAssets ?? []).filter((asset) => asset.source === "creative_asset"),
    [libraryAssets]
  );
  const previewItem = characterAsset
    ? {
        id: String(characterAsset._id),
        mediaKind: "image",
        storageUrl: characterAsset.storageUrl,
        title: characterAsset.name,
      }
    : null;

  useEffect(() => {
    setPickerOpen(false);
    setPreviewAsset(null);
    setSaving(false);
    setStatus("");
  }, [accountId]);

  const chooseCharacter = async (assets: SelectableLibraryAsset[]) => {
    const selected = assets[0];
    if (!selected || selected.source !== "creative_asset") return;
    setSaving(true);
    setStatus("Saving character reference…");
    try {
      await setCharacterReference({
        id: accountId,
        creativeAssetId: selected.sourceId as Id<"creativeAssets">,
      });
      setStatus("Character reference saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save character reference");
    } finally {
      setSaving(false);
    }
  };

  const removeCharacter = async () => {
    setSaving(true);
    setStatus("Removing character reference…");
    try {
      await setCharacterReference({
        id: accountId,
        creativeAssetId: null,
      });
      setStatus("Character reference removed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to remove character reference");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-2 border-y border-[var(--color-border)] py-3 lg:col-span-2">
      <div className="text-[0.74rem] font-[720] text-[var(--color-ink-muted)]">
        Character reference
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {previewItem ? (
          <button
            aria-label={`Preview ${previewItem.title}`}
            className="size-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-0"
            onClick={() => setPreviewAsset(previewItem)}
            type="button"
          >
            <AssetThumbnail asset={previewItem} />
          </button>
        ) : (
          <div className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-page)] text-[var(--color-ink-faint)]">
            <ImagePlus size={18} />
          </div>
        )}

        <div className="grid min-w-[12rem] flex-1 gap-0.5">
          {characterAsset ? (
            <strong className="truncate text-[0.82rem] font-[740] text-[var(--color-ink)]">
              {characterAsset.name}
            </strong>
          ) : null}
          <span className="text-[0.74rem] leading-relaxed text-[var(--color-ink-muted)]">
            Automatically used for visual content created for this account.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="secondary-button min-h-9"
            disabled={saving}
            onClick={() => setPickerOpen(true)}
            type="button"
          >
            <ImagePlus size={14} />
            {characterAsset ? "Replace" : "Choose from Library"}
          </button>
          {characterAsset ? (
            <button
              aria-label="Remove character reference"
              className="inline-grid size-9 place-items-center rounded-[var(--radius-sm)] border border-transparent bg-transparent text-[var(--color-ink-muted)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-50"
              disabled={saving}
              onClick={() => void removeCharacter()}
              title="Remove character reference"
              type="button"
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </div>

      {status ? (
        <span aria-live="polite" className="text-[0.72rem] font-[650] text-[var(--color-ink-muted)]">
          {status}
        </span>
      ) : null}

      <LibraryAssetPickerDialog
        assets={selectableCharacterAssets}
        description="Choose the primary character image the Agent should preserve across visual posts."
        kind="image"
        onClose={() => setPickerOpen(false)}
        onSelect={(assets) => void chooseCharacter(assets)}
        open={pickerOpen}
        title="Choose character reference"
      />
      <AssetPreviewModal
        asset={previewAsset}
        onClose={() => setPreviewAsset(null)}
      />
    </div>
  );
}
