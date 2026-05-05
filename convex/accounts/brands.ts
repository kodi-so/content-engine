import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

const brandFields = {
  name: v.string(),
  description: v.optional(v.string()),
  niche: v.optional(v.string()),
  audience: v.optional(v.string()),
  voice: v.optional(v.string()),
  visualStyle: v.optional(v.string()),
  offer: v.optional(v.string()),
  constraints: v.optional(v.array(v.string())),
  examplePosts: v.optional(v.array(v.string())),
  performanceNotes: v.optional(v.string()),
};

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("brands")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const brand = await ctx.db.get(args.id);
    if (!brand || brand.userId !== identity.subject) return null;

    return brand;
  },
});

export const create = mutation({
  args: brandFields,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const now = Date.now();
    return await ctx.db.insert("brands", {
      userId: identity.subject,
      ...args,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("brands"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    niche: v.optional(v.string()),
    audience: v.optional(v.string()),
    voice: v.optional(v.string()),
    visualStyle: v.optional(v.string()),
    offer: v.optional(v.string()),
    constraints: v.optional(v.array(v.string())),
    examplePosts: v.optional(v.array(v.string())),
    performanceNotes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const brand = await ctx.db.get(args.id);
    if (!brand || brand.userId !== identity.subject) {
      throw new Error("Brand not found");
    }

    const { id, ...updates } = args;
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    await ctx.db.patch(id, {
      ...cleanUpdates,
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const brand = await ctx.db.get(args.id);
    if (!brand || brand.userId !== identity.subject) {
      throw new Error("Brand not found");
    }

    await ctx.db.delete(args.id);
  },
});
