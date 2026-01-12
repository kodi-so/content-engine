// Shared validators used across schema and mutations
import { v } from "convex/values";

// Slide definition for carousels
export const slideValidator = v.object({
  text: v.string(),
  imageUrl: v.string(),
  overlay: v.optional(v.boolean()), // Dark overlay for text readability
  imagePrompt: v.optional(v.string()), // Prompt used to generate current image (from visual planning or manual regeneration)
});

// Content validator
export const contentValidator = v.object({
  type: v.string(),
  slides: v.optional(v.array(slideValidator)),
  texts: v.optional(v.array(v.string())),
  mediaUrls: v.optional(v.array(v.string())),
  config: v.optional(
    v.object({
      fontSize: v.number(),
      fontColor: v.string(),
      textPosition: v.object({
        x: v.number(),
        y: v.number(),
      }),
      aspectRatio: v.optional(
        v.union(v.literal("1:1"), v.literal("4:5"), v.literal("9:16"))
      ),
    })
  ),
});
