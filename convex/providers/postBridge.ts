import { unsupportedProviderOperation } from "./errors";
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
  type UploadMediaInput,
  type UploadedMedia,
} from "./publishing";

export const postBridgePublishingProvider: PublishingProvider = {
  provider: "post_bridge",
  displayName: "Post Bridge",
  capabilities: {
    listAccounts: false,
    uploadMedia: false,
    schedulePost: false,
    publishNow: false,
    readStatus: false,
    syncMetrics: false,
  },
  async listAccounts(_input: ListPublishingAccountsInput): Promise<ListPublishingAccountsResult> {
    throw unsupportedProviderOperation(
      "publishing",
      "post_bridge",
      "list_accounts",
      "Post Bridge publishing is reserved in the routing layer but no adapter has been configured yet"
    );
  },
  async uploadMedia(_input: UploadMediaInput): Promise<UploadedMedia> {
    throw unsupportedProviderOperation(
      "publishing",
      "post_bridge",
      "upload_media",
      "Post Bridge media upload is not implemented yet"
    );
  },
  async schedulePost(_input: PublishContentInput): Promise<PublishContentResult> {
    throw unsupportedProviderOperation(
      "publishing",
      "post_bridge",
      "schedule_post",
      "Post Bridge scheduling is not implemented yet"
    );
  },
  async publishNow(_input: PublishContentInput): Promise<PublishContentResult> {
    throw unsupportedProviderOperation(
      "publishing",
      "post_bridge",
      "publish_now",
      "Post Bridge publishing is not implemented yet"
    );
  },
  async getPublicationStatus(_input: PublicationStatusInput): Promise<PublicationStatusResult> {
    throw unsupportedProviderOperation(
      "publishing",
      "post_bridge",
      "read_status",
      "Post Bridge status sync is not implemented yet"
    );
  },
  async syncMetrics(_input: SyncMetricsInput): Promise<SyncMetricsResult> {
    throw unsupportedProviderOperation(
      "publishing",
      "post_bridge",
      "sync_metrics",
      "Post Bridge metrics sync is not implemented yet"
    );
  },
};

registerPublishingProvider(postBridgePublishingProvider);
