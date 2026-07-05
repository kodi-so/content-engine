import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { artifactMediaKind } from "../references/referenceResolution";
import {
  contentRequestIdFromToolOutput,
  videoProjectIdFromToolOutput,
} from "./toolExecutionShared";

type DbCtx = Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">;

export async function contentRequestIdsForThreadToolOutputs(
  ctx: DbCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">
) {
  const threadToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  return [
    ...new Set(
      threadToolCalls.flatMap((candidate) => {
        if (excludeToolCallId && candidate._id === excludeToolCallId) return [];
        const requestId = contentRequestIdFromToolOutput(candidate.output);
        return requestId ? [requestId] : [];
      })
    ),
  ];
}

export async function hasPendingContentRequestsForThreadToolOutputs(
  ctx: DbCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">
) {
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread, excludeToolCallId);

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request) continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }
    if (
      request.status === "queued" ||
      request.status === "planning" ||
      request.status === "generating"
    ) {
      return true;
    }
  }

  return false;
}

export async function readyArtifactsForThreadToolOutputs(
  ctx: DbCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId: Id<"createToolCalls"> | undefined,
  mediaKind: "image" | "video" | "audio"
) {
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread, excludeToolCallId);
  const artifacts: Doc<"artifacts">[] = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "ready") continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }
    const requestArtifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    artifacts.push(
      ...requestArtifacts.filter((artifact) =>
        artifact.storageUrl &&
        artifactMediaKind(artifact) === mediaKind &&
        (thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
      )
    );
  }

  return artifacts;
}

export async function latestVideoProjectForThreadToolOutputs(
  ctx: DbCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">
) {
  const threadToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  const projectIds = threadToolCalls.flatMap((candidate) => {
    if (excludeToolCallId && candidate._id === excludeToolCallId) return [];
    const projectId = videoProjectIdFromToolOutput(candidate.output);
    return projectId ? [projectId] : [];
  });

  for (const projectId of projectIds.reverse()) {
    const project = await ctx.db.get(projectId);
    if (!project || project.status === "archived") continue;
    if (thread.workspaceId ? project.workspaceId !== thread.workspaceId : project.userId !== thread.userId) {
      continue;
    }
    return project;
  }

  return null;
}
