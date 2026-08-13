import {
  normalizeInstagramContentItems,
  normalizeTikTokContentItems,
} from "./normalizers";
import { ScrapeCreatorsError, type NormalizedSocialDiscoveryPage } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function normalizeInstagramTrendPage(
  payload: unknown
): NormalizedSocialDiscoveryPage {
  if (!isRecord(payload)) {
    throw new ScrapeCreatorsError("ScrapeCreators returned an invalid Instagram trend response.");
  }
  const data = isRecord(payload.data) ? payload.data : undefined;
  const items = data?.reels ?? payload.reels ?? payload.items;
  return {
    content: normalizeInstagramContentItems(items),
    hasMore: false,
    creditsCharged: finiteNumber(payload.credits_charged) ?? 0,
  };
}

export function normalizeTikTokTrendPage(
  payload: unknown
): NormalizedSocialDiscoveryPage {
  if (!isRecord(payload)) {
    throw new ScrapeCreatorsError("ScrapeCreators returned an invalid TikTok trend response.");
  }
  return {
    content: normalizeTikTokContentItems(payload.aweme_list ?? payload.items),
    hasMore: false,
    creditsCharged: finiteNumber(payload.credits_charged) ?? 0,
  };
}
