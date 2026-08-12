import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  artifactLifecycleValidator,
  artifactTypeValidator,
  modelProviderValidator,
  reviewStatusValidator,
} from "../validators";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  hasRecordAccess,
  sameOwnershipScope,
} from "./artifactAccess";
import {
  approveImageReplacementForUser,
  reconcileApprovalForArtifact,
  requestArtifactRevisionForUser,
} from "./artifactReviewActions";

function isLibraryArtifact(artifact: Doc<"artifacts">): boolean {
  return artifact.lifecycle === "saved" || artifact.lifecycle === undefined;
}

export const list = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    contentRequestId: v.optional(v.id("contentRequests")),
    accountAgentRunId: v.optional(v.id("accountAgentRuns")),
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

    if (args.accountAgentRunId) {
      const run = await ctx.db.get(args.accountAgentRunId);
      if (!run || !(await hasRecordAccess(ctx, run, userId))) return [];

      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_account_agent_run", (q) =>
          q.eq("accountAgentRunId", args.accountAgentRunId!)
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
    const accountPost = artifact.accountPostId
      ? await ctx.db.get(artifact.accountPostId)
      : null;

    return {
      artifact,
      parentArtifacts: parentArtifacts.filter(
        (parentArtifact): parentArtifact is Doc<"artifacts"> =>
          Boolean(parentArtifact && sameOwnershipScope(parentArtifact, artifact))
      ),
      accountPost,
    };
  },
});

export const create = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    contentRequestId: v.optional(v.id("contentRequests")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    accountPostId: v.optional(v.id("accountPosts")),
    accountAgentRunId: v.optional(v.id("accountAgentRuns")),
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
    const linkedRun = args.accountAgentRunId ? await ctx.db.get(args.accountAgentRunId) : null;
    const linkedPost = args.accountPostId ? await ctx.db.get(args.accountPostId) : null;
    const workspace = args.workspaceId ||
      linkedRequest?.workspaceId ||
      linkedRun?.workspaceId ||
      linkedPost?.workspaceId
      ? await resolveWritableWorkspace(
        ctx,
        userId,
        args.workspaceId ??
          linkedRequest?.workspaceId ??
          linkedRun?.workspaceId ??
          linkedPost?.workspaceId
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
    contentRequestId: v.optional(v.id("contentRequests")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    accountPostId: v.optional(v.id("accountPosts")),
    accountAgentRunId: v.optional(v.id("accountAgentRuns")),
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
    const linkedRun = args.accountAgentRunId ? await ctx.db.get(args.accountAgentRunId) : null;
    const linkedPost = args.accountPostId ? await ctx.db.get(args.accountPostId) : null;
    const workspaceId =
      args.workspaceId ??
      linkedRequest?.workspaceId ??
      linkedRun?.workspaceId ??
      linkedPost?.workspaceId;
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
    return await approveImageReplacementForUser(ctx, {
      ...args,
      userId,
    });
  },
});

export const requestRevision = mutation({
  args: {
    id: v.id("artifacts"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    await requestArtifactRevisionForUser(ctx, {
      artifactId: args.id,
      note: args.note,
      userId,
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

    if (artifact.accountPostId) {
      const post = await ctx.db.get(artifact.accountPostId);
      if (post && sameOwnershipScope(post, artifact)) {
        const artifactIds = post.artifactIds.filter(
          (artifactId) => artifactId !== args.id
        );
        if (artifactIds.length === 0) {
          await ctx.db.delete(post._id);
        } else {
          await ctx.db.patch(post._id, {
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
