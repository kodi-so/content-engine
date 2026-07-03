import { ReferenceAssetField } from "../library/ReferenceAssetField";
import type { SelectableLibraryAsset } from "../../features/assets/assetTypes";
import {
  coerceConfigFieldValue,
  configFieldValue,
  formatConfigFieldTextareaValue,
  formatConfigLabel,
  localReferenceFilesFromConfig,
  type ConfigField,
  type LocalReferenceFileKind,
} from "../../lib/workflow/workflowConfigFields";
import {
  ReferenceAliasTextarea,
  type ReferenceMentionOption,
} from "../references/ReferenceAliasTextarea";
import { WorkflowSelect } from "../workflow/WorkflowSelect";

export type CreateLocalFileFieldMeta = {
  accept: string;
  kind: LocalReferenceFileKind;
  multiple: boolean;
  maxCount?: number;
};

type CreateGenerationConfigFieldProps = {
  className?: string;
  config: Record<string, unknown>;
  field: ConfigField;
  isUploadingReference: boolean;
  localFileFieldMeta: (fieldKey: string) => CreateLocalFileFieldMeta | null;
  libraryAssets?: SelectableLibraryAsset[];
  onConfigChange: (key: string, value: unknown) => void;
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
  onRemoveLocalReferenceFile: (
    configKey: string,
    fileId: string,
    kind: LocalReferenceFileKind
  ) => void;
  onUpdateLocalReferenceAlias: (
    configKey: string,
    fileId: string,
    kind: LocalReferenceFileKind,
    alias: string
  ) => void;
  referenceMentionOptions?: ReferenceMentionOption[];
};

const multilineTextKeys = new Set([
  "caption",
  "knowledgeBase",
  "prompt",
  "request",
  "systemPrompt",
  "text",
]);

const fieldShellClass = "grid min-w-0 gap-[var(--space-2)]";
const fieldLabelClass = "text-[0.74rem] font-[780] text-[var(--color-ink-soft)]";
const helperTextClass = "text-[0.72rem] leading-[1.35] text-[var(--color-ink-muted)]";
const inputClass = "min-h-[2.45rem] w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-3)] text-[0.86rem] text-[var(--color-ink)]";
const textareaClass = `${inputClass} min-h-[6.5rem] resize-y overflow-auto py-[var(--space-3)] leading-[1.45]`;
const promptTextareaClass = `${textareaClass} min-h-[13rem]`;

export function CreateGenerationConfigField({
  className,
  config,
  field,
  isUploadingReference,
  localFileFieldMeta,
  libraryAssets,
  onConfigChange,
  onLibraryReferenceSelect,
  onLocalReferenceFileUpload,
  onRemoveLocalReferenceFile,
  onUpdateLocalReferenceAlias,
  referenceMentionOptions,
}: CreateGenerationConfigFieldProps) {
  const value = configFieldValue(field, config);
  const localFileMeta = localFileFieldMeta(field.key);

  if (localFileMeta) {
    const files = localReferenceFilesFromConfig(
      config,
      field.key,
      localFileMeta.kind
    );

    return (
      <div className={`${className ? `${className} ` : ""}min-w-0`}>
        <ReferenceAssetField
          accept={localFileMeta.accept}
          files={files}
          helperText={field.required ? "At least one file is required." : "No files selected."}
          isUploading={isUploadingReference}
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
          onUpdateFileAlias={(fileId, alias) =>
            onUpdateLocalReferenceAlias(field.key, fileId, localFileMeta.kind, alias)
          }
          onUpload={(files) =>
            onLocalReferenceFileUpload(files, field.key, localFileMeta.kind, {
              multiple: localFileMeta.multiple,
              maxCount: localFileMeta.maxCount,
            })
          }
          required={field.required}
        />
        {field.description ? <small className={helperTextClass}>{field.description}</small> : null}
      </div>
    );
  }

  if (field.type === "enum") {
    return (
      <div className={`${fieldShellClass}${className ? ` ${className}` : ""}`}>
        <span className={fieldLabelClass}>
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
        {field.description ? <small className={helperTextClass}>{field.description}</small> : null}
      </div>
    );
  }

  if (multilineTextKeys.has(field.key)) {
    return (
      <ReferenceAliasTextarea
        className={className}
        helperText={field.description}
        label={field.label}
        onChange={(nextValue) =>
          onConfigChange(
            field.key,
            coerceConfigFieldValue(field, nextValue, value)
          )
        }
        options={referenceMentionOptions}
        required={field.required}
        textareaClassName={field.key === "prompt" || field.key === "text" ? promptTextareaClass : textareaClass}
        value={String(value)}
      />
    );
  }

  if (field.type === "boolean") {
    return (
      <div className={`${fieldShellClass} self-start pt-[0.2rem]${className ? ` ${className}` : ""}`}>
        <label className="inline-flex items-center gap-[var(--space-2)] text-[0.86rem] font-[720] text-[var(--color-ink)]">
          <input
            className="h-4 w-4 accent-[var(--color-primary)]"
            checked={Boolean(value)}
            onChange={(event) => onConfigChange(field.key, event.target.checked)}
            type="checkbox"
          />
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
        </label>
        {field.description ? <small className={helperTextClass}>{field.description}</small> : null}
      </div>
    );
  }

  return (
    <label className={`${fieldShellClass}${className ? ` ${className}` : ""}`}>
      <span className={fieldLabelClass}>
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {field.type === "json" ? (
        <textarea
          className={textareaClass}
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
          className={inputClass}
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
      {field.description ? <small className={helperTextClass}>{field.description}</small> : null}
    </label>
  );
}
