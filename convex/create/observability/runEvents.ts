import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
} from "../../_generated/server";
import { modelProviderValidator } from "../../validators";
import {
  createRunEventScopeValidator,
  createRunEventStatusValidator,
  createRunEventTypeValidator,
} from "./validators";
import {
  sanitizeCreateTraceDetails,
  sanitizeCreateTraceSummary,
} from "./sanitization";

export type CreateRunEventInput = {
  decisionRunId?: string;
  createMessageId?: Id<"createMessages">;
  createToolCallId?: Id<"createToolCalls">;
  contentRequestId?: Id<"contentRequests">;
  artifactId?: Id<"artifacts">;
  operationId: string;
  parentOperationId?: string;
  scope: Doc<"createRunEvents">["scope"];
  eventType: Doc<"createRunEvents">["eventType"];
  status: Doc<"createRunEvents">["status"];
  provider?: Doc<"createRunEvents">["provider"];
  modelId?: string;
  providerRequestId?: string;
  attempt?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  pricingSource?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  summary?: string;
  details?: unknown;
  errorMessage?: string;
  occurredAt?: number;
};

export async function insertCreateRunEvent(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  event: CreateRunEventInput
) {
  return await ctx.db.insert("createRunEvents", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    createThreadId: thread._id,
    ...event,
    decisionRunId: event.decisionRunId ?? thread.decisionRunId,
    summary: event.summary ? sanitizeCreateTraceSummary(event.summary) : undefined,
    details: event.details === undefined
      ? undefined
      : sanitizeCreateTraceDetails(event.details),
    errorMessage: event.errorMessage
      ? sanitizeCreateTraceSummary(event.errorMessage)
      : undefined,
    occurredAt: event.occurredAt ?? Date.now(),
  });
}

const eventArgs = {
  decisionRunId: v.optional(v.string()),
  createMessageId: v.optional(v.id("createMessages")),
  createToolCallId: v.optional(v.id("createToolCalls")),
  contentRequestId: v.optional(v.id("contentRequests")),
  artifactId: v.optional(v.id("artifacts")),
  operationId: v.string(),
  parentOperationId: v.optional(v.string()),
  scope: createRunEventScopeValidator,
  eventType: createRunEventTypeValidator,
  status: createRunEventStatusValidator,
  provider: v.optional(modelProviderValidator),
  modelId: v.optional(v.string()),
  providerRequestId: v.optional(v.string()),
  attempt: v.optional(v.number()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
  estimatedCostUsd: v.optional(v.number()),
  actualCostUsd: v.optional(v.number()),
  pricingSource: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  summary: v.optional(v.string()),
  details: v.optional(v.any()),
  errorMessage: v.optional(v.string()),
  occurredAt: v.optional(v.number()),
};

export const record = internalMutation({
  args: {
    threadId: v.id("createThreads"),
    ...eventArgs,
  },
  returns: v.union(v.id("createRunEvents"), v.null()),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    const toolCall = args.createToolCallId
      ? await ctx.db.get(args.createToolCallId)
      : null;
    const { threadId: _threadId, ...event } = args;
    return await insertCreateRunEvent(ctx, thread, {
      ...event,
      decisionRunId: event.decisionRunId ?? toolCall?.decisionRunId,
    });
  },
});

export const recordForContentRequest = internalMutation({
  args: {
    requestId: v.id("contentRequests"),
    ...eventArgs,
  },
  returns: v.union(v.id("createRunEvents"), v.null()),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request?.createThreadId) return null;
    const thread = await ctx.db.get(request.createThreadId);
    if (!thread) return null;
    const { requestId: _requestId, ...event } = args;
    return await insertCreateRunEvent(ctx, thread, {
      ...event,
      decisionRunId: event.decisionRunId ?? request.decisionRunId ?? thread.decisionRunId,
      contentRequestId: event.contentRequestId ?? request._id,
      createToolCallId: event.createToolCallId ?? request.createToolCallId,
    });
  },
});
