// Shared validators used across schema and mutations
import { v } from "convex/values";

// Text element - individual text block on a slide (like Canva text layers)
export const textElementValidator = v.object({
  id: v.string(), // Unique ID for this text element
  content: v.string(), // The text content
  position: v.object({
    x: v.number(), // X position of center as percentage (0-100)
    y: v.number(), // Y position of center as percentage (0-100)
  }),
  size: v.object({
    width: v.number(), // Width as percentage of slide (0-100)
    height: v.number(), // Height as percentage of slide (0-100)
  }),
  fontSize: v.number(), // Font size in pixels
  fontColor: v.optional(v.string()), // Defaults to white
  fontWeight: v.optional(v.number()), // 400, 700, etc. Defaults to 700
  textAlign: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))), // Defaults to center
});

// Slide definition for carousels - flexible text elements approach
export const slideValidator = v.object({
  // Image fields (required)
  imageUrl: v.string(),
  imagePrompt: v.optional(v.string()),

  // Text elements - array of independently positioned/styled text blocks
  textElements: v.optional(v.array(textElementValidator)),

  // Display options
  overlay: v.optional(v.boolean()), // Dark overlay for text readability
});

// Content validator
export const contentValidator = v.object({
  type: v.string(),
  slides: v.optional(v.array(slideValidator)),
  texts: v.optional(v.array(v.string())),
  mediaUrls: v.optional(v.array(v.string())),
  // Config now only holds slideshow-level defaults (aspect ratio)
  config: v.optional(
    v.object({
      aspectRatio: v.optional(
        v.union(v.literal("1:1"), v.literal("4:5"), v.literal("9:16"))
      ),
    })
  ),
});

// Aspect ratio validator (shared)
export const aspectRatioValidator = v.union(
  v.literal("1:1"),
  v.literal("4:5"),
  v.literal("9:16")
);

// Privacy level validator (shared with scheduledPosts)
export const privacyLevelValidator = v.union(
  v.literal("PUBLIC_TO_EVERYONE"),
  v.literal("MUTUAL_FOLLOW_FRIENDS"),
  v.literal("SELF_ONLY")
);

// Automation theme configuration
export const themeConfigValidator = v.object({
  accountNiche: v.string(), // e.g., "self-improvement / habit tracking"
  targetAudience: v.optional(v.string()), // e.g., "young professionals 20-35"
  brandVoice: v.optional(v.string()), // e.g., "motivational, direct, no-nonsense"
  contentGuidelines: v.string(), // Detailed instructions for AI
  topicExamples: v.array(v.string()), // Example topics for inspiration
});

// Automation format configuration
export const formatConfigValidator = v.object({
  slideCount: v.object({
    min: v.number(),
    max: v.number(),
  }),
  textStyle: v.optional(
    v.object({
      maxCharsPerSlide: v.optional(v.number()),
      tone: v.optional(v.string()), // "punchy", "detailed", "casual"
    })
  ),
  visualStyle: v.optional(v.string()), // "dark minimalist", "bright colorful"
  aspectRatio: aspectRatioValidator,
});

// Automation schedule configuration
export const scheduleConfigValidator = v.object({
  timezone: v.string(), // e.g., "America/New_York"
  postingTimes: v.array(
    v.object({
      dayOfWeek: v.number(), // 0-6 (Sunday-Saturday)
      hour: v.number(), // 0-23
      minute: v.number(), // 0-59
    })
  ),
});

// Automation post settings
export const postSettingsValidator = v.object({
  privacyLevel: privacyLevelValidator,
  autoAddMusic: v.boolean(),
});

// Automation run status
export const automationRunStatusValidator = v.union(
  v.literal("pending"),
  v.literal("generating"),
  v.literal("scheduling"),
  v.literal("completed"),
  v.literal("failed")
);

// Content type (extensible for future content types)
export const contentTypeValidator = v.literal("slideshow");
