import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  analysisJobIdFromToolOutput,
  contentRequestIdFromToolOutput,
  studioRenderRequestIdFromToolOutput,
} from "../execution/toolExecutionShared";

type WorkspaceOwnedRecord = {
  userId: string;
  workspaceId?: Id<"workspaces">;
};

export function formatStoppedDuration(ms: number) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function createThreadScopeMatchesRecord(
  thread: Doc<"createThreads">,
  record: WorkspaceOwnedRecord
) {
  return thread.workspaceId
    ? record.workspaceId === thread.workspaceId
    : record.userId === thread.userId;
}

export async function toolCallsForAsyncOutput(
  ctx: MutationCtx,
  source: Doc<"contentRequests"> | Doc<"videoAnalysisJobs"> | Doc<"studioRenderRequests">,
  matchesOutput: (output: unknown) => boolean
) {
  const candidates = source.workspaceId
    ? await ctx.db
        .query("createToolCalls")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", source.workspaceId))
        .collect()
    : await ctx.db
        .query("createToolCalls")
        .withIndex("by_user", (q) => q.eq("userId", source.userId))
        .collect();

  return candidates.filter((toolCall) =>
    (toolCall.status === "succeeded" || toolCall.status === "blocked") &&
    matchesOutput(toolCall.output)
  );
}

export async function asyncFailureMessageForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const requestId = contentRequestIdFromToolOutput(toolCall.output);
  if (requestId) {
    const request = await ctx.db.get(requestId);
    if (
      request &&
      (thread.workspaceId ? request.workspaceId === thread.workspaceId : request.userId === thread.userId) &&
      (request.status === "failed" || request.status === "discarded")
    ) {
      return request.errorMessage ?? "The queued generation request failed.";
    }
  }

  const jobId = analysisJobIdFromToolOutput(toolCall.output);
  if (jobId) {
    const job = await ctx.db.get(jobId);
    if (
      job &&
      (thread.workspaceId ? job.workspaceId === thread.workspaceId : job.userId === thread.userId) &&
      job.status === "failed"
    ) {
      return job.errorMessage ?? "The queued source analysis failed.";
    }
  }

  const renderRequestId = studioRenderRequestIdFromToolOutput(toolCall.output);
  if (renderRequestId) {
    const renderRequest = await ctx.db.get(renderRequestId);
    if (
      renderRequest &&
      (thread.workspaceId
        ? renderRequest.workspaceId === thread.workspaceId
        : renderRequest.userId === thread.userId) &&
      (renderRequest.status === "failed" || renderRequest.status === "canceled")
    ) {
      return renderRequest.errorMessage ?? "The Studio render request failed.";
    }
  }

  return null;
}
