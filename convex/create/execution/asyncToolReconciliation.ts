import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { CreateToolName } from "../tools";
import { isRecord } from "../references/referenceResolution";
import { toolDescriptorMap } from "../planning";
import { analysisJobIdFromToolOutput } from "../references/sourceAnalysisContext";
import {
  appendAgentMessage,
  contentRequestIdFromToolOutput,
  studioRenderRequestIdFromToolOutput,
} from "./toolExecutionShared";

const continueWorkingCheckpointLabel = "Continue working?";

function maxTurnDecisionCount() {
  const parsed = Number.parseInt(process.env.CONTENT_ENGINE_AGENT_MAX_TURN_DECISIONS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

async function asyncFailureMessageForToolCall(
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
      if (
        request.status === "discarded" &&
        (
          request.errorMessage === "Stopped by user." ||
          request.errorMessage === "Stopped at slideshow prompt checkpoint." ||
          request.errorMessage === "Revised from slideshow prompt checkpoint."
        )
      ) {
        return null;
      }
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
    const request = await ctx.db.get(renderRequestId);
    if (
      request &&
      (thread.workspaceId ? request.workspaceId === thread.workspaceId : request.userId === thread.userId) &&
      (request.status === "failed" || request.status === "canceled")
    ) {
      return request.errorMessage ?? "The Studio render request failed.";
    }
  }

  return null;
}

export async function reconcileAsyncToolFailures(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const now = Date.now();

  for (const toolCall of toolCalls) {
    if (toolCall.status !== "succeeded" && toolCall.status !== "blocked") continue;
    const errorMessage = await asyncFailureMessageForToolCall(ctx, thread, toolCall);
    if (!errorMessage) continue;

    await ctx.db.patch(toolCall._id, {
      status: "failed",
      errorMessage,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: `${toolCall.label} failed after it was queued: ${errorMessage}`,
      kind: "status",
    });
    await ctx.db.patch(thread._id, {
      status: "failed",
      errorMessage,
      updatedAt: now,
    });

    return { failedToolCallId: toolCall._id, errorMessage };
  }

  return null;
}

async function reviewedCheckpointArtifactIdSet(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const checkpoints = await ctx.db
    .query("createCheckpoints")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  return new Set(
    checkpoints.flatMap((checkpoint) => checkpoint.artifactIds ?? []).map(String)
  );
}

export async function hasOpenCheckpoint(ctx: MutationCtx, thread: Doc<"createThreads">) {
  const checkpoints = await ctx.db
    .query("createCheckpoints")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  return checkpoints.some((checkpoint) => checkpoint.status === "open");
}

async function readyUnreviewedArtifactIdsForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const reviewedArtifactIds = await reviewedCheckpointArtifactIdSet(ctx, thread);
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const requestIds = [
    ...new Set(
      toolCalls.flatMap((toolCall) => {
        if (!shouldCreateDebugOutputCheckpointForTool(toolCall.toolName)) return [];
        const requestId = contentRequestIdFromToolOutput(toolCall.output);
        return requestId ? [requestId] : [];
      })
    ),
  ];
  const artifactIds: Id<"artifacts">[] = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request || (request.status !== "ready" && request.status !== "saved")) continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    artifactIds.push(
      ...artifacts.flatMap((artifact) =>
        shouldReviewGeneratedArtifact(artifact) &&
        !reviewedArtifactIds.has(String(artifact._id)) &&
        (thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
          ? [artifact._id]
          : []
      )
    );
  }

  for (const toolCall of toolCalls) {
    if (!shouldCreateDebugOutputCheckpointForTool(toolCall.toolName)) continue;
    for (const artifactId of toolCall.artifactIds ?? []) {
      if (reviewedArtifactIds.has(String(artifactId))) continue;
      const artifact = await ctx.db.get(artifactId);
      if (
        artifact &&
        shouldReviewGeneratedArtifact(artifact) &&
        (thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
      ) {
        artifactIds.push(artifact._id);
      }
    }
  }

  return [...new Set(artifactIds)];
}

function shouldReviewGeneratedArtifact(artifact: Doc<"artifacts">) {
  const data = isRecord(artifact.data) ? artifact.data : {};
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : "";
  return Boolean(artifact.storageUrl) &&
    (
      artifact.type === "image" ||
      artifact.type === "video" ||
      mimeType.startsWith("audio/") ||
      data.kind === "audio"
    );
}

function shouldCreateDebugOutputCheckpointForTool(toolName: string) {
  const tool = toolDescriptorMap().get(toolName as CreateToolName);
  return Boolean(tool?.checkpoint.behavior !== "none" && tool?.checkpoint.defaultInDebugMode);
}

export async function createDebugReadyOutputCheckpointIfNeeded(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  if (thread.checkpointMode !== "debug") return false;
  if (await hasOpenCheckpoint(ctx, thread)) return true;

  const artifactIds = await readyUnreviewedArtifactIdsForThread(ctx, thread);
  if (!artifactIds.length) return false;

  const now = Date.now();
  await ctx.db.insert("createCheckpoints", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    createThreadId: thread._id,
    status: "open",
    label: artifactIds.length === 1 ? "Review generated output" : "Review generated outputs",
    message:
      "Debug Mode is pausing here so you can approve these generated assets before the agent uses them in the next step.",
    artifactIds,
    createdAt: now,
    updatedAt: now,
  });
  await appendAgentMessage(ctx, thread, {
    content: "Paused for Debug Mode review. Approve the generated assets to continue, or ask for a revision.",
    kind: "status",
  });
  await ctx.db.patch(thread._id, {
    status: "waiting_for_user",
    updatedAt: now,
  });

  return true;
}

async function latestUserMessageForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const messages = await ctx.db
    .query("createMessages")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  return [...messages]
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((message) => message.role === "user");
}

export async function continueAgentLoopAfterToolCompletion(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  if (await hasOpenCheckpoint(ctx, thread)) return false;

  const latestUserMessage = await latestUserMessageForThread(ctx, thread);
  if (!latestUserMessage) return false;

  const now = Date.now();
  const decisionCap = maxTurnDecisionCount();
  if (thread.turnDecisionCount >= decisionCap) {
    await ctx.db.insert("createCheckpoints", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      status: "open",
      label: continueWorkingCheckpointLabel,
      message: `The agent has taken ${thread.turnDecisionCount} planning steps on this request, so it is pausing for confirmation before continuing.`,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(thread._id, {
      status: "waiting_for_user",
      updatedAt: now,
    });
    return true;
  }

  const decisionRunId = crypto.randomUUID();
  await appendAgentMessage(ctx, thread, {
    content: "Thinking through the next step.",
    kind: "status",
  });
  await ctx.db.patch(thread._id, {
    decisionRunId,
    status: "planning",
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.create.agent.decideAgentTurn, {
    checkpointMode: thread.checkpointMode,
    decisionRunId,
    threadId: thread._id,
    userMessageId: latestUserMessage._id,
  });

  return true;
}
