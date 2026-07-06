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
import {
  rosterModelByProviderModelId,
  rosterOptionsForModel,
  type RosterModel,
} from "../../../src/lib/generation/modelRoster";

export const DEFAULT_FAL_IMAGE_MODEL = "fal-ai/nano-banana-2";
export const DEFAULT_FAL_VIDEO_MODEL = "fal-ai/ltx-video";
export const DEFAULT_FAL_AUDIO_MODEL = "fal-ai/xai/tts/v1";
export const DEFAULT_FAL_LIPSYNC_MODEL = "fal-ai/seedance-2.0/reference-to-video";

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

function isFalEditableImageModel(model: string): boolean {
  return model === "openai/gpt-image-2" ||
    model === "openai/gpt-image-2/image-to-image" ||
    model === "fal-ai/gpt-image-2" ||
    model === "fal-ai/gpt-image-2/image-to-image" ||
    model === "fal-ai/gemini-3-pro-image-preview" ||
    model === "fal-ai/gemini-3-pro-image-preview/edit" ||
    model === "fal-ai/gemini-3.1-flash-image-preview" ||
    model === "fal-ai/gemini-3.1-flash-image-preview/edit" ||
    model === "fal-ai/nano-banana-pro" ||
    model === "fal-ai/nano-banana-pro/edit" ||
    model === "fal-ai/nano-banana-2" ||
    model === "fal-ai/nano-banana-2/edit";
}

function isFalGptImage2Model(model: string): boolean {
  return model === "openai/gpt-image-2" ||
    model === "openai/gpt-image-2/image-to-image" ||
    model === "fal-ai/gpt-image-2" ||
    model === "fal-ai/gpt-image-2/image-to-image";
}

export function falImageModelForInput(model: string, input: GenerateImageInput): string {
  if (!input.referenceImages?.length) return model;
  if (!isFalEditableImageModel(model) || model.endsWith("/edit") || model.endsWith("/image-to-image")) {
    return model;
  }
  if (model === "openai/gpt-image-2" || model === "fal-ai/gpt-image-2") {
    return "openai/gpt-image-2/image-to-image";
  }
  return `${model}/edit`;
}

function gptImage2SizeForAspectRatio(aspectRatio: string | undefined) {
  if (aspectRatio === "9:16") return "portrait_16_9";
  if (aspectRatio === "4:5") return "portrait_4_3";
  if (aspectRatio === "16:9") return "landscape_16_9";
  return "square_hd";
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

function rosterModelForFalPayload(model: string): RosterModel | undefined {
  const candidates = [
    model,
    model.replace(/\/edit$/, ""),
    model.replace(/\/image-to-image$/, ""),
    model.replace(/^fal-ai\/gpt-image-2/, "openai/gpt-image-2"),
  ];
  for (const candidate of candidates) {
    const rosterModel = rosterModelByProviderModelId(candidate);
    if (rosterModel) return rosterModel;
  }
  return undefined;
}

function typedRosterOptionPayload(
  model: string,
  options: Record<string, string | boolean> | undefined
): Record<string, unknown> {
  const rosterModel = rosterModelForFalPayload(model);
  if (!rosterModel) return {};
  const rosterOptions = rosterOptionsForModel(rosterModel);
  const payload: Record<string, unknown> = {};
  for (const [key, option] of Object.entries(rosterOptions)) {
    const value = options?.[key] ?? option.default;
    addIfDefined(payload, option.payloadKey, value);
  }
  return payload;
}

function falNativeAudioPayload(
  model: string,
  input: GenerateVideoInput
): Record<string, unknown> {
  if (input.nativeAudio !== true) return {};
  if (model.includes("sora-2")) return {};
  if (model.includes("pixverse/v6")) return { generate_audio_switch: true };
  if (
    model.includes("kling-video/v3") ||
    model.includes("kling-video/o3") ||
    model.includes("seedance-2.0") ||
    model.includes("veo3.1")
  ) {
    return { generate_audio: true };
  }
  return {};
}

export function falImagePayload(
  model: string,
  input: GenerateImageInput
): Record<string, unknown> {
  const argumentOverrides = providerArgumentOverrides(input.metadata);
  const referenceImageUrls = falReferenceImageUrls(input);

  if (isFalGptImage2Model(model)) {
    return {
      prompt: input.prompt,
      image_size: gptImage2SizeForAspectRatio(input.aspectRatio),
      ...typedRosterOptionPayload(model, input.options),
      num_images: input.count ?? 1,
      output_format: "png",
      ...falImageReferencePayload(input),
      ...argumentOverrides,
    };
  }

  if (isFalEditableImageModel(model)) {
    return {
      prompt: input.prompt,
      num_images: input.count ?? 1,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: "png",
      ...typedRosterOptionPayload(model, input.options),
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
    ...falNativeAudioPayload(model, input),
    ...typedRosterOptionPayload(model, input.options),
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
