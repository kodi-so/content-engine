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

async function falRequest<T>(
  operation: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const apiKey = getFalApiKey();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Key ${apiKey}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw createFalHttpError(operation, response.status, await response.text());
  }

  return (await response.json()) as T;
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

function falReferenceImageUrls(input: GenerateImageInput): string[] | undefined {
  if (!input.referenceImages?.length) return undefined;
  return input.referenceImages.flatMap((image) => {
    if (image.url) return [image.url];
    if (image.base64Data) return [`data:${image.mimeType};base64,${image.base64Data}`];
    return [];
  });
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

  const imageList = Array.isArray(data.images) ? data.images : [];
  for (const image of imageList) {
    if (!image || typeof image !== "object") continue;
    const item = image as Record<string, unknown>;
    if (typeof item.url === "string") {
      assets.push({
        url: item.url,
        data: item.url,
        mimeType:
          typeof item.content_type === "string" ? item.content_type : "image/png",
      });
    }
  }

  const singletonKeys = ["image", "video", "audio"] as const;
  for (const key of singletonKeys) {
    const value = data[key];
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    if (typeof item.url === "string") {
      assets.push({
        url: item.url,
        data: item.url,
        mimeType:
          typeof item.content_type === "string"
            ? item.content_type
            : key === "video"
              ? "video/mp4"
              : "application/octet-stream",
      });
    }
  }

  const videoList = Array.isArray(data.videos) ? data.videos : [];
  for (const video of videoList) {
    if (!video || typeof video !== "object") continue;
    const item = video as Record<string, unknown>;
    if (typeof item.url === "string") {
      assets.push({
        url: item.url,
        data: item.url,
        mimeType:
          typeof item.content_type === "string" ? item.content_type : "video/mp4",
      });
    }
  }

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
    const argumentOverrides = input.metadata?.arguments &&
      typeof input.metadata.arguments === "object"
      ? (input.metadata.arguments as Record<string, unknown>)
      : {};
    const referenceImageUrls = falReferenceImageUrls(input);
    const payload = isFalGeminiImageModel(model)
      ? {
          prompt: input.prompt,
          num_images: input.count ?? 1,
          aspect_ratio: input.aspectRatio ?? "1:1",
          output_format: "png",
          resolution: process.env.CONTENT_ENGINE_IMAGE_RESOLUTION?.trim() || DEFAULT_FAL_IMAGE_RESOLUTION,
          safety_tolerance: "4",
          limit_generations: true,
          ...(referenceImageUrls ? { image_urls: referenceImageUrls } : {}),
          ...argumentOverrides,
        }
      : {
          prompt: input.prompt,
          num_images: input.count ?? 1,
          image_size: aspectRatioToFalImageSize(input.aspectRatio),
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
    const payload = {
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      duration: input.durationSeconds,
      ...(input.metadata?.arguments &&
      typeof input.metadata.arguments === "object"
        ? (input.metadata.arguments as Record<string, unknown>)
        : {}),
    };

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

    const responseUrl =
      statusResponse.response_url ||
      metadataResponseUrl ||
      `${getFalQueueBaseUrl()}/${model}/requests/${input.jobId}`;
    const result = await falRequest<Record<string, unknown>>(
      "get_job_result",
      responseUrl,
      { method: "GET" }
    );

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

async function unsupportedFalAudio(
  _input: GenerateAudioInput
): Promise<GenerateAudioResult> {
  throw unsupportedProviderOperation("model", FAL_PROVIDER, "generate_audio");
}

async function unsupportedFalLipsync(
  _input: GenerateLipsyncInput
): Promise<GenerateLipsyncResult> {
  throw unsupportedProviderOperation("model", FAL_PROVIDER, "generate_lipsync");
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
    audio: false,
    lipsync: false,
    videoRender: false,
    asyncJobs: true,
  },
  generateText: unsupportedFalText,
  generateStructured: unsupportedFalStructured,
  generateImage: generateFalImage,
  generateVideo: generateFalVideo,
  generateAudio: unsupportedFalAudio,
  generateLipsync: unsupportedFalLipsync,
  generateVideoRender: unsupportedFalVideoRender,
  getJobStatus: getFalJobStatus,
};

registerModelProvider(falProvider);
