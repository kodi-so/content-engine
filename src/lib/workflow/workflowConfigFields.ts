import type { WorkflowNodeType } from "./workflowGraph";
import { generationOperationForConfig } from "../generation/generationOperations";
import { getWorkflowAgentPreset, workflowAgentPresetIds } from "./workflowAgentPresets";
import { postCompilerPresetIds } from "./postCompilerPresets";
import type { ImageModelUiContract, ProviderModelDoc } from "./workflowModelCatalog";
import { assignReferenceAliases } from "../references/referenceAliases";

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

export const creatorAspectRatioOptions = ["1:1", "4:5", "9:16"];

const creatorMediaConfigFieldKeysByNodeType: Partial<Record<WorkflowNodeType, Set<string>>> = {
  image_generation: new Set([
    "promptFromInputNode",
    "prompt",
    "imageFromInputNode",
    "localReferenceImages",
    "aspectRatio",
    "count",
  ]),
  video_generation: new Set([
    "promptFromInputNode",
    "prompt",
    "imageFromInputNode",
    "localReferenceImages",
    "startEndFrameMode",
    "localStartFrameImages",
    "localEndFrameImages",
    "localReferenceVideos",
    "aspectRatio",
    "durationSeconds",
  ]),
  audio_generation: new Set([
    "mode",
    "textFromInputNode",
    "text",
    "voiceFromInputNode",
    "localReferenceAudios",
    "voice",
  ]),
};

const hiddenImageGenerationConfigKeys = new Set([
  "generationOperation",
  "audio_url",
  "audio_urls",
  "audioUrl",
  "end_frame",
  "end_frame_url",
  "first_frame_url",
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
  "last_frame_url",
  "start_frame",
  "start_frame_url",
  "tail_image_url",
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
      return ["uploadedMedia"];
    case "llm":
      return ["systemPrompt", "promptFromInputNode", "prompt", "responseFormat", "temperature", "maxTokens"];
    case "ai_agent":
      return getWorkflowAgentPreset(config.agentMode).configKeys;
    case "image_generation":
      return ["promptFromInputNode", "prompt", "imageFromInputNode", "localReferenceImages", "aspectRatio", "count"];
    case "video_generation":
      return [
        "promptFromInputNode",
        "prompt",
        "imageFromInputNode",
        "localReferenceImages",
        "startEndFrameMode",
        "localStartFrameImages",
        "localEndFrameImages",
        "localReferenceVideos",
        "aspectRatio",
        "durationSeconds",
        "resolution",
      ];
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
      return ["publishIntent", "socialAccountIds", "captionFromInputNode", "caption", "scheduledAt", "timezone"];
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
      return {
        ...defaultField,
        required: true,
        type: "enum",
        enumValues: creatorAspectRatioOptions,
      };
    case "autoPublish":
    case "audioFromInputNode":
    case "captionFromInputNode":
    case "imageFromInputNode":
    case "mediaFromInputNode":
    case "promptFromInputNode":
    case "removeSilence":
    case "requestFromInputNode":
    case "startEndFrameMode":
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
                      : key === "startEndFrameMode"
                        ? "Start/end frame mode"
                      : key === "voiceFromInputNode"
                        ? "Voice from input node"
                        : defaultField.label,
        type: "boolean",
      };
    case "count":
      return { ...defaultField, label: "Number of images", type: "number" };
    case "publishIntent":
      return {
        ...defaultField,
        label: "Publish intent",
        required: true,
        type: "enum",
        enumValues: ["draft", "publish", "schedule", "distribution_plan"],
        description:
          "Choose whether this node sends a provider draft, publishes now, schedules, or only creates a Content Engine plan.",
      };
    case "socialAccountIds":
      return {
        ...defaultField,
        label: "Accounts",
        type: "json",
        description: "Choose the connected social accounts that should receive this post.",
      };
    case "durationSeconds":
      return { ...defaultField, label: "Duration", type: "number" };
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
    case "knowledgeBase":
    case "localEndFrameImages":
    case "localReferenceAudios":
    case "localReferenceImages":
    case "localReferenceVideos":
    case "localStartFrameImages":
    case "lockedDetails":
    case "avoid":
    case "platforms":
    case "uploadedMedia":
      return {
        ...defaultField,
        label: key === "localReferenceImages"
          ? "Reference images"
          : key === "localStartFrameImages"
            ? "Start frame"
            : key === "localEndFrameImages"
              ? "End frame"
              : key === "localReferenceVideos"
                ? "Reference videos"
                : key === "localReferenceAudios"
                  ? "Reference audio"
                  : key === "uploadedMedia"
                    ? "Reference files"
                    : defaultField.label,
        type: "json",
        advanced: ![
          "localEndFrameImages",
          "localReferenceImages",
          "localReferenceVideos",
          "localReferenceAudios",
          "localStartFrameImages",
          "uploadedMedia",
        ].includes(key),
      };
    default:
      return defaultField;
  }
}

function normalizeConfigField(field: ConfigField): ConfigField {
  if (field.key === "aspectRatio") {
    return {
      ...field,
      advanced: false,
      required: true,
      type: "enum",
      enumValues: creatorAspectRatioOptions,
    };
  }

  return field;
}

function imageConfigFieldHiddenByContract(
  key: string,
  imageContract?: ImageModelUiContract | null
): boolean {
  if ((key === "prompt" || key === "promptFromInputNode") && imageContract?.prompt.visible === false) return true;
  if (key === "promptFromInputNode" && imageContract?.prompt.canComeFromInput === false) return true;
  if (key === "prompt" && imageContract?.prompt.canBeConfiguredLocally === false) return true;
  if ((key === "localReferenceImages" || key === "imageFromInputNode") && imageContract?.images.visible === false) return true;
  if (key === "imageFromInputNode" && imageContract?.images.canComeFromInput === false) return true;
  if (key === "localReferenceImages" && imageContract?.images.canBeUploadedLocally === false) return true;
  return false;
}

function configFieldHiddenForNode(
  type: WorkflowNodeType,
  key: string,
  config: Record<string, unknown>,
  selectedModel: ProviderModelDoc | null,
  imageContract?: ImageModelUiContract | null
): boolean {
  const operation = generationOperationForConfig(type, config);
  if (hiddenImageGenerationConfigKeys.has(key)) return true;
  const creatorMediaFieldKeys = creatorMediaConfigFieldKeysByNodeType[type];
  if (creatorMediaFieldKeys && !creatorMediaFieldKeys.has(key)) return true;
  if (
    type === "media" &&
    ["artifactIds", "creativeAssetIds", "referenceInstructions"].includes(key)
  ) {
    return true;
  }
  if (type === "image_generation" && imageConfigFieldHiddenByContract(key, imageContract)) return true;
  if (type === "image_generation") {
    if (
      operation?.id === "image_text_to_image" &&
      ["imageFromInputNode", "localReferenceImages"].includes(key)
    ) {
      return true;
    }
  }
  if (type === "video_generation") {
    if (operation?.id === "video_text_to_video") {
      if (
        [
          "imageFromInputNode",
          "startEndFrameMode",
          "localReferenceImages",
          "localStartFrameImages",
          "localEndFrameImages",
          "localReferenceVideos",
        ].includes(key)
      ) {
        return true;
      }
    }
    if (operation?.id === "video_image_to_video") {
      if (
        [
          "startEndFrameMode",
          "localStartFrameImages",
          "localEndFrameImages",
          "localReferenceVideos",
        ].includes(key)
      ) {
        return true;
      }
    }
    if (operation?.id === "video_reference_to_video") {
      if (
        [
          "imageFromInputNode",
          "startEndFrameMode",
          "localStartFrameImages",
          "localEndFrameImages",
        ].includes(key)
      ) {
        return true;
      }
    }
    if (operation?.id === "video_start_end_frame") {
      if (["imageFromInputNode", "localReferenceImages", "localReferenceVideos"].includes(key)) {
        return true;
      }
    }
  }
  if (type === "audio_generation") {
    if (
      operation?.id !== "audio_voice_clone" &&
      ["voiceFromInputNode", "localReferenceAudios", "voice"].includes(key)
    ) {
      return true;
    }
  }
  if (!selectedModel) return false;
  if (type === "video_generation" && key === "resolution") return true;
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

  return [...fieldsByKey.values()].sort((a, b) => {
    const fieldOrderByType: Partial<Record<WorkflowNodeType, string[]>> = {
      image_generation: ["imageFromInputNode", "localReferenceImages", "promptFromInputNode", "prompt", "aspectRatio", "count"],
      video_generation: [
        "imageFromInputNode",
        "startEndFrameMode",
        "localReferenceImages",
        "localStartFrameImages",
        "localEndFrameImages",
        "localReferenceVideos",
        "promptFromInputNode",
        "prompt",
        "aspectRatio",
        "durationSeconds",
      ],
      audio_generation: ["mode", "textFromInputNode", "text", "voiceFromInputNode", "localReferenceAudios", "voice"],
      lipsync: ["imageFromInputNode", "localReferenceImages", "localReferenceVideos", "audioFromInputNode", "localReferenceAudios", "resolution", "turboMode"],
      ai_video_editor: ["mediaFromInputNode", "uploadedMedia", "promptFromInputNode", "prompt", "renderMode", "systemPrompt", "knowledgeBase", "aspectRatio", "maxDurationSeconds"],
      ai_agent: ["agentMode", "requestFromInputNode", "request", "tone", "platform", "temperature", "maxTokens"],
      llm: ["systemPrompt", "promptFromInputNode", "prompt", "responseFormat", "temperature", "maxTokens"],
      native_slideshow_planner: ["promptFromInputNode", "prompt", "slideCount", "aspectRatio", "platform", "tone"],
      post_compiler: ["postType", "platformPreset", "captionFromInputNode", "caption", "name", "optimizeForPlatforms"],
      auto_post: ["publishIntent", "socialAccountIds", "captionFromInputNode", "caption", "scheduledAt", "timezone"],
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
