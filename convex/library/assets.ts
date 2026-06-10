import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requireBetaAccess } from "../auth/users";

type SelectableMediaKind = "image" | "video" | "audio" | "media";

type SelectableLibraryAsset = {
  id: string;
  source: "create" | "workflow_export" | "creative_asset";
  sourceId: string;
  title: string;
  storageUrl: string;
  mimeType?: string;
  mediaKind: SelectableMediaKind;
  prompt?: string;
  provider?: string;
  model?: string;
  brandId?: string;
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

function exportedToMediaLibrary(artifact: Doc<"artifacts">) {
  if (artifact.type !== "publish_payload" || !isRecord(artifact.data)) return false;

  if (
    isRecord(artifact.data.exportStatus) &&
    artifact.data.exportStatus.destination === "media_library"
  ) {
    return true;
  }

  return Array.isArray(artifact.data.exports) &&
    artifact.data.exports.some((item) =>
      isRecord(item) && item.destination === "media_library"
    );
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
    brandId: artifact.brandId ? String(artifact.brandId) : undefined,
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
    brandId: String(asset.brandId),
    createdAt: asset.createdAt,
  };
}

function exportTimestamp(artifact: Doc<"artifacts">) {
  if (!isRecord(artifact.data) || !isRecord(artifact.data.exportStatus)) {
    return artifact.createdAt;
  }

  return typeof artifact.data.exportStatus.exportedAt === "number"
    ? artifact.data.exportStatus.exportedAt
    : artifact.createdAt;
}

function workflowExportAssetsFromArtifacts(
  artifact: Doc<"artifacts">,
  artifactsById: Map<string, Doc<"artifacts">>
): SelectableLibraryAsset[] {
  if (!exportedToMediaLibrary(artifact) || !isRecord(artifact.data)) return [];
  if (!Array.isArray(artifact.data.mediaItems)) return [];

  return artifact.data.mediaItems.flatMap((item, index): SelectableLibraryAsset[] => {
    if (!isRecord(item)) return [];
    const storageUrl = typeof item.storageUrl === "string" ? item.storageUrl.trim() : "";
    if (!storageUrl) return [];

    const artifactId = typeof item.artifactId === "string" ? item.artifactId : undefined;
    const sourceArtifact = artifactId ? artifactsById.get(artifactId) : undefined;
    const mimeType =
      typeof item.mimeType === "string"
        ? item.mimeType
        : artifactAspectMimeType(sourceArtifact);

    return [{
      id: `workflow_export:${String(artifact._id)}:${artifactId ?? index}`,
      source: "workflow_export",
      sourceId: artifactId ?? String(artifact._id),
      title: typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : "Workflow export",
      storageUrl,
      mimeType,
      mediaKind: sourceArtifact
        ? mediaKindFromArtifact(sourceArtifact)
        : mediaKindFromMimeType(mimeType),
      prompt: sourceArtifact?.prompt,
      provider: typeof item.provider === "string" ? item.provider : sourceArtifact?.provider,
      model: typeof item.model === "string" ? item.model : sourceArtifact?.model,
      brandId: artifact.brandId ? String(artifact.brandId) : undefined,
      createdAt: exportTimestamp(artifact),
    }];
  });
}

function matchesMediaKind(asset: SelectableLibraryAsset, mediaKind?: SelectableMediaKind) {
  if (!mediaKind || mediaKind === "media") return true;
  return asset.mediaKind === mediaKind;
}

function matchesBrand(asset: SelectableLibraryAsset, brandId?: Id<"brands">) {
  if (!brandId) return true;
  return !asset.brandId || asset.brandId === String(brandId);
}

export const listSelectable = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    brandId: v.optional(v.id("brands")),
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

    if (args.workspaceId) {
      const membership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", args.workspaceId!).eq("userId", identity.subject)
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
            .withIndex("by_user", (q) => q.eq("userId", identity.subject))
            .collect(),
      args.workspaceId
        ? ctx.db
            .query("creativeAssets")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        : ctx.db
            .query("creativeAssets")
            .withIndex("by_user", (q) => q.eq("userId", identity.subject))
            .collect(),
    ]);
    const artifactsById = new Map(artifacts.map((artifact) => [
      String(artifact._id),
      artifact,
    ]));

    return [
      ...artifacts.flatMap((artifact) => {
        const createAsset = createAssetFromArtifact(artifact);
        return createAsset ? [createAsset] : [];
      }),
      ...artifacts.flatMap((artifact) =>
        workflowExportAssetsFromArtifacts(artifact, artifactsById)
      ),
      ...creativeAssets.map(creativeAssetToSelectable),
    ]
      .filter((asset) => matchesMediaKind(asset, args.mediaKind))
      .filter((asset) => matchesBrand(asset, args.brandId))
      .sort((first, second) => second.createdAt - first.createdAt);
  },
});
