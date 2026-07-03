import {
  ProviderError,
  toProviderError,
  unsupportedProviderOperation,
} from "../errors";
import {
  registerPublishingProvider,
  type ListPublishingAccountsInput,
  type ListPublishingAccountsResult,
  type PublicationStatus,
  type PublicationStatusInput,
  type PublicationStatusResult,
  type PublishContentInput,
  type PublishContentResult,
  type PublishingProvider,
  type SyncMetricsInput,
  type SyncMetricsResult,
  type UploadMediaInput,
  type UploadedMedia,
} from "../publishing";
import {
  POSTIZ_PROVIDER,
  createDryRunId,
  encodeUploadData,
  isDryRunEnabled,
  postizRequest,
  toArrayBuffer,
} from "../postiz/client";

type PostizIntegration = {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  disabled?: boolean;
  profile?: string;
  customer?: {
    id?: string;
    name?: string;
  };
};

type PostizUploadResponse = {
  id: string;
  name: string;
  path: string;
  organizationId?: string;
  createdAt?: string;
  updatedAt?: string;
};

type PostizCreatePostResponse = Array<{
  postId: string;
  integration: string;
}>;

type PostizListPostsResponse = {
  posts?: Array<{
    id: string;
    content?: string;
    publishDate?: string;
    releaseURL?: string;
    state?: string;
    integration?: {
      id?: string;
      providerIdentifier?: string;
      name?: string;
      picture?: string;
    };
  }>;
};

type PostizAnalyticsPoint = {
  total?: string;
  date?: string;
};

type PostizAnalyticsSeries = {
  label?: string;
  data?: PostizAnalyticsPoint[];
  percentageChange?: number;
};

const DEFAULT_STATUS_LOOKBACK_DAYS = 90;
const DEFAULT_STATUS_LOOKAHEAD_DAYS = 90;
const DEFAULT_METRICS_LOOKBACK_DAYS = 30;

function paginateAccounts(
  accounts: ListPublishingAccountsResult["accounts"],
  input: ListPublishingAccountsInput
): ListPublishingAccountsResult {
  const startIndex = input.cursor ? Number.parseInt(input.cursor, 10) || 0 : 0;
  const limit = input.limit && input.limit > 0 ? input.limit : accounts.length;
  const paged = accounts.slice(startIndex, startIndex + limit);
  const nextIndex = startIndex + paged.length;

  return {
    accounts: paged,
    nextCursor: nextIndex < accounts.length ? String(nextIndex) : undefined,
    syncedAt: Date.now(),
    raw: accounts,
  };
}

function mapIntegrationToCapabilities(identifier: string): string[] {
  const shared = ["publish", "schedule", "upload_media"];
  const analyticsCapable = new Set([
    "x",
    "linkedin",
    "linkedin-page",
    "facebook",
    "instagram",
    "instagram-standalone",
    "threads",
    "youtube",
    "tiktok",
    "pinterest",
  ]);

  return analyticsCapable.has(identifier) ? [...shared, "analytics"] : shared;
}

function mapIntegrationToAccount(integration: PostizIntegration) {
  return {
    externalAccountId: integration.id,
    platform: integration.identifier,
    username: integration.profile || integration.name || integration.id,
    displayName: integration.name,
    avatarUrl: integration.picture,
    status: integration.disabled ? "disabled" : "connected",
    capabilities: mapIntegrationToCapabilities(integration.identifier),
    metadata: {
      customer: integration.customer,
      identifier: integration.identifier,
    },
  } as const;
}

function defaultSettingsForTarget(
  target: PublishContentInput["targets"][number]
): Record<string, unknown> {
  const providerType = target.platform ?? "unknown";

  if (providerType === "instagram") {
    return { __type: "instagram", post_type: "post" };
  }

  if (providerType === "instagram-standalone") {
    return { __type: "instagram-standalone", post_type: "post" };
  }

  if (providerType === "x") {
    return { __type: "x", who_can_reply_post: "everyone" };
  }

  if (providerType === "tiktok") {
    return {
      __type: "tiktok",
      privacy_level: "PUBLIC_TO_EVERYONE",
      duet: false,
      stitch: false,
      comment: true,
      autoAddMusic: "no",
      brand_content_toggle: false,
      brand_organic_toggle: false,
      content_posting_method: "DIRECT_POST",
    };
  }

  return { __type: providerType };
}

function buildCreatePostPayload(
  input: PublishContentInput,
  type: "schedule" | "now"
): Record<string, unknown> {
  const scheduledDate = new Date(input.publishAt ?? Date.now()).toISOString();
  const posts = input.targets.map((target) => {
    const images = (target.media?.length ? target.media : input.media).map((media) => ({
      id: media.externalMediaId,
      path: media.url,
    }));

    return {
      integration: { id: target.accountId },
      value: [
        {
          content: target.content ?? input.text ?? "",
          image: images,
        },
      ],
      settings: {
        ...defaultSettingsForTarget(target),
        ...(target.settings ?? {}),
      },
    };
  });

  return {
    type,
    date: scheduledDate,
    shortLink: input.shortLink ?? false,
    tags: (input.tags ?? []).map((tag) => ({ value: tag })),
    posts,
  };
}

function mapPostizStateToStatus(state?: string): PublicationStatus["status"] {
  switch (state?.toUpperCase()) {
    case "DRAFT":
      return "draft";
    case "QUEUE":
      return "scheduled";
    case "PENDING":
    case "PROCESSING":
    case "PUBLISHING":
      return "publishing";
    case "PUBLISHED":
    case "SUCCESS":
    case "SENT":
      return "published";
    case "ERROR":
    case "FAILED":
      return "failed";
    case "CANCELED":
    case "CANCELLED":
      return "canceled";
    default:
      return "publishing";
  }
}

function buildPostsRange(input?: Record<string, unknown>): {
  startDate: string;
  endDate: string;
} {
  const now = Date.now();
  const lookbackDays =
    typeof input?.lookbackDays === "number"
      ? input.lookbackDays
      : DEFAULT_STATUS_LOOKBACK_DAYS;
  const lookaheadDays =
    typeof input?.lookaheadDays === "number"
      ? input.lookaheadDays
      : DEFAULT_STATUS_LOOKAHEAD_DAYS;

  return {
    startDate: new Date(now - lookbackDays * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(now + lookaheadDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function metricLabelToField(
  label: string
): "views" | "likes" | "comments" | "shares" | "saves" | "clicks" | "followersGained" | null {
  const normalized = label.trim().toLowerCase();

  if (normalized === "likes") return "likes";
  if (normalized === "comments") return "comments";
  if (normalized === "shares") return "shares";
  if (normalized === "saves") return "saves";
  if (normalized === "clicks") return "clicks";
  if (normalized === "followers") return "followersGained";
  if (normalized === "views" || normalized === "impressions") return "views";
  return null;
}

async function listPostizAccounts(
  input: ListPublishingAccountsInput
): Promise<ListPublishingAccountsResult> {
  if (isDryRunEnabled()) {
    return paginateAccounts(
      [
        {
          externalAccountId: "dryrun_tiktok_1",
          platform: "tiktok",
          username: "dryrun-account",
          displayName: "Dry Run TikTok",
          status: "connected",
          capabilities: ["publish", "schedule", "upload_media", "analytics"],
        },
      ],
      input
    );
  }

  try {
    const integrations = await postizRequest<PostizIntegration[]>(
      "list_accounts",
      "/integrations",
      { method: "GET" }
    );
    const accounts = integrations
      .filter((integration) => input.includeInactive || !integration.disabled)
      .map(mapIntegrationToAccount);

    return paginateAccounts(accounts, input);
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POSTIZ_PROVIDER,
      operation: "list_accounts",
    });
  }
}

async function uploadPostizMedia(input: UploadMediaInput): Promise<UploadedMedia> {
  if (isDryRunEnabled()) {
    return {
      externalMediaId: createDryRunId("postiz_media"),
      url: `https://uploads.postiz.invalid/${encodeURIComponent(input.filename)}`,
      previewUrl: `https://uploads.postiz.invalid/${encodeURIComponent(input.filename)}`,
      metadata: {
        dryRun: true,
        mimeType: input.mimeType,
      },
    };
  }

  try {
    const form = new FormData();
    const bytes = encodeUploadData(input);
    form.append(
      "file",
      new Blob([toArrayBuffer(bytes)], { type: input.mimeType }),
      input.filename
    );

    const uploaded = await postizRequest<PostizUploadResponse>(
      "upload_media",
      "/upload",
      {
        method: "POST",
        body: form,
      }
    );

    return {
      externalMediaId: uploaded.id,
      url: uploaded.path,
      previewUrl: uploaded.path,
      metadata: uploaded,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POSTIZ_PROVIDER,
      operation: "upload_media",
    });
  }
}

async function publishWithPostiz(
  input: PublishContentInput,
  mode: "schedule" | "now"
): Promise<PublishContentResult> {
  if (input.targets.length === 0) {
    throw new ProviderError("Postiz requires at least one target account", {
      kind: "publishing",
      provider: POSTIZ_PROVIDER,
      operation: mode === "schedule" ? "schedule_post" : "publish_now",
      code: "validation",
    });
  }

  if (isDryRunEnabled()) {
    return {
      externalPostIds: input.targets.map(() => createDryRunId("postiz_post")),
      status: mode === "schedule" ? "scheduled" : "published",
      scheduledFor: mode === "schedule" ? input.publishAt : undefined,
      publishedAt: mode === "now" ? Date.now() : undefined,
      providerPayload: {
        dryRun: true,
        request: buildCreatePostPayload(input, mode),
      },
    };
  }

  try {
    const payload = buildCreatePostPayload(input, mode);
    const created = await postizRequest<PostizCreatePostResponse>(
      mode === "schedule" ? "schedule_post" : "publish_now",
      "/posts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    return {
      externalPostIds: created.map((post) => post.postId),
      status: mode === "schedule" ? "scheduled" : "published",
      scheduledFor: mode === "schedule" ? input.publishAt : undefined,
      publishedAt: mode === "now" ? Date.now() : undefined,
      providerPayload: created,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POSTIZ_PROVIDER,
      operation: mode === "schedule" ? "schedule_post" : "publish_now",
    });
  }
}

async function getPostizPublicationStatus(
  input: PublicationStatusInput
): Promise<PublicationStatusResult> {
  if (isDryRunEnabled()) {
    return {
      posts: input.externalPostIds.map((externalPostId) => ({
        externalPostId,
        status: "scheduled",
      })),
      checkedAt: Date.now(),
      raw: {
        dryRun: true,
      },
    };
  }

  try {
    const range = buildPostsRange(input.metadata);
    const query = new URLSearchParams({
      startDate: range.startDate,
      endDate: range.endDate,
    });
    const response = await postizRequest<PostizListPostsResponse>(
      "get_publication_status",
      `/posts?${query.toString()}`,
      { method: "GET" }
    );

    const postsById = new Map((response.posts ?? []).map((post) => [post.id, post]));
    const posts = input.externalPostIds.map((externalPostId) => {
      const post = postsById.get(externalPostId);
      if (!post) {
        return {
          externalPostId,
          status: "failed",
          errorMessage: "Post not found in Postiz within the queried date range.",
        } satisfies PublicationStatus;
      }

      return {
        externalPostId,
        status: mapPostizStateToStatus(post.state),
        publishedAt: post.publishDate ? Date.parse(post.publishDate) : undefined,
        permalinkUrl: post.releaseURL,
        raw: post,
      } satisfies PublicationStatus;
    });

    return {
      posts,
      checkedAt: Date.now(),
      raw: response,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POSTIZ_PROVIDER,
      operation: "get_publication_status",
    });
  }
}

async function syncPostizMetrics(
  input: SyncMetricsInput
): Promise<SyncMetricsResult> {
  if (isDryRunEnabled()) {
    return {
      metrics: input.externalPostIds.map((externalPostId) => ({
        externalPostId,
        metrics: {
          views: 100,
          likes: 12,
          comments: 3,
        },
        capturedAt: Date.now(),
        raw: {
          dryRun: true,
        },
      })),
      checkedAt: Date.now(),
      raw: {
        dryRun: true,
      },
    };
  }

  try {
    const lookbackDays =
      typeof input.metadata?.lookbackDays === "number"
        ? input.metadata.lookbackDays
        : DEFAULT_METRICS_LOOKBACK_DAYS;

    const metrics = await Promise.all(
      input.externalPostIds.map(async (externalPostId) => {
        const query = new URLSearchParams({
          date: String(lookbackDays),
        });
        const series = await postizRequest<PostizAnalyticsSeries[]>(
          "sync_metrics",
          `/analytics/post/${externalPostId}?${query.toString()}`,
          { method: "GET" }
        );

        const normalizedMetrics: Record<string, number> = {};
        let capturedAt = Date.now();

        for (const metricSeries of series) {
          const field = metricSeries.label ? metricLabelToField(metricSeries.label) : null;
          if (!field) continue;

          const latestPoint = metricSeries.data?.[metricSeries.data.length - 1];
          if (!latestPoint?.total) continue;

          normalizedMetrics[field] = Number(latestPoint.total) || 0;
          if (latestPoint.date) {
            capturedAt = Date.parse(latestPoint.date);
          }
        }

        return {
          externalPostId,
          metrics: {
            views: normalizedMetrics.views,
            likes: normalizedMetrics.likes,
            comments: normalizedMetrics.comments,
            shares: normalizedMetrics.shares,
            saves: normalizedMetrics.saves,
            clicks: normalizedMetrics.clicks,
            followersGained: normalizedMetrics.followersGained,
          },
          capturedAt,
          raw: series,
        };
      })
    );

    return {
      metrics,
      checkedAt: Date.now(),
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POSTIZ_PROVIDER,
      operation: "sync_metrics",
    });
  }
}

export const postizProvider: PublishingProvider = {
  provider: POSTIZ_PROVIDER,
  displayName: "Postiz",
  capabilities: {
    listAccounts: true,
    uploadMedia: true,
    draftPost: false,
    schedulePost: true,
    publishNow: true,
    readStatus: true,
    syncMetrics: true,
  },
  listAccounts: listPostizAccounts,
  uploadMedia: uploadPostizMedia,
  createDraft: async (_input) => {
    throw unsupportedProviderOperation(
      "publishing",
      POSTIZ_PROVIDER,
      "create_draft",
      "Postiz draft creation is not configured in Content Engine"
    );
  },
  schedulePost: (input) => publishWithPostiz(input, "schedule"),
  publishNow: (input) => publishWithPostiz(input, "now"),
  getPublicationStatus: getPostizPublicationStatus,
  syncMetrics: syncPostizMetrics,
};

registerPublishingProvider(postizProvider);
