export type LocalReferenceFileKind = "image" | "video" | "audio" | "media";

export type LocalReferenceFile = {
  alias?: string;
  file?: File;
  id: string;
  isDraft?: boolean;
  kind: string;
  mimeType?: string;
  previewUrl?: string;
  source?: string;
  sourceId?: string;
  storageId?: string;
  storageUrl: string;
  temporary?: boolean;
  title: string;
};

export type ConfigField = {
  defaultValue?: unknown;
  description?: string;
  disabled?: boolean;
  enumValues?: string[];
  key: string;
  label: string;
  required?: boolean;
  type: "boolean" | "enum" | "json" | "number" | "text" | "textarea";
};

export function configFieldValue(
  field: ConfigField,
  config: Record<string, unknown>
): unknown {
  if (config[field.key] !== undefined) return config[field.key];
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "boolean") return false;
  if (field.type === "number") return "";
  if (field.type === "json") return {};
  return "";
}

export function coerceConfigFieldValue(
  field: ConfigField,
  value: string,
  currentValue: unknown
): unknown {
  if (field.type === "number") {
    if (!value.trim()) return "";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : currentValue;
  }

  if (field.type === "json") {
    if (!value.trim()) return {};
    try {
      return JSON.parse(value);
    } catch {
      return currentValue;
    }
  }

  return value;
}

export function formatConfigFieldTextareaValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

export function formatConfigLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function localReferenceFilesFromConfig(
  config: Record<string, unknown>,
  key: string,
  kind: LocalReferenceFileKind
): LocalReferenceFile[] {
  const value = config[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LocalReferenceFile => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<LocalReferenceFile>;
    if (typeof candidate.id !== "string") return false;
    if (typeof candidate.storageUrl !== "string") return false;
    if (typeof candidate.title !== "string") return false;
    if (!candidate.kind || kind === "media") return true;
    return candidate.kind === kind || candidate.kind === "media";
  });
}
