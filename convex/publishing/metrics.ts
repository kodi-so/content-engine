import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireBetaAccess } from "../auth/users";
import { metricsValidator, platformValidator } from "../validators";
import { requireWorkspaceMember } from "../workspaces/workspaces";

export const list = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) return [];
    const userId = identity.subject;

    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, userId);
      return await ctx.db
        .query("postMetrics")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .collect();
    }

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand) return [];
      if (brand.workspaceId) {
        await requireWorkspaceMember(ctx, brand.workspaceId, userId);
      } else if (brand.userId !== userId) {
        return [];
      }

      const metrics = await ctx.db
        .query("postMetrics")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
      return metrics.filter((metric) =>
        brand.workspaceId ? metric.workspaceId === brand.workspaceId : metric.userId === userId
      );
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
    const identity = await requireBetaAccess(ctx);
    if (!identity) throw new Error("Not authenticated");

    const account = await ctx.db.get(args.socialAccountId);
    if (!account) {
      throw new Error("Social account not found");
    }
    if (account.workspaceId) {
      await requireWorkspaceMember(ctx, account.workspaceId, identity.subject);
    } else if (account.userId !== identity.subject) {
      throw new Error("Social account not found");
    }
    const plan = args.distributionPlanId ? await ctx.db.get(args.distributionPlanId) : null;
    if (plan?.workspaceId && account.workspaceId && plan.workspaceId !== account.workspaceId) {
      throw new Error("Distribution plan does not belong to this social account workspace");
    }

    const now = Date.now();
    return await ctx.db.insert("postMetrics", {
      userId: identity.subject,
      workspaceId: account.workspaceId ?? plan?.workspaceId,
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
    if (!account) {
      throw new Error("Social account not found");
    }
    const plan = args.distributionPlanId ? await ctx.db.get(args.distributionPlanId) : null;
    const run = args.workflowRunId ? await ctx.db.get(args.workflowRunId) : null;
    const workflow = args.workflowId ? await ctx.db.get(args.workflowId) : null;
    const brand = args.brandId ? await ctx.db.get(args.brandId) : null;
    if (!account.workspaceId && account.userId !== args.userId) {
      throw new Error("Social account not found");
    }
    if (account.workspaceId) {
      const expectedWorkspaceId =
        plan?.workspaceId ?? run?.workspaceId ?? workflow?.workspaceId ?? brand?.workspaceId;
      if (expectedWorkspaceId && account.workspaceId !== expectedWorkspaceId) {
        throw new Error("Social account does not belong to this workspace");
      }
    }
    const workspaceId =
      account.workspaceId ??
      plan?.workspaceId ??
      run?.workspaceId ??
      workflow?.workspaceId ??
      brand?.workspaceId;

    const now = Date.now();
    return await ctx.db.insert("postMetrics", {
      ...args,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    });
  },
});
