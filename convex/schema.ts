import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  slideValidator,
  themeConfigValidator,
  formatConfigValidator,
  scheduleConfigValidator,
  postSettingsValidator,
  automationRunStatusValidator,
  contentTypeValidator,
} from "./validators";

export default defineSchema({
  // Products - Apps/brands/businesses for content context
  products: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["isActive"])
    .index("by_user", ["userId"]),

  // Accounts - Social media accounts
  accounts: defineTable({
    userId: v.string(), // Owner of this connected account
    platform: v.union(
      v.literal("tiktok"),
      v.literal("instagram"),
      v.literal("twitter")
    ),
    username: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    productId: v.optional(v.id("products")), // Associated product
    // OAuth credentials
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    platformUserId: v.optional(v.string()), // Platform-specific user ID
    scopes: v.optional(v.array(v.string())), // Granted OAuth scopes
    // Account-level stats (from user.info.stats scope)
    followerCount: v.optional(v.number()),
    followingCount: v.optional(v.number()),
    likesCount: v.optional(v.number()), // Total likes received on all videos
    videoCount: v.optional(v.number()),
    statsLastUpdated: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_platform", ["platform"])
    .index("by_user_platform", ["userId", "platform"])
    .index("by_product", ["productId"])
    .index("by_username", ["platform", "username"]),

  // OAuth state - temporary storage for OAuth flow
  oauthStates: defineTable({
    state: v.string(), // Random state for CSRF protection
    userId: v.string(),
    platform: v.string(),
    redirectUrl: v.string(), // Where to redirect after OAuth
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_expiry", ["expiresAt"]),

  // Content - Generated content library (only stores completed slideshows)
  content: defineTable({
    userId: v.string(),
    productId: v.optional(v.id("products")),
    accountId: v.optional(v.id("accounts")),

    // Input parameters used for generation
    inputParams: v.object({
      topic: v.optional(v.string()),
      slideCount: v.optional(v.number()),
      customPrompt: v.optional(v.string()),
      variables: v.optional(v.any()), // Additional variables
    }),

    // Generated content
    content: v.object({
      type: v.string(),
      slides: v.optional(v.array(slideValidator)),
      texts: v.optional(v.array(v.string())), // For threads
      mediaUrls: v.optional(v.array(v.string())),
      // Config now only holds slideshow-level settings (aspect ratio)
      // Font size, color, position are per text element
      config: v.optional(v.object({
        aspectRatio: v.optional(v.union(
          v.literal("1:1"),
          v.literal("4:5"),
          v.literal("9:16")
        )),
      })),
    }),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_product", ["productId"])
    .index("by_account", ["accountId"]),

  // Config - API keys and global settings
  config: defineTable({
    key: v.string(),
    value: v.string(),
    isSecret: v.boolean(), // If true, value is encrypted/masked in UI
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Scheduled posts - Posts scheduled for future publication
  scheduledPosts: defineTable({
    userId: v.string(),
    contentId: v.id("content"), // Reference to the slideshow
    accountId: v.id("accounts"), // TikTok account to post from

    // Post metadata (captured at schedule time)
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    privacyLevel: v.union(
      v.literal("PUBLIC_TO_EVERYONE"),
      v.literal("MUTUAL_FOLLOW_FRIENDS"),
      v.literal("SELF_ONLY")
    ),
    postMode: v.union(
      v.literal("DIRECT_POST"),
      v.literal("MEDIA_UPLOAD")
    ),
    autoAddMusic: v.boolean(),

    // Pre-rendered images (stored as Convex storage URLs at schedule time)
    renderedImageUrls: v.array(v.string()),

    // Scheduling
    scheduledFor: v.number(), // UTC timestamp
    timezone: v.string(), // User's timezone for display

    // Status tracking
    status: v.union(
      v.literal("scheduled"),
      v.literal("posting"),
      v.literal("posted"),
      v.literal("failed")
    ),
    publishId: v.optional(v.string()), // TikTok's publish_id after posting
    errorMessage: v.optional(v.string()), // Error message if failed
    postedAt: v.optional(v.number()), // When actually posted

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_user_status", ["userId", "status"])
    .index("by_scheduled_time", ["scheduledFor"]),

  // Posted content - Tracks published TikTok videos with analytics
  // Videos are synced from TikTok's video list API, not just from Content Engine posts
  postedContent: defineTable({
    userId: v.string(),
    accountId: v.id("accounts"), // TikTok account that posted
    contentId: v.optional(v.id("content")), // Original slideshow (if from Content Engine)
    scheduledPostId: v.optional(v.id("scheduledPosts")), // If from scheduled post

    // TikTok identifiers
    videoId: v.string(), // TikTok's video ID (required - primary identifier)
    publishId: v.optional(v.string()), // From posting API (only for Content Engine posts)

    // Source tracking
    source: v.union(
      v.literal("content_engine"), // Posted via Content Engine
      v.literal("synced") // Synced from TikTok (posted elsewhere)
    ),

    // Video metadata (from TikTok)
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    embedLink: v.optional(v.string()),
    shareUrl: v.optional(v.string()),
    duration: v.optional(v.number()),

    // Metrics (updated periodically)
    metrics: v.object({
      views: v.number(),
      likes: v.number(),
      comments: v.number(),
      shares: v.number(),
    }),

    // Timestamps
    postedAt: v.number(), // When published on TikTok (create_time from API)
    metricsLastUpdated: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_account", ["accountId"])
    .index("by_video_id", ["videoId"])
    .index("by_posted_at", ["postedAt"]),

  // Automations - Automated content generation and posting
  automations: defineTable({
    userId: v.string(),
    name: v.string(), // e.g., "Self-Improvement Daily Posts"
    description: v.optional(v.string()),
    accountId: v.id("accounts"), // One-to-one with TikTok account

    // Content type (extensible for future: "hook_demo", "ai_ugc")
    contentType: contentTypeValidator,

    // Theme configuration
    themeConfig: themeConfigValidator,

    // Format configuration
    formatConfig: formatConfigValidator,

    // Schedule configuration
    scheduleConfig: scheduleConfigValidator,

    // Post settings
    postSettings: postSettingsValidator,

    // State
    isActive: v.boolean(),
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),

    // Preview content (for wizard)
    lastPreviewContentId: v.optional(v.id("content")),
    lastPreviewTopic: v.optional(v.string()),
    lastPreviewCaption: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_account", ["accountId"])
    .index("by_next_run", ["isActive", "nextRunAt"]),

  // Automation runs - Execution history for automations
  automationRuns: defineTable({
    automationId: v.id("automations"),
    userId: v.string(),

    // Status tracking
    status: automationRunStatusValidator,

    // Generated content (if successful)
    contentId: v.optional(v.id("content")),
    scheduledPostId: v.optional(v.id("scheduledPosts")),

    // Generation metadata
    generatedTopic: v.optional(v.string()), // The topic AI decided on
    generatedCaption: v.optional(v.string()), // AI-generated caption

    // Error tracking
    errorMessage: v.optional(v.string()),
    errorStep: v.optional(v.string()), // "topic_generation", "content_generation", "scheduling"

    // Timestamps
    scheduledFor: v.number(), // When this run was supposed to execute
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),

    createdAt: v.number(),
  })
    .index("by_automation", ["automationId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_automation_status", ["automationId", "status"]),
});
