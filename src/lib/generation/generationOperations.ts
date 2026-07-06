import type { CreateNodeType } from "../create/createModes";
import type { GenerationProviderName } from "../providers/providerNames";

export type GenerationModelLike = {
  capabilities?: unknown;
  modelId: string;
};

export type GenerationNodeType =
  | CreateNodeType
  | "ai_video_editor"
  | "lipsync";

export type GenerationOperationId =
  | "image_text_to_image"
  | "image_edit"
  | "image_multi_edit"
  | "video_text_to_video"
  | "video_image_to_video"
  | "video_reference_to_video"
  | "video_start_end_frame"
  | "audio_text_to_speech"
  | "audio_voice_clone"
  | "audio_sound_effect"
  | "audio_music"
  | "lipsync_audio_to_video"
  | "video_render_assembly";

export type GenerationOperation = {
  id: GenerationOperationId;
  label: string;
  description: string;
  nodeTypes: GenerationNodeType[];
  recommendedModelIds?: string[];
};

const operations: GenerationOperation[] = [
  {
    id: "image_text_to_image",
    label: "Text to Image",
    description: "Create an image from a prompt.",
    nodeTypes: ["image_generation"],
    recommendedModelIds: [
      "fal-ai/nano-banana-pro",
      "fal-ai/nano-banana-2",
      "fal-ai/gemini-3.1-flash-image-preview",
      "nano-banana-pro",
      "nano-banana-2",
    ],
  },
  {
    id: "image_edit",
    label: "Edit Image",
    description: "Edit one source image with prompt guidance.",
    nodeTypes: ["image_generation"],
    recommendedModelIds: [
      "fal-ai/nano-banana-pro",
      "fal-ai/nano-banana-2",
      "fal-ai/gemini-3.1-flash-image-preview",
      "nano-banana-pro",
      "nano-banana-edit",
    ],
  },
  {
    id: "image_multi_edit",
    label: "Edit Multi Images",
    description: "Blend or transform multiple reference images.",
    nodeTypes: ["image_generation"],
    recommendedModelIds: [
      "fal-ai/nano-banana-pro",
      "fal-ai/nano-banana-2",
      "fal-ai/gemini-3.1-flash-image-preview",
      "nano-banana-pro",
    ],
  },
  {
    id: "video_text_to_video",
    label: "Text to Video",
    description: "Create a video from a prompt.",
    nodeTypes: ["video_generation"],
    recommendedModelIds: [
      "fal-ai/kling-video/v3/pro/text-to-video",
      "fal-ai/kling-video/v3/standard/text-to-video",
      "fal-ai/sora-2/text-to-video",
      "fal-ai/bytedance/seedance/v1/pro/text-to-video",
      "kling-3-0",
      "kling-2-5-turbo",
    ],
  },
  {
    id: "video_image_to_video",
    label: "Image to Video",
    description: "Animate a still image into a short clip.",
    nodeTypes: ["video_generation"],
    recommendedModelIds: [
      "fal-ai/kling-video/v3/pro/image-to-video",
      "fal-ai/kling-video/v3/standard/image-to-video",
      "fal-ai/ltx-2-19b/image-to-video",
      "fal-ai/bytedance/seedance/v1/pro/image-to-video",
      "fal-ai/pixverse/v6/image-to-video",
      "fal-ai/sora-2/image-to-video",
    ],
  },
  {
    id: "video_reference_to_video",
    label: "Reference to Video",
    description: "Generate video from one or more visual references.",
    nodeTypes: ["video_generation"],
    recommendedModelIds: [
      "fal-ai/kling-video/o3/pro/reference-to-video",
      "fal-ai/bytedance/seedance-2.0/reference-to-video",
      "fal-ai/xai/grok-imagine-video/reference-to-video",
    ],
  },
  {
    id: "video_start_end_frame",
    label: "Start/End Frame",
    description: "Create motion between a start image and an end image.",
    nodeTypes: ["video_generation"],
    recommendedModelIds: [
      "fal-ai/kling-video/o3/pro/image-to-video",
      "fal-ai/kling-video/v3/pro/image-to-video",
      "kling-3-0",
    ],
  },
  {
    id: "audio_text_to_speech",
    label: "Text to Speech",
    description: "Turn text into spoken narration.",
    nodeTypes: ["audio_generation"],
    recommendedModelIds: [
      "fal-ai/xai/tts/v1",
      "fal-ai/bytedance/seed-speech/tts/v2",
      "elevenlabs-turbo-2-5",
    ],
  },
  {
    id: "audio_voice_clone",
    label: "Voice Reference",
    description: "Generate speech using a reference voice sample.",
    nodeTypes: ["audio_generation"],
    recommendedModelIds: [
      "fal-ai/bytedance/seed-speech/tts/v2",
      "chatterbox-tts",
      "elevenlabs-turbo-2-5",
    ],
  },
  {
    id: "audio_sound_effect",
    label: "Sound Effect",
    description: "Generate short sound effects from text.",
    nodeTypes: ["audio_generation"],
    recommendedModelIds: ["elevenlabs-sfx-v2"],
  },
  {
    id: "audio_music",
    label: "Music",
    description: "Generate music or song audio from a prompt.",
    nodeTypes: ["audio_generation"],
  },
  {
    id: "lipsync_audio_to_video",
    label: "Lip Sync",
    description: "Combine a source image or video with spoken audio.",
    nodeTypes: ["lipsync"],
    recommendedModelIds: [
      "fal-ai/bytedance/seedance-2.0/reference-to-video",
      "fal-ai/bytedance/seedance-2.0/fast/reference-to-video",
      "omnihuman-1-5",
    ],
  },
  {
    id: "video_render_assembly",
    label: "Video Assembly",
    description: "Assemble media, overlays, and audio into a final render.",
    nodeTypes: ["ai_video_editor"],
    recommendedModelIds: ["music-edit-render-auto", "music-edit-render"],
  },
];

const operationById = new Map(operations.map((operation) => [operation.id, operation]));

export function generationOperationsForNodeType(
  nodeType?: GenerationNodeType
): GenerationOperation[] {
  if (!nodeType) return [];
  return operations.filter((operation) => operation.nodeTypes.includes(nodeType));
}

export function generationOperationById(
  operationId: unknown
): GenerationOperation | undefined {
  return typeof operationId === "string"
    ? operationById.get(operationId as GenerationOperationId)
    : undefined;
}

export function defaultGenerationOperationForNodeType(
  nodeType?: GenerationNodeType
): GenerationOperation | undefined {
  return generationOperationsForNodeType(nodeType)[0];
}

export function generationOperationForConfig(
  nodeType: GenerationNodeType | undefined,
  config: Record<string, unknown> | undefined
): GenerationOperation | undefined {
  const configured = generationOperationById(config?.generationOperation);
  if (configured && nodeType && configured.nodeTypes.includes(nodeType)) return configured;
  return defaultGenerationOperationForNodeType(nodeType);
}

function modelIdIncludes(modelId: string, value: string) {
  return modelId.toLowerCase().includes(value);
}

function baseFalApiRoute(modelId: string) {
  return modelId.endsWith("/api") ? modelId.slice(0, -"/api".length) : modelId;
}

export function canonicalModelOptionId(modelId: string) {
  return baseFalApiRoute(modelId);
}

export function isDuplicateProviderRoute(modelId: string) {
  return modelId.endsWith("/api");
}

export function modelMatchesGenerationOperation(args: {
  model: GenerationModelLike;
  operation?: GenerationOperation;
  providerName?: GenerationProviderName;
}): boolean {
  const operationId = args.operation?.id;
  if (!operationId) return true;

  const modelId = canonicalModelOptionId(args.model.modelId).toLowerCase();

  switch (operationId) {
    case "image_text_to_image":
      return !modelIdIncludes(modelId, "upscale") &&
        !modelIdIncludes(modelId, "background/remove");
    case "image_edit":
    case "image_multi_edit":
      return !modelIdIncludes(modelId, "upscale") &&
        !modelIdIncludes(modelId, "background/remove");
    case "video_text_to_video":
      return modelIdIncludes(modelId, "text-to-video") ||
        (!modelIdIncludes(modelId, "image-to-video") &&
          !modelIdIncludes(modelId, "reference-to-video") &&
          !modelIdIncludes(modelId, "extend-video"));
    case "video_image_to_video":
      return modelIdIncludes(modelId, "image-to-video");
    case "video_reference_to_video":
      return modelIdIncludes(modelId, "reference-to-video");
    case "video_start_end_frame":
      return modelIdIncludes(modelId, "image-to-video") ||
        modelIdIncludes(modelId, "start") ||
        modelIdIncludes(modelId, "frame");
    case "audio_text_to_speech":
      return modelIdIncludes(modelId, "tts") ||
        modelIdIncludes(modelId, "text-to-speech") ||
        modelIdIncludes(modelId, "speech");
    case "audio_voice_clone":
      return modelIdIncludes(modelId, "voice") ||
        modelIdIncludes(modelId, "clone") ||
        modelIdIncludes(modelId, "speech") ||
        modelIdIncludes(modelId, "tts");
    case "audio_sound_effect":
      return modelIdIncludes(modelId, "sfx") ||
        modelIdIncludes(modelId, "sound");
    case "audio_music":
      return modelIdIncludes(modelId, "music") ||
        modelIdIncludes(modelId, "song");
    case "lipsync_audio_to_video":
      return true;
    case "video_render_assembly":
      return true;
  }
}

export function recommendationForGenerationOperation(
  operation: GenerationOperation | undefined,
  modelId: string
) {
  if (!operation?.recommendedModelIds?.length) return undefined;
  const canonicalId = canonicalModelOptionId(modelId);
  const index = operation.recommendedModelIds.indexOf(canonicalId);
  if (index === -1) return undefined;

  return {
    rank: index + 1,
    tag: index === 0 ? "Recommended" : "Good option",
    note: operation.description,
  };
}

export function operationConfigPatch(
  operationId: GenerationOperationId
): Record<string, unknown> {
  switch (operationId) {
    case "image_text_to_image":
      return { generationOperation: operationId };
    case "image_edit":
    case "image_multi_edit":
      return { generationOperation: operationId };
    case "video_text_to_video":
      return { generationOperation: operationId, startEndFrameMode: false };
    case "video_image_to_video":
    case "video_reference_to_video":
      return { generationOperation: operationId, startEndFrameMode: false };
    case "video_start_end_frame":
      return { generationOperation: operationId, startEndFrameMode: true };
    case "audio_text_to_speech":
      return { generationOperation: operationId, mode: "tts" };
    case "audio_voice_clone":
      return { generationOperation: operationId, mode: "voice_clone" };
    case "audio_sound_effect":
      return { generationOperation: operationId, mode: "sfx" };
    case "audio_music":
      return { generationOperation: operationId, mode: "music" };
    case "lipsync_audio_to_video":
    case "video_render_assembly":
      return { generationOperation: operationId };
  }
}
