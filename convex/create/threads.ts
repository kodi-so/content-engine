import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  createCheckpointModeValidator,
  createCheckpointStatusValidator,
  createInferredOutputTypeValidator,
  createMessageKindValidator,
  createMessageRoleValidator,
  createReferenceMentionValidator,
  createThreadStatusValidator,
  createToolCallStatusValidator,
} from "../validators";

type ThreadDoc = Doc<"createThreads">;
type WorkspaceOwnedRecord = {
  userId: string;
  workspaceId?: Id<"workspaces">;
};

async function hasRecordAccess(
  ctx: QueryCtx | MutationCtx,
  record: WorkspaceOwnedRecord,
  userId: string
) {
  if (record.workspaceId) {
    await requireWorkspaceMember(ctx, record.workspaceId, userId);
    return true;
  }

  return record.userId === userId;
}

async function requireThreadAccess(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<"createThreads">,
  userId: string
) {
  const thread = await ctx.db.get(threadId);
  if (!thread || !(await hasRecordAccess(ctx, thread, userId))) {
    throw new Error("Create thread not found");
  }

  return thread;
}

async function findThreadForReadAccess(
  ctx: QueryCtx,
  threadId: Id<"createThreads">,
  userId: string
) {
  const thread = await ctx.db.get(threadId);
  if (!thread) return null;
  if (!(await hasRecordAccess(ctx, thread, userId))) {
    throw new Error("Create thread not found");
  }

  return thread;
}

function artifactBelongsToThread(
  artifact: Doc<"artifacts">,
  thread: ThreadDoc
) {
  if (thread.workspaceId && artifact.workspaceId) {
    return artifact.workspaceId === thread.workspaceId;
  }

  return artifact.userId === thread.userId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function slideshowPromptReviewRequestId(data: unknown): Id<"contentRequests"> | null {
  if (
    !isRecord(data) ||
    data.kind !== "slideshow_prompt_review" ||
    typeof data.contentRequestId !== "string"
  ) {
    return null;
  }
  return data.contentRequestId as Id<"contentRequests">;
}

async function requireArtifactsInThreadScope(
  ctx: QueryCtx | MutationCtx,
  thread: ThreadDoc,
  artifactIds: Id<"artifacts">[] | undefined
) {
  if (!artifactIds?.length) return;

  const artifacts = await Promise.all(
    artifactIds.map((artifactId) => ctx.db.get(artifactId))
  );
  const allArtifactsMatch = artifacts.every(
    (artifact) => artifact && artifactBelongsToThread(artifact, thread)
  );

  if (!allArtifactsMatch) {
    throw new Error("Artifact not found");
  }
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function defaultThreadTitle(title: string | undefined) {
  return normalizeOptionalText(title) ?? "New Chat";
}

export const list = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    status: v.optional(createThreadStatusValidator),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const userId = identity.subject;

    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, userId);
      const threads = args.status
        ? await ctx.db
            .query("createThreads")
            .withIndex("by_workspace_status", (q) =>
              q.eq("workspaceId", args.workspaceId).eq("status", args.status!)
            )
            .order("desc")
            .collect()
        : await ctx.db
            .query("createThreads")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
            .order("desc")
            .collect();

      return threads;
    }

    const threads = args.status
      ? await ctx.db
          .query("createThreads")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", userId).eq("status", args.status!)
          )
          .order("desc")
          .collect()
      : await ctx.db
          .query("createThreads")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .order("desc")
          .collect();

    return threads;
  },
});

export const get = query({
  args: { id: v.id("createThreads") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const thread = await ctx.db.get(args.id);
    if (!thread || !(await hasRecordAccess(ctx, thread, identity.subject))) {
      return null;
    }

    return thread;
  },
});

export const create = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    title: v.optional(v.string()),
    checkpointMode: v.optional(createCheckpointModeValidator),
    initialMessage: v.optional(v.string()),
    referenceMentions: v.optional(v.array(createReferenceMentionValidator)),
  },
  handler: async (ctx, args) => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    const workspace = args.workspaceId
      ? await resolveWritableWorkspace(ctx, userId, args.workspaceId)
      : defaultWorkspace;
    const now = Date.now();

    const threadId = await ctx.db.insert("createThreads", {
      userId,
      workspaceId: workspace._id,
      title: defaultThreadTitle(args.title),
      status: "idle",
      checkpointMode: args.checkpointMode ?? "debug",
      createdAt: now,
      updatedAt: now,
    });

    const initialContent = normalizeOptionalText(args.initialMessage);
    if (initialContent) {
      await ctx.db.insert("createMessages", {
        userId,
        workspaceId: workspace._id,
        createThreadId: threadId,
        role: "user",
        content: initialContent,
        kind: "chat",
        referenceMentions: args.referenceMentions,
        createdAt: now,
      });
    }

    return threadId;
  },
});

export const rename = mutation({
  args: {
    threadId: v.id("createThreads"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);

    await ctx.db.patch(thread._id, {
      title: defaultThreadTitle(args.title),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    threadId: v.id("createThreads"),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);
    const [messages, toolCalls, checkpoints, studioRenderRequests] = await Promise.all([
      ctx.db
        .query("createMessages")
        .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
        .collect(),
      ctx.db
        .query("createToolCalls")
        .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
        .collect(),
      ctx.db
        .query("createCheckpoints")
        .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
        .collect(),
      ctx.db
        .query("studioRenderRequests")
        .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
        .collect(),
    ]);

    await Promise.all([
      ...studioRenderRequests.map((request) =>
        ctx.db.patch(request._id, {
          createThreadId: undefined,
          createToolCallId: undefined,
          updatedAt: Date.now(),
        })
      ),
      ...checkpoints.map((checkpoint) => ctx.db.delete(checkpoint._id)),
      ...toolCalls.map((toolCall) => ctx.db.delete(toolCall._id)),
      ...messages.map((message) => ctx.db.delete(message._id)),
    ]);
    await ctx.db.delete(thread._id);
  },
});

export const appendMessage = mutation({
  args: {
    threadId: v.id("createThreads"),
    role: createMessageRoleValidator,
    content: v.string(),
    kind: v.optional(createMessageKindValidator),
    referenceMentions: v.optional(v.array(createReferenceMentionValidator)),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);
    const content = args.content.trim();
    if (!content) throw new Error("Message content is required");

    await requireArtifactsInThreadScope(ctx, thread, args.artifactIds);

    const now = Date.now();
    const messageId = await ctx.db.insert("createMessages", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      role: args.role,
      content,
      kind: args.kind,
      referenceMentions: args.referenceMentions,
      artifactIds: args.artifactIds,
      createdAt: now,
    });

    await ctx.db.patch(thread._id, { updatedAt: now });
    return messageId;
  },
});

export const listMessages = query({
  args: { threadId: v.id("createThreads") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const thread = await findThreadForReadAccess(ctx, args.threadId, identity.subject);
    if (!thread) return [];

    return await ctx.db
      .query("createMessages")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .collect();
  },
});

export const recordToolCall = mutation({
  args: {
    threadId: v.id("createThreads"),
    messageId: v.optional(v.id("createMessages")),
    toolName: v.string(),
    label: v.string(),
    status: v.optional(createToolCallStatusValidator),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);
    await requireArtifactsInThreadScope(ctx, thread, args.artifactIds);

    if (args.messageId) {
      const message = await ctx.db.get(args.messageId);
      if (!message || message.createThreadId !== thread._id) {
        throw new Error("Create message not found");
      }
    }

    const toolName = args.toolName.trim();
    const label = args.label.trim();
    if (!toolName) throw new Error("Tool name is required");
    if (!label) throw new Error("Tool label is required");

    const now = Date.now();
    const toolCallId = await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      messageId: args.messageId,
      toolName,
      status: args.status ?? "queued",
      label,
      input: args.input,
      output: args.output,
      artifactIds: args.artifactIds,
      costUsd: args.costUsd,
      errorMessage: normalizeOptionalText(args.errorMessage),
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(thread._id, { updatedAt: now });
    return toolCallId;
  },
});

export const patchToolCall = mutation({
  args: {
    id: v.id("createToolCalls"),
    status: v.optional(createToolCallStatusValidator),
    output: v.optional(v.any()),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const toolCall = await ctx.db.get(args.id);
    if (!toolCall) throw new Error("Create tool call not found");

    const thread = await requireThreadAccess(ctx, toolCall.createThreadId, userId);
    await requireArtifactsInThreadScope(ctx, thread, args.artifactIds);

    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.output !== undefined ? { output: args.output } : {}),
      ...(args.artifactIds !== undefined ? { artifactIds: args.artifactIds } : {}),
      ...(args.costUsd !== undefined ? { costUsd: args.costUsd } : {}),
      ...(args.errorMessage !== undefined
        ? { errorMessage: normalizeOptionalText(args.errorMessage) }
        : {}),
      ...(args.startedAt !== undefined ? { startedAt: args.startedAt } : {}),
      ...(args.completedAt !== undefined ? { completedAt: args.completedAt } : {}),
      updatedAt: now,
    });
    await ctx.db.patch(thread._id, { updatedAt: now });
  },
});

export const listToolCalls = query({
  args: { threadId: v.id("createThreads") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const thread = await findThreadForReadAccess(ctx, args.threadId, identity.subject);
    if (!thread) return [];

    return await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .collect();
  },
});

export const createCheckpoint = mutation({
  args: {
    threadId: v.id("createThreads"),
    label: v.string(),
    message: v.string(),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);
    await requireArtifactsInThreadScope(ctx, thread, args.artifactIds);

    const label = args.label.trim();
    const message = args.message.trim();
    if (!label) throw new Error("Checkpoint label is required");
    if (!message) throw new Error("Checkpoint message is required");

    const now = Date.now();
    const checkpointId = await ctx.db.insert("createCheckpoints", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      status: "open",
      label,
      message,
      artifactIds: args.artifactIds,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(thread._id, {
      status: "waiting_for_user",
      updatedAt: now,
    });

    return checkpointId;
  },
});

export const updateCheckpoint = mutation({
  args: {
    id: v.id("createCheckpoints"),
    status: createCheckpointStatusValidator,
    response: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const checkpoint = await ctx.db.get(args.id);
    if (!checkpoint) throw new Error("Create checkpoint not found");

    const thread = await requireThreadAccess(ctx, checkpoint.createThreadId, userId);
    const now = Date.now();

    await ctx.db.patch(checkpoint._id, {
      status: args.status,
      response: normalizeOptionalText(args.response),
      updatedAt: now,
    });

    if (args.status === "rejected" || args.status === "revised") {
      const queuedToolCalls = await ctx.db
        .query("createToolCalls")
        .withIndex("by_thread_status", (q) =>
          q.eq("createThreadId", thread._id).eq("status", "queued")
        )
        .collect();
      await Promise.all(
        queuedToolCalls.map((toolCall) =>
          ctx.db.patch(toolCall._id, {
            status: "canceled",
            completedAt: now,
            updatedAt: now,
          })
        )
      );

      const pausedSlideshowRequestId = slideshowPromptReviewRequestId(checkpoint.data);
      if (pausedSlideshowRequestId) {
        const request = await ctx.db.get(pausedSlideshowRequestId);
        if (
          request &&
          request.status === "planning" &&
          (thread.workspaceId ? request.workspaceId === thread.workspaceId : request.userId === thread.userId)
        ) {
          await ctx.db.patch(request._id, {
            status: "discarded",
            errorMessage: args.status === "revised"
              ? "Revised from slideshow prompt checkpoint."
              : "Stopped at slideshow prompt checkpoint.",
            completedAt: now,
            updatedAt: now,
          });
        }
      }
    }

    await ctx.db.patch(thread._id, {
      status: args.status === "rejected" ? "canceled" : "idle",
      updatedAt: now,
    });
  },
});

export const listCheckpoints = query({
  args: { threadId: v.id("createThreads") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const thread = await findThreadForReadAccess(ctx, args.threadId, identity.subject);
    if (!thread) return [];

    return await ctx.db
      .query("createCheckpoints")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .collect();
  },
});

export const updateCheckpointMode = mutation({
  args: {
    threadId: v.id("createThreads"),
    checkpointMode: createCheckpointModeValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);

    await ctx.db.patch(thread._id, {
      checkpointMode: args.checkpointMode,
      updatedAt: Date.now(),
    });
  },
});

export const linkFinalArtifacts = mutation({
  args: {
    threadId: v.id("createThreads"),
    artifactIds: v.array(v.id("artifacts")),
    status: v.optional(createThreadStatusValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);
    await requireArtifactsInThreadScope(ctx, thread, args.artifactIds);

    await ctx.db.patch(thread._id, {
      finalArtifactIds: args.artifactIds,
      status: args.status ?? "ready",
      updatedAt: Date.now(),
    });
  },
});

export const patchStatus = mutation({
  args: {
    threadId: v.id("createThreads"),
    status: createThreadStatusValidator,
    title: v.optional(v.string()),
    lastInferredOutputType: v.optional(createInferredOutputTypeValidator),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);

    await ctx.db.patch(thread._id, {
      status: args.status,
      ...(args.title !== undefined ? { title: normalizeOptionalText(args.title) } : {}),
      ...(args.lastInferredOutputType !== undefined
        ? { lastInferredOutputType: args.lastInferredOutputType }
        : {}),
      ...(args.costUsd !== undefined ? { costUsd: args.costUsd } : {}),
      ...(args.errorMessage !== undefined
        ? { errorMessage: normalizeOptionalText(args.errorMessage) }
        : {}),
      updatedAt: Date.now(),
    });
  },
});
