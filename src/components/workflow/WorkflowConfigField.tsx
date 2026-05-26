import { Upload, X } from "lucide-react";
import type { ChangeEvent } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
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
  onBooleanConfigChange: (key: string, value: boolean) => void;
  onConfigChange: (key: string, value: unknown) => void;
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
  onBooleanConfigChange,
  onConfigChange,
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
        <span>{field.label}</span>
        <div className={`workflow-reference-upload${localFilesDisabled ? " is-disabled" : ""}`}>
          <label>
            <Upload size={15} />
            <span>{isUploadingImageReference ? "Uploading..." : "Upload files"}</span>
            <input
              accept={localFileMeta.accept}
              disabled={isUploadingImageReference || localFilesDisabled}
              multiple={localFileMeta.multiple}
              onChange={(event) => {
                onLocalReferenceFileUpload(event, field.key, localFileMeta.kind, {
                  multiple: localFileMeta.multiple,
                  maxCount: localFileMeta.maxCount,
                });
              }}
              type="file"
            />
          </label>
        </div>
        {files.length ? (
          <div className="workflow-reference-list">
            {files.map((file) => (
              <div className="workflow-reference-item" key={file.id}>
                {file.kind === "image" ? (
                  <img alt="" src={file.storageUrl} />
                ) : (
                  <span className="workflow-reference-file-kind">
                    {String(file.kind).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span>{file.title}</span>
                <button
                  aria-label={`Remove ${file.title}`}
                  disabled={localFilesDisabled}
                  onClick={() => onRemoveLocalReferenceFile(field.key, file.id, localFileMeta.kind)}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <small>
            {localFilesDisabled
              ? localFileMeta.disabledCopy
              : isImageGenerationNode && selectedImageModelUiContract?.images.required
                ? "At least one image is required for this model."
                : "No files uploaded."}
            {localFileMeta.maxCount
              ? ` Up to ${localFileMeta.maxCount} allowed.`
              : !localFileMeta.multiple
                ? " One image allowed."
                : null}
          </small>
        )}
        {localFilesDisabled && files.length ? (
          <small>Uploaded files are saved here but ignored while the input toggle is enabled.</small>
        ) : null}
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
