import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { getPublishingProvider } from "../providers";
import type { Doc } from "../_generated/dataModel";
import {
  distributionStatusValidator,
  publishingProviderValidator,
} from "../validators";
import { replaceArtifactInPlan } from "./approval";
import {
  compactMetrics,
  getDistributionPlanContext,
  loadPublishInput,
  mapProviderStatus,
} from "./publishInput";

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("distributionPlans")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const getPublishContext = internalQuery({
  args: {
    id: v.id("distributionPlans"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.id);
    if (!plan || plan.userId !== args.userId) return null;

    const artifacts = await Promise.all(
      plan.artifactIds.map((artifactId) => ctx.db.get(artifactId))
    );
    const socialAccounts = await Promise.all(
      plan.socialAccountIds.map((accountId) => ctx.db.get(accountId))
    );

    return {
      plan,
      artifacts: artifacts.filter(
        (artifact): artifact is Doc<"artifacts"> =>
          Boolean(artifact && artifact.userId === args.userId)
      ),
      socialAccounts: socialAccounts.filter(
        (account): account is Doc<"socialAccounts"> =>
          Boolean(account && account.userId === args.userId)
      ),
    };
  },
});

export const create = mutation({
  args: {
    brandId: v.id("brands"),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    artifactIds: v.array(v.id("artifacts")),
    socialAccountIds: v.array(v.id("socialAccounts")),
    provider: publishingProviderValidator,
    status: v.optional(distributionStatusValidator),
    scheduledFor: v.optional(v.number()),
    timezone: v.optional(v.string()),
    caption: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.userId !== identity.subject) {
      throw new Error("Brand not found");
    }

    const now = Date.now();
    return await ctx.db.insert("distributionPlans", {
      userId: identity.subject,
      ...args,
      status: args.status ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createFromRunner = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.id("brands"),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    artifactIds: v.array(v.id("artifacts")),
    socialAccountIds: v.array(v.id("socialAccounts")),
    provider: publishingProviderValidator,
    status: v.optional(distributionStatusValidator),
    scheduledFor: v.optional(v.number()),
    timezone: v.optional(v.string()),
    caption: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("distributionPlans", {
      ...args,
      status: args.status ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("distributionPlans"),
    status: distributionStatusValidator,
    externalPostIds: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const plan = await ctx.db.get(args.id);
    if (!plan || plan.userId !== identity.subject) {
      throw new Error("Distribution plan not found");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      externalPostIds: args.externalPostIds,
      errorMessage: args.errorMessage,
      publishedAt: args.publishedAt,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("distributionPlans") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const plan = await ctx.db.get(args.id);
    if (!plan || plan.userId !== identity.subject) {
      throw new Error("Distribution plan not found");
    }

    const metrics = await ctx.db
      .query("postMetrics")
      .withIndex("by_distribution_plan", (q) => q.eq("distributionPlanId", args.id))
      .collect();
    for (const metric of metrics) {
      if (metric.userId === identity.subject) {
        await ctx.db.delete(metric._id);
      }
    }

    await ctx.db.delete(args.id);
  },
});

export const updateFromProvider = internalMutation({
  args: {
    id: v.id("distributionPlans"),
    userId: v.string(),
    status: distributionStatusValidator,
    externalPostIds: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.id);
    if (!plan || plan.userId !== args.userId) {
      throw new Error("Distribution plan not found");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      externalPostIds: args.externalPostIds,
      errorMessage: args.errorMessage,
      publishedAt: args.publishedAt,
      providerPayload: args.providerPayload,
      updatedAt: Date.now(),
    });
  },
});

export const replaceArtifact = mutation({
  args: {
    id: v.id("distributionPlans"),
    oldArtifactId: v.id("artifacts"),
    newArtifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    return await replaceArtifactInPlan(ctx, args, identity.subject);
  },
});

export const publish = action({
  args: {
    id: v.id("distributionPlans"),
    mode: v.union(v.literal("schedule"), v.literal("now")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const context = await getDistributionPlanContext(ctx, args.id, identity.subject);
    if (!context) throw new Error("Distribution plan not found");
    if (context.plan.status === "waiting_for_approval") {
      throw new Error("Distribution plan is still waiting for approval");
    }
    if (context.plan.status === "needs_revision") {
      throw new Error("Distribution plan needs revision before publishing");
    }
    if (context.plan.status !== "draft" && context.plan.status !== "failed") {
      throw new Error(`Distribution plan cannot be published from ${context.plan.status}`);
    }
    if (context.socialAccounts.length === 0) {
      throw new Error("Distribution plan has no target accounts");
    }

    const provider = getPublishingProvider(context.plan.provider);

    await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
      id: context.plan._id,
      userId: identity.subject,
      status: "publishing",
    });

    try {
      const input = await loadPublishInput(provider, context);
      const result =
        args.mode === "schedule"
          ? await provider.schedulePost(input)
          : await provider.publishNow(input);

      await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
        id: context.plan._id,
        userId: identity.subject,
        status: mapProviderStatus(result.status),
        externalPostIds: result.externalPostIds,
        publishedAt: result.publishedAt,
        providerPayload: result.providerPayload,
      });

      if (context.plan.workflowRunId && context.plan.workflowId) {
        await ctx.runMutation(internal.workflows.runs.recordEvent, {
          userId: identity.subject,
          workflowRunId: context.plan.workflowRunId,
          workflowId: context.plan.workflowId,
          type: args.mode === "schedule" ? "publish_requested" : "publish_completed",
          message:
            args.mode === "schedule"
              ? "Distribution plan scheduled through provider."
              : "Distribution plan published through provider.",
          data: result,
        });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publishing failed";
      await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
        id: context.plan._id,
        userId: identity.subject,
        status: "failed",
        errorMessage: message,
      });

      if (context.plan.workflowRunId && context.plan.workflowId) {
        await ctx.runMutation(internal.workflows.runs.recordEvent, {
          userId: identity.subject,
          workflowRunId: context.plan.workflowRunId,
          workflowId: context.plan.workflowId,
          type: "error",
          message,
        });
      }

      throw error;
    }
  },
});

export const syncStatus = action({
  args: { id: v.id("distributionPlans") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const context = await getDistributionPlanContext(ctx, args.id, identity.subject);
    if (!context) throw new Error("Distribution plan not found");
    if (!context.plan.externalPostIds || context.plan.externalPostIds.length === 0) {
      throw new Error("Distribution plan has no external post IDs");
    }

    const provider = getPublishingProvider(context.plan.provider);
    const result = await provider.getPublicationStatus({
      externalPostIds: context.plan.externalPostIds,
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

    await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
      id: context.plan._id,
      userId: identity.subject,
      status: nextStatus,
      externalPostIds: context.plan.externalPostIds,
      errorMessage: firstFailure?.errorMessage,
      publishedAt: firstPublished?.publishedAt,
      providerPayload: result.raw,
    });

    return result;
  },
});

export const syncMetrics = action({
  args: { id: v.id("distributionPlans") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const context = await getDistributionPlanContext(ctx, args.id, identity.subject);
    if (!context) throw new Error("Distribution plan not found");
    if (!context.plan.externalPostIds || context.plan.externalPostIds.length === 0) {
      throw new Error("Distribution plan has no external post IDs");
    }

    const provider = getPublishingProvider(context.plan.provider);
    const result = await provider.syncMetrics({
      externalPostIds: context.plan.externalPostIds,
    });
    const fallbackAccount = context.socialAccounts[0];
    if (!fallbackAccount) {
      throw new Error("Distribution plan has no target accounts");
    }

    for (const metric of result.metrics) {
      await ctx.runMutation(internal.publishing.metrics.recordFromProvider, {
        userId: identity.subject,
        brandId: context.plan.brandId,
        workflowId: context.plan.workflowId,
        workflowRunId: context.plan.workflowRunId,
        distributionPlanId: context.plan._id,
        socialAccountId: fallbackAccount._id,
        platform: fallbackAccount.platform,
        externalPostId: metric.externalPostId,
        metrics: compactMetrics(metric.metrics),
        capturedAt: metric.capturedAt,
      });
    }

    return result;
  },
});
