import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  buildStructuredGenerationPrompt,
  defaultStructuredArtifactType,
  defaultStructuredSchema,
} from "../content/formatContracts";
import { storeGeneratedAsset } from "../content/assetStorage";
import { getModelProvider } from "../providers";
import { isProviderError } from "../providers/errors";
import type { ModelProviderName } from "../providers/model";
import {
  artifactIdsForRefs,
  buildDefaultPrompt,
  createArtifact,
  getArtifactType,
  getArtifactsForRefs,
  getConfig,
  getModelProviderName,
  getStringConfig,
  recordEvent,
  reviewStatusForWorkflow,
  type StepOutputs,
  type WorkflowExecutionContext,
  type WorkflowStep,
} from "./execution";
import { internal } from "../_generated/api";

type SerializedProviderError = {
  name?: string;
  message: string;
  provider?: string;
  operation?: string;
  code?: string;
  statusCode?: number;
  retryable?: boolean;
  details?: unknown;
};

function getJobInfo(artifact: Doc<"artifacts">):
  | {
      jobId: string;
      provider: ModelProviderName;
      model: string;
      prompt?: string;
      metadata?: Record<string, unknown>;
    }
  | null {
  if (!artifact.data || typeof artifact.data !== "object") return null;

  const data = artifact.data as Record<string, unknown>;
  if (
    typeof data.jobId !== "string" ||
    !artifact.provider ||
    !artifact.model
  ) {
    return null;
  }

  return {
    jobId: data.jobId,
    provider: artifact.provider,
    model: artifact.model,
    prompt: artifact.prompt,
    metadata: data,
  };
}

function queueMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};

  const data = raw as Record<string, unknown>;
  return {
    statusUrl: typeof data.status_url === "string" ? data.status_url : undefined,
    responseUrl: typeof data.response_url === "string" ? data.response_url : undefined,
    cancelUrl: typeof data.cancel_url === "string" ? data.cancel_url : undefined,
    queuePosition:
      typeof data.queue_position === "number" ? data.queue_position : undefined,
  };
}

function providerErrorData(error: unknown): SerializedProviderError {
  if (isProviderError(error)) {
    return {
      name: error.name,
      message: error.message,
      provider: error.provider,
      operation: error.operation,
      code: error.code,
      statusCode: error.statusCode,
      retryable: error.retryable,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: "Unknown provider error",
    details: error,
  };
}

export async function executeResolveModelJobStep(
  ctx: ActionCtx,
  context: WorkflowExecutionContext,
  step: WorkflowStep,
  outputs: StepOutputs
): Promise<Id<"artifacts">[]> {
  const jobArtifacts = await getArtifactsForRefs(ctx, outputs, step.inputRefs);
  const resolvedArtifactIds: Id<"artifacts">[] = [];

  for (const jobArtifact of jobArtifacts) {
    const job = getJobInfo(jobArtifact);
    if (!job) continue;

    const provider = getModelProvider(job.provider);
    let result: Awaited<ReturnType<typeof provider.getJobStatus>>;

    try {
      result = await provider.getJobStatus({
        jobId: job.jobId,
        model: job.model,
        metadata: job.metadata,
      });
    } catch (error) {
      const providerError = providerErrorData(error);
      const keepRetryable =
        Boolean(providerError.retryable) ||
        providerError.statusCode === 404;

      await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
        artifactId: jobArtifact._id,
        userId: context.run.userId,
        data: {
          ...(jobArtifact.data && typeof jobArtifact.data === "object"
            ? (jobArtifact.data as Record<string, unknown>)
            : {}),
          status: keepRetryable ? "queued" : "failed",
          providerError,
          lastStatusPollAt: Date.now(),
        },
      });
      await recordEvent(
        ctx,
        context,
        step,
        keepRetryable ? "model_call" : "error",
        keepRetryable
          ? "Model job status poll failed; job kept for retry."
          : "Model job status poll failed.",
        {
          artifactId: jobArtifact._id,
          jobId: job.jobId,
          ...providerError,
        }
      );

      resolvedArtifactIds.push(jobArtifact._id);
      continue;
    }

    await recordEvent(ctx, context, step, "model_call", "Polled model job.", result.metadata);

    if (result.status === "failed") {
      await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
        artifactId: jobArtifact._id,
        userId: context.run.userId,
        data: {
          ...(jobArtifact.data && typeof jobArtifact.data === "object"
            ? (jobArtifact.data as Record<string, unknown>)
            : {}),
          status: result.status,
          errorMessage: result.errorMessage,
        },
      });
      continue;
    }

    if (result.status !== "succeeded") {
      await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
        artifactId: jobArtifact._id,
        userId: context.run.userId,
        data: {
          ...(jobArtifact.data && typeof jobArtifact.data === "object"
            ? (jobArtifact.data as Record<string, unknown>)
            : {}),
          status: result.status,
        },
      });
      resolvedArtifactIds.push(jobArtifact._id);
      continue;
    }

    for (const [index, asset] of (result.assets ?? []).entries()) {
      const stored = await storeGeneratedAsset(ctx, asset);
      const artifactId = await createArtifact(ctx, context, step, {
        type: asset.mimeType.startsWith("video/") ? "video" : "image",
        title: `${jobArtifact.title ?? step.name} result ${index + 1}`,
        storageUrl: stored.storageUrl,
        data: {
          storageId: stored.storageId,
          mimeType: stored.mimeType,
          fileSize: stored.byteLength,
          jobId: job.jobId,
        },
        provider: result.metadata.provider,
        model: result.metadata.model,
        prompt: job.prompt,
        parentArtifactIds: [jobArtifact._id],
        reviewStatus: reviewStatusForWorkflow(context),
      });
      resolvedArtifactIds.push(artifactId);
    }
  }

  return resolvedArtifactIds;
}

export async function executeModelStep(
  ctx: ActionCtx,
  context: WorkflowExecutionContext,
  step: WorkflowStep,
  outputs: StepOutputs
): Promise<{ artifactIds: Id<"artifacts">[]; costUsd: number }> {
  const config = getConfig(step);
  const modelDefaults = context.version.modelDefaults;
  const prompt = getStringConfig(config, "prompt") ?? buildDefaultPrompt(context, step);
  const parentArtifactIds = artifactIdsForRefs(outputs, step.inputRefs);

  if (step.type === "generate_structured") {
    const providerName = getModelProviderName(
      config.provider,
      modelDefaults?.textProvider ?? "openrouter"
    );
    const provider = getModelProvider(providerName);
    const schema =
      config.schema && typeof config.schema === "object"
        ? config.schema
        : defaultStructuredSchema(context.workflow.contentFormat);
    const structuredPrompt =
      getStringConfig(config, "prompt") ??
      buildStructuredGenerationPrompt({
        format: context.workflow.contentFormat,
        brandName: context.brand.name,
        audience: context.brand.audience,
        voice: context.brand.voice,
        visualStyle: context.brand.visualStyle,
        offer: context.brand.offer,
        constraints: context.brand.constraints,
        workflowName: context.workflow.name,
        workflowDescription: context.workflow.description,
        stepName: step.name,
      });
    const response = await provider.generateStructured({
      prompt: structuredPrompt,
      systemPrompt:
        getStringConfig(config, "systemPrompt") ??
        "You produce production-ready structured content artifacts for an agentic content workflow.",
      model: getStringConfig(config, "model") ?? modelDefaults?.preferredTextModel,
      schema,
      schemaName:
        getStringConfig(config, "schemaName") ??
        `${context.workflow.contentFormat}_spec`,
      metadata:
        config.metadata && typeof config.metadata === "object"
          ? (config.metadata as Record<string, unknown>)
          : undefined,
    });
    const artifactType = getArtifactType(
      config.artifactType,
      defaultStructuredArtifactType(context.workflow.contentFormat)
    );

    await recordEvent(ctx, context, step, "model_call", "Generated structured content.", response.metadata);

    const artifactId = await createArtifact(ctx, context, step, {
      type: artifactType,
      title: step.name,
      data: response.object,
      provider: response.metadata.provider,
      model: response.metadata.model,
      prompt: structuredPrompt,
      parentArtifactIds,
      reviewStatus: reviewStatusForWorkflow(context),
    });

    return {
      artifactIds: [artifactId],
      costUsd: response.metadata.costUsd ?? 0,
    };
  }

  if (step.type === "generate_text" || step.type === "create_caption") {
    const providerName = getModelProviderName(
      config.provider,
      modelDefaults?.textProvider ?? "openrouter"
    );
    const provider = getModelProvider(providerName);
    const response = await provider.generateText({
      prompt,
      systemPrompt: getStringConfig(config, "systemPrompt"),
      model: getStringConfig(config, "model") ?? modelDefaults?.preferredTextModel,
      responseFormat:
        config.responseFormat === "json_object" ? { type: "json_object" } : undefined,
      metadata:
        config.metadata && typeof config.metadata === "object"
          ? (config.metadata as Record<string, unknown>)
          : undefined,
    });

    await recordEvent(ctx, context, step, "model_call", "Generated text.", response.metadata);

    const artifactId = await createArtifact(ctx, context, step, {
      type: step.type === "create_caption" ? "caption" : "text_draft",
      title: step.name,
      data: { text: response.text },
      provider: response.metadata.provider,
      model: response.metadata.model,
      prompt,
      parentArtifactIds,
      reviewStatus: reviewStatusForWorkflow(context),
    });

    return {
      artifactIds: [artifactId],
      costUsd: response.metadata.costUsd ?? 0,
    };
  }

  if (step.type === "generate_image") {
    const providerName = getModelProviderName(
      config.provider,
      modelDefaults?.mediaProvider ?? "fal"
    );
    const provider = getModelProvider(providerName);
    const artifactIds: Id<"artifacts">[] = [];
    let totalCostUsd = 0;
    const imagePrompts = await getArtifactsForRefs(ctx, outputs, step.inputRefs, "image_prompt");
    const prompts =
      imagePrompts.length > 0
        ? imagePrompts.map((artifact) => ({
            prompt:
              artifact.data &&
              typeof artifact.data === "object" &&
              typeof (artifact.data as Record<string, unknown>).prompt === "string"
                ? ((artifact.data as Record<string, unknown>).prompt as string)
                : artifact.prompt ?? prompt,
            title: artifact.title ?? step.name,
            parentArtifactIds: [artifact._id],
          }))
        : [{ prompt, title: step.name, parentArtifactIds }];

    for (const promptInput of prompts) {
      const response = await provider.generateImage({
        prompt: promptInput.prompt,
        model: getStringConfig(config, "model") ?? modelDefaults?.preferredImageModel,
        aspectRatio: getStringConfig(config, "aspectRatio"),
        count: typeof config.count === "number" ? config.count : undefined,
        metadata:
          config.metadata && typeof config.metadata === "object"
            ? (config.metadata as Record<string, unknown>)
            : undefined,
      });

      totalCostUsd += response.metadata.costUsd ?? 0;
      await recordEvent(ctx, context, step, "model_call", "Requested image generation.", response.metadata);

      for (const [index, image] of response.images.entries()) {
        const stored = await storeGeneratedAsset(ctx, image);
        artifactIds.push(
          await createArtifact(ctx, context, step, {
            type: "image",
            title: `${promptInput.title} image ${index + 1}`,
            storageUrl: stored.storageUrl,
            data: {
              storageId: stored.storageId,
              mimeType: stored.mimeType,
              fileSize: stored.byteLength,
            },
            provider: response.metadata.provider,
            model: response.metadata.model,
            prompt: promptInput.prompt,
            parentArtifactIds: promptInput.parentArtifactIds,
            reviewStatus: reviewStatusForWorkflow(context),
          })
        );
      }

      if (response.jobId) {
        artifactIds.push(
          await createArtifact(ctx, context, step, {
            type: "image",
            title: `${promptInput.title} image job`,
            data: {
              jobId: response.jobId,
              status: response.status,
              ...queueMetadata(response.raw),
            },
            provider: response.metadata.provider,
            model: response.metadata.model,
            prompt: promptInput.prompt,
            parentArtifactIds: promptInput.parentArtifactIds,
          })
        );
      }
    }

    return { artifactIds, costUsd: totalCostUsd };
  }

  if (step.type === "generate_video") {
    const providerName = getModelProviderName(
      config.provider,
      modelDefaults?.mediaProvider ?? "fal"
    );
    const provider = getModelProvider(providerName);
    const response = await provider.generateVideo({
      prompt,
      model: getStringConfig(config, "model") ?? modelDefaults?.preferredVideoModel,
      aspectRatio: getStringConfig(config, "aspectRatio"),
      durationSeconds: typeof config.durationSeconds === "number" ? config.durationSeconds : undefined,
      metadata:
        config.metadata && typeof config.metadata === "object"
          ? (config.metadata as Record<string, unknown>)
          : undefined,
    });

    await recordEvent(ctx, context, step, "model_call", "Requested video generation.", response.metadata);

    const artifactId = await createArtifact(ctx, context, step, {
      type: "video",
      title: `${step.name} job`,
      data: {
        jobId: response.jobId,
        status: response.status,
        ...queueMetadata(response.raw),
      },
      provider: response.metadata.provider,
      model: response.metadata.model,
      prompt,
      parentArtifactIds,
    });

    return { artifactIds: [artifactId], costUsd: response.metadata.costUsd ?? 0 };
  }

  throw new Error(`Unsupported model step: ${step.type}`);
}
