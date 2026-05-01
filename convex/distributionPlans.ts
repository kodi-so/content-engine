import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  distributionStatusValidator,
  publishingProviderValidator,
} from "./validators";

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("distributionPlans")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    brandId: v.id("brands"),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    artifactIds: v.array(v.id("artifacts")),
    socialAccountIds: v.array(v.id("socialAccounts")),
    provider: publishingProviderValidator,
    status: v.optional(distributionStatusValidator),
    scheduledFor: v.optional(v.number()),
    timezone: v.optional(v.string()),
    caption: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.userId !== identity.subject) {
      throw new Error("Brand not found");
    }

    const now = Date.now();
    return await ctx.db.insert("distributionPlans", {
      userId: identity.subject,
      ...args,
      status: args.status ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("distributionPlans"),
    status: distributionStatusValidator,
    externalPostIds: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const plan = await ctx.db.get(args.id);
    if (!plan || plan.userId !== identity.subject) {
      throw new Error("Distribution plan not found");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      externalPostIds: args.externalPostIds,
      errorMessage: args.errorMessage,
      publishedAt: args.publishedAt,
      updatedAt: Date.now(),
    });
  },
});
