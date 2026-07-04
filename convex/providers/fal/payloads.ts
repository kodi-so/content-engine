import type {
  GenerateAudioInput,
  GenerateImageInput,
  GenerateLipsyncInput,
  GenerateVideoInput,
  ReferenceAsset,
} from "../model";
import {
  falVideoFrameCountForDuration,
  normalizeFalVideoDurationForModel,
} from "../../../src/lib/generation/videoDurationConstraints";

export const DEFAULT_FAL_IMAGE_MODEL = "fal-ai/gemini-3.1-flash-image-preview";
export const DEFAULT_FAL_IMAGE_RESOLUTION = "2K";
export const DEFAULT_FAL_VIDEO_MODEL = "fal-ai/ltx-video";
export const DEFAULT_FAL_AUDIO_MODEL = "fal-ai/xai/tts/v1";
export const DEFAULT_FAL_LIPSYNC_MODEL = "fal-ai/bytedance/seedance-2.0/reference-to-video";

function aspectRatioToFalImageSize(aspectRatio?: string): string | undefined {
  switch (aspectRatio) {
    case "1:1":
      return "square_hd";
    case "4:5":
      return "portrait_4_3";
    case "9:16":
      return "portrait_16_9";
    default:
      return undefined;
  }
}

function aspectRatioToFalVideoAspectRatio(aspectRatio?: string): "16:9" | "9:16" | "1:1" {
  const normalized = aspectRatio?.trim();
  if (normalized === "16:9" || normalized === "9:16" || normalized === "1:1") {
    return normalized;
  }
  if (!normalized) return "9:16";

  const match = normalized.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return "9:16";

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "9:16";
  }
  if (width === height) return "1:1";
  return width > height ? "16:9" : "9:16";
}

function falVideoAspectRatioPayload(
  model: string,
  input: GenerateVideoInput
): Record<string, unknown> {
  if (model.includes("image-to-video") && input.referenceImages?.length) {
    return {};
  }
  return {
    aspect_ratio: aspectRatioToFalVideoAspectRatio(input.aspectRatio),
  };
}

function isFalGeminiImageModel(model: string): boolean {
  return model === "fal-ai/gemini-3-pro-image-preview" ||
    model === "fal-ai/gemini-3-pro-image-preview/edit" ||
    model === "fal-ai/gemini-3.1-flash-image-preview" ||
    model === "fal-ai/gemini-3.1-flash-image-preview/edit" ||
    model === "fal-ai/nano-banana-pro" ||
    model === "fal-ai/nano-banana-pro/edit" ||
    model === "fal-ai/nano-banana-2" ||
    model === "fal-ai/nano-banana-2/edit";
}

export function falImageModelForInput(model: string, input: GenerateImageInput): string {
  if (!input.referenceImages?.length) return model;
  if (!isFalGeminiImageModel(model) || model.endsWith("/edit")) return model;
  return `${model}/edit`;
}

function providerArgumentOverrides(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  return metadata?.arguments &&
    typeof metadata.arguments === "object" &&
    !Array.isArray(metadata.arguments)
    ? metadata.arguments as Record<string, unknown>
    : {};
}

function falReferenceAssetUrl(asset: ReferenceAsset | undefined): string | undefined {
  if (!asset) return undefined;
  if (asset.url) return asset.url;
  if (asset.base64Data) return `data:${asset.mimeType};base64,${asset.base64Data}`;
  return undefined;
}

function falReferenceAssetUrls(
  assets: ReferenceAsset[] | undefined
): string[] | undefined {
  if (!assets?.length) return undefined;
  const urls = assets.flatMap((asset) => {
    const url = falReferenceAssetUrl(asset);
    return url ? [url] : [];
  });
  return urls.length ? urls : undefined;
}

function falReferenceImageUrls(input: GenerateImageInput): string[] | undefined {
  return falReferenceAssetUrls(input.referenceImages);
}

function addFirstUrlAlias(
  payload: Record<string, unknown>,
  key: string,
  url: string | undefined
): void {
  if (url && payload[key] === undefined) payload[key] = url;
}

function addUrlListAlias(
  payload: Record<string, unknown>,
  key: string,
  urls: string[] | undefined
): void {
  if (urls?.length && payload[key] === undefined) payload[key] = urls;
}

function falImageReferencePayload(input: GenerateImageInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const imageUrls = falReferenceImageUrls(input);
  const firstImageUrl = imageUrls?.[0];

  addFirstUrlAlias(payload, "image_url", firstImageUrl);
  addFirstUrlAlias(payload, "reference_image_url", firstImageUrl);
  addUrlListAlias(payload, "image_urls", imageUrls);
  addUrlListAlias(payload, "reference_image_urls", imageUrls);

  return payload;
}

function falVideoReferenceImageUrls(input: GenerateVideoInput): string[] | undefined {
  return falReferenceAssetUrls(input.referenceImages);
}

function falVideoReferencePayload(
  model: string,
  input: GenerateVideoInput
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const imageUrls = falVideoReferenceImageUrls(input);
  const firstImageUrl = imageUrls?.[0];

  if (!firstImageUrl) return payload;

  if (model.includes("image-to-video")) {
    addFirstUrlAlias(payload, "start_image_url", firstImageUrl);
    addFirstUrlAlias(payload, "image_url", firstImageUrl);
    addFirstUrlAlias(payload, "first_frame_url", firstImageUrl);
  } else if (model.includes("reference-to-video")) {
    addFirstUrlAlias(payload, "reference_image_url", firstImageUrl);
    addFirstUrlAlias(payload, "image_url", firstImageUrl);
    addFirstUrlAlias(payload, "start_image_url", firstImageUrl);
  } else {
    addFirstUrlAlias(payload, "image_url", firstImageUrl);
  }

  addUrlListAlias(payload, "image_urls", imageUrls);
  addUrlListAlias(payload, "reference_image_urls", imageUrls);

  return payload;
}

function addIfDefined(
  payload: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (value !== undefined && value !== null && value !== "") {
    payload[key] = value;
  }
}

export function falImagePayload(
  model: string,
  input: GenerateImageInput
): Record<string, unknown> {
  const argumentOverrides = providerArgumentOverrides(input.metadata);
  const referenceImageUrls = falReferenceImageUrls(input);

  if (isFalGeminiImageModel(model)) {
    return {
      prompt: input.prompt,
      num_images: input.count ?? 1,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: "png",
      resolution:
        process.env.CONTENT_ENGINE_IMAGE_RESOLUTION?.trim() ||
        DEFAULT_FAL_IMAGE_RESOLUTION,
      safety_tolerance: "4",
      limit_generations: true,
      ...(referenceImageUrls ? { image_urls: referenceImageUrls } : {}),
      ...argumentOverrides,
    };
  }

  return {
    prompt: input.prompt,
    num_images: input.count ?? 1,
    image_size: aspectRatioToFalImageSize(input.aspectRatio),
    ...falImageReferencePayload(input),
    ...argumentOverrides,
  };
}

export function falVideoPayload(
  model: string,
  input: GenerateVideoInput
): Record<string, unknown> {
  const argumentOverrides = providerArgumentOverrides(input.metadata);
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    ...falVideoAspectRatioPayload(model, input),
    ...falVideoReferencePayload(model, input),
    ...argumentOverrides,
  };
  addIfDefined(
    payload,
    "duration",
    normalizeFalVideoDurationForModel(model, payload.duration ?? input.durationSeconds)
  );
  addIfDefined(
    payload,
    "num_frames",
    payload.num_frames ?? falVideoFrameCountForDuration(model, input.durationSeconds)
  );
  return payload;
}

export function falAudioPayload(input: GenerateAudioInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    text: input.text,
  };
  const audioUrls = falReferenceAssetUrls(input.voiceReferenceAudios);

  addIfDefined(payload, "mode", input.mode);
  if (audioUrls?.[0]) addIfDefined(payload, "audio_url", audioUrls[0]);
  if (audioUrls?.[0]) addIfDefined(payload, "voice_url", audioUrls[0]);
  if (audioUrls?.[0]) addIfDefined(payload, "voice_audio_url", audioUrls[0]);
  if (audioUrls?.[0]) addIfDefined(payload, "reference_audio_url", audioUrls[0]);
  addUrlListAlias(payload, "audio_urls", audioUrls);
  addUrlListAlias(payload, "voice_urls", audioUrls);
  addUrlListAlias(payload, "reference_audio_urls", audioUrls);

  return {
    ...payload,
    ...providerArgumentOverrides(input.metadata),
  };
}

export function falLipsyncPayload(input: GenerateLipsyncInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const audioUrl = falReferenceAssetUrl(input.audio);
  const imageUrl = falReferenceAssetUrl(input.image);
  const videoUrl = falReferenceAssetUrl(input.video);

  addIfDefined(payload, "audio_url", audioUrl);
  addIfDefined(payload, "source_audio_url", audioUrl);
  addIfDefined(payload, "image_url", imageUrl);
  addIfDefined(payload, "source_image_url", imageUrl);
  addIfDefined(payload, "video_url", videoUrl);
  addIfDefined(payload, "source_video_url", videoUrl);
  addIfDefined(payload, "resolution", input.resolution);

  return {
    ...payload,
    ...providerArgumentOverrides(input.metadata),
  };
}
