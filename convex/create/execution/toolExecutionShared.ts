import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import type { ModelProviderName } from "../../providers/model";
import type { ToolReferenceAsset } from "../references/referenceResolution";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function contentRequestIdFromToolOutput(output: unknown): Id<"contentRequests"> | null {
  if (!isRecord(output) || typeof output.contentRequestId !== "string") return null;
  return output.contentRequestId as Id<"contentRequests">;
}

export function analysisJobIdFromToolOutput(output: unknown): Id<"contentAnalyses"> | null {
  if (!isRecord(output) || typeof output.analysisJobId !== "string") return null;
  return output.analysisJobId as Id<"contentAnalyses">;
}

export function videoProjectIdFromToolOutput(output: unknown): Id<"videoProjects"> | null {
  if (!isRecord(output) || typeof output.projectId !== "string") return null;
  return output.projectId as Id<"videoProjects">;
}

export function accountPostIdFromToolOutput(output: unknown): Id<"accountPosts"> | null {
  if (!isRecord(output) || typeof output.accountPostId !== "string") return null;
  return output.accountPostId as Id<"accountPosts">;
}

export function studioRenderRequestIdFromToolOutput(output: unknown): Id<"studioRenderRequests"> | null {
  if (!isRecord(output) || typeof output.studioRenderRequestId !== "string") return null;
  return output.studioRenderRequestId as Id<"studioRenderRequests">;
}

export function slideshowPromptReviewRequestId(data: unknown): Id<"contentRequests"> | null {
  if (
    !isRecord(data) ||
    data.kind !== "slideshow_prompt_review" ||
    typeof data.contentRequestId !== "string"
  ) {
    return null;
  }
  return data.contentRequestId as Id<"contentRequests">;
}

export function outputId(output: unknown, key: string) {
  if (!isRecord(output)) return undefined;
  const value = output[key];
  return typeof value === "string" ? value : undefined;
}

export async function appendAgentMessage(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  args: {
    content: string;
    artifactIds?: Id<"artifacts">[];
    kind?: "chat" | "clarification" | "plan" | "status" | "tool_result" | "final_review";
  }
) {
  const now = Date.now();
  return await ctx.db.insert("createMessages", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    createThreadId: thread._id,
    role: "agent",
    content: args.content,
    kind: args.kind,
    artifactIds: args.artifactIds,
    createdAt: now,
  });
}

export async function markAccountRunFailedForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  errorMessage: string
) {
  if (!thread.accountAgentRunId) return;
  const run = await ctx.db.get(thread.accountAgentRunId);
  if (!run || run.status === "completed" || run.status === "failed" || run.status === "skipped") return;
  const now = Date.now();
  const costUsd = await accountRunCostForThread(ctx, thread, run.costUsd ?? 0);
  await ctx.db.patch(run._id, {
    status: "failed",
    errorMessage,
    costUsd,
    completedAt: now,
    updatedAt: now,
  });
}

export async function accountRunCostForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  startingCost = 0
) {
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .take(200);
  const requestIds = [
    ...new Set(toolCalls.flatMap((toolCall) => {
      const requestId = contentRequestIdFromToolOutput(toolCall.output);
      return requestId ? [requestId] : [];
    })),
  ];
  const requests = await Promise.all(requestIds.map((requestId) => ctx.db.get(requestId)));
  return startingCost +
    toolCalls.reduce((sum, toolCall) => sum + (toolCall.costUsd ?? 0), 0) +
    requests.reduce((sum, request) => sum + (request?.costUsd ?? 0), 0);
}

export function recordBelongsToCreateThread(
  thread: Doc<"createThreads">,
  record: { userId: string; workspaceId?: Id<"workspaces"> }
) {
  return thread.workspaceId
    ? record.workspaceId === thread.workspaceId
    : record.userId === thread.userId;
}

export function cleanOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function cleanOptionalStringFromRecord(input: Record<string, unknown>, key: string) {
  return cleanOptionalString(input[key]);
}

export function modelProviderFromInput(value: unknown): ModelProviderName | undefined {
  return value === "bulkapis" ||
    value === "gemini" ||
    value === "fal" ||
    value === "openrouter" ||
    value === "manual"
    ? value
    : undefined;
}

export const modelProviderNameValidator = v.union(
  v.literal("bulkapis"),
  v.literal("gemini"),
  v.literal("fal"),
  v.literal("openrouter"),
  v.literal("manual")
);

export const toolReferenceAssetValidator = v.object({
  alias: v.optional(v.string()),
  description: v.optional(v.string()),
  mimeType: v.string(),
  url: v.string(),
});

export function finitePositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export function positiveIntegerFromInput(value: unknown) {
  const number = finitePositiveNumber(value);
  return number ? Math.floor(number) : undefined;
}

export function zeroBasedIndexFromInput(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function zeroBasedIndexesFromInput(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    const index = zeroBasedIndexFromInput(item);
    return index === undefined ? [] : [index];
  });
}

export function selectedPriorArtifactsByIndexes<T>(
  artifacts: T[],
  input: Record<string, unknown>,
  keys: {
    indexKey?: string;
    indexesKey?: string;
  } = {}
) {
  const indexesKey = keys.indexesKey ?? "priorImageOutputIndexes";
  const indexKey = keys.indexKey ?? "priorImageOutputIndex";
  const indexes = zeroBasedIndexesFromInput(input[indexesKey]);
  if (indexes) {
    return indexes.flatMap((index) => {
      const artifact = artifacts[index];
      return artifact ? [artifact] : [];
    });
  }

  const index = zeroBasedIndexFromInput(input[indexKey]);
  if (index === undefined) return undefined;
  const artifact = artifacts[index];
  return artifact ? [artifact] : [];
}

export function mediaAssetsFromInput(input: Record<string, unknown>) {
  const mediaAssets = Array.isArray(input.mediaAssets) ? input.mediaAssets : [];
  return mediaAssets.flatMap((item): ToolReferenceAsset[] => {
    if (!isRecord(item)) return [];
    const url = cleanOptionalString(item.url) ??
      cleanOptionalString(item.storageUrl) ??
      cleanOptionalString(item.sourceUrl);
    const mimeType = cleanOptionalString(item.mimeType);
    if (!url || !mimeType) return [];
    return [{
      alias: cleanOptionalString(item.alias) ?? cleanOptionalString(item.title),
      description: cleanOptionalString(item.description) ?? cleanOptionalString(item.prompt),
      mimeType,
      url,
    }];
  });
}

export function uniqueReferenceAssets(assets: ToolReferenceAsset[]) {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = `${asset.url}:${asset.mimeType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function errorMessageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : "Tool execution failed.";
}

export function byteLengthFromRecord(record: Record<string, unknown>) {
  return finitePositiveNumber(record.byteLength) ??
    finitePositiveNumber(record.fileSize) ??
    finitePositiveNumber(record.sizeBytes);
}
