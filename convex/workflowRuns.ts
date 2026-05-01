import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { workflowId: v.optional(v.id("workflows")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    if (args.workflowId) {
      const workflow = await ctx.db.get(args.workflowId);
      if (!workflow || workflow.userId !== identity.subject) return [];

      return await ctx.db
        .query("workflowRuns")
        .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId!))
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("workflowRuns")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const getEvents = query({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const run = await ctx.db.get(args.workflowRunId);
    if (!run || run.userId !== identity.subject) return [];

    return await ctx.db
      .query("workflowRunEvents")
      .withIndex("by_run", (q) => q.eq("workflowRunId", args.workflowRunId))
      .collect();
  },
});

export const createManualRun = mutation({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow || workflow.userId !== identity.subject) {
      throw new Error("Workflow not found");
    }
    if (!workflow.activeVersionId) {
      throw new Error("Workflow has no active version");
    }

    const now = Date.now();
    const runId = await ctx.db.insert("workflowRuns", {
      userId: identity.subject,
      workflowId: workflow._id,
      workflowVersionId: workflow.activeVersionId,
      brandId: workflow.brandId,
      socialAccountId: workflow.socialAccountId,
      trigger: "manual",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("workflowRunEvents", {
      userId: identity.subject,
      workflowRunId: runId,
      workflowId: workflow._id,
      type: "run_created",
      message: "Manual workflow run queued.",
      createdAt: now,
    });

    return runId;
  },
});
