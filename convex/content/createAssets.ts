import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../_generated/server";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { storeGeneratedAsset } from "./assetStorage";
import { getModelProvider } from "../providers";
import type { ReferenceAsset } from "../providers/model";
import { modelProviderValidator } from "../validators";
import {
  waitForGeneratedAudio,
  waitForGeneratedImage,
  waitForGeneratedVideo,
} from "../workflows/runtime/generationWaiters";
import {
  imageModelUiContractForRun,
  imageProviderInputFromModelSchema,
} from "../workflows/runtime/providerInputs";

const referenceAssetValidator = v.object({
  url: v.string(),
  mimeType: v.string(),
  description: v.optional(v.string()),
});

type CreateReferenceAsset = {
  url: string;
  mimeType: string;
  description?: string;
};

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

async function assertOwnedBrand(
  ctx: ActionCtx,
  brandId: Id<"brands"> | undefined,
  userId: string
) {
  if (!brandId) return;
  const brand = await ctx.runQuery(internal.accounts.brands.getForRunner, {
    id: brandId,
  }) as { userId?: string } | null;
  if (!brand || brand.userId !== userId) throw new Error("Brand not found");
}

function referenceAssetsFromArgs(references: CreateReferenceAsset[]): ReferenceAsset[] {
  return references
    .filter((reference) => reference.url.trim() && reference.mimeType.trim())
    .map((reference) => ({
      url: reference.url.trim(),
      mimeType: reference.mimeType.trim(),
      description: reference.description?.trim() || undefined,
    }));
}

function providerInputFromArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function referenceUrls(references: ReferenceAsset[]): string[] {
  return references.flatMap((reference) => reference.url ? [reference.url] : []);
}

function defaultTitle(prompt: string, fallback: string) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!cleanPrompt) return fallback;
  return cleanPrompt.length > 58 ? `${cleanPrompt.slice(0, 58)}...` : cleanPrompt;
}

export const generateImage = action({
  args: {
    brandId: v.optional(v.id("brands")),
    prompt: v.string(),
    provider: v.optional(modelProviderValidator),
    model: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    count: v.optional(v.number()),
    providerInput: v.optional(v.any()),
    referenceImages: v.optional(v.array(referenceAssetValidator)),
  },
  handler: async (ctx, args): Promise<{
    artifactIds: Id<"artifacts">[];
    assets: Array<{ artifactId: Id<"artifacts">; storageUrl: string; title: string }>;
  }> => {
    const userId = currentUserId(await requireBetaAccessForAction(ctx));
    await assertOwnedBrand(ctx, args.brandId, userId);

    const prompt = args.prompt.trim();
    if (!prompt) throw new Error("Prompt is required");

    const providerName = args.provider ?? "bulkapis";
    const provider = getModelProvider(providerName);
    if (!provider.capabilities.image) {
      throw new Error(`${provider.displayName} does not support image generation.`);
    }

    const count = Math.max(1, Math.min(4, Math.floor(args.count ?? 1)));
    const referenceImages = referenceAssetsFromArgs(args.referenceImages ?? []);
    const providerInput = providerInputFromArgs(args.providerInput);
    const providerModel = args.model?.trim()
      ? await ctx.runQuery(internal.providers.modelCatalog.getByProviderModelForRun, {
          provider: providerName,
          modelId: args.model.trim(),
        })
      : null;
    const imageContract = imageModelUiContractForRun(providerModel);
    if (imageContract.images.required && !referenceImages.length) {
      throw new Error("This model requires at least one reference image.");
    }
    if (imageContract.images.maxCount && referenceImages.length > imageContract.images.maxCount) {
      throw new Error(
        `This model allows up to ${imageContract.images.maxCount} reference image${imageContract.images.maxCount === 1 ? "" : "s"}.`
      );
    }
    const result = await provider.generateImage({
      prompt,
      model: args.model?.trim() || undefined,
      aspectRatio: args.aspectRatio,
      count,
      referenceImages: referenceImages.length ? referenceImages : undefined,
      metadata: {
        source: "create_page",
        mode: "image",
        referenceImageCount: referenceImages.length,
        bulkapisInput: {
          ...imageProviderInputFromModelSchema({
            model: providerModel,
            referenceImages,
            count,
          }),
          ...providerInput,
        },
      },
    });

    const generatedAssets = [...result.images];
    if (!generatedAssets.length && result.jobId) {
      generatedAssets.push(
        await waitForGeneratedImage(provider, {
          jobId: result.jobId,
          model: result.metadata.model,
          metadata: result.metadata,
        })
      );
    }
    if (!generatedAssets.length) throw new Error("Image generation returned no images.");

    const assets = [];
    for (const [index, image] of generatedAssets.entries()) {
      if (!image.mimeType.startsWith("image/")) continue;
      const stored = await storeGeneratedAsset(ctx, image);
      const title = `${defaultTitle(prompt, "Generated image")} ${index + 1}`;
      const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
        userId,
        brandId: args.brandId,
        type: "image",
        title,
        storageUrl: stored.storageUrl,
        data: {
          source: "create_page",
          mode: "image",
          storageId: stored.storageId,
          mimeType: stored.mimeType,
          fileSize: stored.byteLength,
          aspectRatio: args.aspectRatio,
          count,
          sourceMimeType: image.mimeType,
          jobId: result.jobId,
          status: "succeeded",
          referenceImageCount: referenceImages.length,
          providerMetadata: result.metadata,
        },
        provider: result.metadata.provider,
        model: result.metadata.model,
        prompt,
        lifecycle: "preview",
        reviewStatus: "pending",
      });
      assets.push({ artifactId, storageUrl: stored.storageUrl, title });
    }

    return {
      artifactIds: assets.map((asset) => asset.artifactId),
      assets,
    };
  },
});

export const generateVideo = action({
  args: {
    brandId: v.optional(v.id("brands")),
    prompt: v.string(),
    provider: v.optional(modelProviderValidator),
    model: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    providerInput: v.optional(v.any()),
    referenceImages: v.optional(v.array(referenceAssetValidator)),
    referenceVideos: v.optional(v.array(referenceAssetValidator)),
  },
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    storageUrl: string;
    title: string;
  }> => {
    const userId = currentUserId(await requireBetaAccessForAction(ctx));
    await assertOwnedBrand(ctx, args.brandId, userId);

    const prompt = args.prompt.trim();
    if (!prompt) throw new Error("Prompt is required");

    const providerName = args.provider ?? "bulkapis";
    const provider = getModelProvider(providerName);
    if (!provider.capabilities.video) {
      throw new Error(`${provider.displayName} does not support video generation.`);
    }

    const referenceImages = referenceAssetsFromArgs(args.referenceImages ?? []);
    const referenceVideos = referenceAssetsFromArgs(args.referenceVideos ?? []);
    const providerInput = providerInputFromArgs(args.providerInput);
    const videoUrls = referenceUrls(referenceVideos);
    if (videoUrls[0]) {
      providerInput.reference_video_url = providerInput.reference_video_url ?? videoUrls[0];
      providerInput.video_url = providerInput.video_url ?? videoUrls[0];
    }
    if (videoUrls.length > 1) {
      providerInput.reference_video_urls = providerInput.reference_video_urls ?? videoUrls;
    }
    const result = await provider.generateVideo({
      prompt,
      model: args.model?.trim() || undefined,
      aspectRatio: args.aspectRatio,
      durationSeconds: args.durationSeconds,
      referenceImages: referenceImages.length ? referenceImages : undefined,
      metadata: {
        source: "create_page",
        mode: "video",
        referenceImageCount: referenceImages.length,
        referenceVideoCount: referenceVideos.length,
        bulkapisInput: providerInput,
      },
    });
    const video = await waitForGeneratedVideo(provider, {
      jobId: result.jobId,
      model: result.metadata.model,
      metadata: result.metadata,
    });
    const stored = await storeGeneratedAsset(ctx, video);
    const title = defaultTitle(prompt, "Generated video");
    const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
      userId,
      brandId: args.brandId,
      type: "video",
      title,
      storageUrl: stored.storageUrl,
      data: {
        source: "create_page",
        mode: "video",
        storageId: stored.storageId,
        mimeType: stored.mimeType,
        fileSize: stored.byteLength,
        aspectRatio: args.aspectRatio,
        durationSeconds: args.durationSeconds,
        sourceMimeType: video.mimeType,
        jobId: result.jobId,
        status: "succeeded",
        referenceImageCount: referenceImages.length,
        providerMetadata: result.metadata,
      },
      provider: result.metadata.provider,
      model: result.metadata.model,
      prompt,
      lifecycle: "preview",
      reviewStatus: "pending",
    });

    return { artifactId, storageUrl: stored.storageUrl, title };
  },
});

export const generateAudio = action({
  args: {
    brandId: v.optional(v.id("brands")),
    text: v.string(),
    provider: v.optional(modelProviderValidator),
    model: v.optional(v.string()),
    mode: v.optional(v.string()),
    providerInput: v.optional(v.any()),
    voiceReferenceAudios: v.optional(v.array(referenceAssetValidator)),
  },
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    storageUrl: string;
    title: string;
  }> => {
    const userId = currentUserId(await requireBetaAccessForAction(ctx));
    await assertOwnedBrand(ctx, args.brandId, userId);

    const text = args.text.trim();
    if (!text) throw new Error("Text is required");

    const providerName = args.provider ?? "bulkapis";
    const provider = getModelProvider(providerName);
    if (!provider.capabilities.audio) {
      throw new Error(`${provider.displayName} does not support audio generation.`);
    }

    const voiceReferenceAudios = referenceAssetsFromArgs(args.voiceReferenceAudios ?? []);
    const providerInput = providerInputFromArgs(args.providerInput);
    const audioUrls = referenceUrls(voiceReferenceAudios);
    if (audioUrls[0]) {
      providerInput.audio_url = providerInput.audio_url ?? audioUrls[0];
    }
    if (audioUrls.length > 1) {
      providerInput.audio_urls = providerInput.audio_urls ?? audioUrls;
    }
    const result = await provider.generateAudio({
      text,
      model: args.model?.trim() || undefined,
      mode: args.mode,
      voiceReferenceAudios: voiceReferenceAudios.length ? voiceReferenceAudios : undefined,
      metadata: {
        source: "create_page",
        mode: "audio",
        bulkapisInput: {
          text,
          mode: args.mode,
          ...providerInput,
        },
      },
    });
    const generatedAudios = [...result.audios];
    if (!generatedAudios.length && result.jobId) {
      generatedAudios.push(
        await waitForGeneratedAudio(provider, {
          jobId: result.jobId,
          model: result.metadata.model,
          metadata: result.metadata,
        })
      );
    }
    const audio = generatedAudios.find((asset) => asset.mimeType.startsWith("audio/"));
    if (!audio) throw new Error("Audio generation returned no audio.");

    const stored = await storeGeneratedAsset(ctx, audio);
    const title = defaultTitle(text, "Generated audio");
    const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
      userId,
      brandId: args.brandId,
      type: "rendered_asset",
      title,
      storageUrl: stored.storageUrl,
      data: {
        source: "create_page",
        mode: "audio",
        kind: "audio",
        storageId: stored.storageId,
        mimeType: stored.mimeType,
        fileSize: stored.byteLength,
        sourceMimeType: audio.mimeType,
        jobId: result.jobId,
        status: "succeeded",
        providerMetadata: result.metadata,
      },
      provider: result.metadata.provider,
      model: result.metadata.model,
      prompt: text,
      lifecycle: "preview",
      reviewStatus: "pending",
    });

    return { artifactId, storageUrl: stored.storageUrl, title };
  },
});
