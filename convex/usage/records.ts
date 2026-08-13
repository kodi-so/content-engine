import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import { requireBetaAccess } from "../auth/users";
import { requireThreadAccess } from "../create/agent/agentThreadRecords";
import type { ModelProviderName } from "../providers/model";
import { modelProviderValidator } from "../validators";
import type { GenerationCostEstimate } from "../../src/lib/generation/costEstimation";
import { buildThreadUsageSummary } from "./threadSummary";

export type UsageCategory =
  | "agent"
  | "image"
  | "video"
  | "audio"
  | "lipsync"
  | "render"
  | "other";

type UsageEventInput = {
  userId: string;
  workspaceId?: Id<"workspaces">;
  createThreadId?: Id<"createThreads">;
  createToolCallId?: Id<"createToolCalls">;
  contentRequestId?: Id<"contentRequests">;
  provider: ModelProviderName;
  modelId: string;
  operationKey: string;
  providerRequestId?: string;
  category: UsageCategory;
  eventKind: "estimate" | "provider_submission" | "charge" | "failure";
  source: "pricing_snapshot" | "static_pricing" | "provider_metadata" | "provider_billing_event";
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  currency?: string;
  quantity?: number;
  unit?: string;
  unitPriceUsd?: number;
  parameters?: unknown;
  priceSnapshot?: unknown;
  errorMessage?: string;
  completedAt?: number;
};

export async function insertUsageEvent(ctx: MutationCtx, event: UsageEventInput) {
  const now = Date.now();
  return await ctx.db.insert("usageEvents", {
    ...event,
    currency: event.currency ?? "USD",
    createdAt: now,
    updatedAt: now,
  });
}

export async function recordToolEstimate(
  ctx: MutationCtx,
  args: {
    thread: Doc<"createThreads">;
    toolCallId: Id<"createToolCalls">;
    category: UsageCategory;
    estimate: GenerationCostEstimate;
  }
) {
  await ctx.db.patch(args.toolCallId, {
    estimatedCostUsd: args.estimate.costUsd,
    costEstimate: args.estimate,
    updatedAt: Date.now(),
  });
  await insertUsageEvent(ctx, {
    userId: args.thread.userId,
    workspaceId: args.thread.workspaceId,
    createThreadId: args.thread._id,
    createToolCallId: args.toolCallId,
    provider: "fal",
    modelId: args.estimate.modelId,
    operationKey: `tool:${args.toolCallId}`,
    category: args.category,
    eventKind: "estimate",
    source: args.estimate.source,
    estimatedCostUsd: args.estimate.costUsd,
    quantity: args.estimate.quantity,
    unit: args.estimate.unit,
    unitPriceUsd: args.estimate.unitPriceUsd,
    parameters: args.estimate.parameters,
    priceSnapshot: {
      accuracy: args.estimate.accuracy,
      modelLabel: args.estimate.modelLabel,
      pricingVersion: args.estimate.pricingVersion,
    },
  });
}

function usageCategoryForContentRequest(request: Doc<"contentRequests">): UsageCategory {
  if (request.contentFormat === "image") return "image";
  if (request.contentFormat === "video") return "video";
  if (request.contentFormat === "audio") return "audio";
  if (request.contentFormat === "slideshow") {
    return request.status === "planning" ? "agent" : "image";
  }
  return "other";
}

export const recordAgentCharge = internalMutation({
  args: {
    threadId: v.id("createThreads"),
    provider: modelProviderValidator,
    modelId: v.string(),
    operationKey: v.string(),
    actualCostUsd: v.optional(v.number()),
    parameters: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(typeof args.actualCostUsd === "number" && args.actualCostUsd >= 0)) return null;
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    await insertUsageEvent(ctx, {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      provider: args.provider,
      modelId: args.modelId,
      operationKey: args.operationKey,
      category: "agent",
      eventKind: "charge",
      source: "provider_metadata",
      actualCostUsd: args.actualCostUsd,
      parameters: args.parameters,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const recordToolCharge = internalMutation({
  args: {
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
    provider: modelProviderValidator,
    modelId: v.string(),
    operationKey: v.string(),
    actualCostUsd: v.optional(v.number()),
    parameters: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(typeof args.actualCostUsd === "number" && args.actualCostUsd >= 0)) return null;
    const [thread, toolCall] = await Promise.all([
      ctx.db.get(args.threadId),
      ctx.db.get(args.toolCallId),
    ]);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return null;
    await insertUsageEvent(ctx, {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      createToolCallId: toolCall._id,
      provider: args.provider,
      modelId: args.modelId,
      operationKey: args.operationKey,
      category: "other",
      eventKind: "charge",
      source: "provider_metadata",
      actualCostUsd: args.actualCostUsd,
      parameters: args.parameters,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const recordProviderExecution = internalMutation({
  args: {
    contentRequestId: v.id("contentRequests"),
    provider: modelProviderValidator,
    modelId: v.string(),
    providerRequestId: v.optional(v.string()),
    actualCostUsd: v.optional(v.number()),
    parameters: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.contentRequestId);
    if (!request) return null;
    const operationKey = args.providerRequestId
      ? `${args.provider}:${args.providerRequestId}`
      : `${args.provider}:${args.contentRequestId}:${crypto.randomUUID()}`;
    if (args.providerRequestId) {
      await insertUsageEvent(ctx, {
        userId: request.userId,
        workspaceId: request.workspaceId,
        createThreadId: request.createThreadId,
        createToolCallId: request.createToolCallId,
        contentRequestId: request._id,
        provider: args.provider,
        modelId: args.modelId,
        operationKey,
        providerRequestId: args.providerRequestId,
        category: usageCategoryForContentRequest(request),
        eventKind: "provider_submission",
        source: "provider_metadata",
        parameters: args.parameters,
      });
    }
    if (typeof args.actualCostUsd === "number" && args.actualCostUsd >= 0) {
      await insertUsageEvent(ctx, {
        userId: request.userId,
        workspaceId: request.workspaceId,
        createThreadId: request.createThreadId,
        createToolCallId: request.createToolCallId,
        contentRequestId: request._id,
        provider: args.provider,
        modelId: args.modelId,
        operationKey,
        providerRequestId: args.providerRequestId,
        category: usageCategoryForContentRequest(request),
        eventKind: "charge",
        source: "provider_metadata",
        actualCostUsd: args.actualCostUsd,
        parameters: args.parameters,
        completedAt: Date.now(),
      });
    }
    return null;
  },
});

export async function recordContentRequestCostDelta(
  ctx: MutationCtx,
  request: Doc<"contentRequests">,
  actualCostUsd: number
) {
  if (!(Number.isFinite(actualCostUsd) && actualCostUsd >= 0)) return;
  const events = await ctx.db
    .query("usageEvents")
    .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
    .take(200);
  const recorded = events.reduce((sum, event) =>
    event.eventKind === "charge" ? sum + (event.actualCostUsd ?? 0) : sum,
    0
  );
  const delta = Math.max(0, actualCostUsd - recorded);
  if (delta <= 0.0000005) return;
  await insertUsageEvent(ctx, {
    userId: request.userId,
    workspaceId: request.workspaceId,
    createThreadId: request.createThreadId,
    createToolCallId: request.createToolCallId,
    contentRequestId: request._id,
    provider: request.generation?.provider ?? "manual",
    modelId: request.generation?.model ?? `${request.contentFormat}:workflow`,
    operationKey: `content-request:${request._id}:cost-delta:${crypto.randomUUID()}`,
    category: usageCategoryForContentRequest(request),
    eventKind: "charge",
    source: "provider_metadata",
    actualCostUsd: delta,
    completedAt: request.completedAt ?? Date.now(),
  });
}

const summaryItemValidator = v.object({
  operationKey: v.string(),
  createToolCallId: v.optional(v.id("createToolCalls")),
  label: v.string(),
  modelId: v.string(),
  category: v.string(),
  estimatedCostUsd: v.optional(v.number()),
  actualCostUsd: v.optional(v.number()),
  outstandingEstimatedCostUsd: v.number(),
  parameters: v.optional(v.any()),
  status: v.string(),
});

export const threadSummary = query({
  args: { threadId: v.id("createThreads") },
  returns: v.union(v.null(), v.object({
    actualCostUsd: v.number(),
    outstandingEstimatedCostUsd: v.number(),
    totalCostUsd: v.number(),
    isFinal: v.boolean(),
    items: v.array(summaryItemValidator),
  })),
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, identity.subject);
    const [events, toolCalls] = await Promise.all([
      ctx.db.query("usageEvents")
        .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
        .order("desc")
        .take(500),
      ctx.db.query("createToolCalls")
        .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
        .take(200),
    ]);
    return buildThreadUsageSummary({ events, thread, toolCalls });
  },
});
