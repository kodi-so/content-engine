export type ConfigFieldType = "string" | "number" | "boolean" | "enum" | "json";

export type ConfigField = {
  key: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  advanced: boolean;
  defaultValue?: unknown;
  description?: string;
  disabled?: boolean;
  enumValues?: string[];
};

export type LocalReferenceFileKind = "image" | "video" | "audio" | "media";

export const creatorAspectRatioOptions = ["1:1", "4:5", "9:16"];

const primaryConfigFieldKeys = new Set([
  "agentMode",
  "analysisFocus",
  "aspectRatio",
  "audioFromInputNode",
  "audioUrl",
  "autoPublish",
  "captionFromInputNode",
  "creativeAssetIds",
  "caption",
  "count",
  "cta",
  "destination",
  "durationSeconds",
  "endFrameUrl",
  "failureBehavior",
  "fileName",
  "folder",
  "fps",
  "height",
  "hookStyle",
  "imageUrl",
  "imageFromInputNode",
  "intervalHours",
  "localEndFrameImages",
  "localReferenceAudios",
  "localReferenceImages",
  "localReferenceVideos",
  "localStartFrameImages",
  "maxDurationSeconds",
  "maxTokens",
  "mediaFromInputNode",
  "mode",
  "motionStyle",
  "name",
  "optimizeFor",
  "platform",
  "postType",
  "publishIntent",
  "prompt",
  "promptFromInputNode",
  "referenceImageUrl",
  "referenceVideoUrl",
  "removeSilence",
  "renderMode",
  "request",
  "requestFromInputNode",
  "resolution",
  "responseFormat",
  "retryCount",
  "runsPerExecution",
  "scheduleDayOfWeek",
  "scheduleHour",
  "scheduleMinute",
  "scheduledAt",
  "scheduleType",
  "scriptLengthSeconds",
  "seed",
  "slideCount",
  "startFrameUrl",
  "startEndFrameMode",
  "systemPrompt",
  "temperature",
  "text",
  "textFromInputNode",
  "timeoutSeconds",
  "timezone",
  "tone",
  "trigger",
  "turboMode",
  "uploadedMedia",
  "videoUrl",
  "voice",
  "voiceFromInputNode",
  "voiceReferenceUrl",
  "variationGoal",
  "webhookUrl",
  "width",
]);

export function formatConfigLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function schemaFieldTypeFromValue(value: unknown): ConfigFieldType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  return "json";
}

export function enumValuesFromSchemaProperty(property: Record<string, unknown>): string[] | undefined {
  const enumValues = Array.isArray(property.enum) ? property.enum : property.options;
  if (!Array.isArray(enumValues)) return undefined;

  const values = enumValues
    .map((value) => {
      if (isRecord(value)) {
        const nestedValue = value.value ?? value.id ?? value.name ?? value.label;
        return nestedValue === undefined ? null : String(nestedValue);
      }
      return value === undefined || value === null ? null : String(value);
    })
    .filter((value): value is string => Boolean(value));

  return values.length ? values : undefined;
}

export function isAdvancedConfigField(key: string, type: ConfigFieldType): boolean {
  if (type === "json") return true;
  return !primaryConfigFieldKeys.has(key);
}
