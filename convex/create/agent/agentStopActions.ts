import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  createThreadScopeMatchesRecord,
  formatStoppedDuration,
} from "./agentAsyncResults";
import { appendMessage } from "./agentThreadRecords";
import {
  contentRequestIdFromToolOutput,
  studioRenderRequestIdFromToolOutput,
} from "../execution/toolExecutionShared";

export async function stopCreateThread(ctx: MutationCtx, thread: Doc<"createThreads">) {
  const now = Date.now();
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const activeToolCalls = toolCalls.filter((toolCall) =>
    toolCall.status === "queued" ||
    toolCall.status === "running" ||
    toolCall.status === "blocked"
  );
  const activeContentRequestIds = [
    ...new Set(
      toolCalls.flatMap((toolCall) => {
        const requestId = contentRequestIdFromToolOutput(toolCall.output);
        return requestId ? [requestId] : [];
      })
    ),
  ];
  const activeStudioRenderRequestIds = [
    ...new Set(
      toolCalls.flatMap((toolCall) => {
        const requestId = studioRenderRequestIdFromToolOutput(toolCall.output);
        return requestId ? [requestId] : [];
      })
    ),
  ];
  const activeContentRequests: Doc<"contentRequests">[] = [];
  for (const requestId of activeContentRequestIds) {
    const request = await ctx.db.get(requestId);
    if (
      request &&
      createThreadScopeMatchesRecord(thread, request) &&
      (
        request.status === "queued" ||
        request.status === "planning" ||
        request.status === "generating"
      )
    ) {
      activeContentRequests.push(request);
    }
  }
  const activeContentRequestIdSet = new Set(activeContentRequests.map((request) => String(request._id)));
  const stoppedToolCalls = [
    ...new Map(
      [
        ...activeToolCalls,
        ...toolCalls.filter((toolCall) => {
          if (toolCall.status !== "succeeded") return false;
          const requestId = contentRequestIdFromToolOutput(toolCall.output);
          return requestId ? activeContentRequestIdSet.has(String(requestId)) : false;
        }),
      ].map((toolCall) => [String(toolCall._id), toolCall])
    ).values(),
  ];
  const activeStudioRenderRequests: Doc<"studioRenderRequests">[] = [];
  for (const requestId of activeStudioRenderRequestIds) {
    const request = await ctx.db.get(requestId);
    if (
      request &&
      createThreadScopeMatchesRecord(thread, request) &&
      (
        request.status === "queued" ||
        request.status === "rendering" ||
        request.status === "blocked"
      )
    ) {
      activeStudioRenderRequests.push(request);
    }
  }

  if (
    !activeToolCalls.length &&
    !activeContentRequests.length &&
    !activeStudioRenderRequests.length &&
    (thread.status === "idle" || thread.status === "ready" || thread.status === "canceled")
  ) {
    return {
      canceledContentRequestCount: 0,
      canceledStudioRenderRequestCount: 0,
      canceledToolCallCount: 0,
      elapsedMs: 0,
    };
  }

  const startTimestamps = [
    ...stoppedToolCalls.flatMap((toolCall) => [
      toolCall.startedAt,
      toolCall.createdAt,
    ]),
    ...activeContentRequests.flatMap((request) => [
      request.startedAt,
      request.createdAt,
    ]),
    ...activeStudioRenderRequests.map((request) => request.createdAt),
    thread.updatedAt,
    thread.createdAt,
  ].filter((value): value is number => typeof value === "number");
  const elapsed = startTimestamps.length ? now - Math.min(...startTimestamps) : 0;

  await Promise.all([
    ...stoppedToolCalls.map((toolCall) =>
      ctx.db.patch(toolCall._id, {
        status: "canceled" as const,
        completedAt: now,
        updatedAt: now,
      })
    ),
    ...activeContentRequests.map((request) =>
      ctx.db.patch(request._id, {
        status: "discarded" as const,
        errorMessage: "Stopped by user.",
        completedAt: now,
        updatedAt: now,
      })
    ),
    ...activeStudioRenderRequests.map((request) =>
      ctx.db.patch(request._id, {
        status: "canceled" as const,
        errorMessage: "Stopped by user.",
        completedAt: now,
        updatedAt: now,
      })
    ),
  ]);

  await appendMessage(ctx, thread, {
    role: "agent",
    content: `You stopped after ${formatStoppedDuration(elapsed)}.`,
    kind: "status",
  });
  await ctx.db.patch(thread._id, {
    decisionRunId: crypto.randomUUID(),
    status: "idle",
    updatedAt: now,
  });

  return {
    canceledContentRequestCount: activeContentRequests.length,
    canceledStudioRenderRequestCount: activeStudioRenderRequests.length,
    canceledToolCallCount: stoppedToolCalls.length,
    elapsedMs: Math.max(0, elapsed),
  };
}
