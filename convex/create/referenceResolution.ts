import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type ReferenceMentionInput = {
  token: string;
  label: string;
  entityType: "creative_asset" | "artifact" | "analysis" | "uploaded_reference";
  entityId: string;
  mediaType?: "image" | "video" | "audio" | "file";
  mimeType?: string;
  storageUrl?: string;
  instruction?: string;
};

export type ToolReferenceAsset = {
  alias?: string;
  description?: string;
  mimeType: string;
  url: string;
};

type ResolvedToolReferences = {
  creativeAssetReferences: Array<{
    assetId: Id<"creativeAssets">;
    instruction?: string;
  }>;
  imageReferences: ToolReferenceAsset[];
  videoReferences: ToolReferenceAsset[];
  audioReferences: ToolReferenceAsset[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanAlias(mention: ReferenceMentionInput) {
  return mention.token.replace(/^@/, "").trim() || mention.label.trim() || undefined;
}

function mimeTypeForMediaType(mediaType?: string) {
  if (mediaType === "image") return "image/png";
  if (mediaType === "video") return "video/mp4";
  if (mediaType === "audio") return "audio/mpeg";
  return "application/octet-stream";
}

function mediaTypeFromArtifact(artifact: Doc<"artifacts">) {
  const data = isRecord(artifact.data) ? artifact.data : {};
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : undefined;
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (artifact.type === "image" || artifact.type === "thumbnail") return "image";
  if (artifact.type === "video") return "video";
  if (data.kind === "audio") return "audio";
  return "file";
}

function mediaTypeFromCreativeAsset(asset: Doc<"creativeAssets">) {
  if (asset.mediaType === "image" || asset.mediaType === "video" || asset.mediaType === "audio") {
    return asset.mediaType;
  }
  return "file";
}

function recordBelongsToThread(
  thread: Doc<"createThreads">,
  record: { userId: string; workspaceId?: Id<"workspaces"> }
) {
  return thread.workspaceId
    ? record.workspaceId === thread.workspaceId
    : record.userId === thread.userId;
}

function pushReferenceByMediaType(
  references: ResolvedToolReferences,
  mediaType: string,
  reference: ToolReferenceAsset
) {
  if (mediaType === "image") {
    references.imageReferences.push(reference);
    return;
  }
  if (mediaType === "video") {
    references.videoReferences.push(reference);
    return;
  }
  if (mediaType === "audio") {
    references.audioReferences.push(reference);
  }
}

function referenceMentionsFromInput(input: Record<string, unknown>): ReferenceMentionInput[] {
  if (!Array.isArray(input.referenceMentions)) return [];

  return input.referenceMentions.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (
      item.entityType !== "creative_asset" &&
      item.entityType !== "artifact" &&
      item.entityType !== "analysis" &&
      item.entityType !== "uploaded_reference"
    ) return [];
    if (typeof item.entityId !== "string" || typeof item.token !== "string" || typeof item.label !== "string") {
      return [];
    }

    return [{
      token: item.token,
      label: item.label,
      entityType: item.entityType,
      entityId: item.entityId,
      mediaType:
        item.mediaType === "image" ||
        item.mediaType === "video" ||
        item.mediaType === "audio" ||
        item.mediaType === "file"
          ? item.mediaType
          : undefined,
      mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
      storageUrl: typeof item.storageUrl === "string" ? item.storageUrl : undefined,
      instruction: typeof item.instruction === "string" ? item.instruction : undefined,
    }];
  });
}

function normalizeMentionId<TableName extends "artifacts" | "creativeAssets">(
  ctx: MutationCtx,
  tableName: TableName,
  id: string
) {
  return ctx.db.normalizeId(tableName, id);
}

export function artifactMediaKind(artifact: Doc<"artifacts">) {
  const data = isRecord(artifact.data) ? artifact.data : {};
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : undefined;
  if (artifact.type === "video" || mimeType?.startsWith("video/")) return "video";
  if (artifact.type === "image" || mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("audio/") || data.kind === "audio") return "audio";
  return "file";
}

export function artifactMimeType(artifact: Doc<"artifacts">) {
  const data = isRecord(artifact.data) ? artifact.data : {};
  return typeof data.mimeType === "string" ? data.mimeType : undefined;
}

export function artifactDurationSeconds(artifact: Doc<"artifacts">) {
  const data = isRecord(artifact.data) ? artifact.data : {};
  return typeof data.durationSeconds === "number" && Number.isFinite(data.durationSeconds)
    ? data.durationSeconds
    : undefined;
}

export function referenceFromArtifact(artifact: Doc<"artifacts">): ToolReferenceAsset | null {
  if (!artifact.storageUrl) return null;
  return {
    alias: artifact.title?.trim() || undefined,
    description: artifact.prompt ?? artifact.title,
    mimeType: artifactMimeType(artifact) ?? mimeTypeForMediaType(artifactMediaKind(artifact)),
    url: artifact.storageUrl,
  };
}

export async function resolveToolReferences(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  input: Record<string, unknown>
): Promise<ResolvedToolReferences> {
  const resolved: ResolvedToolReferences = {
    creativeAssetReferences: [],
    imageReferences: [],
    videoReferences: [],
    audioReferences: [],
  };

  for (const mention of referenceMentionsFromInput(input)) {
    if (mention.entityType === "creative_asset") {
      const assetId = normalizeMentionId(ctx, "creativeAssets", mention.entityId);
      if (!assetId) continue;
      const asset = await ctx.db.get(assetId);
      if (!asset || !recordBelongsToThread(thread, asset)) continue;
      const metadata = isRecord(asset.metadata) ? asset.metadata : {};
      const mediaType = mediaTypeFromCreativeAsset(asset);
      const mimeType = typeof metadata.mimeType === "string"
        ? metadata.mimeType
        : mimeTypeForMediaType(mediaType);
      const instruction = mention.instruction?.trim() || asset.usageNotes || asset.description;
      resolved.creativeAssetReferences.push({
        assetId: asset._id,
        instruction,
      });
      pushReferenceByMediaType(resolved, mediaType, {
        alias: cleanAlias(mention),
        description: instruction,
        mimeType,
        url: asset.storageUrl,
      });
      continue;
    }

    if (mention.entityType === "artifact") {
      const artifactId = normalizeMentionId(ctx, "artifacts", mention.entityId);
      if (!artifactId) continue;
      const artifact = await ctx.db.get(artifactId);
      if (!artifact || !artifact.storageUrl || !recordBelongsToThread(thread, artifact)) continue;
      const data = isRecord(artifact.data) ? artifact.data : {};
      const mediaType = mediaTypeFromArtifact(artifact);
      const mimeType = typeof data.mimeType === "string"
        ? data.mimeType
        : mimeTypeForMediaType(mediaType);
      pushReferenceByMediaType(resolved, mediaType, {
        alias: cleanAlias(mention),
        description: mention.instruction?.trim() || artifact.prompt || artifact.title,
        mimeType,
        url: artifact.storageUrl,
      });
      continue;
    }

    if (mention.entityType === "uploaded_reference") {
      const storageUrl = mention.storageUrl?.trim();
      if (!storageUrl) continue;
      const mediaType = mention.mediaType ?? "file";
      pushReferenceByMediaType(resolved, mediaType, {
        alias: cleanAlias(mention),
        description: mention.instruction?.trim() || mention.label,
        mimeType: mention.mimeType ?? mimeTypeForMediaType(mediaType),
        url: storageUrl,
      });
      continue;
    }

  }

  return resolved;
}
