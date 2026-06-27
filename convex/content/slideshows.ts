import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireBetaAccess } from "../auth/users";
import { publishingProviderValidator, slideshowStatusValidator } from "../validators";
import { requireWorkspaceMember } from "../workspaces/workspaces";

const DEFAULT_PUBLISHING_PROVIDER = "post_bridge";

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

export const list = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    contentRequestId: v.optional(v.id("contentRequests")),
    workflowRunId: v.optional(v.id("workflowRuns")),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));

    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, userId);
      return await ctx.db
        .query("slideshows")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .collect();
    }

    if (args.contentRequestId) {
      const request = await ctx.db.get(args.contentRequestId);
      if (!request) return [];
      if (request.workspaceId) {
        await requireWorkspaceMember(ctx, request.workspaceId, userId);
      } else if (request.userId !== userId) {
        return [];
      }
      const rows = await ctx.db
        .query("slideshows")
        .withIndex("by_content_request", (q) =>
          q.eq("contentRequestId", args.contentRequestId!)
        )
        .collect();
      return rows.filter((row) =>
        request.workspaceId ? row.workspaceId === request.workspaceId : row.userId === userId
      );
    }

    if (args.workflowRunId) {
      const run = await ctx.db.get(args.workflowRunId);
      if (!run) return [];
      if (run.workspaceId) {
        await requireWorkspaceMember(ctx, run.workspaceId, userId);
      } else if (run.userId !== userId) {
        return [];
      }
      const rows = await ctx.db
        .query("slideshows")
        .withIndex("by_workflow_run", (q) =>
          q.eq("workflowRunId", args.workflowRunId!)
        )
        .collect();
      return rows.filter((row) =>
        run.workspaceId ? row.workspaceId === run.workspaceId : row.userId === userId
      );
    }

    return await ctx.db
      .query("slideshows")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getForRunner = internalQuery({
  args: { slideshowId: v.id("slideshows") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.slideshowId);
  },
});

export const get = query({
  args: { id: v.id("slideshows") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    const slideshow = await ctx.db.get(args.id);
    if (!slideshow) return null;
    if (slideshow.workspaceId) {
      await requireWorkspaceMember(ctx, slideshow.workspaceId, userId);
    } else if (slideshow.userId !== userId) {
      return null;
    }
    return slideshow;
  },
});

export const listForContentRequest = internalQuery({
  args: {
    requestId: v.id("contentRequests"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("slideshows")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.requestId))
      .collect();
    return rows.filter((row) => row.userId === args.userId);
  },
});

export const createFromRunner = internalMutation({
  args: {
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    brandId: v.optional(v.id("brands")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    contentRequestId: v.optional(v.id("contentRequests")),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    title: v.string(),
    status: v.optional(slideshowStatusValidator),
    spec: v.any(),
  },
  handler: async (ctx, args) => {
    const request = args.contentRequestId ? await ctx.db.get(args.contentRequestId) : null;
    const run = args.workflowRunId ? await ctx.db.get(args.workflowRunId) : null;
    const workflow = args.workflowId ? await ctx.db.get(args.workflowId) : null;
    const brand = args.brandId ? await ctx.db.get(args.brandId) : null;
    const workspaceId =
      args.workspaceId ??
      request?.workspaceId ??
      run?.workspaceId ??
      workflow?.workspaceId ??
      brand?.workspaceId;
    const now = Date.now();
    return await ctx.db.insert("slideshows", {
      ...args,
      workspaceId,
      status: args.status ?? "preview",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateFromRunner = internalMutation({
  args: {
    slideshowId: v.id("slideshows"),
    userId: v.string(),
    title: v.optional(v.string()),
    status: v.optional(slideshowStatusValidator),
    spec: v.optional(v.any()),
    savedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const slideshow = await ctx.db.get(args.slideshowId);
    if (!slideshow || slideshow.userId !== args.userId) {
      throw new Error("Slideshow not found");
    }

    const patch: Partial<Doc<"slideshows">> = {
      updatedAt: Date.now(),
    };
    if (args.title !== undefined) patch.title = args.title;
    if (args.status !== undefined) patch.status = args.status;
    if (args.spec !== undefined) patch.spec = args.spec;
    if (args.savedAt !== undefined) patch.savedAt = args.savedAt;

    await ctx.db.patch(args.slideshowId, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("slideshows") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    const slideshow = await ctx.db.get(args.id);
    if (!slideshow) {
      throw new Error("Slideshow not found");
    }
    if (slideshow.workspaceId) {
      await requireWorkspaceMember(ctx, slideshow.workspaceId, userId);
    } else if (slideshow.userId !== userId) {
      throw new Error("Slideshow not found");
    }
    await ctx.db.delete(args.id);
  },
});

export const createDraftDistributionPlanFromRenderedSlides = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    slides: v.array(
      v.object({
        slideId: v.string(),
        index: v.number(),
        storageId: v.string(),
        storageUrl: v.string(),
        mimeType: v.string(),
        fileSize: v.number(),
        width: v.number(),
        height: v.number(),
        sourceImageArtifactId: v.optional(v.id("artifacts")),
      })
    ),
    socialAccountIds: v.optional(v.array(v.id("socialAccounts"))),
    provider: v.optional(publishingProviderValidator),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"distributionPlans">> => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    const slideshow = await ctx.db.get(args.slideshowId);
    if (!slideshow) {
      throw new Error("Slideshow not found");
    }
    if (slideshow.workspaceId) {
      await requireWorkspaceMember(ctx, slideshow.workspaceId, userId);
    } else if (slideshow.userId !== userId) {
      throw new Error("Slideshow not found");
    }
    if (slideshow.status !== "saved") {
      throw new Error("Save the slideshow before creating a draft post");
    }
    if (args.slides.length === 0) {
      throw new Error("At least one rendered slide is required");
    }

    const socialAccountIds = args.socialAccountIds ?? (
      slideshow.socialAccountId ? [slideshow.socialAccountId] : []
    );
    for (const socialAccountId of socialAccountIds) {
      const account = await ctx.db.get(socialAccountId);
      if (
        !account ||
        (slideshow.workspaceId
          ? account.workspaceId !== slideshow.workspaceId
          : account.userId !== userId)
      ) {
        throw new Error("Social account not found");
      }
    }

    const now = Date.now();
    const artifactIds: Id<"artifacts">[] = [];
    for (const slide of [...args.slides].sort((first, second) => first.index - second.index)) {
      if (slide.sourceImageArtifactId) {
        const sourceArtifact = await ctx.db.get(slide.sourceImageArtifactId);
        if (
          !sourceArtifact ||
          (slideshow.workspaceId
            ? sourceArtifact.workspaceId !== slideshow.workspaceId
            : sourceArtifact.userId !== userId)
        ) {
          throw new Error("Source image artifact not found");
        }
      }
      const parentArtifactIds = slide.sourceImageArtifactId
        ? [slide.sourceImageArtifactId]
        : undefined;
      artifactIds.push(
        await ctx.db.insert("artifacts", {
          userId,
          workspaceId: slideshow.workspaceId,
          brandId: slideshow.brandId,
          contentRequestId: slideshow.contentRequestId,
          workflowId: slideshow.workflowId,
          workflowRunId: slideshow.workflowRunId,
          parentArtifactIds,
          type: "rendered_asset",
          title: `${slideshow.title} slide ${slide.index}`,
          storageUrl: slide.storageUrl,
          data: {
            format: "slideshow_rendered_slide",
            slideshowId: slideshow._id,
            slideId: slide.slideId,
            slideIndex: slide.index,
            storageId: slide.storageId,
            mimeType: slide.mimeType,
            fileSize: slide.fileSize,
            width: slide.width,
            height: slide.height,
            sourceImageArtifactId: slide.sourceImageArtifactId,
          },
          provider: "manual",
          lifecycle: "saved",
          reviewStatus: "approved",
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    const selectedProvider = args.provider ?? DEFAULT_PUBLISHING_PROVIDER;
    const caption = args.caption?.trim() || slideshow.title;
    return await ctx.db.insert("distributionPlans", {
      userId,
      workspaceId: slideshow.workspaceId,
      brandId: slideshow.brandId,
      workflowId: slideshow.workflowId,
      workflowRunId: slideshow.workflowRunId,
      artifactIds,
      socialAccountIds,
      provider: selectedProvider,
      status: "draft",
      caption,
      providerPayload: {
        source: "slideshow",
        slideshowId: slideshow._id,
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});
