import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { storeGeneratedAsset } from "../../../content/assets/assetStorage";
import { getModelProvider } from "../../../providers";
import { promptWithProviderSafeReferenceAliases } from "../../../../src/lib/references/referenceAliases";
import { artifactIdsFromInputs } from "../../runtime/artifactInputs";
import type {
  WorkflowNodeHandlerArgs,
  WorkflowNodeHandlerResult,
} from "../../runtime/executionTypes";
import {
  waitForGeneratedVideo,
} from "../../runtime/generationWaiters";
import {
  numberFromInputValue,
  objectValue,
  referenceAssetsFromInputs,
  referenceVideoAssetsFromInputs,
  textFromInputValue,
  uniqueReferenceAssets,
} from "../../runtime/inputValues";
import {
  isVideoGenerationNode,
  placeholderLifecycleForNode,
} from "../../runtime/nodeRuntime";
import {
  videoOutputRefsForNode,
  type MediaNodeItemForRun,
} from "../../runtime/outputRefs";
import {
  generationProviderInputFromConfig,
  modelProviderNameForNode,
} from "../../runtime/providerInputs";
import { assertLibraryReferencesExistForRun } from "../../runtime/libraryReferences";

export async function executeVideoGenerationNode({
  ctx,
  context,
  graph,
  node,
  resolvedInputs,
}: WorkflowNodeHandlerArgs): Promise<WorkflowNodeHandlerResult | null> {
  const emittedArtifactIds = new Set<Id<"artifacts">>();
  let totalCostUsd = 0;

  if (isVideoGenerationNode(node)) {
    const config = objectValue(node.config);
    await assertLibraryReferencesExistForRun(ctx, {
      config,
      nodeLabel: node.label,
      userId: context.run.userId,
    });
    const inputs = resolvedInputs.inputs ?? {};
    const providerName = modelProviderNameForNode(node);
    const provider = getModelProvider(providerName);
    const promptFromInputNode = config.promptFromInputNode === true;
    const imageFromInputNode = config.imageFromInputNode === true;
    const startEndFrameMode = config.startEndFrameMode === true;
    const prompt = promptFromInputNode && inputs.prompt?.source === "config"
      ? ""
      : textFromInputValue(inputs.prompt?.value);
    const model =
      typeof node.model === "string" && node.model.trim()
        ? node.model.trim()
        : textFromInputValue(inputs.model?.value);
    const aspectRatio = textFromInputValue(inputs.aspectRatio?.value);
    const durationSeconds = numberFromInputValue(inputs.durationSeconds?.value);
    const startFrameAssets = referenceAssetsFromInputs(resolvedInputs, [
      ...(startEndFrameMode && !imageFromInputNode ? ["localStartFrameImages"] : []),
      "start_frame",
      "startFrameUrl",
    ]);
    const endFrameAssets = referenceAssetsFromInputs(resolvedInputs, [
      ...(startEndFrameMode && !imageFromInputNode ? ["localEndFrameImages"] : []),
      "end_frame",
      "endFrameUrl",
    ]);
    const imageAssets = referenceAssetsFromInputs(resolvedInputs, [
      ...(imageFromInputNode || startEndFrameMode ? [] : ["localReferenceImages"]),
      "image",
      "imageUrl",
      "reference_image",
      "media",
    ]);
    const referenceImages = uniqueReferenceAssets([
      ...startFrameAssets,
      ...endFrameAssets,
      ...imageAssets,
    ]);
    const referenceVideos = referenceVideoAssetsFromInputs(resolvedInputs, [
      ...(imageFromInputNode ? [] : ["localReferenceVideos"]),
      "reference_video",
      "referenceVideoUrl",
      "video",
      "videoUrl",
      "media",
    ]);
    const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
      "localReferenceImages",
      "localStartFrameImages",
      "localEndFrameImages",
      "localReferenceVideos",
      "image",
      "start_frame",
      "end_frame",
      "reference_video",
      "video",
      "media",
      "input",
    ]);
    const providerInput = generationProviderInputFromConfig(config, [
      "prompt",
      "promptFromInputNode",
      "imageFromInputNode",
      "startEndFrameMode",
      "localReferenceImages",
      "localStartFrameImages",
      "localEndFrameImages",
      "localReferenceVideos",
      "aspectRatio",
      "durationSeconds",
      "imageUrl",
      "startFrameUrl",
      "endFrameUrl",
      "referenceVideoUrl",
      "videoUrl",
    ]);
    const startFrameUrl = startFrameAssets[0]?.url;
    const endFrameUrl = endFrameAssets[0]?.url;
    const referenceVideoUrl = referenceVideos[0]?.url;
    if (startFrameUrl) {
      providerInput.start_frame_url = startFrameUrl;
      providerInput.start_image_url = startFrameUrl;
      providerInput.first_frame_url = startFrameUrl;
    }
    if (endFrameUrl) {
      providerInput.end_frame_url = endFrameUrl;
      providerInput.end_image_url = endFrameUrl;
      providerInput.last_frame_url = endFrameUrl;
      providerInput.tail_image_url = endFrameUrl;
    }
    if (referenceVideoUrl) {
      providerInput.reference_video_url = referenceVideoUrl;
      providerInput.video_url = providerInput.video_url ?? referenceVideoUrl;
    }
    if (referenceVideos.length > 1) {
      providerInput.reference_video_urls = referenceVideos.flatMap((asset) =>
        asset.url ? [asset.url] : []
      );
    }

    if (!prompt) {
      throw new Error(`${node.label} needs a prompt input.`);
    }
    if (!provider.capabilities.video) {
      throw new Error(`${provider.displayName} does not support video generation.`);
    }

    const providerMetadata = {
      workflowId: String(context.workflow._id),
      workflowRunId: String(context.run._id),
      nodeId: node.id,
      nodeType: node.type,
      referenceImageCount: referenceImages.length,
      referenceVideoCount: referenceVideos.length,
      ...(Object.keys(providerInput).length
        ? {
            arguments: providerInput,
            bulkapisInput: providerInput,
          }
        : {}),
    };
    const providerPrompt = promptWithProviderSafeReferenceAliases(
      prompt,
      [...referenceImages, ...referenceVideos],
      "media"
    );
    const videoResult = await provider.generateVideo({
      prompt: providerPrompt,
      model,
      aspectRatio,
      durationSeconds,
      referenceImages: referenceImages.length ? referenceImages : undefined,
      metadata: providerMetadata,
    });
    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "running",
      providerJob: {
        provider: videoResult.metadata.provider,
        model: videoResult.metadata.model,
        externalJobId: videoResult.jobId,
        status: videoResult.status,
        submittedAt: Date.now(),
        raw: videoResult.raw,
      },
    });

    const videoAsset = await waitForGeneratedVideo(
      provider,
      {
        jobId: videoResult.jobId,
        model: videoResult.metadata.model,
        metadata: videoResult.metadata,
      },
      async (status) => {
        await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
          runId: context.run._id,
          nodeId: node.id,
          status: "running",
          providerJob: {
            provider: videoResult.metadata.provider,
            model: videoResult.metadata.model,
            externalJobId: videoResult.jobId,
            status,
            ...(status === "succeeded" ? { completedAt: Date.now() } : {}),
          },
        });
      }
    );
    const lifecycle = placeholderLifecycleForNode(graph, node);
    const stored = await storeGeneratedAsset(ctx, videoAsset);
    const artifactId = await ctx.runMutation(
      internal.artifacts.records.createFromRunner,
      {
        userId: context.run.userId,
        workflowId: context.workflow._id,
        workflowRunId: context.run._id,
        parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
        type: "video",
        title: `${node.label} video`,
        storageUrl: stored.storageUrl,
        data: {
          storageId: stored.storageId,
          mimeType: stored.mimeType,
          fileSize: stored.byteLength,
          aspectRatio,
          durationSeconds,
          sourceMimeType: videoAsset.mimeType,
          jobId: videoResult.jobId,
          status: "succeeded",
          referenceImageCount: referenceImages.length,
          referenceVideoCount: referenceVideos.length,
          inputSummary: resolvedInputs.summary,
          providerMetadata: videoResult.metadata,
        },
        provider: videoResult.metadata.provider,
        model: videoResult.metadata.model,
        prompt,
        lifecycle,
        reviewStatus: "not_required",
      }
    );
    emittedArtifactIds.add(artifactId);

    const videoItems: MediaNodeItemForRun[] = [{
      id: String(artifactId),
      source: "artifact",
      kind: "video",
      title: `${node.label} video`,
      storageUrl: stored.storageUrl,
      metadata: {
        mimeType: stored.mimeType,
        fileSize: stored.byteLength,
        provider: videoResult.metadata.provider,
        model: videoResult.metadata.model,
      },
    }];
    const outputRefs = videoOutputRefsForNode(node.id, videoItems);
    const costUsd = videoResult.metadata.costUsd ?? 0;
    totalCostUsd += costUsd;

    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "succeeded",
      outputRefs,
      costUsd,
      providerJob: {
        provider: videoResult.metadata.provider,
        model: videoResult.metadata.model,
        externalJobId: videoResult.jobId,
        status: "succeeded",
        completedAt: Date.now(),
      },
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "model_call",
      nodeId: node.id,
      message: `${node.label} generated a video.`,
      data: {
        provider: videoResult.metadata.provider,
        model: videoResult.metadata.model,
        usage: videoResult.metadata.usage,
        costUsd,
        jobId: videoResult.jobId,
        status: videoResult.status,
        referenceImageCount: referenceImages.length,
        referenceVideoCount: referenceVideos.length,
      },
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      nodeId: node.id,
      message: `${node.label} produced a video output.`,
      data: {
        nodeType: node.type,
        lifecycle,
        artifactId,
        provider: videoResult.metadata.provider,
        model: videoResult.metadata.model,
        outputPorts: outputRefs.map((outputRef) => outputRef.port),
        placeholderExecution: false,
      },
    });
  return { costUsd: totalCostUsd, emittedArtifactIds: [...emittedArtifactIds] };
  }

  return null;
}
