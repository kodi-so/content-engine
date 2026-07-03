import {
  missingProviderConfiguration,
  ProviderError,
  type ProviderErrorCode,
} from "../errors";
import type {
  PublishingProviderName,
  UploadMediaInput,
} from "../publishing";

export const POSTIZ_PROVIDER: PublishingProviderName = "postiz";

const DEFAULT_POSTIZ_BASE_URL = "https://api.postiz.com/public/v1";

export function isDryRunEnabled(): boolean {
  const value = process.env.POSTIZ_DRY_RUN?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function getPostizBaseUrl(): string {
  return process.env.POSTIZ_BASE_URL?.trim() || DEFAULT_POSTIZ_BASE_URL;
}

function getPostizApiKey(): string {
  if (isDryRunEnabled()) {
    return "postiz-dry-run";
  }

  const apiKey = process.env.POSTIZ_API_KEY?.trim();
  if (!apiKey) {
    throw missingProviderConfiguration(
      "publishing",
      POSTIZ_PROVIDER,
      "POSTIZ_API_KEY"
    );
  }

  return apiKey;
}

function mapPostizStatusCode(statusCode: number): ProviderErrorCode {
  if (statusCode === 400) return "validation";
  if (statusCode === 401) return "authentication";
  if (statusCode === 403) return "authorization";
  if (statusCode === 404) return "not_found";
  if (statusCode === 409) return "conflict";
  if (statusCode === 429) return "rate_limit";
  if (statusCode >= 500) return "temporary";
  return "provider";
}

function createPostizHttpError(
  operation: string,
  statusCode: number,
  details: string
): ProviderError {
  return new ProviderError(`Postiz API error during ${operation}`, {
    kind: "publishing",
    provider: POSTIZ_PROVIDER,
    operation,
    code: mapPostizStatusCode(statusCode),
    statusCode,
    retryable: statusCode === 429 || statusCode >= 500,
    details,
  });
}

export async function postizRequest<T>(
  operation: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const apiKey = getPostizApiKey();
  const response = await fetch(`${getPostizBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw createPostizHttpError(operation, response.status, await response.text());
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function createDryRunId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

export function encodeUploadData(input: UploadMediaInput): Uint8Array {
  if (input.data instanceof Uint8Array) {
    return input.data;
  }

  if (input.data instanceof ArrayBuffer) {
    return new Uint8Array(input.data);
  }

  if (input.encoding === "utf8") {
    return new TextEncoder().encode(input.data);
  }

  const sanitized = input.data.includes(",")
    ? input.data.split(",").pop() ?? input.data
    : input.data;

  return Uint8Array.from(Buffer.from(sanitized, "base64"));
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
