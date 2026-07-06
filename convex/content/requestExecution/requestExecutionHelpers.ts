import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import {
  buildFullGraphicPlannerPrompt,
  buildOverlayPlannerPrompt,
  type PlannerReference,
  type RequestedRenderingMode,
} from "../planning";
import {
  fullGraphicSlideshowPlanSchema,
  overlaySlideshowPlanSchema,
  singleFullGraphicImagePromptWriterSchema,
  singleOverlayImagePromptWriterSchema,
  type SlideshowPlan,
} from "../types";
import type { ModelInvocationMetadata, ModelProviderName, ReferenceAsset } from "../../providers/model";
import { dataWithArtifactCaption } from "../artifactCaptions";
export function sumCost(current: number, metadata?: ModelInvocationMetadata) {
  return current + (metadata?.costUsd ?? 0);
}

const DEFAULT_OVERLAY_IMAGE_MODEL = "fal-ai/nano-banana-2";
const DEFAULT_FULL_GRAPHIC_IMAGE_MODEL = "fal-ai/nano-banana-pro";

export function imageModelForRenderingMode(renderingMode: SlideshowPlan["renderingMode"]): string {
  if (renderingMode === "full_graphic_generation") {
    return process.env.CONTENT_ENGINE_FULL_GRAPHIC_IMAGE_MODEL?.trim() ||
      DEFAULT_FULL_GRAPHIC_IMAGE_MODEL;
  }

  return process.env.CONTENT_ENGINE_IMAGE_MODEL?.trim() || DEFAULT_OVERLAY_IMAGE_MODEL;
}

export function imageModelForProviderRenderingMode(
  provider: ModelProviderName,
  renderingMode: SlideshowPlan["renderingMode"]
): string | undefined {
  if (provider === "fal") return imageModelForRenderingMode(renderingMode);
  if (provider === "gemini") {
    return process.env.CONTENT_ENGINE_GEMINI_IMAGE_MODEL?.trim() ||
      "gemini-3-pro-image-preview";
  }
  if (provider === "bulkapis") {
    return process.env.CONTENT_ENGINE_BULKAPIS_IMAGE_MODEL?.trim() || undefined;
  }
  return undefined;
}

export function providerImagePrompt(
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

export function normalizeImagePromptFormatting(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function promptForSlide(slide: SlideshowPlan["slides"][number]) {
  return slide.renderingMode === "full_graphic_generation"
    ? slide.finalImagePrompt
    : slide.backgroundPrompt;
}

export function referenceAssetIdsForSlide(
  slide: Pick<SlideshowPlan["slides"][number], "useReferenceImage">,
  assets: Array<{ _id: Id<"creativeAssets"> }>
) {
  return slide.useReferenceImage ? assets.map((asset) => String(asset._id)) : [];
}

export function planPromptForMode(args: {
  prompt: string;
  revisionPrompt?: string;
  socialAccount?: Doc<"socialAccounts"> | null;
  requestedRenderingMode: RequestedRenderingMode;
  references: PlannerReference[];
}) {
  return args.requestedRenderingMode === "full_graphic_generation"
    ? buildFullGraphicPlannerPrompt(args)
    : buildOverlayPlannerPrompt(args);
}

export function planSchemaForMode(renderingMode: RequestedRenderingMode) {
  return renderingMode === "full_graphic_generation"
    ? fullGraphicSlideshowPlanSchema
    : overlaySlideshowPlanSchema;
}

export function singleImagePromptSchemaForMode(renderingMode: RequestedRenderingMode) {
  return renderingMode === "full_graphic_generation"
    ? singleFullGraphicImagePromptWriterSchema
    : singleOverlayImagePromptWriterSchema;
}

export function requestedRenderingModeValidator() {
  return v.optional(
    v.union(
      v.literal("background_plus_overlay"),
      v.literal("full_graphic_generation")
    )
  );
}

export function referenceInstructionFromMetadata(asset: Doc<"creativeAssets">): string | undefined {
  if (!asset.metadata || typeof asset.metadata !== "object") return undefined;
  const instruction = (asset.metadata as Record<string, unknown>).instruction;
  return typeof instruction === "string" && instruction.trim() ? instruction.trim() : undefined;
}

export function plannerReferenceFromAsset(
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

export async function referenceImagesFromAssets(
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

export async function createRequestArtifact(
  ctx: ActionCtx,
  args: {
    request: Doc<"contentRequests">;
    type: Doc<"artifacts">["type"];
    title?: string;
    storageUrl?: string;
    data?: unknown;
    captionPrefix?: string;
    provider?: ModelProviderName;
    model?: string;
    prompt?: string;
    parentArtifactIds?: Id<"artifacts">[];
  }
): Promise<Id<"artifacts">> {
  return await ctx.runMutation(internal.artifacts.records.createFromRunner, {
    userId: args.request.userId,
    workspaceId: args.request.workspaceId,
    contentRequestId: args.request._id,
    parentArtifactIds: args.parentArtifactIds,
    type: args.type,
    title: args.title,
    storageUrl: args.storageUrl,
    data: dataWithArtifactCaption(args.data, args.prompt, args.captionPrefix),
    provider: args.provider,
    model: args.model,
    prompt: args.prompt,
    lifecycle: "preview",
    reviewStatus: "pending",
  });
}
