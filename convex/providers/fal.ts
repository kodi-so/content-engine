import {
  missingProviderConfiguration,
  ProviderError,
  type ProviderErrorCode,
  toProviderError,
  unsupportedProviderOperation,
} from "./errors";
import {
  registerModelProvider,
  type AsyncJobStatus,
  type GenerateAudioInput,
  type GenerateAudioResult,
  type GenerateImageInput,
  type GenerateImageResult,
  type GenerateLipsyncInput,
  type GenerateLipsyncResult,
  type GenerateStructuredInput,
  type GenerateStructuredResult,
  type GenerateTextInput,
  type GenerateTextResult,
  type GenerateVideoInput,
  type GenerateVideoResult,
  type GenerateVideoRenderInput,
  type GenerateVideoRenderResult,
  type GeneratedAsset,
  type GetJobStatusInput,
  type GetJobStatusResult,
  type ModelProvider,
  type ModelProviderName,
  type ReferenceAsset,
} from "./model";

type FalQueueSubmitResponse = {
  request_id: string;
  response_url?: string;
  status_url?: string;
  cancel_url?: string;
  queue_position?: number;
};

type FalQueueStatusResponse = {
  status: string;
  request_id?: string;
  response_url?: string;
  queue_position?: number;
  logs?: Array<{ message?: string; timestamp?: string }>;
  metrics?: Record<string, unknown>;
  error?: string;
  error_type?: string;
};

const FAL_PROVIDER: ModelProviderName = "fal";
const DEFAULT_FAL_QUEUE_BASE_URL = "https://queue.fal.run";
const DEFAULT_FAL_IMAGE_MODEL = "fal-ai/gemini-3.1-flash-image-preview";
const DEFAULT_FAL_IMAGE_RESOLUTION = "2K";
const DEFAULT_FAL_VIDEO_MODEL = "fal-ai/ltx-video";
const DEFAULT_FAL_AUDIO_MODEL = "fal-ai/xai/tts/v1";
const DEFAULT_FAL_LIPSYNC_MODEL = "fal-ai/bytedance/seedance-2.0/reference-to-video";
const FAL_KLING_V3_MIN_DURATION_SECONDS = 3;
const FAL_KLING_V3_MAX_DURATION_SECONDS = 15;

function isFalDryRunEnabled(): boolean {
  const value = process.env.FAL_DRY_RUN?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function getFalQueueBaseUrl(): string {
  return process.env.FAL_QUEUE_BASE_URL?.trim() || DEFAULT_FAL_QUEUE_BASE_URL;
}

function getFalApiKey(): string {
  if (isFalDryRunEnabled()) {
    return "fal-dry-run";
  }

  const apiKey = process.env.FAL_API_KEY?.trim();
  if (!apiKey) {
    throw missingProviderConfiguration("model", FAL_PROVIDER, "FAL_API_KEY");
  }

  return apiKey;
}

function mapFalStatusCode(statusCode: number): ProviderErrorCode {
  if (statusCode === 400) return "validation";
  if (statusCode === 401) return "authentication";
  if (statusCode === 403) return "authorization";
  if (statusCode === 404) return "not_found";
  if (statusCode === 409) return "conflict";
  if (statusCode === 429) return "rate_limit";
  if (statusCode >= 500) return "temporary";
  return "provider";
}

function createFalHttpError(
  operation: string,
  statusCode: number,
  details: string
): ProviderError {
  const summary = details.trim().slice(0, 240);
  return new ProviderError(
    `fal API error during ${operation}: ${statusCode}${summary ? ` ${summary}` : ""}`,
    {
    kind: "model",
    provider: FAL_PROVIDER,
    operation,
    code: mapFalStatusCode(statusCode),
    statusCode,
    retryable: statusCode === 404 || statusCode === 408 || statusCode === 429 || statusCode >= 500,
    details,
    }
  );
}

function createFalResponseDecodeError(
  operation: string,
  statusCode: number,
  contentType: string | null,
  body: string,
  cause: unknown
): ProviderError {
  const details = body.trim()
    ? body.trim().slice(0, 500)
    : `Empty response body${contentType ? ` (${contentType})` : ""}`;
  return new ProviderError(
    `fal API returned an invalid response during ${operation}: ${details}`,
    {
      kind: "model",
      provider: FAL_PROVIDER,
      operation,
      code: "provider",
      statusCode,
      retryable: statusCode === 408 ||
        statusCode === 429 ||
        statusCode >= 500 ||
        (statusCode >= 200 && statusCode < 300),
      details: {
        body: body.slice(0, 2000),
        contentType,
        cause: cause instanceof Error ? cause.message : String(cause),
      },
    }
  );
}

function createFalTransportError(
  operation: string,
  url: string,
  cause: unknown
): ProviderError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new ProviderError(
    `fal API transport error during ${operation}: ${message}`,
    {
      kind: "model",
      provider: FAL_PROVIDER,
      operation,
      code: "temporary",
      retryable: true,
      details: {
        url,
        cause: message,
      },
      cause,
    }
  );
}

async function falRequest<T>(
  operation: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const apiKey = getFalApiKey();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "identity",
        Authorization: `Key ${apiKey}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw createFalTransportError(operation, url, error);
  }

  const contentType = response.headers.get("content-type");
  let body = "";
  try {
    body = await response.text();
  } catch (error) {
    throw createFalResponseDecodeError(
      operation,
      response.status,
      contentType,
      "",
      error
    );
  }

  if (!response.ok) {
    throw createFalHttpError(operation, response.status, body);
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw createFalResponseDecodeError(
      operation,
      response.status,
      contentType,
      body,
      error
    );
  }
}

function createFalDryRunId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

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

function falImageModelForInput(model: string, input: GenerateImageInput): string {
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

function finiteDurationValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

export function normalizeFalVideoDurationForModel(
  model: string,
  value: unknown
): number | string | undefined {
  const duration = finiteDurationValue(value);
  if (!duration) return undefined;

  if (model.includes("kling-video/v3")) {
    return String(Math.max(
      FAL_KLING_V3_MIN_DURATION_SECONDS,
      Math.min(FAL_KLING_V3_MAX_DURATION_SECONDS, Math.round(duration))
    ));
  }

  return duration;
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

function falGeneratedAssetMimeType(
  item: Record<string, unknown>,
  fallback: string
): string {
  if (typeof item.content_type === "string") return item.content_type;
  if (typeof item.mime_type === "string") return item.mime_type;
  return fallback;
}

function addFalAssetsFromList(
  assets: GeneratedAsset[],
  list: unknown[],
  fallbackMimeType: string
): void {
  for (const asset of list) {
    if (!asset || typeof asset !== "object") continue;
    const item = asset as Record<string, unknown>;
    if (typeof item.url === "string") {
      assets.push({
        url: item.url,
        data: item.url,
        mimeType: falGeneratedAssetMimeType(item, fallbackMimeType),
      });
    }
  }
}

function falAudioPayload(input: GenerateAudioInput): Record<string, unknown> {
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

function falLipsyncPayload(input: GenerateLipsyncInput): Record<string, unknown> {
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

function mapFalQueueStatus(status: string, hasError: boolean): AsyncJobStatus {
  if (status === "IN_QUEUE") return "queued";
  if (status === "IN_PROGRESS") return "running";
  if (status === "COMPLETED" && hasError) return "failed";
  if (status === "COMPLETED") return "succeeded";
  return "failed";
}

function normalizeFalAssets(payload: unknown): GeneratedAsset[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = payload as Record<string, unknown>;
  const assets: GeneratedAsset[] = [];

  addFalAssetsFromList(
    assets,
    Array.isArray(data.images) ? data.images : [],
    "image/png"
  );

  const singletonKeys = ["image", "video", "audio"] as const;
  for (const key of singletonKeys) {
    const value = data[key];
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    if (typeof item.url === "string") {
      assets.push({
        url: item.url,
        data: item.url,
        mimeType: falGeneratedAssetMimeType(
          item,
          key === "video"
            ? "video/mp4"
            : key === "audio"
              ? "audio/mpeg"
              : "image/png"
        ),
      });
    }
  }

  addFalAssetsFromList(
    assets,
    Array.isArray(data.videos) ? data.videos : [],
    "video/mp4"
  );
  addFalAssetsFromList(
    assets,
    Array.isArray(data.audios) ? data.audios : [],
    "audio/mpeg"
  );

  return assets;
}

function getRequiredFalModel(
  input: Pick<GetJobStatusInput, "model">,
  operation: string
): string {
  if (!input.model) {
    throw new ProviderError("fal job status requires the original model id", {
      kind: "model",
      provider: FAL_PROVIDER,
      operation,
      code: "validation",
    });
  }

  return input.model;
}

function metadataUrl(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function withLogs(url: string): string {
  return url.includes("?") ? `${url}&logs=1` : `${url}?logs=1`;
}

async function submitFalJob(
  operation: string,
  model: string,
  payload: Record<string, unknown>
): Promise<FalQueueSubmitResponse> {
  return falRequest<FalQueueSubmitResponse>(
    operation,
    `${getFalQueueBaseUrl()}/${model}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

async function fetchFalJobResult(
  args: {
    fallbackUrl: string;
    jobId?: string;
    model: string;
    responseUrl: string;
  }
): Promise<Record<string, unknown>> {
  try {
    return await falRequest<Record<string, unknown>>(
      "get_job_result",
      args.responseUrl,
      { method: "GET" }
    );
  } catch (error) {
    if (args.responseUrl === args.fallbackUrl) throw error;
    if (error instanceof ProviderError && error.retryable) {
      console.warn("fal result response_url failed; trying canonical result endpoint", {
        errorMessage: error.message,
        jobId: args.jobId,
        model: args.model,
        operation: error.operation,
        statusCode: error.statusCode,
      });
      return await falRequest<Record<string, unknown>>(
        "get_job_result",
        args.fallbackUrl,
        { method: "GET" }
      );
    }
    throw error;
  }
}

async function generateFalImage(
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  const requestedModel = input.model ?? DEFAULT_FAL_IMAGE_MODEL;
  const model = falImageModelForInput(requestedModel, input);

  if (isFalDryRunEnabled()) {
    return {
      images: [],
      jobId: createFalDryRunId("fal_image"),
      status: "queued",
      metadata: {
        provider: FAL_PROVIDER,
        model,
      },
      raw: {
        dryRun: true,
      },
    };
  }

  try {
    const argumentOverrides = providerArgumentOverrides(input.metadata);
    const referenceImageUrls = falReferenceImageUrls(input);
    const payload = isFalGeminiImageModel(model)
      ? {
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
        }
      : {
          prompt: input.prompt,
          num_images: input.count ?? 1,
          image_size: aspectRatioToFalImageSize(input.aspectRatio),
          ...falImageReferencePayload(input),
          ...argumentOverrides,
        };

    const submitted = await submitFalJob("generate_image", model, payload);

    return {
      images: [],
      jobId: submitted.request_id,
      status: "queued",
      metadata: {
        provider: FAL_PROVIDER,
        model,
        statusUrl: submitted.status_url,
        responseUrl: submitted.response_url,
        cancelUrl: submitted.cancel_url,
        queuePosition: submitted.queue_position,
      },
      raw: submitted,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: FAL_PROVIDER,
      operation: "generate_image",
    });
  }
}

async function generateFalVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoResult> {
  const model = input.model ?? DEFAULT_FAL_VIDEO_MODEL;

  if (isFalDryRunEnabled()) {
    return {
      jobId: createFalDryRunId("fal_video"),
      status: "queued",
      metadata: {
        provider: FAL_PROVIDER,
        model,
      },
      raw: {
        dryRun: true,
      },
    };
  }

  try {
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

    const submitted = await submitFalJob("generate_video", model, payload);

    return {
      jobId: submitted.request_id,
      status: "queued",
      metadata: {
        provider: FAL_PROVIDER,
        model,
        statusUrl: submitted.status_url,
        responseUrl: submitted.response_url,
        cancelUrl: submitted.cancel_url,
        queuePosition: submitted.queue_position,
      },
      raw: submitted,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: FAL_PROVIDER,
      operation: "generate_video",
    });
  }
}

async function generateFalAudio(
  input: GenerateAudioInput
): Promise<GenerateAudioResult> {
  const model = input.model ?? DEFAULT_FAL_AUDIO_MODEL;

  if (isFalDryRunEnabled()) {
    return {
      audios: [],
      jobId: createFalDryRunId("fal_audio"),
      status: "queued",
      metadata: {
        provider: FAL_PROVIDER,
        model,
      },
      raw: {
        dryRun: true,
      },
    };
  }

  try {
    const submitted = await submitFalJob(
      "generate_audio",
      model,
      falAudioPayload(input)
    );

    return {
      audios: [],
      jobId: submitted.request_id,
      status: "queued",
      metadata: {
        provider: FAL_PROVIDER,
        model,
        statusUrl: submitted.status_url,
        responseUrl: submitted.response_url,
        cancelUrl: submitted.cancel_url,
        queuePosition: submitted.queue_position,
      },
      raw: submitted,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: FAL_PROVIDER,
      operation: "generate_audio",
    });
  }
}

async function generateFalLipsync(
  input: GenerateLipsyncInput
): Promise<GenerateLipsyncResult> {
  const model = input.model ?? DEFAULT_FAL_LIPSYNC_MODEL;

  if (isFalDryRunEnabled()) {
    return {
      jobId: createFalDryRunId("fal_lipsync"),
      status: "queued",
      metadata: {
        provider: FAL_PROVIDER,
        model,
      },
      raw: {
        dryRun: true,
      },
    };
  }

  try {
    const submitted = await submitFalJob(
      "generate_lipsync",
      model,
      falLipsyncPayload(input)
    );

    return {
      jobId: submitted.request_id,
      status: "queued",
      metadata: {
        provider: FAL_PROVIDER,
        model,
        statusUrl: submitted.status_url,
        responseUrl: submitted.response_url,
        cancelUrl: submitted.cancel_url,
        queuePosition: submitted.queue_position,
      },
      raw: submitted,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: FAL_PROVIDER,
      operation: "generate_lipsync",
    });
  }
}

async function getFalJobStatus(
  input: GetJobStatusInput
): Promise<GetJobStatusResult> {
  const model = getRequiredFalModel(input, "get_job_status");

  if (isFalDryRunEnabled()) {
    return {
      jobId: input.jobId,
      status: "succeeded",
      assets: [
        {
          url: "https://fal.invalid/dry-run-result.png",
          data: "https://fal.invalid/dry-run-result.png",
          mimeType: "image/png",
        },
      ],
      metadata: {
        provider: FAL_PROVIDER,
        model,
      },
      raw: {
        dryRun: true,
      },
    };
  }

  try {
    const statusUrl = metadataUrl(input.metadata, "statusUrl");
    const metadataResponseUrl = metadataUrl(input.metadata, "responseUrl");
    const statusResponse = await falRequest<FalQueueStatusResponse>(
      "get_job_status",
      withLogs(statusUrl ?? `${getFalQueueBaseUrl()}/${model}/requests/${input.jobId}/status`),
      { method: "GET" }
    );

    const status = mapFalQueueStatus(
      statusResponse.status,
      Boolean(statusResponse.error)
    );

    if (status !== "succeeded") {
      return {
        jobId: input.jobId,
        status,
        errorMessage: statusResponse.error,
        metadata: {
          provider: FAL_PROVIDER,
          model,
        },
        raw: statusResponse,
      };
    }

    const fallbackResponseUrl = `${getFalQueueBaseUrl()}/${model}/requests/${input.jobId}`;
    const responseUrl =
      statusResponse.response_url ||
      metadataResponseUrl ||
      fallbackResponseUrl;
    const result = await fetchFalJobResult({
      fallbackUrl: fallbackResponseUrl,
      jobId: input.jobId,
      model,
      responseUrl,
    });

    return {
      jobId: input.jobId,
      status: "succeeded",
      assets: normalizeFalAssets(result),
      metadata: {
        provider: FAL_PROVIDER,
        model,
      },
      raw: {
        status: statusResponse,
        result,
      },
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: FAL_PROVIDER,
      operation: "get_job_status",
    });
  }
}

async function unsupportedFalText(
  _input: GenerateTextInput
): Promise<GenerateTextResult> {
  throw unsupportedProviderOperation("model", FAL_PROVIDER, "generate_text");
}

async function unsupportedFalStructured<T>(
  _input: GenerateStructuredInput<T>
): Promise<GenerateStructuredResult<T>> {
  throw unsupportedProviderOperation("model", FAL_PROVIDER, "generate_structured");
}

async function unsupportedFalVideoRender(
  _input: GenerateVideoRenderInput
): Promise<GenerateVideoRenderResult> {
  throw unsupportedProviderOperation("model", FAL_PROVIDER, "generate_video_render");
}

export const falProvider: ModelProvider = {
  provider: FAL_PROVIDER,
  displayName: "fal.ai",
  capabilities: {
    text: false,
    structured: false,
    image: true,
    video: true,
    audio: true,
    lipsync: true,
    videoRender: false,
    asyncJobs: true,
  },
  generateText: unsupportedFalText,
  generateStructured: unsupportedFalStructured,
  generateImage: generateFalImage,
  generateVideo: generateFalVideo,
  generateAudio: generateFalAudio,
  generateLipsync: generateFalLipsync,
  generateVideoRender: unsupportedFalVideoRender,
  getJobStatus: getFalJobStatus,
};

registerModelProvider(falProvider);
