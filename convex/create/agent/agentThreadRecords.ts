import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { requireWorkspaceMember } from "../../workspaces/workspaces";
import {
  threadTitleFromMessage,
  type CreateReferenceMention,
} from "../planning";

type WorkspaceOwnedRecord = {
  userId: string;
  workspaceId?: Id<"workspaces">;
};

async function hasRecordAccess(
  ctx: MutationCtx | QueryCtx,
  record: WorkspaceOwnedRecord,
  userId: string
) {
  if (record.workspaceId) {
    await requireWorkspaceMember(ctx, record.workspaceId, userId);
    return true;
  }

  return record.userId === userId;
}

export async function requireThreadAccess(
  ctx: MutationCtx | QueryCtx,
  threadId: Id<"createThreads">,
  userId: string
) {
  const thread = await ctx.db.get(threadId);
  if (!thread || !(await hasRecordAccess(ctx, thread, userId))) {
    throw new Error("Create thread not found");
  }

  return thread;
}

export async function findThreadForReadAccess(
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

export function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function referenceMentionKey(mention: CreateReferenceMention) {
  return `${mention.entityType}:${mention.entityId}:${mention.token}`;
}

export function uniqueCreateReferenceMentions(mentions: CreateReferenceMention[]) {
  const seen = new Set<string>();

  return mentions.filter((mention) => {
    const key = referenceMentionKey(mention);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function createThreadForTurn(
  ctx: MutationCtx,
  args: {
    checkpointMode: "debug" | "auto";
    initialMessage: string;
    referenceMentions?: CreateReferenceMention[];
    title?: string;
    userId: string;
    workspaceId?: Id<"workspaces">;
  }
) {
  const now = Date.now();
  const threadId = await ctx.db.insert("createThreads", {
    userId: args.userId,
    workspaceId: args.workspaceId,
    title: normalizeOptionalText(args.title) ?? threadTitleFromMessage(args.initialMessage),
    status: "idle",
    checkpointMode: args.checkpointMode,
    createdAt: now,
    updatedAt: now,
  });

  return await requireThreadAccess(ctx, threadId, args.userId);
}

export async function appendMessage(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  args: {
    artifactIds?: Id<"artifacts">[];
    content: string;
    kind?: "chat" | "clarification" | "plan" | "status" | "tool_result" | "final_review";
    referenceMentions?: CreateReferenceMention[];
    role: "user" | "agent" | "system";
  }
) {
  const now = Date.now();
  return await ctx.db.insert("createMessages", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    createThreadId: thread._id,
    role: args.role,
    content: args.content,
    kind: args.kind,
    referenceMentions: args.referenceMentions,
    artifactIds: args.artifactIds,
    createdAt: now,
  });
}

export async function supersedeOpenCheckpointsForNewTurn(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const checkpoints = await ctx.db
    .query("createCheckpoints")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const openCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "open");
  if (!openCheckpoints.length) return;

  const now = Date.now();
  await Promise.all(
    openCheckpoints.map((checkpoint) =>
      ctx.db.patch(checkpoint._id, {
        status: "revised",
        response: "Superseded by a new user message.",
        updatedAt: now,
      })
    )
  );

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
}
