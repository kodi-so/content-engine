import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireSocialAccountAccess } from "../accounts/accountAccess";
import { requireBetaAccess } from "../auth/users";
import { metricsValidator, platformValidator } from "../validators";
import { requireWorkspaceMember } from "../workspaces/workspaces";

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, identity.subject);
      return await ctx.db
        .query("postMetrics")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .take(500);
    }
    return await ctx.db
      .query("postMetrics")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .take(500);
  },
});

export const record = mutation({
  args: {
    accountPostId: v.id("accountPosts"),
    socialAccountId: v.id("socialAccounts"),
    platform: platformValidator,
    externalPostId: v.string(),
    metrics: metricsValidator,
    capturedAt: v.optional(v.number()),
  },
  returns: v.id("postMetrics"),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const account = await requireSocialAccountAccess(ctx, args.socialAccountId, identity.subject);
    const post = await ctx.db.get(args.accountPostId);
    if (!post || post.socialAccountId !== account._id) throw new Error("Account post not found");
    const now = Date.now();
    const capturedAt = args.capturedAt ?? now;
    const metricId = await ctx.db.insert("postMetrics", {
      userId: identity.subject,
      workspaceId: account.workspaceId,
      ...args,
      capturedAt,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(post._id, {
      latestMetrics: args.metrics,
      metricsUpdatedAt: capturedAt,
      updatedAt: now,
    });
    return metricId;
  },
});

export const recordFromProvider = internalMutation({
  args: {
    userId: v.string(),
    accountPostId: v.id("accountPosts"),
    socialAccountId: v.id("socialAccounts"),
    platform: platformValidator,
    externalPostId: v.string(),
    metrics: metricsValidator,
    capturedAt: v.number(),
  },
  returns: v.id("postMetrics"),
  handler: async (ctx, args) => {
    const account = await requireSocialAccountAccess(ctx, args.socialAccountId, args.userId);
    const post = await ctx.db.get(args.accountPostId);
    if (!post || post.socialAccountId !== account._id) {
      throw new Error("Account post not found");
    }
    const now = Date.now();
    const metricId = await ctx.db.insert("postMetrics", {
      ...args,
      workspaceId: account.workspaceId ?? post.workspaceId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(post._id, {
      latestMetrics: args.metrics,
      metricsUpdatedAt: args.capturedAt,
      updatedAt: now,
    });
    return metricId;
  },
});
