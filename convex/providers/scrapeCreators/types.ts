export const SCRAPE_CREATORS_PROVIDER = "scrape_creators";

export type SocialDiscoveryPlatform = "instagram" | "tiktok";
export type SocialDiscoverySort = "latest" | "popular";
export type SocialTrendPlatform = SocialDiscoveryPlatform | "both";
export type SocialTrendTimeframe = "day" | "week" | "month" | "all_time";
export type SocialTrendSort = "trending" | "relevance" | "most_liked" | "recent";
export type SocialContentMediaType =
  | "image"
  | "video"
  | "carousel"
  | "slideshow"
  | "reel";

export type SocialContentMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
};

export type DiscoveredSocialContent = {
  platform: SocialDiscoveryPlatform;
  id: string;
  url: string;
  creatorHandle: string;
  mediaType: SocialContentMediaType;
  caption?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  metrics?: SocialContentMetrics;
  pinned: boolean;
};

export type SocialDiscoveryTarget = {
  platform: SocialDiscoveryPlatform;
  handle: string;
  profileUrl: string;
};

export type SocialDiscoveryInput = {
  profile: string;
  platform?: SocialDiscoveryPlatform;
  limit?: number;
  cursor?: string;
  region?: string;
  sortBy?: SocialDiscoverySort;
};

export type SocialDiscoveryResult = {
  provider: typeof SCRAPE_CREATORS_PROVIDER;
  platform: SocialDiscoveryPlatform;
  handle: string;
  profileUrl: string;
  content: DiscoveredSocialContent[];
  hasMore: boolean;
  nextCursor?: string;
  creditsCharged: number;
  fetchedAt: number;
};

export type NormalizedSocialDiscoveryPage = {
  content: DiscoveredSocialContent[];
  hasMore: boolean;
  nextCursor?: string;
  creditsCharged: number;
};

export type SocialTrendResearchInput = {
  platform?: SocialTrendPlatform;
  query?: string;
  region?: string;
  timeframe?: SocialTrendTimeframe;
  sortBy?: SocialTrendSort;
  limit?: number;
};

export type SocialTrendResearchSource = {
  platform: SocialDiscoveryPlatform;
  mode: "platform_trending" | "keyword_search";
  status: "succeeded" | "failed";
  contentCount: number;
  creditsCharged: number;
  error?: string;
};

export type SocialTrendResearchResult = {
  provider: typeof SCRAPE_CREATORS_PROVIDER;
  mode: "platform_trending" | "keyword_search";
  platforms: SocialDiscoveryPlatform[];
  query?: string;
  region?: string;
  timeframe?: SocialTrendTimeframe;
  sortBy?: SocialTrendSort;
  content: DiscoveredSocialContent[];
  sources: SocialTrendResearchSource[];
  notes: string[];
  creditsCharged: number;
  fetchedAt: number;
};

export class ScrapeCreatorsError extends Error {
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { statusCode?: number; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = "ScrapeCreatorsError";
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
  }
}
