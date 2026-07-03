import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { getModelProvider } from "../providers";
import type {
  ModelProviderName,
  ReferenceAsset,
} from "../providers/model";
import {
  waitForGeneratedAudio,
  waitForGeneratedImages,
  waitForGeneratedVideo,
} from "../workflows/runtime/generationWaiters";
import {
  promptWithProviderSafeReferenceAliases,
  promptWithReferenceManifest,
} from "../../src/lib/references/referenceAliases";
import {
  imageModelUiContractForRun,
  imageProviderInputFromModelSchema,
} from "../workflows/runtime/providerInputs";
import { storeGeneratedAsset } from "./assets/assetStorage";

export type CreateReferenceAsset = {
  url: string;
  mimeType: string;
  alias?: string;
  description?: string;
  storageId?: string;
  temporary?: boolean;
};

type CreateAssetRunnerScope = {
  userId: string;
  workspaceId?: Id<"workspaces">;
  contentRequestId?: Id<"contentRequests">;
};

export type CreateImageRunnerInput = CreateAssetRunnerScope & {
  prompt: string;
  provider?: ModelProviderName;
  model?: string;
  aspectRatio?: string;
  count?: number;
  providerInput?: unknown;
  referenceImages?: CreateReferenceAsset[];
};

export type CreateVideoRunnerInput = CreateAssetRunnerScope & {
  prompt: string;
  provider?: ModelProviderName;
  model?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  providerInput?: unknown;
  referenceImages?: CreateReferenceAsset[];
  referenceVideos?: CreateReferenceAsset[];
};

export type CreateAudioRunnerInput = CreateAssetRunnerScope & {
  text: string;
  provider?: ModelProviderName;
  model?: string;
  mode?: string;
  providerInput?: unknown;
  voiceReferenceAudios?: CreateReferenceAsset[];
};

export type CreateLipsyncRunnerInput = CreateAssetRunnerScope & {
  prompt: string;
  provider?: ModelProviderName;
  model?: string;
  resolution?: string;
  providerInput?: unknown;
  referenceImages?: CreateReferenceAsset[];
  referenceVideos?: CreateReferenceAsset[];
  voiceReferenceAudios?: CreateReferenceAsset[];
};

function referenceAssetsFromArgs(
  references: CreateReferenceAsset[] = []
): ReferenceAsset[] {
  return references
    .filter((reference) => reference.url.trim() && reference.mimeType.trim())
    .map((reference) => ({
      url: reference.url.trim(),
      mimeType: reference.mimeType.trim(),
      alias: reference.alias?.trim() || undefined,
      description: reference.description?.trim() || undefined,
    }));
}

async function referenceAssetsForProvider(
  providerName: ModelProviderName,
  references: ReferenceAsset[]
): Promise<ReferenceAsset[]> {
  if (providerName !== "gemini" || !references.length) return references;

  return await Promise.all(
    references.map(async (reference) => {
      if (reference.base64Data || !reference.url) return reference;

      const response = await fetch(reference.url);
      if (!response.ok) return reference;

      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }

      return {
        ...reference,
        base64Data: btoa(binary),
        mimeType: response.headers.get("content-type") || reference.mimeType,
      };
    })
  );
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

export async function runCreateImageRequest(
  ctx: ActionCtx,
  args: CreateImageRunnerInput
): Promise<{
  artifactIds: Id<"artifacts">[];
  assets: Array<{ artifactId: Id<"artifacts">; storageUrl: string; title: string }>;
  costUsd?: number;
}> {
  const prompt = args.prompt.trim();
  if (!prompt) throw new Error("Prompt is required");

  const providerName = args.provider ?? "fal";
  const provider = getModelProvider(providerName);
  if (!provider.capabilities.image) {
    throw new Error(`${provider.displayName} does not support image generation.`);
  }

  const count = Math.max(1, Math.min(4, Math.floor(args.count ?? 1)));
  const referenceImages = await referenceAssetsForProvider(
    providerName,
    referenceAssetsFromArgs(args.referenceImages)
  );
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

  const providerPrompt = promptWithReferenceManifest(prompt, referenceImages, "image");
  const providerArguments = {
    ...imageProviderInputFromModelSchema({
      model: providerModel,
      referenceImages,
      count,
    }),
    ...providerInput,
  };
  const result = await provider.generateImage({
    prompt: providerPrompt,
    model: args.model?.trim() || undefined,
    aspectRatio: args.aspectRatio,
    count,
    referenceImages: referenceImages.length ? referenceImages : undefined,
    metadata: {
      source: "create_page",
      mode: "image",
      contentRequestId: args.contentRequestId,
      referenceImageCount: referenceImages.length,
      arguments: providerArguments,
      bulkapisInput: providerArguments,
    },
  });

  const generatedAssets = [...result.images];
  if (!generatedAssets.length && result.jobId) {
    generatedAssets.push(
      ...(await waitForGeneratedImages(provider, {
        jobId: result.jobId,
        model: result.metadata.model,
        metadata: result.metadata,
      }))
    );
  }
  if (!generatedAssets.length) throw new Error("Image generation returned no images.");

  const assets = [];
  for (const [index, image] of generatedAssets.entries()) {
    if (!image.mimeType.startsWith("image/")) continue;
    const stored = await storeGeneratedAsset(ctx, image);
    const title = `${defaultTitle(prompt, "Generated image")} ${index + 1}`;
    const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
      userId: args.userId,
      workspaceId: args.workspaceId,
      contentRequestId: args.contentRequestId,
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
        userPrompt: prompt,
        providerPrompt,
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
    costUsd: result.metadata.costUsd,
  };
}

export async function runCreateVideoRequest(
  ctx: ActionCtx,
  args: CreateVideoRunnerInput
): Promise<{
  artifactId: Id<"artifacts">;
  storageUrl: string;
  title: string;
  costUsd?: number;
}> {
  const prompt = args.prompt.trim();
  if (!prompt) throw new Error("Prompt is required");

  const providerName = args.provider ?? "fal";
  const provider = getModelProvider(providerName);
  if (!provider.capabilities.video) {
    throw new Error(`${provider.displayName} does not support video generation.`);
  }

  const referenceImages = referenceAssetsFromArgs(args.referenceImages);
  const referenceVideos = referenceAssetsFromArgs(args.referenceVideos);
  const providerInput = providerInputFromArgs(args.providerInput);
  const videoUrls = referenceUrls(referenceVideos);
  if (videoUrls[0]) {
    providerInput.reference_video_url = providerInput.reference_video_url ?? videoUrls[0];
    providerInput.video_url = providerInput.video_url ?? videoUrls[0];
  }
  if (videoUrls.length > 1) {
    providerInput.reference_video_urls = providerInput.reference_video_urls ?? videoUrls;
  }
  const providerPrompt = promptWithProviderSafeReferenceAliases(
    prompt,
    [...referenceImages, ...referenceVideos],
    "media"
  );
  const result = await provider.generateVideo({
    prompt: providerPrompt,
    model: args.model?.trim() || undefined,
    aspectRatio: args.aspectRatio,
    durationSeconds: args.durationSeconds,
    referenceImages: referenceImages.length ? referenceImages : undefined,
    metadata: {
      source: "create_page",
      mode: "video",
      contentRequestId: args.contentRequestId,
      referenceImageCount: referenceImages.length,
      referenceVideoCount: referenceVideos.length,
      arguments: providerInput,
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
    userId: args.userId,
    workspaceId: args.workspaceId,
    contentRequestId: args.contentRequestId,
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
      referenceVideoCount: referenceVideos.length,
      userPrompt: prompt,
      providerPrompt,
      providerMetadata: result.metadata,
    },
    provider: result.metadata.provider,
    model: result.metadata.model,
    prompt,
    lifecycle: "preview",
    reviewStatus: "pending",
  });

  return {
    artifactId,
    storageUrl: stored.storageUrl,
    title,
    costUsd: result.metadata.costUsd,
  };
}

export async function runCreateAudioRequest(
  ctx: ActionCtx,
  args: CreateAudioRunnerInput
): Promise<{
  artifactId: Id<"artifacts">;
  storageUrl: string;
  title: string;
  costUsd?: number;
}> {
  const text = args.text.trim();
  if (!text) throw new Error("Text is required");

  const providerName = args.provider ?? "fal";
  const provider = getModelProvider(providerName);
  if (!provider.capabilities.audio) {
    throw new Error(`${provider.displayName} does not support audio generation.`);
  }

  const voiceReferenceAudios = referenceAssetsFromArgs(args.voiceReferenceAudios);
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
      contentRequestId: args.contentRequestId,
      arguments: {
        text,
        mode: args.mode,
        ...providerInput,
      },
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
    userId: args.userId,
    workspaceId: args.workspaceId,
    contentRequestId: args.contentRequestId,
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

  return {
    artifactId,
    storageUrl: stored.storageUrl,
    title,
    costUsd: result.metadata.costUsd,
  };
}

export async function runCreateLipsyncRequest(
  ctx: ActionCtx,
  args: CreateLipsyncRunnerInput
): Promise<{
  artifactId: Id<"artifacts">;
  storageUrl: string;
  title: string;
  costUsd?: number;
}> {
  const prompt = args.prompt.trim();
  if (!prompt) throw new Error("Prompt is required");

  const providerName = args.provider ?? "fal";
  const provider = getModelProvider(providerName);
  if (!provider.capabilities.lipsync) {
    throw new Error(`${provider.displayName} does not support lipsync generation.`);
  }

  const referenceImages = referenceAssetsFromArgs(args.referenceImages);
  const referenceVideos = referenceAssetsFromArgs(args.referenceVideos);
  const voiceReferenceAudios = referenceAssetsFromArgs(args.voiceReferenceAudios);
  const providerInput = providerInputFromArgs(args.providerInput);
  const image = referenceImages[0];
  const video = referenceVideos[0];
  const audio = voiceReferenceAudios[0];

  if (!audio) {
    throw new Error("Lip sync generation needs an audio input.");
  }
  if (!image && !video) {
    throw new Error("Lip sync generation needs an image or video input.");
  }

  const result = await provider.generateLipsync({
    audio,
    image,
    video,
    model: args.model?.trim() || undefined,
    resolution: args.resolution,
    metadata: {
      source: "create_page",
      mode: "lipsync",
      contentRequestId: args.contentRequestId,
      hasImageInput: Boolean(image),
      hasVideoInput: Boolean(video),
      hasAudioInput: Boolean(audio),
      arguments: providerInput,
      bulkapisInput: providerInput,
    },
  });
  const videoAsset = await waitForGeneratedVideo(provider, {
    jobId: result.jobId,
    model: result.metadata.model,
    metadata: result.metadata,
  });
  const stored = await storeGeneratedAsset(ctx, videoAsset);
  const title = defaultTitle(prompt, "Lip-synced video");
  const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
    userId: args.userId,
    workspaceId: args.workspaceId,
    contentRequestId: args.contentRequestId,
    type: "video",
    title,
    storageUrl: stored.storageUrl,
    data: {
      source: "create_page",
      mode: "lipsync",
      storageId: stored.storageId,
      mimeType: stored.mimeType,
      fileSize: stored.byteLength,
      sourceMimeType: videoAsset.mimeType,
      jobId: result.jobId,
      status: "succeeded",
      resolution: args.resolution,
      hasImageInput: Boolean(image),
      hasVideoInput: Boolean(video),
      hasAudioInput: Boolean(audio),
      userPrompt: prompt,
      providerMetadata: result.metadata,
    },
    provider: result.metadata.provider,
    model: result.metadata.model,
    prompt,
    lifecycle: "preview",
    reviewStatus: "pending",
  });

  return {
    artifactId,
    storageUrl: stored.storageUrl,
    title,
    costUsd: result.metadata.costUsd,
  };
}
