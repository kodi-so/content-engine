import { missingProviderConfiguration } from "./errors";
import type { ModelProviderName } from "./model";

export const BULKAPIS_PROVIDER: ModelProviderName = "bulkapis";
export const DEFAULT_BULKAPIS_BASE_URL = "https://bulkapis.com/api/v1";

export type BulkApisConfig = {
  apiKey: string;
  baseUrl: string;
};

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getBulkApisBaseUrl(): string {
  return envValue("BULKAPIS_BASE_URL") ?? DEFAULT_BULKAPIS_BASE_URL;
}

export function getBulkApisApiKey(): string {
  const apiKey = envValue("BULKAPIS_API_KEY");
  if (!apiKey) {
    throw missingProviderConfiguration("model", BULKAPIS_PROVIDER, "BULKAPIS_API_KEY");
  }

  return apiKey;
}

export function getBulkApisConfig(): BulkApisConfig {
  return {
    apiKey: getBulkApisApiKey(),
    baseUrl: getBulkApisBaseUrl(),
  };
}
