import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  artifactLifecycleValidator,
  artifactTypeValidator,
  modelProviderValidator,
  reviewStatusValidator,
} from "../validators";

function reviewResolution(
  artifacts: Array<{ reviewStatus: string } | null>
): "approved" | "needs_revision" | "pending" {
  if (
    artifacts.some(
      (artifact) =>
        artifact?.reviewStatus === "needs_revision" ||
        artifact?.reviewStatus === "rejected"
    )
  ) {
    return "needs_revision";
  }

  if (
    artifacts.every(
      (artifact) =>
        artifact &&
        (artifact.reviewStatus === "approved" ||
          artifact.reviewStatus === "not_required")
    )
  ) {
    return "approved";
  }

  return "pending";
}

function appendRevisionRequest(
  artifact: Doc<"artifacts">,
  args: { note?: string; requestedBy: string; requestedAt: number }
) {
  const data =
    artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data)
      ? (artifact.data as Record<string, unknown>)
      : {};
  const existingRequests = Array.isArray(data.revisionRequests)
    ? data.revisionRequests
    : [];
  const note = args.note?.trim();
  const revisionRequest = {
    note: note || "Needs revision.",
    requestedBy: args.requestedBy,
    requestedAt: args.requestedAt,
  };

  return {
    ...data,
    latestRevisionNote: revisionRequest.note,
    revisionRequestCount: existingRequests.length + 1,
    revisionRequests: [...existingRequests, revisionRequest],
  };
}

function isLibraryArtifact(artifact: Doc<"artifacts">): boolean {
  return artifact.lifecycle === "saved" || artifact.lifecycle === undefined;
}

async function reconcileApprovalForArtifact(
  ctx: MutationCtx,
  artifact: Doc<"artifacts">
) {
  if (!artifact.workflowRunId || !artifact.workflowId) return;

  const plans = await ctx.db
    .query("distributionPlans")
    .withIndex("by_workflow_run", (q) =>
      q.eq("workflowRunId", artifact.workflowRunId!)
    )
    .collect();
  const relatedPlans = plans.filter((plan) =>
    plan.artifactIds.some((artifactId) => artifactId === artifact._id)
  );

  for (const plan of relatedPlans) {
    if (
      plan.status !== "waiting_for_approval" &&
      plan.status !== "needs_revision" &&
      plan.status !== "draft"
    ) {
      continue;
    }

    const planArtifacts = await Promise.all(
      plan.artifactIds.map((artifactId) => ctx.db.get(artifactId))
    );
    const resolution = reviewResolution(planArtifacts);
    const nextStatus =
      resolution === "approved"
        ? "draft"
        : resolution === "needs_revision"
          ? "needs_revision"
          : "waiting_for_approval";

    const statusChanged = plan.status !== nextStatus;
    if (statusChanged) {
      await ctx.db.patch(plan._id, {
        status: nextStatus,
        updatedAt: Date.now(),
      });
    }

    const run = await ctx.db.get(artifact.workflowRunId);
    if (run) {
      const nextRunStatus =
        resolution === "approved"
          ? "completed"
          : resolution === "needs_revision"
            ? "needs_revision"
            : "waiting_for_approval";

      if (
        run.status === "waiting_for_approval" ||
        run.status === "needs_revision" ||
        (run.status === "completed" && resolution === "needs_revision")
      ) {
        await ctx.db.patch(run._id, {
          status: nextRunStatus,
          summary:
            resolution === "approved"
              ? "Approved and ready for publishing."
              : resolution === "needs_revision"
                ? "Review requested revisions before publishing."
                : run.summary,
          completedAt: resolution === "approved" ? Date.now() : run.completedAt,
          updatedAt: Date.now(),
        });
      }
    }

    if (resolution !== "pending" && statusChanged) {
      await ctx.db.insert("workflowRunEvents", {
        userId: artifact.userId,
        workflowRunId: artifact.workflowRunId,
        workflowId: artifact.workflowId,
        type: "approval_resolved",
        message:
          resolution === "approved"
            ? "Distribution plan approved and ready for publishing."
            : "Distribution plan marked as needing revision.",
        data: {
          distributionPlanId: plan._id,
          status: nextStatus,
        },
        createdAt: Date.now(),
      });
    }
  }
}

export const list = query({
  args: {
    brandId: v.optional(v.id("brands")),
    contentRequestId: v.optional(v.id("contentRequests")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    includeDebug: v.optional(v.boolean()),
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

    if (args.contentRequestId) {
      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_content_request", (q) =>
          q.eq("contentRequestId", args.contentRequestId!)
        )
        .collect();
      return artifacts.filter((artifact) => args.includeDebug || isLibraryArtifact(artifact));
    }

    if (args.brandId) {
      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
      return artifacts.filter((artifact) => args.includeDebug || isLibraryArtifact(artifact));
    }

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
    return artifacts.filter((artifact) => args.includeDebug || isLibraryArtifact(artifact));
  },
});

export const getForRunner = internalQuery({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.artifactId);
  },
});

export const listForContentRequest = internalQuery({
  args: {
    requestId: v.id("contentRequests"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.requestId))
      .collect();
    return artifacts.filter((artifact) => artifact.userId === args.userId);
  },
});

export const getRegenerationContext = internalQuery({
  args: {
    artifactId: v.id("artifacts"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || artifact.userId !== args.userId) return null;

    const parentArtifacts = await Promise.all(
      (artifact.parentArtifactIds ?? []).map((parentArtifactId) =>
        ctx.db.get(parentArtifactId)
      )
    );
    const workflow = artifact.workflowId
      ? await ctx.db.get(artifact.workflowId)
      : null;

    return {
      artifact,
      parentArtifacts: parentArtifacts.filter(
        (parentArtifact): parentArtifact is Doc<"artifacts"> =>
          Boolean(parentArtifact && parentArtifact.userId === args.userId)
      ),
      workflow,
    };
  },
});

export const create = mutation({
  args: {
    brandId: v.optional(v.id("brands")),
    contentRequestId: v.optional(v.id("contentRequests")),
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
    lifecycle: v.optional(artifactLifecycleValidator),
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

export const createFromRunner = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    contentRequestId: v.optional(v.id("contentRequests")),
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
    lifecycle: v.optional(artifactLifecycleValidator),
    reviewStatus: v.optional(reviewStatusValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("artifacts", {
      ...args,
      reviewStatus: args.reviewStatus ?? "not_required",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateFromRunner = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    userId: v.string(),
    storageUrl: v.optional(v.string()),
    data: v.optional(v.any()),
    reviewStatus: v.optional(reviewStatusValidator),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || artifact.userId !== args.userId) {
      throw new Error("Artifact not found");
    }

    const patch: Partial<Doc<"artifacts">> = {
      updatedAt: Date.now(),
    };
    if (args.storageUrl !== undefined) patch.storageUrl = args.storageUrl;
    if (args.data !== undefined) patch.data = args.data;
    if (args.reviewStatus !== undefined) {
      patch.reviewStatus = args.reviewStatus;
    }

    await ctx.db.patch(args.artifactId, patch);
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

    await reconcileApprovalForArtifact(ctx, {
      ...artifact,
      reviewStatus: args.reviewStatus,
      updatedAt: Date.now(),
    });
  },
});

export const requestRevision = mutation({
  args: {
    id: v.id("artifacts"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const artifact = await ctx.db.get(args.id);
    if (!artifact || artifact.userId !== identity.subject) {
      throw new Error("Artifact not found");
    }

    const now = Date.now();
    const data = appendRevisionRequest(artifact, {
      note: args.note,
      requestedBy: identity.subject,
      requestedAt: now,
    });

    await ctx.db.patch(args.id, {
      reviewStatus: "needs_revision",
      data,
      updatedAt: now,
    });

    if (artifact.workflowRunId && artifact.workflowId) {
      await ctx.db.insert("workflowRunEvents", {
        userId: artifact.userId,
        workflowRunId: artifact.workflowRunId,
        workflowId: artifact.workflowId,
        type: "revision_requested",
        message: `Revision requested for ${artifact.title || artifact.type}.`,
        data: {
          artifactId: artifact._id,
          note: data.latestRevisionNote,
        },
        createdAt: now,
      });
    }

    await reconcileApprovalForArtifact(ctx, {
      ...artifact,
      reviewStatus: "needs_revision",
      data,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const artifact = await ctx.db.get(args.id);
    if (!artifact || artifact.userId !== identity.subject) {
      throw new Error("Artifact not found");
    }

    if (artifact.workflowRunId) {
      const plans = await ctx.db
        .query("distributionPlans")
        .withIndex("by_workflow_run", (q) =>
          q.eq("workflowRunId", artifact.workflowRunId!)
        )
        .collect();

      for (const plan of plans) {
        if (plan.userId !== identity.subject) continue;
        if (!plan.artifactIds.some((artifactId) => artifactId === args.id)) {
          continue;
        }

        const artifactIds = plan.artifactIds.filter(
          (artifactId) => artifactId !== args.id
        );
        if (artifactIds.length === 0) {
          await ctx.db.delete(plan._id);
        } else {
          await ctx.db.patch(plan._id, {
            artifactIds,
            updatedAt: Date.now(),
          });
        }
      }
    }

    const data =
      artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data)
        ? artifact.data as Record<string, unknown>
        : {};
    const storageIds = [data.storageId, data.publishStorageId].filter(
      (value): value is Id<"_storage"> => typeof value === "string"
    );
    for (const storageId of storageIds) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        // Storage cleanup is best-effort; deleting the artifact row is the durable state.
      }
    }

    await ctx.db.delete(args.id);
  },
});
