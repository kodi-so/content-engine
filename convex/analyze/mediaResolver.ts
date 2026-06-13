type ResolverPayload = {
  status?: string;
  platform?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  byteLength?: number;
  durationSeconds?: number;
  requestHeaders?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type RemoteMediaForAnalysis = {
  byteLength: number;
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
};

const MEDIA_URL_PLATFORMS = new Set(["direct_file"]);
const RESOLVER_PLATFORMS = new Set(["tiktok", "instagram", "facebook"]);
const DEFAULT_MEDIA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "video/*,audio/*,*/*;q=0.8",
};

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

async function fetchMediaBytes(args: {
  fileName?: string;
  maxBytes: number;
  metadata?: Record<string, unknown>;
  mimeType?: string;
  requestHeaders?: Record<string, string>;
  url: string;
}): Promise<RemoteMediaForAnalysis> {
  const response = await fetch(args.url, {
    headers: {
      ...DEFAULT_MEDIA_HEADERS,
      ...args.requestHeaders,
    },
  });
  if (!response.ok) {
    throw new Error(`Could not fetch resolved media: ${response.status}`);
  }

  const expectedLength = Number(response.headers.get("content-length"));
  checkExpectedSize(Number.isFinite(expectedLength) ? expectedLength : undefined, args.maxBytes);

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > args.maxBytes) {
    throw new Error("Resolved media is too large for analysis. Use a clip under 100 MB.");
  }

  return {
    bytes,
    byteLength: bytes.byteLength,
    fileName: args.fileName ?? fileNameFromUrl(args.url, "resolved-source.mp4"),
    mimeType: args.mimeType ?? contentTypeForMediaUrl(args.url, response),
    metadata: args.metadata,
  };
}

async function resolveViaService(args: {
  maxBytes: number;
  sourcePlatform: string;
  sourceUrl: string;
}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = mediaResolverApiKey();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

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
    throw new Error(message ?? `Media resolver failed: ${response.status}`);
  }

  const resolved = payload as ResolverPayload;
  if (resolved.status !== "resolved" || !resolved.mediaUrl) {
    throw new Error("Media resolver returned no downloadable media URL");
  }

  checkExpectedSize(resolved.byteLength, args.maxBytes);
  return await fetchMediaBytes({
    fileName: resolved.fileName,
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
  });
}

export async function fetchRemoteMediaForAnalysis(args: {
  maxBytes: number;
  sourcePlatform: string;
  sourceUrl: string;
}) {
  assertSupportedPlatform(args.sourcePlatform);

  if (MEDIA_URL_PLATFORMS.has(args.sourcePlatform)) {
    return await fetchMediaBytes({
      maxBytes: args.maxBytes,
      url: args.sourceUrl,
    });
  }

  return await resolveViaService(args);
}
