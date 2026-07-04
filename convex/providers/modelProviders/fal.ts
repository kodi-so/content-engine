import {
  ProviderError,
  toProviderError,
  unsupportedProviderOperation,
} from "../errors";
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
  type GetJobStatusInput,
  type GetJobStatusResult,
  type ModelProvider,
} from "../model";
import {
  FAL_PROVIDER,
  createFalDryRunId,
  falRequest,
  getFalQueueBaseUrl,
  isFalDryRunEnabled,
  type FalQueueStatusResponse,
  type FalQueueSubmitResponse,
} from "../fal/client";
import { normalizeFalAssets } from "../fal/assets";
import {
  DEFAULT_FAL_AUDIO_MODEL,
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FAL_LIPSYNC_MODEL,
  DEFAULT_FAL_VIDEO_MODEL,
  falAudioPayload,
  falImageModelForInput,
  falImagePayload,
  falLipsyncPayload,
  falVideoPayload,
} from "../fal/payloads";

export { normalizeFalVideoDurationForModel } from "../../../src/lib/generation/videoDurationConstraints";

function mapFalQueueStatus(status: string, hasError: boolean): AsyncJobStatus {
  if (status === "IN_QUEUE") return "queued";
  if (status === "IN_PROGRESS") return "running";
  if (status === "COMPLETED" && hasError) return "failed";
  if (status === "COMPLETED") return "succeeded";
  return "failed";
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
    const submitted = await submitFalJob("generate_image", model, falImagePayload(model, input));

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
    const submitted = await submitFalJob("generate_video", model, falVideoPayload(model, input));

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
