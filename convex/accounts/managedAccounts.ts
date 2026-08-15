import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, mutation, query } from "../_generated/server";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import {
  accountAutopilotValidator,
  accountPlaybookValidator,
} from "../validators";
import { requireAccountPostAccess, requireSocialAccountAccess } from "./accountAccess";
import { nextAutopilotRunAt } from "./accountCadence";
import { withResolvedAccountAvatar } from "./profileImages";

export const get = query({
  args: { id: v.id("socialAccounts") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const account = await requireSocialAccountAccess(ctx, args.id, identity.subject);
    const posts = await ctx.db
      .query("accountPosts")
      .withIndex("by_social_account", (q) => q.eq("socialAccountId", account._id))
      .order("desc")
      .take(50);
    const runs = await ctx.db
      .query("accountAgentRuns")
      .withIndex("by_social_account_and_created_at", (q) =>
        q.eq("socialAccountId", account._id)
      )
      .order("desc")
      .take(30);
    const insights = await ctx.db
      .query("accountInsights")
      .withIndex("by_social_account", (q) => q.eq("socialAccountId", account._id))
      .order("desc")
      .take(50);
    const links = await ctx.db
      .query("accountReferences")
      .withIndex("by_social_account", (q) => q.eq("socialAccountId", account._id))
      .take(100);
    const references = [];
    for (const link of links) {
      const asset = await ctx.db.get(link.creativeAssetId);
      if (asset) references.push({ ...link, asset });
    }
    const pendingApprovalCount = posts.filter((post) => post.status === "awaiting_approval").length;
    const publishedCount = posts.filter((post) => post.status === "published").length;
    return {
      account: await withResolvedAccountAvatar(ctx, account),
      insights,
      pendingApprovalCount,
      posts,
      publishedCount,
      references,
      runs,
    };
  },
});

export const updatePlaybook = mutation({
  args: {
    id: v.id("socialAccounts"),
    playbook: accountPlaybookValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    await requireSocialAccountAccess(ctx, args.id, userId);
    await ctx.db.patch(args.id, {
      playbook: args.playbook,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateAgentSummary = mutation({
  args: {
    id: v.id("socialAccounts"),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    await requireSocialAccountAccess(ctx, args.id, userId);
    const summary = args.summary.trim();
    await ctx.db.patch(args.id, {
      agentSummary: summary || undefined,
      agentSummaryUpdatedAt: summary ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateAutopilot = mutation({
  args: {
    id: v.id("socialAccounts"),
    autopilot: accountAutopilotValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const account = await requireSocialAccountAccess(ctx, args.id, userId);
    const nextAccount = { ...account, autopilot: args.autopilot };
    await ctx.db.patch(args.id, {
      autopilot: args.autopilot,
      nextAutopilotRunAt: nextAutopilotRunAt(nextAccount),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setAutopilotStatus = mutation({
  args: {
    id: v.id("socialAccounts"),
    status: v.union(v.literal("off"), v.literal("active"), v.literal("paused")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const account = await requireSocialAccountAccess(ctx, args.id, userId);
    if (args.status === "active" && !account.autopilot) {
      throw new Error("Configure the account schedule before activating Autopilot");
    }
    const nextAccount = { ...account, autopilotStatus: args.status };
    await ctx.db.patch(args.id, {
      autopilotStatus: args.status,
      nextAutopilotRunAt: args.status === "active"
        ? nextAutopilotRunAt(nextAccount)
        : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const runNow = mutation({
  args: { id: v.id("socialAccounts") },
  returns: v.id("accountAgentRuns"),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const account = await requireSocialAccountAccess(ctx, args.id, userId);
    const now = Date.now();
    const runId = await ctx.db.insert("accountAgentRuns", {
      userId: account.userId,
      workspaceId: account.workspaceId,
      socialAccountId: account._id,
      trigger: "run_now",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.accounts.autopilotScheduling.startAccountAgentRun, {
      runId,
    });
    return runId;
  },
});

export const addReference = mutation({
  args: {
    id: v.id("socialAccounts"),
    creativeAssetId: v.id("creativeAssets"),
    role: v.union(
      v.literal("identity"),
      v.literal("style"),
      v.literal("voice"),
      v.literal("logo"),
      v.literal("negative_reference"),
      v.literal("other")
    ),
    instruction: v.optional(v.string()),
  },
  returns: v.id("accountReferences"),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const account = await requireSocialAccountAccess(ctx, args.id, userId);
    const asset = await ctx.db.get(args.creativeAssetId);
    if (!asset || (account.workspaceId
      ? asset.workspaceId !== account.workspaceId
      : asset.userId !== userId)) {
      throw new Error("Reference asset not found");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("accountReferences")
      .withIndex("by_social_account_and_asset", (q) =>
        q.eq("socialAccountId", account._id).eq("creativeAssetId", asset._id)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        instruction: args.instruction?.trim() || undefined,
        isActive: true,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("accountReferences", {
      userId,
      workspaceId: account.workspaceId,
      socialAccountId: account._id,
      creativeAssetId: asset._id,
      role: args.role,
      instruction: args.instruction?.trim() || undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setCharacterReference = mutation({
  args: {
    id: v.id("socialAccounts"),
    creativeAssetId: v.union(v.id("creativeAssets"), v.null()),
  },
  returns: v.union(v.id("accountReferences"), v.null()),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const account = await requireSocialAccountAccess(ctx, args.id, userId);
    const links = await ctx.db
      .query("accountReferences")
      .withIndex("by_social_account", (q) => q.eq("socialAccountId", account._id))
      .take(100);

    if (!args.creativeAssetId) {
      await Promise.all(
        links
          .filter((link) => link.role === "identity")
          .map((link) => ctx.db.delete(link._id))
      );
      return null;
    }

    const asset = await ctx.db.get(args.creativeAssetId);
    if (
      !asset ||
      asset.mediaType !== "image" ||
      (account.workspaceId
        ? asset.workspaceId !== account.workspaceId
        : asset.userId !== userId)
    ) {
      throw new Error("Character reference image not found");
    }

    const existing = links.find((link) => link.creativeAssetId === asset._id);
    await Promise.all(
      links
        .filter((link) => link.role === "identity" && link._id !== existing?._id)
        .map((link) => ctx.db.delete(link._id))
    );

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: "identity",
        instruction: undefined,
        isActive: true,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("accountReferences", {
      userId,
      workspaceId: account.workspaceId,
      socialAccountId: account._id,
      creativeAssetId: asset._id,
      role: "identity",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeReference = mutation({
  args: { id: v.id("accountReferences") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const link = await ctx.db.get(args.id);
    if (!link) throw new Error("Account reference not found");
    await requireSocialAccountAccess(ctx, link.socialAccountId, userId);
    await ctx.db.delete(link._id);
    return null;
  },
});

export const dismissInsight = mutation({
  args: { id: v.id("accountInsights") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const insight = await ctx.db.get(args.id);
    if (!insight) throw new Error("Account insight not found");
    await requireSocialAccountAccess(ctx, insight.socialAccountId, userId);
    await ctx.db.patch(insight._id, { status: "dismissed", updatedAt: Date.now() });
    return null;
  },
});

export const approvePost = action({
  args: { id: v.id("accountPosts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccessForAction(ctx);
    await ctx.runQuery(internal.publishing.accountPosts.requirePublishAccess, {
      id: args.id,
      userId: identity.subject,
    });
    await ctx.runMutation(internal.publishing.accountPosts.approveForPublish, {
      id: args.id,
      userId: identity.subject,
    });
    await ctx.runAction(internal.publishing.accountPosts.publishInternal, {
      id: args.id,
      mode: "now",
      userId: identity.subject,
    });
    return null;
  },
});

export const rejectPost = mutation({
  args: {
    id: v.id("accountPosts"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const post = await requireAccountPostAccess(ctx, args.id, userId);
    if (post.status !== "awaiting_approval") {
      throw new Error(`Post is ${post.status}, not awaiting approval`);
    }
    await ctx.db.patch(post._id, {
      status: "canceled",
      errorMessage: args.reason?.trim() || "Rejected by user",
      updatedAt: Date.now(),
    });
    return null;
  },
});
