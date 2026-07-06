import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireBetaAccess } from "../auth/users";

export type SelectableMediaKind = "image" | "video" | "audio" | "media";

export type SelectableLibraryAsset = {
  id: string;
  source: "create" | "creative_asset";
  sourceId: string;
  title: string;
  storageUrl: string;
  mimeType?: string;
  mediaKind: SelectableMediaKind;
  prompt?: string;
  provider?: string;
  model?: string;
  createdAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mediaKindFromMimeType(mimeType?: string): SelectableMediaKind {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";
  return "media";
}

function mediaKindFromArtifact(artifact: Doc<"artifacts">): SelectableMediaKind {
  const data = isRecord(artifact.data) ? artifact.data : {};
  const mimeKind = mediaKindFromMimeType(
    typeof data.mimeType === "string" ? data.mimeType : undefined
  );
  if (mimeKind !== "media") return mimeKind;

  if (artifact.type === "image" || artifact.type === "thumbnail") return "image";
  if (artifact.type === "video") return "video";
  if (artifact.type === "rendered_asset") return "media";
  return "media";
}

function mediaKindFromAsset(asset: Doc<"creativeAssets">): SelectableMediaKind {
  if (
    asset.mediaType === "image" ||
    asset.mediaType === "video" ||
    asset.mediaType === "audio"
  ) {
    return asset.mediaType;
  }

  return "media";
}

function artifactAspectMimeType(artifact?: Doc<"artifacts">) {
  if (!artifact || !isRecord(artifact.data)) return undefined;
  return typeof artifact.data.mimeType === "string" ? artifact.data.mimeType : undefined;
}

function createAssetFromArtifact(artifact: Doc<"artifacts">): SelectableLibraryAsset | null {
  if (!isRecord(artifact.data)) return null;
  if (artifact.data.source !== "create_page") return null;
  if (!artifact.storageUrl) return null;
  if (artifact.lifecycle && artifact.lifecycle !== "saved") return null;

  const mimeType = artifactAspectMimeType(artifact);

  return {
    id: `artifact:${String(artifact._id)}`,
    source: "create",
    sourceId: String(artifact._id),
    title: artifact.title?.trim() || "Generated asset",
    storageUrl: artifact.storageUrl,
    mimeType,
    mediaKind: mediaKindFromArtifact(artifact),
    prompt: artifact.prompt,
    provider: artifact.provider,
    model: artifact.model,
    createdAt: artifact.createdAt,
  };
}

function creativeAssetToSelectable(asset: Doc<"creativeAssets">): SelectableLibraryAsset {
  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  const mimeType = typeof metadata.mimeType === "string" ? metadata.mimeType : undefined;

  return {
    id: `creative_asset:${String(asset._id)}`,
    source: "creative_asset",
    sourceId: String(asset._id),
    title: asset.name,
    storageUrl: asset.storageUrl,
    mimeType,
    mediaKind: mediaKindFromAsset(asset),
    prompt: asset.description ?? asset.usageNotes,
    createdAt: asset.createdAt,
  };
}

function matchesMediaKind(asset: SelectableLibraryAsset, mediaKind?: SelectableMediaKind) {
  if (!mediaKind || mediaKind === "media") return true;
  return asset.mediaKind === mediaKind;
}

export async function listSelectableLibraryAssets(
  ctx: QueryCtx | MutationCtx,
  args: {
    mediaKind?: SelectableMediaKind;
    userId: string;
    workspaceId?: Id<"workspaces">;
  }
) {
  if (args.workspaceId) {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId!).eq("userId", args.userId)
      )
      .unique();
    if (membership?.status !== "active") return [];
  }

  const [artifacts, creativeAssets] = await Promise.all([
    args.workspaceId
      ? ctx.db
          .query("artifacts")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .collect()
      : ctx.db
          .query("artifacts")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .collect(),
    args.workspaceId
      ? ctx.db
          .query("creativeAssets")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .collect()
      : ctx.db
          .query("creativeAssets")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .collect(),
  ]);
  return [
    ...artifacts.flatMap((artifact) => {
      const createAsset = createAssetFromArtifact(artifact);
      return createAsset ? [createAsset] : [];
    }),
    ...creativeAssets.map(creativeAssetToSelectable),
  ]
    .filter((asset) => matchesMediaKind(asset, args.mediaKind))
    .sort((first, second) => second.createdAt - first.createdAt);
}

export const listSelectable = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    mediaKind: v.optional(
      v.union(
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
        v.literal("media")
      )
    ),
  },
  handler: async (ctx, args): Promise<SelectableLibraryAsset[]> => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) return [];

    return await listSelectableLibraryAssets(ctx, {
      ...args,
      userId: identity.subject,
    });
  },
});
