import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import {
  workflowRunEventTypeValidator,
  workflowRunNodeStatusValidator,
  workflowRunOutputRefValidator,
  workflowRunProviderJobValidator,
  workflowRunStatusValidator,
} from "../validators";
import { createWorkflowRun } from "./runCreation";

const terminalNodeStatuses = new Set(["succeeded", "failed", "blocked", "skipped"]);

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

export const getNodeStates = query({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const run = await ctx.db.get(args.workflowRunId);
    if (!run || run.userId !== identity.subject) return [];

    const states = await ctx.db
      .query("workflowRunNodeStates")
      .withIndex("by_run", (q) => q.eq("workflowRunId", args.workflowRunId))
      .collect();

    return states.sort((a, b) => a.createdAt - b.createdAt);
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

    return await createWorkflowRun(ctx, {
      userId: identity.subject,
      workflow,
    });
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

    const nodeStates = await ctx.db
      .query("workflowRunNodeStates")
      .withIndex("by_run", (q) => q.eq("workflowRunId", args.id))
      .collect();
    for (const nodeState of nodeStates) {
      if (nodeState.userId === identity.subject) {
        await ctx.db.delete(nodeState._id);
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
    const run = await ctx.db.get(args.runId);

    await ctx.db.patch(args.runId, {
      status: args.status,
      ...(args.currentNodeId !== undefined ? { currentNodeId: args.currentNodeId } : {}),
      ...(args.summary !== undefined ? { summary: args.summary } : {}),
      ...(args.costUsd !== undefined ? { costUsd: args.costUsd } : {}),
      ...(args.errorMessage !== undefined ? { errorMessage: args.errorMessage } : {}),
      ...(args.errorNodeId !== undefined ? { errorNodeId: args.errorNodeId } : {}),
      ...(args.status === "running" && !run?.startedAt ? { startedAt: now } : {}),
      ...(args.completedAt !== undefined ? { completedAt: args.completedAt } : {}),
      updatedAt: now,
    });
  },
});

export const transitionNodeState = internalMutation({
  args: {
    runId: v.id("workflowRuns"),
    nodeId: v.string(),
    status: workflowRunNodeStatusValidator,
    providerJob: v.optional(workflowRunProviderJobValidator),
    outputRefs: v.optional(v.array(workflowRunOutputRefValidator)),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("workflowRunNodeStates")
      .withIndex("by_run_node", (q) =>
        q.eq("workflowRunId", args.runId).eq("nodeId", args.nodeId)
      )
      .unique();
    if (!state) throw new Error(`Workflow run node state not found for ${args.nodeId}`);

    const now = Date.now();
    const existingProviderJobs = state.providerJobs ?? [];
    const isTerminalStatus = terminalNodeStatuses.has(args.status);

    await ctx.db.patch(state._id, {
      status: args.status,
      providerJobs: args.providerJob
        ? [...existingProviderJobs, args.providerJob]
        : state.providerJobs,
      outputRefs: args.outputRefs ?? state.outputRefs,
      costUsd: args.costUsd ?? state.costUsd,
      errorMessage: args.errorMessage,
      startedAt: args.startedAt ?? (args.status === "running" ? now : state.startedAt),
      completedAt: args.completedAt ?? (isTerminalStatus ? now : state.completedAt),
      updatedAt: now,
    });

    if (args.status !== "failed") return;

    const states = await ctx.db
      .query("workflowRunNodeStates")
      .withIndex("by_run", (q) => q.eq("workflowRunId", args.runId))
      .collect();

    const blockedNodeIds = new Set([args.nodeId]);
    let changed = true;

    while (changed) {
      changed = false;

      for (const candidateState of states) {
        if (blockedNodeIds.has(candidateState.nodeId)) continue;
        if (candidateState.dependencyNodeIds.some((nodeId) => blockedNodeIds.has(nodeId))) {
          blockedNodeIds.add(candidateState.nodeId);
          changed = true;
        }
      }
    }

    for (const dependentState of states) {
      const blockedByNodeIds = dependentState.dependencyNodeIds.filter((nodeId) =>
        blockedNodeIds.has(nodeId)
      );
      if (!blockedByNodeIds.length) continue;
      if (terminalNodeStatuses.has(dependentState.status)) continue;

      const mergedBlockedByNodeIds = new Set(dependentState.blockedByNodeIds ?? []);
      for (const nodeId of blockedByNodeIds) {
        mergedBlockedByNodeIds.add(nodeId);
      }

      await ctx.db.patch(dependentState._id, {
        status: "blocked",
        blockedByNodeIds: [...mergedBlockedByNodeIds].sort(),
        completedAt: now,
        updatedAt: now,
      });
    }
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
