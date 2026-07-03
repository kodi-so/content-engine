import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  listSelectableLibraryAssets,
  type SelectableLibraryAsset,
  type SelectableMediaKind,
} from "../../library/assets";
import { isRecord } from "./referenceResolution";

function mediaKindsFromInput(input: Record<string, unknown>) {
  const rawMediaTypes = input.mediaTypes;
  const values = Array.isArray(rawMediaTypes)
    ? rawMediaTypes
    : typeof rawMediaTypes === "string"
      ? [rawMediaTypes]
      : [];

  return new Set(
    values.filter((value): value is SelectableMediaKind =>
      value === "image" ||
      value === "video" ||
      value === "audio" ||
      value === "media"
    )
  );
}

function normalizedSearchText(asset: SelectableLibraryAsset) {
  return [
    asset.title,
    asset.prompt,
    asset.provider,
    asset.model,
    asset.source,
    asset.mediaKind,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesQuery(asset: SelectableLibraryAsset, query?: string) {
  if (!query) return true;
  return normalizedSearchText(asset).includes(query.toLowerCase());
}

export async function listReferencesForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const query = typeof input.query === "string" ? input.query.trim() : undefined;
  const mediaKinds = mediaKindsFromInput(input);
  const limit = typeof input.limit === "number" && Number.isFinite(input.limit)
    ? Math.min(Math.max(Math.floor(input.limit), 1), 50)
    : 12;

  const libraryReferences = (await listSelectableLibraryAssets(ctx, {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
  }))
    .filter((asset) => !mediaKinds.size || mediaKinds.has(asset.mediaKind))
    .filter((asset) => matchesQuery(asset, query))
    .slice(0, limit)
    .map((asset) => ({
      id: asset.id,
      source: asset.source,
      sourceId: asset.sourceId,
      title: asset.title,
      mediaKind: asset.mediaKind,
      storageUrl: asset.storageUrl,
      mimeType: asset.mimeType,
      prompt: asset.prompt,
      provider: asset.provider,
      model: asset.model,
      createdAt: asset.createdAt,
    }));
  const references = libraryReferences
    .sort((first, second) => second.createdAt - first.createdAt)
    .slice(0, limit);

  const now = Date.now();
  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      references,
      count: references.length,
      query,
      mediaTypes: [...mediaKinds],
    },
    completedAt: now,
    updatedAt: now,
  });

  return references;
}
