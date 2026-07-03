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

export async function executeAudioGenerationNode({
  ctx,
  context,
  graph,
  node,
  resolvedInputs,
}: WorkflowNodeHandlerArgs): Promise<WorkflowNodeHandlerResult | null> {
  const emittedArtifactIds = new Set<Id<"artifacts">>();
  let totalCostUsd = 0;

  if (isAudioGenerationNode(node)) {
    const config = objectValue(node.config);
    await assertLibraryReferencesExistForRun(ctx, {
      config,
      nodeLabel: node.label,
      userId: context.run.userId,
    });
    const inputs = resolvedInputs.inputs ?? {};
    const providerName = modelProviderNameForNode(node);
    const provider = getModelProvider(providerName);
    const textFromInputNode = config.textFromInputNode === true;
    const voiceFromInputNode = config.voiceFromInputNode === true;
    const text =
      (textFromInputNode && inputs.text?.source === "config"
        ? undefined
        : textFromInputValue(inputs.text?.value)) ??
      textFromInputValue(inputs.prompt?.value) ??
      textFromInputValue(inputs.input?.value);
    const mode = textFromInputValue(inputs.mode?.value);
    const model =
      typeof node.model === "string" && node.model.trim()
        ? node.model.trim()
        : textFromInputValue(inputs.model?.value);
    const voiceReferenceAudios = referenceAudioAssetsFromInputs(resolvedInputs, [
      ...(voiceFromInputNode ? [] : ["localReferenceAudios"]),
      "voice_reference",
      "audio",
      "voiceReferenceUrl",
      "audioUrl",
      "media",
    ]);
    const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
      "localReferenceAudios",
      "voice_reference",
      "audio",
      "media",
      "input",
    ]);
    const providerInput = generationProviderInputFromConfig(config, [
      "text",
      "textFromInputNode",
      "mode",
      "voice",
      "voiceFromInputNode",
      "localReferenceAudios",
      "voiceReferenceUrl",
      "audioUrl",
    ]);
    const voiceReferenceUrl = voiceReferenceAudios[0]?.url;
    if (voiceReferenceUrl) {
      providerInput.audio_url = voiceReferenceUrl;
    }
    if (voiceReferenceAudios.length > 1) {
      providerInput.audio_urls = voiceReferenceAudios.flatMap((asset) =>
        asset.url ? [asset.url] : []
      );
    }
    const cfgScale = numberFromInputValue(config.cfgScale);
    if (cfgScale !== undefined && providerInput.cfg === undefined) {
      providerInput.cfg = cfgScale;
    }

    if (!text) {
      throw new Error(`${node.label} needs text input.`);
    }
    if (!provider.capabilities.audio) {
      throw new Error(`${provider.displayName} does not support audio generation.`);
    }

    const audioResult = await provider.generateAudio({
      text,
      model,
      mode,
      voiceReferenceAudios: voiceReferenceAudios.length
        ? voiceReferenceAudios
        : undefined,
      metadata: {
        workflowId: String(context.workflow._id),
        workflowRunId: String(context.run._id),
        nodeId: node.id,
        nodeType: node.type,
        mode,
        voiceReferenceCount: voiceReferenceAudios.length,
        ...(Object.keys(providerInput).length
          ? {
              arguments: providerInput,
              bulkapisInput: providerInput,
            }
          : {}),
      },
    });
    const providerJob = audioResult.jobId
      ? {
          provider: audioResult.metadata.provider,
          model: audioResult.metadata.model,
          externalJobId: audioResult.jobId,
          status: audioResult.status ?? "queued",
          submittedAt: Date.now(),
          raw: audioResult.raw,
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

    const generatedAudios = [...audioResult.audios];
    if (!generatedAudios.length && audioResult.jobId) {
      generatedAudios.push(
        await waitForGeneratedAudio(
          provider,
          {
            jobId: audioResult.jobId,
            model: audioResult.metadata.model,
            metadata: audioResult.metadata,
          },
          async (status) => {
            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "running",
              providerJob: {
                provider: audioResult.metadata.provider,
                model: audioResult.metadata.model,
                externalJobId: audioResult.jobId!,
                status,
                ...(status === "succeeded" ? { completedAt: Date.now() } : {}),
              },
            });
          }
        )
      );
    }

    if (!generatedAudios.length) {
      throw new Error(`${node.label} did not return any audio.`);
    }

    const lifecycle = placeholderLifecycleForNode(graph, node);
    const audioItems: MediaNodeItemForRun[] = [];
    for (const [index, audio] of generatedAudios.entries()) {
      if (!audio.mimeType.startsWith("audio/")) continue;

      const stored = await storeGeneratedAsset(ctx, audio);
      const artifactId = await ctx.runMutation(
        internal.artifacts.records.createFromRunner,
        {
          userId: context.run.userId,
          workflowId: context.workflow._id,
          workflowRunId: context.run._id,
          parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
          type: "rendered_asset",
          title: `${node.label} audio ${index + 1}`,
          storageUrl: stored.storageUrl,
          data: {
            kind: "audio",
            storageId: stored.storageId,
            mimeType: stored.mimeType,
            fileSize: stored.byteLength,
            sourceMimeType: audio.mimeType,
            jobId: audioResult.jobId,
            status: "succeeded",
            mode,
            voiceReferenceCount: voiceReferenceAudios.length,
            inputSummary: resolvedInputs.summary,
            providerMetadata: audioResult.metadata,
          },
          provider: audioResult.metadata.provider,
          model: audioResult.metadata.model,
          prompt: text,
          lifecycle,
          reviewStatus: "not_required",
        }
      );
      emittedArtifactIds.add(artifactId);
      audioItems.push({
        id: String(artifactId),
        source: "artifact",
        kind: "audio",
        title: `${node.label} audio ${index + 1}`,
        storageUrl: stored.storageUrl,
        metadata: {
          mimeType: stored.mimeType,
          fileSize: stored.byteLength,
          provider: audioResult.metadata.provider,
          model: audioResult.metadata.model,
          mode,
        },
      });
    }

    if (!audioItems.length) {
      throw new Error(`${node.label} returned assets but none were audio.`);
    }

    const outputRefs = audioOutputRefsForNode(node.id, audioItems);
    const costUsd = audioResult.metadata.costUsd ?? 0;
    totalCostUsd += costUsd;

    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "succeeded",
      outputRefs,
      costUsd,
      ...(audioResult.jobId
        ? {
            providerJob: {
              provider: audioResult.metadata.provider,
              model: audioResult.metadata.model,
              externalJobId: audioResult.jobId,
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
      message: `${node.label} generated ${audioItems.length} audio output${audioItems.length === 1 ? "" : "s"}.`,
      data: {
        provider: audioResult.metadata.provider,
        model: audioResult.metadata.model,
        usage: audioResult.metadata.usage,
        costUsd,
        jobId: audioResult.jobId,
        status: audioResult.status,
        mode,
        voiceReferenceCount: voiceReferenceAudios.length,
      },
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      nodeId: node.id,
      message: `${node.label} produced ${audioItems.length} audio output${audioItems.length === 1 ? "" : "s"}.`,
      data: {
        nodeType: node.type,
        lifecycle,
        artifactIds: audioItems.map((item) => item.id),
        provider: audioResult.metadata.provider,
        model: audioResult.metadata.model,
        outputPorts: outputRefs.map((outputRef) => outputRef.port),
        placeholderExecution: false,
      },
    });
  return { costUsd: totalCostUsd, emittedArtifactIds: [...emittedArtifactIds] };
  }

  return null;
}
