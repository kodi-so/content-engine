import {
  missingProviderConfiguration,
  ProviderError,
  type ProviderErrorCode,
} from "../errors";
import type { ModelProviderName } from "../model";

export type FalQueueSubmitResponse = {
  request_id: string;
  response_url?: string;
  status_url?: string;
  cancel_url?: string;
  queue_position?: number;
};

export type FalQueueStatusResponse = {
  status: string;
  request_id?: string;
  response_url?: string;
  queue_position?: number;
  logs?: Array<{ message?: string; timestamp?: string }>;
  metrics?: Record<string, unknown>;
  error?: string;
  error_type?: string;
};

export const FAL_PROVIDER: ModelProviderName = "fal";

const DEFAULT_FAL_QUEUE_BASE_URL = "https://queue.fal.run";

export function isFalDryRunEnabled(): boolean {
  const value = process.env.FAL_DRY_RUN?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function getFalQueueBaseUrl(): string {
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

export async function falRequest<T>(
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

export function createFalDryRunId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}
