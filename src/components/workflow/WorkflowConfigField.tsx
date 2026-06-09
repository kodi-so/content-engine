import type { ChangeEvent } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  ReferenceAssetField,
  type SelectableLibraryAsset,
} from "../library/ReferenceAssetField";
import type { WorkflowFlowNode } from "../../lib/workflow/workflowCanvasGraph";
import {
  coerceConfigFieldValue,
  configFieldValue,
  formatConfigFieldTextareaValue,
  formatConfigLabel,
  localReferenceFilesFromConfig,
  type ConfigField,
  type LocalReferenceFileKind,
} from "../../lib/workflow/workflowConfigFields";
import type { ImageModelUiContract } from "../../lib/workflow/workflowModelCatalog";
import { WorkflowSelect } from "./WorkflowSelect";

export type LocalFileFieldMeta = {
  accept: string;
  disabled: boolean;
  disabledCopy: string;
  kind: LocalReferenceFileKind;
  multiple: boolean;
  maxCount?: number;
};

export type WorkflowConfigFieldProps = {
  field: ConfigField;
  isUploadingImageReference: boolean;
  localFileFieldMeta: (fieldKey: string) => LocalFileFieldMeta | null;
  libraryAssets?: SelectableLibraryAsset[];
  onBooleanConfigChange: (key: string, value: boolean) => void;
  onConfigChange: (key: string, value: unknown) => void;
  onLibraryReferenceSelect: (
    assets: SelectableLibraryAsset[],
    configKey: string,
    kind: LocalReferenceFileKind,
    options?: { multiple?: boolean; maxCount?: number }
  ) => void;
  onLocalReferenceFileUpload: (
    event: ChangeEvent<HTMLInputElement>,
    configKey: string,
    kind: LocalReferenceFileKind,
    options?: { multiple?: boolean; maxCount?: number }
  ) => void;
  onRemoveLocalReferenceFile: (
    configKey: string,
    fileId: string,
    kind: LocalReferenceFileKind
  ) => void;
  selectedImageModelUiContract: ImageModelUiContract | null;
  selectedNode: WorkflowFlowNode;
  workflowBrandId?: Id<"brands">;
  workflowPersonas: Doc<"personas">[] | undefined;
};

const multilineTextKeys = new Set([
  "caption",
  "knowledgeBase",
  "prompt",
  "request",
  "systemPrompt",
  "text",
]);

export function WorkflowConfigField({
  field,
  isUploadingImageReference,
  localFileFieldMeta,
  libraryAssets,
  onBooleanConfigChange,
  onConfigChange,
  onLibraryReferenceSelect,
  onLocalReferenceFileUpload,
  onRemoveLocalReferenceFile,
  selectedImageModelUiContract,
  selectedNode,
  workflowBrandId,
  workflowPersonas,
}: WorkflowConfigFieldProps) {
  const value = configFieldValue(field, selectedNode.data.config);
  const isImageGenerationNode = selectedNode.data.type === "image_generation";
  const promptFromInputNode = selectedNode.data.config.promptFromInputNode === true;
  const localTextDisabledByInput =
    (field.key === "caption" && selectedNode.data.config.captionFromInputNode === true) ||
    (field.key === "prompt" && promptFromInputNode) ||
    (field.key === "request" && selectedNode.data.config.requestFromInputNode === true) ||
    (field.key === "text" && selectedNode.data.config.textFromInputNode === true);

  if (field.key === "personaIds") {
    const selectedPersonaIds = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];

    return (
      <div className="workflow-inspector-field">
        <span>{field.label}</span>
        <div className="workflow-persona-picker">
          {!workflowBrandId && <small>Select a brand to use personas.</small>}
          {workflowBrandId && !workflowPersonas && <small>Loading personas...</small>}
          {workflowPersonas?.length === 0 && (
            <small>No personas exist for this workflow brand.</small>
          )}
          {workflowPersonas?.map((persona) => {
            const personaId = String(persona._id);
            const selected = selectedPersonaIds.includes(personaId);
            return (
              <button
                className={selected ? "selected" : ""}
                key={persona._id}
                type="button"
                onClick={() =>
                  onConfigChange(
                    field.key,
                    selected
                      ? selectedPersonaIds.filter((id) => id !== personaId)
                      : [...selectedPersonaIds, personaId]
                  )
                }
              >
                <strong>{persona.name}</strong>
                <span>
                  {persona.personaType.replace(/_/g, " ")} ·{" "}
                  {persona.sourceAssetIds.length +
                    persona.generatedAssetIds.length +
                    persona.voiceAssetIds.length} assets
                </span>
              </button>
            );
          })}
        </div>
        {field.description ? <small>{field.description}</small> : null}
      </div>
    );
  }

  const localFileMeta = localFileFieldMeta(field.key);
  if (localFileMeta) {
    const files = localReferenceFilesFromConfig(
      selectedNode.data.config,
      field.key,
      localFileMeta.kind
    );
    const localFilesDisabled = localFileMeta.disabled ||
      (isImageGenerationNode &&
        field.key === "localReferenceImages" &&
        selectedImageModelUiContract?.images.canBeUploadedLocally === false);

    return (
      <div className="workflow-inspector-field workflow-inspector-field-paired">
        <ReferenceAssetField
          accept={localFileMeta.accept}
          disabled={localFilesDisabled}
          disabledCopy={localFileMeta.disabledCopy}
          files={files}
          helperText={
            isImageGenerationNode && selectedImageModelUiContract?.images.required
              ? "At least one image is required for this model."
              : "No files selected."
          }
          isUploading={isUploadingImageReference}
          kind={localFileMeta.kind}
          label={field.label}
          libraryAssets={libraryAssets}
          maxCount={localFileMeta.maxCount}
          multiple={localFileMeta.multiple}
          onLibraryAssetsSelect={(assets) =>
            onLibraryReferenceSelect(assets, field.key, localFileMeta.kind, {
              multiple: localFileMeta.multiple,
              maxCount: localFileMeta.maxCount,
            })
          }
          onRemoveFile={(fileId) =>
            onRemoveLocalReferenceFile(field.key, fileId, localFileMeta.kind)
          }
          onUpload={(event) => {
            onLocalReferenceFileUpload(event, field.key, localFileMeta.kind, {
              multiple: localFileMeta.multiple,
              maxCount: localFileMeta.maxCount,
            });
          }}
          required={field.required}
        />
        {field.description ? <small>{field.description}</small> : null}
      </div>
    );
  }

  if (field.type === "enum") {
    return (
      <div className="workflow-inspector-field">
        <span>
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <WorkflowSelect
          onChange={(nextValue) => onConfigChange(field.key, nextValue)}
          options={[
            ...(!field.required ? [{ value: "", label: "Unset" }] : []),
            ...(field.enumValues ?? []).map((option) => ({
              value: option,
              label: formatConfigLabel(option),
            })),
          ]}
          placeholder="Select option"
          value={String(value)}
        />
        {field.description ? <small>{field.description}</small> : null}
      </div>
    );
  }

  if (multilineTextKeys.has(field.key)) {
    const localPromptDisabled = localTextDisabledByInput ||
      (isImageGenerationNode &&
        selectedImageModelUiContract?.prompt.canBeConfiguredLocally === false);

    return (
      <label className="workflow-inspector-field workflow-inspector-field-paired">
        <span>
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <textarea
          className="workflow-prompt-textarea"
          disabled={localPromptDisabled}
          onChange={(event) =>
            onConfigChange(
              field.key,
              coerceConfigFieldValue(field, event.target.value, value)
            )
          }
          value={String(value)}
        />
        {localPromptDisabled && localTextDisabledByInput ? (
          <small>Using text from a connected input node. This local value is saved but ignored.</small>
        ) : field.description ? (
          <small>{field.description}</small>
        ) : null}
      </label>
    );
  }

  if (field.type === "boolean") {
    return (
      <div
        className={`workflow-inspector-field${
          field.key.endsWith("FromInputNode") ? " workflow-inspector-field-paired" : ""
        }`}
      >
        <label className="workflow-inspector-toggle">
          <input
            checked={Boolean(value)}
            onChange={(event) => onBooleanConfigChange(field.key, event.target.checked)}
            type="checkbox"
          />
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
        </label>
        {field.description ? <small>{field.description}</small> : null}
      </div>
    );
  }

  return (
    <label className="workflow-inspector-field">
      <span>
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {field.type === "json" ? (
        <textarea
          onChange={(event) =>
            onConfigChange(
              field.key,
              coerceConfigFieldValue(field, event.target.value, value)
            )
          }
          spellCheck={false}
          value={formatConfigFieldTextareaValue(value)}
        />
      ) : (
        <input
          onChange={(event) =>
            onConfigChange(
              field.key,
              coerceConfigFieldValue(field, event.target.value, value)
            )
          }
          type={field.type === "number" ? "number" : "text"}
          value={String(value)}
        />
      )}
      {field.description ? <small>{field.description}</small> : null}
    </label>
  );
}
