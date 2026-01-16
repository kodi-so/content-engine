import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { slideValidator, contentValidator, textElementValidator } from "./validators";

// Get all content for current user
export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    return await ctx.db
      .query("content")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

// Get content by product for current user
export const listByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const content = await ctx.db
      .query("content")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    return content
      .filter((c) => c.userId === identity.subject)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Get a single content item
export const get = query({
  args: { id: v.id("content") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const content = await ctx.db.get(args.id);
    if (!content || content.userId !== identity.subject) {
      return null;
    }
    return content;
  },
});

// Get content with related data (product, account)
export const getWithDetails = query({
  args: { id: v.id("content") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const content = await ctx.db.get(args.id);
    if (!content || content.userId !== identity.subject) return null;

    const product = content.productId
      ? await ctx.db.get(content.productId)
      : null;
    const account = content.accountId
      ? await ctx.db.get(content.accountId)
      : null;

    return {
      ...content,
      product,
      account,
    };
  },
});

// Create a completed slideshow (only called after successful generation)
export const create = mutation({
  args: {
    userId: v.string(),
    productId: v.optional(v.id("products")),
    accountId: v.optional(v.id("accounts")),
    inputParams: v.object({
      topic: v.optional(v.string()),
      slideCount: v.optional(v.number()),
      customPrompt: v.optional(v.string()),
      variables: v.optional(v.any()),
    }),
    content: contentValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const contentId = await ctx.db.insert("content", {
      userId: args.userId,
      productId: args.productId,
      accountId: args.accountId,
      inputParams: args.inputParams,
      content: args.content,
      createdAt: now,
      updatedAt: now,
    });
    return contentId;
  },
});

// Update a single slide (for editing)
export const updateSlide = mutation({
  args: {
    id: v.id("content"),
    slideIndex: v.number(),
    slide: slideValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const content = await ctx.db.get(args.id);
    if (!content || content.userId !== identity.subject || !content.content?.slides) {
      throw new Error("Content not found or has no slides");
    }

    const slides = [...content.content.slides];
    slides[args.slideIndex] = args.slide;

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        slides,
      },
      updatedAt: Date.now(),
    });
  },
});

// Toggle overlay for a specific slide
export const toggleSlideOverlay = mutation({
  args: {
    id: v.id("content"),
    slideIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const content = await ctx.db.get(args.id);
    if (!content || content.userId !== identity.subject || !content.content?.slides) {
      throw new Error("Content not found or has no slides");
    }

    const slides = [...content.content.slides];
    slides[args.slideIndex] = {
      ...slides[args.slideIndex],
      overlay: !slides[args.slideIndex].overlay,
    };

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        slides,
      },
      updatedAt: Date.now(),
    });
  },
});

// Update aspect ratio
export const updateAspectRatio = mutation({
  args: {
    id: v.id("content"),
    aspectRatio: v.union(
      v.literal("1:1"),
      v.literal("4:5"),
      v.literal("9:16")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const content = await ctx.db.get(args.id);
    if (!content || content.userId !== identity.subject || !content.content) {
      throw new Error("Content not found");
    }

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        config: {
          ...(content.content.config || {}),
          aspectRatio: args.aspectRatio,
        },
      },
      updatedAt: Date.now(),
    });
  },
});

// Helper to extract storage ID from URL
function extractStorageIdFromUrl(url: string): Id<"_storage"> | null {
  try {
    const match = url.match(/\/api\/storage\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1] as Id<"_storage">;
    }
    return null;
  } catch {
    return null;
  }
}

// Delete content and associated images from storage
export const remove = mutation({
  args: { id: v.id("content") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const content = await ctx.db.get(args.id);
    if (!content || content.userId !== identity.subject) {
      throw new Error("Content not found");
    }

    // Delete all slide images from storage
    const slides = content.content?.slides;
    if (slides && slides.length > 0) {
      for (const slide of slides) {
        if (slide.imageUrl) {
          const storageId = extractStorageIdFromUrl(slide.imageUrl);
          if (storageId) {
            try {
              await ctx.storage.delete(storageId);
            } catch (e) {
              // Log but don't fail if image deletion fails
              console.error("Failed to delete image:", e);
            }
          }
        }
      }
    }

    await ctx.db.delete(args.id);
  },
});

// Get stats for dashboard (for current user)
export const getStats = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { totalGenerated: 0, generatedThisWeek: 0 };
    }

    const all = await ctx.db
      .query("content")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const thisWeek = all.filter((c) => c.createdAt > oneWeekAgo);

    return {
      totalGenerated: all.length,
      generatedThisWeek: thisWeek.length,
    };
  },
});

// Update a single text element within a slide
export const updateTextElement = mutation({
  args: {
    id: v.id("content"),
    slideIndex: v.number(),
    elementId: v.string(),
    updates: v.object({
      content: v.optional(v.string()),
      fontSize: v.optional(v.number()),
      fontColor: v.optional(v.string()),
      fontWeight: v.optional(v.number()),
      textAlign: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))),
      position: v.optional(v.object({
        x: v.number(),
        y: v.number(),
      })),
      size: v.optional(v.object({
        width: v.number(),
        height: v.number(),
      })),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const content = await ctx.db.get(args.id);
    if (!content || content.userId !== identity.subject || !content.content?.slides) {
      throw new Error("Content not found or has no slides");
    }

    const slides = [...content.content.slides];
    const slide = slides[args.slideIndex];
    if (!slide || !slide.textElements) {
      throw new Error("Slide or text elements not found");
    }

    // Find and update the specific text element
    const elementIndex = slide.textElements.findIndex(el => el.id === args.elementId);
    if (elementIndex === -1) {
      throw new Error("Text element not found");
    }

    const updatedElements = [...slide.textElements];
    updatedElements[elementIndex] = {
      ...updatedElements[elementIndex],
      ...args.updates,
    };

    slides[args.slideIndex] = {
      ...slide,
      textElements: updatedElements,
    };

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        slides,
      },
      updatedAt: Date.now(),
    });
  },
});

// Delete a text element from a slide
export const deleteTextElement = mutation({
  args: {
    id: v.id("content"),
    slideIndex: v.number(),
    elementId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const content = await ctx.db.get(args.id);
    if (!content || content.userId !== identity.subject || !content.content?.slides) {
      throw new Error("Content not found or has no slides");
    }

    const slides = [...content.content.slides];
    const slide = slides[args.slideIndex];
    if (!slide || !slide.textElements) {
      throw new Error("Slide or text elements not found");
    }

    // Remove the text element
    const updatedElements = slide.textElements.filter(el => el.id !== args.elementId);

    slides[args.slideIndex] = {
      ...slide,
      textElements: updatedElements,
    };

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        slides,
      },
      updatedAt: Date.now(),
    });
  },
});

// Add a new text element to a slide
export const addTextElement = mutation({
  args: {
    id: v.id("content"),
    slideIndex: v.number(),
    element: textElementValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const content = await ctx.db.get(args.id);
    if (!content || content.userId !== identity.subject || !content.content?.slides) {
      throw new Error("Content not found or has no slides");
    }

    const slides = [...content.content.slides];
    const slide = slides[args.slideIndex];
    if (!slide) {
      throw new Error("Slide not found");
    }

    const existingElements = slide.textElements || [];
    slides[args.slideIndex] = {
      ...slide,
      textElements: [...existingElements, args.element],
    };

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        slides,
      },
      updatedAt: Date.now(),
    });
  },
});
