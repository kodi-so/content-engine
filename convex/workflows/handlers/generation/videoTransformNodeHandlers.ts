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
  allMediaReferenceAssetsFromInputs,
  numberFromInputValue,
  objectValue,
  referenceAssetsFromInputs,
  referenceAudioAssetsFromInputs,
  referenceVideoAssetsFromInputs,
  textFromInputValue,
} from "../../runtime/inputValues";
import {
  isAiVideoEditorNode,
  isLipsyncNode,
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

export async function executeVideoTransformNode({
  ctx,
  context,
  graph,
  node,
  resolvedInputs,
}: WorkflowNodeHandlerArgs): Promise<WorkflowNodeHandlerResult | null> {
  const emittedArtifactIds = new Set<Id<"artifacts">>();
  let totalCostUsd = 0;

  if (isLipsyncNode(node)) {
    const config = objectValue(node.config);
    await assertLibraryReferencesExistForRun(ctx, {
      config,
      nodeLabel: node.label,
      userId: context.run.userId,
    });
    const inputs = resolvedInputs.inputs ?? {};
    const providerName = modelProviderNameForNode(node);
    const provider = getModelProvider(providerName);
    const imageFromInputNode = config.imageFromInputNode === true;
    const audioFromInputNode = config.audioFromInputNode === true;
    const model =
      typeof node.model === "string" && node.model.trim()
        ? node.model.trim()
        : textFromInputValue(inputs.model?.value);
    const resolution = textFromInputValue(inputs.resolution?.value);
    const imageReferences = referenceAssetsFromInputs(resolvedInputs, [
      ...(imageFromInputNode ? [] : ["localReferenceImages"]),
      "image",
      "imageUrl",
      "media",
    ]);
    const videoReferences = referenceVideoAssetsFromInputs(resolvedInputs, [
      ...(imageFromInputNode ? [] : ["localReferenceVideos"]),
      "video",
      "videoUrl",
      "media",
    ]);
    const audioReferences = referenceAudioAssetsFromInputs(resolvedInputs, [
      ...(audioFromInputNode ? [] : ["localReferenceAudios"]),
      "audio",
      "audioUrl",
      "media",
    ]);
    const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
      "localReferenceImages",
      "localReferenceVideos",
      "localReferenceAudios",
      "image",
      "video",
      "audio",
      "media",
      "input",
    ]);
    const providerInput = generationProviderInputFromConfig(config, [
      "imageFromInputNode",
      "audioFromInputNode",
      "localReferenceImages",
      "localReferenceVideos",
      "localReferenceAudios",
      "imageUrl",
      "videoUrl",
      "audioUrl",
      "resolution",
    ]);
    if (config.turboMode !== undefined && providerInput.turbo_mode === undefined) {
      providerInput.turbo_mode = Boolean(config.turboMode);
    }
    const image = imageReferences[0];
    const video = videoReferences[0];
    const audio = audioReferences[0];
    if (image?.url) providerInput.image_url = image.url;
    if (video?.url) providerInput.video_url = video.url;
    if (audio?.url) providerInput.audio_url = audio.url;

    if (!audio) {
      throw new Error(`${node.label} needs an audio input.`);
    }
    if (!image && !video) {
      throw new Error(`${node.label} needs an image or video input.`);
    }
    if (!provider.capabilities.lipsync) {
      throw new Error(`${provider.displayName} does not support lipsync generation.`);
    }

    const lipsyncResult = await provider.generateLipsync({
      audio,
      image,
      video,
      model,
      resolution,
      metadata: {
        workflowId: String(context.workflow._id),
        workflowRunId: String(context.run._id),
        nodeId: node.id,
        nodeType: node.type,
        hasImageInput: Boolean(image),
        hasVideoInput: Boolean(video),
        ...(Object.keys(providerInput).length
          ? {
              arguments: providerInput,
              bulkapisInput: providerInput,
            }
          : {}),
      },
    });
    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "running",
      providerJob: {
        provider: lipsyncResult.metadata.provider,
        model: lipsyncResult.metadata.model,
        externalJobId: lipsyncResult.jobId,
        status: lipsyncResult.status,
        submittedAt: Date.now(),
        raw: lipsyncResult.raw,
      },
    });

    const videoAsset = await waitForGeneratedVideo(
      provider,
      {
        jobId: lipsyncResult.jobId,
        model: lipsyncResult.metadata.model,
        metadata: lipsyncResult.metadata,
      },
      async (status) => {
        await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
          runId: context.run._id,
          nodeId: node.id,
          status: "running",
          providerJob: {
            provider: lipsyncResult.metadata.provider,
            model: lipsyncResult.metadata.model,
            externalJobId: lipsyncResult.jobId,
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
          sourceMimeType: videoAsset.mimeType,
          jobId: lipsyncResult.jobId,
          status: "succeeded",
          resolution,
          hasImageInput: Boolean(image),
          hasVideoInput: Boolean(video),
          inputSummary: resolvedInputs.summary,
          providerMetadata: lipsyncResult.metadata,
        },
        provider: lipsyncResult.metadata.provider,
        model: lipsyncResult.metadata.model,
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
        provider: lipsyncResult.metadata.provider,
        model: lipsyncResult.metadata.model,
      },
    }];
    const outputRefs = videoOutputRefsForNode(node.id, videoItems);
    const costUsd = lipsyncResult.metadata.costUsd ?? 0;
    totalCostUsd += costUsd;

    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "succeeded",
      outputRefs,
      costUsd,
      providerJob: {
        provider: lipsyncResult.metadata.provider,
        model: lipsyncResult.metadata.model,
        externalJobId: lipsyncResult.jobId,
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
      message: `${node.label} generated a lip-synced video.`,
      data: {
        provider: lipsyncResult.metadata.provider,
        model: lipsyncResult.metadata.model,
        usage: lipsyncResult.metadata.usage,
        costUsd,
        jobId: lipsyncResult.jobId,
        status: lipsyncResult.status,
        hasImageInput: Boolean(image),
        hasVideoInput: Boolean(video),
      },
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      nodeId: node.id,
      message: `${node.label} produced a lip-synced video output.`,
      data: {
        nodeType: node.type,
        lifecycle,
        artifactId,
        provider: lipsyncResult.metadata.provider,
        model: lipsyncResult.metadata.model,
        outputPorts: outputRefs.map((outputRef) => outputRef.port),
        placeholderExecution: false,
      },
    });
  return { costUsd: totalCostUsd, emittedArtifactIds: [...emittedArtifactIds] };
  }

  if (isAiVideoEditorNode(node)) {
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
    const mediaFromInputNode = config.mediaFromInputNode === true;
    const prompt = promptFromInputNode && inputs.prompt?.source === "config"
      ? ""
      : textFromInputValue(inputs.prompt?.value);
    const systemPrompt = textFromInputValue(inputs.systemPrompt?.value);
    const knowledgeBase = textFromInputValue(inputs.knowledgeBase?.value);
    const model =
      typeof node.model === "string" && node.model.trim()
        ? node.model.trim()
        : textFromInputValue(inputs.model?.value);
    const aspectRatio = textFromInputValue(inputs.aspectRatio?.value);
    const maxDurationSeconds = numberFromInputValue(inputs.maxDurationSeconds?.value);
    const width = numberFromInputValue(inputs.width?.value);
    const height = numberFromInputValue(inputs.height?.value);
    const fps = numberFromInputValue(inputs.fps?.value);
    const mediaAssets = allMediaReferenceAssetsFromInputs(resolvedInputs, [
      ...(mediaFromInputNode ? [] : ["uploadedMedia"]),
      "media",
      "video",
      "image",
      "audio",
      "videoUrl",
      "imageUrl",
      "audioUrl",
    ]);
    const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
      "uploadedMedia",
      "media",
      "video",
      "image",
      "audio",
      "input",
    ]);
    const providerInput = generationProviderInputFromConfig(config, [
      "prompt",
      "promptFromInputNode",
      "mediaFromInputNode",
      "uploadedMedia",
      "systemPrompt",
      "knowledgeBase",
      "aspectRatio",
      "maxDurationSeconds",
      "width",
      "height",
      "fps",
      "videoUrl",
      "imageUrl",
      "audioUrl",
    ]);
    const mediaUrls = mediaAssets.flatMap((asset) => asset.url ? [asset.url] : []);
    if (mediaUrls.length) providerInput.media_urls = mediaUrls;

    if (!prompt) {
      throw new Error(`${node.label} needs a prompt input.`);
    }
    if (!provider.capabilities.videoRender) {
      throw new Error(`${provider.displayName} does not support AI video render.`);
    }

    const providerPrompt = promptWithProviderSafeReferenceAliases(prompt, mediaAssets, "media");
    const renderResult = await provider.generateVideoRender({
      prompt: providerPrompt,
      model,
      systemPrompt,
      knowledgeBase,
      mediaAssets: mediaAssets.length ? mediaAssets : undefined,
      aspectRatio,
      width,
      height,
      fps,
      maxDurationSeconds,
      metadata: {
        workflowId: String(context.workflow._id),
        workflowRunId: String(context.run._id),
        nodeId: node.id,
        nodeType: node.type,
        mediaAssetCount: mediaAssets.length,
        ...(Object.keys(providerInput).length
          ? {
              arguments: providerInput,
              bulkapisInput: providerInput,
            }
          : {}),
      },
    });
    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "running",
      providerJob: {
        provider: renderResult.metadata.provider,
        model: renderResult.metadata.model,
        externalJobId: renderResult.jobId,
        status: renderResult.status,
        submittedAt: Date.now(),
        raw: renderResult.raw,
      },
    });

    const videoAsset = await waitForGeneratedVideo(
      provider,
      {
        jobId: renderResult.jobId,
        model: renderResult.metadata.model,
        metadata: renderResult.metadata,
      },
      async (status) => {
        await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
          runId: context.run._id,
          nodeId: node.id,
          status: "running",
          providerJob: {
            provider: renderResult.metadata.provider,
            model: renderResult.metadata.model,
            externalJobId: renderResult.jobId,
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
        title: `${node.label} render`,
        storageUrl: stored.storageUrl,
        data: {
          storageId: stored.storageId,
          mimeType: stored.mimeType,
          fileSize: stored.byteLength,
          sourceMimeType: videoAsset.mimeType,
          jobId: renderResult.jobId,
          status: "succeeded",
          aspectRatio,
          maxDurationSeconds,
          width,
          height,
          fps,
          mediaAssetCount: mediaAssets.length,
          inputSummary: resolvedInputs.summary,
          providerMetadata: renderResult.metadata,
        },
        provider: renderResult.metadata.provider,
        model: renderResult.metadata.model,
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
      title: `${node.label} render`,
      storageUrl: stored.storageUrl,
      metadata: {
        mimeType: stored.mimeType,
        fileSize: stored.byteLength,
        provider: renderResult.metadata.provider,
        model: renderResult.metadata.model,
      },
    }];
    const outputRefs = videoOutputRefsForNode(node.id, videoItems);
    const costUsd = renderResult.metadata.costUsd ?? 0;
    totalCostUsd += costUsd;

    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "succeeded",
      outputRefs,
      costUsd,
      providerJob: {
        provider: renderResult.metadata.provider,
        model: renderResult.metadata.model,
        externalJobId: renderResult.jobId,
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
      message: `${node.label} rendered a video.`,
      data: {
        provider: renderResult.metadata.provider,
        model: renderResult.metadata.model,
        usage: renderResult.metadata.usage,
        costUsd,
        jobId: renderResult.jobId,
        status: renderResult.status,
        mediaAssetCount: mediaAssets.length,
      },
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      nodeId: node.id,
      message: `${node.label} produced a rendered video output.`,
      data: {
        nodeType: node.type,
        lifecycle,
        artifactId,
        provider: renderResult.metadata.provider,
        model: renderResult.metadata.model,
        outputPorts: outputRefs.map((outputRef) => outputRef.port),
        placeholderExecution: false,
      },
    });
  return { costUsd: totalCostUsd, emittedArtifactIds: [...emittedArtifactIds] };
  }

  return null;
}
