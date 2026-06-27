import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "../_generated/server";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import { storeGeneratedAsset } from "../content/assetStorage";
import { keyFromPublicUrl, r2 } from "../storage/r2";
import { getModelProvider } from "../providers";
import type { GeneratedAsset, ModelProvider } from "../providers/model";
import { requireWorkspaceMember } from "../workspaces/workspaces";
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
    currentUserId(await requireBetaAccessForAction(ctx));
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
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand) return [];
      if (brand.workspaceId) {
        await requireWorkspaceMember(ctx, brand.workspaceId, userId);
      } else if (brand.userId !== userId) {
        return [];
      }
      return await ctx.db
        .query("creativeAssets")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .order("desc")
        .collect();
    }

    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, userId);
      return await ctx.db
        .query("creativeAssets")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
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

export const getForRunner = internalQuery({
  args: { id: v.id("creativeAssets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    brandId: v.optional(v.id("brands")),
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
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    const brand = args.brandId ? await ctx.db.get(args.brandId) : null;
    if (args.brandId) {
      if (!brand) throw new Error("Brand not found");
      if (brand.workspaceId) {
        await requireWorkspaceMember(ctx, brand.workspaceId, userId);
      } else if (brand.userId !== userId) {
        throw new Error("Brand not found");
      }
    }
    const workspaceId = args.workspaceId ?? brand?.workspaceId ?? defaultWorkspace._id;
    if (workspaceId) {
      await requireWorkspaceMember(ctx, workspaceId, userId);
    }
    if (brand?.workspaceId && brand.workspaceId !== workspaceId) {
      throw new Error("Brand does not belong to this workspace");
    }

    const name = args.name.trim();
    const storageUrl = args.storageUrl.trim();
    if (!name) throw new Error("Asset name is required");
    if (!storageUrl) throw new Error("Asset media is required");

    const now = Date.now();
    return await ctx.db.insert("creativeAssets", {
      userId,
      workspaceId,
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
    const userId = currentUserId(await requireBetaAccess(ctx));
    const asset = await ctx.db.get(args.id);
    if (!asset) throw new Error("Reference asset not found");
    if (asset.workspaceId) {
      await requireWorkspaceMember(ctx, asset.workspaceId, userId);
    } else if (asset.userId !== userId) {
      throw new Error("Reference asset not found");
    }

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
    const userId = currentUserId(await requireBetaAccess(ctx));
    const asset = await ctx.db.get(args.id);
    if (!asset) throw new Error("Reference asset not found");
    if (asset.workspaceId) {
      await requireWorkspaceMember(ctx, asset.workspaceId, userId);
    } else if (asset.userId !== userId) {
      throw new Error("Reference asset not found");
    }

    const storageKey = keyFromPublicUrl(asset.storageUrl);
    if (storageKey) {
      try {
        await r2.deleteObject(ctx, storageKey);
      } catch {
        // The database row is the source of truth; storage cleanup is best-effort.
      }
    }

    await ctx.db.delete(args.id);
  },
});
