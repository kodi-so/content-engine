import {
  normalizeInstagramTrendPage,
  normalizeTikTokTrendPage,
} from "./trendNormalizers";
import {
  normalizeScrapeCreatorsRegion,
  scrapeCreatorsRequest,
  scrapeCreatorsUrl,
} from "./request";
import {
  SCRAPE_CREATORS_PROVIDER,
  ScrapeCreatorsError,
  type DiscoveredSocialContent,
  type SocialDiscoveryPlatform,
  type SocialTrendResearchInput,
  type SocialTrendResearchResult,
  type SocialTrendResearchSource,
  type SocialTrendSort,
  type SocialTrendTimeframe,
} from "./types";

const DEFAULT_TREND_LIMIT = 8;
const MAX_TREND_LIMIT = 12;
const DEFAULT_TIKTOK_REGION = "US";

function normalizedLimit(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_TREND_LIMIT;
  return Math.max(1, Math.min(MAX_TREND_LIMIT, Math.floor(value)));
}

function normalizedQuery(value: string | undefined) {
  const query = value?.trim().replace(/\s+/g, " ");
  if (!query) return undefined;
  if (query.length > 180) {
    throw new ScrapeCreatorsError("Trend research query must be 180 characters or fewer.");
  }
  return query;
}

function tiktokTimeframe(value: SocialTrendTimeframe | undefined) {
  switch (value) {
    case "day":
      return "yesterday";
    case "month":
      return "this-month";
    case "all_time":
      return "all-time";
    case "week":
    default:
      return "this-week";
  }
}

function instagramTimeframe(value: SocialTrendTimeframe | undefined) {
  switch (value) {
    case "day":
      return "last-day";
    case "month":
      return "last-month";
    case "all_time":
      return undefined;
    case "week":
    default:
      return "last-week";
  }
}

function tiktokSort(value: SocialTrendSort | undefined) {
  switch (value) {
    case "recent":
      return "date-posted";
    case "relevance":
      return "relevance";
    case "most_liked":
    case "trending":
    default:
      return "most-liked";
  }
}

function trendPlatforms(value: SocialTrendResearchInput["platform"]) {
  if (value === "instagram") return ["instagram"] as const;
  if (value === "tiktok") return ["tiktok"] as const;
  return ["instagram", "tiktok"] as const;
}

export function buildScrapeCreatorsTrendUrl(
  platform: SocialDiscoveryPlatform,
  input: Pick<
    SocialTrendResearchInput,
    "query" | "region" | "timeframe" | "sortBy"
  >
) {
  const query = normalizedQuery(input.query);
  if (platform === "instagram") {
    const url = scrapeCreatorsUrl(
      query ? "/v2/instagram/reels/search" : "/v1/instagram/reels/trending"
    );
    if (query) {
      url.searchParams.set("query", query);
      const timeframe = instagramTimeframe(input.timeframe);
      if (timeframe) url.searchParams.set("date_posted", timeframe);
    }
    return url.toString();
  }

  const url = scrapeCreatorsUrl(
    query ? "/v1/tiktok/search/top" : "/v1/tiktok/get-trending-feed"
  );
  url.searchParams.set(
    "region",
    normalizeScrapeCreatorsRegion(input.region, DEFAULT_TIKTOK_REGION) ?? DEFAULT_TIKTOK_REGION
  );
  url.searchParams.set("trim", "true");
  if (query) {
    url.searchParams.set("query", query);
    url.searchParams.set("publish_time", tiktokTimeframe(input.timeframe));
    url.searchParams.set("sort_by", tiktokSort(input.sortBy));
  }
  return url.toString();
}

function metricScore(item: DiscoveredSocialContent) {
  return (item.metrics?.views ?? 0) +
    (item.metrics?.likes ?? 0) * 3 +
    (item.metrics?.comments ?? 0) * 6 +
    (item.metrics?.shares ?? 0) * 10;
}

function orderedContent(
  content: DiscoveredSocialContent[],
  mode: SocialTrendResearchResult["mode"],
  sortBy: SocialTrendSort | undefined
) {
  const deduped = [...new Map(
    content.map((item) => [`${item.platform}:${item.id}`, item])
  ).values()];
  if (mode === "platform_trending" || sortBy === "relevance") return deduped;
  if (sortBy === "recent") {
    return deduped.sort((a, b) =>
      (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0)
    );
  }
  return deduped.sort((a, b) => metricScore(b) - metricScore(a));
}

async function researchPlatform(args: {
  input: SocialTrendResearchInput;
  limit: number;
  mode: SocialTrendResearchResult["mode"];
  platform: SocialDiscoveryPlatform;
}) {
  const url = buildScrapeCreatorsTrendUrl(args.platform, args.input);
  const payload = await scrapeCreatorsRequest(url);
  const page = args.platform === "instagram"
    ? normalizeInstagramTrendPage(payload)
    : normalizeTikTokTrendPage(payload);
  return {
    content: orderedContent(page.content, args.mode, args.input.sortBy).slice(0, args.limit),
    creditsCharged: page.creditsCharged,
  };
}

export async function researchSocialTrends(
  input: SocialTrendResearchInput
): Promise<SocialTrendResearchResult> {
  const query = normalizedQuery(input.query);
  const mode = query ? "keyword_search" : "platform_trending";
  const platforms = [...trendPlatforms(input.platform)];
  const limit = normalizedLimit(input.limit);
  const region = platforms.includes("tiktok")
    ? normalizeScrapeCreatorsRegion(input.region, DEFAULT_TIKTOK_REGION)
    : undefined;
  const normalizedInput = {
    ...input,
    ...(query ? { query } : {}),
    ...(region ? { region } : {}),
  };
  const settled = await Promise.allSettled(
    platforms.map(async (platform) => ({
      platform,
      result: await researchPlatform({
        input: normalizedInput,
        limit,
        mode,
        platform,
      }),
    }))
  );

  const content: DiscoveredSocialContent[] = [];
  const sources: SocialTrendResearchSource[] = settled.map((outcome, index) => {
    const platform = platforms[index];
    if (outcome.status === "rejected") {
      return {
        platform,
        mode,
        status: "failed",
        contentCount: 0,
        creditsCharged: 0,
        error: outcome.reason instanceof Error
          ? outcome.reason.message
          : "ScrapeCreators trend request failed.",
      };
    }
    content.push(...outcome.value.result.content);
    return {
      platform,
      mode,
      status: "succeeded",
      contentCount: outcome.value.result.content.length,
      creditsCharged: outcome.value.result.creditsCharged,
    };
  });

  if (sources.every((source) => source.status === "failed")) {
    throw new ScrapeCreatorsError(
      sources.map((source) => `${source.platform}: ${source.error}`).join("; ")
    );
  }

  const notes = [
    "Results are public trend signals, not a personalized For You, Explore, or following feed.",
    "Engagement metrics are point-in-time totals and do not prove growth velocity without repeated snapshots.",
    ...(mode === "keyword_search" && platforms.includes("instagram")
      ? ["Instagram keyword results are Google-indexed public Reels, not Instagram Explore rankings."]
      : []),
    ...(mode === "platform_trending" && platforms.includes("instagram")
      ? ["Instagram's public trending Reels results can overlap across repeated requests."]
      : []),
    ...sources.flatMap((source) => source.error
      ? [`${source.platform} research failed: ${source.error}`]
      : []),
  ];

  return {
    provider: SCRAPE_CREATORS_PROVIDER,
    mode,
    platforms,
    ...(query ? { query } : {}),
    ...(region ? { region } : {}),
    ...(query ? { timeframe: input.timeframe ?? "week" } : {}),
    ...(query ? { sortBy: input.sortBy ?? "trending" } : {}),
    content,
    sources,
    notes,
    creditsCharged: sources.reduce((sum, source) => sum + source.creditsCharged, 0),
    fetchedAt: Date.now(),
  };
}
