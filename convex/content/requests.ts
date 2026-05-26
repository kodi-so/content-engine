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
import { storeGeneratedAsset } from "./assetStorage";
import {
  buildFullGraphicPlannerPrompt,
  IMAGE_PROMPT_WRITER_SYSTEM_PROMPT,
  buildOverlayPlannerPrompt,
  buildSingleImagePromptWriterPrompt,
  normalizePlan,
  type PlannerReference,
  type RequestedRenderingMode,
} from "./planning";
import {
  type CanonicalSlideshowSlide,
  type CanonicalSlideshowSpec,
  fullGraphicSlideshowPlanSchema,
  type ImagePromptWriterOutput,
  overlaySlideshowPlanSchema,
  singleFullGraphicImagePromptWriterSchema,
  type SingleImagePromptWriterOutput,
  singleOverlayImagePromptWriterSchema,
  type SlideshowPlannerOutput,
  type SlideshowPlan,
  type SlideshowTextBlock,
} from "./types";
import { getSlideDimensions } from "./slideshowDimensions";
import { buildCanonicalSlideshowSpec } from "./slideshowAdapter";
import { getModelProvider } from "../providers/index";
import type {
  GenerateImageResult,
  GeneratedAsset,
  ModelInvocationMetadata,
  ModelProvider,
  ModelProviderName,
  ReferenceAsset,
} from "../providers/model";
import { contentRequestStatusValidator } from "../validators";

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

function sumCost(current: number, metadata?: ModelInvocationMetadata) {
  return current + (metadata?.costUsd ?? 0);
}

const DEFAULT_OVERLAY_IMAGE_MODEL = "fal-ai/gemini-3.1-flash-image-preview";
const DEFAULT_FULL_GRAPHIC_IMAGE_MODEL = "fal-ai/gemini-3-pro-image-preview";

function imageModelForRenderingMode(renderingMode: SlideshowPlan["renderingMode"]): string {
  if (renderingMode === "full_graphic_generation") {
    return process.env.CONTENT_ENGINE_FULL_GRAPHIC_IMAGE_MODEL?.trim() ||
      DEFAULT_FULL_GRAPHIC_IMAGE_MODEL;
  }

  return process.env.CONTENT_ENGINE_IMAGE_MODEL?.trim() || DEFAULT_OVERLAY_IMAGE_MODEL;
}

function providerImagePrompt(
  slidePrompt: string,
  aspectRatio: SlideshowPlan["aspectRatio"],
  renderingMode: SlideshowPlan["renderingMode"]
) {
  const trimmed = normalizeImagePromptFormatting(slidePrompt);
  if (renderingMode === "full_graphic_generation") {
    return [
      trimmed,
      `Vertical ${aspectRatio} finished social slideshow graphic.`,
    ].join("\n\n");
  }
  return [
    trimmed,
    `Vertical ${aspectRatio} full-bleed image.`,
  ].filter(Boolean).join("\n\n");
}

function normalizeImagePromptFormatting(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function promptForSlide(slide: SlideshowPlan["slides"][number]) {
  return slide.renderingMode === "full_graphic_generation"
    ? slide.finalImagePrompt
    : slide.backgroundPrompt;
}

function referenceAssetIdsForSlide(
  slide: Pick<SlideshowPlan["slides"][number], "useReferenceImage">,
  assets: Array<{ _id: Id<"creativeAssets"> }>
) {
  return slide.useReferenceImage ? assets.map((asset) => String(asset._id)) : [];
}

function planPromptForMode(args: {
  prompt: string;
  revisionPrompt?: string;
  brand: Doc<"brands">;
  socialAccount?: Doc<"socialAccounts"> | null;
  requestedRenderingMode: RequestedRenderingMode;
  references: PlannerReference[];
}) {
  return args.requestedRenderingMode === "full_graphic_generation"
    ? buildFullGraphicPlannerPrompt(args)
    : buildOverlayPlannerPrompt(args);
}

function planSchemaForMode(renderingMode: RequestedRenderingMode) {
  return renderingMode === "full_graphic_generation"
    ? fullGraphicSlideshowPlanSchema
    : overlaySlideshowPlanSchema;
}

function singleImagePromptSchemaForMode(renderingMode: RequestedRenderingMode) {
  return renderingMode === "full_graphic_generation"
    ? singleFullGraphicImagePromptWriterSchema
    : singleOverlayImagePromptWriterSchema;
}

function requestedRenderingModeValidator() {
  return v.optional(
    v.union(
      v.literal("background_plus_overlay"),
      v.literal("full_graphic_generation")
    )
  );
}

function referenceInstructionFromMetadata(asset: Doc<"creativeAssets">): string | undefined {
  if (!asset.metadata || typeof asset.metadata !== "object") return undefined;
  const instruction = (asset.metadata as Record<string, unknown>).instruction;
  return typeof instruction === "string" && instruction.trim() ? instruction.trim() : undefined;
}

function plannerReferenceFromAsset(
  asset: Doc<"creativeAssets">,
  instruction?: string
): PlannerReference {
  return {
    assetId: String(asset._id),
    name: asset.name,
    type: asset.assetKind,
    description: asset.description,
    instruction: instruction?.trim() || referenceInstructionFromMetadata(asset),
  };
}

async function referenceImagesFromAssets(
  assets: Doc<"creativeAssets">[]
): Promise<ReferenceAsset[]> {
  return assets
    .filter((asset) => asset.mediaType === "image" && asset.storageUrl.trim())
    .map((asset) => ({
      url: asset.storageUrl,
      mimeType: "image/png",
      description: asset.description || asset.name,
    }));
}

async function createRequestArtifact(
  ctx: ActionCtx,
  args: {
    request: Doc<"contentRequests">;
    type: Doc<"artifacts">["type"];
    title?: string;
    storageUrl?: string;
    data?: unknown;
    provider?: ModelProviderName;
    model?: string;
    prompt?: string;
    parentArtifactIds?: Id<"artifacts">[];
  }
): Promise<Id<"artifacts">> {
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
    metadata?: Record<string, unknown>;
  }
): Promise<GeneratedAsset> {
  if (!args.jobId) throw new Error("Image generation did not return a job id");

  let lastStatus = "unknown";
  let lastError = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await provider.getJobStatus({
      jobId: args.jobId,
      model: args.model,
      metadata: args.metadata,
    });
    lastStatus = result.status;
    lastError = result.errorMessage ?? "";
    if (result.status === "succeeded") {
      const asset = result.assets?.[0];
      if (asset) return asset;
      throw new Error(`Image job ${args.jobId} succeeded but returned no assets`);
    }
    if (result.status === "failed" || result.status === "canceled") {
      throw new Error(`Image job ${args.jobId} ${result.status}${result.errorMessage ? `: ${result.errorMessage}` : ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Image job ${args.jobId} timed out after 5 minutes with status ${lastStatus}${lastError ? `: ${lastError}` : ""}`);
}

function normalizeCanonicalSpec(value: unknown): CanonicalSlideshowSpec {
  if (!value || typeof value !== "object") {
    throw new Error("Slideshow spec is missing");
  }
  return value as CanonicalSlideshowSpec;
}

function getArtifactData(artifact: Doc<"artifacts">): Record<string, unknown> {
  return artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data)
    ? artifact.data as Record<string, unknown>
    : {};
}

function activeSlides(spec: CanonicalSlideshowSpec) {
  return spec.slides
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

function renderingModeForSlide(
  spec: CanonicalSlideshowSpec,
  slide: CanonicalSlideshowSlide
): RequestedRenderingMode {
  return (slide.renderingMode ?? spec.renderingMode ?? "background_plus_overlay") as RequestedRenderingMode;
}

function reindexActiveSlides(spec: CanonicalSlideshowSpec): CanonicalSlideshowSpec {
  const activeIds = new Set(activeSlides(spec).map((slide) => slide.slideId));
  let index = 1;
  return {
    ...spec,
    slides: spec.slides.map((slide) => {
      if (!activeIds.has(slide.slideId)) return slide;
      const nextSlide = { ...slide, index, updatedAt: Date.now() };
      index += 1;
      return nextSlide;
    }),
  };
}

async function getOwnedSlideshow(
  ctx: MutationCtx,
  args: { slideshowId: Id<"slideshows">; userId: string }
) {
  const slideshow = await ctx.db.get(args.slideshowId);
  if (!slideshow || slideshow.userId !== args.userId) {
    throw new Error("Slideshow not found");
  }
  return slideshow;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(number, min), max);
}

function normalizeHexColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toUpperCase()
    : fallback;
}

function normalizeEditableTextBlocks(value: unknown): SlideshowTextBlock[] {
  if (!Array.isArray(value)) throw new Error("Text blocks are required");

  const blocks = value.map((item, index): SlideshowTextBlock | null => {
    if (!item || typeof item !== "object") return null;
    const block = item as Record<string, unknown>;
    const text = typeof block.text === "string"
      ? block.text.trim()
      : Array.isArray(block.items)
        ? block.items.filter((line) => typeof line === "string" && line.trim()).join("\n")
        : "";
    if (!text) return null;

    const role = index === 0 ? "headline" : "body";
    const emphasis = index === 0 ? "primary" : "secondary";
    const backgroundStyle = block.backgroundStyle === "solid" ? "solid" : "none";

    return {
      id: typeof block.id === "string" && block.id.trim()
        ? block.id.trim().slice(0, 64)
        : `text-${index + 1}`,
      role,
      text: text.slice(0, 280),
      items: [],
      emphasis,
      x: clampNumber(block.x, 10, 0, 96),
      y: clampNumber(block.y, index === 0 ? 42 : 56, 0, 96),
      width: clampNumber(block.width, 80, 12, 100),
      align: block.align === "left" || block.align === "right" ? block.align : "center",
      fontSize: clampNumber(block.fontSize, index === 0 ? 72 : 44, 20, 150),
      fontWeight: clampNumber(block.fontWeight, role === "body" ? 700 : 800, 400, 900),
      color: normalizeHexColor(block.color, "#FFFFFF"),
      strokeColor: normalizeHexColor(block.strokeColor, "#000000"),
      strokeWidth: clampNumber(block.strokeWidth, 16, 0, 48),
      backgroundStyle,
      backgroundColor: backgroundStyle === "solid" ? normalizeHexColor(block.backgroundColor, "#FFFFFF") : "#000000",
      backgroundOpacity: backgroundStyle === "solid" ? 1 : 0,
    };
  }).filter((block): block is SlideshowTextBlock => Boolean(block));

  if (!blocks.length) throw new Error("At least one text block is required");
  return blocks.slice(0, 12);
}

async function cleanupArtifactStorage(ctx: MutationCtx, artifact: Doc<"artifacts">) {
  const data = getArtifactData(artifact);
  const storageIds = [data.storageId, data.publishStorageId].filter(
    (value): value is Id<"_storage"> => typeof value === "string"
  );

  for (const storageId of storageIds) {
    try {
      await ctx.storage.delete(storageId);
    } catch {
      // Storage cleanup is best-effort; rows are still the durable state.
    }
  }
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
    await cleanupArtifactStorage(ctx, artifact);
    await ctx.db.delete(artifact._id);
  }
}

async function deleteSlideshowsForRequest(
  ctx: MutationCtx,
  args: { requestId: Id<"contentRequests">; userId: string }
) {
  const slideshows = await ctx.db
    .query("slideshows")
    .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.requestId))
    .collect();

  for (const slideshow of slideshows) {
    if (slideshow.userId === args.userId) {
      await ctx.db.delete(slideshow._id);
    }
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
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const prompt = args.prompt.trim();
    if (!prompt) throw new Error("Prompt is required");

    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.userId !== userId) throw new Error("Brand not found");

    if (args.socialAccountId) {
      const account = await ctx.db.get(args.socialAccountId);
      if (!account || account.userId !== userId) throw new Error("Social account not found");
    }

    const referenceAssets = [];
    for (const reference of args.referenceAssets ?? []) {
      const asset = await ctx.db.get(reference.assetId);
      if (!asset || asset.userId !== userId || asset.brandId !== args.brandId) {
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
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const request = await ctx.db.get(args.id);
    if (!request || request.userId !== userId) throw new Error("Content request not found");
    const revisionPrompt = args.revisionPrompt.trim();
    if (!revisionPrompt) throw new Error("Revision prompt is required");

    await deleteArtifactsForRequest(ctx, { requestId: args.id, userId });
    await deleteSlideshowsForRequest(ctx, { requestId: args.id, userId });
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

    const slideshows = await ctx.db
      .query("slideshows")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.id))
      .collect();
    for (const slideshow of slideshows) {
      if (slideshow.userId !== userId) continue;
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
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const request = await ctx.db.get(args.id);
    if (!request || request.userId !== userId) throw new Error("Content request not found");

    await deleteArtifactsForRequest(ctx, { requestId: args.id, userId });
    await deleteSlideshowsForRequest(ctx, { requestId: args.id, userId });
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
    const referenceAssets = [];
    for (const reference of request.referenceAssets ?? []) {
      const asset = await ctx.db.get(reference.assetId);
      if (!asset || asset.userId !== request.userId || asset.brandId !== request.brandId) continue;
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
      if (!asset || asset.userId !== args.userId || asset.brandId !== request.brandId) continue;
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
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const slideshow = await getOwnedSlideshow(ctx, { slideshowId: args.slideshowId, userId });
    const spec = normalizeCanonicalSpec(slideshow.spec);
    if (activeSlides(spec).length <= 1) throw new Error("A slideshow needs at least one slide");
    const deletedSlide = spec.slides.find(
      (slide) => slide.slideId === args.slideId && slide.status !== "deleted"
    );

    const nextSpec = reindexActiveSlides({
      ...spec,
      slides: spec.slides.map((slide) =>
        slide.slideId === args.slideId
          ? { ...slide, status: "deleted", updatedAt: Date.now() }
          : slide
      ),
    });

    await ctx.db.patch(slideshow._id, {
      spec: nextSpec,
      updatedAt: Date.now(),
    });

    if (deletedSlide?.sourceImageArtifactId) {
      const artifact = await ctx.db.get(deletedSlide.sourceImageArtifactId as Id<"artifacts">);
      if (artifact && artifact.userId === userId) {
        await cleanupArtifactStorage(ctx, artifact);
        await ctx.db.delete(artifact._id);
      }
    }
  },
});

export const moveSlide = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    direction: v.union(v.literal("left"), v.literal("right")),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const slideshow = await getOwnedSlideshow(ctx, { slideshowId: args.slideshowId, userId });
    const spec = normalizeCanonicalSpec(slideshow.spec);
    const slides = activeSlides(spec);
    const currentIndex = slides.findIndex((slide) => slide.slideId === args.slideId);
    const targetIndex = args.direction === "left" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= slides.length) return;

    const current = slides[currentIndex];
    const target = slides[targetIndex];
    const now = Date.now();
    const nextSpec = reindexActiveSlides({
      ...spec,
      slides: spec.slides.map((slide) => {
        if (slide.slideId === current.slideId) {
          return { ...slide, index: target.index, updatedAt: now };
        }
        if (slide.slideId === target.slideId) {
          return { ...slide, index: current.index, updatedAt: now };
        }
        return slide;
      }),
    });

    await ctx.db.patch(slideshow._id, {
      spec: nextSpec,
      updatedAt: now,
    });
  },
});

export const updateSlideText = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    textBlocks: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const slideshow = await getOwnedSlideshow(ctx, { slideshowId: args.slideshowId, userId });

    const spec = normalizeCanonicalSpec(slideshow.spec);
    const textBlocks = normalizeEditableTextBlocks(args.textBlocks);
    const nextSpec = {
      ...spec,
      slides: spec.slides.map((slide) =>
        slide.slideId === args.slideId &&
        slide.status !== "deleted" &&
        slide.renderingMode === "background_plus_overlay"
          ? { ...slide, textBlocks, updatedAt: Date.now() }
          : slide
      ),
    };

    await ctx.db.patch(slideshow._id, {
      spec: nextSpec,
      updatedAt: Date.now(),
    });
  },
});

export const updateSlideImagePrompt = mutation({
  args: {
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const slideshow = await getOwnedSlideshow(ctx, { slideshowId: args.slideshowId, userId });
    const prompt = normalizeImagePromptFormatting(args.prompt);
    if (!prompt) throw new Error("Image prompt is required");

    const spec = normalizeCanonicalSpec(slideshow.spec);
    const now = Date.now();
    const nextSpec = {
      ...spec,
      slides: spec.slides.map((slide) => {
        if (slide.slideId !== args.slideId || slide.status === "deleted") return slide;
        const renderingMode = renderingModeForSlide(spec, slide);
        return {
          ...slide,
          ...(renderingMode === "full_graphic_generation"
            ? { finalImagePrompt: prompt }
            : { backgroundPrompt: prompt }),
          updatedAt: now,
        };
      }),
    };

    await ctx.db.patch(slideshow._id, {
      spec: nextSpec,
      updatedAt: now,
    });
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
    const slideshow = await getOwnedSlideshow(ctx, { slideshowId: args.slideshowId, userId: args.userId });
    const spec = normalizeCanonicalSpec(slideshow.spec);
    const now = Date.now();
    const replacedSlide = spec.slides.find(
      (slide) => slide.slideId === args.slideId && slide.status !== "deleted"
    );
    const replacedArtifactId = replacedSlide?.sourceImageArtifactId;
    const nextSpec = {
      ...spec,
      slides: spec.slides.map((slide) => {
        if (slide.slideId !== args.slideId || slide.status === "deleted") return slide;
        const renderingMode = renderingModeForSlide(spec, slide);
        return {
          ...slide,
          ...(renderingMode === "full_graphic_generation"
            ? { finalImagePrompt: args.prompt }
            : { backgroundPrompt: args.prompt }),
          useReferenceImage: args.useReferenceImage === true ? true : undefined,
          backgroundImageUrl: args.storageUrl,
          sourceImageArtifactId: args.sourceImageArtifactId,
          updatedAt: now,
        };
      }),
    };

    await ctx.db.patch(slideshow._id, {
      spec: nextSpec,
      updatedAt: now,
    });

    if (
      replacedArtifactId &&
      replacedArtifactId !== args.sourceImageArtifactId
    ) {
      const artifact = await ctx.db.get(replacedArtifactId as Id<"artifacts">);
      if (artifact && artifact.userId === args.userId) {
        await cleanupArtifactStorage(ctx, artifact);
        await ctx.db.delete(artifact._id);
      }
    }
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
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const prompt = normalizeImagePromptFormatting(args.prompt);
    if (!prompt) throw new Error("Image prompt is required");

    const context = await ctx.runQuery(internal.content.requests.getSlideRegenerationContext, {
      slideshowId: args.slideshowId,
      slideId: args.slideId,
      userId,
    });
    if (!context) throw new Error("Slide not found");

    const renderingMode = renderingModeForSlide(context.spec, context.slide);
    const aspectRatio = context.spec.aspectRatio ?? "9:16";
    const useReferenceImage = args.useReferenceImage ?? (context.slide.useReferenceImage === true);
    const referenceAssetsForSlide = useReferenceImage ? context.referenceAssets : [];
    const referenceImages = await referenceImagesFromAssets(referenceAssetsForSlide);
    const referenceAssetIds = referenceImages.length > 0
      ? referenceAssetIdsForSlide({ useReferenceImage }, referenceAssetsForSlide)
      : [];
    const imageProviderName = referenceImages.length > 0
      ? process.env.CONTENT_ENGINE_REFERENCE_IMAGE_PROVIDER?.trim() || "fal"
      : process.env.CONTENT_ENGINE_IMAGE_PROVIDER?.trim() || "fal";
    const imageProvider = getModelProvider(imageProviderName as "gemini" | "fal");
    const imageModel = imageModelForRenderingMode(renderingMode);
    const dimensions = context.spec.dimensions ?? getSlideDimensions(aspectRatio);
    const providerPrompt = providerImagePrompt(prompt, aspectRatio, renderingMode);

    const image = await imageProvider.generateImage({
      prompt: providerPrompt,
      model: imageModel,
      aspectRatio,
      count: 1,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      metadata: {
        arguments: {
          aspect_ratio: aspectRatio,
          output_format: "png",
          resolution: "2K",
        },
        renderingMode,
        slideId: args.slideId,
        referenceAssetIds,
      },
    });
    const asset = image.images[0] ?? await waitForImageResult(imageProvider, {
      jobId: image.jobId,
      model: image.metadata.model,
      metadata: image.metadata,
    });
    const stored = await storeGeneratedAsset(ctx, asset);
    const artifactId: Id<"artifacts"> = await createRequestArtifact(ctx, {
      request: context.request,
      type: "image",
      title: `Slide ${context.slide.index} regenerated image`,
      storageUrl: stored.storageUrl,
      data: {
        format: renderingMode === "full_graphic_generation"
          ? "slideshow_full_graphic"
          : "slideshow_background",
        slideIndex: context.slide.index,
        storageId: stored.storageId,
        mimeType: stored.mimeType,
        fileSize: stored.byteLength,
        width: dimensions.width,
        height: dimensions.height,
        jobId: image.jobId,
        status: "succeeded",
        renderingMode,
        useReferenceImage,
        sourceSlideshowId: args.slideshowId,
        sourceSlideId: args.slideId,
        referenceAssetIds,
      },
      provider: image.metadata.provider,
      model: image.metadata.model,
      prompt: providerPrompt,
    });

    await ctx.runMutation(internal.content.requests.applyRegeneratedSlideImage, {
      slideshowId: args.slideshowId,
      userId,
      slideId: args.slideId,
      prompt,
      useReferenceImage,
      storageUrl: stored.storageUrl,
      sourceImageArtifactId: String(artifactId),
    });

    return { artifactId, storageUrl: stored.storageUrl };
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
          const asset = pending.image.images[0] ?? await waitForImageResult(pending.imageProvider, {
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
