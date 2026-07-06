import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { artifactMediaKind, isRecord } from "../references/referenceResolution";
import {
  buildCreateAgentStudioDraft,
  selectCreateAgentStudioVisualArtifacts,
} from "../studio/studioComposition";
import { createStudioRenderRequest } from "../studioRenderRequests";
import { appendAgentMessage } from "./toolExecutionShared";
import {
  contentRequestIdsForThreadToolOutputs,
  latestVideoProjectForThreadToolOutputs,
} from "./threadToolOutputs";

const STUDIO_RENDER_NOT_CONFIGURED_MESSAGE =
  "Automatic Studio rendering is not configured yet. Set STUDIO_RENDER_WORKER_URL and STUDIO_RENDER_WORKER_API_KEY so Create can render the final video in chat.";

export async function createStudioProjectForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread, toolCall._id);
  const videoArtifacts: Doc<"artifacts">[] = [];
  const imageArtifacts: Doc<"artifacts">[] = [];
  const audioArtifacts: Doc<"artifacts">[] = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "ready") continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    for (const artifact of artifacts) {
      if (
        !artifact.storageUrl ||
        !(thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
      ) {
        continue;
      }
      const mediaKind = artifactMediaKind(artifact);
      if (mediaKind === "image") imageArtifacts.push(artifact);
      if (mediaKind === "video") videoArtifacts.push(artifact);
      if (mediaKind === "audio") audioArtifacts.push(artifact);
    }
  }

  if (!videoArtifacts.length && !imageArtifacts.length) {
    await appendAgentMessage(ctx, thread, {
      content: "There are no ready visual assets to open in Studio yet. Wait for image or video generation to finish, then continue.",
      kind: "status",
    });
    return false;
  }

  const now = Date.now();
  const selectedVisualArtifacts = selectCreateAgentStudioVisualArtifacts({
    imageArtifacts,
    input,
    videoArtifacts,
  });
  const draft = buildCreateAgentStudioDraft({
    audioArtifacts,
    aspectRatio: input.aspectRatio,
    imageArtifacts,
    input,
    videoArtifacts,
  });
  const projectId = await ctx.db.insert("videoProjects", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    title: "Create Agent composition",
    status: "draft",
    draft,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  });

  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      projectId,
      audioArtifactIds: audioArtifacts.map((artifact) => artifact._id),
      imageArtifactIds: selectedVisualArtifacts.imageArtifacts.map((artifact) => artifact._id),
      clipArtifactIds: selectedVisualArtifacts.videoArtifacts.map((artifact) => artifact._id),
      audioTrackCount: draft.audioTracks.length,
      imageClipCount: selectedVisualArtifacts.imageArtifacts.length,
      textOverlayCount: draft.textOverlays.length,
      status: "ready",
    },
    completedAt: now,
    updatedAt: now,
  });

  await appendAgentMessage(ctx, thread, {
    content: `Created a Studio project with ${selectedVisualArtifacts.videoArtifacts.length} video clip${selectedVisualArtifacts.videoArtifacts.length === 1 ? "" : "s"}${selectedVisualArtifacts.imageArtifacts.length ? `, ${selectedVisualArtifacts.imageArtifacts.length} image clip${selectedVisualArtifacts.imageArtifacts.length === 1 ? "" : "s"}` : ""}${audioArtifacts.length ? `, and ${audioArtifacts.length} audio track${audioArtifacts.length === 1 ? "" : "s"}` : ""}.`,
    kind: "tool_result",
  });

  return true;
}

export async function createStudioRenderRequestForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const inputProjectId = typeof input.projectId === "string"
    ? input.projectId as Id<"videoProjects">
    : undefined;
  const project = inputProjectId
    ? await ctx.db.get(inputProjectId)
    : await latestVideoProjectForThreadToolOutputs(ctx, thread, toolCall._id);

  if (!project || project.status === "archived") {
    await appendAgentMessage(ctx, thread, {
      content: "There is no Studio project ready to render yet. Create or open a Studio composition first.",
      kind: "status",
    });
    return false;
  }
  if (thread.workspaceId ? project.workspaceId !== thread.workspaceId : project.userId !== thread.userId) {
    throw new Error("Studio project does not belong to this Create thread.");
  }

  const result = await createStudioRenderRequest(ctx, {
    createThreadId: thread._id,
    createToolCallId: toolCall._id,
    project,
    renderSettings: input.renderSettings,
  });
  const now = Date.now();

  await ctx.db.patch(toolCall._id, {
    status: result.status === "queued" ? "running" : "blocked",
    output: {
      studioRenderRequestId: result.requestId,
      projectId: project._id,
      status: result.status,
      errorMessage: result.errorMessage,
    },
    errorMessage: result.errorMessage,
    updatedAt: now,
  });

  await appendAgentMessage(ctx, thread, {
    content: result.status === "queued"
      ? "Studio render is queued on the server render worker. I will attach the final video here when it finishes."
      : STUDIO_RENDER_NOT_CONFIGURED_MESSAGE,
    kind: "status",
  });
  await ctx.db.patch(thread._id, {
    status: result.status === "queued" ? "running" : "waiting_for_user",
    updatedAt: now,
  });

  return true;
}
