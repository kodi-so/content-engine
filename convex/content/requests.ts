import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { buildPlannerPrompt, inferSlideCount, normalizePlan } from "./planning";
import {
  slideshowPlanSchema,
  type SlideshowPlannerOutput,
  type SlideshowPlan,
  type SlideshowTextBlock,
} from "./types";
import {
  fetchImageDataUri,
  getSlideDimensions,
  renderSlideSvg,
} from "./slideshowRenderer";
import { getModelProvider } from "../providers/index";
import type {
  GeneratedAsset,
  ModelInvocationMetadata,
  ModelProvider,
} from "../providers/model";
import { contentRequestStatusValidator } from "../validators";

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

function sumCost(current: number, metadata?: ModelInvocationMetadata) {
  return current + (metadata?.costUsd ?? 0);
}

function providerImagePrompt(slidePrompt: string, aspectRatio: SlideshowPlan["aspectRatio"]) {
  const trimmed = slidePrompt.trim().replace(/\s+/g, " ");
  const hasBackgroundConstraint = /background image only/i.test(trimmed);
  return [
    trimmed,
    `Vertical ${aspectRatio} full-bleed image.`,
    hasBackgroundConstraint
      ? undefined
      : "Background image only, without embedded writing or graphic design elements.",
  ].filter(Boolean).join(" ");
}

async function createRequestArtifact(
  ctx: ActionCtx,
  args: {
    request: Doc<"contentRequests">;
    type: Doc<"artifacts">["type"];
    title?: string;
    storageUrl?: string;
    data?: unknown;
    provider?: "gemini" | "fal" | "openrouter" | "manual";
    model?: string;
    prompt?: string;
    parentArtifactIds?: Id<"artifacts">[];
  }
) {
  return await ctx.runMutation(internal.artifacts.records.createFromRunner, {
    userId: args.request.userId,
    brandId: args.request.brandId,
    contentRequestId: args.request._id,
    parentArtifactIds: args.parentArtifactIds,
    type: args.type,
    title: args.title,
    storageUrl: args.storageUrl,
    data: args.data,
    provider: args.provider,
    model: args.model,
    prompt: args.prompt,
    lifecycle: "preview",
    reviewStatus: "pending",
  });
}

async function waitForImageResult(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
  }
): Promise<GeneratedAsset | undefined> {
  if (!args.jobId) return undefined;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await provider.getJobStatus({
      jobId: args.jobId,
      model: args.model,
    });
    if (result.status === "succeeded") return result.assets?.[0];
    if (result.status === "failed" || result.status === "canceled") return undefined;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return undefined;
}

async function deleteArtifactsForRequest(
  ctx: MutationCtx,
  args: { requestId: Id<"contentRequests">; userId: string }
) {
  const artifacts = await ctx.db
    .query("artifacts")
    .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.requestId))
    .collect();

  for (const artifact of artifacts) {
    if (artifact.userId !== args.userId) continue;
    const data = artifact.data && typeof artifact.data === "object"
      ? artifact.data as Record<string, unknown>
      : {};
    const storageId = typeof data.storageId === "string" ? data.storageId as Id<"_storage"> : undefined;
    if (storageId) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        // Storage cleanup is best-effort; artifact rows are still the source of truth for the UI.
      }
    }
    await ctx.db.delete(artifact._id);
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    return await ctx.db
      .query("contentRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const createSlideshow = mutation({
  args: {
    brandId: v.id("brands"),
    socialAccountId: v.optional(v.id("socialAccounts")),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const prompt = args.prompt.trim();
    if (!prompt) throw new Error("Prompt is required");

    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.userId !== userId) throw new Error("Brand not found");

    if (args.socialAccountId) {
      const account = await ctx.db.get(args.socialAccountId);
      if (!account || account.userId !== userId) throw new Error("Social account not found");
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("contentRequests", {
      userId,
      brandId: args.brandId,
      socialAccountId: args.socialAccountId,
      contentFormat: "slideshow",
      prompt,
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
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const request = await ctx.db.get(args.id);
    if (!request || request.userId !== userId) throw new Error("Content request not found");
    const revisionPrompt = args.revisionPrompt.trim();
    if (!revisionPrompt) throw new Error("Revision prompt is required");

    await deleteArtifactsForRequest(ctx, { requestId: args.id, userId });
    await ctx.db.patch(args.id, {
      revisionPrompt,
      status: "queued",
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
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const request = await ctx.db.get(args.id);
    if (!request || request.userId !== userId) throw new Error("Content request not found");

    const now = Date.now();
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.id))
      .collect();

    for (const artifact of artifacts) {
      if (artifact.userId !== userId) continue;
      await ctx.db.patch(artifact._id, {
        lifecycle: "saved",
        reviewStatus: "approved",
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
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const request = await ctx.db.get(args.id);
    if (!request || request.userId !== userId) throw new Error("Content request not found");

    await deleteArtifactsForRequest(ctx, { requestId: args.id, userId });
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

    const brand = await ctx.db.get(request.brandId);
    const socialAccount = request.socialAccountId
      ? await ctx.db.get(request.socialAccountId)
      : null;

    if (!brand) return null;
    return { request, brand, socialAccount };
  },
});

export const transition = internalMutation({
  args: {
    requestId: v.id("contentRequests"),
    status: contentRequestStatusValidator,
    plan: v.optional(v.any()),
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
    if (args.summary !== undefined) patch.summary = args.summary;
    if (args.costUsd !== undefined) patch.costUsd = args.costUsd;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    if (args.completedAt !== undefined) patch.completedAt = args.completedAt;

    await ctx.db.patch(args.requestId, patch);
  },
});

function textBlocksFromEdit(args: {
  primaryText: string;
  secondaryText?: string;
  bullets?: string[];
}): SlideshowTextBlock[] {
  const blocks: SlideshowTextBlock[] = [
    {
      role: "headline",
      text: args.primaryText.trim(),
      items: [],
      emphasis: "primary",
    },
  ];

  const bullets = (args.bullets ?? []).filter((item) => item.trim()).slice(0, 4);
  if (bullets.length > 0) {
    blocks.push({
      role: "bullet_list",
      text: "",
      items: bullets,
      emphasis: "secondary",
    });
  } else if (args.secondaryText?.trim()) {
    blocks.push({
      role: "body",
      text: args.secondaryText.trim(),
      items: [],
      emphasis: "secondary",
    });
  }

  return blocks;
}

function slideFromArtifactData(data: Record<string, unknown>, textBlocks: SlideshowTextBlock[]) {
  const layout = data.layout && typeof data.layout === "object"
    ? data.layout as SlideshowPlan["slides"][number]["layout"]
    : {
        intent: "Readable mobile social slide with clear text hierarchy.",
        template: "center_punch" as const,
        textZone: "center" as const,
        density: "medium" as const,
        contrast: "gradient_scrim" as const,
        stylePreset: "dark_minimal_tiktok" as const,
      };

  return {
    slideId: typeof data.slideId === "string" ? data.slideId : `slide-${String(data.slideIndex ?? 1)}`,
    index: typeof data.slideIndex === "number" ? data.slideIndex : 1,
    role: typeof data.role === "string" ? data.role as SlideshowPlan["slides"][number]["role"] : "insight" as const,
    purpose: typeof data.purpose === "string" ? data.purpose : "Edited slide",
    visualPrompt: typeof data.visualPrompt === "string" ? data.visualPrompt : "",
    textBlocks,
    layout,
  };
}

export const deleteSlide = mutation({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || artifact.userId !== userId || artifact.type !== "rendered_slide") {
      throw new Error("Rendered slide not found");
    }

    const data = artifact.data && typeof artifact.data === "object"
      ? artifact.data as Record<string, unknown>
      : {};
    const storageId = typeof data.storageId === "string" ? data.storageId as Id<"_storage"> : undefined;
    if (storageId) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        // Best-effort cleanup; deleting the artifact row is the durable state change.
      }
    }

    await ctx.db.delete(args.artifactId);
  },
});

export const duplicateSlide = action({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args): Promise<Id<"artifacts">> => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const artifact: Doc<"artifacts"> | null = await ctx.runQuery(internal.artifacts.records.getForRunner, {
      artifactId: args.artifactId,
    });
    if (!artifact || artifact.userId !== userId || artifact.type !== "rendered_slide") {
      throw new Error("Rendered slide not found");
    }

    const siblings: Doc<"artifacts">[] = artifact.contentRequestId
      ? await ctx.runQuery(internal.artifacts.records.listForContentRequest, {
          requestId: artifact.contentRequestId,
          userId,
        })
      : [];
    const slideIndexes: number[] = siblings
      .filter((item: Doc<"artifacts">) => item.type === "rendered_slide")
      .map((item: Doc<"artifacts">) => {
        const data = item.data && typeof item.data === "object" ? item.data as Record<string, unknown> : {};
        return typeof data.slideIndex === "number" ? data.slideIndex : 0;
      });
    const nextSlideIndex: number = Math.max(0, ...slideIndexes) + 1;
    const data = artifact.data && typeof artifact.data === "object"
      ? artifact.data as Record<string, unknown>
      : {};
    const textBlocks = Array.isArray(data.textBlocks)
      ? data.textBlocks as SlideshowTextBlock[]
      : textBlocksFromEdit({ primaryText: artifact.title || "Duplicated slide" });
    const dimensions = getSlideDimensions(typeof data.aspectRatio === "string" ? data.aspectRatio : "9:16");
    const backgroundImageUrl =
      typeof data.backgroundImageUrl === "string" ? data.backgroundImageUrl : undefined;
    const backgroundImageDataUri = await fetchImageDataUri(backgroundImageUrl);
    const slide = slideFromArtifactData({
      ...data,
      slideIndex: nextSlideIndex,
      slideId: `slide-${nextSlideIndex}-copy-${Date.now()}`,
    }, textBlocks);
    const svg = renderSlideSvg({ dimensions, backgroundImageDataUri, slide });
    const storageId = await ctx.storage.store(new Blob([svg], { type: "image/svg+xml" }));
    const renderedImageUrl = await ctx.storage.getUrl(storageId) ?? undefined;
    return await ctx.runMutation(internal.artifacts.records.createFromRunner, {
      userId,
      brandId: artifact.brandId,
      contentRequestId: artifact.contentRequestId,
      workflowId: artifact.workflowId,
      workflowRunId: artifact.workflowRunId,
      parentArtifactIds: [artifact._id],
      type: "rendered_slide",
      title: `Slide ${nextSlideIndex}`,
      storageUrl: renderedImageUrl,
      data: {
        ...data,
        slideIndex: nextSlideIndex,
        slideId: slide.slideId,
        storageId,
        renderedImageUrl,
        backgroundEmbedded: Boolean(backgroundImageDataUri),
        duplicatedFromArtifactId: artifact._id,
      },
      provider: "manual",
      prompt: artifact.prompt,
      lifecycle: artifact.lifecycle,
      reviewStatus: "pending",
    });
  },
});

export const moveSlide = mutation({
  args: {
    artifactId: v.id("artifacts"),
    direction: v.union(v.literal("left"), v.literal("right")),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || artifact.userId !== userId || artifact.type !== "rendered_slide" || !artifact.contentRequestId) {
      throw new Error("Rendered slide not found");
    }

    const siblings = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", artifact.contentRequestId!))
      .collect();
    const slides = siblings
      .filter((item) => item.type === "rendered_slide" && item.userId === userId)
      .sort((first, second) => {
        const firstData = first.data && typeof first.data === "object" ? first.data as Record<string, unknown> : {};
        const secondData = second.data && typeof second.data === "object" ? second.data as Record<string, unknown> : {};
        const firstIndex = typeof firstData.slideIndex === "number" ? firstData.slideIndex : first.createdAt;
        const secondIndex = typeof secondData.slideIndex === "number" ? secondData.slideIndex : second.createdAt;
        return firstIndex - secondIndex;
      });
    const currentIndex = slides.findIndex((item) => item._id === args.artifactId);
    const targetIndex = args.direction === "left" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= slides.length) return;

    const current = slides[currentIndex];
    const target = slides[targetIndex];
    const currentData = current.data && typeof current.data === "object" ? current.data as Record<string, unknown> : {};
    const targetData = target.data && typeof target.data === "object" ? target.data as Record<string, unknown> : {};
    const currentSlideIndex = typeof currentData.slideIndex === "number" ? currentData.slideIndex : currentIndex + 1;
    const targetSlideIndex = typeof targetData.slideIndex === "number" ? targetData.slideIndex : targetIndex + 1;
    const now = Date.now();

    await ctx.db.patch(current._id, {
      title: `Slide ${targetSlideIndex}`,
      data: { ...currentData, slideIndex: targetSlideIndex },
      updatedAt: now,
    });
    await ctx.db.patch(target._id, {
      title: `Slide ${currentSlideIndex}`,
      data: { ...targetData, slideIndex: currentSlideIndex },
      updatedAt: now,
    });
  },
});

export const updateSlideText = action({
  args: {
    artifactId: v.id("artifacts"),
    primaryText: v.string(),
    secondaryText: v.optional(v.string()),
    bullets: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const artifact = await ctx.runQuery(internal.artifacts.records.getForRunner, {
      artifactId: args.artifactId,
    });
    if (!artifact || artifact.userId !== userId || artifact.type !== "rendered_slide") {
      throw new Error("Rendered slide not found");
    }
    const primaryText = args.primaryText.trim();
    if (!primaryText) throw new Error("Primary text is required");

    const data = artifact.data && typeof artifact.data === "object"
      ? artifact.data as Record<string, unknown>
      : {};
    const textBlocks = textBlocksFromEdit({
      primaryText,
      secondaryText: args.secondaryText,
      bullets: args.bullets,
    });
    const dimensions = getSlideDimensions(typeof data.aspectRatio === "string" ? data.aspectRatio : "9:16");
    const backgroundImageUrl =
      typeof data.backgroundImageUrl === "string" ? data.backgroundImageUrl : undefined;
    const backgroundImageDataUri = await fetchImageDataUri(backgroundImageUrl);
    const slide = slideFromArtifactData(data, textBlocks);
    const svg = renderSlideSvg({ dimensions, backgroundImageDataUri, slide });
    const storageId = await ctx.storage.store(new Blob([svg], { type: "image/svg+xml" }));
    const renderedImageUrl = await ctx.storage.getUrl(storageId) ?? undefined;
    const previousStorageId = typeof data.storageId === "string" ? data.storageId as Id<"_storage"> : undefined;
    if (previousStorageId) {
      try {
        await ctx.storage.delete(previousStorageId);
      } catch {
        // Best-effort cleanup; the artifact now points at the new render.
      }
    }

    await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
      artifactId: args.artifactId,
      userId,
      storageUrl: renderedImageUrl,
      data: {
        ...data,
        textBlocks,
        renderedImageUrl,
        storageId,
        backgroundEmbedded: Boolean(backgroundImageDataUri),
        editedAt: Date.now(),
      },
      reviewStatus: "pending",
    });

    return { renderedImageUrl };
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

      const slideCountHint = inferSlideCount(context.request.prompt);
      const textProvider = getModelProvider("openrouter");
      const structured = await textProvider.generateStructured<SlideshowPlannerOutput>({
        systemPrompt: "You are a senior short-form content creative director and slideshow planner.",
        prompt: buildPlannerPrompt({
          prompt: context.request.prompt,
          revisionPrompt: context.request.revisionPrompt,
          brand: context.brand,
          socialAccount: context.socialAccount,
          targetSlideCount: slideCountHint.targetSlideCount,
          slideCountReasoning: slideCountHint.reasoning,
        }),
        schema: slideshowPlanSchema,
        schemaName: "slideshow_create_plan",
        model: process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() || undefined,
        temperature: 0.7,
        parser: (text) => JSON.parse(text) as SlideshowPlannerOutput,
      });
      costUsd = sumCost(costUsd, structured.metadata);
      const plan = normalizePlan(
        structured.object,
        context.request.prompt,
        context.request.revisionPrompt,
        slideCountHint.targetSlideCount
      );

      await ctx.runMutation(internal.content.requests.transition, {
        requestId: args.requestId,
        status: "generating",
        plan,
        summary: plan.creativeBrief,
        costUsd,
      });

      const specArtifactId = await createRequestArtifact(ctx, {
        request: context.request,
        type: "slide_spec",
        title: plan.title,
        data: plan,
        provider: structured.metadata.provider,
        model: structured.metadata.model,
        prompt: context.request.prompt,
      });

      const imageProvider = getModelProvider("fal");
      const imageModel = process.env.CONTENT_ENGINE_IMAGE_MODEL?.trim() || "fal-ai/nano-banana";
      const imageBySlideIndex = new Map<number, { artifactId: Id<"artifacts">; url?: string }>();

      for (const slide of plan.slides) {
        const prompt = providerImagePrompt(slide.visualPrompt, plan.aspectRatio);
        try {
          const image = await imageProvider.generateImage({
            prompt,
            model: imageModel,
            aspectRatio: plan.aspectRatio,
            count: 1,
            metadata: {
              arguments: {
                aspect_ratio: plan.aspectRatio,
                output_format: "png",
              },
            },
          });
          costUsd = sumCost(costUsd, image.metadata);
          const asset = image.images[0] ?? await waitForImageResult(imageProvider, {
            jobId: image.jobId,
            model: image.metadata.model,
          });
          const url = asset?.url ?? asset?.data;
          const artifactId = await createRequestArtifact(ctx, {
            request: context.request,
            type: "image",
            title: `Slide ${slide.index} image`,
            storageUrl: url,
            data: {
              format: "slideshow_background",
              slideIndex: slide.index,
              url,
              jobId: image.jobId,
              status: asset ? "succeeded" : image.status ?? "queued",
              prompt,
            },
            provider: image.metadata.provider,
            model: image.metadata.model,
            prompt,
            parentArtifactIds: [specArtifactId],
          });
          imageBySlideIndex.set(slide.index, { artifactId, url });
        } catch (error) {
          await createRequestArtifact(ctx, {
            request: context.request,
            type: "image_prompt",
            title: `Slide ${slide.index} image prompt`,
            data: {
              slideIndex: slide.index,
              prompt,
              errorMessage: error instanceof Error ? error.message : "Image generation failed",
            },
            provider: "manual",
            prompt,
            parentArtifactIds: [specArtifactId],
          });
        }
      }

      await ctx.runMutation(internal.content.requests.transition, {
        requestId: args.requestId,
        status: "rendering",
        costUsd,
      });

      const dimensions = getSlideDimensions(plan.aspectRatio);
      for (const slide of plan.slides) {
        const image = imageBySlideIndex.get(slide.index);
        const backgroundImageDataUri = await fetchImageDataUri(image?.url);
        const svg = renderSlideSvg({
          dimensions,
          backgroundImageDataUri,
          slide,
        });
        const storageId = await ctx.storage.store(new Blob([svg], { type: "image/svg+xml" }));
        const renderedImageUrl = await ctx.storage.getUrl(storageId) ?? undefined;

        await createRequestArtifact(ctx, {
          request: context.request,
          type: "rendered_slide",
          title: `Slide ${slide.index}`,
          storageUrl: renderedImageUrl,
          data: {
            format: "rendered_slide",
            mimeType: "image/svg+xml",
            slideIndex: slide.index,
            aspectRatio: plan.aspectRatio,
            dimensions,
            renderedImageUrl,
            storageId,
            backgroundImageUrl: image?.url,
            backgroundEmbedded: Boolean(backgroundImageDataUri),
            slideId: slide.slideId,
            purpose: slide.purpose,
            textBlocks: slide.textBlocks,
            visualPrompt: slide.visualPrompt,
            layout: slide.layout,
            sourceSlideSpecArtifactId: specArtifactId,
            sourceImageArtifactId: image?.artifactId,
          },
          provider: "manual",
          parentArtifactIds: [
            specArtifactId,
            ...(image?.artifactId ? [image.artifactId] : []),
          ],
        });
      }

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
