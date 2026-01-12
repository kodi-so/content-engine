import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============ Queries ============

// List all posted content for current user with optional filters
export const listPostedContent = query({
  args: {
    accountId: v.optional(v.id("accounts")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.id("postedContent")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { posts: [], nextCursor: null };

    const allPosts = await ctx.db
      .query("postedContent")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    // Filter by account if specified
    let filteredPosts = args.accountId
      ? allPosts.filter((p) => p.accountId === args.accountId)
      : allPosts;

    // Sort by postedAt (when posted on TikTok), most recent first
    filteredPosts.sort((a, b) => b.postedAt - a.postedAt);

    // Handle cursor-based pagination
    if (args.cursor) {
      const cursorIndex = filteredPosts.findIndex((p) => p._id === args.cursor);
      if (cursorIndex !== -1) {
        filteredPosts = filteredPosts.slice(cursorIndex + 1);
      }
    }

    const limit = args.limit || 20;
    const posts = filteredPosts.slice(0, limit);
    const nextCursor = posts.length === limit ? posts[posts.length - 1]._id : null;

    // Fetch account details and fallback thumbnail for each post
    const postsWithAccounts = await Promise.all(
      posts.map(async (post) => {
        const account = await ctx.db.get(post.accountId);

        // TikTok photomode (slideshow) cover images return 403 Forbidden when accessed directly
        // Detect these URLs and treat them as if there's no cover image
        const isPhotomodeUrl = post.coverImageUrl?.includes("photomode") ||
                               post.coverImageUrl?.includes("tiktokv.us");
        const hasUsableCoverImage = post.coverImageUrl && !isPhotomodeUrl;

        // If no usable cover image and this is a Content Engine post with contentId,
        // try to get the first slide image from the original content
        let fallbackThumbnail: string | undefined;
        if (!hasUsableCoverImage && post.contentId) {
          const content = await ctx.db.get(post.contentId);
          if (content?.content?.slides?.[0]?.imageUrl) {
            fallbackThumbnail = content.content.slides[0].imageUrl;
          }
        }

        // Also check scheduledPost for rendered images
        if (!hasUsableCoverImage && !fallbackThumbnail && post.scheduledPostId) {
          const scheduledPost = await ctx.db.get(post.scheduledPostId);
          if (scheduledPost?.renderedImageUrls?.[0]) {
            fallbackThumbnail = scheduledPost.renderedImageUrls[0];
          }
        }

        return {
          ...post,
          // Use fallback thumbnail if no usable cover image from TikTok
          coverImageUrl: hasUsableCoverImage ? post.coverImageUrl : fallbackThumbnail,
          account: account
            ? {
                _id: account._id,
                platform: account.platform,
                username: account.username,
                displayName: account.displayName,
                avatarUrl: account.avatarUrl,
              }
            : null,
        };
      })
    );

    return { posts: postsWithAccounts, nextCursor };
  },
});

// Get aggregated stats for the current user
export const getStats = query({
  args: {
    accountId: v.optional(v.id("accounts")),
    dateRange: v.optional(v.union(
      v.literal("7d"),
      v.literal("30d"),
      v.literal("90d"),
      v.literal("all")
    )),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        totalPosts: 0,
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        engagementRate: 0,
        metricsLastUpdated: null,
      };
    }

    const allPosts = await ctx.db
      .query("postedContent")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    // Filter by account if specified
    let posts = args.accountId
      ? allPosts.filter((p) => p.accountId === args.accountId)
      : allPosts;

    // Filter by date range
    if (args.dateRange && args.dateRange !== "all") {
      const now = Date.now();
      const daysMap = { "7d": 7, "30d": 30, "90d": 90 };
      const days = daysMap[args.dateRange];
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      posts = posts.filter((p) => p.postedAt >= cutoff);
    }

    const totalViews = posts.reduce((sum, p) => sum + p.metrics.views, 0);
    const totalLikes = posts.reduce((sum, p) => sum + p.metrics.likes, 0);
    const totalComments = posts.reduce((sum, p) => sum + p.metrics.comments, 0);
    const totalShares = posts.reduce((sum, p) => sum + p.metrics.shares, 0);

    // Engagement rate = (likes + comments) / views * 100
    const engagementRate = totalViews > 0
      ? ((totalLikes + totalComments) / totalViews) * 100
      : 0;

    // Get most recent metrics update time
    const metricsLastUpdated = posts.reduce(
      (latest, p) => Math.max(latest, p.metricsLastUpdated || 0),
      0
    ) || null;

    return {
      totalPosts: posts.length,
      totalViews,
      totalLikes,
      totalComments,
      totalShares,
      engagementRate: Math.round(engagementRate * 100) / 100,
      metricsLastUpdated,
    };
  },
});

// Get per-account breakdown
export const getAccountStats = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const posts = await ctx.db
      .query("postedContent")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    // Group by account
    const accountMap = new Map<
      string,
      {
        accountId: Id<"accounts">;
        posts: typeof posts;
      }
    >();

    for (const post of posts) {
      const key = post.accountId.toString();
      if (!accountMap.has(key)) {
        accountMap.set(key, { accountId: post.accountId, posts: [] });
      }
      accountMap.get(key)!.posts.push(post);
    }

    // Calculate stats per account
    const accountStats = await Promise.all(
      Array.from(accountMap.values()).map(async ({ accountId, posts }) => {
        const account = await ctx.db.get(accountId);

        const totalViews = posts.reduce((sum, p) => sum + p.metrics.views, 0);
        const totalLikes = posts.reduce((sum, p) => sum + p.metrics.likes, 0);
        const totalComments = posts.reduce((sum, p) => sum + p.metrics.comments, 0);
        const totalShares = posts.reduce((sum, p) => sum + p.metrics.shares, 0);

        return {
          account: account
            ? {
                _id: account._id,
                platform: account.platform,
                username: account.username,
                displayName: account.displayName,
                avatarUrl: account.avatarUrl,
              }
            : null,
          totalPosts: posts.length,
          totalViews,
          totalLikes,
          totalComments,
          totalShares,
        };
      })
    );

    return accountStats.filter((s) => s.account !== null);
  },
});

// Get a single posted content by ID
export const getPostedContent = query({
  args: { id: v.id("postedContent") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const post = await ctx.db.get(args.id);
    if (!post || post.userId !== identity.subject) return null;

    const account = await ctx.db.get(post.accountId);
    return {
      ...post,
      account: account
        ? {
            _id: account._id,
            platform: account.platform,
            username: account.username,
            displayName: account.displayName,
            avatarUrl: account.avatarUrl,
          }
        : null,
    };
  },
});

// ============ Internal Queries ============

// Get account by ID (for sync)
export const getAccountInternal = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
  },
});

// Get all active TikTok accounts
export const getAllTikTokAccounts = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("accounts")
      .withIndex("by_platform", (q) => q.eq("platform", "tiktok"))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// Get all videos for an account (for metrics refresh)
export const getVideosForAccount = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("postedContent")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

// Get video by videoId
export const getByVideoId = internalQuery({
  args: { videoId: v.string() },
  handler: async (ctx, args) => {
    const posts = await ctx.db
      .query("postedContent")
      .withIndex("by_video_id", (q) => q.eq("videoId", args.videoId))
      .collect();
    return posts[0] || null;
  },
});

// ============ Internal Mutations ============

// Upsert a video from TikTok sync
export const upsertVideo = internalMutation({
  args: {
    userId: v.string(),
    accountId: v.id("accounts"),
    video: v.object({
      id: v.string(),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      coverImageUrl: v.optional(v.string()),
      embedLink: v.optional(v.string()),
      shareUrl: v.optional(v.string()),
      viewCount: v.number(),
      likeCount: v.number(),
      commentCount: v.number(),
      shareCount: v.number(),
      createTime: v.optional(v.number()),
      duration: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if video already exists
    const existing = await ctx.db
      .query("postedContent")
      .withIndex("by_video_id", (q) => q.eq("videoId", args.video.id))
      .first();

    if (existing) {
      // Update existing video with latest metrics and metadata
      await ctx.db.patch(existing._id, {
        title: args.video.title,
        description: args.video.description,
        coverImageUrl: args.video.coverImageUrl,
        embedLink: args.video.embedLink,
        shareUrl: args.video.shareUrl,
        duration: args.video.duration,
        metrics: {
          views: args.video.viewCount,
          likes: args.video.likeCount,
          comments: args.video.commentCount,
          shares: args.video.shareCount,
        },
        metricsLastUpdated: now,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Create new video record
      return await ctx.db.insert("postedContent", {
        userId: args.userId,
        accountId: args.accountId,
        videoId: args.video.id,
        source: "synced",
        title: args.video.title,
        description: args.video.description,
        coverImageUrl: args.video.coverImageUrl,
        embedLink: args.video.embedLink,
        shareUrl: args.video.shareUrl,
        duration: args.video.duration,
        metrics: {
          views: args.video.viewCount,
          likes: args.video.likeCount,
          comments: args.video.commentCount,
          shares: args.video.shareCount,
        },
        // Convert TikTok's create_time (seconds) to milliseconds
        postedAt: args.video.createTime ? args.video.createTime * 1000 : now,
        metricsLastUpdated: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Update video metrics
export const updateVideoMetrics = internalMutation({
  args: {
    id: v.id("postedContent"),
    metrics: v.object({
      views: v.number(),
      likes: v.number(),
      comments: v.number(),
      shares: v.number(),
    }),
    coverImageUrl: v.optional(v.string()),
    embedLink: v.optional(v.string()),
    shareUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const updates: Record<string, unknown> = {
      metrics: args.metrics,
      metricsLastUpdated: now,
      updatedAt: now,
    };

    if (args.coverImageUrl) updates.coverImageUrl = args.coverImageUrl;
    if (args.embedLink) updates.embedLink = args.embedLink;
    if (args.shareUrl) updates.shareUrl = args.shareUrl;

    await ctx.db.patch(args.id, updates);
  },
});

// Link a publishId to a video (for Content Engine posts)
// This is called when we know the videoId after polling post status
export const linkPublishIdToVideo = internalMutation({
  args: {
    videoId: v.string(),
    publishId: v.string(),
    contentId: v.optional(v.id("content")),
    scheduledPostId: v.optional(v.id("scheduledPosts")),
  },
  handler: async (ctx, args) => {
    // Find the video by videoId
    const video = await ctx.db
      .query("postedContent")
      .withIndex("by_video_id", (q) => q.eq("videoId", args.videoId))
      .first();

    if (video) {
      // Update existing video to mark as content_engine source
      await ctx.db.patch(video._id, {
        source: "content_engine",
        publishId: args.publishId,
        contentId: args.contentId,
        scheduledPostId: args.scheduledPostId,
        updatedAt: Date.now(),
      });
    }
    // If video doesn't exist yet, the sync will create it and we'll link later
    // Or we could store the pending link - but sync happens frequently enough
  },
});
