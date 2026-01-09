import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Slide validator (text, image, and optional overlay)
const slideValidator = v.object({
  text: v.string(),
  imageUrl: v.string(),
  overlay: v.optional(v.boolean()),
});

// Get all content
export const list = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("content")
      .order("desc")
      .collect();
  },
});

// Get content by status
export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("ready"),
      v.literal("edited"),
      v.literal("downloaded"),
      v.literal("posted"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("content")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .collect();
  },
});

// Get content by product
export const listByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("content")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .collect();
  },
});

// Get a single content item
export const get = query({
  args: { id: v.id("content") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get content with related data (product, account)
export const getWithDetails = query({
  args: { id: v.id("content") },
  handler: async (ctx, args) => {
    const content = await ctx.db.get(args.id);
    if (!content) return null;

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

// Create a new content generation job
export const create = mutation({
  args: {
    productId: v.optional(v.id("products")),
    accountId: v.optional(v.id("accounts")),
    inputParams: v.object({
      topic: v.optional(v.string()),
      slideCount: v.optional(v.number()),
      customPrompt: v.optional(v.string()),
      variables: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const contentId = await ctx.db.insert("content", {
      productId: args.productId,
      accountId: args.accountId,
      status: "pending",
      inputParams: args.inputParams,
      createdAt: now,
      updatedAt: now,
    });
    return contentId;
  },
});

// Update content status
export const updateStatus = mutation({
  args: {
    id: v.id("content"),
    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("ready"),
      v.literal("edited"),
      v.literal("downloaded"),
      v.literal("posted"),
      v.literal("failed")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
  },
});

// Update step progress
export const updateProgress = mutation({
  args: {
    id: v.id("content"),
    currentStep: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      currentStep: args.currentStep,
      updatedAt: Date.now(),
    });
  },
});

// Update generated content
export const updateContent = mutation({
  args: {
    id: v.id("content"),
    content: v.object({
      type: v.string(),
      slides: v.optional(v.array(slideValidator)),
      texts: v.optional(v.array(v.string())),
      mediaUrls: v.optional(v.array(v.string())),
      caption: v.optional(v.string()),
      config: v.optional(v.object({
        fontSize: v.number(),
        fontColor: v.string(),
        textPosition: v.object({
          x: v.number(),
          y: v.number(),
        }),
      })),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      content: args.content,
      status: "ready",
      updatedAt: Date.now(),
    });
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
    const content = await ctx.db.get(args.id);
    if (!content || !content.content?.slides) {
      throw new Error("Content not found or has no slides");
    }

    const slides = [...content.content.slides];
    slides[args.slideIndex] = args.slide;

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        slides,
      },
      status: "edited",
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
    const content = await ctx.db.get(args.id);
    if (!content || !content.content?.slides) {
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

// Update caption
export const updateCaption = mutation({
  args: {
    id: v.id("content"),
    caption: v.string(),
  },
  handler: async (ctx, args) => {
    const content = await ctx.db.get(args.id);
    if (!content || !content.content) {
      throw new Error("Content not found");
    }

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        caption: args.caption,
      },
      status: "edited",
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
    const content = await ctx.db.get(args.id);
    if (!content || !content.content) {
      throw new Error("Content not found");
    }

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        config: {
          ...content.content.config!,
          aspectRatio: args.aspectRatio,
        },
      },
      updatedAt: Date.now(),
    });
  },
});

// Update font size
export const updateFontSize = mutation({
  args: {
    id: v.id("content"),
    fontSize: v.number(),
  },
  handler: async (ctx, args) => {
    const content = await ctx.db.get(args.id);
    if (!content || !content.content) {
      throw new Error("Content not found");
    }

    await ctx.db.patch(args.id, {
      content: {
        ...content.content,
        config: {
          ...content.content.config!,
          fontSize: args.fontSize,
        },
      },
      updatedAt: Date.now(),
    });
  },
});

// Delete content
export const remove = mutation({
  args: { id: v.id("content") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Get stats for dashboard
export const getStats = query({
  handler: async (ctx) => {
    const all = await ctx.db.query("content").collect();

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const thisWeek = all.filter((c) => c.createdAt > oneWeekAgo);
    const ready = all.filter((c) => c.status === "ready" || c.status === "edited");

    return {
      totalGenerated: all.length,
      generatedThisWeek: thisWeek.length,
      pendingReview: ready.length,
    };
  },
});
