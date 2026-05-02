import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getPublishingProvider } from "./providers";
import type { Doc, Id } from "./_generated/dataModel";
import type { PublishContentInput, UploadedMedia } from "./providers/publishing";
import {
  distributionStatusValidator,
  publishingProviderValidator,
} from "./validators";

type DistributionPublishContext = {
  plan: Doc<"distributionPlans">;
  artifacts: Doc<"artifacts">[];
  socialAccounts: Doc<"socialAccounts">[];
};

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

function statusFromReviewResolution(
  resolution: "approved" | "needs_revision" | "pending"
): "draft" | "needs_revision" | "waiting_for_approval" {
  if (resolution === "approved") return "draft";
  if (resolution === "needs_revision") return "needs_revision";
  return "waiting_for_approval";
}

function replacementSourceId(artifact: Doc<"artifacts">): string | undefined {
  if (!artifact.data || typeof artifact.data !== "object") return undefined;

  const data = artifact.data as Record<string, unknown>;
  if (typeof data.sourceArtifactId === "string") return data.sourceArtifactId;

  const regeneration = data.regeneration;
  if (!regeneration || typeof regeneration !== "object") return undefined;

  const requestedFromArtifactId = (regeneration as Record<string, unknown>)
    .requestedFromArtifactId;
  return typeof requestedFromArtifactId === "string"
    ? requestedFromArtifactId
    : undefined;
}

export const replaceArtifact = mutation({
  args: {
    id: v.id("distributionPlans"),
    oldArtifactId: v.id("artifacts"),
    newArtifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const plan = await ctx.db.get(args.id);
    if (!plan || plan.userId !== identity.subject) {
      throw new Error("Distribution plan not found");
    }
    if (!plan.artifactIds.some((artifactId) => artifactId === args.oldArtifactId)) {
      throw new Error("Original artifact is not in this distribution plan");
    }

    const oldArtifact = await ctx.db.get(args.oldArtifactId);
    const newArtifact = await ctx.db.get(args.newArtifactId);
    if (!oldArtifact || oldArtifact.userId !== identity.subject) {
      throw new Error("Original artifact not found");
    }
    if (!newArtifact || newArtifact.userId !== identity.subject) {
      throw new Error("Replacement artifact not found");
    }
    if (oldArtifact.workflowRunId !== plan.workflowRunId) {
      throw new Error("Original artifact does not belong to this plan's workflow run");
    }
    if (newArtifact.workflowRunId !== plan.workflowRunId) {
      throw new Error("Replacement artifact must belong to the same workflow run");
    }

    const parentIds = new Set((newArtifact.parentArtifactIds ?? []).map(String));
    const sourceId = replacementSourceId(newArtifact);
    if (!parentIds.has(String(args.oldArtifactId)) && sourceId !== String(args.oldArtifactId)) {
      throw new Error("Replacement artifact is not linked to the original artifact");
    }

    const artifactIds = plan.artifactIds.map((artifactId) =>
      artifactId === args.oldArtifactId ? args.newArtifactId : artifactId
    );
    const planArtifacts = await Promise.all(
      artifactIds.map((artifactId) => ctx.db.get(artifactId))
    );
    const nextStatus = statusFromReviewResolution(reviewResolution(planArtifacts));
    const now = Date.now();

    await ctx.db.patch(plan._id, {
      artifactIds,
      status: nextStatus,
      errorMessage: undefined,
      providerPayload: {
        ...(plan.providerPayload &&
        typeof plan.providerPayload === "object" &&
        !Array.isArray(plan.providerPayload)
          ? (plan.providerPayload as Record<string, unknown>)
          : {}),
        replacement: {
          oldArtifactId: args.oldArtifactId,
          newArtifactId: args.newArtifactId,
          replacedAt: now,
        },
      },
      updatedAt: now,
    });

    if (plan.workflowRunId && plan.workflowId) {
      await ctx.db.insert("workflowRunEvents", {
        userId: identity.subject,
        workflowRunId: plan.workflowRunId,
        workflowId: plan.workflowId,
        type: "approval_resolved",
        message: "Distribution plan artifact replaced with regenerated output.",
        data: {
          distributionPlanId: plan._id,
          oldArtifactId: args.oldArtifactId,
          newArtifactId: args.newArtifactId,
          status: nextStatus,
        },
        createdAt: now,
      });

      const run = await ctx.db.get(plan.workflowRunId);
      if (
        run &&
        (run.status === "waiting_for_approval" ||
          run.status === "needs_revision" ||
          run.status === "completed")
      ) {
        await ctx.db.patch(run._id, {
          status: nextStatus === "draft" ? "completed" : nextStatus,
          summary:
            nextStatus === "draft"
              ? "Approved and ready for publishing."
              : nextStatus === "needs_revision"
                ? "Review requested revisions before publishing."
                : run.summary,
          completedAt: nextStatus === "draft" ? now : run.completedAt,
          updatedAt: now,
        });
      }
    }

    return { status: nextStatus, artifactIds };
  },
});

function extractArtifactText(artifacts: Doc<"artifacts">[]): string | undefined {
  for (const artifact of artifacts) {
    if (artifact.type !== "caption" && artifact.type !== "text_draft") continue;
    if (!artifact.data || typeof artifact.data !== "object") continue;

    const data = artifact.data as Record<string, unknown>;
    const text = data.text ?? data.caption ?? data.content;
    if (typeof text === "string" && text.trim()) {
      return text.trim();
    }
  }

  return undefined;
}

function inferMimeType(artifact: Doc<"artifacts">): string {
  if (artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as Record<string, unknown>;
    if (typeof data.mimeType === "string") return data.mimeType;
  }
  if (artifact.type === "video") return "video/mp4";
  if (artifact.type === "rendered_slide") return "image/svg+xml";
  if (!artifact.storageUrl) return "image/png";
  if (artifact.storageUrl.endsWith(".jpg") || artifact.storageUrl.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (artifact.storageUrl.endsWith(".webp")) return "image/webp";
  return "image/png";
}

async function mediaFromArtifact(
  provider: ReturnType<typeof getPublishingProvider>,
  artifact: Doc<"artifacts">
): Promise<UploadedMedia | null> {
  if (
    artifact.type !== "image" &&
    artifact.type !== "video" &&
    artifact.type !== "rendered_slide" &&
    artifact.type !== "rendered_asset" &&
    artifact.type !== "thumbnail"
  ) {
    return null;
  }

  const data = artifact.data && typeof artifact.data === "object"
    ? (artifact.data as Record<string, unknown>)
    : {};
  const externalMediaId = data.externalMediaId;
  if (typeof externalMediaId === "string") {
    return {
      externalMediaId,
      url: typeof data.url === "string" ? data.url : artifact.storageUrl,
      metadata: data,
    };
  }

  const source = typeof data.url === "string" ? data.url : artifact.storageUrl;
  if (!source) return null;

  const mimeType =
    typeof data.mimeType === "string" ? data.mimeType : inferMimeType(artifact);

  if (source.startsWith("data:")) {
    return await provider.uploadMedia({
      filename: `${artifact._id}.${mimeType.split("/").pop() ?? "bin"}`,
      mimeType,
      data: source,
      encoding: "base64",
    });
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not fetch artifact media: ${response.status}`);
  }

  return await provider.uploadMedia({
    filename: `${artifact._id}.${mimeType.split("/").pop() ?? "bin"}`,
    mimeType: response.headers.get("content-type") ?? mimeType,
    data: await response.arrayBuffer(),
  });
}

function mapProviderStatus(status: string):
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "canceled" {
  if (
    status === "draft" ||
    status === "scheduled" ||
    status === "publishing" ||
    status === "published" ||
    status === "failed" ||
    status === "canceled"
  ) {
    return status;
  }

  return "publishing";
}

function compactMetrics(metrics: {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  followersGained?: number;
}) {
  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => value !== undefined)
  ) as {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    clicks?: number;
    followersGained?: number;
  };
}

async function loadPublishInput(
  provider: ReturnType<typeof getPublishingProvider>,
  context: DistributionPublishContext
): Promise<PublishContentInput> {
  const text = context.plan.caption ?? extractArtifactText(context.artifacts);
  const media = (
    await Promise.all(
      context.artifacts.map((artifact) => mediaFromArtifact(provider, artifact))
    )
  ).filter((item): item is UploadedMedia => item !== null);

  return {
    targets: context.socialAccounts.map((account) => ({
      accountId: account.externalAccountId,
      platform:
        account.metadata &&
        typeof account.metadata === "object" &&
        typeof (account.metadata as Record<string, unknown>).identifier === "string"
          ? ((account.metadata as Record<string, unknown>).identifier as string)
          : account.platform,
      content: text,
      media,
    })),
    text,
    media,
    publishAt: context.plan.scheduledFor,
    timezone: context.plan.timezone,
    metadata: {
      distributionPlanId: context.plan._id,
    },
  };
}

async function getDistributionPlanContext(
  ctx: ActionCtx,
  id: Id<"distributionPlans">,
  userId: string
) : Promise<DistributionPublishContext | null> {
  return await ctx.runQuery(internal.distributionPlans.getPublishContext, {
    id,
    userId,
  });
}

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

    await ctx.runMutation(internal.distributionPlans.updateFromProvider, {
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

      await ctx.runMutation(internal.distributionPlans.updateFromProvider, {
        id: context.plan._id,
        userId: identity.subject,
        status: mapProviderStatus(result.status),
        externalPostIds: result.externalPostIds,
        publishedAt: result.publishedAt,
        providerPayload: result.providerPayload,
      });

      if (context.plan.workflowRunId && context.plan.workflowId) {
        await ctx.runMutation(internal.workflowRuns.recordEvent, {
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
      await ctx.runMutation(internal.distributionPlans.updateFromProvider, {
        id: context.plan._id,
        userId: identity.subject,
        status: "failed",
        errorMessage: message,
      });

      if (context.plan.workflowRunId && context.plan.workflowId) {
        await ctx.runMutation(internal.workflowRuns.recordEvent, {
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

    await ctx.runMutation(internal.distributionPlans.updateFromProvider, {
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
      await ctx.runMutation(internal.metrics.recordFromProvider, {
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
