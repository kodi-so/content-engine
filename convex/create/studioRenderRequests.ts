import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireBetaAccess } from "../auth/users";
import { publicUrlForKey, r2 } from "../storage/r2";
import { requireWorkspaceMember } from "../workspaces/workspaces";

const STUDIO_RENDER_BLOCKER_MESSAGE =
  "Automatic Studio rendering is not configured yet. Set STUDIO_RENDER_WORKER_URL and STUDIO_RENDER_WORKER_API_KEY so Create can render the final video in chat.";
const STUDIO_RENDER_QUEUED_MESSAGE =
  "Studio render is queued on the server render worker. I will attach the final video here when it finishes.";

function studioRenderWorkerUrl() {
  return process.env.STUDIO_RENDER_WORKER_URL?.trim().replace(/\/+$/, "");
}

function studioRenderWorkerApiKey() {
  return process.env.STUDIO_RENDER_WORKER_API_KEY?.trim();
}

function studioRenderCallbackUrl() {
  return process.env.STUDIO_RENDER_CALLBACK_URL?.trim().replace(/\/+$/, "") ||
    process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/, "");
}

function studioRenderCallbackApiKey() {
  return process.env.STUDIO_RENDER_CALLBACK_API_KEY?.trim() ||
    process.env.STUDIO_RENDER_WORKER_API_KEY?.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function renderFpsFromSettings(settings: unknown) {
  if (!isRecord(settings)) return 30;
  const fps = settings.fps;
  return typeof fps === "number" && Number.isFinite(fps) && fps > 0
    ? Math.min(120, Math.floor(fps))
    : 30;
}

function artifactIdsFromDraft(draft: unknown) {
  if (!isRecord(draft)) return [];
  const values = [
    ...(Array.isArray(draft.clips) ? draft.clips : []),
    ...(Array.isArray(draft.audioTracks) ? draft.audioTracks : []),
  ];
  return [
    ...new Set(
      values.flatMap((item) =>
        isRecord(item) && typeof item.artifactId === "string" ? [item.artifactId] : []
      )
    ),
  ] as Id<"artifacts">[];
}

function aspectRatioFromDraft(draft: unknown) {
  return isRecord(draft) && typeof draft.aspectRatio === "string" ? draft.aspectRatio : undefined;
}

function durationSecondsFromDraft(draft: unknown) {
  if (!isRecord(draft)) return undefined;
  const clipDurations = Array.isArray(draft.clips)
    ? draft.clips.map((clip) => {
        if (!isRecord(clip)) return 0;
        const duration = typeof clip.durationSeconds === "number" ? clip.durationSeconds : 0;
        const trimStart = typeof clip.trimStartSeconds === "number" ? clip.trimStartSeconds : 0;
        const trimEnd = typeof clip.trimEndSeconds === "number" ? clip.trimEndSeconds : duration;
        return Math.max(0, trimEnd - trimStart);
      })
    : [];
  const audioEnds = Array.isArray(draft.audioTracks)
    ? draft.audioTracks.map((track) => {
        if (!isRecord(track)) return 0;
        const start = typeof track.startSeconds === "number" ? track.startSeconds : 0;
        const duration = typeof track.durationSeconds === "number" ? track.durationSeconds : 0;
        const trimStart = typeof track.trimStartSeconds === "number" ? track.trimStartSeconds : 0;
        const trimEnd = typeof track.trimEndSeconds === "number" ? track.trimEndSeconds : duration;
        return start + Math.max(0, trimEnd - trimStart);
      })
    : [];
  const duration = Math.max(
    clipDurations.reduce((total, value) => total + value, 0),
    ...audioEnds,
    0
  );
  return duration > 0 ? duration : undefined;
}

async function assertVideoProjectAccess(
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

async function assertCreateThreadAccess(
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

async function assertArtifactAccess(
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

async function assertRenderRequestAccess(
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

export async function createBlockedStudioRenderRequest(
  ctx: MutationCtx,
  args: {
    createThreadId?: Id<"createThreads">;
    createToolCallId?: Id<"createToolCalls">;
    project: Doc<"videoProjects">;
    renderSettings?: unknown;
  }
) {
  const now = Date.now();
  const requestId = await ctx.db.insert("studioRenderRequests", {
    userId: args.project.userId,
    workspaceId: args.project.workspaceId,
    createThreadId: args.createThreadId,
    createToolCallId: args.createToolCallId,
    videoProjectId: args.project._id,
    status: "blocked",
    draftSnapshot: args.project.draft,
    renderSettings: args.renderSettings,
    errorMessage: STUDIO_RENDER_BLOCKER_MESSAGE,
    createdAt: now,
    updatedAt: now,
  });

  return {
    requestId,
    status: "blocked" as const,
    errorMessage: STUDIO_RENDER_BLOCKER_MESSAGE,
  };
}

export async function createStudioRenderRequest(
  ctx: MutationCtx,
  args: {
    createThreadId?: Id<"createThreads">;
    createToolCallId?: Id<"createToolCalls">;
    project: Doc<"videoProjects">;
    renderSettings?: unknown;
  }
) {
  const workerUrl = studioRenderWorkerUrl();
  if (!workerUrl) {
    return await createBlockedStudioRenderRequest(ctx, args);
  }

  const now = Date.now();
  const requestId = await ctx.db.insert("studioRenderRequests", {
    userId: args.project.userId,
    workspaceId: args.project.workspaceId,
    createThreadId: args.createThreadId,
    createToolCallId: args.createToolCallId,
    videoProjectId: args.project._id,
    status: "queued",
    draftSnapshot: args.project.draft,
    renderSettings: args.renderSettings,
    progress: 0,
    progressMessage: "Queued",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.create.studioRenderRequests.executeWorkerRender, {
    requestId,
  });

  return {
    requestId,
    status: "queued" as const,
    errorMessage: undefined,
  };
}

async function completeRenderRequestWithArtifact(
  ctx: MutationCtx,
  args: {
    request: Doc<"studioRenderRequests">;
    artifactId: Id<"artifacts">;
  }
) {
  const now = Date.now();
  await ctx.db.patch(args.request._id, {
    status: "completed",
    outputArtifactId: args.artifactId,
    errorMessage: undefined,
    progress: 1,
    progressMessage: "Completed",
    completedAt: now,
    updatedAt: now,
  });

  if (args.request.createToolCallId) {
    const toolCall = await ctx.db.get(args.request.createToolCallId);
    if (toolCall) {
      await ctx.db.patch(toolCall._id, {
        status: "succeeded",
        output: {
          ...(toolCall.output && typeof toolCall.output === "object" && !Array.isArray(toolCall.output)
            ? toolCall.output
            : {}),
          studioRenderRequestId: args.request._id,
          projectId: args.request.videoProjectId,
          outputArtifactId: args.artifactId,
          status: "completed",
        },
        artifactIds: [args.artifactId],
        errorMessage: undefined,
        completedAt: now,
        updatedAt: now,
      });
    }
  }

  if (args.request.createThreadId) {
    await ctx.db.insert("createMessages", {
      userId: args.request.userId,
      workspaceId: args.request.workspaceId,
      createThreadId: args.request.createThreadId,
      role: "agent",
      kind: "tool_result",
      content: "Studio render completed and the final composed video is attached to this conversation.",
      artifactIds: [args.artifactId],
      createdAt: now,
    });
    await ctx.db.patch(args.request.createThreadId, {
      status: "ready",
      finalArtifactIds: [args.artifactId],
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.create.agent.continueAfterAsyncResult, {
      studioRenderRequestId: args.request._id,
    });
  }
}

export const requestForProject = mutation({
  args: {
    projectId: v.id("videoProjects"),
    createThreadId: v.optional(v.id("createThreads")),
    renderSettings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const userId = identity.subject;
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status === "archived") {
      throw new Error("Video project not found");
    }
    await assertVideoProjectAccess(ctx, project, userId);

    if (args.createThreadId) {
      const thread = await assertCreateThreadAccess(ctx, args.createThreadId, userId);
      if (thread.workspaceId !== project.workspaceId) {
        throw new Error("Video project does not belong to this Create thread");
      }
    }

    const now = Date.now();
    const workerConfigured = Boolean(studioRenderWorkerUrl());
    const toolCallId = args.createThreadId
      ? await ctx.db.insert("createToolCalls", {
          userId: project.userId,
          workspaceId: project.workspaceId,
          createThreadId: args.createThreadId,
          toolName: "studio.render",
          status: workerConfigured ? "running" : "blocked",
          label: "Render Studio Video",
          input: {
            projectId: project._id,
            renderSettings: args.renderSettings,
          },
          errorMessage: workerConfigured ? undefined : STUDIO_RENDER_BLOCKER_MESSAGE,
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
      : undefined;

    const request = await createStudioRenderRequest(ctx, {
      createThreadId: args.createThreadId,
      createToolCallId: toolCallId,
      project,
      renderSettings: args.renderSettings,
    });

    if (toolCallId) {
      await ctx.db.patch(toolCallId, {
        output: {
          studioRenderRequestId: request.requestId,
          projectId: project._id,
          status: request.status,
          errorMessage: request.errorMessage,
        },
        errorMessage: request.errorMessage,
        updatedAt: now,
      });
      await ctx.db.insert("createMessages", {
        userId: project.userId,
        workspaceId: project.workspaceId,
        createThreadId: args.createThreadId!,
        role: "agent",
        kind: "status",
        content: request.status === "queued"
          ? STUDIO_RENDER_QUEUED_MESSAGE
          : STUDIO_RENDER_BLOCKER_MESSAGE,
        createdAt: now,
      });
      await ctx.db.patch(args.createThreadId!, {
        status: request.status === "queued" ? "running" : "waiting_for_user",
        updatedAt: now,
      });
    }

    return request;
  },
});

export const get = query({
  args: { id: v.id("studioRenderRequests") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    return await assertRenderRequestAccess(ctx, args.id, identity.subject);
  },
});

export const workerAvailability = query({
  args: {},
  handler: async (ctx) => {
    await requireBetaAccess(ctx);
    return {
      configured: Boolean(studioRenderWorkerUrl()),
    };
  },
});

export const renderProgressHttp = httpAction(async (ctx, request) => {
  const expected = studioRenderCallbackApiKey();
  if (expected && request.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response(JSON.stringify({ error: "Invalid render callback API key" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.requestId !== "string" || typeof body.progress !== "number") {
    return new Response(JSON.stringify({ error: "Invalid progress payload" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  await ctx.runMutation(internal.create.studioRenderRequests.reportWorkerProgress, {
    requestId: body.requestId as Id<"studioRenderRequests">,
    progress: body.progress,
    message: typeof body.message === "string" ? body.message : undefined,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

export const complete = mutation({
  args: {
    id: v.id("studioRenderRequests"),
    projectId: v.id("videoProjects"),
    outputArtifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const userId = identity.subject;
    const request = await assertRenderRequestAccess(ctx, args.id, userId);
    if (request.videoProjectId !== args.projectId) {
      throw new Error("Studio render request does not belong to this project");
    }
    const artifact = await assertArtifactAccess(ctx, args.outputArtifactId, userId);
    if (request.workspaceId !== artifact.workspaceId) {
      throw new Error("Rendered artifact does not belong to this render request");
    }

    await completeRenderRequestWithArtifact(ctx, {
      artifactId: artifact._id,
      request,
    });

    return {
      studioRenderRequestId: request._id,
      outputArtifactId: artifact._id,
    };
  },
});

export const getForWorker = internalQuery({
  args: { requestId: v.id("studioRenderRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Studio render request not found");
    const project = await ctx.db.get(request.videoProjectId);
    if (!project || project.status === "archived") {
      throw new Error("Studio project not found");
    }
    return { request, project };
  },
});

export const markWorkerRenderRunning = internalMutation({
  args: { requestId: v.id("studioRenderRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status === "completed" || request.status === "canceled") return;
    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "rendering",
      errorMessage: undefined,
      progress: Math.max(request.progress ?? 0, 0.01),
      progressMessage: "Rendering",
      updatedAt: now,
    });
    if (request.createToolCallId) {
      const toolCall = await ctx.db.get(request.createToolCallId);
      if (toolCall) {
        await ctx.db.patch(toolCall._id, {
          status: "running",
          output: {
            ...(toolCall.output && typeof toolCall.output === "object" && !Array.isArray(toolCall.output)
              ? toolCall.output
              : {}),
            studioRenderRequestId: request._id,
            projectId: request.videoProjectId,
            status: "rendering",
          },
          errorMessage: undefined,
          updatedAt: now,
        });
      }
    }
  },
});

export const reportWorkerProgress = internalMutation({
  args: {
    requestId: v.id("studioRenderRequests"),
    progress: v.number(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status === "completed" || request.status === "failed" || request.status === "canceled") {
      return;
    }
    const progress = Math.max(0, Math.min(0.999, args.progress));
    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: request.status === "queued" ? "rendering" : request.status,
      progress,
      progressMessage: args.message,
      updatedAt: now,
    });
    if (request.createToolCallId) {
      const toolCall = await ctx.db.get(request.createToolCallId);
      if (toolCall) {
        await ctx.db.patch(toolCall._id, {
          output: {
            ...(toolCall.output && typeof toolCall.output === "object" && !Array.isArray(toolCall.output)
              ? toolCall.output
              : {}),
            studioRenderRequestId: request._id,
            projectId: request.videoProjectId,
            status: "rendering",
            progress,
            progressMessage: args.message,
          },
          updatedAt: now,
        });
      }
    }
  },
});

export const completeWorkerRender = internalMutation({
  args: {
    requestId: v.id("studioRenderRequests"),
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return;
    await completeRenderRequestWithArtifact(ctx, {
      artifactId: args.artifactId,
      request,
    });
  },
});

export const failWorkerRender = internalMutation({
  args: {
    requestId: v.id("studioRenderRequests"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status === "completed" || request.status === "canceled") return;
    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      progressMessage: "Failed",
      updatedAt: now,
    });

    if (request.createToolCallId) {
      const toolCall = await ctx.db.get(request.createToolCallId);
      if (toolCall) {
        await ctx.db.patch(toolCall._id, {
          status: "failed",
          errorMessage: args.errorMessage,
          completedAt: now,
          updatedAt: now,
        });
      }
    }

    if (request.createThreadId) {
      await ctx.db.insert("createMessages", {
        userId: request.userId,
        workspaceId: request.workspaceId,
        createThreadId: request.createThreadId,
        role: "agent",
        kind: "status",
        content: `Studio render failed: ${args.errorMessage}`,
        createdAt: now,
      });
      await ctx.db.patch(request.createThreadId, {
        status: "failed",
        errorMessage: args.errorMessage,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.create.agent.continueAfterAsyncResult, {
        studioRenderRequestId: request._id,
      });
    }
  },
});

export const executeWorkerRender = internalAction({
  args: { requestId: v.id("studioRenderRequests") },
  handler: async (ctx, args) => {
    try {
      const workerUrl = studioRenderWorkerUrl();
      if (!workerUrl) {
        throw new Error("STUDIO_RENDER_WORKER_URL is not configured.");
      }

      const { request, project } = await ctx.runQuery(
        internal.create.studioRenderRequests.getForWorker,
        { requestId: args.requestId }
      );
      await ctx.runMutation(internal.create.studioRenderRequests.markWorkerRenderRunning, {
        requestId: request._id,
      });

      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      const apiKey = studioRenderWorkerApiKey();
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const callbackUrl = studioRenderCallbackUrl();
      const callbackApiKey = studioRenderCallbackApiKey();
      const response = await fetch(`${workerUrl}/render`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          draft: request.draftSnapshot,
          fps: renderFpsFromSettings(request.renderSettings),
          renderRequestId: String(request._id),
          projectId: String(project._id),
          ...(callbackUrl
            ? {
                progressCallbackUrl: `${callbackUrl}/studio-render/progress`,
                progressCallbackApiKey: callbackApiKey,
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Studio render worker failed (${response.status}): ${body || response.statusText}`);
      }

      const mimeType = response.headers.get("content-type") || "video/mp4";
      const bytes = await response.arrayBuffer();
      const storageId = await r2.store(ctx, new Blob([bytes], { type: mimeType }), {
        type: mimeType,
      });
      const storageUrl = publicUrlForKey(storageId);

      const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
        userId: request.userId,
        workspaceId: request.workspaceId,
        parentArtifactIds: artifactIdsFromDraft(request.draftSnapshot),
        type: "video",
        title: `${project.title || "Studio render"} render`,
        storageUrl,
        data: {
          source: "studio_render_worker",
          storageId,
          mimeType,
          fileSize: bytes.byteLength,
          aspectRatio: aspectRatioFromDraft(request.draftSnapshot),
          durationSeconds: durationSecondsFromDraft(request.draftSnapshot),
          composition: request.draftSnapshot,
          renderSettings: request.renderSettings,
          studioRenderRequestId: request._id,
          videoProjectId: project._id,
        },
        lifecycle: "saved",
        reviewStatus: "approved",
      });

      await ctx.runMutation(internal.create.studioRenderRequests.completeWorkerRender, {
        artifactId,
        requestId: request._id,
      });
    } catch (error) {
      await ctx.runMutation(internal.create.studioRenderRequests.failWorkerRender, {
        errorMessage: error instanceof Error ? error.message : "Studio render failed.",
        requestId: args.requestId,
      });
    }
  },
});

export const listForThread = query({
  args: { threadId: v.id("createThreads") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    await assertCreateThreadAccess(ctx, args.threadId, identity.subject);

    return await ctx.db
      .query("studioRenderRequests")
      .withIndex("by_thread", (q) => q.eq("createThreadId", args.threadId))
      .order("desc")
      .collect();
  },
});
