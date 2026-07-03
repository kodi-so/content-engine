import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  isRecord,
  resolveToolReferences,
  type ToolReferenceAsset,
} from "../references/referenceResolution";

type MutableResolvedReferences = Awaited<ReturnType<typeof resolveToolReferences>>;

function referenceKey(reference: ToolReferenceAsset) {
  return `${reference.mimeType}:${reference.url}`;
}

function appendUniqueReference(target: ToolReferenceAsset[], reference: ToolReferenceAsset) {
  const key = referenceKey(reference);
  if (target.some((existing) => referenceKey(existing) === key)) return;
  target.push(reference);
}

function pushDiscoveredReferenceByMediaKind(
  references: MutableResolvedReferences,
  mediaKind: string,
  reference: ToolReferenceAsset
) {
  if (mediaKind === "image") {
    appendUniqueReference(references.imageReferences, reference);
    return;
  }
  if (mediaKind === "video") {
    appendUniqueReference(references.videoReferences, reference);
    return;
  }
  if (mediaKind === "audio") {
    appendUniqueReference(references.audioReferences, reference);
  }
}

export async function appendDiscoveredReferencesForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId: Id<"createToolCalls"> | undefined,
  references: MutableResolvedReferences
) {
  const threadToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  const seenCreativeAssetIds = new Set(
    references.creativeAssetReferences.map((reference) => String(reference.assetId))
  );

  for (const candidate of threadToolCalls) {
    if (excludeToolCallId && candidate._id === excludeToolCallId) continue;
    if (candidate.toolName !== "references.list" || candidate.status !== "succeeded") continue;
    const output = isRecord(candidate.output) ? candidate.output : {};
    if (!Array.isArray(output.references)) continue;

    for (const item of output.references) {
      if (!isRecord(item)) continue;
      const storageUrl = typeof item.storageUrl === "string" ? item.storageUrl.trim() : "";
      const mediaKind = typeof item.mediaKind === "string" ? item.mediaKind : "";
      if (!storageUrl || (mediaKind !== "image" && mediaKind !== "video" && mediaKind !== "audio")) {
        continue;
      }

      const source = typeof item.source === "string" ? item.source : "";
      const sourceId = typeof item.sourceId === "string" ? item.sourceId : "";
      const creativeAssetId = typeof item.creativeAssetId === "string"
        ? item.creativeAssetId
        : source === "creative_asset"
          ? sourceId
          : "";
      if (creativeAssetId && !seenCreativeAssetIds.has(creativeAssetId)) {
        references.creativeAssetReferences.push({
          assetId: creativeAssetId as Id<"creativeAssets">,
          instruction: typeof item.prompt === "string" ? item.prompt : undefined,
        });
        seenCreativeAssetIds.add(creativeAssetId);
      }

      pushDiscoveredReferenceByMediaKind(references, mediaKind, {
        alias: typeof item.title === "string" ? item.title : undefined,
        description: typeof item.prompt === "string" ? item.prompt : undefined,
        mimeType: typeof item.mimeType === "string"
          ? item.mimeType
          : mediaKind === "image"
            ? "image/png"
            : mediaKind === "video"
              ? "video/mp4"
              : "audio/mpeg",
        url: storageUrl,
      });
    }
  }
}
