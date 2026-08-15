import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type {
  ModelInvocationMetadata,
  ModelProviderName,
} from "../../providers/model";
import type { CreateRunEventInput } from "./runEvents";
import { sanitizeCreateTraceDetails } from "./sanitization";

export type CreateActionTraceIdentity = {
  threadId: Id<"createThreads">;
  decisionRunId?: string;
  createMessageId?: Id<"createMessages">;
  createToolCallId?: Id<"createToolCalls">;
  parentOperationId?: string;
};

type ObservedModelResult = {
  metadata: ModelInvocationMetadata;
};

function errorMessageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function traceEventForTransport(event: CreateRunEventInput): CreateRunEventInput {
  return event.details === undefined
    ? event
    : {
        ...event,
        details: sanitizeCreateTraceDetails(event.details),
      };
}

async function recordTraceBestEffort(
  event: CreateRunEventInput,
  write: (event: CreateRunEventInput) => Promise<unknown>
) {
  try {
    await write(traceEventForTransport(event));
  } catch (error) {
    console.warn("Create trace recording failed", {
      operationId: event.operationId,
      eventType: event.eventType,
      errorMessage: errorMessageFromUnknown(error),
    });
  }
}

export async function recordCreateActionTrace(
  ctx: ActionCtx,
  identity: CreateActionTraceIdentity,
  event: CreateRunEventInput
) {
  await recordTraceBestEffort(event, async (transportEvent) => {
    await ctx.runMutation(internal.create.observability.runEvents.record, {
      threadId: identity.threadId,
      decisionRunId: identity.decisionRunId,
      createMessageId: identity.createMessageId,
      createToolCallId: identity.createToolCallId,
      parentOperationId: identity.parentOperationId,
      ...transportEvent,
    });
  });
}

export async function observeCreateModelCall<T extends ObservedModelResult>(
  ctx: ActionCtx,
  args: {
    identity: CreateActionTraceIdentity;
    operationId: string;
    provider: ModelProviderName;
    modelId?: string;
    attempt?: number;
    input: unknown;
    startedSummary: string;
    completedSummary: string;
    failedSummary: string;
    execute: () => Promise<T>;
    resultDetails: (result: T) => unknown;
  }
) {
  const startedAt = Date.now();
  await recordCreateActionTrace(ctx, args.identity, {
    operationId: args.operationId,
    scope: "model",
    eventType: "model.call.started",
    status: "running",
    provider: args.provider,
    modelId: args.modelId,
    attempt: args.attempt,
    startedAt,
    summary: args.startedSummary,
    details: { input: args.input },
  });

  try {
    const result = await args.execute();
    const completedAt = Date.now();
    await recordCreateActionTrace(ctx, args.identity, {
      operationId: args.operationId,
      scope: "model",
      eventType: "model.call.completed",
      status: "succeeded",
      provider: result.metadata.provider,
      modelId: result.metadata.model,
      attempt: args.attempt,
      inputTokens: result.metadata.usage?.inputTokens,
      outputTokens: result.metadata.usage?.outputTokens,
      totalTokens: result.metadata.usage?.totalTokens,
      actualCostUsd: result.metadata.costUsd,
      pricingSource: result.metadata.costUsd === undefined
        ? undefined
        : "provider_metadata",
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      summary: args.completedSummary,
      details: args.resultDetails(result),
    });
    return result;
  } catch (error) {
    const completedAt = Date.now();
    await recordCreateActionTrace(ctx, args.identity, {
      operationId: args.operationId,
      scope: "model",
      eventType: "model.call.failed",
      status: "failed",
      provider: args.provider,
      modelId: args.modelId,
      attempt: args.attempt,
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      summary: args.failedSummary,
      errorMessage: errorMessageFromUnknown(error),
      details: { error },
    });
    throw error;
  }
}

export async function observeContentRequestModelCall<T extends ObservedModelResult>(
  ctx: ActionCtx,
  args: {
    requestId: Id<"contentRequests">;
    operationId: string;
    provider: ModelProviderName;
    modelId?: string;
    attempt?: number;
    input: unknown;
    startedSummary: string;
    completedSummary: string;
    failedSummary: string;
    execute: () => Promise<T>;
    resultDetails: (result: T) => unknown;
  }
) {
  const startedAt = Date.now();
  const record = async (event: CreateRunEventInput) => {
    await recordTraceBestEffort(event, async (transportEvent) => {
      await ctx.runMutation(
        internal.create.observability.runEvents.recordForContentRequest,
        {
          requestId: args.requestId,
          parentOperationId: `content-request:${args.requestId}`,
          ...transportEvent,
        }
      );
    });
  };
  await record({
    operationId: args.operationId,
    scope: "model",
    eventType: "model.call.started",
    status: "running",
    provider: args.provider,
    modelId: args.modelId,
    attempt: args.attempt,
    startedAt,
    summary: args.startedSummary,
    details: { input: args.input },
  });

  try {
    const result = await args.execute();
    const completedAt = Date.now();
    await record({
      operationId: args.operationId,
      scope: "model",
      eventType: "model.call.completed",
      status: "succeeded",
      provider: result.metadata.provider,
      modelId: result.metadata.model,
      attempt: args.attempt,
      inputTokens: result.metadata.usage?.inputTokens,
      outputTokens: result.metadata.usage?.outputTokens,
      totalTokens: result.metadata.usage?.totalTokens,
      actualCostUsd: result.metadata.costUsd,
      pricingSource: result.metadata.costUsd === undefined
        ? undefined
        : "provider_metadata",
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      summary: args.completedSummary,
      details: args.resultDetails(result),
    });
    return result;
  } catch (error) {
    const completedAt = Date.now();
    await record({
      operationId: args.operationId,
      scope: "model",
      eventType: "model.call.failed",
      status: "failed",
      provider: args.provider,
      modelId: args.modelId,
      attempt: args.attempt,
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      summary: args.failedSummary,
      errorMessage: errorMessageFromUnknown(error),
      details: { error },
    });
    throw error;
  }
}
