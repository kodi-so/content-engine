import { Sparkles } from "lucide-react";
import { FormPanel, Select, TextArea } from "../../components/ui";
import { ReferenceAssetsPanel } from "./ReferenceAssetsPanel";
import type { CreateFormActions, CreateFormState, RequestedRenderingMode } from "./types";
import type { BrandAssetDoc, BrandDoc, SocialAccountDoc } from "./viewTypes";

type CreateSlideshowFormProps = {
  brands?: BrandDoc[];
  brandAccounts: SocialAccountDoc[];
  brandAssets?: BrandAssetDoc[];
  form: CreateFormState;
  actions: CreateFormActions;
};

export function CreateSlideshowForm({
  brands,
  brandAccounts,
  brandAssets,
  form,
  actions,
}: CreateSlideshowFormProps) {
  return (
    <FormPanel title="Generate Slideshow Preview" onSubmit={actions.handleSubmit}>
      <div className="col-span-full grid items-stretch gap-[var(--space-4)] min-[901px]:grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-[var(--space-3)]">
          <Select label="Brand" value={form.selectedBrandId} onChange={actions.setBrandId}>
            <option value="">Select brand</option>
            {brands?.map((brand) => (
              <option key={brand._id} value={brand._id}>
                {brand.name}
              </option>
            ))}
          </Select>
          <Select
            label="Account"
            value={form.socialAccountId}
            onChange={actions.setSocialAccountId}
          >
            <option value="">No account yet</option>
            {brandAccounts.map((account) => (
              <option key={account._id} value={account._id}>
                {account.username}
              </option>
            ))}
          </Select>
          <Select
            label="Production mode"
            value={form.requestedRenderingMode}
            onChange={(value) =>
              actions.setRequestedRenderingMode(value as RequestedRenderingMode)
            }
          >
            <option value="background_plus_overlay">Background + overlay</option>
            <option value="full_graphic_generation">Full graphic generation</option>
          </Select>
        </div>
        <TextArea
          className="!col-auto h-full"
          textareaClassName="min-[901px]:!min-h-[13.8rem] min-[901px]:h-full"
          label="Prompt"
          value={form.prompt}
          onChange={actions.setPrompt}
          placeholder="Create a bold 6-slide TikTok slideshow. Use the yellow character reference throughout, with chunky black text, yellow highlights, and exact short titles on each slide."
          rows={8}
        />
      </div>

      <ReferenceAssetsPanel brandAssets={brandAssets} form={form} actions={actions} />

      <div className="col-span-full flex justify-end border-t border-[var(--color-border)] pt-[var(--space-4)]">
        <button
          className="primary-button w-[min(18rem,100%)]"
          type="submit"
          disabled={!form.selectedBrandId || !form.prompt.trim()}
        >
          <Sparkles size={16} />
          Generate slideshow
        </button>
      </div>
      {brands?.length === 0 && (
        <p className="muted">Create a brand before generating content.</p>
      )}
    </FormPanel>
  );
}
