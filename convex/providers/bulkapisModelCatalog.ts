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
  | "music"
  | "lipsync"
  | "speech_to_text"
  | "upscale"
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
  if (rawCategory.includes("speech") && rawCategory.includes("text")) return "speech_to_text";
  if (rawCategory.includes("transcri") || rawCategory.includes("stt")) return "speech_to_text";
  if (rawCategory.includes("music") || rawCategory.includes("suno")) return "music";
  if (rawCategory.includes("audio") || rawCategory.includes("tts") || rawCategory.includes("voice")) return "audio";
  if (rawCategory.includes("upscale") || rawCategory.includes("topaz")) return "upscale";
  if (rawCategory.includes("image") || rawCategory.includes("banana") || rawCategory.includes("flux")) return "image";
  if (rawCategory.includes("video") || rawCategory.includes("kling") || rawCategory.includes("sora") || rawCategory.includes("veo")) return "video";
  if (rawCategory.includes("chat") || rawCategory.includes("llm") || rawCategory.includes("gpt") || rawCategory.includes("claude")) return "chat";

  return "unknown";
}

function capabilitiesFromModel(
  model: Record<string, unknown>,
  category: ProviderModelCategory
): ProviderModelCapabilities {
  const capabilities = { ...DEFAULT_CAPABILITIES };
  const rawCapabilities = model.capabilities;
  const capabilityTokens = Array.isArray(rawCapabilities)
    ? rawCapabilities.filter((item): item is string => typeof item === "string")
    : [];
  const capabilityText = capabilityTokens.join(" ").toLowerCase();
  const capabilityRecord = isRecord(rawCapabilities) ? rawCapabilities : {};

  capabilities.text = category === "chat" || Boolean(capabilityRecord.text) || capabilityText.includes("text");
  capabilities.structured = category === "chat" || Boolean(capabilityRecord.structured);
  capabilities.image = category === "image" || Boolean(capabilityRecord.image) || capabilityText.includes("image");
  capabilities.video = category === "video" || Boolean(capabilityRecord.video) || capabilityText.includes("video");
  capabilities.audio = category === "audio" || Boolean(capabilityRecord.audio) || capabilityText.includes("audio");
  capabilities.music = category === "music" || Boolean(capabilityRecord.music) || capabilityText.includes("music");
  capabilities.lipsync = category === "lipsync" || Boolean(capabilityRecord.lipsync);
  capabilities.videoRender = category === "video_render" || Boolean(capabilityRecord.videoRender);
  capabilities.speechToText = category === "speech_to_text" || Boolean(capabilityRecord.speechToText);
  capabilities.asyncJobs = category !== "chat" || Boolean(capabilityRecord.asyncJobs);
  capabilities.vision = category === "chat" || Boolean(capabilityRecord.vision) || capabilityText.includes("vision");

  return capabilities;
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

  return {
    modelId,
    displayName,
    description: stringValue(value, ["description", "summary"]),
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

    return {
      provider: BULKAPIS_PROVIDER,
      syncedAt,
      modelCount: models.length,
    };
  },
});
