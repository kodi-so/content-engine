import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import {
  internalQuery,
  query,
  type QueryCtx,
} from "../../_generated/server";
import { requireBetaAccess } from "../../auth/users";
import { buildThreadUsageSummary } from "../../usage/threadSummary";
import { requireThreadAccess } from "../agent/agentThreadRecords";

const TRACE_EVENT_LIMIT = 1_000;
const TRACE_RECORD_LIMIT = 300;
const TRACE_USAGE_LIMIT = 500;
const TRACE_ARTIFACT_REQUEST_LIMIT = 50;
const TRACE_ARTIFACTS_PER_REQUEST_LIMIT = 50;

async function createRunTraceBundle(
  ctx: QueryCtx,
  threadId: Id<"createThreads">
) {
  const thread = await ctx.db.get(threadId);
  if (!thread) return null;

  const [events, messages, toolCalls, usageEventsNewest, contentRequests, checkpoints] =
    await Promise.all([
      ctx.db
        .query("createRunEvents")
        .withIndex("by_thread_and_occurred_at", (q) =>
          q.eq("createThreadId", threadId)
        )
        .order("asc")
        .take(TRACE_EVENT_LIMIT),
      ctx.db
        .query("createMessages")
        .withIndex("by_thread", (q) => q.eq("createThreadId", threadId))
        .order("asc")
        .take(TRACE_RECORD_LIMIT),
      ctx.db
        .query("createToolCalls")
        .withIndex("by_thread", (q) => q.eq("createThreadId", threadId))
        .order("asc")
        .take(TRACE_RECORD_LIMIT),
      ctx.db
        .query("usageEvents")
        .withIndex("by_thread", (q) => q.eq("createThreadId", threadId))
        .order("desc")
        .take(TRACE_USAGE_LIMIT),
      ctx.db
        .query("contentRequests")
        .withIndex("by_thread", (q) => q.eq("createThreadId", threadId))
        .order("asc")
        .take(TRACE_RECORD_LIMIT),
      ctx.db
        .query("createCheckpoints")
        .withIndex("by_thread", (q) => q.eq("createThreadId", threadId))
        .order("asc")
        .take(TRACE_RECORD_LIMIT),
    ]);

  const usageEvents = [...usageEventsNewest].reverse();
  const contentRequestArtifacts = (await Promise.all(
    contentRequests
      .slice(0, TRACE_ARTIFACT_REQUEST_LIMIT)
      .map((request) =>
        ctx.db
          .query("artifacts")
          .withIndex("by_content_request", (q) =>
            q.eq("contentRequestId", request._id)
          )
          .order("asc")
          .take(TRACE_ARTIFACTS_PER_REQUEST_LIMIT)
      )
  )).flat();
  const artifactIds = new Set<Id<"artifacts">>();
  for (const toolCall of toolCalls) {
    for (const artifactId of toolCall.artifactIds ?? []) artifactIds.add(artifactId);
  }
  for (const message of messages) {
    for (const artifactId of message.artifactIds ?? []) artifactIds.add(artifactId);
  }
  for (const artifactId of thread.finalArtifactIds ?? []) artifactIds.add(artifactId);
  const artifactsById = new Map(
    contentRequestArtifacts.map((artifact) => [String(artifact._id), artifact])
  );
  const additionalArtifacts = await Promise.all(
    [...artifactIds]
      .filter((artifactId) => !artifactsById.has(String(artifactId)))
      .slice(0, TRACE_RECORD_LIMIT)
      .map((artifactId) => ctx.db.get(artifactId))
  );
  for (const artifact of additionalArtifacts) {
    if (artifact) artifactsById.set(String(artifact._id), artifact);
  }
  const artifacts = [...artifactsById.values()];

  return {
    generatedAt: Date.now(),
    limits: {
      events: TRACE_EVENT_LIMIT,
      recordsPerCollection: TRACE_RECORD_LIMIT,
      usageEvents: TRACE_USAGE_LIMIT,
      contentRequestsWithArtifacts: TRACE_ARTIFACT_REQUEST_LIMIT,
      artifactsPerContentRequest: TRACE_ARTIFACTS_PER_REQUEST_LIMIT,
    },
    thread,
    usageSummary: buildThreadUsageSummary({ events: usageEventsNewest, thread, toolCalls }),
    events,
    messages,
    toolCalls,
    contentRequests,
    usageEvents,
    checkpoints,
    artifacts,
  };
}

export const get = query({
  args: { threadId: v.id("createThreads") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    await requireThreadAccess(ctx, args.threadId, identity.subject);
    return await createRunTraceBundle(ctx, args.threadId);
  },
});

/** Intended for `npx convex run` by trusted operators and coding agents. */
export const getForDebug = internalQuery({
  args: { threadId: v.id("createThreads") },
  returns: v.any(),
  handler: async (ctx, args) => await createRunTraceBundle(ctx, args.threadId),
});
