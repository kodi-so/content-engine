import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  artifactLifecycleValidator,
  artifactTypeValidator,
  modelProviderValidator,
  reviewStatusValidator,
} from "../validators";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import { r2 } from "../storage/r2";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";

type WorkspaceOwnedRecord = {
  userId: string;
  workspaceId?: Id<"workspaces">;
};

async function hasRecordAccess(
  ctx: QueryCtx | MutationCtx,
  record: WorkspaceOwnedRecord,
  userId: string
) {
  if (record.workspaceId) {
    await requireWorkspaceMember(ctx, record.workspaceId, userId);
    return true;
  }
  return record.userId === userId;
}

function sameOwnershipScope(record: WorkspaceOwnedRecord, scope: WorkspaceOwnedRecord) {
  return scope.workspaceId
    ? record.workspaceId === scope.workspaceId
    : record.userId === scope.userId;
}

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

function recordData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function imageEditInstructionFromPrompt(prompt: string | undefined) {
  if (!prompt) return undefined;

  const userPromptMarker = "User prompt:";
  const suffix =
    "Use the provided reference image as the source image. Apply only the requested edit. Preserve the original subject, composition, framing, background, lighting, colors, camera angle, and style unless the requested edit directly requires a change.";
  const markerIndex = prompt.lastIndexOf(userPromptMarker);
  const userPrompt = markerIndex >= 0
    ? prompt.slice(markerIndex + userPromptMarker.length).trim()
    : prompt.trim();
  const [instruction] = userPrompt.split(`\n\n${suffix}`);
  return instruction?.trim() || userPrompt || undefined;
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
        workspaceId: artifact.workspaceId,
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
    workspaceId: v.optional(v.id("workspaces")),
    brandId: v.optional(v.id("brands")),
    contentRequestId: v.optional(v.id("contentRequests")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    includeDebug: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) return [];
    const userId = identity.subject;

    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, userId);
      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .collect();
      return artifacts.filter((artifact) => args.includeDebug || isLibraryArtifact(artifact));
    }

    if (args.workflowRunId) {
      const run = await ctx.db.get(args.workflowRunId);
      if (!run || !(await hasRecordAccess(ctx, run, userId))) return [];

      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_workflow_run", (q) =>
          q.eq("workflowRunId", args.workflowRunId!)
        )
        .collect();
      return artifacts.filter((artifact) => sameOwnershipScope(artifact, run));
    }

    if (args.contentRequestId) {
      const request = await ctx.db.get(args.contentRequestId);
      if (!request || !(await hasRecordAccess(ctx, request, userId))) return [];

      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_content_request", (q) =>
          q.eq("contentRequestId", args.contentRequestId!)
        )
        .collect();
      return artifacts.filter(
        (artifact) =>
          sameOwnershipScope(artifact, request) &&
          (args.includeDebug || isLibraryArtifact(artifact))
      );
    }

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || !(await hasRecordAccess(ctx, brand, userId))) return [];

      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
      return artifacts.filter(
        (artifact) =>
          sameOwnershipScope(artifact, brand) &&
          (args.includeDebug || isLibraryArtifact(artifact))
      );
    }

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
    if (!artifact || !(await hasRecordAccess(ctx, artifact, args.userId))) {
      return null;
    }

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
          Boolean(parentArtifact && sameOwnershipScope(parentArtifact, artifact))
      ),
      workflow,
    };
  },
});

export const create = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
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
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    const linkedRequest = args.contentRequestId ? await ctx.db.get(args.contentRequestId) : null;
    const linkedRun = args.workflowRunId ? await ctx.db.get(args.workflowRunId) : null;
    const linkedWorkflow = args.workflowId ? await ctx.db.get(args.workflowId) : null;
    const linkedBrand = args.brandId ? await ctx.db.get(args.brandId) : null;
    const workspace = args.workspaceId ||
      linkedRequest?.workspaceId ||
      linkedRun?.workspaceId ||
      linkedWorkflow?.workspaceId ||
      linkedBrand?.workspaceId
      ? await resolveWritableWorkspace(
        ctx,
        userId,
        args.workspaceId ??
          linkedRequest?.workspaceId ??
          linkedRun?.workspaceId ??
          linkedWorkflow?.workspaceId ??
          linkedBrand?.workspaceId
      )
      : defaultWorkspace;

    const now = Date.now();
    return await ctx.db.insert("artifacts", {
      userId,
      ...args,
      workspaceId: workspace._id,
      reviewStatus: args.reviewStatus ?? "not_required",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createFromRunner = internalMutation({
  args: {
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
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
    const linkedRequest = args.contentRequestId ? await ctx.db.get(args.contentRequestId) : null;
    const linkedRun = args.workflowRunId ? await ctx.db.get(args.workflowRunId) : null;
    const linkedWorkflow = args.workflowId ? await ctx.db.get(args.workflowId) : null;
    const linkedBrand = args.brandId ? await ctx.db.get(args.brandId) : null;
    const workspaceId =
      args.workspaceId ??
      linkedRequest?.workspaceId ??
      linkedRun?.workspaceId ??
      linkedWorkflow?.workspaceId ??
      linkedBrand?.workspaceId;
    const now = Date.now();
    return await ctx.db.insert("artifacts", {
      ...args,
      workspaceId,
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
    if (!artifact || !(await hasRecordAccess(ctx, artifact, args.userId))) {
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
    const { userId } = await ensureCurrentUser(ctx);

    const artifact = await ctx.db.get(args.id);
    if (!artifact || !(await hasRecordAccess(ctx, artifact, userId))) {
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

export const saveToLibrary = mutation({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);

    const artifact = await ctx.db.get(args.id);
    if (!artifact || !(await hasRecordAccess(ctx, artifact, userId))) {
      throw new Error("Artifact not found");
    }

    await ctx.db.patch(args.id, {
      lifecycle: "saved",
      reviewStatus: "approved",
      updatedAt: Date.now(),
    });
  },
});

export const updateTitle = mutation({
  args: {
    id: v.id("artifacts"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const artifact = await ctx.db.get(args.id);
    if (!artifact || !(await hasRecordAccess(ctx, artifact, userId))) {
      throw new Error("Artifact not found");
    }

    const title = args.title.trim();
    if (!title) {
      throw new Error("Title is required");
    }

    await ctx.db.patch(args.id, {
      title,
      updatedAt: Date.now(),
    });
  },
});

export const approveImageReplacement = mutation({
  args: {
    originalArtifactId: v.id("artifacts"),
    candidateArtifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const original = await ctx.db.get(args.originalArtifactId);
    const candidate = await ctx.db.get(args.candidateArtifactId);

    if (!original || !(await hasRecordAccess(ctx, original, userId))) {
      throw new Error("Original image not found");
    }
    if (!candidate || !(await hasRecordAccess(ctx, candidate, userId))) {
      throw new Error("Candidate image not found");
    }
    const candidateMatchesOriginalScope = sameOwnershipScope(candidate, original);
    const candidateCanJoinOriginalScope =
      !candidate.workspaceId &&
      candidate.userId === userId &&
      candidate.lifecycle === "preview";

    if (!candidateMatchesOriginalScope && !candidateCanJoinOriginalScope) {
      throw new Error("Candidate image is not in the same workspace");
    }
    if (original.type !== "image" || candidate.type !== "image") {
      throw new Error("Only image assets can be replaced");
    }
    if (!candidate.storageUrl) {
      throw new Error("Candidate image has no output");
    }

    const originalData = recordData(original.data);
    const candidateData = recordData(candidate.data);
    const revisionHistory = Array.isArray(originalData.revisionHistory)
      ? originalData.revisionHistory
      : [];
    const now = Date.now();
    const candidateUserPrompt = typeof candidateData.userPrompt === "string"
      ? candidateData.userPrompt
      : candidate.prompt;
    const latestEditPrompt = imageEditInstructionFromPrompt(candidateUserPrompt);

    await ctx.db.patch(original._id, {
      title: original.title ?? candidate.title,
      storageUrl: candidate.storageUrl,
      data: {
        ...originalData,
        ...candidateData,
        originalPrompt: typeof originalData.originalPrompt === "string"
          ? originalData.originalPrompt
          : original.prompt,
        latestEditPrompt,
        replacedArtifactId: original._id,
        replacementCandidateArtifactId: candidate._id,
        previousStorageUrl: original.storageUrl,
        revisionHistory: [
          ...revisionHistory,
          {
            artifactId: candidate._id,
            approvedAt: now,
            editPrompt: latestEditPrompt,
            prompt: candidate.prompt,
            provider: candidate.provider,
            model: candidate.model,
            storageUrl: candidate.storageUrl,
          },
        ],
      },
      provider: candidate.provider,
      model: candidate.model,
      prompt: original.prompt,
      lifecycle: "saved",
      reviewStatus: "not_required",
      updatedAt: now,
    });

    await ctx.db.patch(candidate._id, {
      workspaceId: original.workspaceId,
      storageUrl: undefined,
      data: {
        source: "library_image_replacement",
        approvedIntoArtifactId: original._id,
        approvedAt: now,
      },
      lifecycle: "discarded",
      reviewStatus: "not_required",
      updatedAt: now,
    });

    return original._id;
  },
});

export const requestRevision = mutation({
  args: {
    id: v.id("artifacts"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);

    const artifact = await ctx.db.get(args.id);
    if (!artifact || !(await hasRecordAccess(ctx, artifact, userId))) {
      throw new Error("Artifact not found");
    }

    const now = Date.now();
    const data = appendRevisionRequest(artifact, {
      note: args.note,
      requestedBy: userId,
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
        workspaceId: artifact.workspaceId,
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
    const { userId } = await ensureCurrentUser(ctx);

    const artifact = await ctx.db.get(args.id);
    if (!artifact || !(await hasRecordAccess(ctx, artifact, userId))) {
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
        if (!sameOwnershipScope(plan, artifact)) continue;
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
    const storageKeys = [data.storageId, data.publishStorageId].filter(
      (value): value is string => typeof value === "string"
    );
    for (const storageKey of storageKeys) {
      try {
        await r2.deleteObject(ctx, storageKey);
      } catch {
        // Storage cleanup is best-effort; deleting the artifact row is the durable state.
      }
    }

    await ctx.db.delete(args.id);
  },
});
