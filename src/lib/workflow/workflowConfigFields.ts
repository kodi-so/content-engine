import type { WorkflowNodeType } from "./workflowGraph";
import { getWorkflowAgentPreset, workflowAgentPresetIds } from "./workflowAgentPresets";
import { postCompilerPresetIds } from "./postCompilerPresets";
import type { ImageModelUiContract, ProviderModelDoc } from "./workflowModelCatalog";

export type ConfigFieldType = "string" | "number" | "boolean" | "enum" | "json";

export type ConfigField = {
  key: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  advanced: boolean;
  defaultValue?: unknown;
  description?: string;
  enumValues?: string[];
};

export type LocalReferenceFileKind = "image" | "video" | "audio" | "media";

const hiddenImageGenerationConfigKeys = new Set([
  "audio_url",
  "audio_urls",
  "audioUrl",
  "end_frame",
  "end_frame_url",
  "image_input",
  "input_url",
  "image_url",
  "image_urls",
  "input_urls",
  "max_tokens",
  "messages",
  "reference_image",
  "reference_image_url",
  "reference_image_urls",
  "referenceImageUrl",
  "reference_video",
  "reference_video_url",
  "reference_video_urls",
  "referenceVideoUrl",
  "resolution",
  "seed",
  "song_url",
  "start_frame",
  "start_frame_url",
  "upscale_factor",
  "video_url",
  "video_urls",
  "videoUrl",
  "webhook_url",
  "webhookUrl",
]);

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
  "localReferenceAudios",
  "localReferenceImages",
  "localReferenceVideos",
  "maxDurationSeconds",
  "maxTokens",
  "mediaFromInputNode",
  "mode",
  "motionStyle",
  "name",
  "optimizeFor",
  "platform",
  "personaIds",
  "postType",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaFieldTypeFromValue(value: unknown): ConfigFieldType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  return "json";
}

function enumValuesFromSchemaProperty(property: Record<string, unknown>): string[] | undefined {
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

function schemaPropertyFieldType(property: Record<string, unknown>): ConfigFieldType {
  if (enumValuesFromSchemaProperty(property)?.length) return "enum";

  const type = Array.isArray(property.type) ? property.type[0] : property.type;
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  if (type === "string") return "string";
  return "json";
}

function isAdvancedConfigField(key: string, type: ConfigFieldType): boolean {
  if (type === "json") return true;
  return !primaryConfigFieldKeys.has(key);
}

function schemaFieldsFromRecordSchema(schema: unknown): ConfigField[] {
  if (!isRecord(schema)) return [];

  const candidateSchema =
    isRecord(schema.properties) || Array.isArray(schema.required)
      ? schema
      : isRecord(schema.schema)
        ? schema.schema
        : isRecord(schema.parameters)
          ? schema.parameters
          : schema;

  if (isRecord(candidateSchema.properties)) {
    const requiredKeys = new Set(
      Array.isArray(candidateSchema.required)
        ? candidateSchema.required.map((key) => String(key))
        : []
    );

    return Object.entries(candidateSchema.properties).map(([key, rawProperty]) => {
      const property = isRecord(rawProperty) ? rawProperty : {};
      const enumValues = enumValuesFromSchemaProperty(property);
      const type = schemaPropertyFieldType(property);

      return {
        key,
        label: typeof property.title === "string" ? property.title : formatConfigLabel(key),
        type,
        required: requiredKeys.has(key),
        advanced: isAdvancedConfigField(key, type),
        defaultValue: property.default,
        description: typeof property.description === "string" ? property.description : undefined,
        enumValues,
      };
    });
  }

  const directPropertyEntries = Object.entries(candidateSchema).filter(([key, value]) =>
    key !== "required" &&
    isRecord(value) &&
    (
      typeof value.type === "string" ||
      Array.isArray(value.enum) ||
      Array.isArray(value.options) ||
      value.default !== undefined ||
      typeof value.description === "string"
    )
  );

  if (directPropertyEntries.length) {
    const requiredKeys = new Set(
      Array.isArray(candidateSchema.required)
        ? candidateSchema.required.map((key) => String(key))
        : []
    );

    return directPropertyEntries.map(([key, rawProperty]) => {
      const property = rawProperty as Record<string, unknown>;
      const enumValues = enumValuesFromSchemaProperty(property);
      const type = schemaPropertyFieldType(property);

      return {
        key,
        label: typeof property.title === "string" ? property.title : formatConfigLabel(key),
        type,
        required: property.required === true || requiredKeys.has(key),
        advanced: isAdvancedConfigField(key, type),
        defaultValue: property.default,
        description: typeof property.description === "string" ? property.description : undefined,
        enumValues,
      };
    });
  }

  const fieldList =
    Array.isArray(candidateSchema.fields)
      ? candidateSchema.fields
      : Array.isArray(candidateSchema.inputs)
        ? candidateSchema.inputs
        : Array.isArray(candidateSchema.parameters)
          ? candidateSchema.parameters
          : [];

  return fieldList.flatMap((rawField) => {
    if (!isRecord(rawField)) return [];
    const keyValue = rawField.key ?? rawField.name ?? rawField.id;
    if (typeof keyValue !== "string" || !keyValue) return [];

    const enumValues = enumValuesFromSchemaProperty(rawField);
    const type =
      enumValues?.length
        ? "enum"
        : rawField.type === "number" || rawField.type === "integer"
          ? "number"
          : rawField.type === "boolean"
            ? "boolean"
            : rawField.type === "string"
              ? "string"
              : schemaFieldTypeFromValue(rawField.default);

    return [
      {
        key: keyValue,
        label: typeof rawField.label === "string" ? rawField.label : formatConfigLabel(keyValue),
        type,
        required: rawField.required === true,
        advanced: isAdvancedConfigField(keyValue, type),
        defaultValue: rawField.default,
        description: typeof rawField.description === "string" ? rawField.description : undefined,
        enumValues,
      },
    ];
  });
}

function friendlyConfigFieldKeysForNode(
  type: WorkflowNodeType,
  config: Record<string, unknown>
): string[] {
  switch (type) {
    case "runner":
      return ["trigger", "scheduleType", "intervalHours", "timezone", "runsPerExecution", "retryCount", "timeoutSeconds", "failureBehavior"];
    case "comment":
      return ["text"];
    case "media":
      return ["artifactIds", "creativeAssetIds", "personaIds", "uploadedMedia"];
    case "llm":
      return ["systemPrompt", "promptFromInputNode", "prompt", "responseFormat", "temperature", "maxTokens"];
    case "ai_agent":
      return getWorkflowAgentPreset(config.agentMode).configKeys;
    case "image_generation":
      return ["promptFromInputNode", "prompt", "imageFromInputNode", "localReferenceImages", "aspectRatio", "count"];
    case "video_generation":
      return ["promptFromInputNode", "prompt", "imageFromInputNode", "localReferenceImages", "localReferenceVideos", "aspectRatio", "durationSeconds", "resolution"];
    case "audio_generation":
      return ["mode", "textFromInputNode", "text", "voiceFromInputNode", "localReferenceAudios", "voice", "temperature", "cfgScale", "removeSilence"];
    case "lipsync":
      return ["imageFromInputNode", "localReferenceImages", "localReferenceVideos", "audioFromInputNode", "localReferenceAudios", "resolution", "turboMode"];
    case "native_slideshow_planner":
      return ["promptFromInputNode", "prompt", "slideCount", "aspectRatio", "platform", "tone"];
    case "native_slideshow_renderer":
      return ["renderMode", "aspectRatio", "resolution"];
    case "ai_video_editor":
      return ["renderMode", "promptFromInputNode", "prompt", "mediaFromInputNode", "uploadedMedia", "systemPrompt", "knowledgeBase", "aspectRatio", "maxDurationSeconds"];
    case "post_compiler":
      return ["postType", "platformPreset", "captionFromInputNode", "caption", "name", "optimizeForPlatforms"];
    case "export":
      return ["destination", "folder", "fileName", "optimizeFor"];
    case "auto_post":
      return ["autoPublish", "socialAccountIds", "captionFromInputNode", "caption", "scheduledAt", "timezone"];
  }
}

function friendlyConfigFieldForKey(key: string, config: Record<string, unknown>): ConfigField {
  const currentValue = config[key];
  const inferredType = schemaFieldTypeFromValue(currentValue);
  const defaultField: ConfigField = {
    key,
    label: formatConfigLabel(key),
    type: inferredType,
    required: false,
    advanced: isAdvancedConfigField(key, inferredType),
  };

  switch (key) {
    case "agentMode":
      return { ...defaultField, type: "enum", enumValues: workflowAgentPresetIds() };
    case "aspectRatio":
      return { ...defaultField, type: "enum", enumValues: ["9:16", "16:9", "1:1", "4:5", "3:4"] };
    case "autoPublish":
    case "audioFromInputNode":
    case "captionFromInputNode":
    case "imageFromInputNode":
    case "mediaFromInputNode":
    case "promptFromInputNode":
    case "removeSilence":
    case "requestFromInputNode":
    case "textFromInputNode":
    case "turboMode":
    case "voiceFromInputNode":
      return {
        ...defaultField,
        label: key === "promptFromInputNode"
          ? "Prompt from input node"
          : key === "imageFromInputNode"
            ? "Image from input node"
            : key === "audioFromInputNode"
              ? "Audio from input node"
              : key === "captionFromInputNode"
                ? "Caption from input node"
                : key === "mediaFromInputNode"
                  ? "Media from input node"
                  : key === "requestFromInputNode"
                    ? "Request from input node"
                    : key === "textFromInputNode"
                      ? "Text from input node"
                      : key === "voiceFromInputNode"
                        ? "Voice from input node"
                        : defaultField.label,
        type: "boolean",
      };
    case "count":
    case "durationSeconds":
    case "intervalHours":
    case "maxDurationSeconds":
    case "maxTokens":
    case "retryCount":
    case "runsPerExecution":
    case "scheduleDayOfWeek":
    case "scheduleHour":
    case "scheduleMinute":
    case "scriptLengthSeconds":
    case "seed":
    case "slideCount":
    case "temperature":
    case "timeoutSeconds":
    case "cfgScale":
    case "fps":
    case "height":
    case "width":
      return { ...defaultField, type: "number" };
    case "failureBehavior":
      return { ...defaultField, type: "enum", enumValues: ["stop_workflow", "continue_dependents", "skip_dependents"] };
    case "destination":
      return { ...defaultField, type: "enum", enumValues: ["media_library", "download", "google_drive"] };
    case "mode":
      return { ...defaultField, type: "enum", enumValues: ["tts", "sound_effect", "music"] };
    case "postType":
      return { ...defaultField, type: "enum", enumValues: ["video", "slideshow", "carousel", "single_image", "thread"] };
    case "platformPreset":
      return { ...defaultField, type: "enum", enumValues: postCompilerPresetIds() };
    case "renderMode":
      return { ...defaultField, type: "enum", enumValues: ["video_render", "music_edit", "native"] };
    case "responseFormat":
      return { ...defaultField, type: "enum", enumValues: ["text", "json"] };
    case "scheduleType":
      return { ...defaultField, type: "enum", enumValues: ["interval", "daily", "weekly"] };
    case "trigger":
      return { ...defaultField, type: "enum", enumValues: ["manual", "schedule", "event"] };
    case "assetIds":
    case "artifactIds":
    case "creativeAssetIds":
    case "personaIds":
    case "knowledgeBase":
    case "localReferenceAudios":
    case "localReferenceImages":
    case "localReferenceVideos":
    case "lockedDetails":
    case "avoid":
    case "platforms":
    case "uploadedMedia":
      return {
        ...defaultField,
        label: key === "localReferenceImages"
          ? "Reference images"
          : key === "localReferenceVideos"
            ? "Reference videos"
            : key === "localReferenceAudios"
              ? "Reference audio"
              : defaultField.label,
        type: "json",
        advanced: !["localReferenceImages", "localReferenceVideos", "localReferenceAudios", "uploadedMedia"].includes(key),
      };
    default:
      return defaultField;
  }
}

function imageConfigFieldHiddenByContract(
  key: string,
  selectedModel: ProviderModelDoc | null,
  imageContract?: ImageModelUiContract | null
): boolean {
  if ((key === "prompt" || key === "promptFromInputNode") && imageContract?.prompt.visible === false) return true;
  if (key === "promptFromInputNode" && imageContract?.prompt.canComeFromInput === false) return true;
  if (key === "prompt" && imageContract?.prompt.canBeConfiguredLocally === false) return true;
  if ((key === "localReferenceImages" || key === "imageFromInputNode") && imageContract?.images.visible === false) return true;
  if (key === "imageFromInputNode" && imageContract?.images.canComeFromInput === false) return true;
  if (key === "localReferenceImages" && imageContract?.images.canBeUploadedLocally === false) return true;
  if (selectedModel && (key === "aspectRatio" || key === "count")) return true;
  return false;
}

function configFieldHiddenForNode(
  type: WorkflowNodeType,
  key: string,
  selectedModel: ProviderModelDoc | null,
  imageContract?: ImageModelUiContract | null
): boolean {
  if (hiddenImageGenerationConfigKeys.has(key)) return true;
  if (type === "image_generation" && imageConfigFieldHiddenByContract(key, selectedModel, imageContract)) return true;
  if (!selectedModel) return false;
  if (type === "video_generation" && ["aspectRatio", "durationSeconds", "resolution"].includes(key)) return true;
  if (type === "lipsync" && ["resolution", "turboMode"].includes(key)) return true;
  if (type === "ai_video_editor" && ["aspectRatio", "maxDurationSeconds", "renderMode"].includes(key)) return true;
  if (type === "audio_generation" && ["cfgScale", "temperature"].includes(key)) return true;
  return false;
}

export function configFieldsForNode(
  type: WorkflowNodeType,
  config: Record<string, unknown>,
  selectedModel: ProviderModelDoc | null,
  imageContract?: ImageModelUiContract | null
): ConfigField[] {
  const fieldsByKey = new Map<string, ConfigField>();
  const modelSchemaFields = schemaFieldsFromRecordSchema(selectedModel?.schemaSnapshot?.inputSchema);

  for (const field of modelSchemaFields) {
    if (configFieldHiddenForNode(type, field.key, selectedModel, imageContract)) continue;
    fieldsByKey.set(field.key, field);
  }

  for (const key of friendlyConfigFieldKeysForNode(type, config)) {
    if (configFieldHiddenForNode(type, key, selectedModel, imageContract)) continue;
    if (!fieldsByKey.has(key)) {
      const field = friendlyConfigFieldForKey(key, config);
      fieldsByKey.set(key, key === "prompt" && imageContract?.prompt.required ? { ...field, required: true } : field);
    }
  }

  for (const key of Object.keys(config)) {
    if (configFieldHiddenForNode(type, key, selectedModel, imageContract)) continue;
    if (!fieldsByKey.has(key)) fieldsByKey.set(key, friendlyConfigFieldForKey(key, config));
  }

  return [...fieldsByKey.values()].sort((a, b) => {
    const fieldOrderByType: Partial<Record<WorkflowNodeType, string[]>> = {
      image_generation: ["imageFromInputNode", "localReferenceImages", "promptFromInputNode", "prompt", "aspectRatio", "count"],
      video_generation: ["imageFromInputNode", "localReferenceImages", "localReferenceVideos", "promptFromInputNode", "prompt", "aspectRatio", "durationSeconds"],
      audio_generation: ["mode", "textFromInputNode", "text", "voiceFromInputNode", "localReferenceAudios", "voice"],
      lipsync: ["imageFromInputNode", "localReferenceImages", "localReferenceVideos", "audioFromInputNode", "localReferenceAudios", "resolution", "turboMode"],
      ai_video_editor: ["mediaFromInputNode", "uploadedMedia", "promptFromInputNode", "prompt", "renderMode", "systemPrompt", "knowledgeBase", "aspectRatio", "maxDurationSeconds"],
      ai_agent: ["agentMode", "requestFromInputNode", "request", "tone", "platform", "temperature", "maxTokens"],
      llm: ["systemPrompt", "promptFromInputNode", "prompt", "responseFormat", "temperature", "maxTokens"],
      native_slideshow_planner: ["promptFromInputNode", "prompt", "slideCount", "aspectRatio", "platform", "tone"],
      post_compiler: ["postType", "platformPreset", "captionFromInputNode", "caption", "name", "optimizeForPlatforms"],
      auto_post: ["autoPublish", "socialAccountIds", "captionFromInputNode", "caption", "scheduledAt", "timezone"],
    };
    const fieldOrder = fieldOrderByType[type];
    if (fieldOrder) {
      const aIndex = fieldOrder.indexOf(a.key);
      const bIndex = fieldOrder.indexOf(b.key);
      if (aIndex !== bIndex) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
          (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }
    }

    if (a.advanced !== b.advanced) return a.advanced ? 1 : -1;
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

export function configFieldValue(field: ConfigField, config: Record<string, unknown>): unknown {
  if (config[field.key] !== undefined) return config[field.key];
  if (field.defaultValue !== undefined) return field.defaultValue;
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

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const storageUrl = record.storageUrl ?? record.url;
    if (typeof storageUrl !== "string" || !storageUrl.trim()) return [];

    return [{
      id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : storageUrl,
      storageUrl,
      title: typeof record.title === "string" ? record.title : "Reference file",
      mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
      kind: typeof record.kind === "string" ? record.kind : fallbackKind,
    }];
  });
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
