import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import {
  contentRequestStatusValidator,
  modelProviderValidator,
} from "../validators";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  referenceInstructionFromMetadata,
  requestedRenderingModeValidator,
} from "./requestExecution/requestExecutionHelpers";
import {
  deleteArtifactsForRequest,
  deleteSlideshowsForRequest,
  normalizeCanonicalSpec,
} from "./slideshow/slideshowRequestEditing";
import {
  applyRegeneratedSlideImageForRequest,
  createSlideForRequest,
  deleteSlideForRequest,
  moveSlideForRequest,
  reorderSlidesForRequest,
  regenerateSlideImageForRequest,
  updateSlideshowAspectRatioForRequest,
  updateSlideImagePromptForRequest,
  updateSlideTextForRequest,
} from "./slideshow/slideshowRequestMutations";
import {
  executeContentRequest,
  type CreateGenerationPayload,
} from "./requestExecution/contentRequestExecution";

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

const createGenerationModeValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("lipsync"),
  v.literal("slideshow")
);

const createReferenceAssetValidator = v.object({
  url: v.string(),
  mimeType: v.string(),
  alias: v.optional(v.string()),
  description: v.optional(v.string()),
  storageId: v.optional(v.string()),
  temporary: v.optional(v.boolean()),
});

type CreateGenerationMode = "image" | "video" | "audio" | "lipsync" | "slideshow";

function storageIdFromUrl(url: string): Id<"_storage"> | null {
  const match = url.match(/\/api\/storage\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ? match[1] as Id<"_storage"> : null;
}

function temporaryReferenceStorageIds(request: Doc<"contentRequests">) {
  const generation = request.generation as CreateGenerationPayload | undefined;
  const references = [
    ...(generation?.referenceImages ?? []),
    ...(generation?.referenceVideos ?? []),
    ...(generation?.voiceReferenceAudios ?? []),
  ];
  const storageIds = new Set<Id<"_storage">>();

  for (const reference of references) {
    if (reference.temporary !== true) continue;
    const storageId = reference.storageId
      ? reference.storageId as Id<"_storage">
      : storageIdFromUrl(reference.url);
    if (storageId) storageIds.add(storageId);
  }

  return [...storageIds];
}

async function deleteTemporaryReferenceStorage(
  ctx: { storage: { delete: (storageId: Id<"_storage">) => Promise<void> } },
  request: Doc<"contentRequests">
) {
  const storageIds = temporaryReferenceStorageIds(request);
  await Promise.all(
    storageIds.map(async (storageId) => {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        // Temporary references are best-effort cleanup; generation status should still settle.
      }
    })
  );
}


function contentFormatForGenerationMode(mode: CreateGenerationMode) {
  switch (mode) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "lipsync":
      return "lipsync";
    case "slideshow":
      return "slideshow";
  }
}

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, userId);
      return await ctx.db
        .query("contentRequests")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("contentRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("contentRequests") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    const request = await ctx.db.get(args.id);
    if (!request) return null;
    if (request.workspaceId) {
      await requireWorkspaceMember(ctx, request.workspaceId, userId);
    } else if (request.userId !== userId) {
      return null;
    }
    return request;
  },
});

export const createGeneration = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    mode: createGenerationModeValidator,
    prompt: v.string(),
    provider: v.optional(modelProviderValidator),
    model: v.optional(v.string()),
    generationOperation: v.optional(v.string()),
    providerInput: v.optional(v.any()),
    aspectRatio: v.optional(v.string()),
    count: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    nativeAudio: v.optional(v.boolean()),
    resolution: v.optional(v.string()),
    audioMode: v.optional(v.string()),
    referenceImages: v.optional(v.array(createReferenceAssetValidator)),
    referenceVideos: v.optional(v.array(createReferenceAssetValidator)),
    voiceReferenceAudios: v.optional(v.array(createReferenceAssetValidator)),
    requestedRenderingMode: v.optional(requestedRenderingModeValidator()),
    referenceAssets: v.optional(
      v.array(
        v.object({
          assetId: v.id("creativeAssets"),
          instruction: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    const prompt = args.prompt.trim();
    if (!prompt) throw new Error("Prompt is required");

    const account = args.socialAccountId ? await ctx.db.get(args.socialAccountId) : null;
    if (args.socialAccountId) {
      if (!account) throw new Error("Social account not found");
      if (account.workspaceId) {
        await requireWorkspaceMember(ctx, account.workspaceId, userId);
      } else if (account.userId !== userId) {
        throw new Error("Social account not found");
      }
    }
    const workspace = args.workspaceId || account?.workspaceId
      ? await resolveWritableWorkspace(
        ctx,
        userId,
        args.workspaceId ?? account?.workspaceId
      )
      : defaultWorkspace;
    if (account?.workspaceId && account.workspaceId !== workspace._id) {
      throw new Error("Social account does not belong to this workspace");
    }

    const referenceAssets = [];
    for (const reference of args.referenceAssets ?? []) {
      const asset = await ctx.db.get(reference.assetId);
      if (
        !asset ||
        (asset.workspaceId ? asset.workspaceId !== workspace._id : asset.userId !== userId)
      ) {
        throw new Error("Reference asset not found");
      }
      const instruction = reference.instruction?.trim() || referenceInstructionFromMetadata(asset) || asset.description || "";
      referenceAssets.push({
        assetId: reference.assetId,
        instruction,
      });
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("contentRequests", {
      userId,
      workspaceId: workspace._id,
      socialAccountId: args.socialAccountId,
      contentFormat: contentFormatForGenerationMode(args.mode),
      prompt,
      requestedRenderingMode: args.requestedRenderingMode ?? "background_plus_overlay",
      generation: {
        mode: args.mode,
        provider: args.provider,
        model: args.model?.trim() || undefined,
        generationOperation: args.generationOperation?.trim() || undefined,
        providerInput: args.providerInput,
        aspectRatio: args.aspectRatio,
        count: args.count,
        durationSeconds: args.durationSeconds,
        nativeAudio: args.nativeAudio,
        resolution: args.resolution,
        audioMode: args.audioMode,
        referenceImages: args.referenceImages ?? [],
        referenceVideos: args.referenceVideos ?? [],
        voiceReferenceAudios: args.voiceReferenceAudios ?? [],
      },
      referenceAssets,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.content.requests.execute, { requestId });
    return requestId;
  },
});

export const reviseSlideshow = mutation({
  args: {
    id: v.id("contentRequests"),
    revisionPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Content request not found");
    if (request.workspaceId) {
      await requireWorkspaceMember(ctx, request.workspaceId, userId);
    } else if (request.userId !== userId) {
      throw new Error("Content request not found");
    }
    const revisionPrompt = args.revisionPrompt.trim();
    if (!revisionPrompt) throw new Error("Revision prompt is required");

    await deleteArtifactsForRequest(ctx, { requestId: args.id, userId: request.userId });
    await deleteSlideshowsForRequest(ctx, { requestId: args.id, userId: request.userId });
    await ctx.db.patch(args.id, {
      revisionPrompt,
      status: "queued",
      plan: undefined,
      planArtifactId: undefined,
      errorMessage: undefined,
      completedAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.content.requests.execute, { requestId: args.id });
  },
});

export const save = mutation({
  args: { id: v.id("contentRequests") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Content request not found");
    if (request.workspaceId) {
      await requireWorkspaceMember(ctx, request.workspaceId, userId);
    } else if (request.userId !== userId) {
      throw new Error("Content request not found");
    }
    const ownsRequestChild = (row: { userId: string; workspaceId?: Id<"workspaces"> }) =>
      request.workspaceId ? row.workspaceId === request.workspaceId : row.userId === userId;

    const now = Date.now();
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.id))
      .collect();

    for (const artifact of artifacts) {
      if (!ownsRequestChild(artifact)) continue;
      await ctx.db.patch(artifact._id, {
        lifecycle: "saved",
        reviewStatus: "approved",
        updatedAt: now,
      });
    }

    const slideshows = await ctx.db
      .query("slideshows")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.id))
      .collect();
    for (const slideshow of slideshows) {
      if (!ownsRequestChild(slideshow)) continue;
      await ctx.db.patch(slideshow._id, {
        status: "saved",
        savedAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.id, {
      status: "saved",
      savedAt: now,
      updatedAt: now,
    });
  },
});

export const discard = mutation({
  args: { id: v.id("contentRequests") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Content request not found");
    if (request.workspaceId) {
      await requireWorkspaceMember(ctx, request.workspaceId, userId);
    } else if (request.userId !== userId) {
      throw new Error("Content request not found");
    }

    await deleteArtifactsForRequest(ctx, { requestId: args.id, userId: request.userId });
    await deleteSlideshowsForRequest(ctx, { requestId: args.id, userId: request.userId });
    await deleteTemporaryReferenceStorage(ctx, request);
    await ctx.db.patch(args.id, {
      status: "discarded",
      updatedAt: Date.now(),
    });
  },
});

export const getExecutionContext = internalQuery({
  args: { requestId: v.id("contentRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;

    const socialAccount = request.socialAccountId
      ? await ctx.db.get(request.socialAccountId)
      : null;

    const referenceAssets = [];
    for (const reference of request.referenceAssets ?? []) {
      const asset = await ctx.db.get(reference.assetId);
      if (
        !asset ||
        (asset.workspaceId
          ? asset.workspaceId !== request.workspaceId
          : asset.userId !== request.userId)
      ) continue;
      referenceAssets.push({
        asset,
        instruction: reference.instruction,
      });
    }

    return { request, socialAccount, referenceAssets };
  },
});

export const getSlideRegenerationContext = internalQuery({
  args: {
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const slideshow = await ctx.db.get(args.slideshowId);
    if (!slideshow || slideshow.userId !== args.userId) return null;
    const spec = normalizeCanonicalSpec(slideshow.spec);
    const slide = spec.slides.find(
      (item) => item.slideId === args.slideId && item.status !== "deleted"
    );
    if (!slide) return null;

    const request = slideshow.contentRequestId
      ? await ctx.db.get(slideshow.contentRequestId)
      : null;
    if (!request || request.userId !== args.userId) return null;

    const referenceAssets = [];
    for (const reference of request.referenceAssets ?? []) {
      const asset = await ctx.db.get(reference.assetId);
      if (
        !asset ||
        asset.userId !== args.userId
      ) continue;
      referenceAssets.push(asset);
    }

    return { request, slideshow, spec, slide, referenceAssets };
  },
});

export const transition = internalMutation({
  args: {
    requestId: v.id("contentRequests"),
    status: contentRequestStatusValidator,
    plan: v.optional(v.any()),
    planArtifactId: v.optional(v.id("artifacts")),
    summary: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.requestId);
    if (!current) return;
    if (
      current.status === "discarded" &&
      (args.status === "ready" || args.status === "saved")
    ) {
      return;
    }

    const patch: Partial<Doc<"contentRequests">> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.status === "planning") patch.startedAt = Date.now();
    if (args.plan !== undefined) patch.plan = args.plan;
    if (args.planArtifactId !== undefined) patch.planArtifactId = args.planArtifactId;
    if (args.summary !== undefined) patch.summary = args.summary;
    if (args.costUsd !== undefined) patch.costUsd = args.costUsd;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    if (args.completedAt !== undefined) patch.completedAt = args.completedAt;

    await ctx.db.patch(args.requestId, patch);
    if (
      args.status === "ready" ||
      args.status === "failed" ||
      args.status === "discarded"
    ) {
      await deleteTemporaryReferenceStorage(ctx, current);
      await ctx.scheduler.runAfter(0, internal.create.agent.continueAfterAsyncResult, {
        contentRequestId: args.requestId,
      });
    }
  },
});

export const pauseSlideshowForDebugPromptReview = internalMutation({
  args: {
    requestId: v.id("contentRequests"),
    createThreadId: v.id("createThreads"),
    createToolCallId: v.optional(v.id("createToolCalls")),
    specArtifactId: v.id("artifacts"),
    prompts: v.array(
      v.object({
        slideIndex: v.number(),
        prompt: v.string(),
        textBlocks: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    const thread = await ctx.db.get(args.createThreadId);
    if (!request || !thread) return false;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      return false;
    }

    const checkpoints = await ctx.db
      .query("createCheckpoints")
      .withIndex("by_thread_status", (q) =>
        q.eq("createThreadId", thread._id).eq("status", "open")
      )
      .collect();
    if (checkpoints.length) {
      await ctx.db.patch(thread._id, {
        status: "waiting_for_user",
        updatedAt: Date.now(),
      });
      return true;
    }

    const now = Date.now();
    await ctx.db.insert("createCheckpoints", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      status: "open",
      label: "Review slideshow image prompts",
      message:
        "Debug Mode is pausing before image generation. Approve these slide image prompts to generate the slideshow, or ask for changes.",
      data: {
        kind: "slideshow_prompt_review",
        contentRequestId: request._id,
        createToolCallId: args.createToolCallId,
        planArtifactId: args.specArtifactId,
        prompts: args.prompts,
      },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("createMessages", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      role: "agent",
      kind: "status",
      content: "Paused for Debug Mode review. Approve the slideshow image prompts to continue, or ask for a revision.",
      createdAt: now,
    });
    await ctx.db.patch(thread._id, {
      status: "waiting_for_user",
      updatedAt: now,
    });

    return true;
  },
});

export const deleteSlide = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    await deleteSlideForRequest(ctx, { ...args, userId });
  },
});

export const createSlide = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    afterSlideId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    return await createSlideForRequest(ctx, { ...args, userId });
  },
});

export const moveSlide = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    direction: v.union(v.literal("left"), v.literal("right")),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    await moveSlideForRequest(ctx, { ...args, userId });
  },
});

export const reorderSlides = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    slideIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    await reorderSlidesForRequest(ctx, { ...args, userId });
  },
});

export const updateSlideshowAspectRatio = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    aspectRatio: v.union(v.literal("9:16"), v.literal("4:5"), v.literal("1:1")),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    await updateSlideshowAspectRatioForRequest(ctx, { ...args, userId });
  },
});

export const updateSlideText = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    textBlocks: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    await updateSlideTextForRequest(ctx, { ...args, userId });
  },
});

export const updateSlideImagePrompt = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    await updateSlideImagePromptForRequest(ctx, { ...args, userId });
  },
});

export const applyRegeneratedSlideImage = internalMutation({
  args: {
    slideshowId: v.id("slideshows"),
    userId: v.string(),
    slideId: v.string(),
    prompt: v.string(),
    useReferenceImage: v.optional(v.boolean()),
    storageUrl: v.string(),
    sourceImageArtifactId: v.string(),
  },
  handler: async (ctx, args) => {
    await applyRegeneratedSlideImageForRequest(ctx, args);
  },
});

export const regenerateSlideImage = action({
  args: {
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    prompt: v.string(),
    useReferenceImage: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ artifactId: Id<"artifacts">; storageUrl: string }> => {
    const userId = currentUserId(await requireBetaAccessForAction(ctx));
    return await regenerateSlideImageForRequest(ctx, { ...args, userId });
  },
});

export const execute = internalAction({
  args: { requestId: v.id("contentRequests") },
  handler: executeContentRequest,
});
