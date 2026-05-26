import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { BULKAPIS_PROVIDER } from "./bulkapisConfig";
import { bulkApisRequest } from "./bulkapis";

type ProviderModelCategory =
  | "chat"
  | "image"
  | "video"
  | "video_render"
  | "audio"
  | "lipsync"
  | "unknown";

type ProviderModelCapabilities = {
  text: boolean;
  structured: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  music: boolean;
  lipsync: boolean;
  videoRender: boolean;
  speechToText: boolean;
  asyncJobs: boolean;
  vision: boolean;
};

type NormalizedProviderModel = {
  modelId: string;
  displayName: string;
  description?: string;
  category: ProviderModelCategory;
  capabilities: ProviderModelCapabilities;
  pricing?: unknown;
  schemaSnapshot: {
    inputSchema?: unknown;
    resultSchema?: unknown;
    raw: unknown;
    source: string;
    sourceSyncedAt: number;
  };
  isActive: boolean;
  metadata: Record<string, unknown>;
};

type ProviderModelUiField = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum" | "json";
  required: boolean;
  description?: string;
  enumValues?: string[];
};

type ProviderModelUiContract = {
  prompt: {
    visible: boolean;
    required: boolean;
    canComeFromInput: boolean;
    canBeConfiguredLocally: boolean;
  };
  images: {
    visible: boolean;
    required: boolean;
    canComeFromInput: boolean;
    canBeUploadedLocally: boolean;
    multiple: boolean;
    maxCount?: number;
  };
  fields: ProviderModelUiField[];
};

const DEFAULT_CAPABILITIES: ProviderModelCapabilities = {
  text: false,
  structured: false,
  image: false,
  video: false,
  audio: false,
  music: false,
  lipsync: false,
  videoRender: false,
  speechToText: false,
  asyncJobs: false,
  vision: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return undefined;
}

function booleanValue(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }

  return undefined;
}

function arrayStringValue(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string =>
        typeof item === "string" && item.trim().length > 0
      );
    }
  }

  return [];
}

function modelListFromResponse(response: unknown): unknown[] {
  if (Array.isArray(response)) return response;
  if (!isRecord(response)) return [];

  for (const key of ["models", "items", "data", "results"]) {
    const value = response[key];
    if (Array.isArray(value)) return value;
  }

  return [];
}

function inferCategory(model: Record<string, unknown>): ProviderModelCategory {
  const rawCategory = [
    stringValue(model, ["category", "type", "modelType", "modality"]),
    stringValue(model, ["id", "model", "modelId", "slug", "name"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (rawCategory.includes("video") && rawCategory.includes("render")) return "video_render";
  if (rawCategory.includes("render")) return "video_render";
  if (rawCategory.includes("lipsync") || rawCategory.includes("lip sync")) return "lipsync";
  if (rawCategory.includes("video")) return "video";
  if (rawCategory.includes("speech") && rawCategory.includes("text")) return "audio";
  if (rawCategory.includes("transcri") || rawCategory.includes("stt")) return "audio";
  if (rawCategory.includes("music") || rawCategory.includes("suno")) return "audio";
  if (rawCategory.includes("audio") || rawCategory.includes("tts") || rawCategory.includes("voice")) return "audio";
  if (rawCategory.includes("upscale") || rawCategory.includes("topaz")) return "image";
  if (rawCategory.includes("image") || rawCategory.includes("banana") || rawCategory.includes("flux")) return "image";
  if (rawCategory.includes("kling") || rawCategory.includes("sora") || rawCategory.includes("veo")) return "video";
  if (rawCategory.includes("chat") || rawCategory.includes("llm") || rawCategory.includes("gpt") || rawCategory.includes("claude")) return "chat";

  return "unknown";
}

function rawCapabilityTokens(model: Record<string, unknown>): string[] {
  const rawCapabilities = model.capabilities;
  return Array.isArray(rawCapabilities)
    ? rawCapabilities.filter((item): item is string =>
        typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function capabilitiesFromModel(
  model: Record<string, unknown>,
  category: ProviderModelCategory
): ProviderModelCapabilities {
  const capabilities = { ...DEFAULT_CAPABILITIES };
  const rawCapabilities = model.capabilities;
  const capabilityTokens = rawCapabilityTokens(model);
  const capabilityText = capabilityTokens.join(" ").toLowerCase();
  const capabilityRecord = isRecord(rawCapabilities) ? rawCapabilities : {};

  capabilities.text = category === "chat" || Boolean(capabilityRecord.text) || capabilityText.includes("text");
  capabilities.structured = category === "chat" || Boolean(capabilityRecord.structured);
  capabilities.image = category === "image" || Boolean(capabilityRecord.image) || capabilityText.includes("image");
  capabilities.video = category === "video" || Boolean(capabilityRecord.video) || capabilityText.includes("video");
  capabilities.audio = category === "audio" || Boolean(capabilityRecord.audio) || capabilityText.includes("audio");
  capabilities.music = Boolean(capabilityRecord.music) || capabilityText.includes("music") || capabilityText.includes("suno");
  capabilities.lipsync = category === "lipsync" || Boolean(capabilityRecord.lipsync);
  capabilities.videoRender = category === "video_render" || Boolean(capabilityRecord.videoRender);
  capabilities.speechToText = Boolean(capabilityRecord.speechToText) ||
    capabilityText.includes("speech-to-text") ||
    capabilityText.includes("speech to text") ||
    capabilityText.includes("transcription");
  capabilities.asyncJobs = category !== "chat" || Boolean(capabilityRecord.asyncJobs);
  capabilities.vision = category === "chat" || Boolean(capabilityRecord.vision) || capabilityText.includes("vision");

  return capabilities;
}

function schemaFieldType(field: Record<string, unknown>): ProviderModelUiField["type"] {
  const enumValues = arrayStringValue(field, ["enum", "options"]);
  if (enumValues.length) return "enum";

  switch (field.type) {
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    default:
      return "json";
  }
}

function formatLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function requiredKeysFromSchema(inputSchema: unknown): Set<string> {
  if (!isRecord(inputSchema)) return new Set();
  const required = inputSchema.required;
  return new Set(
    Array.isArray(required)
      ? required.filter((item): item is string => typeof item === "string")
      : []
  );
}

function schemaFieldIsRequired(
  inputSchema: unknown,
  key: string,
  field: Record<string, unknown>
): boolean {
  return field.required === true || requiredKeysFromSchema(inputSchema).has(key);
}

function fieldDescription(field: Record<string, unknown>): string | undefined {
  const description = field.description;
  return typeof description === "string" && description.trim()
    ? description.trim()
    : undefined;
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function imageInputMaxCount(key: string, field: Record<string, unknown>): number | undefined {
  const maxItems = numericValue(field.maxItems);
  if (maxItems !== undefined) return maxItems;

  const description = fieldDescription(field)?.toLowerCase();
  const upToMatch = description?.match(/up to\s+(\d+)/);
  if (upToMatch) return Number(upToMatch[1]);

  if (key.endsWith("s") || field.type === "array") return undefined;
  return 1;
}

function isPromptKey(key: string): boolean {
  return key === "prompt";
}

function isImageInputKey(key: string): boolean {
  return [
    "image",
    "image_input",
    "image_url",
    "image_urls",
    "input_url",
    "input_urls",
    "reference_image",
    "reference_image_url",
    "reference_image_urls",
  ].includes(key);
}

function isCountKey(key: string): boolean {
  return ["count", "num_images", "max_images"].includes(key);
}

function isInternalOrUnsupportedImageField(key: string): boolean {
  return isPromptKey(key) || isImageInputKey(key) || isCountKey(key) ||
    key === "seed" ||
    key === "webhook_url" ||
    key === "webhookUrl";
}

function uiFieldFromSchemaEntry(
  key: string,
  field: Record<string, unknown>,
  inputSchema: unknown
): ProviderModelUiField {
  const enumValues = arrayStringValue(field, ["enum", "options"]);
  return {
    key,
    label: typeof field.label === "string" && field.label.trim()
      ? field.label.trim()
      : formatLabel(key),
    type: schemaFieldType(field),
    required: schemaFieldIsRequired(inputSchema, key, field),
    description: fieldDescription(field),
    ...(enumValues.length ? { enumValues } : {}),
  };
}

function modelText(model: Record<string, unknown>): string {
  return [
    stringValue(model, ["category", "type", "modelType", "modality", "provider"]),
    stringValue(model, ["id", "model", "modelId", "slug", "name"]),
    ...rawCapabilityTokens(model),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildUiContract(
  model: Record<string, unknown>,
  category: ProviderModelCategory,
  inputSchema: unknown
): ProviderModelUiContract {
  const text = modelText(model);
  const schemaEntries = isRecord(inputSchema) ? Object.entries(inputSchema) : [];
  const promptEntry = schemaEntries.find(([key]) => isPromptKey(key));
  const imageEntries = schemaEntries.filter(([key]) => isImageInputKey(key));
  const hasTextToImage = text.includes("text to image");
  const hasImageEdit =
    text.includes("image editing") ||
    text.includes("image to image") ||
    text.includes("multi-image") ||
    text.includes("character reference") ||
    text.includes("upscale") ||
    text.includes("remove background");
  const promptRequired = promptEntry
    ? schemaFieldIsRequired(inputSchema, promptEntry[0], promptEntry[1] as Record<string, unknown>)
    : category === "image" && hasTextToImage;
  const imageRequired = imageEntries.some(([key, field]) =>
    schemaFieldIsRequired(inputSchema, key, field as Record<string, unknown>)
  ) || (category === "image" && !hasTextToImage && hasImageEdit);
  const imageMaxCounts = imageEntries
    .map(([key, field]) => imageInputMaxCount(key, field as Record<string, unknown>))
    .filter((value): value is number => value !== undefined);
  const multipleImages = imageEntries.some(([key, field]) =>
    (field as Record<string, unknown>).type === "array" ||
    key.endsWith("s") ||
    (imageInputMaxCount(key, field as Record<string, unknown>) ?? 1) > 1
  );
  const maxCount = imageMaxCounts.length ? Math.max(...imageMaxCounts) : undefined;

  return {
    prompt: {
      visible: category !== "image" || Boolean(promptEntry) || hasTextToImage || !hasImageEdit,
      required: promptRequired,
      canComeFromInput: true,
      canBeConfiguredLocally: true,
    },
    images: {
      visible: category === "image" && (imageEntries.length > 0 || hasImageEdit),
      required: imageRequired,
      canComeFromInput: true,
      canBeUploadedLocally: true,
      multiple: multipleImages,
      ...(maxCount ? { maxCount } : {}),
    },
    fields: schemaEntries
      .filter(([key]) => !isInternalOrUnsupportedImageField(key))
      .map(([key, field]) =>
        uiFieldFromSchemaEntry(key, field as Record<string, unknown>, inputSchema)
      ),
  };
}

function generatedDescription(
  model: Record<string, unknown>,
  displayName: string,
  category: ProviderModelCategory,
  contract: ProviderModelUiContract
): string {
  const explicitDescription = stringValue(model, ["description", "summary"]);
  if (explicitDescription) return explicitDescription;

  const provider = stringValue(model, ["provider"]);
  const capabilities = rawCapabilityTokens(model);
  const capabilityPhrase = capabilities.length
    ? ` Supports ${capabilities.join(", ")}.`
    : "";
  const imageRequirement = category === "image" && contract.images.required
    ? " Requires an image input."
    : "";
  const promptRequirement = category === "image" && contract.prompt.required
    ? " Requires a prompt."
    : "";
  const providerPhrase = provider ? `${provider} ` : "";

  return `${providerPhrase}${formatLabel(category)} model for ${displayName}.${capabilityPhrase}${imageRequirement}${promptRequirement}`;
}

function normalizeProviderModel(value: unknown, syncedAt: number): NormalizedProviderModel | null {
  if (!isRecord(value)) return null;

  const modelId = stringValue(value, ["id", "modelId", "model", "slug", "name"]);
  if (!modelId) return null;

  const category = inferCategory(value);
  const displayName = stringValue(value, ["displayName", "name", "title", "label"]) ?? modelId;
  const pricing = value.pricing ?? value.price ?? value.cost ?? value.credits;
  const inputSchema = value.inputSchema ?? value.input_schema;
  const resultSchema = value.resultSchema ?? value.result_schema ?? value.outputSchema ?? value.output_schema;
  const uiContract = buildUiContract(value, category, inputSchema);

  return {
    modelId,
    displayName,
    description: generatedDescription(value, displayName, category, uiContract),
    category,
    capabilities: capabilitiesFromModel(value, category),
    pricing,
    schemaSnapshot: {
      inputSchema,
      resultSchema,
      raw: value,
      source: "bulkapis:/ai/models",
      sourceSyncedAt: syncedAt,
    },
    isActive: booleanValue(value, ["isActive", "active", "enabled"]) ?? true,
    metadata: {
      providerCategory: value.category,
      providerType: value.type ?? value.modelType,
      rawModelId: modelId,
      providerCapabilities: rawCapabilityTokens(value),
      uiContract,
    },
  };
}

export const syncBulkApisModels = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const syncedAt = Date.now();
    const response = await bulkApisRequest<unknown>("list_models", "/ai/models", {
      method: "GET",
    });
    const models = modelListFromResponse(response)
      .map((model) => normalizeProviderModel(model, syncedAt))
      .filter((model): model is NormalizedProviderModel => model !== null);

    for (const model of models) {
      await ctx.runMutation(internal.providers.modelCatalog.upsert, {
        provider: BULKAPIS_PROVIDER,
        modelId: model.modelId,
        displayName: model.displayName,
        description: model.description,
        category: model.category,
        capabilities: model.capabilities,
        pricing: model.pricing,
        schemaSnapshot: model.schemaSnapshot,
        isActive: model.isActive,
        metadata: model.metadata,
        lastSyncedAt: syncedAt,
      });
    }

    const cachedModels = await ctx.runQuery(
      internal.providers.modelCatalog.listForProviderSync,
      { provider: BULKAPIS_PROVIDER }
    );

    for (const cachedModel of cachedModels) {
      const schemaSnapshot = isRecord(cachedModel.schemaSnapshot)
        ? cachedModel.schemaSnapshot
        : {};
      const rawModel = isRecord(schemaSnapshot.raw)
        ? schemaSnapshot.raw
        : {
            id: cachedModel.modelId,
            name: cachedModel.displayName,
            category: cachedModel.category,
            capabilities: isRecord(cachedModel.capabilities)
              ? Object.entries(cachedModel.capabilities)
                  .filter(([, enabled]) => enabled === true)
                  .map(([capability]) => capability)
              : [],
            inputSchema: schemaSnapshot.inputSchema,
            resultSchema: schemaSnapshot.resultSchema,
          };
      const normalizedModel = normalizeProviderModel(rawModel, syncedAt);

      if (!normalizedModel) continue;

      await ctx.runMutation(internal.providers.modelCatalog.upsert, {
        provider: BULKAPIS_PROVIDER,
        modelId: normalizedModel.modelId,
        displayName: normalizedModel.displayName,
        description: normalizedModel.description,
        category: normalizedModel.category,
        capabilities: normalizedModel.capabilities,
        pricing: normalizedModel.pricing,
        schemaSnapshot: normalizedModel.schemaSnapshot,
        isActive: normalizedModel.isActive,
        metadata: normalizedModel.metadata,
        lastSyncedAt: syncedAt,
      });
    }

    return {
      provider: BULKAPIS_PROVIDER,
      syncedAt,
      modelCount: models.length,
    };
  },
});
