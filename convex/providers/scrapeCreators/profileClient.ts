import {
  scrapeCreatorsRequest,
  scrapeCreatorsUrl,
} from "./request";
import {
  SCRAPE_CREATORS_PROVIDER,
  type SocialDiscoveryTarget,
  type SocialProfileResult,
} from "./types";

const PROFILE_CACHE_MAX_AGE = "1d";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = cleanString(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function firstUrl(value: unknown): string | undefined {
  const direct = cleanString(value);
  if (direct) return direct;
  if (!isRecord(value)) return undefined;

  const urlList = Array.isArray(value.url_list)
    ? value.url_list
    : Array.isArray(value.urlList)
      ? value.urlList
      : [];
  return firstString(...urlList, value.url, value.uri);
}

function creditsCharged(payload: Record<string, unknown>) {
  const value = payload.credits_charged ?? payload.creditsCharged;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function instagramProfileRecord(payload: Record<string, unknown>) {
  const data = isRecord(payload.data) ? payload.data : undefined;
  return (data && isRecord(data.user) ? data.user : undefined) ??
    (isRecord(payload.user) ? payload.user : undefined) ??
    data ??
    payload;
}

function tiktokProfileRecord(payload: Record<string, unknown>) {
  const data = isRecord(payload.data) ? payload.data : undefined;
  return (isRecord(payload.user) ? payload.user : undefined) ??
    (data && isRecord(data.user) ? data.user : undefined) ??
    data ??
    payload;
}

export function buildScrapeCreatorsProfileUrl(target: SocialDiscoveryTarget) {
  const path = target.platform === "instagram"
    ? "/v1/instagram/profile"
    : "/v1/tiktok/profile";
  const url = scrapeCreatorsUrl(path);
  url.searchParams.set("handle", target.handle);
  url.searchParams.set("cache_max_age", PROFILE_CACHE_MAX_AGE);
  return url.toString();
}

export function normalizeSocialProfile(
  payload: unknown,
  target: SocialDiscoveryTarget
): SocialProfileResult {
  const root = isRecord(payload) ? payload : {};
  const profile = target.platform === "instagram"
    ? instagramProfileRecord(root)
    : tiktokProfileRecord(root);

  const avatarUrl = target.platform === "instagram"
    ? firstUrl(profile.profile_pic_url_hd) ?? firstUrl(profile.profile_pic_url)
    : firstUrl(profile.avatarLarger) ??
      firstUrl(profile.avatar_larger) ??
      firstUrl(profile.avatarMedium) ??
      firstUrl(profile.avatar_medium) ??
      firstUrl(profile.avatarThumb) ??
      firstUrl(profile.avatar_thumb);
  const displayName = target.platform === "instagram"
    ? firstString(profile.full_name, profile.fullName)
    : firstString(profile.nickname, profile.display_name, profile.displayName);
  const bio = target.platform === "instagram"
    ? firstString(profile.biography, profile.bio)
    : firstString(profile.signature, profile.bio);
  const verifiedValue = profile.is_verified ?? profile.verified;

  return {
    provider: SCRAPE_CREATORS_PROVIDER,
    platform: target.platform,
    handle: target.handle,
    profileUrl: target.profileUrl,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(displayName ? { displayName } : {}),
    ...(bio ? { bio } : {}),
    ...(typeof verifiedValue === "boolean" ? { verified: verifiedValue } : {}),
    creditsCharged: creditsCharged(root),
    fetchedAt: Date.now(),
  };
}

export async function fetchSocialProfile(
  target: SocialDiscoveryTarget
): Promise<SocialProfileResult> {
  const payload = await scrapeCreatorsRequest(buildScrapeCreatorsProfileUrl(target));
  return normalizeSocialProfile(payload, target);
}
