import { v } from "convex/values";
import { action, mutation, query, type MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  distributionStatusValidator,
  publishingProviderValidator,
  reviewStatusValidator,
} from "../validators";

type RunDoc = Doc<"workflowRuns">;
type ArtifactDoc = Doc<"artifacts">;
type DistributionPlanDoc = Doc<"distributionPlans">;

function requireUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

async function getOwnedRun(ctx: MutationCtx, runId: Id<"workflowRuns">, userId: string) {
  const run = await ctx.db.get(runId);
  if (!run || run.userId !== userId) throw new Error("Workflow run not found");
  return run;
}

function runSummary(run: RunDoc) {
  return {
    workflowRunId: run._id,
    workflowId: run.workflowId,
    brandId: run.brandId,
    socialAccountId: run.socialAccountId,
    trigger: run.trigger,
    status: run.status,
    currentNodeId: run.currentNodeId,
    generatedTopic: run.generatedTopic,
    generatedHook: run.generatedHook,
    summary: run.summary,
    costUsd: run.costUsd,
    errorMessage: run.errorMessage,
    errorNodeId: run.errorNodeId,
    scheduledFor: run.scheduledFor,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function artifactSummary(artifact: ArtifactDoc) {
  return {
    artifactId: artifact._id,
    brandId: artifact.brandId,
    workflowId: artifact.workflowId,
    workflowRunId: artifact.workflowRunId,
    parentArtifactIds: artifact.parentArtifactIds,
    type: artifact.type,
    title: artifact.title,
    storageUrl: artifact.storageUrl,
    data: artifact.data,
    provider: artifact.provider,
    model: artifact.model,
    prompt: artifact.prompt,
    lifecycle: artifact.lifecycle,
    reviewStatus: artifact.reviewStatus,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

function distributionPlanSummary(plan: DistributionPlanDoc) {
  return {
    distributionPlanId: plan._id,
    brandId: plan.brandId,
    workflowId: plan.workflowId,
    workflowRunId: plan.workflowRunId,
    artifactIds: plan.artifactIds,
    socialAccountIds: plan.socialAccountIds,
    provider: plan.provider,
    status: plan.status,
    scheduledFor: plan.scheduledFor,
    timezone: plan.timezone,
    caption: plan.caption,
    externalPostIds: plan.externalPostIds,
    errorMessage: plan.errorMessage,
    publishedAt: plan.publishedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function isFinalArtifact(artifact: ArtifactDoc) {
  return artifact.lifecycle === "saved" ||
    artifact.lifecycle === undefined ||
    artifact.type === "publish_payload" ||
    artifact.reviewStatus === "pending" ||
    artifact.reviewStatus === "approved" ||
    artifact.reviewStatus === "needs_revision";
}

async function collectRunArtifacts(ctx: MutationCtx, runId: Id<"workflowRuns">, userId: string) {
  const artifacts = await ctx.db
    .query("artifacts")
    .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", runId))
    .collect();
  return artifacts.filter((artifact) => artifact.userId === userId);
}

export const listRuns = query({
  args: {
    workflowId: v.optional(v.id("workflows")),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const limit = Math.max(1, Math.min(args.limit ?? 50, 100));
    let runs: RunDoc[];

    if (args.workflowId) {
      const workflow = await ctx.db.get(args.workflowId);
      if (!workflow || workflow.userId !== userId) return [];
      runs = await ctx.db
        .query("workflowRuns")
        .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId!))
        .order("desc")
        .collect();
    } else {
      runs = await ctx.db
        .query("workflowRuns")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .collect();
    }

    return runs
      .filter((run) => !args.status || run.status === args.status)
      .slice(0, limit)
      .map(runSummary);
  },
});

export const inspectRun = query({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== userId) return null;

    const [workflow, nodeStates, events, artifacts, distributionPlans] = await Promise.all([
      ctx.db.get(run.workflowId),
      ctx.db
        .query("workflowRunNodeStates")
        .withIndex("by_run", (q) => q.eq("workflowRunId", args.runId))
        .collect(),
      ctx.db
        .query("workflowRunEvents")
        .withIndex("by_run", (q) => q.eq("workflowRunId", args.runId))
        .collect(),
      ctx.db
        .query("artifacts")
        .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", args.runId))
        .collect(),
      ctx.db
        .query("distributionPlans")
        .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", args.runId))
        .collect(),
    ]);

    return {
      run: runSummary(run),
      workflow: workflow && workflow.userId === userId
        ? {
            workflowId: workflow._id,
            name: workflow.name,
            contentFormat: workflow.contentFormat,
            isActive: workflow.isActive,
          }
        : null,
      nodeStates: nodeStates
        .filter((state) => state.userId === userId)
        .sort((a, b) => a.createdAt - b.createdAt),
      events: events
        .filter((event) => event.userId === userId)
        .sort((a, b) => a.createdAt - b.createdAt),
      artifacts: artifacts
        .filter((artifact) => artifact.userId === userId)
        .map(artifactSummary),
      distributionPlans: distributionPlans
        .filter((plan) => plan.userId === userId)
        .map(distributionPlanSummary),
    };
  },
});

export const inspectNodeOutput = query({
  args: {
    runId: v.id("workflowRuns"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== userId) return null;

    const nodeState = await ctx.db
      .query("workflowRunNodeStates")
      .withIndex("by_run_node", (q) =>
        q.eq("workflowRunId", args.runId).eq("nodeId", args.nodeId)
      )
      .unique();
    if (!nodeState || nodeState.userId !== userId) return null;

    const artifactIds = [
      ...new Set(
        (nodeState.outputRefs ?? []).flatMap((outputRef) => outputRef.artifactIds ?? [])
      ),
    ] as Id<"artifacts">[];
    const artifacts = await Promise.all(artifactIds.map((artifactId) => ctx.db.get(artifactId)));

    return {
      nodeState,
      artifacts: artifacts
        .filter((artifact): artifact is ArtifactDoc =>
          Boolean(artifact && artifact.userId === userId)
        )
        .map(artifactSummary),
    };
  },
});

export const listRunArtifacts = query({
  args: {
    runId: v.id("workflowRuns"),
    finalOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== userId) return [];

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", args.runId))
      .collect();

    return artifacts
      .filter((artifact) => artifact.userId === userId)
      .filter((artifact) => !args.finalOnly || isFinalArtifact(artifact))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(artifactSummary);
  },
});

export const listDistributionPlans = query({
  args: { runId: v.optional(v.id("workflowRuns")) },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());

    if (args.runId) {
      const run = await ctx.db.get(args.runId);
      if (!run || run.userId !== userId) return [];
      const plans = await ctx.db
        .query("distributionPlans")
        .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", args.runId!))
        .collect();
      return plans
        .filter((plan) => plan.userId === userId)
        .map(distributionPlanSummary);
    }

    const plans = await ctx.db
      .query("distributionPlans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return plans.map(distributionPlanSummary);
  },
});

export const setArtifactReviewStatus = mutation({
  args: {
    artifactId: v.id("artifacts"),
    reviewStatus: reviewStatusValidator,
  },
  handler: async (ctx, args) => {
    requireUserId(await ctx.auth.getUserIdentity());
    await ctx.runMutation(api.artifacts.records.setReviewStatus, {
      id: args.artifactId,
      reviewStatus: args.reviewStatus,
    });
    return args.artifactId;
  },
});

export const requestArtifactRevision = mutation({
  args: {
    artifactId: v.id("artifacts"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireUserId(await ctx.auth.getUserIdentity());
    await ctx.runMutation(api.artifacts.records.requestRevision, {
      id: args.artifactId,
      note: args.note,
    });
    return args.artifactId;
  },
});

export const createDistributionPlan = mutation({
  args: {
    runId: v.id("workflowRuns"),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    socialAccountIds: v.optional(v.array(v.id("socialAccounts"))),
    provider: publishingProviderValidator,
    status: v.optional(distributionStatusValidator),
    scheduledFor: v.optional(v.number()),
    timezone: v.optional(v.string()),
    caption: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const run = await getOwnedRun(ctx, args.runId, userId);
    const artifactIds = args.artifactIds?.length
      ? args.artifactIds
      : (await collectRunArtifacts(ctx, args.runId, userId))
          .filter(isFinalArtifact)
          .map((artifact) => artifact._id);

    if (artifactIds.length === 0) throw new Error("Distribution plan needs at least one artifact");

    const artifacts = await Promise.all(artifactIds.map((artifactId) => ctx.db.get(artifactId)));
    for (const artifact of artifacts) {
      if (!artifact || artifact.userId !== userId || artifact.workflowRunId !== args.runId) {
        throw new Error("Distribution plan artifact not found");
      }
    }

    const socialAccountIds = args.socialAccountIds ?? (
      run.socialAccountId ? [run.socialAccountId] : []
    );
    const socialAccounts = await Promise.all(
      socialAccountIds.map((socialAccountId) => ctx.db.get(socialAccountId))
    );
    for (const account of socialAccounts) {
      if (!account || account.userId !== userId) {
        throw new Error("Social account not found");
      }
      if (account.brandId && account.brandId !== run.brandId) {
        throw new Error("Social account does not belong to the run brand");
      }
    }

    const now = Date.now();
    return await ctx.db.insert("distributionPlans", {
      userId,
      brandId: run.brandId,
      workflowId: run.workflowId,
      workflowRunId: run._id,
      artifactIds,
      socialAccountIds,
      provider: args.provider,
      status: args.status ?? "draft",
      scheduledFor: args.scheduledFor,
      timezone: args.timezone,
      caption: args.caption,
      providerPayload: args.providerPayload,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDistributionPlanStatus = mutation({
  args: {
    distributionPlanId: v.id("distributionPlans"),
    status: distributionStatusValidator,
    externalPostIds: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireUserId(await ctx.auth.getUserIdentity());
    await ctx.runMutation(api.publishing.distributionPlans.updateStatus, {
      id: args.distributionPlanId,
      status: args.status,
      externalPostIds: args.externalPostIds,
      errorMessage: args.errorMessage,
      publishedAt: args.publishedAt,
    });
    return args.distributionPlanId;
  },
});

export const publishDistributionPlan = action({
  args: {
    distributionPlanId: v.id("distributionPlans"),
    mode: v.union(v.literal("schedule"), v.literal("now")),
  },
  handler: async (ctx, args): Promise<unknown> => {
    requireUserId(await ctx.auth.getUserIdentity());
    return await ctx.runAction(api.publishing.distributionPlans.publish, {
      id: args.distributionPlanId,
      mode: args.mode,
    });
  },
});
