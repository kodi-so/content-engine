import {
  missingProviderConfiguration,
  ProviderError,
  type ProviderErrorCode,
  toProviderError,
  unsupportedProviderOperation,
} from "./errors";
import {
  registerModelProvider,
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
  type ModelMessage,
  type ModelProvider,
  type ModelProviderName,
} from "./model";

type OpenRouterResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | Array<{ type?: string; text?: string }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
};

const OPENROUTER_PROVIDER: ModelProviderName = "openrouter";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

function isOpenRouterDryRunEnabled(): boolean {
  const value = process.env.OPENROUTER_DRY_RUN?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function getOpenRouterBaseUrl(): string {
  return process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL;
}

function getOpenRouterApiKey(): string {
  if (isOpenRouterDryRunEnabled()) {
    return "openrouter-dry-run";
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw missingProviderConfiguration(
      "model",
      OPENROUTER_PROVIDER,
      "OPENROUTER_API_KEY"
    );
  }

  return apiKey;
}

function mapOpenRouterStatusCode(statusCode: number): ProviderErrorCode {
  if (statusCode === 400) return "validation";
  if (statusCode === 401) return "authentication";
  if (statusCode === 402) return "authorization";
  if (statusCode === 404) return "not_found";
  if (statusCode === 408) return "temporary";
  if (statusCode === 409) return "conflict";
  if (statusCode === 413) return "validation";
  if (statusCode === 422) return "validation";
  if (statusCode === 429) return "rate_limit";
  if (statusCode >= 500) return "temporary";
  return "provider";
}

function createOpenRouterHttpError(
  operation: string,
  statusCode: number,
  details: string
): ProviderError {
  return new ProviderError(`OpenRouter API error during ${operation}`, {
    kind: "model",
    provider: OPENROUTER_PROVIDER,
    operation,
    code: mapOpenRouterStatusCode(statusCode),
    statusCode,
    retryable: statusCode === 408 || statusCode === 429 || statusCode >= 500,
    details,
  });
}

function buildOpenRouterMessages(input: GenerateTextInput): ModelMessage[] {
  if (input.messages && input.messages.length > 0) {
    return input.messages;
  }

  const messages: ModelMessage[] = [];
  if (input.systemPrompt) {
    messages.push({ role: "system", content: input.systemPrompt });
  }
  messages.push({ role: "user", content: input.prompt ?? "" });
  return messages;
}

function extractOpenRouterText(response: OpenRouterResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
  }

  return "";
}

async function openRouterRequest(
  operation: string,
  input: GenerateTextInput,
  extraBody?: Record<string, unknown>
): Promise<GenerateTextResult> {
  if (isOpenRouterDryRunEnabled()) {
    return {
      text:
        input.responseFormat?.type === "json_object"
          ? "{\"dryRun\":true}"
          : "OpenRouter dry run response",
      metadata: {
        provider: OPENROUTER_PROVIDER,
        model: input.model ?? DEFAULT_OPENROUTER_MODEL,
        usage: {
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
        },
        costUsd: 0,
      },
      raw: {
        dryRun: true,
      },
    };
  }

  const apiKey = getOpenRouterApiKey();
  const fallbackModels = Array.isArray(input.metadata?.fallbackModels)
    ? input.metadata?.fallbackModels.filter(
        (model): model is string => typeof model === "string" && model.length > 0
      )
    : [];

  const body: Record<string, unknown> = {
    model: input.model ?? DEFAULT_OPENROUTER_MODEL,
    messages: buildOpenRouterMessages(input),
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    ...extraBody,
  };

  if (fallbackModels.length > 0) {
    body.models = fallbackModels;
    body.route = "fallback";
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_APP_NAME) {
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  }

  try {
    const response = await fetch(
      `${getOpenRouterBaseUrl()}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      throw createOpenRouterHttpError(
        operation,
        response.status,
        await response.text()
      );
    }

    const data = (await response.json()) as OpenRouterResponse;
    const text = extractOpenRouterText(data);

    return {
      text,
      metadata: {
        provider: OPENROUTER_PROVIDER,
        model: data.model ?? (input.model ?? DEFAULT_OPENROUTER_MODEL),
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
        },
        costUsd: data.usage?.cost,
      },
      raw: data,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: OPENROUTER_PROVIDER,
      operation,
    });
  }
}

async function generateOpenRouterText(
  input: GenerateTextInput
): Promise<GenerateTextResult> {
  const extraBody =
    input.responseFormat?.type === "json_object"
      ? { response_format: { type: "json_object" } }
      : undefined;
  return openRouterRequest("generate_text", input, extraBody);
}

async function generateOpenRouterStructured<T>(
  input: GenerateStructuredInput<T>
): Promise<GenerateStructuredResult<T>> {
  const extraBody = input.schema
    ? {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: input.schemaName ?? "structured_output",
            strict: true,
            schema: input.schema,
          },
        },
      }
    : { response_format: { type: "json_object" } };

  const response = await openRouterRequest(
    "generate_structured",
    input,
    extraBody
  );

  try {
    const parser = input.parser ?? ((text: string) => JSON.parse(text) as T);
    return {
      object: parser(response.text),
      text: response.text,
      metadata: response.metadata,
      raw: response.raw,
    };
  } catch (error) {
    throw new ProviderError("OpenRouter returned invalid structured output", {
      kind: "model",
      provider: OPENROUTER_PROVIDER,
      operation: "generate_structured",
      code: "provider",
      cause: error,
      details: response.text,
    });
  }
}

async function unsupportedOpenRouterImage(
  _input: GenerateImageInput
): Promise<GenerateImageResult> {
  throw unsupportedProviderOperation("model", OPENROUTER_PROVIDER, "generate_image");
}

async function unsupportedOpenRouterVideo(
  _input: GenerateVideoInput
): Promise<GenerateVideoResult> {
  throw unsupportedProviderOperation("model", OPENROUTER_PROVIDER, "generate_video");
}

async function unsupportedOpenRouterAudio(
  _input: GenerateAudioInput
): Promise<GenerateAudioResult> {
  throw unsupportedProviderOperation("model", OPENROUTER_PROVIDER, "generate_audio");
}

async function unsupportedOpenRouterLipsync(
  _input: GenerateLipsyncInput
): Promise<GenerateLipsyncResult> {
  throw unsupportedProviderOperation("model", OPENROUTER_PROVIDER, "generate_lipsync");
}

async function unsupportedOpenRouterVideoRender(
  _input: GenerateVideoRenderInput
): Promise<GenerateVideoRenderResult> {
  throw unsupportedProviderOperation("model", OPENROUTER_PROVIDER, "generate_video_render");
}

async function unsupportedOpenRouterJobStatus(
  _input: GetJobStatusInput
): Promise<GetJobStatusResult> {
  throw unsupportedProviderOperation("model", OPENROUTER_PROVIDER, "get_job_status");
}

export const openRouterProvider: ModelProvider = {
  provider: OPENROUTER_PROVIDER,
  displayName: "OpenRouter",
  capabilities: {
    text: true,
    structured: true,
    image: false,
    video: false,
    audio: false,
    lipsync: false,
    videoRender: false,
    asyncJobs: false,
  },
  generateText: generateOpenRouterText,
  generateStructured: generateOpenRouterStructured,
  generateImage: unsupportedOpenRouterImage,
  generateVideo: unsupportedOpenRouterVideo,
  generateAudio: unsupportedOpenRouterAudio,
  generateLipsync: unsupportedOpenRouterLipsync,
  generateVideoRender: unsupportedOpenRouterVideoRender,
  getJobStatus: unsupportedOpenRouterJobStatus,
};

registerModelProvider(openRouterProvider);
