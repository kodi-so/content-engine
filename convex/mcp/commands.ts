import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { enqueueCreateCommands } from "../create/commands/runtime";
import { listThreadOutputsForThread } from "../create/agent/agentThreadOutputs";
import { requireThreadAccess } from "../create/agent/agentThreadRecords";
import { executeRunnableQueuedTools } from "../create/toolExecution";
import { getCreateTool, type CreateToolName } from "../create/tools";
import { defaultWorkspaceForUser, requireWorkspaceMember } from "../workspaces/workspaces";
import { contentEngineArtifactUrl } from "./artifactLinks";

function normalizeAppUrl(value: string | undefined) {
  return value?.trim().replace(/\/$/, "") || undefined;
}

function runState(args: {
  thread: Doc<"createThreads">;
  toolCalls: Doc<"createToolCalls">[];
  outputs: Awaited<ReturnType<typeof listThreadOutputsForThread>>;
}) {
  if (
    args.thread.status === "failed" ||
    args.toolCalls.some((toolCall) => toolCall.status === "failed") ||
    args.outputs.contentRequests.some(({ request }) => request.status === "failed") ||
    args.outputs.analysisJobs.some((job) => job.status === "failed") ||
    args.outputs.studioRenderRequests.some((request) => request.status === "failed")
  ) {
    return "failed" as const;
  }
  if (
    args.thread.status === "waiting_for_user" ||
    args.toolCalls.some((toolCall) => toolCall.status === "blocked")
  ) {
    return "awaiting_confirmation" as const;
  }

  const contentIsRunning = args.outputs.contentRequests.some(({ request }) =>
    request.status === "queued" ||
    request.status === "planning" ||
    request.status === "generating"
  );
  const renderIsRunning = args.outputs.studioRenderRequests.some((request) =>
    request.status === "queued" || request.status === "rendering"
  );
  const analysisIsRunning = args.outputs.analysisJobs.some((job) =>
    job.status === "queued" || job.status === "running"
  );
  const commandIsRunning = args.toolCalls.some((toolCall) =>
    toolCall.status === "queued" || toolCall.status === "running"
  );
  if (
    contentIsRunning ||
    renderIsRunning ||
    analysisIsRunning ||
    commandIsRunning ||
    args.thread.status === "running"
  ) {
    return "running" as const;
  }
  if (args.toolCalls.length && args.toolCalls.every((toolCall) => toolCall.status === "succeeded")) {
    return "completed" as const;
  }
  if (args.thread.status === "canceled") return "canceled" as const;
  return "idle" as const;
}

export const invoke = internalMutation({
  args: {
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    threadId: v.optional(v.id("createThreads")),
    toolName: v.string(),
    input: v.any(),
  },
  handler: async (ctx, args) => {
    const tool = getCreateTool(args.toolName as CreateToolName);
    if (!tool || !tool.audiences?.includes("mcp")) {
      throw new Error(`Unknown Content Engine command: ${args.toolName}`);
    }

    let thread: Doc<"createThreads">;
    if (args.threadId) {
      thread = await requireThreadAccess(ctx, args.threadId, args.userId);
      if (args.workspaceId && thread.workspaceId !== args.workspaceId) {
        throw new Error("The requested run is outside the authorized workspace");
      }
    } else {
      const workspace = args.workspaceId
        ? (await requireWorkspaceMember(ctx, args.workspaceId, args.userId)).workspace
        : await defaultWorkspaceForUser(ctx, args.userId);
      if (!workspace) throw new Error("No Content Engine workspace is available");
      const now = Date.now();
      const threadId = await ctx.db.insert("createThreads", {
        userId: args.userId,
        workspaceId: workspace._id,
        origin: "mcp",
        title: `MCP · ${tool.label}`,
        status: "idle",
        checkpointMode: "auto",
        decisionRunId: crypto.randomUUID(),
        turnDecisionCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      thread = (await ctx.db.get(threadId))!;
    }

    const input = args.input && typeof args.input === "object" && !Array.isArray(args.input)
      ? args.input as Record<string, unknown>
      : {};
    const [command] = await enqueueCreateCommands(ctx, thread, {
      commands: [{ input, toolName: tool.name }],
    });
    await ctx.db.patch(thread._id, { status: "planning", updatedAt: Date.now() });
    const updatedThread = (await ctx.db.get(thread._id)) ?? thread;
    const execution = await executeRunnableQueuedTools(ctx, updatedThread);

    return {
      threadId: thread._id,
      toolCallId: command.id,
      execution,
    };
  },
});

export const snapshot = internalQuery({
  args: {
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    threadId: v.id("createThreads"),
    appUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await requireThreadAccess(ctx, args.threadId, args.userId);
    if (args.workspaceId && thread.workspaceId !== args.workspaceId) {
      throw new Error("The requested run is outside the authorized workspace");
    }
    const toolCalls = await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .order("asc")
      .collect();
    const outputs = await listThreadOutputsForThread(ctx, thread);
    const artifactMap = new Map<string, Doc<"artifacts">>();
    for (const artifact of outputs.directArtifacts) artifactMap.set(artifact._id, artifact);
    for (const { artifacts } of outputs.contentRequests) {
      for (const artifact of artifacts) artifactMap.set(artifact._id, artifact);
    }
    for (const request of outputs.studioRenderRequests) {
      if (request.outputArtifact) artifactMap.set(request.outputArtifact._id, request.outputArtifact);
    }

    const appUrl = normalizeAppUrl(args.appUrl);
    const state = runState({ thread, toolCalls, outputs });
    return {
      run: {
        id: thread._id,
        title: thread.title,
        state,
        errorMessage: thread.errorMessage,
        workspaceId: thread.workspaceId,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        pollAfterMs: state === "running" ? 2500 : undefined,
      },
      commands: toolCalls.map((toolCall) => ({
        id: toolCall._id,
        name: toolCall.toolName,
        label: toolCall.label,
        status: toolCall.status,
        input: toolCall.input,
        output: toolCall.output,
        artifactIds: toolCall.artifactIds,
        errorMessage: toolCall.errorMessage,
        costUsd: toolCall.costUsd,
        createdAt: toolCall.createdAt,
        completedAt: toolCall.completedAt,
      })),
      artifacts: [...artifactMap.values()].map((artifact) => ({
        id: artifact._id,
        type: artifact.type,
        title: artifact.title,
        url: artifact.storageUrl,
        data: artifact.data,
        provider: artifact.provider,
        model: artifact.model,
        prompt: artifact.prompt,
        reviewStatus: artifact.reviewStatus,
        createdAt: artifact.createdAt,
        contentEngineUrl: contentEngineArtifactUrl(appUrl, artifact),
      })),
      slideshows: outputs.contentRequests.flatMap(({ slideshows }) =>
        slideshows.map((slideshow) => ({
          id: slideshow._id,
          title: slideshow.title,
          status: slideshow.status,
          spec: slideshow.spec,
          contentEngineUrl: appUrl ? `${appUrl}/slideshows/${slideshow._id}` : undefined,
        }))
      ),
      analyses: outputs.analysisJobs,
      projects: outputs.videoProjects.map((project) => ({
        id: project._id,
        title: project.title,
        status: project.status,
        contentEngineUrl: appUrl ? `${appUrl}/studio?projectId=${project._id}` : undefined,
      })),
      accountPosts: outputs.accountPosts,
      renders: outputs.studioRenderRequests.map((request) => ({
        id: request._id,
        status: request.status,
        progress: request.progress,
        progressMessage: request.progressMessage,
        errorMessage: request.errorMessage,
        outputArtifactId: request.outputArtifactId,
      })),
      references: outputs.referenceResults,
      links: {
        create: appUrl ? `${appUrl}/create` : undefined,
        library: appUrl ? `${appUrl}/library` : undefined,
        accounts: appUrl ? `${appUrl}/accounts` : undefined,
      },
    };
  },
});
