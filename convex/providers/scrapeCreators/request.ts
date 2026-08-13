import { ScrapeCreatorsError } from "./types";

const DEFAULT_SCRAPE_CREATORS_BASE_URL = "https://api.scrapecreators.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function scrapeCreatorsBaseUrl() {
  return process.env.SCRAPE_CREATORS_BASE_URL?.trim() || DEFAULT_SCRAPE_CREATORS_BASE_URL;
}

function scrapeCreatorsApiKey() {
  const apiKey = process.env.SCRAPE_CREATORS_API_KEY?.trim();
  if (!apiKey) {
    throw new ScrapeCreatorsError(
      "ScrapeCreators requires SCRAPE_CREATORS_API_KEY to be configured."
    );
  }
  return apiKey;
}

function requestTimeoutMs() {
  const parsed = Number.parseInt(process.env.SCRAPE_CREATORS_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : 20_000;
}

function providerMessage(payload: unknown) {
  if (!isRecord(payload)) return undefined;
  const nestedError = isRecord(payload.error) ? payload.error : undefined;
  return cleanString(payload.message) ??
    cleanString(payload.error) ??
    cleanString(nestedError?.message);
}

export function scrapeCreatorsUrl(path: string) {
  return new URL(path, scrapeCreatorsBaseUrl());
}

export function normalizeScrapeCreatorsRegion(
  value: string | undefined,
  fallback?: string
) {
  const region = value?.trim().toUpperCase() || fallback;
  if (!region) return undefined;
  if (!/^[A-Z]{2}$/.test(region)) {
    throw new ScrapeCreatorsError("ScrapeCreators region must be a two-letter country code.");
  }
  return region;
}

export async function scrapeCreatorsRequest(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": scrapeCreatorsApiKey() },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const detail = providerMessage(payload) ?? text.trim().slice(0, 240);
      throw new ScrapeCreatorsError(
        [`ScrapeCreators request failed with status ${response.status}`, detail]
          .filter(Boolean)
          .join(": "),
        {
          statusCode: response.status,
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        }
      );
    }
    if (isRecord(payload) && payload.success === false) {
      throw new ScrapeCreatorsError(
        providerMessage(payload) ?? "ScrapeCreators could not retrieve that public content."
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof ScrapeCreatorsError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ScrapeCreatorsError("ScrapeCreators request timed out.", { retryable: true });
    }
    throw new ScrapeCreatorsError(
      error instanceof Error ? error.message : "ScrapeCreators request failed.",
      { retryable: true }
    );
  } finally {
    clearTimeout(timeout);
  }
}
