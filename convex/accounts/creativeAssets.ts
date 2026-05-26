import { v } from "convex/values";
import { action, mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { storeGeneratedAsset } from "../content/assetStorage";
import { getModelProvider } from "../providers";
import type { GeneratedAsset, ModelProvider } from "../providers/model";
import {
  creativeAssetKindValidator,
  creativeAssetMediaTypeValidator,
} from "../validators";

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const videoExtensions = new Set(["mp4", "mov", "webm", "m4v"]);
const audioExtensions = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

function storageIdFromUrl(url: string): Id<"_storage"> | undefined {
  const match = url.match(/\/api\/storage\/([a-zA-Z0-9_-]+)/);
  return match?.[1] as Id<"_storage"> | undefined;
}

function inferMediaType(args: { storageUrl: string; mimeType?: string }):
  | "image"
  | "video"
  | "audio"
  | "file" {
  if (args.mimeType?.startsWith("image/")) return "image";
  if (args.mimeType?.startsWith("video/")) return "video";
  if (args.mimeType?.startsWith("audio/")) return "audio";

  const extension = args.storageUrl.split("?")[0]?.split(".").pop()?.toLowerCase();
  if (extension && imageExtensions.has(extension)) return "image";
  if (extension && videoExtensions.has(extension)) return "video";
  if (extension && audioExtensions.has(extension)) return "audio";
  return "image";
}

async function waitForImageResult(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
  }
): Promise<GeneratedAsset | undefined> {
  if (!args.jobId) return undefined;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await provider.getJobStatus({
      jobId: args.jobId,
      model: args.model,
      metadata: args.metadata,
    });
    if (result.status === "succeeded") return result.assets?.[0];
    if (result.status === "failed" || result.status === "canceled") return undefined;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return undefined;
}

export const generatePreview = action({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    currentUserId(await ctx.auth.getUserIdentity());
    const prompt = args.prompt.trim();
    if (!prompt) throw new Error("Prompt is required");

    const providerName = process.env.CONTENT_ENGINE_REFERENCE_ASSET_PROVIDER?.trim() || "gemini";
    const provider = getModelProvider(providerName as "gemini" | "fal");
    const model = process.env.CONTENT_ENGINE_REFERENCE_ASSET_MODEL?.trim() || undefined;
    const generationPrompt = [
      prompt,
      "Create one clean reusable reference image for future social content generation.",
      "Do not include captions, UI chrome, watermarks, logos, or embedded text unless the user explicitly requested text as part of the reference.",
    ].join(" ");

    const result = await provider.generateImage({
      prompt: generationPrompt,
      model,
      aspectRatio: "1:1",
      count: 1,
      metadata: {
        arguments: {
          aspect_ratio: "1:1",
          output_format: "png",
        },
        usage: "reference_asset_preview",
      },
    });
    const asset = result.images[0] ?? await waitForImageResult(provider, {
      jobId: result.jobId,
      model: result.metadata.model,
      metadata: result.metadata,
    });
    if (!asset) throw new Error("Image generation did not return an asset");

    const stored = await storeGeneratedAsset(ctx, asset);
    return {
      storageUrl: stored.storageUrl,
      prompt,
      provider: result.metadata.provider,
      model: result.metadata.model,
    };
  },
});

export const list = query({
  args: { brandId: v.optional(v.id("brands")) },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.userId !== userId) return [];
      return await ctx.db
        .query("creativeAssets")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("creativeAssets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.string(),
    assetKind: v.optional(creativeAssetKindValidator),
    mediaType: v.optional(creativeAssetMediaTypeValidator),
    storageUrl: v.string(),
    description: v.optional(v.string()),
    instruction: v.optional(v.string()),
    usageNotes: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.userId !== userId) throw new Error("Brand not found");

    const name = args.name.trim();
    const storageUrl = args.storageUrl.trim();
    if (!name) throw new Error("Asset name is required");
    if (!storageUrl) throw new Error("Asset media is required");

    const now = Date.now();
    return await ctx.db.insert("creativeAssets", {
      userId,
      brandId: args.brandId,
      name,
      assetKind: args.assetKind ?? "other",
      mediaType: args.mediaType ?? inferMediaType({
        storageUrl,
        mimeType: args.mimeType,
      }),
      storageUrl,
      description: args.description?.trim() || undefined,
      usageNotes: args.usageNotes?.trim() || undefined,
      metadata: {
        ...(args.instruction?.trim() ? { instruction: args.instruction.trim() } : {}),
        ...(args.mimeType?.trim() ? { mimeType: args.mimeType.trim() } : {}),
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("creativeAssets"),
    name: v.optional(v.string()),
    assetKind: v.optional(creativeAssetKindValidator),
    mediaType: v.optional(creativeAssetMediaTypeValidator),
    description: v.optional(v.string()),
    instruction: v.optional(v.string()),
    usageNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const asset = await ctx.db.get(args.id);
    if (!asset || asset.userId !== userId) throw new Error("Reference asset not found");

    const metadata =
      args.instruction === undefined
        ? asset.metadata
        : args.instruction.trim()
          ? { ...(asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {}), instruction: args.instruction.trim() }
          : undefined;

    await ctx.db.patch(args.id, {
      name: args.name?.trim() || asset.name,
      assetKind: args.assetKind ?? asset.assetKind,
      mediaType: args.mediaType ?? asset.mediaType,
      description: args.description === undefined ? asset.description : args.description.trim() || undefined,
      usageNotes: args.usageNotes === undefined ? asset.usageNotes : args.usageNotes.trim() || undefined,
      metadata,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("creativeAssets") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const asset = await ctx.db.get(args.id);
    if (!asset || asset.userId !== userId) throw new Error("Reference asset not found");

    const storageId = storageIdFromUrl(asset.storageUrl);
    if (storageId) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        // The database row is the source of truth; storage cleanup is best-effort.
      }
    }

    await ctx.db.delete(args.id);
  },
});
