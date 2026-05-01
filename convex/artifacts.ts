import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  artifactTypeValidator,
  modelProviderValidator,
  reviewStatusValidator,
} from "./validators";

export const list = query({
  args: {
    brandId: v.optional(v.id("brands")),
    workflowRunId: v.optional(v.id("workflowRuns")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    if (args.workflowRunId) {
      return await ctx.db
        .query("artifacts")
        .withIndex("by_workflow_run", (q) =>
          q.eq("workflowRunId", args.workflowRunId!)
        )
        .collect();
    }

    if (args.brandId) {
      return await ctx.db
        .query("artifacts")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
    }

    return await ctx.db
      .query("artifacts")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    brandId: v.optional(v.id("brands")),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    parentArtifactIds: v.optional(v.array(v.id("artifacts"))),
    type: artifactTypeValidator,
    title: v.optional(v.string()),
    storageUrl: v.optional(v.string()),
    data: v.optional(v.any()),
    provider: v.optional(modelProviderValidator),
    model: v.optional(v.string()),
    prompt: v.optional(v.string()),
    reviewStatus: v.optional(reviewStatusValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const now = Date.now();
    return await ctx.db.insert("artifacts", {
      userId: identity.subject,
      ...args,
      reviewStatus: args.reviewStatus ?? "not_required",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setReviewStatus = mutation({
  args: {
    id: v.id("artifacts"),
    reviewStatus: reviewStatusValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const artifact = await ctx.db.get(args.id);
    if (!artifact || artifact.userId !== identity.subject) {
      throw new Error("Artifact not found");
    }

    await ctx.db.patch(args.id, {
      reviewStatus: args.reviewStatus,
      updatedAt: Date.now(),
    });
  },
});
