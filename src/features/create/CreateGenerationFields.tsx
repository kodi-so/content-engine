import {
  CreateGenerationConfigField,
  type CreateLocalFileFieldMeta,
} from "../../components/create/CreateGenerationConfigField";
import type { SelectableLibraryAsset } from "../assets/assetTypes";
import type { ReferenceMentionOption } from "../../components/references/ReferenceAliasTextarea";
import { TextArea } from "../../components/ui";
import { WorkflowSelect, type WorkflowSelectOption } from "../../components/workflow/WorkflowSelect";
import type { ConfigField, LocalReferenceFileKind } from "../../lib/workflow/workflowConfigFields";
import type { CustomSelectOption } from "../../components/CustomSelect";

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
  nonGenerationPrompt,
  onConfigChange,
  onGenerationOperationChange,
  onLibraryReferenceSelect,
  onLocalReferenceFileUpload,
  onNonGenerationPromptChange,
  onRemoveLocalReferenceFile,
  onSelectedModelChange,
  onUpdateLocalReferenceAlias,
  referenceMentionOptions,
  selectedGenerationOperationId,
  selectedModel,
  showGenerationFields,
}: {
  availableModels: WorkflowSelectOption[];
  config: Record<string, unknown>;
  generationFieldGroups: FieldGroups;
  generationOperationOptions: CustomSelectOption[];
  isUploadingReference: boolean;
  libraryAssets?: SelectableLibraryAsset[];
  localFileFieldMeta: (fieldKey: string) => CreateLocalFileFieldMeta | null;
  modePromptLabel: string;
  modePromptPlaceholder: string;
  modelCatalogLoading: boolean;
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
            <WorkflowSelect
              onChange={onGenerationOperationChange}
              options={generationOperationOptions}
              placeholder="Select operation"
              rich
              value={selectedGenerationOperationId ?? ""}
            />
          </>
        ) : null}
        <span className="text-[0.74rem] font-[780] text-[var(--color-ink-soft)]">Model</span>
        <WorkflowSelect
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
                onRemoveLocalReferenceFile={onRemoveLocalReferenceFile}
                onUpdateLocalReferenceAlias={onUpdateLocalReferenceAlias}
                referenceMentionOptions={referenceMentionOptions}
              />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
