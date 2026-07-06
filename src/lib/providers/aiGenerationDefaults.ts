import type { CreateMode } from "../create/createModes";
import { defaultRosterModelForMode } from "../generation/modelRoster";
import type { GenerationProviderName } from "./providerNames";

export type AiGenerationMode = "image" | "video" | "audio" | "lipsync" | "videoAnalysis";
export type AiGenerationProvider = GenerationProviderName;

export type AiGenerationSettings = {
  imageProvider?: AiGenerationProvider;
  imageModel?: string;
  imageResolution?: string;
  videoProvider?: AiGenerationProvider;
  videoModel?: string;
  audioProvider?: AiGenerationProvider;
  audioModel?: string;
  lipsyncProvider?: AiGenerationProvider;
  lipsyncModel?: string;
  videoAnalysisProvider?: AiGenerationProvider;
};

export type AiGenerationDefault = {
  model?: string;
  provider: AiGenerationProvider;
};

export const AI_PROVIDER_LABELS: Record<AiGenerationProvider, string> = {
  bulkapis: "BulkAPIs",
  fal: "fal.ai",
  gemini: "Google Gemini",
};

export const AI_PROVIDER_OPTIONS_BY_MODE: Record<
  AiGenerationMode,
  Array<{ value: AiGenerationProvider; label: string }>
> = {
  image: [
    { value: "fal", label: AI_PROVIDER_LABELS.fal },
    { value: "gemini", label: AI_PROVIDER_LABELS.gemini },
    { value: "bulkapis", label: AI_PROVIDER_LABELS.bulkapis },
  ],
  video: [
    { value: "fal", label: AI_PROVIDER_LABELS.fal },
    { value: "bulkapis", label: AI_PROVIDER_LABELS.bulkapis },
  ],
  audio: [
    { value: "fal", label: AI_PROVIDER_LABELS.fal },
    { value: "bulkapis", label: AI_PROVIDER_LABELS.bulkapis },
  ],
  lipsync: [
    { value: "fal", label: AI_PROVIDER_LABELS.fal },
    { value: "bulkapis", label: AI_PROVIDER_LABELS.bulkapis },
  ],
  videoAnalysis: [
    { value: "gemini", label: AI_PROVIDER_LABELS.gemini },
  ],
};

export const DEFAULT_AI_GENERATION_SETTINGS: Required<AiGenerationSettings> = {
  imageProvider: "fal",
  imageModel: defaultRosterModelForMode("image")?.id ?? "nano-banana-2",
  imageResolution: "2K",
  videoProvider: "fal",
  videoModel: defaultRosterModelForMode("video")?.id ?? "kling-v3-pro",
  audioProvider: "fal",
  audioModel: defaultRosterModelForMode("audio")?.id ?? "xai-tts",
  lipsyncProvider: "fal",
  lipsyncModel: defaultRosterModelForMode("lipsync")?.id ?? "seedance-2-lipsync",
  videoAnalysisProvider: "gemini",
};

export function resolveAiGenerationSettings(
  settings?: AiGenerationSettings | null
): Required<AiGenerationSettings> {
  return {
    imageProvider: settings?.imageProvider ?? DEFAULT_AI_GENERATION_SETTINGS.imageProvider,
    imageModel: settings?.imageModel ?? DEFAULT_AI_GENERATION_SETTINGS.imageModel,
    imageResolution: settings?.imageResolution ?? DEFAULT_AI_GENERATION_SETTINGS.imageResolution,
    videoProvider: settings?.videoProvider ?? DEFAULT_AI_GENERATION_SETTINGS.videoProvider,
    videoModel: settings?.videoModel ?? DEFAULT_AI_GENERATION_SETTINGS.videoModel,
    audioProvider: settings?.audioProvider ?? DEFAULT_AI_GENERATION_SETTINGS.audioProvider,
    audioModel: settings?.audioModel ?? DEFAULT_AI_GENERATION_SETTINGS.audioModel,
    lipsyncProvider: settings?.lipsyncProvider ?? DEFAULT_AI_GENERATION_SETTINGS.lipsyncProvider,
    lipsyncModel: settings?.lipsyncModel ?? DEFAULT_AI_GENERATION_SETTINGS.lipsyncModel,
    videoAnalysisProvider:
      settings?.videoAnalysisProvider ?? DEFAULT_AI_GENERATION_SETTINGS.videoAnalysisProvider,
  };
}

export function generationDefaultForMode(
  settings: AiGenerationSettings | null | undefined,
  mode: AiGenerationMode
): AiGenerationDefault {
  const resolved = resolveAiGenerationSettings(settings);

  switch (mode) {
    case "image":
      return { provider: resolved.imageProvider, model: resolved.imageModel };
    case "video":
      return { provider: resolved.videoProvider, model: resolved.videoModel };
    case "audio":
      return { provider: resolved.audioProvider, model: resolved.audioModel };
    case "lipsync":
      return { provider: resolved.lipsyncProvider, model: resolved.lipsyncModel };
    case "videoAnalysis":
      return { provider: resolved.videoAnalysisProvider };
  }
}

export function generationModeForCreateMode(mode: CreateMode): AiGenerationMode | null {
  if (mode === "image" || mode === "video" || mode === "audio") return mode;
  return null;
}
