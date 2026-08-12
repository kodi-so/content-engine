import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
} from "../_generated/server";
import { requireSocialAccountAccess } from "../accounts/accountAccess";
import { recordCreatedPostMemory } from "../accounts/accountMemory";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import { getPublishingProvider } from "../providers";
import {
  accountPostStatusValidator,
  publishingProviderValidator,
} from "../validators";
import { requireWorkspaceMember, resolveWritableWorkspace } from "../workspaces/workspaces";
import { replaceArtifactInPost } from "./approval";
import {
  compactMetrics,
  getAccountPostContext,
  loadPublishInput,
  mapProviderStatus,
} from "./publishInput";

export const list = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.optional(v.id("socialAccounts")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (args.socialAccountId) {
      await requireSocialAccountAccess(ctx, args.socialAccountId, identity.subject);
      return await ctx.db
        .query("accountPosts")
        .withIndex("by_social_account", (q) => q.eq("socialAccountId", args.socialAccountId!))
        .order("desc")
        .take(100);
    }
    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, identity.subject);
      return await ctx.db
        .query("accountPosts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("accountPosts")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .take(100);
  },
});

export const getPublishContext = internalQuery({
  args: {
    id: v.id("accountPosts"),
    userId: v.string(),
  },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.id);
    if (!post) return null;
    const account = await ctx.db.get(post.socialAccountId);
    if (!account) return null;
    if (account.workspaceId) {
      await requireWorkspaceMember(ctx, account.workspaceId, args.userId);
    } else if (account.userId !== args.userId) {
      return null;
    }
    const artifacts = await Promise.all(
      post.artifactIds.map((artifactId) => ctx.db.get(artifactId))
    );
    return {
      post,
      artifacts: artifacts.filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact)),
      socialAccounts: [account],
    };
  },
});

export const requirePublishAccess = internalQuery({
  args: {
    id: v.id("accountPosts"),
    userId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.id);
    if (!post) throw new Error("Account post not found");
    await requireSocialAccountAccess(ctx, post.socialAccountId, args.userId);
    return null;
  },
});

export const create = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.id("socialAccounts"),
    artifactIds: v.array(v.id("artifacts")),
    provider: publishingProviderValidator,
    status: v.optional(accountPostStatusValidator),
    scheduledFor: v.optional(v.number()),
    timezone: v.optional(v.string()),
    caption: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  returns: v.id("accountPosts"),
  handler: async (ctx, args) => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    const workspace = args.workspaceId
      ? await resolveWritableWorkspace(ctx, userId, args.workspaceId)
      : defaultWorkspace;
    const account = await requireSocialAccountAccess(ctx, args.socialAccountId, userId);
    if (account.workspaceId && account.workspaceId !== workspace._id) {
      throw new Error("Social account does not belong to this workspace");
    }
    for (const artifactId of args.artifactIds) {
      const artifact = await ctx.db.get(artifactId);
      if (!artifact || (artifact.workspaceId
        ? artifact.workspaceId !== workspace._id
        : artifact.userId !== userId)) {
        throw new Error("Artifact not found");
      }
    }
    const now = Date.now();
    const postId = await ctx.db.insert("accountPosts", {
      userId,
      workspaceId: workspace._id,
      socialAccountId: account._id,
      origin: "manual",
      status: args.status ?? "draft",
      artifactIds: args.artifactIds,
      provider: args.provider,
      scheduledFor: args.scheduledFor,
      timezone: args.timezone,
      caption: args.caption,
      providerPayload: args.providerPayload,
      createdAt: now,
      updatedAt: now,
    });
    for (const artifactId of args.artifactIds) {
      await ctx.db.patch(artifactId, {
        socialAccountId: account._id,
        accountPostId: postId,
        updatedAt: now,
      });
    }
    await recordCreatedPostMemory(ctx, {
      accountPostId: postId,
      artifactIds: args.artifactIds,
      caption: args.caption,
      socialAccountId: account._id,
      userId,
      workspaceId: workspace._id,
    });
    return postId;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("accountPosts"),
    status: accountPostStatusValidator,
    externalPostIds: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const post = await ctx.db.get(args.id);
    if (!post) throw new Error("Account post not found");
    await requireSocialAccountAccess(ctx, post.socialAccountId, identity.subject);
    await ctx.db.patch(post._id, {
      status: args.status,
      externalPostIds: args.externalPostIds,
      errorMessage: args.errorMessage,
      publishedAt: args.publishedAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("accountPosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const post = await ctx.db.get(args.id);
    if (!post) throw new Error("Account post not found");
    await requireSocialAccountAccess(ctx, post.socialAccountId, identity.subject);
    const metrics = await ctx.db
      .query("postMetrics")
      .withIndex("by_account_post", (q) => q.eq("accountPostId", post._id))
      .take(500);
    for (const metric of metrics) await ctx.db.delete(metric._id);
    await ctx.db.delete(post._id);
    return null;
  },
});

export const updateFromProvider = internalMutation({
  args: {
    id: v.id("accountPosts"),
    userId: v.string(),
    status: accountPostStatusValidator,
    externalPostIds: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    providerPayload: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.id);
    if (!post) throw new Error("Account post not found");
    await requireSocialAccountAccess(ctx, post.socialAccountId, args.userId);
    await ctx.db.patch(post._id, {
      status: args.status,
      externalPostIds: args.externalPostIds,
      errorMessage: args.errorMessage,
      publishedAt: args.publishedAt,
      providerPayload: args.providerPayload,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const approveForPublish = internalMutation({
  args: {
    id: v.id("accountPosts"),
    userId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.id);
    if (!post) throw new Error("Account post not found");
    await requireSocialAccountAccess(ctx, post.socialAccountId, args.userId);
    if (post.status !== "awaiting_approval") {
      throw new Error(`Post is ${post.status}, not awaiting approval`);
    }
    await ctx.db.patch(post._id, {
      status: "draft",
      errorMessage: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const replaceArtifact = mutation({
  args: {
    id: v.id("accountPosts"),
    oldArtifactId: v.id("artifacts"),
    newArtifactId: v.id("artifacts"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    return await replaceArtifactInPost(ctx, args, identity.subject);
  },
});

async function executePostPublish(
  ctx: ActionCtx,
  args: {
    id: Id<"accountPosts">;
    mode: "draft" | "schedule" | "now";
    userId: string;
  }
) {
  const context = await getAccountPostContext(ctx, args.id, args.userId);
  if (!context) throw new Error("Account post not found");
  if (context.post.status === "awaiting_approval") {
    throw new Error("Account post is still waiting for approval");
  }
  if (context.post.status === "needs_revision") {
    throw new Error("Account post needs revision before publishing");
  }
  if (context.post.status !== "draft" && context.post.status !== "failed") {
    throw new Error(`Account post cannot be published from ${context.post.status}`);
  }
  const provider = getPublishingProvider(context.post.provider);
  await ctx.runMutation(internal.publishing.accountPosts.updateFromProvider, {
    id: context.post._id,
    userId: args.userId,
    status: "publishing",
  });
  try {
    const input = await loadPublishInput(provider, context);
    const result = args.mode === "draft"
      ? await provider.createDraft(input)
      : args.mode === "schedule"
        ? await provider.schedulePost(input)
        : await provider.publishNow(input);
    await ctx.runMutation(internal.publishing.accountPosts.updateFromProvider, {
      id: context.post._id,
      userId: args.userId,
      status: mapProviderStatus(result.status),
      externalPostIds: result.externalPostIds,
      publishedAt: result.publishedAt,
      providerPayload: result.providerPayload,
    });
    return result;
  } catch (error) {
    await ctx.runMutation(internal.publishing.accountPosts.updateFromProvider, {
      id: context.post._id,
      userId: args.userId,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Publishing failed",
    });
    throw error;
  }
}

export const publish = action({
  args: {
    id: v.id("accountPosts"),
    mode: v.union(v.literal("draft"), v.literal("schedule"), v.literal("now")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccessForAction(ctx);
    return await executePostPublish(ctx, { ...args, userId: identity.subject });
  },
});

export const publishInternal = internalAction({
  args: {
    id: v.id("accountPosts"),
    mode: v.union(v.literal("draft"), v.literal("schedule"), v.literal("now")),
    userId: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => await executePostPublish(ctx, args),
});

export const syncStatus = action({
  args: { id: v.id("accountPosts") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccessForAction(ctx);
    const context = await getAccountPostContext(ctx, args.id, identity.subject);
    if (!context) throw new Error("Account post not found");
    if (!context.post.externalPostIds?.length) {
      throw new Error("Account post has no external post IDs");
    }
    const provider = getPublishingProvider(context.post.provider);
    const result = await provider.getPublicationStatus({
      externalPostIds: context.post.externalPostIds,
    });
    const firstFailure = result.posts.find((post) => post.status === "failed");
    const firstPublished = result.posts.find((post) => post.status === "published");
    const nextStatus = firstFailure
      ? "failed"
      : result.posts.every((post) => post.status === "published")
        ? "published"
        : result.posts.some((post) => post.status === "publishing")
          ? "publishing"
          : "scheduled";
    await ctx.runMutation(internal.publishing.accountPosts.updateFromProvider, {
      id: context.post._id,
      userId: identity.subject,
      status: nextStatus,
      externalPostIds: context.post.externalPostIds,
      errorMessage: firstFailure?.errorMessage,
      publishedAt: firstPublished?.publishedAt,
      providerPayload: result.raw,
    });
    return result;
  },
});

export const syncMetrics = action({
  args: { id: v.id("accountPosts") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccessForAction(ctx);
    const context = await getAccountPostContext(ctx, args.id, identity.subject);
    if (!context) throw new Error("Account post not found");
    if (!context.post.externalPostIds?.length) {
      throw new Error("Account post has no external post IDs");
    }
    const provider = getPublishingProvider(context.post.provider);
    const result = await provider.syncMetrics({
      externalPostIds: context.post.externalPostIds,
    });
    for (const metric of result.metrics) {
      await ctx.runMutation(internal.publishing.metrics.recordFromProvider, {
        userId: identity.subject,
        accountPostId: context.post._id,
        socialAccountId: context.post.socialAccountId,
        platform: context.socialAccounts[0].platform,
        externalPostId: metric.externalPostId,
        metrics: compactMetrics(metric.metrics),
        capturedAt: metric.capturedAt,
      });
    }
    return result;
  },
});
