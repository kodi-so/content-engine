import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { metricsValidator, platformValidator } from "../validators";

export const list = query({
  args: { brandId: v.optional(v.id("brands")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.userId !== userId) return [];

      const metrics = await ctx.db
        .query("postMetrics")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
      return metrics.filter((metric) => metric.userId === userId);
    }

    return await ctx.db
      .query("postMetrics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const record = mutation({
  args: {
    brandId: v.optional(v.id("brands")),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    distributionPlanId: v.optional(v.id("distributionPlans")),
    socialAccountId: v.id("socialAccounts"),
    platform: platformValidator,
    externalPostId: v.string(),
    metrics: metricsValidator,
    capturedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const account = await ctx.db.get(args.socialAccountId);
    if (!account || account.userId !== identity.subject) {
      throw new Error("Social account not found");
    }

    const now = Date.now();
    return await ctx.db.insert("postMetrics", {
      userId: identity.subject,
      ...args,
      capturedAt: args.capturedAt ?? now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const recordFromProvider = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    distributionPlanId: v.optional(v.id("distributionPlans")),
    socialAccountId: v.id("socialAccounts"),
    platform: platformValidator,
    externalPostId: v.string(),
    metrics: metricsValidator,
    capturedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.socialAccountId);
    if (!account || account.userId !== args.userId) {
      throw new Error("Social account not found");
    }

    const now = Date.now();
    return await ctx.db.insert("postMetrics", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});
