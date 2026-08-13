import {
  ScrapeCreatorsError,
  type DiscoveredSocialContent,
  type NormalizedSocialDiscoveryPage,
  type SocialContentMediaType,
  type SocialContentMetrics,
  type SocialDiscoveryTarget,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function booleanFromUnknown(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return undefined;
}

function nestedRecord(record: Record<string, unknown>, key: string) {
  return isRecord(record[key]) ? record[key] : undefined;
}

function arrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function firstUrlFromUrlList(value: unknown) {
  if (!isRecord(value)) return undefined;
  const urlList = arrayFromUnknown(value.url_list ?? value.urlList);
  return urlList.map(cleanString).find((url): url is string => Boolean(url)) ??
    cleanString(value.url);
}

function firstImageUrl(value: unknown) {
  const directUrl = cleanString(value);
  if (directUrl) return directUrl;
  if (!isRecord(value)) return undefined;
  for (const key of [
    "thumbnail",
    "display_image",
    "displayImage",
    "owner_watermark_image",
    "ownerWatermarkImage",
  ]) {
    const url = firstUrlFromUrlList(value[key]);
    if (url) return url;
  }
  return firstUrlFromUrlList(value);
}

function firstInstagramImageCandidate(record: Record<string, unknown>) {
  const imageVersions = nestedRecord(record, "image_versions2");
  const candidate = arrayFromUnknown(imageVersions?.candidates).find(isRecord);
  return cleanString(candidate?.url);
}

function optionalMetrics(metrics: SocialContentMetrics) {
  return Object.values(metrics).some((value) => value !== undefined)
    ? metrics
    : undefined;
}

function firstNumber(record: Record<string, unknown>, candidates: string[]) {
  return candidates
    .map((key) => finiteNumber(record[key]))
    .find((value): value is number => value !== undefined);
}

function metricsFromRecord(
  record: Record<string, unknown> | undefined,
  keys: {
    views: string[];
    likes: string[];
    comments: string[];
    shares: string[];
  }
): SocialContentMetrics | undefined {
  if (!record) return undefined;
  const views = firstNumber(record, keys.views);
  const likes = firstNumber(record, keys.likes);
  const comments = firstNumber(record, keys.comments);
  const shares = firstNumber(record, keys.shares);
  return optionalMetrics({
    ...(views !== undefined ? { views } : {}),
    ...(likes !== undefined ? { likes } : {}),
    ...(comments !== undefined ? { comments } : {}),
    ...(shares !== undefined ? { shares } : {}),
  });
}

function isoDateFromUnknown(value: unknown) {
  const seconds = finiteNumber(value);
  if (seconds !== undefined) {
    const milliseconds = seconds > 10_000_000_000 ? seconds : seconds * 1000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }

  const text = cleanString(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function instagramMediaType(record: Record<string, unknown>): SocialContentMediaType {
  const productType = cleanString(record.product_type)?.toLowerCase();
  const url = cleanString(record.url)?.toLowerCase();
  if (productType === "clips" || url?.includes("/reel/")) return "reel";
  const carouselItems = arrayFromUnknown(record.carousel_media ?? record.carouselMedia);
  if (finiteNumber(record.media_type ?? record.mediaType) === 8 || carouselItems.length > 1) {
    return "carousel";
  }
  if (finiteNumber(record.media_type ?? record.mediaType) === 2) return "video";
  return "image";
}

function instagramCaption(record: Record<string, unknown>) {
  const caption = record.caption;
  if (typeof caption === "string") return cleanString(caption);
  return isRecord(caption) ? cleanString(caption.text) : undefined;
}

function instagramPostUrl(
  record: Record<string, unknown>,
  shortcode: string,
  mediaType: SocialContentMediaType
) {
  const pathType = mediaType === "reel" ? "reel" : "p";
  if (shortcode) return `https://www.instagram.com/${pathType}/${shortcode}/`;
  const supplied = cleanString(record.url);
  return supplied ? canonicalUrl(supplied) : undefined;
}

function instagramThumbnail(record: Record<string, unknown>) {
  const carouselFirst = arrayFromUnknown(record.carousel_media ?? record.carouselMedia).find(isRecord);
  return cleanString(
    record.display_uri ??
    record.display_url ??
    record.thumbnail_url ??
    record.thumbnail_src ??
    record.image_url
  ) ??
    firstInstagramImageCandidate(record) ??
    (carouselFirst
      ? cleanString(carouselFirst.display_uri ?? carouselFirst.display_url) ??
        firstInstagramImageCandidate(carouselFirst)
      : undefined);
}

function normalizeInstagramItem(
  value: unknown,
  target: SocialDiscoveryTarget
): DiscoveredSocialContent | undefined {
  if (!isRecord(value)) return undefined;
  const shortcode = cleanString(value.code ?? value.shortcode) ?? "";
  const mediaType = instagramMediaType(value);
  const url = instagramPostUrl(value, shortcode, mediaType);
  if (!url) return undefined;

  const user = nestedRecord(value, "user") ?? nestedRecord(value, "owner");
  const creatorHandle = cleanString(user?.username) ?? target.handle;
  const id = cleanString(value.pk ?? value.id) || shortcode || url;
  const caption = instagramCaption(value);
  const publishedAt = isoDateFromUnknown(value.taken_at ?? value.takenAt ?? value.created_at);
  const thumbnailUrl = instagramThumbnail(value);
  const metrics = metricsFromRecord(value, {
    views: ["play_count", "ig_play_count", "video_view_count", "view_count"],
    likes: ["like_count", "likeCount"],
    comments: ["comment_count", "commentCount"],
    shares: ["share_count", "shareCount"],
  });
  const pinnedUserIds = arrayFromUnknown(value.timeline_pinned_user_ids);
  const pinned = booleanFromUnknown(value.is_pinned ?? value.isPinned) ?? pinnedUserIds.length > 0;

  return {
    platform: "instagram",
    id,
    url,
    creatorHandle,
    mediaType,
    ...(caption ? { caption } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(metrics ? { metrics } : {}),
    pinned,
  };
}

export function normalizeInstagramContentItems(
  items: unknown,
  fallbackHandle = "unknown"
) {
  const target: SocialDiscoveryTarget = {
    platform: "instagram",
    handle: fallbackHandle,
    profileUrl: fallbackHandle === "unknown"
      ? "https://www.instagram.com/"
      : `https://www.instagram.com/${fallbackHandle}/`,
  };
  return arrayFromUnknown(items)
    .map((item) => normalizeInstagramItem(item, target))
    .filter((item): item is DiscoveredSocialContent => Boolean(item));
}

export function normalizeInstagramDiscoveryPage(
  payload: unknown,
  target: SocialDiscoveryTarget
): NormalizedSocialDiscoveryPage {
  if (!isRecord(payload)) {
    throw new ScrapeCreatorsError("ScrapeCreators returned an invalid Instagram response.");
  }
  const content = normalizeInstagramContentItems(payload.items, target.handle);
  const nextCursor = cleanString(payload.next_max_id ?? payload.nextMaxId);
  const hasMore = booleanFromUnknown(payload.more_available ?? payload.has_more) ?? Boolean(nextCursor);
  return {
    content,
    hasMore,
    ...(nextCursor ? { nextCursor } : {}),
    creditsCharged: finiteNumber(payload.credits_charged) ?? 0,
  };
}

function tiktokItemImages(record: Record<string, unknown>) {
  const imagePostInfo = nestedRecord(record, "image_post_info") ??
    nestedRecord(record, "imagePostInfo");
  const nestedImages = arrayFromUnknown(imagePostInfo?.images);
  return nestedImages.length ? nestedImages : arrayFromUnknown(record.images);
}

function tiktokThumbnail(record: Record<string, unknown>, images: unknown[]) {
  const slideshowThumbnail = images.map(firstImageUrl).find((url): url is string => Boolean(url));
  if (slideshowThumbnail) return slideshowThumbnail;
  const video = nestedRecord(record, "video");
  if (!video) return undefined;
  for (const key of ["dynamic_cover", "dynamicCover", "cover", "origin_cover", "originCover"] as const) {
    const url = firstUrlFromUrlList(video[key]);
    if (url) return url;
  }
  return undefined;
}

function normalizeTikTokItem(
  value: unknown,
  target: SocialDiscoveryTarget
): DiscoveredSocialContent | undefined {
  if (!isRecord(value)) return undefined;
  const id = cleanString(value.aweme_id ?? value.awemeId ?? value.id);
  if (!id) return undefined;
  const author = nestedRecord(value, "author");
  const creatorHandle = cleanString(author?.unique_id ?? author?.uniqueId) ?? target.handle;
  const images = tiktokItemImages(value);
  const contentType = cleanString(value.content_type ?? value.contentType)?.toLowerCase();
  const mediaType: SocialContentMediaType = images.length || contentType === "multi_photo"
    ? "slideshow"
    : "video";
  const suppliedUrl = cleanString(value.url);
  const url = suppliedUrl
    ? canonicalUrl(suppliedUrl)
    : mediaType === "slideshow"
      ? `https://www.tiktok.com/@${creatorHandle}/photo/${id}`
      : `https://www.tiktok.com/@${creatorHandle}/video/${id}`;
  const caption = cleanString(value.desc ?? value.description);
  const publishedAt = isoDateFromUnknown(
    value.create_time ?? value.createTime ?? value.create_time_utc
  );
  const thumbnailUrl = tiktokThumbnail(value, images);
  const statistics = nestedRecord(value, "statistics") ?? nestedRecord(value, "stats");
  const metrics = metricsFromRecord(statistics, {
    views: ["play_count", "playCount", "view_count", "viewCount"],
    likes: ["digg_count", "diggCount", "like_count", "likeCount"],
    comments: ["comment_count", "commentCount"],
    shares: ["share_count", "shareCount"],
  });
  const pinned = booleanFromUnknown(value.is_top ?? value.isTop ?? value.is_pinned) ?? false;

  return {
    platform: "tiktok",
    id,
    url,
    creatorHandle,
    mediaType,
    ...(caption ? { caption } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(metrics ? { metrics } : {}),
    pinned,
  };
}

export function normalizeTikTokContentItems(
  items: unknown,
  fallbackHandle = "unknown"
) {
  const target: SocialDiscoveryTarget = {
    platform: "tiktok",
    handle: fallbackHandle,
    profileUrl: fallbackHandle === "unknown"
      ? "https://www.tiktok.com/"
      : `https://www.tiktok.com/@${fallbackHandle}`,
  };
  return arrayFromUnknown(items)
    .map((item) => normalizeTikTokItem(item, target))
    .filter((item): item is DiscoveredSocialContent => Boolean(item));
}

export function normalizeTikTokDiscoveryPage(
  payload: unknown,
  target: SocialDiscoveryTarget
): NormalizedSocialDiscoveryPage {
  if (!isRecord(payload)) {
    throw new ScrapeCreatorsError("ScrapeCreators returned an invalid TikTok response.");
  }
  const content = normalizeTikTokContentItems(
    payload.aweme_list ?? payload.items,
    target.handle
  );
  const nextCursorValue = payload.max_cursor ?? payload.maxCursor;
  const nextCursor = nextCursorValue === undefined || nextCursorValue === null
    ? undefined
    : String(nextCursorValue);
  const hasMore = booleanFromUnknown(payload.has_more ?? payload.hasMore) ?? Boolean(nextCursor);
  return {
    content,
    hasMore,
    ...(nextCursor ? { nextCursor } : {}),
    creditsCharged: finiteNumber(payload.credits_charged) ?? 0,
  };
}
