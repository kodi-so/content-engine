import {
  ProviderError,
  toProviderError,
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
  type PublishingAccount,
  type PublishingProvider,
  type SyncMetricsInput,
  type SyncMetricsResult,
  type UploadMediaInput,
  type UploadedMedia,
} from "../publishing";
import {
  DEFAULT_PAGE_LIMIT,
  POST_BRIDGE_PROVIDER,
  SUPPORTED_UPLOAD_MIME_TYPES,
  createDryRunId,
  createPostBridgeHttpError,
  encodeUploadData,
  isDryRunEnabled,
  paginatedResult,
  postBridgeRequest,
  toArrayBuffer,
  type PostBridgePage,
  type PostBridgeUploadUrlResponse,
} from "../postBridge/client";

type PostBridgeSocialAccount = {
  id: number;
  avatarUrl?: string;
  avatar_url?: string;
  displayName?: string;
  display_name?: string;
  image?: string;
  image_url?: string;
  name?: string;
  picture?: string;
  profilePictureUrl?: string;
  profile_image_url?: string;
  profile_picture_url?: string;
  platform: string;
  username: string;
};

type PostBridgePost = {
  id: string;
  caption: string;
  status: "posted" | "scheduled" | "processing" | "failed";
  scheduled_at?: string | null;
  social_accounts: number[];
  media?: unknown;
  created_at?: string;
  updated_at?: string;
  is_draft: boolean;
  warnings?: string[];
};

type PostBridgePostResult = {
  id: string;
  post_id: string;
  success: boolean;
  social_account_id: number;
  error?: unknown;
  platform_data?: {
    id?: string;
    url?: string;
    username?: string;
  };
};

type PostBridgeAnalytics = {
  id: string;
  post_result_id: string;
  platform: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  last_synced_at?: string;
};

function mapPostBridgePlatform(platform: string): PublishingAccount["platform"] | null {
  if (platform === "twitter") return "x";
  if (
    platform === "tiktok" ||
    platform === "instagram" ||
    platform === "youtube" ||
    platform === "x" ||
    platform === "linkedin" ||
    platform === "facebook" ||
    platform === "threads" ||
    platform === "pinterest" ||
    platform === "bluesky" ||
    platform === "google_business"
  ) {
    return platform;
  }

  return null;
}

function firstString(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function mapPostBridgeAccount(account: PostBridgeSocialAccount): PublishingAccount | null {
  const platform = mapPostBridgePlatform(account.platform);
  if (!platform) return null;

  const displayName = firstString(
    account.displayName,
    account.display_name,
    account.name,
    account.username
  );
  const avatarUrl = firstString(
    account.avatarUrl,
    account.avatar_url,
    account.profilePictureUrl,
    account.profile_picture_url,
    account.profile_image_url,
    account.picture,
    account.image_url,
    account.image
  );

  return {
    externalAccountId: String(account.id),
    platform,
    username: account.username,
    displayName,
    avatarUrl,
    status: "connected",
    capabilities: ["publish", "schedule", "draft", "upload_media", "analytics"],
    metadata: {
      postBridgePlatform: account.platform,
      raw: account,
    },
  };
}

function accountIdForTarget(accountId: string): number {
  const numericId = Number(accountId);
  if (!Number.isFinite(numericId)) {
    throw new ProviderError("PostBridge social account IDs must be numeric", {
      kind: "publishing",
      provider: POST_BRIDGE_PROVIDER,
      operation: "create_post",
      code: "validation",
      details: { accountId },
    });
  }

  return numericId;
}

function mapPostBridgePostStatus(post: PostBridgePost): PublicationStatus["status"] {
  if (post.is_draft) return "draft";

  switch (post.status) {
    case "posted":
      return "published";
    case "scheduled":
      return "scheduled";
    case "processing":
      return "publishing";
    case "failed":
      return "failed";
    default:
      return "publishing";
  }
}

function statusForCreatedPost(
  post: PostBridgePost,
  mode: "draft" | "schedule" | "now"
): PublishContentResult["status"] {
  if (mode === "draft") return "draft";
  if (mode === "schedule") return "scheduled";
  return mapPostBridgePostStatus(post);
}

function buildCreatePostPayload(
  input: PublishContentInput,
  mode: "draft" | "schedule" | "now"
): Record<string, unknown> {
  const mediaIds = input.media.map((media) => media.externalMediaId);
  const mediaUrls = input.media.flatMap((media) => media.url ? [media.url] : []);

  return {
    caption: input.text ?? "",
    social_accounts: input.targets.map((target) => accountIdForTarget(target.accountId)),
    ...(mode === "schedule" && input.publishAt
      ? { scheduled_at: new Date(input.publishAt).toISOString() }
      : {}),
    ...(mode === "draft" ? { is_draft: true } : {}),
    ...(mediaIds.length ? { media: mediaIds } : {}),
    ...(!mediaIds.length && mediaUrls.length ? { media_urls: mediaUrls } : {}),
    processing_enabled: input.metadata?.processingEnabled ?? true,
    ...(input.metadata?.platformConfigurations
      ? { platform_configurations: input.metadata.platformConfigurations }
      : {}),
    ...(input.targets.some((target) => target.content || target.media?.length)
      ? {
          account_configurations: {
            account_configurations: input.targets.map((target) => ({
              account_id: accountIdForTarget(target.accountId),
              ...(target.content ? { caption: target.content } : {}),
              ...(target.media?.length
                ? { media: target.media.map((media) => media.externalMediaId) }
                : {}),
            })),
          },
        }
      : {}),
  };
}

function pageQuery(input: ListPublishingAccountsInput) {
  return new URLSearchParams({
    offset: input.cursor ?? "0",
    limit: String(input.limit && input.limit > 0 ? input.limit : DEFAULT_PAGE_LIMIT),
  });
}

async function listPostBridgeAccounts(
  input: ListPublishingAccountsInput
): Promise<ListPublishingAccountsResult> {
  if (isDryRunEnabled()) {
    return {
      accounts: [
        {
          externalAccountId: "1001",
          platform: "tiktok",
          username: "postbridge-tiktok",
          displayName: "PostBridge TikTok",
          status: "connected",
          capabilities: ["publish", "schedule", "draft", "upload_media", "analytics"],
        },
        {
          externalAccountId: "1002",
          platform: "instagram",
          username: "postbridge-instagram",
          displayName: "PostBridge Instagram",
          status: "connected",
          capabilities: ["publish", "schedule", "draft", "upload_media", "analytics"],
        },
      ],
      syncedAt: Date.now(),
      raw: { dryRun: true },
    };
  }

  try {
    const response = await postBridgeRequest<PostBridgePage<PostBridgeSocialAccount>>(
      "list_accounts",
      `/social-accounts?${pageQuery(input).toString()}`,
      { method: "GET" }
    );
    return {
      accounts: response.data
        .map(mapPostBridgeAccount)
        .filter((account): account is PublishingAccount => account !== null),
      ...paginatedResult(response, input),
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POST_BRIDGE_PROVIDER,
      operation: "list_accounts",
    });
  }
}

async function uploadPostBridgeMedia(input: UploadMediaInput): Promise<UploadedMedia> {
  if (!SUPPORTED_UPLOAD_MIME_TYPES.has(input.mimeType)) {
    throw new ProviderError(
      `PostBridge media upload does not support ${input.mimeType}`,
      {
        kind: "publishing",
        provider: POST_BRIDGE_PROVIDER,
        operation: "upload_media",
        code: "validation",
        details: {
          supportedMimeTypes: [...SUPPORTED_UPLOAD_MIME_TYPES],
        },
      }
    );
  }

  const bytes = encodeUploadData(input);

  if (isDryRunEnabled()) {
    return {
      externalMediaId: createDryRunId("postbridge_media"),
      metadata: {
        dryRun: true,
        filename: input.filename,
        mimeType: input.mimeType,
        byteLength: bytes.byteLength,
      },
    };
  }

  try {
    const upload = await postBridgeRequest<PostBridgeUploadUrlResponse>(
      "create_upload_url",
      "/media/create-upload-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.filename,
          mime_type: input.mimeType,
          size_bytes: bytes.byteLength,
        }),
      }
    );

    const uploadResponse = await fetch(upload.upload_url, {
      method: "PUT",
      headers: { "Content-Type": input.mimeType },
      body: new Blob([toArrayBuffer(bytes)], { type: input.mimeType }),
    });

    if (!uploadResponse.ok) {
      throw createPostBridgeHttpError(
        "upload_media",
        uploadResponse.status,
        await uploadResponse.text()
      );
    }

    return {
      externalMediaId: upload.media_id,
      metadata: upload,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POST_BRIDGE_PROVIDER,
      operation: "upload_media",
    });
  }
}

async function createPostBridgePost(
  input: PublishContentInput,
  mode: "draft" | "schedule" | "now"
): Promise<PublishContentResult> {
  if (input.targets.length === 0) {
    throw new ProviderError("PostBridge requires at least one target account", {
      kind: "publishing",
      provider: POST_BRIDGE_PROVIDER,
      operation: "create_post",
      code: "validation",
    });
  }

  if (mode === "schedule" && !input.publishAt) {
    throw new ProviderError("PostBridge scheduled posts require a publish time", {
      kind: "publishing",
      provider: POST_BRIDGE_PROVIDER,
      operation: "schedule_post",
      code: "validation",
    });
  }

  const payload = buildCreatePostPayload(input, mode);

  if (isDryRunEnabled()) {
    const externalPostId = createDryRunId("postbridge_post");
    return {
      externalPostIds: [externalPostId],
      status: mode === "draft" ? "draft" : mode === "schedule" ? "scheduled" : "published",
      scheduledFor: mode === "schedule" ? input.publishAt : undefined,
      publishedAt: mode === "now" ? Date.now() : undefined,
      providerPayload: {
        dryRun: true,
        request: payload,
      },
    };
  }

  try {
    const created = await postBridgeRequest<PostBridgePost>(
      mode === "draft"
        ? "create_draft"
        : mode === "schedule"
          ? "schedule_post"
          : "publish_now",
      "/posts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    return {
      externalPostIds: [created.id],
      status: statusForCreatedPost(created, mode),
      scheduledFor: mode === "schedule" ? input.publishAt : undefined,
      publishedAt: mapPostBridgePostStatus(created) === "published" ? Date.now() : undefined,
      providerPayload: created,
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POST_BRIDGE_PROVIDER,
      operation: mode === "draft" ? "create_draft" : mode === "schedule" ? "schedule_post" : "publish_now",
    });
  }
}

async function getPostBridgePublicationStatus(
  input: PublicationStatusInput
): Promise<PublicationStatusResult> {
  if (isDryRunEnabled()) {
    return {
      posts: input.externalPostIds.map((externalPostId) => ({
        externalPostId,
        status: "published",
      })),
      checkedAt: Date.now(),
      raw: { dryRun: true },
    };
  }

  try {
    const posts = await Promise.all(
      input.externalPostIds.map(async (externalPostId) => {
        const post = await postBridgeRequest<PostBridgePost>(
          "get_publication_status",
          `/posts/${encodeURIComponent(externalPostId)}`,
          { method: "GET" }
        );

        return {
          externalPostId,
          status: mapPostBridgePostStatus(post),
          publishedAt: post.status === "posted" && post.updated_at
            ? Date.parse(post.updated_at)
            : undefined,
          raw: post,
        } satisfies PublicationStatus;
      })
    );

    return {
      posts,
      checkedAt: Date.now(),
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POST_BRIDGE_PROVIDER,
      operation: "get_publication_status",
    });
  }
}

async function postResultsForPostId(postId: string) {
  const query = new URLSearchParams({
    offset: "0",
    limit: String(DEFAULT_PAGE_LIMIT),
  });
  query.append("post_id", postId);

  return await postBridgeRequest<PostBridgePage<PostBridgePostResult>>(
    "list_post_results",
    `/post-results?${query.toString()}`,
    { method: "GET" }
  );
}

async function analyticsForPostResultId(postResultId: string) {
  const query = new URLSearchParams({
    offset: "0",
    limit: "1",
    timeframe: "all",
  });
  query.append("post_result_id", postResultId);

  return await postBridgeRequest<PostBridgePage<PostBridgeAnalytics>>(
    "sync_metrics",
    `/analytics?${query.toString()}`,
    { method: "GET" }
  );
}

async function syncPostBridgeMetrics(input: SyncMetricsInput): Promise<SyncMetricsResult> {
  if (isDryRunEnabled()) {
    return {
      metrics: input.externalPostIds.map((externalPostId) => ({
        externalPostId,
        metrics: {
          views: 100,
          likes: 12,
          comments: 3,
          shares: 2,
        },
        capturedAt: Date.now(),
        raw: { dryRun: true },
      })),
      checkedAt: Date.now(),
      raw: { dryRun: true },
    };
  }

  try {
    if (input.metadata?.syncFirst === true) {
      await postBridgeRequest<unknown>(
        "trigger_analytics_sync",
        "/analytics/sync",
        { method: "POST" }
      );
    }

    const metrics = (
      await Promise.all(
        input.externalPostIds.map(async (externalPostId) => {
          const postResults = await postResultsForPostId(externalPostId);
          const resultMetrics = await Promise.all(
            postResults.data.map(async (postResult) => {
              const analyticsPage = await analyticsForPostResultId(postResult.id);
              const analytics = analyticsPage.data[0];
              if (!analytics) return null;

              return {
                externalPostId,
                metrics: {
                  views: analytics.view_count,
                  likes: analytics.like_count,
                  comments: analytics.comment_count,
                  shares: analytics.share_count,
                },
                capturedAt: analytics.last_synced_at
                  ? Date.parse(analytics.last_synced_at)
                  : Date.now(),
                raw: {
                  postResult,
                  analytics,
                },
              };
            })
          );

          return resultMetrics.filter((metric): metric is NonNullable<typeof metric> => metric !== null);
        })
      )
    ).flat();

    return {
      metrics,
      checkedAt: Date.now(),
    };
  } catch (error) {
    throw toProviderError(error, {
      kind: "publishing",
      provider: POST_BRIDGE_PROVIDER,
      operation: "sync_metrics",
    });
  }
}

export const postBridgePublishingProvider: PublishingProvider = {
  provider: POST_BRIDGE_PROVIDER,
  displayName: "PostBridge",
  capabilities: {
    listAccounts: true,
    uploadMedia: true,
    draftPost: true,
    schedulePost: true,
    publishNow: true,
    readStatus: true,
    syncMetrics: true,
  },
  listAccounts: listPostBridgeAccounts,
  uploadMedia: uploadPostBridgeMedia,
  createDraft: (input) => createPostBridgePost(input, "draft"),
  schedulePost: (input) => createPostBridgePost(input, "schedule"),
  publishNow: (input) => createPostBridgePost(input, "now"),
  getPublicationStatus: getPostBridgePublicationStatus,
  syncMetrics: syncPostBridgeMetrics,
};

registerPublishingProvider(postBridgePublishingProvider);
