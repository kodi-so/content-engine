import {
  normalizeInstagramDiscoveryPage,
  normalizeTikTokDiscoveryPage,
} from "./normalizers";
import { resolveSocialDiscoveryTarget } from "./profileTarget";
import {
  normalizeScrapeCreatorsRegion,
  scrapeCreatorsRequest,
  scrapeCreatorsUrl,
} from "./request";
import {
  SCRAPE_CREATORS_PROVIDER,
  type DiscoveredSocialContent,
  type SocialDiscoveryInput,
  type SocialDiscoveryResult,
  type SocialDiscoveryTarget,
} from "./types";

export {
  normalizeInstagramDiscoveryPage,
  normalizeTikTokDiscoveryPage,
} from "./normalizers";
export {
  normalizeInstagramTrendPage,
  normalizeTikTokTrendPage,
} from "./trendNormalizers";
export { resolveSocialDiscoveryTarget } from "./profileTarget";
export {
  buildScrapeCreatorsTrendUrl,
  researchSocialTrends,
} from "./trendClient";
export {
  SCRAPE_CREATORS_PROVIDER,
  ScrapeCreatorsError,
} from "./types";
export type {
  DiscoveredSocialContent,
  NormalizedSocialDiscoveryPage,
  SocialContentMediaType,
  SocialContentMetrics,
  SocialDiscoveryInput,
  SocialDiscoveryPlatform,
  SocialDiscoveryResult,
  SocialDiscoverySort,
  SocialDiscoveryTarget,
  SocialTrendPlatform,
  SocialTrendResearchInput,
  SocialTrendResearchResult,
  SocialTrendResearchSource,
  SocialTrendSort,
  SocialTrendTimeframe,
} from "./types";

const DEFAULT_DISCOVERY_LIMIT = 12;
const MAX_DISCOVERY_LIMIT = 24;
const MAX_DISCOVERY_PAGES = 3;

export function buildScrapeCreatorsDiscoveryUrl(
  target: SocialDiscoveryTarget,
  input: Pick<SocialDiscoveryInput, "cursor" | "region" | "sortBy">
) {
  const path = target.platform === "instagram"
    ? "/v2/instagram/user/posts"
    : "/v3/tiktok/profile/videos";
  const url = scrapeCreatorsUrl(path);
  url.searchParams.set("handle", target.handle);
  url.searchParams.set("trim", "true");
  if (input.cursor) {
    url.searchParams.set(
      target.platform === "instagram" ? "next_max_id" : "max_cursor",
      input.cursor
    );
  }
  if (target.platform === "tiktok") {
    if (input.region) url.searchParams.set("region", input.region.toUpperCase());
    if (input.sortBy) url.searchParams.set("sort_by", input.sortBy);
  }
  return url.toString();
}

function normalizedLimit(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_DISCOVERY_LIMIT;
  return Math.max(1, Math.min(MAX_DISCOVERY_LIMIT, Math.floor(value)));
}

export async function discoverSocialContent(
  input: SocialDiscoveryInput
): Promise<SocialDiscoveryResult> {
  const target = resolveSocialDiscoveryTarget(input);
  const limit = normalizedLimit(input.limit);
  const region = normalizeScrapeCreatorsRegion(input.region);
  const content: DiscoveredSocialContent[] = [];
  const seenIds = new Set<string>();
  let cursor = input.cursor?.trim() || undefined;
  let nextCursor: string | undefined;
  let hasMore = false;
  let creditsCharged = 0;

  for (let pageIndex = 0; pageIndex < MAX_DISCOVERY_PAGES; pageIndex += 1) {
    const url = buildScrapeCreatorsDiscoveryUrl(target, {
      ...(cursor ? { cursor } : {}),
      ...(region ? { region } : {}),
      ...(input.sortBy ? { sortBy: input.sortBy } : {}),
    });
    const payload = await scrapeCreatorsRequest(url);
    const page = target.platform === "instagram"
      ? normalizeInstagramDiscoveryPage(payload, target)
      : normalizeTikTokDiscoveryPage(payload, target);
    creditsCharged += page.creditsCharged;
    for (const item of page.content) {
      const key = `${item.platform}:${item.id}`;
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      content.push(item);
      if (content.length >= limit) break;
    }

    nextCursor = page.nextCursor;
    hasMore = page.hasMore;
    if (content.length >= limit || !hasMore || !nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  return {
    provider: SCRAPE_CREATORS_PROVIDER,
    platform: target.platform,
    handle: target.handle,
    profileUrl: target.profileUrl,
    content,
    hasMore,
    ...(nextCursor ? { nextCursor } : {}),
    creditsCharged,
    fetchedAt: Date.now(),
  };
}
