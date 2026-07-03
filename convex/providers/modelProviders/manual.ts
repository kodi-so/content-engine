import {
  registerPublishingProvider,
  type ListPublishingAccountsInput,
  type ListPublishingAccountsResult,
  type PublicationStatusInput,
  type PublicationStatusResult,
  type PublishContentInput,
  type PublishContentResult,
  type PublishingProvider,
  type SyncMetricsInput,
  type SyncMetricsResult,
  type UploadedMedia,
  type UploadMediaInput,
} from "../publishing";

function manualId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const manualPublishingProvider: PublishingProvider = {
  provider: "manual",
  displayName: "Manual export",
  capabilities: {
    listAccounts: false,
    uploadMedia: true,
    draftPost: true,
    schedulePost: false,
    publishNow: true,
    readStatus: true,
    syncMetrics: false,
  },
  async listAccounts(_input: ListPublishingAccountsInput): Promise<ListPublishingAccountsResult> {
    return {
      accounts: [],
      syncedAt: Date.now(),
    };
  },
  async uploadMedia(input: UploadMediaInput): Promise<UploadedMedia> {
    return {
      externalMediaId: manualId("manual_media"),
      metadata: {
        filename: input.filename,
        mimeType: input.mimeType,
        byteLength:
          typeof input.data === "string"
            ? input.data.length
            : input.data.byteLength,
      },
    };
  },
  async schedulePost(_input: PublishContentInput): Promise<PublishContentResult> {
    throw new Error("Manual export does not support scheduling");
  },
  async createDraft(input: PublishContentInput): Promise<PublishContentResult> {
    return {
      externalPostIds: [],
      status: "draft",
      providerPayload: {
        provider: "manual",
        source: input.metadata?.source,
        slideshowId: input.metadata?.slideshowId,
        distributionPlanId: input.metadata?.distributionPlanId,
        note: "Created a manual draft distribution plan in Content Engine.",
        mediaCount: input.media.length,
      },
    };
  },
  async publishNow(input: PublishContentInput): Promise<PublishContentResult> {
    return {
      externalPostIds: input.targets.length
        ? input.targets.map(() => manualId("manual_post"))
        : [manualId("manual_post")],
      status: "published",
      publishedAt: Date.now(),
      providerPayload: {
        provider: "manual",
        source: input.metadata?.source,
        slideshowId: input.metadata?.slideshowId,
        distributionPlanId: input.metadata?.distributionPlanId,
        note: "Marked as manually published from Content Engine.",
        mediaCount: input.media.length,
      },
    };
  },
  async getPublicationStatus(input: PublicationStatusInput): Promise<PublicationStatusResult> {
    return {
      posts: input.externalPostIds.map((externalPostId) => ({
        externalPostId,
        status: "published",
      })),
      checkedAt: Date.now(),
    };
  },
  async syncMetrics(_input: SyncMetricsInput): Promise<SyncMetricsResult> {
    return {
      metrics: [],
      checkedAt: Date.now(),
    };
  },
};

registerPublishingProvider(manualPublishingProvider);
