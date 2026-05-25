import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  workflowRunEventTypeValidator,
  workflowRunStatusValidator,
} from "../validators";

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

    const now = Date.now();
    const runId = await ctx.db.insert("workflowRuns", {
      userId: identity.subject,
      workflowId: workflow._id,
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

    await ctx.scheduler.runAfter(0, internal.workflows.runner.executeRun, { runId });

    return runId;
  },
});

export const remove = mutation({
  args: { id: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const run = await ctx.db.get(args.id);
    if (!run || run.userId !== identity.subject) {
      throw new Error("Workflow run not found");
    }

    const metrics = await ctx.db
      .query("postMetrics")
      .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", args.id))
      .collect();
    for (const metric of metrics) {
      if (metric.userId === identity.subject) {
        await ctx.db.delete(metric._id);
      }
    }

    const plans = await ctx.db
      .query("distributionPlans")
      .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", args.id))
      .collect();
    for (const plan of plans) {
      if (plan.userId === identity.subject) {
        await ctx.db.delete(plan._id);
      }
    }

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", args.id))
      .collect();
    for (const artifact of artifacts) {
      if (artifact.userId === identity.subject) {
        await ctx.db.delete(artifact._id);
      }
    }

    const events = await ctx.db
      .query("workflowRunEvents")
      .withIndex("by_run", (q) => q.eq("workflowRunId", args.id))
      .collect();
    for (const event of events) {
      if (event.userId === identity.subject) {
        await ctx.db.delete(event._id);
      }
    }

    await ctx.db.delete(args.id);
  },
});

export const getExecutionContext = internalQuery({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;

    const workflow = await ctx.db.get(run.workflowId);
    const brand = await ctx.db.get(run.brandId);
    const socialAccount = run.socialAccountId
      ? await ctx.db.get(run.socialAccountId)
      : null;

    if (!workflow || !brand) return null;

    return { run, workflow, brand, socialAccount };
  },
});

export const transitionRun = internalMutation({
  args: {
    runId: v.id("workflowRuns"),
    status: workflowRunStatusValidator,
    currentNodeId: v.optional(v.string()),
    summary: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    errorNodeId: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status: args.status,
      currentNodeId: args.currentNodeId,
      summary: args.summary,
      costUsd: args.costUsd,
      errorMessage: args.errorMessage,
      errorNodeId: args.errorNodeId,
      startedAt: args.status === "running" ? now : undefined,
      completedAt: args.completedAt,
      updatedAt: now,
    });
  },
});

export const recordEvent = internalMutation({
  args: {
    userId: v.string(),
    workflowRunId: v.id("workflowRuns"),
    workflowId: v.id("workflows"),
    type: workflowRunEventTypeValidator,
    nodeId: v.optional(v.string()),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("workflowRunEvents", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
