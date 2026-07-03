type ResolverPayload = {
  status?: string;
  mediaType?: string;
  platform?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  byteLength?: number;
  durationSeconds?: number;
  requestHeaders?: Record<string, string>;
  metadata?: Record<string, unknown>;
  slides?: ResolverAssetPayload[];
  audio?: ResolverAssetPayload;
};

type ResolverAssetPayload = {
  url?: string;
  mimeType?: string;
  fileName?: string;
  byteLength?: number;
  requestHeaders?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type RemoteMediaPartForAnalysis = {
  byteLength: number;
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
};

export type RemoteMediaForAnalysis =
  | (RemoteMediaPartForAnalysis & { kind: "media" })
  | {
    kind: "slideshow";
    slides: RemoteMediaPartForAnalysis[];
    audio?: RemoteMediaPartForAnalysis;
    metadata?: Record<string, unknown>;
  };

const MEDIA_URL_PLATFORMS = new Set(["direct_file"]);
const RESOLVER_PLATFORMS = new Set(["tiktok", "instagram", "facebook"]);
const DEFAULT_MEDIA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "video/*,audio/*,*/*;q=0.8",
};

function analysisLog(event: string, details: Record<string, unknown> = {}) {
  console.info(`[analyze.mediaResolver] ${event}`, details);
}

function analysisWarn(event: string, details: Record<string, unknown> = {}) {
  console.warn(`[analyze.mediaResolver] ${event}`, details);
}

function sourceHostForLog(sourceUrl?: string) {
  if (!sourceUrl) return undefined;
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "invalid-url";
  }
}

function isTikTokPhotoUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    if (!host.includes("tiktok.com")) return false;
    return url.pathname.split("/").filter(Boolean).includes("photo");
  } catch {
    return false;
  }
}

function resolverPayloadSummary(payload: ResolverPayload) {
  return {
    status: payload.status,
    mediaType: payload.mediaType ?? "media",
    platform: payload.platform,
    hasMediaUrl: Boolean(payload.mediaUrl),
    mimeType: payload.mimeType,
    byteLength: payload.byteLength,
    durationSeconds: payload.durationSeconds,
    slideCount: Array.isArray(payload.slides) ? payload.slides.length : 0,
    hasAudio: Boolean(payload.audio),
    metadataKeys: payload.metadata ? Object.keys(payload.metadata).sort() : [],
  };
}

function resolverBaseUrl() {
  const value = process.env.MEDIA_RESOLVER_URL?.trim();
  if (!value) {
    throw new Error(
      "MEDIA_RESOLVER_URL is required for TikTok, Instagram, and Facebook URL analysis. Upload the clip or configure the media resolver."
    );
  }
  return value.replace(/\/$/, "");
}

function mediaResolverApiKey() {
  return process.env.MEDIA_RESOLVER_API_KEY?.trim();
}

function assertSupportedPlatform(platform: string) {
  if (MEDIA_URL_PLATFORMS.has(platform) || RESOLVER_PLATFORMS.has(platform)) return;
  throw new Error(
    "Direct URL analysis supports YouTube, TikTok, Instagram, Facebook, and direct video/audio file links. Upload this source for full analysis."
  );
}

function contentTypeForMediaUrl(urlValue: string, response: Response) {
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType) return contentType;
  if (/\.(mp3)(\?|$)/i.test(urlValue)) return "audio/mpeg";
  if (/\.(wav)(\?|$)/i.test(urlValue)) return "audio/wav";
  if (/\.(m4a)(\?|$)/i.test(urlValue)) return "audio/mp4";
  if (/\.(mov)(\?|$)/i.test(urlValue)) return "video/quicktime";
  if (/\.(webm)(\?|$)/i.test(urlValue)) return "video/webm";
  return "video/mp4";
}

function mediaFamily(mimeType?: string) {
  return mimeType?.split("/", 1)[0];
}

function resolvedMimeTypeForMediaUrl(args: {
  requestedMimeType?: string;
  response: Response;
  url: string;
}) {
  const responseMimeType = contentTypeForMediaUrl(args.url, args.response);
  if (
    args.requestedMimeType &&
    mediaFamily(args.requestedMimeType) === mediaFamily(responseMimeType)
  ) {
    return args.requestedMimeType;
  }
  if (args.requestedMimeType && mediaFamily(args.requestedMimeType) !== mediaFamily(responseMimeType)) {
    analysisWarn("fetch_media_mime_type_mismatch", {
      requestedMimeType: args.requestedMimeType,
      responseMimeType,
    });
  }
  return responseMimeType;
}

function fileNameFromUrl(urlValue: string, fallback: string) {
  try {
    const pathname = new URL(urlValue).pathname;
    const fileName = pathname.split("/").filter(Boolean).pop();
    return fileName ? decodeURIComponent(fileName).slice(0, 120) : fallback;
  } catch {
    return fallback;
  }
}

function checkExpectedSize(byteLength: number | undefined, maxBytes: number) {
  if (typeof byteLength === "number" && Number.isFinite(byteLength) && byteLength > maxBytes) {
    throw new Error("Resolved media is too large for analysis. Use a clip under 100 MB.");
  }
}

function checkTotalSize(parts: RemoteMediaPartForAnalysis[], maxBytes: number) {
  const totalBytes = parts.reduce((total, part) => total + part.byteLength, 0);
  if (totalBytes > maxBytes) {
    throw new Error("Resolved slideshow media is too large for analysis. Use a post under 100 MB.");
  }
}

async function fetchMediaBytes(args: {
  fileName?: string;
  label?: string;
  maxBytes: number;
  metadata?: Record<string, unknown>;
  mimeType?: string;
  requestHeaders?: Record<string, string>;
  url: string;
}): Promise<RemoteMediaPartForAnalysis> {
  const label = args.label ?? args.fileName ?? "remote-media";
  analysisLog("fetch_media_start", {
    label,
    fileName: args.fileName,
    mimeType: args.mimeType,
    hasRequestHeaders: Boolean(args.requestHeaders && Object.keys(args.requestHeaders).length),
  });

  const response = await fetch(args.url, {
    headers: {
      ...DEFAULT_MEDIA_HEADERS,
      ...args.requestHeaders,
    },
  });
  if (!response.ok) {
    analysisWarn("fetch_media_failed", {
      label,
      status: response.status,
      contentType: response.headers.get("content-type"),
    });
    throw new Error(`Could not fetch resolved media: ${response.status}`);
  }

  const expectedLength = Number(response.headers.get("content-length"));
  checkExpectedSize(Number.isFinite(expectedLength) ? expectedLength : undefined, args.maxBytes);

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > args.maxBytes) {
    analysisWarn("fetch_media_too_large", {
      label,
      byteLength: bytes.byteLength,
      maxBytes: args.maxBytes,
    });
    throw new Error("Resolved media is too large for analysis. Use a clip under 100 MB.");
  }

  const mimeType = resolvedMimeTypeForMediaUrl({
    requestedMimeType: args.mimeType,
    response,
    url: args.url,
  });
  analysisLog("fetch_media_complete", {
    label,
    byteLength: bytes.byteLength,
    expectedLength: Number.isFinite(expectedLength) ? expectedLength : undefined,
    mimeType,
    contentType: response.headers.get("content-type"),
  });

  return {
    bytes,
    byteLength: bytes.byteLength,
    fileName: args.fileName ?? fileNameFromUrl(args.url, "resolved-source.mp4"),
    mimeType,
    metadata: args.metadata,
  };
}

function asResolvedMedia(part: RemoteMediaPartForAnalysis): RemoteMediaForAnalysis {
  return {
    ...part,
    kind: "media",
  };
}

function assetUrl(asset: ResolverAssetPayload, label: string) {
  if (typeof asset.url !== "string" || !asset.url.startsWith("https://")) {
    throw new Error(`Media resolver returned an invalid ${label} URL`);
  }
  return asset.url;
}

async function fetchResolverAsset(args: {
  asset: ResolverAssetPayload;
  fallbackFileName: string;
  maxBytes: number;
}) {
  return await fetchMediaBytes({
    fileName: args.asset.fileName ?? args.fallbackFileName,
    label: args.fallbackFileName,
    maxBytes: args.maxBytes,
    metadata: args.asset.metadata,
    mimeType: args.asset.mimeType,
    requestHeaders: args.asset.requestHeaders,
    url: assetUrl(args.asset, args.fallbackFileName),
  });
}

async function resolveViaService(args: {
  maxBytes: number;
  sourcePlatform: string;
  sourceUrl: string;
}): Promise<RemoteMediaForAnalysis> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = mediaResolverApiKey();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  analysisLog("resolver_request_start", {
    sourcePlatform: args.sourcePlatform,
    sourceHost: sourceHostForLog(args.sourceUrl),
  });

  const response = await fetch(`${resolverBaseUrl()}/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      platform: args.sourcePlatform,
      url: args.sourceUrl,
    }),
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const detail = (payload as { detail?: { message?: string } | string })?.detail;
    const message = typeof detail === "string" ? detail : detail?.message;
    analysisWarn("resolver_request_failed", {
      status: response.status,
      message,
    });
    throw new Error(message ?? `Media resolver failed: ${response.status}`);
  }

  const resolved = payload as ResolverPayload;
  analysisLog("resolver_request_complete", resolverPayloadSummary(resolved));
  const expectedSlideshow = args.sourcePlatform === "tiktok" && isTikTokPhotoUrl(args.sourceUrl);

  if (resolved.status === "resolved" && resolved.mediaType === "slideshow") {
    if (!Array.isArray(resolved.slides) || !resolved.slides.length) {
      throw new Error("Media resolver returned no slideshow images");
    }
    if (resolved.slides.length > 40) {
      throw new Error("Resolved slideshow has too many images for analysis. Use a post with 40 slides or fewer.");
    }

    const slides: RemoteMediaPartForAnalysis[] = [];
    for (const [index, slide] of resolved.slides.entries()) {
      analysisLog("resolver_slideshow_slide_fetch", {
        index: index + 1,
        fileName: slide.fileName,
        mimeType: slide.mimeType,
        byteLength: slide.byteLength,
      });
      slides.push(await fetchResolverAsset({
        asset: slide,
        fallbackFileName: `slide-${index + 1}.jpg`,
        maxBytes: args.maxBytes,
      }));
      checkTotalSize(slides, args.maxBytes);
    }

    const audio = resolved.audio
      ? await fetchResolverAsset({
        asset: resolved.audio,
        fallbackFileName: "slideshow-audio.mp3",
        maxBytes: args.maxBytes,
      })
      : undefined;
    checkTotalSize(audio ? [...slides, audio] : slides, args.maxBytes);

    return {
      kind: "slideshow",
      slides,
      audio,
      metadata: {
        ...resolved.metadata,
        resolverPlatform: resolved.platform,
        resolverSourceUrl: resolved.sourceUrl,
        resolverMediaType: "slideshow",
      },
    };
  }

  if (resolved.status !== "resolved" || !resolved.mediaUrl) {
    throw new Error("Media resolver returned no downloadable media URL");
  }

  if (expectedSlideshow) {
    analysisWarn("resolver_tiktok_photo_returned_media", {
      mediaType: resolved.mediaType ?? "media",
      mimeType: resolved.mimeType,
      hasMediaUrl: Boolean(resolved.mediaUrl),
      byteLength: resolved.byteLength,
      durationSeconds: resolved.durationSeconds,
    });
    throw new Error(
      "TikTok photo post resolved as ordinary media instead of slide images. Refusing to analyze the attached sound as the slideshow."
    );
  }

  checkExpectedSize(resolved.byteLength, args.maxBytes);
  return asResolvedMedia(await fetchMediaBytes({
    fileName: resolved.fileName,
    label: "resolved-media",
    maxBytes: args.maxBytes,
    metadata: {
      ...resolved.metadata,
      durationSeconds: resolved.durationSeconds,
      resolverPlatform: resolved.platform,
      resolverSourceUrl: resolved.sourceUrl,
    },
    mimeType: resolved.mimeType,
    requestHeaders: resolved.requestHeaders,
    url: resolved.mediaUrl,
  }));
}

export async function fetchRemoteMediaForAnalysis(args: {
  maxBytes: number;
  sourcePlatform: string;
  sourceUrl: string;
}) {
  assertSupportedPlatform(args.sourcePlatform);

  if (MEDIA_URL_PLATFORMS.has(args.sourcePlatform)) {
    return asResolvedMedia(await fetchMediaBytes({
      label: "direct-file",
      maxBytes: args.maxBytes,
      url: args.sourceUrl,
    }));
  }

  return await resolveViaService(args);
}
