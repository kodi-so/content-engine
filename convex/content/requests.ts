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
import { storeGeneratedAsset } from "./assetStorage";
import {
  IMAGE_PROMPT_WRITER_SYSTEM_PROMPT,
  buildSingleImagePromptWriterPrompt,
  normalizePlan,
  type RequestedRenderingMode,
} from "./planning";
import {
  type ImagePromptWriterOutput,
  type SingleImagePromptWriterOutput,
  type SlideshowPlannerOutput,
  type SlideshowPlan,
} from "./types";
import { getSlideDimensions } from "./slideshowDimensions";
import { buildCanonicalSlideshowSpec } from "./slideshowAdapter";
import { getModelProvider } from "../providers/index";
import type {
  GenerateImageResult,
  ModelProvider,
} from "../providers/model";
import { contentRequestStatusValidator } from "../validators";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import { waitForGeneratedImage } from "../workflows/runtime/generationWaiters";
import {
  createRequestArtifact,
  imageModelForRenderingMode,
  planPromptForMode,
  planSchemaForMode,
  plannerReferenceFromAsset,
  promptForSlide,
  providerImagePrompt,
  referenceInstructionFromMetadata,
  referenceAssetIdsForSlide,
  referenceImagesFromAssets,
  requestedRenderingModeValidator,
  singleImagePromptSchemaForMode,
  sumCost,
} from "./requestExecutionHelpers";
import {
  deleteArtifactsForRequest,
  deleteSlideshowsForRequest,
  normalizeCanonicalSpec,
} from "./slideshowRequestEditing";
import {
  applyRegeneratedSlideImageForRequest,
  deleteSlideForRequest,
  moveSlideForRequest,
  regenerateSlideImageForRequest,
  updateSlideImagePromptForRequest,
  updateSlideTextForRequest,
} from "./slideshowRequestMutations";

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
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

export const createSlideshow = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    brandId: v.optional(v.id("brands")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    prompt: v.string(),
    requestedRenderingMode: requestedRenderingModeValidator(),
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

    const brand = args.brandId ? await ctx.db.get(args.brandId) : null;
    if (args.brandId) {
      if (!brand) throw new Error("Brand not found");
      if (brand.workspaceId) {
        await requireWorkspaceMember(ctx, brand.workspaceId, userId);
      } else if (brand.userId !== userId) {
        throw new Error("Brand not found");
      }
    }

    const account = args.socialAccountId ? await ctx.db.get(args.socialAccountId) : null;
    if (args.socialAccountId) {
      if (!account) throw new Error("Social account not found");
      if (account.workspaceId) {
        await requireWorkspaceMember(ctx, account.workspaceId, userId);
      } else if (account.userId !== userId) {
        throw new Error("Social account not found");
      }
      if (brand && account.brandId && account.brandId !== brand._id) {
        throw new Error("Social account does not belong to the selected brand");
      }
    }
    const workspace = args.workspaceId || brand?.workspaceId || account?.workspaceId
      ? await resolveWritableWorkspace(
        ctx,
        userId,
        args.workspaceId ?? brand?.workspaceId ?? account?.workspaceId
      )
      : defaultWorkspace;
    if (brand?.workspaceId && brand.workspaceId !== workspace._id) {
      throw new Error("Brand does not belong to this workspace");
    }
    if (account?.workspaceId && account.workspaceId !== workspace._id) {
      throw new Error("Social account does not belong to this workspace");
    }

    const referenceAssets = [];
    for (const reference of args.referenceAssets ?? []) {
      const asset = await ctx.db.get(reference.assetId);
      if (
        !asset ||
        (asset.workspaceId ? asset.workspaceId !== workspace._id : asset.userId !== userId) ||
        (args.brandId && asset.brandId !== args.brandId)
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
      brandId: args.brandId,
      socialAccountId: args.socialAccountId,
      contentFormat: "slideshow",
      prompt,
      requestedRenderingMode: args.requestedRenderingMode ?? "background_plus_overlay",
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

    const brand = request.brandId ? await ctx.db.get(request.brandId) : null;
    const socialAccount = request.socialAccountId
      ? await ctx.db.get(request.socialAccountId)
      : null;

    if (request.brandId && !brand) return null;
    const referenceAssets = [];
    for (const reference of request.referenceAssets ?? []) {
      const asset = await ctx.db.get(reference.assetId);
      if (
        !asset ||
        (asset.workspaceId
          ? asset.workspaceId !== request.workspaceId
          : asset.userId !== request.userId) ||
        (request.brandId && asset.brandId !== request.brandId)
      ) continue;
      referenceAssets.push({
        asset,
        instruction: reference.instruction,
      });
    }

    return { request, brand, socialAccount, referenceAssets };
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
        asset.userId !== args.userId ||
        (request.brandId && asset.brandId !== request.brandId)
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
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.content.requests.getExecutionContext, {
      requestId: args.requestId,
    });
    if (!context) throw new Error("Content request not found");

    let costUsd = 0;
    try {
      await ctx.runMutation(internal.content.requests.transition, {
        requestId: args.requestId,
        status: "planning",
      });

      const requestedRenderingMode = (context.request.requestedRenderingMode ?? "background_plus_overlay") as RequestedRenderingMode;
      const plannerReferences = context.referenceAssets.map(({ asset, instruction }) =>
        plannerReferenceFromAsset(asset, instruction)
      );
      const textProvider = getModelProvider("openrouter");
      const structured = await textProvider.generateStructured<SlideshowPlannerOutput>({
        systemPrompt: "You are a senior short-form content creative director and slideshow planner.",
        prompt: planPromptForMode({
          prompt: context.request.prompt,
          revisionPrompt: context.request.revisionPrompt,
          brand: context.brand,
          socialAccount: context.socialAccount,
          requestedRenderingMode,
          references: plannerReferences,
        }),
        schema: planSchemaForMode(requestedRenderingMode),
        schemaName: "slideshow_create_plan",
        model: process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() || "openai/gpt-4.1",
        temperature: 0.7,
        parser: (text) => JSON.parse(text) as SlideshowPlannerOutput,
      });
      costUsd = sumCost(costUsd, structured.metadata);
      const rawSlides = Array.isArray((structured.object as { slides?: unknown }).slides)
        ? (structured.object as { slides: unknown[] }).slides
        : [];
      const imagePromptSlides = await Promise.all(rawSlides.map(async (slide) => {
        const imagePrompt = await textProvider.generateStructured<SingleImagePromptWriterOutput>({
          systemPrompt: IMAGE_PROMPT_WRITER_SYSTEM_PROMPT,
          prompt: buildSingleImagePromptWriterPrompt({
            prompt: context.request.prompt,
            revisionPrompt: context.request.revisionPrompt,
            brand: context.brand,
            socialAccount: context.socialAccount,
            requestedRenderingMode,
            references: plannerReferences,
            plan: structured.object,
            slide,
          }),
          schema: singleImagePromptSchemaForMode(requestedRenderingMode),
          schemaName: "slideshow_single_image_prompt",
          model: process.env.CONTENT_ENGINE_IMAGE_PROMPT_TEXT_MODEL?.trim() ||
            process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() ||
            "openai/gpt-4.1",
          temperature: 0.2,
          parser: (text) => JSON.parse(text) as SingleImagePromptWriterOutput,
        });
        costUsd = sumCost(costUsd, imagePrompt.metadata);
        return imagePrompt.object;
      }));
      const imagePrompts = {
        renderingMode: requestedRenderingMode,
        slides: imagePromptSlides,
      } as ImagePromptWriterOutput;
      const plan = normalizePlan(
        structured.object,
        imagePrompts,
        context.request.prompt,
        context.request.revisionPrompt,
        requestedRenderingMode
      );

      const specArtifactId = await createRequestArtifact(ctx, {
        request: context.request,
        type: "slide_spec",
        title: plan.title,
        data: plan,
        provider: structured.metadata.provider,
        model: structured.metadata.model,
        prompt: context.request.prompt,
      });

      await ctx.runMutation(internal.content.requests.transition, {
        requestId: args.requestId,
        status: "generating",
        planArtifactId: specArtifactId,
        summary: plan.creativeBrief,
        costUsd,
      });

      const referenceAssets = context.referenceAssets.map(({ asset }) => asset);
      const anySlideUsesReferences = plan.slides.some((slide) => slide.useReferenceImage === true);
      const referenceImages = anySlideUsesReferences
        ? await referenceImagesFromAssets(referenceAssets)
        : [];
      const imageModel = imageModelForRenderingMode(plan.renderingMode);
      const dimensions = getSlideDimensions(plan.aspectRatio);
      const imageBySlideIndex = new Map<number, { artifactId: Id<"artifacts">; url?: string }>();
      const imageErrors: string[] = [];
      const pendingImages: Array<{
        slide: SlideshowPlan["slides"][number];
        prompt: string;
        imageProvider: ModelProvider;
        referenceAssetIds: string[];
        image: GenerateImageResult;
      }> = [];

      for (const slide of plan.slides) {
        const prompt = providerImagePrompt(promptForSlide(slide), plan.aspectRatio, plan.renderingMode);
        const referenceImagesForSlide = slide.useReferenceImage === true ? referenceImages : [];
        const referenceAssetIds = referenceImagesForSlide.length > 0
          ? referenceAssetIdsForSlide(slide, referenceAssets)
          : [];
        const imageProviderName = referenceImagesForSlide.length > 0
          ? process.env.CONTENT_ENGINE_REFERENCE_IMAGE_PROVIDER?.trim() || "fal"
          : process.env.CONTENT_ENGINE_IMAGE_PROVIDER?.trim() || "fal";
        const imageProvider = getModelProvider(imageProviderName as "gemini" | "fal");
        try {
          const image = await imageProvider.generateImage({
            prompt,
            model: imageModel,
            aspectRatio: plan.aspectRatio,
            count: 1,
            referenceImages: referenceImagesForSlide.length > 0 ? referenceImagesForSlide : undefined,
            metadata: {
              arguments: {
                aspect_ratio: plan.aspectRatio,
                output_format: "png",
                resolution: "2K",
              },
              renderingMode: plan.renderingMode,
              useReferenceImage: slide.useReferenceImage === true,
              referenceAssetIds,
            },
          });
          costUsd = sumCost(costUsd, image.metadata);
          pendingImages.push({ slide, prompt, imageProvider, referenceAssetIds, image });
        } catch (error) {
          imageErrors.push(`Slide ${slide.index}: ${error instanceof Error ? error.message : "Image generation failed"}`);
          await createRequestArtifact(ctx, {
            request: context.request,
            type: "image_prompt",
            title: `Slide ${slide.index} image prompt`,
            data: {
              slideIndex: slide.index,
              prompt,
              referenceAssetIds,
              errorMessage: error instanceof Error ? error.message : "Image generation failed",
            },
            provider: "manual",
            prompt,
            parentArtifactIds: [specArtifactId],
          });
        }
      }

      const resolvedImages = await Promise.all(pendingImages.map(async (pending) => {
        try {
          const asset = pending.image.images[0] ?? await waitForGeneratedImage(pending.imageProvider, {
            jobId: pending.image.jobId,
            model: pending.image.metadata.model,
            metadata: pending.image.metadata,
          });
          return { ...pending, asset };
        } catch (error) {
          return {
            ...pending,
            errorMessage: error instanceof Error ? error.message : "Image generation failed",
          };
        }
      }));

      for (const result of resolvedImages) {
        if ("errorMessage" in result) {
          imageErrors.push(`Slide ${result.slide.index}: ${result.errorMessage}`);
          await createRequestArtifact(ctx, {
            request: context.request,
            type: "image_prompt",
            title: `Slide ${result.slide.index} image prompt`,
            data: {
              slideIndex: result.slide.index,
              prompt: result.prompt,
              errorMessage: result.errorMessage,
              jobId: result.image.jobId,
              provider: result.image.metadata.provider,
              model: result.image.metadata.model,
              statusUrl: typeof result.image.metadata.statusUrl === "string" ? result.image.metadata.statusUrl : undefined,
              responseUrl: typeof result.image.metadata.responseUrl === "string" ? result.image.metadata.responseUrl : undefined,
              useReferenceImage: result.slide.useReferenceImage === true,
              referenceAssetIds: result.referenceAssetIds,
            },
            provider: "manual",
            prompt: result.prompt,
            parentArtifactIds: [specArtifactId],
          });
          continue;
        }

        const stored = await storeGeneratedAsset(ctx, result.asset);
        const artifactId = await createRequestArtifact(ctx, {
          request: context.request,
          type: "image",
          title: `Slide ${result.slide.index} image`,
          storageUrl: stored.storageUrl,
          data: {
            format: plan.renderingMode === "full_graphic_generation"
              ? "slideshow_full_graphic"
              : "slideshow_background",
            slideIndex: result.slide.index,
            storageId: stored.storageId,
            mimeType: stored.mimeType,
            fileSize: stored.byteLength,
            width: dimensions.width,
            height: dimensions.height,
            jobId: result.image.jobId,
            status: "succeeded",
            renderingMode: plan.renderingMode,
            useReferenceImage: result.slide.useReferenceImage === true,
            referenceAssetIds: result.referenceAssetIds,
          },
          provider: result.image.metadata.provider,
          model: result.image.metadata.model,
          prompt: result.prompt,
          parentArtifactIds: [specArtifactId],
        });
        imageBySlideIndex.set(result.slide.index, { artifactId, url: stored.storageUrl });
      }

      if (imageErrors.length) {
        throw new Error(`Image generation failed for ${imageErrors.length} slide${imageErrors.length === 1 ? "" : "s"}: ${imageErrors.join("; ")}`);
      }

      const canonicalSpec = buildCanonicalSlideshowSpec({
        plan,
        dimensions,
        imageBySlideIndex,
      });
      await ctx.runMutation(internal.content.slideshows.createFromRunner, {
        userId: context.request.userId,
        brandId: context.request.brandId,
        socialAccountId: context.request.socialAccountId,
        contentRequestId: context.request._id,
        title: canonicalSpec.title,
        status: "preview",
        spec: canonicalSpec,
      });

      await ctx.runMutation(internal.content.requests.transition, {
        requestId: args.requestId,
        status: "ready",
        summary: `${plan.slides.length} slide preview ready.`,
        costUsd,
        completedAt: Date.now(),
      });
    } catch (error) {
      await ctx.runMutation(internal.content.requests.transition, {
        requestId: args.requestId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Content generation failed",
        costUsd,
        completedAt: Date.now(),
      });
    }
  },
});
