import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { requireWorkspaceMember } from "../../workspaces/workspaces";

export async function assertVideoProjectAccess(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"videoProjects">,
  userId: string
) {
  if (project.workspaceId) {
    await requireWorkspaceMember(ctx, project.workspaceId, userId);
    return;
  }
  if (project.userId !== userId) throw new Error("Video project not found");
}

export async function assertCreateThreadAccess(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<"createThreads">,
  userId: string
) {
  const thread = await ctx.db.get(threadId);
  if (!thread) throw new Error("Create thread not found");
  if (thread.workspaceId) {
    await requireWorkspaceMember(ctx, thread.workspaceId, userId);
    return thread;
  }
  if (thread.userId !== userId) throw new Error("Create thread not found");
  return thread;
}

export async function assertArtifactAccess(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  userId: string
) {
  const artifact = await ctx.db.get(artifactId);
  if (!artifact) throw new Error("Rendered artifact not found");
  if (artifact.workspaceId) {
    await requireWorkspaceMember(ctx, artifact.workspaceId, userId);
    return artifact;
  }
  if (artifact.userId !== userId) throw new Error("Rendered artifact not found");
  return artifact;
}

export async function assertRenderRequestAccess(
  ctx: QueryCtx | MutationCtx,
  requestId: Id<"studioRenderRequests">,
  userId: string
) {
  const request = await ctx.db.get(requestId);
  if (!request) throw new Error("Studio render request not found");
  if (request.workspaceId) {
    await requireWorkspaceMember(ctx, request.workspaceId, userId);
    return request;
  }
  if (request.userId !== userId) throw new Error("Studio render request not found");
  return request;
}
