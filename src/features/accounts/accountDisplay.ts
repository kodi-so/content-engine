import type { Doc } from "../../../convex/_generated/dataModel";
import { publishingRouteForProvider } from "../../lib/publishingRouting";
import type { Platform } from "../../types";

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X / Twitter",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  threads: "Threads",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
  google_business: "Google Business",
};

export const ACCOUNT_CREATION_PLATFORMS: Platform[] = [
  "tiktok",
  "instagram",
  "youtube",
  "x",
  "facebook",
];

export type SocialAccount = Doc<"socialAccounts">;
export type PostMetric = Doc<"postMetrics">;

export type AccountMetrics = {
  clicks: number;
  impressions: number;
  posts: number;
};

export type AccountCredentials = {
  email?: string;
  password?: string;
};

export const EMPTY_METRICS: AccountMetrics = {
  clicks: 0,
  impressions: 0,
  posts: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function credentialsForAccount(account: SocialAccount): AccountCredentials {
  const metadata = isRecord(account.metadata) ? account.metadata : {};
  const credentials = isRecord(metadata.credentials) ? metadata.credentials : {};
  const email = typeof credentials.email === "string" ? credentials.email : undefined;
  const password = typeof credentials.password === "string" ? credentials.password : undefined;

  return { email, password };
}

export function aggregateMetricsByAccount(metrics: PostMetric[] | undefined) {
  const aggregates = new Map<string, AccountMetrics & { postIds: Set<string> }>();

  for (const metric of metrics ?? []) {
    const accountId = String(metric.socialAccountId);
    const current = aggregates.get(accountId) ?? {
      clicks: 0,
      impressions: 0,
      posts: 0,
      postIds: new Set<string>(),
    };
    current.postIds.add(metric.externalPostId);
    current.clicks += metric.metrics.clicks ?? 0;
    current.impressions += metric.metrics.views ?? 0;
    current.posts = current.postIds.size;
    aggregates.set(accountId, current);
  }

  return new Map(
    Array.from(aggregates, ([accountId, aggregate]) => [
      accountId,
      {
        clicks: aggregate.clicks,
        impressions: aggregate.impressions,
        posts: aggregate.posts,
      },
    ])
  );
}

export function formatMetric(value: number) {
  return value.toLocaleString();
}

export function platformLabel(platform: Platform) {
  return PLATFORM_LABELS[platform] ?? platform;
}

export function providerLabel(account: SocialAccount) {
  if (account.provider === "manual") return "Not linked";
  return publishingRouteForProvider(account.provider).label;
}

function cleanAccountHandle(username: string) {
  return username.trim().replace(/^@+/, "").replace(/\/+$/, "");
}

function firstMetadataUrl(...records: Array<Record<string, unknown> | undefined>) {
  const keys = [
    "profileUrl",
    "profile_url",
    "accountUrl",
    "account_url",
    "externalUrl",
    "external_url",
    "permalinkUrl",
    "permalink_url",
    "link",
    "url",
  ];

  for (const record of records) {
    if (!record) continue;

    for (const key of keys) {
      const value = record[key];
      if (typeof value !== "string") continue;

      try {
        const url = new URL(value.trim());
        if (url.protocol === "https:" || url.protocol === "http:") {
          return url.toString();
        }
      } catch {
        // Ignore provider metadata that is not already a complete URL.
      }
    }
  }

  return undefined;
}

export function accountProfileUrl(account: SocialAccount) {
  const metadata = isRecord(account.metadata) ? account.metadata : undefined;
  const raw = isRecord(metadata?.raw) ? metadata.raw : undefined;
  const metadataUrl = firstMetadataUrl(metadata, raw);
  if (metadataUrl) return metadataUrl;

  const handle = cleanAccountHandle(account.username);
  if (!handle) return undefined;

  switch (account.platform) {
    case "tiktok":
      return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
    case "instagram":
      return `https://www.instagram.com/${encodeURIComponent(handle)}`;
    case "youtube":
      return `https://www.youtube.com/@${encodeURIComponent(handle)}`;
    case "x":
      return `https://x.com/${encodeURIComponent(handle)}`;
    case "linkedin":
      return metadata?.identifier === "linkedin-page"
        ? `https://www.linkedin.com/company/${encodeURIComponent(handle)}`
        : `https://www.linkedin.com/in/${encodeURIComponent(handle)}`;
    case "facebook":
      return `https://www.facebook.com/${encodeURIComponent(handle)}`;
    case "threads":
      return `https://www.threads.net/@${encodeURIComponent(handle)}`;
    case "pinterest":
      return `https://www.pinterest.com/${encodeURIComponent(handle)}`;
    case "bluesky":
      return `https://bsky.app/profile/${encodeURIComponent(handle)}`;
    default:
      return undefined;
  }
}

export function statusLabel(account: SocialAccount) {
  if (account.provider === "manual") return "Not linked";
  if (account.status === "connected") return "Linked";
  if (account.status === "needs_attention") return "Needs login";
  if (account.status === "disabled") return "Disabled";
  return "Needs link";
}

export function statusClassName(account: SocialAccount) {
  if (account.provider === "manual") {
    return "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-muted)]";
  }
  if (account.status === "connected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (account.status === "needs_attention") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (account.status === "disabled") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-muted)]";
}
