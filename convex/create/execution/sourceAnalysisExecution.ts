import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  DEFAULT_ANALYSIS_MODEL,
  GEMINI_PROVIDER,
  cleanOptionalText,
  sourcePlatformForUrl,
} from "../../analyze/videoAnalysisModel";
import {
  artifactMimeType,
  isRecord,
} from "../references/referenceResolution";
import type { CreateReferenceMention } from "../planning";
import {
  appendAgentMessage,
  byteLengthFromRecord,
  cleanOptionalString,
  recordBelongsToCreateThread,
} from "./toolExecutionShared";

export type AnalysisSourceForToolCall = {
  artifactId?: Id<"artifacts">;
  creativeAssetId?: Id<"creativeAssets">;
  fileName?: string;
  label: string;
  libraryAssetId?: string;
  mimeType?: string;
  sourcePlatform: Doc<"videoAnalysisJobs">["sourcePlatform"];
  sourceType: "url" | "upload";
  sourceUrl?: string;
  storageUrl?: string;
  byteLength?: number;
};

function sourceExcerpt(source: string) {
  return source.length > 140 ? `${source.slice(0, 140)}...` : source;
}

export function validatePublicAnalysisUrl(source: string) {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`Analyze Source needs a public http(s) URL; got: ${sourceExcerpt(source)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Analyze Source needs a public http(s) URL; got: ${sourceExcerpt(source)}`);
  }
  return source;
}

export function referenceMentionMatchesSource(
  reference: CreateReferenceMention,
  source: string
) {
  const cleanSource = source.trim();
  return cleanSource === reference.token ||
    cleanSource === reference.entityId ||
    cleanSource === `${reference.entityType}:${reference.entityId}`;
}

export function analysisSourceFromUploadedReferenceMention(
  reference: CreateReferenceMention
): AnalysisSourceForToolCall {
  if (!reference.storageUrl) {
    throw new Error("Analyze Source could not access that uploaded reference.");
  }
  return {
    fileName: reference.label,
    label: reference.label,
    mimeType: reference.mimeType,
    sourcePlatform: sourcePlatformForStoredMedia({
      mimeType: reference.mimeType,
      storageUrl: reference.storageUrl,
    }),
    sourceType: "upload",
    sourceUrl: reference.storageUrl,
    storageUrl: reference.storageUrl,
  };
}

function sourcePlatformForStoredMedia(args: {
  mimeType?: string;
  storageUrl: string;
}): Doc<"videoAnalysisJobs">["sourcePlatform"] {
  if (
    args.mimeType?.startsWith("image/") ||
    args.mimeType?.startsWith("video/") ||
    args.mimeType?.startsWith("audio/")
  ) {
    return "direct_file";
  }

  try {
    return sourcePlatformForUrl(args.storageUrl);
  } catch {
    return "unknown";
  }
}

function libraryAssetParts(source: string) {
  const [kind, firstId, secondId] = source.split(":");
  return {
    kind,
    firstId,
    secondId,
  };
}

async function analysisSourceFromArtifact(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  artifactIdValue: string,
  libraryAssetId?: string
): Promise<AnalysisSourceForToolCall> {
  const artifactId = ctx.db.normalizeId("artifacts", artifactIdValue);
  if (!artifactId) throw new Error("Analyze Source could not find that artifact.");
  const artifact = await ctx.db.get(artifactId);
  if (!artifact || !recordBelongsToCreateThread(thread, artifact)) {
    throw new Error("Analyze Source could not access that artifact.");
  }
  if (!artifact.storageUrl) {
    throw new Error("Analyze Source needs an artifact with stored media.");
  }

  const data = isRecord(artifact.data) ? artifact.data : {};
  const mimeType = artifactMimeType(artifact) ?? cleanOptionalString(data.sourceMimeType);

  return {
    artifactId: artifact._id,
    byteLength: byteLengthFromRecord(data),
    fileName: cleanOptionalString(data.fileName) ?? artifact.title ?? "Create artifact",
    label: artifact.title?.trim() || "Create artifact",
    libraryAssetId,
    mimeType,
    sourcePlatform: sourcePlatformForStoredMedia({
      mimeType,
      storageUrl: artifact.storageUrl,
    }),
    sourceType: "upload",
    sourceUrl: artifact.storageUrl,
    storageUrl: artifact.storageUrl,
  };
}

async function analysisSourceFromCreativeAsset(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  creativeAssetIdValue: string,
  libraryAssetId?: string
): Promise<AnalysisSourceForToolCall> {
  const creativeAssetId = ctx.db.normalizeId("creativeAssets", creativeAssetIdValue);
  if (!creativeAssetId) throw new Error("Analyze Source could not find that library asset.");
  const asset = await ctx.db.get(creativeAssetId);
  if (!asset || !recordBelongsToCreateThread(thread, asset)) {
    throw new Error("Analyze Source could not access that library asset.");
  }

  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  const mimeType = cleanOptionalString(metadata.mimeType);

  return {
    byteLength: byteLengthFromRecord(metadata),
    creativeAssetId: asset._id,
    fileName: cleanOptionalString(metadata.fileName) ?? asset.name,
    label: asset.name,
    libraryAssetId,
    mimeType,
    sourcePlatform: sourcePlatformForStoredMedia({
      mimeType,
      storageUrl: asset.storageUrl,
    }),
    sourceType: "upload",
    sourceUrl: asset.storageUrl,
    storageUrl: asset.storageUrl,
  };
}

async function analysisSourceFromReferenceMention(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  reference: CreateReferenceMention,
  libraryAssetId?: string
): Promise<AnalysisSourceForToolCall> {
  if (reference.entityType === "uploaded_reference") {
    return analysisSourceFromUploadedReferenceMention(reference);
  }
  if (reference.entityType === "artifact") {
    return await analysisSourceFromArtifact(ctx, thread, reference.entityId, libraryAssetId);
  }
  if (reference.entityType === "creative_asset") {
    return await analysisSourceFromCreativeAsset(ctx, thread, reference.entityId, libraryAssetId);
  }
  throw new Error("Analyze Source could not resolve that referenced asset.");
}

async function threadReferenceMentions(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
): Promise<CreateReferenceMention[]> {
  const messages = await ctx.db
    .query("createMessages")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  return messages.flatMap((message) => message.referenceMentions ?? []);
}

async function analysisSourceFromKnownReferenceMention(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  source: string
): Promise<AnalysisSourceForToolCall | undefined> {
  const references = await threadReferenceMentions(ctx, thread);
  const reference = references.find((candidate) =>
    referenceMentionMatchesSource(candidate, source)
  );
  if (!reference) return undefined;
  return await analysisSourceFromReferenceMention(ctx, thread, reference, source);
}

async function analysisSourceFromLibraryAsset(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  source: string
) {
  const parts = libraryAssetParts(source);
  if (parts.kind === "uploaded_reference" && parts.firstId) {
    const referenceSource = await analysisSourceFromKnownReferenceMention(ctx, thread, source);
    if (referenceSource) return referenceSource;
    throw new Error("Analyze Source could not resolve that uploaded reference.");
  }
  if (parts.kind === "artifact" && parts.firstId) {
    return await analysisSourceFromArtifact(ctx, thread, parts.firstId, source);
  }
  if (parts.kind === "creative_asset" && parts.firstId) {
    return await analysisSourceFromCreativeAsset(ctx, thread, parts.firstId, source);
  }
  const artifactId = ctx.db.normalizeId("artifacts", source);
  if (artifactId) return await analysisSourceFromArtifact(ctx, thread, String(artifactId), source);

  const creativeAssetId = ctx.db.normalizeId("creativeAssets", source);
  if (creativeAssetId) {
    return await analysisSourceFromCreativeAsset(ctx, thread, String(creativeAssetId), source);
  }

  throw new Error("Analyze Source could not resolve that library asset.");
}

async function resolveAnalysisSourceForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  sourceType: string | undefined,
  source: string
): Promise<AnalysisSourceForToolCall> {
  if (!source) throw new Error("Analyze Source needs a source to analyze.");

  const referenceSource = await analysisSourceFromKnownReferenceMention(ctx, thread, source);
  if (referenceSource) return referenceSource;

  if (sourceType === "url") {
    const url = validatePublicAnalysisUrl(source);
    return {
      label: url,
      sourcePlatform: sourcePlatformForUrl(url),
      sourceType: "url",
      sourceUrl: url,
    };
  }

  if (sourceType === "artifact") {
    return await analysisSourceFromArtifact(ctx, thread, source);
  }

  if (sourceType === "library_asset") {
    return await analysisSourceFromLibraryAsset(ctx, thread, source);
  }

  if (sourceType === "file") {
    try {
      return {
        label: source,
        sourcePlatform: sourcePlatformForStoredMedia({ storageUrl: source }),
        sourceType: "upload",
        sourceUrl: source,
        storageUrl: source,
      };
    } catch {
      throw new Error("Analyze Source file inputs need a stored media URL.");
    }
  }

  throw new Error("Analyze Source sourceType must be url, file, artifact, or library_asset.");
}

export async function createAnalysisJobForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const sourceType = typeof input.sourceType === "string" ? input.sourceType : undefined;
  const source = typeof input.source === "string" ? input.source.trim() : "";

  const analysisSource = await resolveAnalysisSourceForToolCall(ctx, thread, sourceType, source);

  const now = Date.now();
  const jobId = await ctx.db.insert("videoAnalysisJobs", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    sourceType: analysisSource.sourceType,
    sourcePlatform: analysisSource.sourcePlatform,
    sourceUrl: analysisSource.sourceUrl,
    storageUrl: analysisSource.storageUrl,
    fileName: analysisSource.fileName,
    mimeType: analysisSource.mimeType,
    byteLength: analysisSource.byteLength,
    provider: GEMINI_PROVIDER,
    model: DEFAULT_ANALYSIS_MODEL,
    mode: "inspiration",
    customPrompt: cleanOptionalText(
      typeof input.instructions === "string" ? input.instructions : undefined
    ),
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.analyze.videoAnalysis.executeJob, { jobId });

  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      analysisJobId: jobId,
      artifactId: analysisSource.artifactId,
      creativeAssetId: analysisSource.creativeAssetId,
      libraryAssetId: analysisSource.libraryAssetId,
      sourceType: analysisSource.sourceType,
      sourceUrl: analysisSource.sourceUrl,
      storageUrl: analysisSource.storageUrl,
      status: "queued",
    },
    completedAt: now,
    updatedAt: now,
  });

  await appendAgentMessage(ctx, thread, {
    content: `Started source analysis for ${analysisSource.label}. I will use the analysis job as context before generating new assets.`,
    kind: "tool_result",
  });

  return jobId;
}
