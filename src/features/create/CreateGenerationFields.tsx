import {
  CreateGenerationConfigField,
  type CreateLocalFileFieldMeta,
} from "../../components/create/CreateGenerationConfigField";
import type { SelectableLibraryAsset } from "../assets/assetTypes";
import type { ReferenceMentionOption } from "../../components/references/ReferenceAliasTextarea";
import type { RichMentionToken } from "../../components/references/RichMentionTextarea";
import { TextArea } from "../../components/ui";
import type { ConfigField, LocalReferenceFileKind } from "../../lib/create/createConfigFields";
import type { CustomSelectOption } from "../../components/CustomSelect";
import {
  CustomSelect,
} from "../../components/CustomSelect";
import {
  normalizeRosterOptionValue,
  rosterOptionsForModel,
  type RosterModel,
  type RosterModelOptionKey,
} from "../../lib/generation/modelRoster";

type FieldGroups = {
  coreFields: ConfigField[];
  promptFields: ConfigField[];
  referenceFields: ConfigField[];
};

export function CreateGenerationFields({
  availableModels,
  config,
  generationFieldGroups,
  generationOperationOptions,
  isUploadingReference,
  libraryAssets,
  localFileFieldMeta,
  modePromptLabel,
  modePromptPlaceholder,
  modelCatalogLoading,
  rosterModel,
  nonGenerationPrompt,
  onConfigChange,
  onGenerationOperationChange,
  onLibraryReferenceSelect,
  onLocalReferenceFileUpload,
  onNonGenerationPromptChange,
  onPromptPasteReferenceFiles,
  onRemoveLocalReferenceFile,
  onSelectedModelChange,
  onUpdateLocalReferenceAlias,
  referenceMentionOptions,
  selectedGenerationOperationId,
  selectedModel,
  showGenerationFields,
}: {
  availableModels: CustomSelectOption[];
  config: Record<string, unknown>;
  generationFieldGroups: FieldGroups;
  generationOperationOptions: CustomSelectOption[];
  isUploadingReference: boolean;
  libraryAssets?: SelectableLibraryAsset[];
  localFileFieldMeta: (fieldKey: string) => CreateLocalFileFieldMeta | null;
  modePromptLabel: string;
  modePromptPlaceholder: string;
  modelCatalogLoading: boolean;
  rosterModel?: RosterModel | null;
  nonGenerationPrompt: string;
  onConfigChange: (key: string, value: unknown) => void;
  onGenerationOperationChange: (operationId: string) => void;
  onLibraryReferenceSelect: (
    assets: SelectableLibraryAsset[],
    configKey: string,
    kind: LocalReferenceFileKind,
    options?: { multiple?: boolean; maxCount?: number }
  ) => void;
  onLocalReferenceFileUpload: (
    files: File[],
    configKey: string,
    kind: LocalReferenceFileKind,
    options?: { multiple?: boolean; maxCount?: number }
  ) => void;
  onNonGenerationPromptChange: (value: string) => void;
  onPromptPasteReferenceFiles?: (files: File[]) => Promise<RichMentionToken[]> | RichMentionToken[];
  onRemoveLocalReferenceFile: (configKey: string, fileId: string, kind: LocalReferenceFileKind) => void;
  onSelectedModelChange: (model: string) => void;
  onUpdateLocalReferenceAlias: (
    configKey: string,
    fileId: string,
    kind: LocalReferenceFileKind,
    alias: string
  ) => void;
  referenceMentionOptions: ReferenceMentionOption[];
  selectedGenerationOperationId?: string;
  selectedModel: string;
  showGenerationFields: boolean;
}) {
  if (!showGenerationFields) {
    return (
      <TextArea
        label={modePromptLabel}
        value={nonGenerationPrompt}
        onChange={onNonGenerationPromptChange}
        placeholder={modePromptPlaceholder}
        rows={8}
      />
    );
  }

  const rosterOptions = rosterModel ? rosterOptionsForModel(rosterModel) : {};
  const standardOptions = Object.entries(rosterOptions).filter(([, option]) => option.exposure === "standard");
  const advancedOptions = Object.entries(rosterOptions).filter(([, option]) => option.exposure === "advanced");
  const optionsValue = config.options && typeof config.options === "object" && !Array.isArray(config.options)
    ? config.options as Record<string, unknown>
    : {};
  const changeModelOption = (key: string, value: string | boolean) => {
    onConfigChange("options", {
      ...optionsValue,
      [key]: value,
    });
  };
  const modelOptionControl = ([key, option]: [string, NonNullable<typeof rosterOptions[RosterModelOptionKey]>]) => {
    const normalizedValue = normalizeRosterOptionValue(option, optionsValue[key]) ?? option.default;

    if (option.kind === "boolean") {
      return (
        <label className="grid min-w-0 gap-[var(--space-2)] text-[0.86rem] font-[720] text-[var(--color-ink)]" key={key}>
          <span className="inline-flex items-center gap-[var(--space-2)]">
            <input
              checked={Boolean(normalizedValue)}
              className="h-4 w-4 accent-[var(--color-primary)]"
              onChange={(event) => changeModelOption(key, event.target.checked)}
              type="checkbox"
            />
            {option.label}
          </span>
          {option.costNote ? <small className="text-[0.72rem] leading-[1.35] text-[var(--color-ink-muted)]">{option.costNote}</small> : null}
        </label>
      );
    }

    return (
      <div className="grid min-w-0 gap-[var(--space-2)]" key={key}>
        <span className="text-[0.74rem] font-[780] text-[var(--color-ink-soft)]">{option.label}</span>
        <CustomSelect
          onChange={(value) => changeModelOption(key, value)}
          options={option.values.map((value) => ({ value, label: value }))}
          placeholder={option.label}
          value={String(normalizedValue)}
        />
        {option.costNote ? <small className="text-[0.72rem] leading-[1.35] text-[var(--color-ink-muted)]">{option.costNote}</small> : null}
      </div>
    );
  };

  return (
    <>
      {generationFieldGroups.promptFields.length ? (
        <div className="grid min-w-0 gap-[var(--space-3)]">
          {generationFieldGroups.promptFields.map((field) => (
            <CreateGenerationConfigField
              config={config}
              field={field}
              isUploadingReference={isUploadingReference}
              key={field.key}
              localFileFieldMeta={localFileFieldMeta}
              libraryAssets={libraryAssets}
              onConfigChange={onConfigChange}
              onLibraryReferenceSelect={onLibraryReferenceSelect}
              onLocalReferenceFileUpload={onLocalReferenceFileUpload}
              onPromptPasteReferenceFiles={onPromptPasteReferenceFiles}
              onRemoveLocalReferenceFile={onRemoveLocalReferenceFile}
              onUpdateLocalReferenceAlias={onUpdateLocalReferenceAlias}
              referenceMentionOptions={referenceMentionOptions}
            />
          ))}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-[var(--space-2)]">
        {generationOperationOptions.length > 1 ? (
          <>
            <span className="text-[0.74rem] font-[780] text-[var(--color-ink-soft)]">Operation</span>
            <CustomSelect
              onChange={onGenerationOperationChange}
              options={generationOperationOptions}
              placeholder="Select operation"
              rich
              value={selectedGenerationOperationId ?? ""}
            />
          </>
        ) : null}
        <span className="text-[0.74rem] font-[780] text-[var(--color-ink-soft)]">Model</span>
        <CustomSelect
          disabled={!availableModels.length}
          onChange={onSelectedModelChange}
          options={availableModels}
          placeholder={modelCatalogLoading ? "Loading models" : "Select model"}
          rich
          value={selectedModel}
        />
      </div>

      {generationFieldGroups.referenceFields.length ? (
        <div className="grid min-w-0 gap-[var(--space-3)]">
          <div className="border-t border-[var(--color-border)] pt-[var(--space-4)]">
            <h3 className="m-0 text-[0.9rem] font-[800] text-[var(--color-ink)]">References</h3>
          </div>
          <div className="grid min-w-0 gap-[var(--space-3)] md:grid-cols-2">
            {generationFieldGroups.referenceFields.map((field) => (
              <CreateGenerationConfigField
                className={
                  field.key === "startEndFrameMode"
                    ? "md:col-span-2"
                    : undefined
                }
                config={config}
                field={field}
                isUploadingReference={isUploadingReference}
                key={field.key}
                localFileFieldMeta={localFileFieldMeta}
                libraryAssets={libraryAssets}
                onConfigChange={onConfigChange}
                onLibraryReferenceSelect={onLibraryReferenceSelect}
                onLocalReferenceFileUpload={onLocalReferenceFileUpload}
                onPromptPasteReferenceFiles={onPromptPasteReferenceFiles}
                onRemoveLocalReferenceFile={onRemoveLocalReferenceFile}
                onUpdateLocalReferenceAlias={onUpdateLocalReferenceAlias}
                referenceMentionOptions={referenceMentionOptions}
              />
            ))}
          </div>
        </div>
      ) : null}

      {generationFieldGroups.coreFields.length ? (
        <div className="grid min-w-0 gap-[var(--space-3)]">
          <div className="border-t border-[var(--color-border)] pt-[var(--space-4)]">
            <h3 className="m-0 text-[0.9rem] font-[800] text-[var(--color-ink)]">Settings</h3>
          </div>
          <div className="grid min-w-0 gap-[var(--space-3)] md:grid-cols-2 xl:grid-cols-3">
            {generationFieldGroups.coreFields.map((field) => (
              <CreateGenerationConfigField
                config={config}
                field={field}
                isUploadingReference={isUploadingReference}
                key={field.key}
                localFileFieldMeta={localFileFieldMeta}
                libraryAssets={libraryAssets}
                onConfigChange={onConfigChange}
                onLibraryReferenceSelect={onLibraryReferenceSelect}
                onLocalReferenceFileUpload={onLocalReferenceFileUpload}
                onPromptPasteReferenceFiles={onPromptPasteReferenceFiles}
                onRemoveLocalReferenceFile={onRemoveLocalReferenceFile}
                onUpdateLocalReferenceAlias={onUpdateLocalReferenceAlias}
                referenceMentionOptions={referenceMentionOptions}
              />
            ))}
          </div>
        </div>
      ) : null}

      {standardOptions.length || advancedOptions.length ? (
        <div className="grid min-w-0 gap-[var(--space-3)]">
          <div className="border-t border-[var(--color-border)] pt-[var(--space-4)]">
            <h3 className="m-0 text-[0.9rem] font-[800] text-[var(--color-ink)]">Model options</h3>
          </div>
          {standardOptions.length ? (
            <div className="grid min-w-0 gap-[var(--space-3)] md:grid-cols-2 xl:grid-cols-3">
              {standardOptions.map((entry) => modelOptionControl(entry as [string, NonNullable<typeof rosterOptions[RosterModelOptionKey]>]))}
            </div>
          ) : null}
          {advancedOptions.length ? (
            <details className="grid min-w-0 gap-[var(--space-3)]">
              <summary className="cursor-pointer text-[0.82rem] font-[780] text-[var(--color-ink)]">
                Advanced
              </summary>
              <div className="mt-[var(--space-3)] grid min-w-0 gap-[var(--space-3)] md:grid-cols-2 xl:grid-cols-3">
                {advancedOptions.map((entry) => modelOptionControl(entry as [string, NonNullable<typeof rosterOptions[RosterModelOptionKey]>]))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
