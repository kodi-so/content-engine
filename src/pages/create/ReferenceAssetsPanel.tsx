import { Check, ImagePlus, Sparkles, Upload } from "lucide-react";
import { Field, TextArea } from "../../components/ui";
import type { BrandAssetDoc } from "./viewTypes";
import type { CreateFormActions, CreateFormState } from "./types";

type ReferenceAssetsPanelProps = {
  brandAssets?: BrandAssetDoc[];
  form: CreateFormState;
  actions: CreateFormActions;
};

export function ReferenceAssetsPanel({
  brandAssets,
  form,
  actions,
}: ReferenceAssetsPanelProps) {
  const activeComposerClass =
    "!border-[var(--color-primary)] !bg-[var(--color-primary-soft)] !text-[var(--color-primary-strong)]";

  return (
    <div className="col-span-full grid gap-[var(--space-3)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
      <div className="flex flex-col gap-[var(--space-3)] min-[901px]:flex-row min-[901px]:items-center min-[901px]:justify-between">
        <div>
          <div className="entity-eyebrow">References</div>
          <p className="muted mt-[var(--space-1)]">
            Add reusable images only when the prompt needs a character, product, persona,
            or visual style anchor.
          </p>
        </div>
        <div className="flex flex-wrap gap-[var(--space-2)]">
          <button
            className={`secondary-button ${
              form.referenceComposer === "upload" ? activeComposerClass : ""
            }`}
            type="button"
            onClick={() =>
              actions.setReferenceComposer((current) =>
                current === "upload" ? null : "upload"
              )
            }
          >
            <Upload size={16} />
            Upload
          </button>
          <button
            className={`secondary-button ${
              form.referenceComposer === "ai" ? activeComposerClass : ""
            }`}
            type="button"
            onClick={() =>
              actions.setReferenceComposer((current) => (current === "ai" ? null : "ai"))
            }
          >
            <Sparkles size={16} />
            Generate
          </button>
        </div>
      </div>

      {form.referenceComposer === "upload" && (
        <div className="grid items-start gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] min-[901px]:grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-[var(--space-3)]">
            <Field
              label="Asset name"
              value={form.assetName}
              onChange={actions.setAssetName}
              placeholder="Yellow mascot"
            />
            <button
              className="secondary-button w-full"
              type="button"
              disabled={!form.selectedBrandId || !form.assetName.trim() || !form.assetFile}
              onClick={() => void actions.handleCreateAsset()}
            >
              <ImagePlus size={16} />
              Add reference
            </button>
          </div>
          <label className="field content-start">
            <span>Image</span>
            <input type="file" accept="image/*" onChange={actions.handleAssetFileChange} />
          </label>
        </div>
      )}

      {form.referenceComposer === "ai" && (
        <div className="grid items-start gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] min-[901px]:grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-[var(--space-3)]">
            <Field
              label="Asset name"
              value={form.aiAssetName}
              onChange={actions.setAiAssetName}
              placeholder="Yellow mascot v1"
            />
            <button
              className="secondary-button w-full"
              type="button"
              disabled={!form.aiAssetPrompt.trim() || form.isGeneratingReference}
              onClick={() => void actions.handleGenerateReferencePreview()}
            >
              <Sparkles size={16} />
              {form.isGeneratingReference ? "Creating preview..." : "Create reference preview"}
            </button>
          </div>
          <TextArea
            className="!col-auto"
            label="Generation prompt"
            value={form.aiAssetPrompt}
            onChange={actions.setAiAssetPrompt}
            placeholder="Create a bright yellow muscular superhero mascot in black shorts, bold comic style, clean gray background."
            rows={3}
          />
          {form.aiPreview && (
            <div className="col-span-full grid min-w-0 gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-[var(--space-3)] min-[701px]:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)]">
              <img
                className="aspect-square w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-tinted)] object-cover"
                src={form.aiPreview.storageUrl}
                alt=""
              />
              <div className="grid content-center gap-[var(--space-2)]">
                <button
                  className="primary-button"
                  type="button"
                  disabled={!form.selectedBrandId || !form.aiAssetName.trim()}
                  onClick={() => void actions.handleSaveGeneratedReference()}
                >
                  <Check size={16} />
                  Save reference
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void actions.handleRejectGeneratedReference()}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-[var(--space-3)]">
        {!brandAssets && form.selectedBrandId && (
          <p className="muted col-span-full">Loading references...</p>
        )}
        {brandAssets?.length === 0 && (
          <p className="muted col-span-full">No reference assets for this brand yet.</p>
        )}
        {brandAssets?.map((asset) => {
          const selected = form.selectedReferenceIds.includes(String(asset._id));
          return (
            <article
              className="grid min-w-0 gap-[var(--space-3)]"
              key={asset._id}
            >
              <button
                className={[
                  "grid w-full min-w-0 cursor-pointer gap-[var(--space-2)] rounded-[var(--radius-md)] border p-[var(--space-2)] text-center text-[var(--color-ink)]",
                  selected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] shadow-[var(--focus-ring)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]",
                ].join(" ")}
                type="button"
                onClick={() => actions.toggleReference(String(asset._id))}
              >
                <img
                  className="aspect-square w-full rounded-[calc(var(--radius-md)-2px)] bg-[var(--color-surface-tinted)] object-cover"
                  src={asset.storageUrl}
                  alt=""
                />
                <strong className="min-w-0 [overflow-wrap:anywhere] text-[0.88rem] font-[650] leading-[1.25]">
                  {asset.name}
                </strong>
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
