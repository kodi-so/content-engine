import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { storeGeneratedAsset } from "../../../content/assetStorage";
import { getModelProvider } from "../../../providers";
import { artifactIdsFromInputs } from "../../runtime/artifactInputs";
import type {
  WorkflowNodeHandlerArgs,
  WorkflowNodeHandlerResult,
} from "../../runtime/executionTypes";
import {
  costUsdFromMetadata,
  waitForGeneratedAudio,
  waitForGeneratedImage,
  waitForGeneratedVideo,
} from "../../runtime/generationWaiters";
import {
  allMediaReferenceAssetsFromInputs,
  numberFromInputValue,
  objectValue,
  referenceAssetsFromInputs,
  referenceAudioAssetsFromInputs,
  referenceVideoAssetsFromInputs,
  textFromInputValue,
  uniqueReferenceAssets,
} from "../../runtime/inputValues";
import {
  isAiVideoEditorNode,
  isAudioGenerationNode,
  isImageGenerationNode,
  isLipsyncNode,
  isVideoGenerationNode,
  placeholderLifecycleForNode,
} from "../../runtime/nodeRuntime";
import {
  audioOutputRefsForNode,
  imageOutputRefsForNode,
  videoOutputRefsForNode,
  type MediaNodeItemForRun,
} from "../../runtime/outputRefs";
import {
  generationProviderInputFromConfig,
  imageModelUiContractForRun,
  imageProviderInputFromModelSchema,
  modelProviderNameForNode,
} from "../../runtime/providerInputs";
import { assertLibraryReferencesExistForRun } from "../../runtime/libraryReferences";

export async function executeImageGenerationNode({
  ctx,
  context,
  graph,
  node,
  resolvedInputs,
}: WorkflowNodeHandlerArgs): Promise<WorkflowNodeHandlerResult | null> {
  const emittedArtifactIds = new Set<Id<"artifacts">>();
  let totalCostUsd = 0;

  if (isImageGenerationNode(node)) {
    const config = objectValue(node.config);
    await assertLibraryReferencesExistForRun(ctx, {
      config,
      nodeLabel: node.label,
      userId: context.run.userId,
    });
    const inputs = resolvedInputs.inputs ?? {};
    const providerName = modelProviderNameForNode(node);
    const provider = getModelProvider(providerName);
    const model =
      typeof node.model === "string" && node.model.trim()
        ? node.model.trim()
        : textFromInputValue(inputs.model?.value);
    const providerModel = model
      ? await ctx.runQuery(internal.providers.modelCatalog.getByProviderModelForRun, {
          provider: providerName,
          modelId: model,
        })
      : null;
    const imageContract = imageModelUiContractForRun(providerModel);
    const promptFromInputNode = config.promptFromInputNode === true;
    const imageFromInputNode = config.imageFromInputNode === true;
    const prompt =
      imageContract.prompt.visible === false ||
      (promptFromInputNode && inputs.prompt?.source === "config")
        ? ""
        : textFromInputValue(inputs.prompt?.value);
    const aspectRatio = textFromInputValue(inputs.aspectRatio?.value);
    const count = Math.max(1, Math.floor(numberFromInputValue(inputs.count?.value) ?? 1));
    const referenceImages = referenceAssetsFromInputs(
      resolvedInputs,
      imageFromInputNode
        ? ["reference_image", "image", "media"]
        : ["localReferenceImages", "reference_image", "image", "media"]
    );
    const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
      "reference_image",
      "image",
      "media",
      "input",
    ]);
    const providerInput = generationProviderInputFromConfig(config, [
      "prompt",
      "aspectRatio",
      "count",
      "promptFromInputNode",
      "imageFromInputNode",
      "localReferenceImages",
    ]);

    if (imageContract.prompt.required && !prompt) {
      throw new Error(
        promptFromInputNode
          ? `${node.label} needs a prompt from an upstream node.`
          : `${node.label} needs a prompt.`
      );
    }
    if (imageContract.images.required && !referenceImages.length) {
      throw new Error(
        imageFromInputNode
          ? `${node.label} needs an image from an upstream node.`
          : `${node.label} needs a reference image.`
      );
    }
    if (imageContract.images.maxCount && referenceImages.length > imageContract.images.maxCount) {
      throw new Error(
        `${node.label} allows up to ${imageContract.images.maxCount} reference image${imageContract.images.maxCount === 1 ? "" : "s"}.`
      );
    }
    if (!provider.capabilities.image) {
      throw new Error(`${provider.displayName} does not support image generation.`);
    }

    const imageResult = await provider.generateImage({
      prompt: prompt ?? "",
      model,
      aspectRatio,
      count,
      referenceImages: referenceImages.length ? referenceImages : undefined,
      metadata: {
        workflowId: String(context.workflow._id),
        workflowRunId: String(context.run._id),
        nodeId: node.id,
        nodeType: node.type,
        referenceImageCount: referenceImages.length,
        ...(Object.keys(providerInput).length || providerModel
          ? {
              bulkapisInput: {
                ...imageProviderInputFromModelSchema({
                  model: providerModel,
                  referenceImages,
                  count,
                }),
                ...providerInput,
              },
            }
          : {}),
      },
    });
    const providerJob = imageResult.jobId
      ? {
          provider: imageResult.metadata.provider,
          model: imageResult.metadata.model,
          externalJobId: imageResult.jobId,
          status: imageResult.status ?? "queued",
          submittedAt: Date.now(),
          raw: imageResult.raw,
        }
      : undefined;

    if (providerJob) {
      await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
        runId: context.run._id,
        nodeId: node.id,
        status: "running",
        providerJob,
      });
    }

    const generatedAssets = [...imageResult.images];
    if (!generatedAssets.length && imageResult.jobId) {
      generatedAssets.push(
        await waitForGeneratedImage(
          provider,
          {
            jobId: imageResult.jobId,
            model: imageResult.metadata.model,
            metadata: imageResult.metadata,
          },
          async (status) => {
            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "running",
              providerJob: {
                provider: imageResult.metadata.provider,
                model: imageResult.metadata.model,
                externalJobId: imageResult.jobId!,
                status,
                ...(status === "succeeded" ? { completedAt: Date.now() } : {}),
              },
            });
          }
        )
      );
    }

    if (!generatedAssets.length) {
      throw new Error(`${node.label} did not return any images.`);
    }

    const lifecycle = placeholderLifecycleForNode(graph, node);
    const imageItems: MediaNodeItemForRun[] = [];
    for (const [index, image] of generatedAssets.entries()) {
      if (!image.mimeType.startsWith("image/")) continue;

      const stored = await storeGeneratedAsset(ctx, image);
      const artifactId = await ctx.runMutation(
        internal.artifacts.records.createFromRunner,
        {
          userId: context.run.userId,
          brandId: context.run.brandId,
          workflowId: context.workflow._id,
          workflowRunId: context.run._id,
          parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
          type: "image",
          title: `${node.label} image ${index + 1}`,
          storageUrl: stored.storageUrl,
          data: {
            storageId: stored.storageId,
            mimeType: stored.mimeType,
            fileSize: stored.byteLength,
            aspectRatio,
            sourceMimeType: image.mimeType,
            jobId: imageResult.jobId,
            status: "succeeded",
            referenceImageCount: referenceImages.length,
            inputSummary: resolvedInputs.summary,
            providerMetadata: imageResult.metadata,
          },
          provider: imageResult.metadata.provider,
          model: imageResult.metadata.model,
          prompt,
          lifecycle,
          reviewStatus: "not_required",
        }
      );
      emittedArtifactIds.add(artifactId);
      imageItems.push({
        id: String(artifactId),
        source: "artifact",
        kind: "image",
        title: `${node.label} image ${index + 1}`,
        storageUrl: stored.storageUrl,
        metadata: {
          mimeType: stored.mimeType,
          fileSize: stored.byteLength,
          provider: imageResult.metadata.provider,
          model: imageResult.metadata.model,
        },
      });
    }

    if (!imageItems.length) {
      throw new Error(`${node.label} returned assets but none were images.`);
    }

    const outputRefs = imageOutputRefsForNode(node.id, imageItems);
    const costUsd = imageResult.metadata.costUsd ?? 0;
    totalCostUsd += costUsd;

    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "succeeded",
      outputRefs,
      costUsd,
      ...(imageResult.jobId
        ? {
            providerJob: {
              provider: imageResult.metadata.provider,
              model: imageResult.metadata.model,
              externalJobId: imageResult.jobId,
              status: "succeeded",
              completedAt: Date.now(),
            },
          }
        : {}),
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "model_call",
      nodeId: node.id,
      message: `${node.label} generated ${imageItems.length} image${imageItems.length === 1 ? "" : "s"}.`,
      data: {
        provider: imageResult.metadata.provider,
        model: imageResult.metadata.model,
        usage: imageResult.metadata.usage,
        costUsd,
        jobId: imageResult.jobId,
        status: imageResult.status,
        referenceImageCount: referenceImages.length,
      },
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      nodeId: node.id,
      message: `${node.label} produced ${imageItems.length} image output${imageItems.length === 1 ? "" : "s"}.`,
      data: {
        nodeType: node.type,
        lifecycle,
        artifactIds: imageItems.map((item) => item.id),
        provider: imageResult.metadata.provider,
        model: imageResult.metadata.model,
        outputPorts: outputRefs.map((outputRef) => outputRef.port),
        placeholderExecution: false,
      },
    });
  return { costUsd: totalCostUsd, emittedArtifactIds: [...emittedArtifactIds] };
  }

  return null;
}
