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
  type ModelProvider,
  type ModelProviderName,
} from "./model";

type GeminiTextModel =
  | "gemini-2.5-flash"
  | "gemini-2.0-flash"
  | "gemini-1.5-pro"
  | "gemini-1.5-flash";

const TEXT_PRICING: Record<GeminiTextModel, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  "gemini-2.0-flash": { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  "gemini-1.5-pro": { input: 1.25 / 1_000_000, output: 5.0 / 1_000_000 },
  "gemini-1.5-flash": { input: 0.075 / 1_000_000, output: 0.3 / 1_000_000 },
};

const GEMINI_PROVIDER: ModelProviderName = "gemini";
const DEFAULT_TEXT_MODEL: GeminiTextModel = "gemini-2.5-flash";
const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview";
const DEFAULT_PRO_IMAGE_SIZE = "2K";
const COST_PER_IMAGE_USD = 0.02;

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw missingProviderConfiguration("model", GEMINI_PROVIDER, "GEMINI_API_KEY");
  }

  return apiKey;
}

function mapGeminiStatusCode(statusCode: number): ProviderErrorCode {
  if (statusCode === 400) return "validation";
  if (statusCode === 401) return "authentication";
  if (statusCode === 403) return "authorization";
  if (statusCode === 404) return "not_found";
  if (statusCode === 409) return "conflict";
  if (statusCode === 429) return "rate_limit";
  if (statusCode >= 500) return "temporary";
  return "provider";
}

function createGeminiHttpError(
  operation: string,
  statusCode: number,
  details: string
): ProviderError {
  return new ProviderError(`Gemini API error during ${operation}`, {
    kind: "model",
    provider: GEMINI_PROVIDER,
    operation,
    code: mapGeminiStatusCode(statusCode),
    statusCode,
    retryable: statusCode === 429 || statusCode >= 500,
    details,
  });
}

function buildGeminiContents(input: GenerateTextInput): Array<{
  role: "user" | "model";
  parts: Array<{ text: string }>;
}> {
  if (input.messages && input.messages.length > 0) {
    return input.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
  }

  return [
    {
      role: "user",
      parts: [{ text: input.prompt ?? "" }],
    },
  ];
}

async function generateGeminiText(
  input: GenerateTextInput
): Promise<GenerateTextResult> {
  const apiKey = getGeminiApiKey();
  const model = (input.model as GeminiTextModel | undefined) ?? DEFAULT_TEXT_MODEL;

  try {
    const requestBody: Record<string, unknown> = {
      contents: buildGeminiContents(input),
      generationConfig: {
        temperature: input.temperature ?? 0.7,
        maxOutputTokens: input.maxTokens ?? 2048,
      },
    };

    if (input.systemPrompt) {
      requestBody.systemInstruction = {
        parts: [{ text: input.systemPrompt }],
      };
    }

    if (input.responseFormat?.type === "json_object") {
      (requestBody.generationConfig as Record<string, unknown>).responseMimeType =
        "application/json";
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw createGeminiHttpError(
        "generate_text",
        response.status,
        await response.text()
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usageMetadata = data.usageMetadata || {};
    const inputTokens = usageMetadata.promptTokenCount || 0;
    const outputTokens = usageMetadata.candidatesTokenCount || 0;
    const pricing = TEXT_PRICING[model] ?? TEXT_PRICING[DEFAULT_TEXT_MODEL];
    const costUsd = inputTokens * pricing.input + outputTokens * pricing.output;

    return {
      text,
      metadata: {
        provider: GEMINI_PROVIDER,
        model,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        costUsd,
      },
      raw: data,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: GEMINI_PROVIDER,
      operation: "generate_text",
    });
  }
}

async function generateGeminiImage(
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  const apiKey = getGeminiApiKey();
  const model = input.model ?? DEFAULT_IMAGE_MODEL;
  const count = input.count ?? 1;
  const aspectRatio = input.aspectRatio ?? "4:5";
  const imageConfig: Record<string, string> = { aspectRatio };
  const configuredImageSize = typeof input.metadata?.imageSize === "string"
    ? input.metadata.imageSize
    : process.env.CONTENT_ENGINE_IMAGE_SIZE?.trim();
  const imageSize = configuredImageSize || (model === DEFAULT_IMAGE_MODEL ? DEFAULT_PRO_IMAGE_SIZE : undefined);
  if (imageSize) imageConfig.imageSize = imageSize;

  try {
    const images = await Promise.all(
      Array.from({ length: count }, async () => {
        const parts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        > = [];

        for (const referenceImage of input.referenceImages ?? []) {
          if (!referenceImage.base64Data) {
            throw new Error("Gemini reference images must include base64Data");
          }
          parts.push({
            inlineData: {
              mimeType: referenceImage.mimeType,
              data: referenceImage.base64Data,
            },
          });
        }

        parts.push({ text: input.prompt });

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig,
              },
            }),
          }
        );

        if (!response.ok) {
          throw createGeminiHttpError(
            "generate_image",
            response.status,
            await response.text()
          );
        }

        const data = await response.json();
        const responseParts = data.candidates?.[0]?.content?.parts || [];
        for (const part of responseParts) {
          if (part.inlineData?.mimeType?.startsWith("image/")) {
            return {
              mimeType: part.inlineData.mimeType,
              data: part.inlineData.data,
            };
          }
        }

        throw new ProviderError("Gemini returned no image data", {
          kind: "model",
          provider: GEMINI_PROVIDER,
          operation: "generate_image",
          code: "provider",
        });
      })
    );

    return {
      images,
      metadata: {
        provider: GEMINI_PROVIDER,
        model,
        costUsd: COST_PER_IMAGE_USD * images.length,
      },
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "model",
      provider: GEMINI_PROVIDER,
      operation: "generate_image",
    });
  }
}

async function generateGeminiStructured<T>(
  input: GenerateStructuredInput<T>
): Promise<GenerateStructuredResult<T>> {
  const response = await generateGeminiText({
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
    throw new ProviderError("Gemini returned invalid structured output", {
      kind: "model",
      provider: GEMINI_PROVIDER,
      operation: "generate_structured",
      code: "provider",
      cause: error,
      details: response.text,
    });
  }
}

async function generateGeminiVideo(
  _input: GenerateVideoInput
): Promise<GenerateVideoResult> {
  throw unsupportedProviderOperation("model", GEMINI_PROVIDER, "generate_video");
}

async function generateGeminiAudio(
  _input: GenerateAudioInput
): Promise<GenerateAudioResult> {
  throw unsupportedProviderOperation("model", GEMINI_PROVIDER, "generate_audio");
}

async function generateGeminiLipsync(
  _input: GenerateLipsyncInput
): Promise<GenerateLipsyncResult> {
  throw unsupportedProviderOperation("model", GEMINI_PROVIDER, "generate_lipsync");
}

async function generateGeminiVideoRender(
  _input: GenerateVideoRenderInput
): Promise<GenerateVideoRenderResult> {
  throw unsupportedProviderOperation("model", GEMINI_PROVIDER, "generate_video_render");
}

async function getGeminiJobStatus(
  _input: GetJobStatusInput
): Promise<GetJobStatusResult> {
  throw unsupportedProviderOperation("model", GEMINI_PROVIDER, "get_job_status");
}

export const geminiProvider: ModelProvider = {
  provider: GEMINI_PROVIDER,
  displayName: "Google Gemini",
  capabilities: {
    text: true,
    structured: true,
    image: true,
    video: false,
    audio: false,
    lipsync: false,
    videoRender: false,
    asyncJobs: false,
  },
  generateText: generateGeminiText,
  generateStructured: generateGeminiStructured,
  generateImage: generateGeminiImage,
  generateVideo: generateGeminiVideo,
  generateAudio: generateGeminiAudio,
  generateLipsync: generateGeminiLipsync,
  generateVideoRender: generateGeminiVideoRender,
  getJobStatus: getGeminiJobStatus,
};

registerModelProvider(geminiProvider);
