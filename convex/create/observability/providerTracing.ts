import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type {
  ModelInvocationMetadata,
  ModelProviderName,
} from "../../providers/model";

type ProviderSubmission = {
  jobId?: string;
  metadata: ModelInvocationMetadata;
  status?: string;
};

async function recordProviderTrace(
  ctx: ActionCtx,
  args: {
    contentRequestId?: Id<"contentRequests">;
    operationId: string;
    eventType:
      | "provider.call.started"
      | "provider.submitted"
      | "provider.poll"
      | "provider.completed"
      | "provider.failed"
      | "artifact.created";
    scope?: "provider" | "artifact";
    status: "running" | "succeeded" | "failed";
    provider?: ModelProviderName;
    modelId?: string;
    providerRequestId?: string;
    attempt?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    actualCostUsd?: number;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
    summary: string;
    details?: unknown;
    errorMessage?: string;
    artifactId?: Id<"artifacts">;
    parentOperationId?: string;
  }
) {
  if (!args.contentRequestId) return;
  await ctx.runMutation(
    internal.create.observability.runEvents.recordForContentRequest,
    {
      requestId: args.contentRequestId,
      operationId: args.operationId,
      parentOperationId: args.parentOperationId ??
        `content-request:${args.contentRequestId}`,
      scope: args.scope ?? "provider",
      eventType: args.eventType,
      status: args.status,
      provider: args.provider,
      modelId: args.modelId,
      providerRequestId: args.providerRequestId,
      attempt: args.attempt,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      actualCostUsd: args.actualCostUsd,
      pricingSource: args.actualCostUsd === undefined ? undefined : "provider_metadata",
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      durationMs: args.durationMs,
      summary: args.summary,
      details: args.details,
      errorMessage: args.errorMessage,
      artifactId: args.artifactId,
    }
  );
}

export async function submitObservedProviderCall<T extends ProviderSubmission>(
  ctx: ActionCtx,
  args: {
    contentRequestId?: Id<"contentRequests">;
    operationId?: string;
    mode: "image" | "video" | "audio" | "lipsync";
    provider: ModelProviderName;
    requestedModel?: string;
    input: unknown;
    execute: () => Promise<T>;
  }
) {
  const operationId = args.operationId ?? (args.contentRequestId
    ? `provider:${args.contentRequestId}:${args.mode}`
    : `provider:${args.mode}:${crypto.randomUUID()}`);
  const startedAt = Date.now();
  await recordProviderTrace(ctx, {
    contentRequestId: args.contentRequestId,
    operationId,
    eventType: "provider.call.started",
    status: "running",
    provider: args.provider,
    modelId: args.requestedModel,
    startedAt,
    summary: `Started the ${args.mode} provider call.`,
    details: { input: args.input },
  });

  try {
    const result = await args.execute();
    const completedAt = Date.now();
    await recordProviderTrace(ctx, {
      contentRequestId: args.contentRequestId,
      operationId,
      eventType: "provider.submitted",
      status: "running",
      provider: result.metadata.provider,
      modelId: result.metadata.model,
      providerRequestId: result.jobId,
      inputTokens: result.metadata.usage?.inputTokens,
      outputTokens: result.metadata.usage?.outputTokens,
      totalTokens: result.metadata.usage?.totalTokens,
      actualCostUsd: result.metadata.costUsd,
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      summary: `The ${args.mode} provider accepted the request.`,
      details: {
        providerStatus: result.status,
        metadata: result.metadata,
      },
    });
    return { result, operationId, startedAt };
  } catch (error) {
    const completedAt = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error);
    await recordProviderTrace(ctx, {
      contentRequestId: args.contentRequestId,
      operationId,
      eventType: "provider.failed",
      status: "failed",
      provider: args.provider,
      modelId: args.requestedModel,
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      summary: `The ${args.mode} provider call failed before submission.`,
      errorMessage,
      details: { error },
    });
    throw error;
  }
}

export function providerPollObserver(
  ctx: ActionCtx,
  args: {
    contentRequestId?: Id<"contentRequests">;
    operationId: string;
    provider: ModelProviderName;
    modelId: string;
    providerRequestId?: string;
  }
) {
  return async (
    status: string,
    observation: { attempt: number; errorMessage?: string }
  ) => {
    await recordProviderTrace(ctx, {
      contentRequestId: args.contentRequestId,
      operationId: args.operationId,
      eventType: status === "failed" || status === "canceled"
        ? "provider.failed"
        : "provider.poll",
      status: status === "failed" || status === "canceled" ? "failed" : "running",
      provider: args.provider,
      modelId: args.modelId,
      providerRequestId: args.providerRequestId,
      attempt: observation.attempt,
      summary: `Provider poll ${observation.attempt}: ${status}.`,
      details: observation,
      errorMessage: observation.errorMessage,
    });
  };
}

export async function recordProviderCompletion(
  ctx: ActionCtx,
  args: {
    contentRequestId?: Id<"contentRequests">;
    operationId: string;
    startedAt: number;
    provider: ModelProviderName;
    modelId: string;
    providerRequestId?: string;
    actualCostUsd?: number;
    artifactIds: Id<"artifacts">[];
  }
) {
  const completedAt = Date.now();
  await recordProviderTrace(ctx, {
    contentRequestId: args.contentRequestId,
    operationId: args.operationId,
    eventType: "provider.completed",
    status: "succeeded",
    provider: args.provider,
    modelId: args.modelId,
    providerRequestId: args.providerRequestId,
    actualCostUsd: args.actualCostUsd,
    startedAt: args.startedAt,
    completedAt,
    durationMs: completedAt - args.startedAt,
    summary: "The provider generation completed and its artifacts were stored.",
    details: { artifactIds: args.artifactIds },
  });
  for (const artifactId of args.artifactIds) {
    await recordProviderTrace(ctx, {
      contentRequestId: args.contentRequestId,
      operationId: `artifact:${artifactId}`,
      parentOperationId: args.operationId,
      eventType: "artifact.created",
      scope: "artifact",
      status: "succeeded",
      provider: args.provider,
      modelId: args.modelId,
      providerRequestId: args.providerRequestId,
      artifactId,
      completedAt,
      summary: "Stored a generated artifact.",
    });
  }
}
