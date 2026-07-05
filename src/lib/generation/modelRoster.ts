import type { VideoDurationConstraint } from "./videoDurationConstraints";

export type RosterModelMode = "image" | "video" | "audio" | "lipsync";

export type RosterModel = {
  id: string;
  label: string;
  mode: RosterModelMode;
  aliases: string[];
  falModelId?: string;
  textToVideoModelId?: string;
  imageToVideoModelId?: string;
  referenceToVideoModelId?: string;
  durationConstraint?: VideoDurationConstraint;
  aspectRatios?: string[];
  nativeAudio?: boolean;
  multiShot?: boolean;
  maxReferenceImages?: number;
  approxCostPerSecondUsd?: number;
  strengths: string;
  isDefault?: boolean;
};

export type RosterVideoVariant = "text" | "image" | "reference";

const klingThreeToFifteenSeconds: VideoDurationConstraint = {
  kind: "enum",
  values: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  defaultValue: 5,
  providerValueType: "string",
};

const seedanceTwoToTwelveSeconds: VideoDurationConstraint = {
  kind: "enum",
  values: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  defaultValue: 5,
  providerValueType: "string",
};

const seedanceTwoFourToFifteenSeconds: VideoDurationConstraint = {
  kind: "enum",
  values: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  defaultValue: 8,
  providerValueType: "string",
};

const soraTwoSeconds: VideoDurationConstraint = {
  kind: "enum",
  values: [4, 8, 12, 16, 20],
  defaultValue: 4,
  providerValueType: "number",
};

const veoThreeOneSeconds: VideoDurationConstraint = {
  kind: "enum",
  values: [4, 6, 8],
  defaultValue: 8,
  providerValueType: "secondsString",
};

const pixverseOneToFifteenSeconds: VideoDurationConstraint = {
  kind: "integerRange",
  min: 1,
  max: 15,
  defaultValue: 5,
};

const ltxTwoFrameCount: VideoDurationConstraint = {
  kind: "frameCount",
  defaultValue: 5,
  fps: 25,
};

export const ROSTER_MODELS: RosterModel[] = [
  {
    id: "gemini-3-1-flash-image",
    label: "Gemini 3.1 Flash Image",
    mode: "image",
    aliases: ["gemini flash image", "gemini 3.1 image", "flash image"],
    falModelId: "fal-ai/gemini-3.1-flash-image-preview",
    aspectRatios: ["1:1", "4:5", "9:16", "16:9"],
    maxReferenceImages: 8,
    strengths: "Fast default for everyday image generation and reference-aware edits.",
    isDefault: true,
  },
  {
    id: "gemini-3-pro-image",
    label: "Gemini 3 Pro Image",
    mode: "image",
    aliases: ["gemini pro image", "gemini 3 image", "pro image"],
    falModelId: "fal-ai/gemini-3-pro-image-preview",
    aspectRatios: ["1:1", "4:5", "9:16", "16:9"],
    maxReferenceImages: 8,
    strengths: "Higher quality Gemini image route for polished visuals and typography.",
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    mode: "image",
    aliases: ["nano banana pro", "banana pro"],
    falModelId: "fal-ai/nano-banana-pro",
    aspectRatios: ["1:1", "4:5", "9:16", "16:9"],
    maxReferenceImages: 8,
    strengths: "Strong image generation and editing option when quality matters.",
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    mode: "image",
    aliases: ["nano banana 2", "banana 2"],
    falModelId: "fal-ai/nano-banana-2",
    aspectRatios: ["1:1", "4:5", "9:16", "16:9"],
    maxReferenceImages: 8,
    strengths: "Fast practical image generation and editing option.",
  },
  {
    id: "kling-v3-pro",
    label: "Kling v3 Pro",
    mode: "video",
    aliases: ["kling", "kling 3", "kling v3", "kling 3 pro", "kling v3 pro"],
    textToVideoModelId: "fal-ai/kling-video/v3/pro/text-to-video",
    imageToVideoModelId: "fal-ai/kling-video/v3/pro/image-to-video",
    durationConstraint: klingThreeToFifteenSeconds,
    aspectRatios: ["1:1", "9:16", "16:9"],
    nativeAudio: true,
    multiShot: true,
    maxReferenceImages: 1,
    strengths: "Default cinematic video model with native audio and short multi-shot storyboard support.",
    isDefault: true,
  },
  {
    id: "kling-o3-pro",
    label: "Kling O3 Pro",
    mode: "video",
    aliases: ["kling o3", "o3", "kling o3 pro"],
    imageToVideoModelId: "fal-ai/kling-video/o3/pro/image-to-video",
    referenceToVideoModelId: "fal-ai/kling-video/o3/pro/reference-to-video",
    durationConstraint: klingThreeToFifteenSeconds,
    aspectRatios: ["1:1", "9:16", "16:9"],
    nativeAudio: true,
    multiShot: true,
    maxReferenceImages: 4,
    strengths: "Higher-quality Kling route for start/end frames and reference-guided multi-shot clips.",
  },
  {
    id: "seedance-v1-pro",
    label: "Seedance v1 Pro",
    mode: "video",
    aliases: ["seedance", "seedance 1", "seedance v1", "seedance pro"],
    textToVideoModelId: "fal-ai/bytedance/seedance/v1/pro/text-to-video",
    imageToVideoModelId: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    durationConstraint: seedanceTwoToTwelveSeconds,
    aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    multiShot: true,
    maxReferenceImages: 1,
    strengths: "Flexible cinematic model with broad aspect ratios and multi-shot camera language.",
  },
  {
    id: "seedance-2-reference",
    label: "Seedance 2.0 Reference",
    mode: "video",
    aliases: ["seedance 2", "seedance 2.0", "seedance reference", "seedance video reference"],
    referenceToVideoModelId: "fal-ai/seedance-2.0/reference-to-video",
    durationConstraint: seedanceTwoFourToFifteenSeconds,
    aspectRatios: ["16:9", "9:16"],
    nativeAudio: true,
    multiShot: true,
    maxReferenceImages: 9,
    strengths: "Reference-heavy multimodal video route with native audio and multi-shot continuity.",
  },
  {
    id: "sora-2",
    label: "Sora 2",
    mode: "video",
    aliases: ["sora", "sora 2", "openai sora"],
    textToVideoModelId: "fal-ai/sora-2/text-to-video",
    imageToVideoModelId: "fal-ai/sora-2/image-to-video",
    durationConstraint: soraTwoSeconds,
    aspectRatios: ["9:16", "16:9"],
    nativeAudio: true,
    multiShot: true,
    maxReferenceImages: 1,
    strengths: "Strong physics and dialogue-oriented clips with native audio and longer duration choices.",
  },
  {
    id: "veo-3-1",
    label: "Veo 3.1",
    mode: "video",
    aliases: ["veo", "veo 3", "veo 3.1", "google veo"],
    textToVideoModelId: "fal-ai/veo3.1",
    durationConstraint: veoThreeOneSeconds,
    aspectRatios: ["9:16", "16:9"],
    nativeAudio: true,
    maxReferenceImages: 0,
    strengths: "Best for prompt-only dialogue, ambience, and sound-first cinematic realism.",
  },
  {
    id: "pixverse-v6",
    label: "PixVerse v6",
    mode: "video",
    aliases: ["pixverse", "pixverse 6", "pixverse v6"],
    imageToVideoModelId: "fal-ai/pixverse/v6/image-to-video",
    durationConstraint: pixverseOneToFifteenSeconds,
    aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    nativeAudio: true,
    multiShot: true,
    maxReferenceImages: 1,
    strengths: "Useful for stylized image-to-video clips, audio, and dynamic camera changes.",
  },
  {
    id: "ltx-2-19b",
    label: "LTX-2 19B",
    mode: "video",
    aliases: ["ltx", "ltx 2", "ltx 19b", "ltx-2"],
    imageToVideoModelId: "fal-ai/ltx-2-19b/image-to-video",
    durationConstraint: ltxTwoFrameCount,
    aspectRatios: ["1:1", "9:16", "16:9"],
    nativeAudio: true,
    maxReferenceImages: 1,
    strengths: "Frame-count based image-to-video route for longer audio-video experiments.",
  },
  {
    id: "xai-tts",
    label: "xAI TTS v1",
    mode: "audio",
    aliases: ["xai tts", "tts", "voiceover"],
    falModelId: "fal-ai/xai/tts/v1",
    strengths: "Default text-to-speech route for quick narration and spoken audio.",
    isDefault: true,
  },
  {
    id: "seed-speech-v2",
    label: "Seed Speech TTS v2",
    mode: "audio",
    aliases: ["seed speech", "seed tts", "bytedance tts"],
    falModelId: "fal-ai/bytedance/seed-speech/tts/v2",
    strengths: "Alternative fal TTS route for generated speech and voice references.",
  },
  {
    id: "elevenlabs-turbo",
    label: "ElevenLabs Turbo 2.5",
    mode: "audio",
    aliases: ["elevenlabs", "eleven labs", "turbo voice"],
    falModelId: "fal-ai/elevenlabs/tts/turbo-v2.5",
    strengths: "Premium practical TTS option for natural narration.",
  },
  {
    id: "seedance-2-lipsync",
    label: "Seedance 2.0 Lip Sync",
    mode: "lipsync",
    aliases: ["seedance lipsync", "lipsync", "lip sync"],
    falModelId: "fal-ai/seedance-2.0/reference-to-video",
    strengths: "Default reference-to-video route for combining a visual source with speech audio.",
    isDefault: true,
  },
  {
    id: "seedance-2-fast-lipsync",
    label: "Seedance 2.0 Fast Lip Sync",
    mode: "lipsync",
    aliases: ["fast lipsync", "fast lip sync", "seedance fast"],
    falModelId: "fal-ai/seedance-2.0/fast/reference-to-video",
    strengths: "Faster reference-to-video route when speed matters.",
  },
];

function normalizeMatchText(value: string) {
  return value.trim().toLowerCase();
}

export function rosterModelsForMode(mode: RosterModelMode): RosterModel[] {
  return ROSTER_MODELS.filter((model) => model.mode === mode);
}

export function rosterModelById(id: string | undefined): RosterModel | undefined {
  if (!id) return undefined;
  const normalized = normalizeMatchText(id);
  return ROSTER_MODELS.find((model) => model.id === normalized);
}

export function rosterModelIds(model: RosterModel): string[] {
  return [
    model.falModelId,
    model.textToVideoModelId,
    model.imageToVideoModelId,
    model.referenceToVideoModelId,
  ].filter((value): value is string => Boolean(value));
}

export function rosterModelByProviderModelId(modelId: string | undefined): RosterModel | undefined {
  if (!modelId) return undefined;
  const normalized = normalizeMatchText(modelId);
  return ROSTER_MODELS.find((model) =>
    rosterModelIds(model).some((candidate) => normalizeMatchText(candidate) === normalized)
  );
}

export function resolveRosterModelAlias(text: string | undefined): RosterModel | undefined {
  if (!text?.trim()) return undefined;
  const normalized = normalizeMatchText(text);
  const exactMatch = ROSTER_MODELS.find((model) =>
    model.id === normalized ||
    normalizeMatchText(model.label) === normalized ||
    model.aliases.some((alias) => normalizeMatchText(alias) === normalized) ||
    rosterModelIds(model).some((modelId) => normalizeMatchText(modelId) === normalized)
  );
  if (exactMatch) return exactMatch;

  // Provider-style model ids must match exactly: fuzzy-matching them can remap a
  // legitimate id to a different roster model (e.g. "fal-ai/veo3.1" contains the
  // Kling O3 alias "o3"). Unknown provider ids pass through to the provider as-is.
  if (normalized.includes("/")) return undefined;

  return ROSTER_MODELS.find((model) =>
    normalizeMatchText(model.label).includes(normalized) ||
    normalized.includes(normalizeMatchText(model.label)) ||
    model.aliases.some((alias) => {
      const normalizedAlias = normalizeMatchText(alias);
      return normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized);
    })
  );
}

export function defaultRosterModelForMode(mode: RosterModelMode): RosterModel | undefined {
  return rosterModelsForMode(mode).find((model) => model.isDefault);
}

export function rosterVideoDurationConstraintForModelId(
  modelId: string | undefined
): VideoDurationConstraint | undefined {
  return rosterModelByProviderModelId(modelId)?.durationConstraint;
}

export function videoVariantForReferenceCount(referenceImageCount: number): RosterVideoVariant {
  return referenceImageCount > 1 ? "reference" : referenceImageCount > 0 ? "image" : "text";
}

export function falModelIdForRosterModel(
  model: RosterModel,
  options: { referenceImageCount?: number; videoVariant?: RosterVideoVariant } = {}
): string | undefined {
  if (model.mode !== "video") return model.falModelId;

  const variant = options.videoVariant ??
    videoVariantForReferenceCount(options.referenceImageCount ?? 0);
  if (variant === "reference") {
    return model.referenceToVideoModelId ?? model.imageToVideoModelId ?? model.textToVideoModelId;
  }
  if (variant === "image") {
    return model.imageToVideoModelId ?? model.referenceToVideoModelId ?? model.textToVideoModelId;
  }
  return model.textToVideoModelId ?? model.imageToVideoModelId ?? model.referenceToVideoModelId;
}

function allowedDurationLabel(constraint: VideoDurationConstraint | undefined) {
  if (!constraint) return undefined;
  if (constraint.kind === "enum") return constraint.values.join(", ");
  if (constraint.kind === "integerRange") return `${constraint.min}-${constraint.max}`;
  return `${constraint.defaultValue}s target (${constraint.fps} fps frame count)`;
}

export function modelCardsForPlanner() {
  return ROSTER_MODELS.map((model) => ({
    id: model.id,
    label: model.label,
    mode: model.mode,
    falModelId: model.falModelId,
    textToVideoModelId: model.textToVideoModelId,
    imageToVideoModelId: model.imageToVideoModelId,
    referenceToVideoModelId: model.referenceToVideoModelId,
    allowedDurations: allowedDurationLabel(model.durationConstraint),
    aspectRatios: model.aspectRatios,
    nativeAudio: model.nativeAudio === true,
    multiShot: model.multiShot === true,
    maxReferenceImages: model.maxReferenceImages,
    approxCostPerSecondUsd: model.approxCostPerSecondUsd,
    strengths: model.strengths,
    default: model.isDefault === true,
  }));
}
