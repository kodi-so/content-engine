import {
  ProviderError,
  type ProviderErrorCode,
} from "../errors";
import {
  BULKAPIS_PROVIDER,
  getBulkApisConfig,
} from "./config";

type BulkApisEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error?: { code?: string; message?: string; details?: unknown } };

export type BulkApisTaskResponse = {
  taskId?: string;
  id?: string;
  status?: string;
  model?: string;
  result?: unknown;
  error?: string | { message?: string };
  creditsUsed?: number;
  costCredits?: number;
};

export type BulkApisChatResponse = {
  message?: {
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cost?: number;
    credits?: number;
  };
  model?: string;
};

function mapBulkApisStatusCode(statusCode: number): ProviderErrorCode {
  if (statusCode === 400 || statusCode === 422) return "validation";
  if (statusCode === 401) return "authentication";
  if (statusCode === 403 || statusCode === 402) return "authorization";
  if (statusCode === 404) return "not_found";
  if (statusCode === 409) return "conflict";
  if (statusCode === 429) return "rate_limit";
  if (statusCode >= 500) return "temporary";
  return "provider";
}

function mapBulkApisErrorCode(code?: string): ProviderErrorCode {
  switch (code) {
    case "UNAUTHORIZED":
      return "authentication";
    case "FORBIDDEN":
      return "authorization";
    case "NOT_FOUND":
      return "not_found";
    case "VALIDATION_ERROR":
      return "validation";
    case "RATE_LIMITED":
      return "rate_limit";
    case "DUPLICATE":
      return "conflict";
    case "INTERNAL_ERROR":
    case "PLATFORM_ERROR":
      return "temporary";
    default:
      return "provider";
  }
}

function createBulkApisHttpError(
  operation: string,
  statusCode: number,
  details: string
): ProviderError {
  const cleanDetails = details.trim();
  const message = cleanDetails
    ? `BulkAPIs error during ${operation}: ${cleanDetails.slice(0, 300)}`
    : `BulkAPIs error during ${operation}`;

  return new ProviderError(message, {
    kind: "model",
    provider: BULKAPIS_PROVIDER,
    operation,
    code: mapBulkApisStatusCode(statusCode),
    statusCode,
    retryable: statusCode === 408 || statusCode === 429 || statusCode >= 500,
    details,
  });
}

function createBulkApisEnvelopeError(
  operation: string,
  envelope: Extract<BulkApisEnvelope<unknown>, { success: false }>
): ProviderError {
  const code = envelope.error?.code;
  return new ProviderError(envelope.error?.message || `BulkAPIs error during ${operation}`, {
    kind: "model",
    provider: BULKAPIS_PROVIDER,
    operation,
    code: mapBulkApisErrorCode(code),
    retryable: code === "RATE_LIMITED" || code === "PLATFORM_ERROR" || code === "INTERNAL_ERROR",
    details: envelope.error,
  });
}

function unwrapBulkApisEnvelope<T>(operation: string, payload: unknown): T {
  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as BulkApisEnvelope<T>;
    if (envelope.success) return envelope.data;
    throw createBulkApisEnvelopeError(operation, envelope);
  }

  return payload as T;
}

function buildBulkApisUrl(path: string): string {
  const { baseUrl } = getBulkApisConfig();
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export async function bulkApisRequest<T>(
  operation: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const { apiKey } = getBulkApisConfig();
  const response = await fetch(buildBulkApisUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw createBulkApisHttpError(operation, response.status, await response.text());
  }

  return unwrapBulkApisEnvelope<T>(operation, await response.json());
}
