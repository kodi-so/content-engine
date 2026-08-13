import assert from "node:assert/strict";
import {
  buildScrapeCreatorsTrendUrl,
  normalizeInstagramTrendPage,
  normalizeTikTokTrendPage,
  researchSocialTrends,
} from "../../../../convex/providers/scrapeCreators/client";
import { dependencyIndexesForPlannedToolCalls } from "../../../../convex/create/agent/agentToolPlanning";
import { toolDescriptorMap } from "../../../../convex/create/planning";
import { socialTrendResearchAgentContext } from "../../../../convex/create/execution/socialTrendResearchExecution";
import { validateToolCallInput } from "../../../../convex/create/tools/validateToolInput";

process.env.SCRAPE_CREATORS_BASE_URL = "https://api.scrapecreators.test";
process.env.SCRAPE_CREATORS_API_KEY = "test-api-key";

const tiktokTrendingUrl = new URL(buildScrapeCreatorsTrendUrl("tiktok", {}));
assert.equal(tiktokTrendingUrl.pathname, "/v1/tiktok/get-trending-feed");
assert.equal(tiktokTrendingUrl.searchParams.get("region"), "US");
assert.equal(tiktokTrendingUrl.searchParams.get("trim"), "true");

const tiktokKeywordUrl = new URL(buildScrapeCreatorsTrendUrl("tiktok", {
  query: "marathon training",
  region: "gb",
  timeframe: "week",
  sortBy: "trending",
}));
assert.equal(tiktokKeywordUrl.pathname, "/v1/tiktok/search/top");
assert.equal(tiktokKeywordUrl.searchParams.get("query"), "marathon training");
assert.equal(tiktokKeywordUrl.searchParams.get("region"), "GB");
assert.equal(tiktokKeywordUrl.searchParams.get("publish_time"), "this-week");
assert.equal(tiktokKeywordUrl.searchParams.get("sort_by"), "most-liked");

const instagramTrendingUrl = new URL(buildScrapeCreatorsTrendUrl("instagram", {}));
assert.equal(instagramTrendingUrl.pathname, "/v1/instagram/reels/trending");

const instagramKeywordUrl = new URL(buildScrapeCreatorsTrendUrl("instagram", {
  query: "healthy recipes",
  timeframe: "day",
  sortBy: "recent",
}));
assert.equal(instagramKeywordUrl.pathname, "/v2/instagram/reels/search");
assert.equal(instagramKeywordUrl.searchParams.get("query"), "healthy recipes");
assert.equal(instagramKeywordUrl.searchParams.get("date_posted"), "last-day");
assert.equal(instagramKeywordUrl.searchParams.has("sort_by"), false);

const instagramPage = normalizeInstagramTrendPage({
  success: true,
  credits_charged: 1,
  data: {
    reels: [{
      id: "ig-trend-1",
      shortcode: "TREND123",
      url: "https://www.instagram.com/reel/TREND123/?utm_source=test",
      caption: "A trending Reel",
      taken_at: "2026-08-10T12:00:00.000Z",
      media_type: 2,
      product_type: "clips",
      thumbnail_src: "https://cdn.example/ig-cover.jpg",
      play_count: 900_000,
      like_count: 45_000,
      comment_count: 2_000,
      user: { username: "ig_creator" },
    }],
  },
});
assert.equal(instagramPage.content.length, 1);
assert.deepEqual(instagramPage.content[0], {
  platform: "instagram",
  id: "ig-trend-1",
  url: "https://www.instagram.com/reel/TREND123/",
  creatorHandle: "ig_creator",
  mediaType: "reel",
  caption: "A trending Reel",
  publishedAt: "2026-08-10T12:00:00.000Z",
  thumbnailUrl: "https://cdn.example/ig-cover.jpg",
  metrics: {
    views: 900_000,
    likes: 45_000,
    comments: 2_000,
  },
  pinned: false,
});

const tiktokPage = normalizeTikTokTrendPage({
  success: true,
  credits_charged: 1,
  items: [{
    id: "tt-photo-1",
    desc: "A trending photo carousel",
    content_type: "multi_photo",
    create_time: "2026-08-11T09:30:00.000Z",
    author: { unique_id: "tt_creator" },
    images: ["https://cdn.example/tt-photo.jpg"],
    statistics: {
      play_count: 800_000,
      digg_count: 75_000,
      comment_count: 1_500,
      share_count: 9_000,
    },
    url: "https://www.tiktok.com/@tt_creator/photo/tt-photo-1?lang=en",
  }],
});
assert.equal(tiktokPage.content.length, 1);
assert.deepEqual(tiktokPage.content[0], {
  platform: "tiktok",
  id: "tt-photo-1",
  url: "https://www.tiktok.com/@tt_creator/photo/tt-photo-1",
  creatorHandle: "tt_creator",
  mediaType: "slideshow",
  caption: "A trending photo carousel",
  publishedAt: "2026-08-11T09:30:00.000Z",
  thumbnailUrl: "https://cdn.example/tt-photo.jpg",
  metrics: {
    views: 800_000,
    likes: 75_000,
    comments: 1_500,
    shares: 9_000,
  },
  pinned: false,
});

const descriptor = toolDescriptorMap().get("social.researchTrends");
assert.equal(descriptor?.category, "discovery");
assert.match(descriptor?.description ?? "", /keyword, niche, topic/);
assert.deepEqual(
  validateToolCallInput("social.researchTrends", {
    platform: "both",
    query: "running recovery",
    timeframe: "week",
    sortBy: "trending",
    limit: 8,
  }),
  []
);
assert.deepEqual(
  validateToolCallInput("social.researchTrends", {
    platform: "youtube",
  }),
  ["social.researchTrends.input.platform must be one of instagram, tiktok, both"]
);
assert.deepEqual(
  dependencyIndexesForPlannedToolCalls([
    { toolName: "social.researchTrends", input: { query: "dogs" } },
    { toolName: "analyze.source", input: { source: "https://example.com" } },
  ]),
  [[], []]
);

const originalFetch = globalThis.fetch;
const requestedUrls: string[] = [];
globalThis.fetch = (async (input) => {
  const url = new URL(String(input));
  requestedUrls.push(url.toString());
  if (url.pathname === "/v2/instagram/reels/search") {
    return new Response(JSON.stringify({
      success: true,
      credits_charged: 1,
      reels: [{
        id: "ig-low",
        shortcode: "IGLOW",
        media_type: 2,
        product_type: "clips",
        owner: { username: "instagram_creator" },
        play_count: 100,
        like_count: 10,
      }],
    }), { status: 200 });
  }
  if (url.pathname === "/v1/tiktok/search/top") {
    return new Response(JSON.stringify({
      success: true,
      credits_charged: 1,
      items: [
        {
          id: "tt-low",
          author: { unique_id: "creator_low" },
          statistics: { play_count: 100, digg_count: 20 },
        },
        {
          id: "tt-high",
          author: { unique_id: "creator_high" },
          statistics: { play_count: 1_000, digg_count: 200, share_count: 50 },
        },
      ],
    }), { status: 200 });
  }
  return new Response(JSON.stringify({ success: false, message: "Unexpected route" }), {
    status: 404,
  });
}) as typeof fetch;

try {
  const result = await researchSocialTrends({
    platform: "both",
    query: "running recovery",
    region: "us",
    timeframe: "week",
    sortBy: "trending",
    limit: 2,
  });
  assert.equal(requestedUrls.length, 2);
  assert.equal(result.mode, "keyword_search");
  assert.deepEqual(result.platforms, ["instagram", "tiktok"]);
  assert.equal(result.content.length, 3);
  assert.equal(result.content[1].id, "tt-high");
  assert.equal(result.creditsCharged, 2);
  assert.deepEqual(result.sources.map((source) => source.status), ["succeeded", "succeeded"]);
  assert.ok(result.notes.some((note) => note.includes("point-in-time")));
  assert.ok(result.notes.some((note) => note.includes("Google-indexed")));
  const context = socialTrendResearchAgentContext(result);
  assert.match(context, /inspiration, not templates to copy/);
  assert.match(context, /Use only the exact URLs below/);
  assert.match(context, /Research qualifications/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Social trend research contract passed");
