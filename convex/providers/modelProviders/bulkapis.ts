import {
  ProviderError,
  toProviderError,
} from "../errors";
import {
  BULKAPIS_PROVIDER,
} from "../bulkapis/config";
import {
  bulkApisRequest,
  type BulkApisChatResponse,
  type BulkApisTaskResponse,
} from "../bulkapis/client";
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
  type ModelMessage,
  type ModelProvider,
  type ReferenceAsset,
} from "../model";

export { bulkApisRequest } from "../bulkapis/client";

const DEFAULT_BULKAPIS_CHAT_MODEL = "gpt-5-2";
const DEFAULT_BULKAPIS_IMAGE_MODEL = "nano-banana-2";
const DEFAULT_BULKAPIS_VIDEO_MODEL = "kling-2.5-turbo";
const DEFAULT_BULKAPIS_AUDIO_MODEL = "elevenlabs-v3";
const DEFAULT_BULKAPIS_LIPSYNC_MODEL = "omnihuman-v1.5";
const DEFAULT_BULKAPIS_VIDEO_RENDER_MODEL = "video-render";

function providerInputOverrides(input: { metadata?: Record<string, unknown> }): Record<string, unknown> {
  const overrides = input.metadata?.bulkapisInput;
  return overrides && typeof overrides === "object" && !Array.isArray(overrides)
    ? overrides as Record<string, unknown>
    : {};
}

function hasAnyKey(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => record[key] !== undefined);
}

type TextOnlyModelMessage = ModelMessage & { content: string };

function assertTextOnlyMessages(messages: ModelMessage[]) {
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      throw new ProviderError("BulkAPIs text generation does not support image message parts.", {
        kind: "model",
        provider: BULKAPIS_PROVIDER,
        operation: "generate_text",
        code: "validation",
        retryable: false,
      });
    }
  }
  return messages as TextOnlyModelMessage[];
}

function buildBulkApisMessages(input: GenerateTextInput): TextOnlyModelMessage[] {
  if (input.messages?.length) return assertTextOnlyMessages(input.messages);

  const messages: TextOnlyModelMessage[] = [];
  if (input.systemPrompt) {
    messages.push({ role: "system", content: input.systemPrompt });
  }
  messages.push({ role: "user", content: input.prompt ?? "" });
  return messages;
}

function extractChatText(response: BulkApisChatResponse): string {
  const content = response.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
  }

  return "";
}

function usageFromBulkApis(response: BulkApisChatResponse) {
  const usage = response.usage;
  if (!usage) return undefined;

  return {
    inputTokens: usage.inputTokens ?? usage.prompt_tokens,
    outputTokens: usage.outputTokens ?? usage.completion_tokens,
    totalTokens: usage.totalTokens ?? usage.total_tokens,
  };
}

function creditsToUsd(credits?: number): number | undefined {
  if (typeof credits !== "number") return undefined;
  return credits * 0.005;
}

function normalizeBulkApisStatus(status?: string): AsyncJobStatus {
  switch (status?.toLowerCase()) {
    case "completed":
    case "complete":
    case "succeeded":
    case "success":
      return "succeeded";
    case "failed":
    case "error":
      return "failed";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "running":
    case "processing":
    case "in_progress":
      return "running";
    case "queued":
    case "pending":
    default:
      return "queued";
  }
}

function normalizeAsset(value: unknown, fallbackMimeType: string): GeneratedAsset | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const url = typeof data.url === "string" ? data.url : undefined;
  const rawData = typeof data.data === "string" ? data.data : url;
  if (!rawData) return null;

  return {
    data: rawData,
    url,
    mimeType:
      typeof data.content_type === "string"
        ? data.content_type
        : typeof data.mimeType === "string"
          ? data.mimeType
          : fallbackMimeType,
  };
}

function normalizeBulkApisAssets(result: unknown): GeneratedAsset[] {
  if (!result || typeof result !== "object") return [];
  const data = result as Record<string, unknown>;
  const assets: GeneratedAsset[] = [];

  const imageList = Array.isArray(data.images) ? data.images : [];
  for (const image of imageList) {
    const asset = normalizeAsset(image, "image/jpeg");
    if (asset) assets.push(asset);
  }

  for (const [key, fallbackMimeType] of [
    ["image", "image/jpeg"],
    ["video", "video/mp4"],
    ["audio", "audio/mpeg"],
  ] as const) {
    const asset = normalizeAsset(data[key], fallbackMimeType);
    if (asset) assets.push(asset);
  }

  return assets;
}

function referenceUrls(
  input: GenerateImageInput | GenerateVideoInput | { voiceReferenceAudios?: GenerateAudioInput["voiceReferenceAudios"] }
): string[] {
  const references: ReferenceAsset[] | undefined = "voiceReferenceAudios" in input
    ? input.voiceReferenceAudios
    : (input as GenerateImageInput | GenerateVideoInput).referenceImages;

  return references?.flatMap((image: ReferenceAsset) => {
    if (image.url) return [image.url];
    if (image.base64Data) return [`data:${image.mimeType};base64,${image.base64Data}`];
    return [];
  }) ?? [];
}

function referenceUrl(reference?: { url?: string; base64Data?: string; mimeType: string }): string | undefined {
  if (!reference) return undefined;
  if (reference.url) return reference.url;
  if (reference.base64Data) return `data:${reference.mimeType};base64,${reference.base64Data}`;
  return undefined;
}

async function submitBulkApisGeneration<T = BulkApisTaskResponse>(
  operation: string,
  model: string,
  input: Record<string, unknown>
): Promise<T> {
  return await bulkApisRequest<T>(operation, "/ai/generate", {
    method: "POST",
    body: JSON.stringify({
      model,
      input,
    }),
  });
}

async function generateBulkApisText(
  input: GenerateTextInput
): Promise<GenerateTextResult> {
  const model = input.model ?? DEFAULT_BULKAPIS_CHAT_MODEL;

  try {
    const response = await submitBulkApisGeneration<BulkApisChatResponse>("generate_text", model, {
      messages: buildBulkApisMessages(input),
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      response_format: input.responseFormat?.type === "json_object"
        ? { type: "json_object" }
        : undefined,
      ...providerInputOverrides(input),
    });

    return {
      text: extractChatText(response),
      metadata: {
        provider: BULKAPIS_PROVIDER,
        model: response.model ?? model,
        usage: usageFromBulkApis(response),
        costUsd: creditsToUsd(response.usage?.credits ?? response.usage?.cost),
      },
      raw: response,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: BULKAPIS_PROVIDER,
      operation: "generate_text",
    });
  }
}

async function generateBulkApisStructured<T>(
  input: GenerateStructuredInput<T>
): Promise<GenerateStructuredResult<T>> {
  const response = await generateBulkApisText({
    ...input,
    responseFormat: { type: "json_object" },
  });

  try {
    const parser = input.parser ?? ((text: string) => JSON.parse(text) as T);
    return {
      object: parser(response.text),
      text: response.text,
      metadata: response.metadata,
      raw: response.raw,
    };
  } catch (error) {
    throw new ProviderError("BulkAPIs returned invalid structured output", {
      kind: "model",
      provider: BULKAPIS_PROVIDER,
      operation: "generate_structured",
      code: "provider",
      cause: error,
      details: response.text,
    });
  }
}

async function generateBulkApisImage(
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  const model = input.model ?? DEFAULT_BULKAPIS_IMAGE_MODEL;
  const urls = referenceUrls(input);
  const overrides = providerInputOverrides(input);
  const hasImageInputOverride = hasAnyKey(overrides, [
    "image",
    "image_input",
    "image_url",
    "image_urls",
    "input_urls",
    "reference_image_urls",
  ]);
  const hasCountOverride = hasAnyKey(overrides, ["max_images", "num_images"]);

  try {
    const response = await submitBulkApisGeneration("generate_image", model, {
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      num_images: hasCountOverride ? undefined : input.count,
      image_urls: !hasImageInputOverride && urls.length ? urls : undefined,
      ...overrides,
    });
    const images = normalizeBulkApisAssets(response.result).filter((asset) =>
      asset.mimeType.startsWith("image/")
    );

    return {
      images,
      jobId: response.taskId ?? response.id,
      status: response.status ? normalizeBulkApisStatus(response.status) : "queued",
      metadata: {
        provider: BULKAPIS_PROVIDER,
        model: response.model ?? model,
        costUsd: creditsToUsd(response.creditsUsed ?? response.costCredits),
      },
      raw: response,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: BULKAPIS_PROVIDER,
      operation: "generate_image",
    });
  }
}

async function generateBulkApisVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoResult> {
  const model = input.model ?? DEFAULT_BULKAPIS_VIDEO_MODEL;
  const urls = referenceUrls(input);

  try {
    const response = await submitBulkApisGeneration("generate_video", model, {
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      duration: input.durationSeconds,
      image_url: urls[0],
      image_urls: urls.length > 1 ? urls : undefined,
      ...providerInputOverrides(input),
    });
    const jobId = response.taskId ?? response.id;
    if (!jobId) {
      throw new ProviderError("BulkAPIs did not return a task id for video generation", {
        kind: "model",
        provider: BULKAPIS_PROVIDER,
        operation: "generate_video",
        code: "provider",
        details: response,
      });
    }

    return {
      jobId,
      status: response.status ? normalizeBulkApisStatus(response.status) : "queued",
      metadata: {
        provider: BULKAPIS_PROVIDER,
        model: response.model ?? model,
        costUsd: creditsToUsd(response.creditsUsed ?? response.costCredits),
      },
      raw: response,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: BULKAPIS_PROVIDER,
      operation: "generate_video",
    });
  }
}

async function generateBulkApisAudio(
  input: GenerateAudioInput
): Promise<GenerateAudioResult> {
  const model = input.model ?? DEFAULT_BULKAPIS_AUDIO_MODEL;
  const urls = referenceUrls(input);

  try {
    const response = await submitBulkApisGeneration("generate_audio", model, {
      text: input.text,
      audio_url: urls[0],
      audio_urls: urls.length > 1 ? urls : undefined,
      mode: input.mode,
      ...providerInputOverrides(input),
    });
    const audios = normalizeBulkApisAssets(response.result).filter((asset) =>
      asset.mimeType.startsWith("audio/")
    );

    return {
      audios,
      jobId: response.taskId ?? response.id,
      status: response.status ? normalizeBulkApisStatus(response.status) : "queued",
      metadata: {
        provider: BULKAPIS_PROVIDER,
        model: response.model ?? model,
        costUsd: creditsToUsd(response.creditsUsed ?? response.costCredits),
      },
      raw: response,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: BULKAPIS_PROVIDER,
      operation: "generate_audio",
    });
  }
}

async function generateBulkApisLipsync(
  input: GenerateLipsyncInput
): Promise<GenerateLipsyncResult> {
  const model = input.model ?? DEFAULT_BULKAPIS_LIPSYNC_MODEL;

  try {
    const response = await submitBulkApisGeneration("generate_lipsync", model, {
      image_url: referenceUrl(input.image),
      video_url: referenceUrl(input.video),
      audio_url: referenceUrl(input.audio),
      resolution: input.resolution,
      ...providerInputOverrides(input),
    });
    const jobId = response.taskId ?? response.id;
    if (!jobId) {
      throw new ProviderError("BulkAPIs did not return a task id for lipsync generation", {
        kind: "model",
        provider: BULKAPIS_PROVIDER,
        operation: "generate_lipsync",
        code: "provider",
        details: response,
      });
    }

    return {
      jobId,
      status: response.status ? normalizeBulkApisStatus(response.status) : "queued",
      metadata: {
        provider: BULKAPIS_PROVIDER,
        model: response.model ?? model,
        costUsd: creditsToUsd(response.creditsUsed ?? response.costCredits),
      },
      raw: response,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: BULKAPIS_PROVIDER,
      operation: "generate_lipsync",
    });
  }
}

async function generateBulkApisVideoRender(
  input: GenerateVideoRenderInput
): Promise<GenerateVideoRenderResult> {
  const model = input.model ?? DEFAULT_BULKAPIS_VIDEO_RENDER_MODEL;
  const mediaUrls = input.mediaAssets?.flatMap((asset) => {
    const url = referenceUrl(asset);
    return url ? [url] : [];
  }) ?? [];

  try {
    const response = await submitBulkApisGeneration("generate_video_render", model, {
      prompt: input.prompt,
      system_prompt: input.systemPrompt,
      knowledge_base: input.knowledgeBase,
      media_urls: mediaUrls.length ? mediaUrls : undefined,
      aspect_ratio: input.aspectRatio,
      width: input.width,
      height: input.height,
      fps: input.fps,
      max_duration: input.maxDurationSeconds,
      ...providerInputOverrides(input),
    });
    const jobId = response.taskId ?? response.id;
    if (!jobId) {
      throw new ProviderError("BulkAPIs did not return a task id for video render", {
        kind: "model",
        provider: BULKAPIS_PROVIDER,
        operation: "generate_video_render",
        code: "provider",
        details: response,
      });
    }

    return {
      jobId,
      status: response.status ? normalizeBulkApisStatus(response.status) : "queued",
      metadata: {
        provider: BULKAPIS_PROVIDER,
        model: response.model ?? model,
        costUsd: creditsToUsd(response.creditsUsed ?? response.costCredits),
      },
      raw: response,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: BULKAPIS_PROVIDER,
      operation: "generate_video_render",
    });
  }
}

async function getBulkApisJobStatus(
  input: GetJobStatusInput
): Promise<GetJobStatusResult> {
  const model = input.model ?? DEFAULT_BULKAPIS_IMAGE_MODEL;

  try {
    const response = await bulkApisRequest<BulkApisTaskResponse>(
      "get_job_status",
      `/ai/tasks/${encodeURIComponent(input.jobId)}`,
      { method: "GET" }
    );
    const status = normalizeBulkApisStatus(response.status);
    const errorMessage =
      typeof response.error === "string"
        ? response.error
        : response.error?.message;

    return {
      jobId: response.taskId ?? response.id ?? input.jobId,
      status,
      assets: status === "succeeded" ? normalizeBulkApisAssets(response.result) : undefined,
      errorMessage,
      metadata: {
        provider: BULKAPIS_PROVIDER,
        model: response.model ?? model,
        costUsd: creditsToUsd(response.creditsUsed ?? response.costCredits),
      },
      raw: response,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: BULKAPIS_PROVIDER,
      operation: "get_job_status",
    });
  }
}

export const bulkApisProvider: ModelProvider = {
  provider: BULKAPIS_PROVIDER,
  displayName: "BulkAPIs",
  capabilities: {
    text: true,
    structured: true,
    image: true,
    video: true,
    audio: true,
    lipsync: true,
    videoRender: true,
    asyncJobs: true,
  },
  generateText: generateBulkApisText,
  generateStructured: generateBulkApisStructured,
  generateImage: generateBulkApisImage,
  generateVideo: generateBulkApisVideo,
  generateAudio: generateBulkApisAudio,
  generateLipsync: generateBulkApisLipsync,
  generateVideoRender: generateBulkApisVideoRender,
  getJobStatus: getBulkApisJobStatus,
};

registerModelProvider(bulkApisProvider);
