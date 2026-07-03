import { assignReferenceAliases } from "../references/referenceAliases";
import {
  configFieldHiddenForNode,
  friendlyConfigFieldForKey,
  friendlyConfigFieldKeysForNode,
  normalizeConfigField,
  sortConfigFieldsForNode,
} from "./workflowConfigFieldDefinitions";
import {
  creatorAspectRatioOptions,
  formatConfigLabel,
  type ConfigField,
  type LocalReferenceFileKind,
} from "./workflowConfigFieldBasics";
import { schemaFieldsFromRecordSchema } from "./workflowConfigSchemaFields";
import type { WorkflowNodeType } from "./workflowGraph";
import type { ImageModelUiContract, ProviderModelDoc } from "./workflowModelCatalog";

export {
  creatorAspectRatioOptions,
  formatConfigLabel,
};

export type {
  ConfigField,
  ConfigFieldType,
  LocalReferenceFileKind,
} from "./workflowConfigFieldBasics";

export function configFieldsForNode(
  type: WorkflowNodeType,
  config: Record<string, unknown>,
  selectedModel: ProviderModelDoc | null,
  imageContract?: ImageModelUiContract | null
): ConfigField[] {
  const fieldsByKey = new Map<string, ConfigField>();
  const modelSchemaFields = schemaFieldsFromRecordSchema(selectedModel?.schemaSnapshot?.inputSchema);

  for (const field of modelSchemaFields) {
    if (configFieldHiddenForNode(type, field.key, config, selectedModel, imageContract)) continue;
    fieldsByKey.set(field.key, normalizeConfigField(field));
  }

  for (const key of friendlyConfigFieldKeysForNode(type, config)) {
    if (configFieldHiddenForNode(type, key, config, selectedModel, imageContract)) continue;
    if (!fieldsByKey.has(key)) {
      const field = friendlyConfigFieldForKey(key, config);
      fieldsByKey.set(
        key,
        normalizeConfigField(
          key === "prompt" && imageContract?.prompt.required
            ? { ...field, required: true }
            : field
        )
      );
    }
  }

  for (const key of Object.keys(config)) {
    if (configFieldHiddenForNode(type, key, config, selectedModel, imageContract)) continue;
    if (!fieldsByKey.has(key)) {
      fieldsByKey.set(key, normalizeConfigField(friendlyConfigFieldForKey(key, config)));
    }
  }

  return sortConfigFieldsForNode(type, [...fieldsByKey.values()]);
}

export function configFieldValue(field: ConfigField, config: Record<string, unknown>): unknown {
  if (config[field.key] !== undefined) return config[field.key];
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.key === "aspectRatio") return "4:5";
  if (field.type === "boolean") return false;
  return "";
}

export function localReferenceFilesFromConfig(
  config: Record<string, unknown>,
  key: string,
  fallbackKind: LocalReferenceFileKind
) {
  const value = config[key];
  if (!Array.isArray(value)) return [];

  const references = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const storageUrl = record.storageUrl ?? record.url ?? record.previewUrl;
    if (typeof storageUrl !== "string" || !storageUrl.trim()) return [];
    const file =
      typeof File !== "undefined" && record.file instanceof File
        ? record.file
        : undefined;

    return [{
      id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : storageUrl,
      storageUrl,
      previewUrl: typeof record.previewUrl === "string" ? record.previewUrl : undefined,
      title: typeof record.title === "string" ? record.title : "Reference file",
      mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
      kind: typeof record.kind === "string" ? record.kind : fallbackKind,
      alias: typeof record.alias === "string" ? record.alias : undefined,
      source: typeof record.source === "string" ? record.source : undefined,
      sourceId: typeof record.sourceId === "string" ? record.sourceId : undefined,
      storageId: typeof record.storageId === "string" ? record.storageId : undefined,
      isDraft: record.isDraft === true,
      temporary: record.temporary === true,
      file,
    }];
  });

  return assignReferenceAliases(references, fallbackKind);
}

export function formatConfigFieldTextareaValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

export function coerceConfigFieldValue(
  field: ConfigField,
  value: string,
  previousValue: unknown
): unknown {
  if (field.type === "number") {
    if (!value.trim()) return "";
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : previousValue;
  }

  if (field.type === "json") {
    if (!value.trim()) return "";
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}
