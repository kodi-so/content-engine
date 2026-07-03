import {
  missingProviderConfiguration,
  ProviderError,
  type ProviderErrorCode,
} from "../errors";
import type {
  ListPublishingAccountsInput,
  ListPublishingAccountsResult,
  PublishingProviderName,
  UploadMediaInput,
} from "../publishing";

export type PostBridgePage<T> = {
  data: T[];
  meta?: {
    total?: number;
    offset?: number;
    limit?: number;
    next?: string | null;
  };
};

export type PostBridgeUploadUrlResponse = {
  media_id: string;
  upload_url: string;
  name: string;
};

export const POST_BRIDGE_PROVIDER: PublishingProviderName = "post_bridge";
export const DEFAULT_PAGE_LIMIT = 100;

const DEFAULT_POST_BRIDGE_BASE_URL = "https://api.post-bridge.com/v1";

export const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
]);

export function isDryRunEnabled(): boolean {
  const value = process.env.POSTBRIDGE_DRY_RUN?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function getPostBridgeBaseUrl(): string {
  return process.env.POSTBRIDGE_BASE_URL?.trim() || DEFAULT_POST_BRIDGE_BASE_URL;
}

function getPostBridgeApiKey(): string {
  if (isDryRunEnabled()) return "postbridge-dry-run";

  const apiKey = process.env.POSTBRIDGE_API_KEY?.trim();
  if (!apiKey) {
    throw missingProviderConfiguration(
      "publishing",
      POST_BRIDGE_PROVIDER,
      "POSTBRIDGE_API_KEY"
    );
  }

  return apiKey;
}

function mapStatusCode(statusCode: number): ProviderErrorCode {
  if (statusCode === 400) return "validation";
  if (statusCode === 401) return "authentication";
  if (statusCode === 403) return "authorization";
  if (statusCode === 404) return "not_found";
  if (statusCode === 409) return "conflict";
  if (statusCode === 429) return "rate_limit";
  if (statusCode >= 500) return "temporary";
  return "provider";
}

function summarizePostBridgeError(details: string): string {
  const trimmed = details.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const parts = [
        typeof record.message === "string" ? record.message : undefined,
        typeof record.error === "string" ? record.error : undefined,
      ].filter((part): part is string => Boolean(part));

      if (parts.length > 0) return parts.join(" ");
    }
  } catch {
    // Fall back to the raw response body below.
  }

  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}

export function createPostBridgeHttpError(
  operation: string,
  statusCode: number,
  details: string
): ProviderError {
  const summary = summarizePostBridgeError(details);
  const message = [
    `PostBridge API error during ${operation}`,
    `status ${statusCode}`,
    summary,
  ].filter(Boolean).join(": ");

  return new ProviderError(message, {
    kind: "publishing",
    provider: POST_BRIDGE_PROVIDER,
    operation,
    code: mapStatusCode(statusCode),
    statusCode,
    retryable: statusCode === 429 || statusCode >= 500,
    details,
  });
}

export async function postBridgeRequest<T>(
  operation: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${getPostBridgeBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getPostBridgeApiKey()}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw createPostBridgeHttpError(operation, response.status, await response.text());
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function createDryRunId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function encodeUploadData(input: UploadMediaInput): Uint8Array {
  if (input.data instanceof Uint8Array) return input.data;
  if (input.data instanceof ArrayBuffer) return new Uint8Array(input.data);
  if (input.encoding === "utf8") return new TextEncoder().encode(input.data);

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

export function paginatedResult<T>(
  page: PostBridgePage<T>,
  input: ListPublishingAccountsInput
): Pick<ListPublishingAccountsResult, "nextCursor" | "syncedAt" | "raw"> {
  const offset = page.meta?.offset ?? (input.cursor ? Number.parseInt(input.cursor, 10) : 0) ?? 0;
  const limit = page.meta?.limit ?? input.limit ?? DEFAULT_PAGE_LIMIT;
  const nextOffset = offset + page.data.length;
  const hasNext = Boolean(page.meta?.next) || (
    typeof page.meta?.total === "number" &&
    nextOffset < page.meta.total &&
    page.data.length >= limit
  );

  return {
    nextCursor: hasNext ? String(nextOffset) : undefined,
    syncedAt: Date.now(),
    raw: page,
  };
}
