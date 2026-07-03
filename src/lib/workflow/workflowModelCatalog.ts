import type { WorkflowNodeType } from "./workflowGraph";

export type ProviderModelCategory =
  | "unknown"
  | "chat"
  | "image"
  | "video"
  | "audio"
  | "lipsync"
  | "video_render";
export type ProviderModelDoc = {
  capabilities?: unknown;
  category: ProviderModelCategory;
  description?: string;
  displayName: string;
  metadata?: unknown;
  modelId: string;
  schemaSnapshot?: {
    inputSchema?: unknown;
    raw?: unknown;
  };
};
export type ModelRecommendation = { rank: number; tag: string; note: string };

export type ImageModelUiContract = {
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
};

const recommendedImageModels: Record<string, ModelRecommendation> = {
  "fal-ai/nano-banana-2": {
    rank: 2,
    tag: "Fast default",
    note: "Recommended fal default for fast, reference-aware image generation.",
  },
  "fal-ai/nano-banana-pro": {
    rank: 1,
    tag: "Recommended",
    note: "Higher quality fal option for polished image generation and editing.",
  },
  "fal-ai/gemini-3.1-flash-image-preview": {
    rank: 3,
    tag: "Fast",
    note: "Fast Gemini image route through fal.",
  },
  "gemini-3-pro-image-preview": {
    rank: 1,
    tag: "Direct Gemini",
    note: "Direct Google Gemini image generation.",
  },
  "nano-banana-pro": {
    rank: 10,
    tag: "Recommended",
    note: "Recommended default for high-quality image generation and reference-aware editing.",
  },
  "nano-banana-2": {
    rank: 11,
    tag: "Fast default",
    note: "Good everyday default for fast image generation.",
  },
  "gpt-image-2": {
    rank: 12,
    tag: "High quality",
    note: "High-quality option for polished image generation.",
  },
};

const recommendedVideoModels: Record<string, ModelRecommendation> = {
  "fal-ai/ltx-video": {
    rank: 1,
    tag: "Recommended",
    note: "Recommended fal default for short prompt-to-video generation.",
  },
  "fal-ai/bytedance/seedance-2.0/reference-to-video": {
    rank: 2,
    tag: "Reference video",
    note: "fal route for generating video from reference media and prompt guidance.",
  },
  "kling-3-0": {
    rank: 10,
    tag: "Recommended",
    note: "Recommended high-quality Kling option for polished video generation.",
  },
  "kling-2-5-turbo": {
    rank: 11,
    tag: "Cheap / fast",
    note: "Cost-conscious option for faster video generation.",
  },
  "seedance-1-5-pro": {
    rank: 3,
    tag: "Cinematic",
    note: "Strong option for cinematic text-to-video and image-to-video work.",
  },
  "runway-aleph": {
    rank: 4,
    tag: "Edit",
    note: "Recommended when the task is transforming or editing existing video.",
  },
};

const recommendedChatModels: Record<string, ModelRecommendation> = {
  "gpt-5-2": {
    rank: 1,
    tag: "Recommended",
    note: "Strong default for text, planning, captions, and structured workflow reasoning.",
  },
  "gemini-3-flash": {
    rank: 2,
    tag: "Fast default",
    note: "Cost-conscious chat model for quick generation and structured text tasks.",
  },
  "claude-sonnet-4-5": {
    rank: 3,
    tag: "High quality",
    note: "High-quality option for writing, analysis, and agent-style tasks.",
  },
};

const recommendedAudioModels: Record<string, ModelRecommendation> = {
  "fal-ai/xai/tts/v1": {
    rank: 1,
    tag: "fal default",
    note: "fal text-to-speech route for narration and spoken audio generation.",
  },
  "fal-ai/bytedance/seed-speech/tts/v2": {
    rank: 2,
    tag: "fal TTS",
    note: "fal text-to-speech route for generated voice audio.",
  },
  "elevenlabs-turbo-2-5": {
    rank: 10,
    tag: "Recommended",
    note: "Fast, practical default for text-to-speech generation.",
  },
  "chatterbox-tts": {
    rank: 11,
    tag: "Voice clone",
    note: "Useful when the task needs voice-cloned speech from a reference audio.",
  },
  "elevenlabs-sfx-v2": {
    rank: 12,
    tag: "Sound effects",
    note: "Use for generating sound effects from text descriptions.",
  },
};

const recommendedLipsyncModels: Record<string, ModelRecommendation> = {
  "fal-ai/bytedance/seedance-2.0/reference-to-video": {
    rank: 1,
    tag: "fal default",
    note: "fal reference-to-video route for audio plus image/video-driven talking clips.",
  },
  "fal-ai/bytedance/seedance-2.0/fast/reference-to-video": {
    rank: 2,
    tag: "Fast fal",
    note: "Faster fal reference-to-video route for lip-sync style workflows.",
  },
  "omnihuman-1-5": {
    rank: 10,
    tag: "Recommended",
    note: "Higher quality lip-sync option for audio-driven human video.",
  },
  "fabric-1-0": {
    rank: 11,
    tag: "Fast default",
    note: "Practical lip-sync option when speed and cost matter.",
  },
};

const recommendedVideoRenderModels: Record<string, ModelRecommendation> = {
  "music-edit-render-auto": {
    rank: 1,
    tag: "Recommended",
    note: "Agent-assisted render option for music-edit style video assembly.",
  },
  "music-edit-render": {
    rank: 2,
    tag: "Advanced",
    note: "Detailed render model for explicit asset/template control.",
  },
};

const modelDisplayNameOverrides: Record<string, string> = {
  "chatterbox-tts": "Chatterbox TTS",
  "claude-sonnet-4-5": "Claude Sonnet 4.5",
  "elevenlabs-sfx-v2": "ElevenLabs Sound Effect V2",
  "elevenlabs-turbo-2-5": "ElevenLabs Turbo 2.5",
  "fabric-1-0": "VEED Fabric 1.0",
  "fal-ai/bytedance/seed-speech/tts/v2": "Seed Speech TTS v2",
  "fal-ai/bytedance/seedance-2.0/fast/reference-to-video": "Seedance 2.0 Fast Reference to Video",
  "fal-ai/bytedance/seedance-2.0/reference-to-video": "Seedance 2.0 Reference to Video",
  "fal-ai/gemini-3-pro-image-preview": "Gemini 3 Pro Image",
  "fal-ai/gemini-3.1-flash-image-preview": "Gemini 3.1 Flash Image",
  "fal-ai/ltx-video": "LTX Video",
  "fal-ai/nano-banana-2": "Nano Banana 2",
  "fal-ai/nano-banana-pro": "Nano Banana Pro",
  "fal-ai/xai/tts/v1": "xAI TTS v1",
  "flux-2-pro": "Flux-2 Pro",
  "gemini-3-pro-image-preview": "Gemini 3 Pro Image",
  "gemini-3-flash": "Gemini 3 Flash",
  "gpt-5-2": "GPT-5.2",
  "gpt-image-1": "GPT Image 1",
  "gpt-image-1.5": "GPT Image 1.5",
  "gpt-image-2": "GPT Image 2",
  "gpt-image-2-edit": "GPT Image 2 Edit",
  "kling-2-5-turbo": "Kling 2.5 Turbo Pro",
  "kling-3-0": "Kling 3.0",
  "music-edit-render": "Music Edit Render",
  "music-edit-render-auto": "Music Edit Render Auto",
  "nano-banana-2": "Nano Banana 2",
  "nano-banana-edit": "Nano Banana Edit",
  "nano-banana-pro": "Nano Banana Pro",
  "omnihuman-1-5": "OmniHuman v1.5",
  "seedance-1-5-pro": "Seedance 1.5 Pro",
  "seedream-4.5": "Seedream 4.5",
};

const defaultImageModelUiContract: ImageModelUiContract = {
  prompt: {
    visible: true,
    required: true,
    canComeFromInput: true,
    canBeConfiguredLocally: true,
  },
  images: {
    visible: true,
    required: false,
    canComeFromInput: true,
    canBeUploadedLocally: true,
    multiple: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function modelCategoryForNodeType(
  type: WorkflowNodeType
): ProviderModelCategory | undefined {
  switch (type) {
    case "llm":
    case "ai_agent":
    case "native_slideshow_planner":
      return "chat";
    case "image_generation":
      return "image";
    case "video_generation":
      return "video";
    case "audio_generation":
      return "audio";
    case "lipsync":
      return "lipsync";
    case "ai_video_editor":
      return "video_render";
    default:
      return undefined;
  }
}

export function recommendationMapForNodeType(
  type: WorkflowNodeType
): Record<string, ModelRecommendation> | null {
  switch (type) {
    case "llm":
    case "ai_agent":
    case "native_slideshow_planner":
      return recommendedChatModels;
    case "image_generation":
      return recommendedImageModels;
    case "video_generation":
      return recommendedVideoModels;
    case "audio_generation":
      return recommendedAudioModels;
    case "lipsync":
      return recommendedLipsyncModels;
    case "ai_video_editor":
      return recommendedVideoRenderModels;
    default:
      return null;
  }
}

function familyRecommendationForNodeType(
  type: WorkflowNodeType,
  modelId: string
): ModelRecommendation | undefined {
  if (type !== "image_generation") return undefined;

  const id = modelId.toLowerCase();
  if (id.includes("nano-banana-pro")) {
    return {
      rank: 1,
      tag: "Recommended",
      note: "Recommended Nano Banana route for polished reference-aware image generation and editing.",
    };
  }
  if (id.includes("nano-banana-2")) {
    return {
      rank: 2,
      tag: "Fast default",
      note: "Fast Nano Banana route for everyday image generation and reference-aware edits.",
    };
  }
  if (id.includes("nano-banana")) {
    return {
      rank: 3,
      tag: "Nano Banana",
      note: "Commonly used Nano Banana image model route.",
    };
  }

  return undefined;
}

export function recommendationForNodeType(
  type: WorkflowNodeType,
  modelId: string
): ModelRecommendation | undefined {
  return recommendationMapForNodeType(type)?.[modelId] ??
    familyRecommendationForNodeType(type, modelId);
}

export function recommendedModelIdForNodeType(type: WorkflowNodeType): string | undefined {
  const recommendations = recommendationMapForNodeType(type);

  if (!recommendations) return undefined;

  return Object.entries(recommendations).sort(([, a], [, b]) => a.rank - b.rank)[0]?.[0];
}

export function formatModelDisplayName(modelId: string): string {
  const override = modelDisplayNameOverrides[modelId];
  if (override) return override;

  return modelId
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^gpt$/i.test(part)) return "GPT";
      if (/^ai$/i.test(part)) return "AI";
      if (/^\d+(?:\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function imageModelUiContractFromModel(
  model: ProviderModelDoc | null | undefined
): ImageModelUiContract {
  const metadata = isRecord(model?.metadata) ? model.metadata : {};
  const uiContract = isRecord(metadata.uiContract) ? metadata.uiContract : {};
  const prompt = isRecord(uiContract.prompt) ? uiContract.prompt : {};
  const images = isRecord(uiContract.images) ? uiContract.images : {};
  const maxCount = typeof images.maxCount === "number" && Number.isFinite(images.maxCount)
    ? images.maxCount
    : undefined;

  return {
    prompt: {
      visible: typeof prompt.visible === "boolean"
        ? prompt.visible
        : defaultImageModelUiContract.prompt.visible,
      required: typeof prompt.required === "boolean"
        ? prompt.required
        : defaultImageModelUiContract.prompt.required,
      canComeFromInput: typeof prompt.canComeFromInput === "boolean"
        ? prompt.canComeFromInput
        : defaultImageModelUiContract.prompt.canComeFromInput,
      canBeConfiguredLocally: typeof prompt.canBeConfiguredLocally === "boolean"
        ? prompt.canBeConfiguredLocally
        : defaultImageModelUiContract.prompt.canBeConfiguredLocally,
    },
    images: {
      visible: typeof images.visible === "boolean"
        ? images.visible
        : defaultImageModelUiContract.images.visible,
      required: typeof images.required === "boolean"
        ? images.required
        : defaultImageModelUiContract.images.required,
      canComeFromInput: typeof images.canComeFromInput === "boolean"
        ? images.canComeFromInput
        : defaultImageModelUiContract.images.canComeFromInput,
      canBeUploadedLocally: typeof images.canBeUploadedLocally === "boolean"
        ? images.canBeUploadedLocally
        : defaultImageModelUiContract.images.canBeUploadedLocally,
      multiple: typeof images.multiple === "boolean"
        ? images.multiple
        : defaultImageModelUiContract.images.multiple,
      ...(maxCount ? { maxCount } : {}),
    },
  };
}

export function providerModelSourceLabel(
  model: ProviderModelDoc | null | undefined
): string | undefined {
  const schemaSnapshot = model?.schemaSnapshot;
  const raw = isRecord(schemaSnapshot?.raw) ? schemaSnapshot.raw : {};
  const provider = raw.provider;
  return typeof provider === "string" && provider.trim() ? provider.trim() : undefined;
}

function modelInputSchema(model: ProviderModelDoc | null | undefined): Record<string, unknown> {
  const schemaSnapshot = isRecord(model?.schemaSnapshot) ? model.schemaSnapshot : {};
  return isRecord(schemaSnapshot.inputSchema) ? schemaSnapshot.inputSchema : {};
}

function modelSchemaFieldRequired(schema: Record<string, unknown>, key: string): boolean {
  const field = schema[key];
  return isRecord(field) && field.required === true;
}

export function providerModelCapabilityTags(
  model: ProviderModelDoc | null | undefined,
  nodeType?: WorkflowNodeType
): string[] {
  if (!model) return [];

  const metadata = isRecord(model.metadata) ? model.metadata : {};
  const providerCapabilities = Array.isArray(metadata.providerCapabilities)
    ? metadata.providerCapabilities.filter((tag): tag is string => typeof tag === "string")
    : [];

  let requirementTags: string[] = [];
  if (nodeType === "image_generation") {
    const contract = imageModelUiContractFromModel(model);
    requirementTags = [
      contract.prompt.visible
        ? contract.prompt.required
          ? "Prompt required"
          : "Prompt optional"
        : "No prompt",
      contract.images.visible
        ? contract.images.required
          ? "Image required"
          : "Images optional"
        : undefined,
      contract.images.visible && contract.images.multiple
        ? contract.images.maxCount
          ? `Up to ${contract.images.maxCount} images`
          : "Multi-image"
        : contract.images.visible
          ? "Single image"
          : undefined,
    ].filter((tag): tag is string => Boolean(tag));
  }

  if (nodeType === "video_generation") {
    const schema = modelInputSchema(model);
    const hasImageInput = [
      "image",
      "image_url",
      "image_urls",
      "start_frame",
      "start_frame_url",
      "end_frame",
      "end_frame_url",
      "reference_image",
      "reference_image_url",
    ].some((key) => schema[key] !== undefined);
    const imageRequired = [
      "image",
      "image_url",
      "image_urls",
      "start_frame",
      "start_frame_url",
    ].some((key) => modelSchemaFieldRequired(schema, key));

    requirementTags = [
      modelSchemaFieldRequired(schema, "prompt") ? "Prompt required" : "Prompt optional",
      hasImageInput ? imageRequired ? "Image required" : "Image optional" : undefined,
    ].filter((tag): tag is string => Boolean(tag));
  }

  return [...new Set([...providerCapabilities, ...requirementTags])];
}
