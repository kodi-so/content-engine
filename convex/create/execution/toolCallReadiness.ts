import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { analysisJobIdFromToolOutput } from "../references/sourceAnalysisContext";
import {
  contentRequestIdFromToolOutput,
  studioRenderRequestIdFromToolOutput,
} from "./toolExecutionShared";

export async function toolCallHasPendingAsyncOutput(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const contentRequestId = contentRequestIdFromToolOutput(toolCall.output);
  if (contentRequestId) {
    const request = await ctx.db.get(contentRequestId);
    if (
      request &&
      (thread.workspaceId ? request.workspaceId === thread.workspaceId : request.userId === thread.userId) &&
      (request.status === "queued" || request.status === "planning" || request.status === "generating")
    ) {
      return true;
    }
  }

  const analysisJobId = analysisJobIdFromToolOutput(toolCall.output);
  if (analysisJobId) {
    const job = await ctx.db.get(analysisJobId);
    if (
      job &&
      (thread.workspaceId ? job.workspaceId === thread.workspaceId : job.userId === thread.userId) &&
      job.status !== "completed" &&
      job.status !== "failed"
    ) {
      return true;
    }
  }

  const studioRenderRequestId = studioRenderRequestIdFromToolOutput(toolCall.output);
  if (studioRenderRequestId) {
    const request = await ctx.db.get(studioRenderRequestId);
    if (
      request &&
      (thread.workspaceId ? request.workspaceId === thread.workspaceId : request.userId === thread.userId) &&
      request.status !== "completed" &&
      request.status !== "failed" &&
      request.status !== "canceled"
    ) {
      return true;
    }
  }

  return false;
}
