import { v } from "convex/values";
import { internalAction, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * TikTok Analytics API Integration
 *
 * Uses TikTok's Display API to sync and fetch video metrics:
 * - /v2/video/list/ - List all user's videos (requires video.list scope)
 * - /v2/video/query/ - Get detailed video info by ID
 *
 * Rate limits:
 * - /v2/video/list/: 600 requests/day per user
 * - /v2/video/query/: 600 requests/day per user, max 20 video IDs per request
 */

// Fields to request from TikTok video API
const VIDEO_FIELDS = [
  "id",
  "title",
  "video_description",
  "cover_image_url",
  "embed_link",
  "share_url",
  "view_count",
  "like_count",
  "comment_count",
  "share_count",
  "create_time",
  "duration",
].join(",");

interface TikTokVideo {
  id: string;
  title?: string;
  video_description?: string;
  cover_image_url?: string;
  embed_link?: string;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  create_time?: number;
  duration?: number;
}

// ============ Video Sync ============

/**
 * Sync all videos from a TikTok account
 * Fetches the user's video list and upserts into postedContent
 */
export const syncAccountVideos = internalAction({
  args: {
    accountId: v.id("accounts"),
    maxVideos: v.optional(v.number()), // Limit for testing, default unlimited
  },
  handler: async (ctx, args): Promise<{ success: boolean; synced: number; error?: string }> => {
    // Get account info
    const account = await ctx.runQuery(internal.analytics.getAccountInternal, {
      accountId: args.accountId,
    });

    if (!account) {
      return { success: false, synced: 0, error: "Account not found" };
    }

    // Get valid access token
    const tokenResult = await ctx.runAction(internal.accounts.getValidAccessToken, {
      accountId: args.accountId,
    });

    if (!tokenResult.token) {
      return { success: false, synced: 0, error: tokenResult.error || "Failed to get access token" };
    }

    try {
      const allVideos: TikTokVideo[] = [];
      let cursor: number | undefined;
      let hasMore = true;
      const maxVideos = args.maxVideos || 1000; // Safety limit

      // Paginate through all videos
      while (hasMore && allVideos.length < maxVideos) {
        const response = await fetch(
          `https://open.tiktokapis.com/v2/video/list/?fields=${VIDEO_FIELDS}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokenResult.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              max_count: 20, // Max per request
              ...(cursor ? { cursor } : {}),
            }),
          }
        );

        const data = await response.json();

        if (data.error?.code !== "ok") {
          // If we already have some videos, just stop paginating
          if (allVideos.length > 0) {
            break;
          }
          return {
            success: false,
            synced: 0,
            error: data.error?.message || "Failed to fetch video list",
          };
        }

        const videos = data.data?.videos || [];
        allVideos.push(...videos);

        hasMore = data.data?.has_more || false;
        cursor = data.data?.cursor;

        // Safety: don't loop forever
        if (!hasMore || !cursor) break;
      }

      console.log(`Fetched ${allVideos.length} videos from TikTok for account ${account.username}`);

      // Upsert each video into postedContent
      let synced = 0;
      for (const video of allVideos) {
        await ctx.runMutation(internal.analytics.upsertVideo, {
          userId: account.userId,
          accountId: args.accountId,
          video: {
            id: video.id,
            title: video.title,
            description: video.video_description,
            coverImageUrl: video.cover_image_url,
            embedLink: video.embed_link,
            shareUrl: video.share_url,
            viewCount: video.view_count || 0,
            likeCount: video.like_count || 0,
            commentCount: video.comment_count || 0,
            shareCount: video.share_count || 0,
            createTime: video.create_time,
            duration: video.duration,
          },
        });
        synced++;
      }

      return { success: true, synced };
    } catch (err) {
      console.error("Error syncing account videos:", err);
      return {
        success: false,
        synced: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

/**
 * Sync videos for all connected TikTok accounts
 */
export const syncAllAccounts = internalAction({
  handler: async (ctx): Promise<{ accounts: number; totalSynced: number }> => {
    // Get all active TikTok accounts
    const accounts = await ctx.runQuery(internal.analytics.getAllTikTokAccounts);

    console.log(`Syncing videos for ${accounts.length} TikTok accounts`);

    let totalSynced = 0;

    for (const account of accounts) {
      const result = await ctx.runAction(internal.tiktokAnalytics.syncAccountVideos, {
        accountId: account._id,
      });

      if (result.success) {
        totalSynced += result.synced;
        console.log(`Synced ${result.synced} videos for @${account.username}`);
      } else {
        console.error(`Failed to sync @${account.username}: ${result.error}`);
      }
    }

    return { accounts: accounts.length, totalSynced };
  },
});

// ============ Metrics Refresh ============

/**
 * Refresh metrics for videos that already exist in the database
 * Uses /v2/video/query/ for batch fetching by video ID
 */
export const refreshAccountMetricsInternal = internalAction({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; updated: number; error?: string }> => {
    // Get all videos for this account
    const videos = await ctx.runQuery(internal.analytics.getVideosForAccount, {
      accountId: args.accountId,
    });

    if (videos.length === 0) {
      return { success: true, updated: 0 };
    }

    // Get valid access token
    const tokenResult = await ctx.runAction(internal.accounts.getValidAccessToken, {
      accountId: args.accountId,
    });

    if (!tokenResult.token) {
      return { success: false, updated: 0, error: tokenResult.error || "Failed to get access token" };
    }

    try {
      let totalUpdated = 0;

      // Batch into groups of 20 (TikTok limit)
      for (let i = 0; i < videos.length; i += 20) {
        const batch = videos.slice(i, i + 20);
        const videoIds = batch.map((v) => v.videoId);

        const response = await fetch(
          `https://open.tiktokapis.com/v2/video/query/?fields=${VIDEO_FIELDS}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokenResult.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              filters: {
                video_ids: videoIds,
              },
            }),
          }
        );

        const data = await response.json();

        if (data.error?.code !== "ok") {
          console.error("TikTok video query error:", data.error);
          continue;
        }

        const fetchedVideos = data.data?.videos || [];
        const videoMap = new Map(fetchedVideos.map((v: TikTokVideo) => [v.id, v]));

        // Update each video's metrics
        for (const dbVideo of batch) {
          const tiktokVideo = videoMap.get(dbVideo.videoId) as TikTokVideo | undefined;
          if (tiktokVideo) {
            await ctx.runMutation(internal.analytics.updateVideoMetrics, {
              id: dbVideo._id,
              metrics: {
                views: tiktokVideo.view_count || 0,
                likes: tiktokVideo.like_count || 0,
                comments: tiktokVideo.comment_count || 0,
                shares: tiktokVideo.share_count || 0,
              },
              coverImageUrl: tiktokVideo.cover_image_url,
              embedLink: tiktokVideo.embed_link,
              shareUrl: tiktokVideo.share_url,
            });
            totalUpdated++;
          }
        }
      }

      return { success: true, updated: totalUpdated };
    } catch (err) {
      console.error("Error refreshing metrics:", err);
      return {
        success: false,
        updated: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

/**
 * Refresh metrics for all accounts
 */
export const refreshAllMetrics = internalAction({
  handler: async (ctx): Promise<{ accounts: number; updated: number }> => {
    const accounts = await ctx.runQuery(internal.analytics.getAllTikTokAccounts);

    let totalUpdated = 0;

    for (const account of accounts) {
      const result = await ctx.runAction(internal.tiktokAnalytics.refreshAccountMetricsInternal, {
        accountId: account._id,
      });

      if (result.success) {
        totalUpdated += result.updated;
      }
    }

    return { accounts: accounts.length, updated: totalUpdated };
  },
});

// ============ User-Triggered Actions ============

/**
 * Manual sync for a specific account (user-triggered)
 */
export const syncAccount = action({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; synced: number; error?: string }> => {
    return await ctx.runAction(internal.tiktokAnalytics.syncAccountVideos, {
      accountId: args.accountId,
    });
  },
});

/**
 * Manual refresh all (user-triggered from analytics page)
 * Syncs new videos, refreshes video metrics, AND refreshes account stats
 */
export const refreshAllUserMetrics = action({
  handler: async (ctx): Promise<{ success: boolean; synced: number; updated: number; error?: string }> => {
    // First sync to get any new videos
    const syncResult = await ctx.runAction(internal.tiktokAnalytics.syncAllAccounts);

    // Then refresh metrics for all videos
    const refreshResult = await ctx.runAction(internal.tiktokAnalytics.refreshAllMetrics);

    // Also refresh account-level stats (follower count, etc.)
    const accounts = await ctx.runQuery(internal.analytics.getAllTikTokAccounts);
    for (const account of accounts) {
      await ctx.runAction(internal.accounts.refreshAccountStats, {
        accountId: account._id,
      });
    }

    return {
      success: true,
      synced: syncResult.totalSynced,
      updated: refreshResult.updated,
    };
  },
});

// ============ Post Status Polling (for Content Engine posts) ============

/**
 * Poll TikTok for post status to link publishId to videoId
 * Called after posting via Content Engine to track the video
 * Includes retry logic - will reschedule itself if still processing
 */
export const pollPostStatus = internalAction({
  args: {
    accountId: v.id("accounts"),
    publishId: v.string(),
    contentId: v.optional(v.id("content")),
    scheduledPostId: v.optional(v.id("scheduledPosts")),
    attemptNumber: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; status: string; videoId?: string; error?: string }> => {
    const attemptNumber = args.attemptNumber || 1;
    const maxAttempts = 10; // Try up to 10 times over ~30 minutes

    // Get valid access token
    const tokenResult = await ctx.runAction(internal.accounts.getValidAccessToken, {
      accountId: args.accountId,
    });

    if (!tokenResult.token) {
      return { success: false, status: "error", error: tokenResult.error || "Failed to get access token" };
    }

    try {
      const response = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenResult.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            publish_id: args.publishId,
          }),
        }
      );

      const data = await response.json();
      console.log(`TikTok post status (attempt ${attemptNumber}):`, JSON.stringify(data, null, 2));

      if (data.error?.code !== "ok") {
        return {
          success: false,
          status: "error",
          error: data.error?.message || "Failed to check status",
        };
      }

      const status = data.data?.status;
      // Note: TikTok has a typo in their API - "publicaly" instead of "publicly"
      const videoId = data.data?.publicaly_available_post_id?.[0];

      if (status === "PUBLISH_COMPLETE" && videoId) {
        // Link the publishId to the video when it exists (or will be created by sync)
        await ctx.runMutation(internal.analytics.linkPublishIdToVideo, {
          videoId,
          publishId: args.publishId,
          contentId: args.contentId,
          scheduledPostId: args.scheduledPostId,
        });

        console.log(`Successfully linked publishId ${args.publishId} to videoId ${videoId}`);
        return { success: true, status: "published", videoId };
      } else if (status === "FAILED") {
        return {
          success: false,
          status: "failed",
          error: data.data?.fail_reason || "Post failed",
        };
      } else {
        // Still processing (PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, SEND_TO_USER_INBOX)
        // Schedule a retry if we haven't exceeded max attempts
        if (attemptNumber < maxAttempts) {
          // Exponential backoff: 30s, 60s, 120s, etc. capped at 5 minutes
          const delayMs = Math.min(30000 * Math.pow(2, attemptNumber - 1), 5 * 60 * 1000);
          console.log(`Post still processing, scheduling retry in ${delayMs / 1000}s (attempt ${attemptNumber + 1})`);

          await ctx.runMutation(internal.tiktokAnalytics.schedulePollPostStatus, {
            accountId: args.accountId,
            publishId: args.publishId,
            contentId: args.contentId,
            scheduledPostId: args.scheduledPostId,
            attemptNumber: attemptNumber + 1,
            delayMs,
          });
        } else {
          console.log(`Max attempts reached for publishId ${args.publishId}, will rely on sync to pick it up`);
        }

        return { success: true, status: status || "processing" };
      }
    } catch (err) {
      console.error("Error polling post status:", err);
      return {
        success: false,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal mutation to schedule pollPostStatus with a delay
 * This is needed because actions can't directly schedule other actions
 */
export const schedulePollPostStatus = internalMutation({
  args: {
    accountId: v.id("accounts"),
    publishId: v.string(),
    contentId: v.optional(v.id("content")),
    scheduledPostId: v.optional(v.id("scheduledPosts")),
    attemptNumber: v.optional(v.number()),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(args.delayMs, internal.tiktokAnalytics.pollPostStatus, {
      accountId: args.accountId,
      publishId: args.publishId,
      contentId: args.contentId,
      scheduledPostId: args.scheduledPostId,
      attemptNumber: args.attemptNumber,
    });
  },
});
