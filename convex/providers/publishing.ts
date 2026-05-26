import { unsupportedProviderOperation } from "./errors";

export type PublishingProviderName =
  | "postiz"
  | "post_bridge"
  | "manual";

export type PublishingOperationStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "canceled";

export interface PublishingProviderCapabilities {
  listAccounts: boolean;
  uploadMedia: boolean;
  schedulePost: boolean;
  publishNow: boolean;
  readStatus: boolean;
  syncMetrics: boolean;
}

export interface PublishingAccount {
  externalAccountId: string;
  platform: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  status: "connected" | "disconnected" | "needs_attention" | "disabled";
  capabilities?: string[];
  metadata?: unknown;
}

export interface ListPublishingAccountsInput {
  cursor?: string;
  limit?: number;
  includeInactive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ListPublishingAccountsResult {
  accounts: PublishingAccount[];
  nextCursor?: string;
  syncedAt: number;
  raw?: unknown;
}

export interface UploadMediaInput {
  filename: string;
  mimeType: string;
  data: string | Uint8Array | ArrayBuffer;
  encoding?: "base64" | "utf8";
  metadata?: Record<string, unknown>;
}

export interface UploadedMedia {
  externalMediaId: string;
  url?: string;
  previewUrl?: string;
  metadata?: unknown;
}

export interface PublishingTarget {
  accountId: string;
  platform?: string;
  content?: string;
  media?: UploadedMedia[];
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PublishContentInput {
  targets: PublishingTarget[];
  text?: string;
  media: UploadedMedia[];
  publishAt?: number;
  timezone?: string;
  idempotencyKey?: string;
  shortLink?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface PublishContentResult {
  externalPostIds: string[];
  status: PublishingOperationStatus;
  scheduledFor?: number;
  publishedAt?: number;
  providerPayload?: unknown;
}

export interface PublicationStatusInput {
  externalPostIds: string[];
  metadata?: Record<string, unknown>;
}

export interface PublicationStatus {
  externalPostId: string;
  status: PublishingOperationStatus;
  publishedAt?: number;
  failedAt?: number;
  permalinkUrl?: string;
  errorMessage?: string;
  raw?: unknown;
}

export interface PublicationStatusResult {
  posts: PublicationStatus[];
  checkedAt: number;
  raw?: unknown;
}

export interface SyncMetricsInput {
  externalPostIds: string[];
  metadata?: Record<string, unknown>;
}

export interface SyncedPostMetrics {
  externalPostId: string;
  metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    clicks?: number;
    followersGained?: number;
  };
  capturedAt: number;
  raw?: unknown;
}

export interface SyncMetricsResult {
  metrics: SyncedPostMetrics[];
  checkedAt: number;
  raw?: unknown;
}

export interface PublishingProvider {
  readonly provider: PublishingProviderName;
  readonly displayName: string;
  readonly capabilities: PublishingProviderCapabilities;
  listAccounts(input: ListPublishingAccountsInput): Promise<ListPublishingAccountsResult>;
  uploadMedia(input: UploadMediaInput): Promise<UploadedMedia>;
  schedulePost(input: PublishContentInput): Promise<PublishContentResult>;
  publishNow(input: PublishContentInput): Promise<PublishContentResult>;
  getPublicationStatus(input: PublicationStatusInput): Promise<PublicationStatusResult>;
  syncMetrics(input: SyncMetricsInput): Promise<SyncMetricsResult>;
}

const publishingProviders = new Map<PublishingProviderName, PublishingProvider>();

export function registerPublishingProvider(provider: PublishingProvider): void {
  publishingProviders.set(provider.provider, provider);
}

export function getPublishingProvider(
  providerName: PublishingProviderName
): PublishingProvider {
  const provider = publishingProviders.get(providerName);
  if (!provider) {
    throw unsupportedProviderOperation(
      "publishing",
      providerName,
      "load_provider",
      `${providerName} publishing adapter has not been registered yet`
    );
  }

  return provider;
}

export function listRegisteredPublishingProviders(): PublishingProviderName[] {
  return Array.from(publishingProviders.keys());
}
