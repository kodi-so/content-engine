import assert from "node:assert/strict";
import {
  buildScrapeCreatorsDiscoveryUrl,
  discoverSocialContent,
  normalizeInstagramDiscoveryPage,
  normalizeTikTokDiscoveryPage,
  resolveSocialDiscoveryTarget,
} from "../../../../convex/providers/scrapeCreators/client";
import { toolDescriptorMap } from "../../../../convex/create/planning";
import { validateToolCallInput } from "../../../../convex/create/tools/validateToolInput";

process.env.SCRAPE_CREATORS_BASE_URL = "https://api.scrapecreators.test";
process.env.SCRAPE_CREATORS_API_KEY = "test-api-key";

const instagramTarget = resolveSocialDiscoveryTarget({
  profile: "https://www.instagram.com/Example.Creator/?hl=en",
});
assert.deepEqual(instagramTarget, {
  platform: "instagram",
  handle: "Example.Creator",
  profileUrl: "https://www.instagram.com/Example.Creator/",
});

const tiktokTarget = resolveSocialDiscoveryTarget({
  profile: "https://www.tiktok.com/@sample_creator",
});
assert.deepEqual(tiktokTarget, {
  platform: "tiktok",
  handle: "sample_creator",
  profileUrl: "https://www.tiktok.com/@sample_creator",
});

assert.deepEqual(
  resolveSocialDiscoveryTarget({ profile: "@bare_handle", platform: "instagram" }),
  {
    platform: "instagram",
    handle: "bare_handle",
    profileUrl: "https://www.instagram.com/bare_handle/",
  }
);
assert.throws(
  () => resolveSocialDiscoveryTarget({ profile: "@bare_handle" }),
  /Platform is required/
);
assert.throws(
  () => resolveSocialDiscoveryTarget({
    profile: "https://www.instagram.com/reel/ABC123/",
  }),
  /profile URL/
);
assert.throws(
  () => resolveSocialDiscoveryTarget({
    profile: "https://www.tiktok.com/@creator/video/123",
  }),
  /profile URL/
);

const instagramRequestUrl = new URL(buildScrapeCreatorsDiscoveryUrl(instagramTarget, {
  cursor: "next-page",
}));
assert.equal(instagramRequestUrl.pathname, "/v2/instagram/user/posts");
assert.equal(instagramRequestUrl.searchParams.get("handle"), "Example.Creator");
assert.equal(instagramRequestUrl.searchParams.get("next_max_id"), "next-page");
assert.equal(instagramRequestUrl.searchParams.get("trim"), "true");

const tiktokRequestUrl = new URL(buildScrapeCreatorsDiscoveryUrl(tiktokTarget, {
  cursor: "1734562353000",
  region: "us",
  sortBy: "popular",
}));
assert.equal(tiktokRequestUrl.pathname, "/v3/tiktok/profile/videos");
assert.equal(tiktokRequestUrl.searchParams.get("handle"), "sample_creator");
assert.equal(tiktokRequestUrl.searchParams.get("max_cursor"), "1734562353000");
assert.equal(tiktokRequestUrl.searchParams.get("region"), "US");
assert.equal(tiktokRequestUrl.searchParams.get("sort_by"), "popular");

const instagramPage = normalizeInstagramDiscoveryPage({
  success: true,
  credits_charged: 1,
  more_available: true,
  next_max_id: "ig-next",
  items: [
    {
      pk: "ig-image-1",
      code: "IMAGE123",
      media_type: 1,
      taken_at: 1_700_000_000,
      display_uri: "https://cdn.example/image.jpg",
      caption: { text: "Image caption" },
      like_count: 20,
      comment_count: 3,
      user: { username: "Example.Creator" },
    },
    {
      pk: "ig-reel-1",
      code: "REEL123",
      media_type: 2,
      product_type: "clips",
      taken_at: 1_700_000_100,
      play_count: 400,
      like_count: 40,
      comment_count: 4,
      share_count: 2,
      timeline_pinned_user_ids: ["1"],
    },
    {
      pk: "ig-carousel-1",
      code: "CAROUSEL123",
      media_type: 8,
      carousel_media: [
        { image_versions2: { candidates: [{ url: "https://cdn.example/slide-1.jpg" }] } },
        { image_versions2: { candidates: [{ url: "https://cdn.example/slide-2.jpg" }] } },
      ],
    },
  ],
}, instagramTarget);

assert.equal(instagramPage.creditsCharged, 1);
assert.equal(instagramPage.hasMore, true);
assert.equal(instagramPage.nextCursor, "ig-next");
assert.deepEqual(
  instagramPage.content.map((item) => ({
    mediaType: item.mediaType,
    url: item.url,
    pinned: item.pinned,
  })),
  [
    {
      mediaType: "image",
      url: "https://www.instagram.com/p/IMAGE123/",
      pinned: false,
    },
    {
      mediaType: "reel",
      url: "https://www.instagram.com/reel/REEL123/",
      pinned: true,
    },
    {
      mediaType: "carousel",
      url: "https://www.instagram.com/p/CAROUSEL123/",
      pinned: false,
    },
  ]
);
assert.equal(instagramPage.content[0].publishedAt, "2023-11-14T22:13:20.000Z");
assert.equal(instagramPage.content[1].metrics?.views, 400);
assert.equal(instagramPage.content[2].thumbnailUrl, "https://cdn.example/slide-1.jpg");

const tiktokPage = normalizeTikTokDiscoveryPage({
  success: true,
  credits_charged: 1,
  has_more: 1,
  max_cursor: 1_734_562_353_000,
  aweme_list: [
    {
      aweme_id: "tt-video-1",
      desc: "A regular video",
      create_time: 1_700_000_000,
      author: { unique_id: "sample_creator" },
      statistics: {
        play_count: 1_000,
        digg_count: 80,
        comment_count: 7,
        share_count: 5,
      },
      video: {
        dynamic_cover: { url_list: ["https://cdn.example/video-cover.jpg"] },
      },
    },
    {
      aweme_id: "tt-photo-1",
      desc: "A photo slideshow",
      is_top: 1,
      author: { unique_id: "sample_creator" },
      image_post_info: {
        images: [
          { thumbnail: { url_list: ["https://cdn.example/photo-1.jpg"] } },
          { thumbnail: { url_list: ["https://cdn.example/photo-2.jpg"] } },
        ],
      },
    },
  ],
}, tiktokTarget);

assert.equal(tiktokPage.nextCursor, "1734562353000");
assert.deepEqual(
  tiktokPage.content.map((item) => ({
    mediaType: item.mediaType,
    url: item.url,
    pinned: item.pinned,
  })),
  [
    {
      mediaType: "video",
      url: "https://www.tiktok.com/@sample_creator/video/tt-video-1",
      pinned: false,
    },
    {
      mediaType: "slideshow",
      url: "https://www.tiktok.com/@sample_creator/photo/tt-photo-1",
      pinned: true,
    },
  ]
);
assert.equal(tiktokPage.content[0].metrics?.likes, 80);
assert.equal(tiktokPage.content[1].thumbnailUrl, "https://cdn.example/photo-1.jpg");

const descriptor = toolDescriptorMap().get("social.discoverContent");
assert.equal(descriptor?.category, "discovery");
assert.match(descriptor?.description ?? "", /Instagram or TikTok profile/);
assert.deepEqual(
  validateToolCallInput("social.discoverContent", {
    profile: "https://www.instagram.com/example/",
    limit: 12,
  }),
  []
);
assert.deepEqual(
  validateToolCallInput("social.discoverContent", {
    profile: "@example",
    platform: "youtube",
  }),
  ["social.discoverContent.input.platform must be one of instagram, tiktok"]
);

const originalFetch = globalThis.fetch;
const requestedUrls: string[] = [];
const responsePages = [
  {
    success: true,
    credits_charged: 1,
    more_available: true,
    next_max_id: "page-2",
    items: Array.from({ length: 12 }, (_value, index) => ({
      pk: `first-${index}`,
      code: `FIRST${index}`,
      media_type: 1,
    })),
  },
  {
    success: true,
    credits_charged: 1,
    more_available: false,
    items: [
      { pk: "first-0", code: "FIRST0", media_type: 1 },
      { pk: "second-1", code: "SECOND1", media_type: 2, product_type: "clips" },
      { pk: "second-2", code: "SECOND2", media_type: 8 },
    ],
  },
];

globalThis.fetch = (async (input) => {
  requestedUrls.push(String(input));
  const page = responsePages.shift();
  assert.ok(page, "Unexpected extra ScrapeCreators request");
  return new Response(JSON.stringify(page), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

try {
  const paginatedResult = await discoverSocialContent({
    profile: "https://www.instagram.com/example/",
    limit: 14,
  });
  assert.equal(requestedUrls.length, 2);
  assert.equal(new URL(requestedUrls[1]).searchParams.get("next_max_id"), "page-2");
  assert.equal(paginatedResult.content.length, 14);
  assert.equal(new Set(paginatedResult.content.map((item) => item.id)).size, 14);
  assert.equal(paginatedResult.creditsCharged, 2);
  assert.equal(paginatedResult.hasMore, false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Social discovery contract passed");
