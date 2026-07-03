import { getPublishingProvider } from "../../providers";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { PublishingProviderName } from "../../providers/publishing";
import { loadPublishInput, mapProviderStatus } from "../../publishing/publishInput";
import { artifactIdsFromInputs, artifactsForIds } from "../runtime/artifactInputs";
import type {
  WorkflowGraphNodeForRun,
  WorkflowNodeHandlerArgs,
  WorkflowNodeHandlerResult,
} from "../runtime/executionTypes";
import { objectValue, stringFromValue } from "../runtime/inputValues";
import { isAutoPostNode, isExportNode, isPostPackageNode } from "../runtime/nodeRuntime";
import {
  autoPostOutputRefsForNode,
  autoPostIntentForNode,
  autoPostPackageData,
  autoPostScheduleForNode,
  captionFromPackageArtifact,
  exportedPackageData,
  exportDestinationForNode,
  exportOutputRefsForNode,
  exportRecordForNode,
  packageMediaArtifactIdsFromData,
  postPackageArtifactIdsFromInputs,
  postPackageDataForNode,
  postPackageOutputRefsForNode,
  socialAccountIdsFromInputs,
} from "../runtime/publishPackaging";

function publishingProviderNameForNode(node: WorkflowGraphNodeForRun): PublishingProviderName {
  switch (node.provider) {
    case "postiz":
    case "post_bridge":
    case "manual":
      return node.provider;
    default:
      return "manual";
  }
}


export async function executePublishingNode({
  ctx,
  context,
  node,
  resolvedInputs,
}: WorkflowNodeHandlerArgs): Promise<WorkflowNodeHandlerResult | null> {
  const emittedArtifactIds = new Set<Id<"artifacts">>();
  const finalPackageArtifactIds = new Set<Id<"artifacts">>();

  if (isPostPackageNode(node)) {
    const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
      "slideshow",
      "media",
      "video",
      "image",
      "audio",
      "input",
      "slide_spec",
    ]);
    const sourceArtifacts = await artifactsForIds(ctx, sourceArtifactIds);
    const packageData = postPackageDataForNode({
      node,
      resolvedInputs,
      sourceArtifactIds,
      sourceArtifacts,
    });
    const packageArtifactId = await ctx.runMutation(
      internal.workflows.runner.createPostPackageArtifact,
      {
        userId: context.run.userId,
        workflowId: context.workflow._id,
        workflowRunId: context.run._id,
        nodeId: node.id,
        label: node.label,
        sourceArtifactIds,
        packageData,
      }
    );
    finalPackageArtifactIds.add(packageArtifactId);
    emittedArtifactIds.add(packageArtifactId);

    const outputRefs = postPackageOutputRefsForNode({
      nodeId: node.id,
      artifactId: packageArtifactId,
      packageData,
    });

    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "succeeded",
      outputRefs,
      costUsd: 0,
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      nodeId: node.id,
      message: `${node.label} compiled a ${packageData.postType} post package.`,
      data: {
        nodeType: node.type,
        artifactId: packageArtifactId,
        postType: packageData.postType,
        mediaSummary: packageData.mediaSummary,
        outputPorts: outputRefs.map((outputRef) => outputRef.port),
        placeholderExecution: false,
      },
    });
  return {
    costUsd: 0,
    emittedArtifactIds: [...emittedArtifactIds],
    finalPackageArtifactIds: [...finalPackageArtifactIds],
  };
  }

  if (isExportNode(node)) {
    const destination = exportDestinationForNode(node, resolvedInputs);
    let packageArtifactIds = postPackageArtifactIdsFromInputs(resolvedInputs);
    let sourceArtifactIds: Id<"artifacts">[] = [];

    if (!packageArtifactIds.length) {
      sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
        "slideshow",
        "media",
        "video",
        "image",
        "audio",
        "input",
        "slide_spec",
      ]);
      const sourceArtifacts = await artifactsForIds(ctx, sourceArtifactIds);
      const packageData = postPackageDataForNode({
        node,
        resolvedInputs,
        sourceArtifactIds,
        sourceArtifacts,
      });
      const packageArtifactId = await ctx.runMutation(
        internal.workflows.runner.createPostPackageArtifact,
        {
          userId: context.run.userId,
          workflowId: context.workflow._id,
          workflowRunId: context.run._id,
          nodeId: node.id,
          label: node.label,
          sourceArtifactIds,
          packageData,
        }
      );
      packageArtifactIds = [packageArtifactId];
      emittedArtifactIds.add(packageArtifactId);
    }

    const packageArtifacts = await artifactsForIds(ctx, packageArtifactIds);
    const exportRecord = exportRecordForNode({
      node,
      resolvedInputs,
      destination,
    });

    for (const packageArtifact of packageArtifacts) {
      await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
        artifactId: packageArtifact._id,
        userId: context.run.userId,
        data: exportedPackageData({
          packageArtifact,
          exportRecord,
        }),
      });
      finalPackageArtifactIds.add(packageArtifact._id);
      emittedArtifactIds.add(packageArtifact._id);
    }

    const outputRefs = exportOutputRefsForNode({
      nodeId: node.id,
      packageArtifactIds,
      destination,
      status: exportRecord.status,
    });

    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "succeeded",
      outputRefs,
      costUsd: 0,
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      nodeId: node.id,
      message:
        destination === "media_library"
          ? `${node.label} exported the post package to Media Library.`
          : `${node.label} prepared a ${destination} export request.`,
      data: {
        nodeType: node.type,
        destination,
        status: exportRecord.status,
        packageArtifactIds,
        sourceArtifactIds,
        outputPorts: outputRefs.map((outputRef) => outputRef.port),
        placeholderExecution: false,
      },
    });
  return {
    costUsd: 0,
    emittedArtifactIds: [...emittedArtifactIds],
    finalPackageArtifactIds: [...finalPackageArtifactIds],
  };
  }

  if (isAutoPostNode(node)) {
    const providerName = publishingProviderNameForNode(node);
    const publishIntent = autoPostIntentForNode(node, resolvedInputs);
    const shouldSendToProvider = publishIntent !== "distribution_plan";
    const autoPublish = shouldSendToProvider;
    const socialAccountIds = socialAccountIdsFromInputs(node, resolvedInputs);
    const scheduledFor = autoPostScheduleForNode(node, resolvedInputs);
    const config = objectValue(node.config);
    const inputs = resolvedInputs.inputs ?? {};
    let packageArtifactIds = postPackageArtifactIdsFromInputs(resolvedInputs);
    let sourceArtifactIds: Id<"artifacts">[] = [];

    if (!packageArtifactIds.length) {
      sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
        "slideshow",
        "media",
        "video",
        "image",
        "audio",
        "input",
        "slide_spec",
      ]);
      const sourceArtifacts = await artifactsForIds(ctx, sourceArtifactIds);
      const packageData = postPackageDataForNode({
        node,
        resolvedInputs,
        sourceArtifactIds,
        sourceArtifacts,
      });
      const packageArtifactId = await ctx.runMutation(
        internal.workflows.runner.createPostPackageArtifact,
        {
          userId: context.run.userId,
          workflowId: context.workflow._id,
          workflowRunId: context.run._id,
          nodeId: node.id,
          label: node.label,
          sourceArtifactIds,
          packageData,
        }
      );
      packageArtifactIds = [packageArtifactId];
      emittedArtifactIds.add(packageArtifactId);
    }

    const packageArtifacts = await artifactsForIds(ctx, packageArtifactIds);
    const packageArtifact = packageArtifacts[0];
    if (!packageArtifact) {
      throw new Error(`${node.label} needs a post package input.`);
    }

    const captionFromInputNode = config.captionFromInputNode === true;
    const caption =
      (captionFromInputNode && inputs.caption?.source === "config"
        ? undefined
        : stringFromValue(inputs.caption?.value)) ??
      (captionFromInputNode ? undefined : stringFromValue(config.caption)) ??
      captionFromPackageArtifact(packageArtifact);
    const distributionArtifactIds = packageMediaArtifactIdsFromData(packageArtifact);
    const timezone =
      stringFromValue(inputs.timezone?.value) ??
      stringFromValue(config.timezone);
    const distributionPlanId = await ctx.runMutation(
      internal.publishing.distributionPlans.createFromRunner,
      {
        userId: context.run.userId,
        workflowId: context.workflow._id,
        workflowRunId: context.run._id,
        artifactIds: distributionArtifactIds,
        socialAccountIds,
        provider: providerName,
        status: "draft",
        ...(scheduledFor ? { scheduledFor } : {}),
        ...(timezone ? { timezone } : {}),
        ...(caption ? { caption } : {}),
        providerPayload: {
          source: "workflow_auto_post",
          nodeId: node.id,
          packageArtifactId: packageArtifact._id,
          packageData: packageArtifact.data,
        },
      }
    );

    let publishStatus = "draft";
    let externalPostIds: string[] | undefined;
    let publishedAt: number | undefined;
    let providerPayload: unknown;

    try {
      if (shouldSendToProvider) {
        if (socialAccountIds.length === 0 && providerName !== "manual") {
          throw new Error(`${node.label} needs at least one target social account to auto-post with ${providerName}.`);
        }
        if (publishIntent === "schedule" && !scheduledFor) {
          throw new Error(`${node.label} needs a scheduled time before sending a scheduled post.`);
        }

        const provider = getPublishingProvider(providerName);
        await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
          id: distributionPlanId,
          userId: context.run.userId,
          status: "publishing",
        });
        const publishContext = await ctx.runQuery(
          internal.publishing.distributionPlans.getPublishContext,
          {
            id: distributionPlanId,
            userId: context.run.userId,
          }
        );
        if (!publishContext) {
          throw new Error("Distribution plan not found for auto-post.");
        }

        const publishInput = await loadPublishInput(provider, publishContext);
        const result = publishIntent === "draft"
          ? await provider.createDraft(publishInput)
          : publishIntent === "schedule"
          ? await provider.schedulePost(publishInput)
          : await provider.publishNow(publishInput);
        publishStatus = mapProviderStatus(result.status);
        externalPostIds = result.externalPostIds;
        publishedAt = result.publishedAt;
        providerPayload = result.providerPayload;

        await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
          id: distributionPlanId,
          userId: context.run.userId,
          status: publishStatus as "draft" | "scheduled" | "publishing" | "published" | "failed" | "canceled",
          externalPostIds,
          publishedAt,
          providerPayload,
        });
        await ctx.runMutation(internal.workflows.runs.recordEvent, {
          userId: context.run.userId,
          workflowRunId: context.run._id,
          workflowId: context.workflow._id,
          type: publishIntent === "publish" ? "publish_completed" : "publish_requested",
          nodeId: node.id,
          message: publishIntent === "draft"
            ? `${node.label} sent a draft through ${provider.displayName}.`
            : publishIntent === "schedule"
            ? `${node.label} scheduled a post through ${provider.displayName}.`
            : `${node.label} published a post through ${provider.displayName}.`,
          data: {
            distributionPlanId,
            provider: providerName,
            status: publishStatus,
            externalPostIds,
            publishedAt,
            providerPayload,
          },
        });
      }

      await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
        artifactId: packageArtifact._id,
        userId: context.run.userId,
        data: autoPostPackageData({
          packageArtifact,
          distributionPlanId,
          provider: providerName,
          status: publishStatus,
          autoPublish,
          publishIntent,
          externalPostIds,
          publishedAt,
          scheduledFor,
          providerPayload,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auto-post failed";
      publishStatus = "failed";
      await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
        id: distributionPlanId,
        userId: context.run.userId,
        status: "failed",
        errorMessage: message,
      });
      await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
        artifactId: packageArtifact._id,
        userId: context.run.userId,
        data: autoPostPackageData({
          packageArtifact,
          distributionPlanId,
          provider: providerName,
          status: "failed",
          autoPublish,
          publishIntent,
          scheduledFor,
          errorMessage: message,
        }),
      });
      throw error;
    }

    finalPackageArtifactIds.add(packageArtifact._id);
    emittedArtifactIds.add(packageArtifact._id);

    const outputRefs = autoPostOutputRefsForNode({
      nodeId: node.id,
      packageArtifactId: packageArtifact._id,
      distributionPlanId,
      provider: providerName,
      status: publishStatus,
      autoPublish,
      publishIntent,
      externalPostIds,
    });

    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
      runId: context.run._id,
      nodeId: node.id,
      status: "succeeded",
      outputRefs,
      costUsd: 0,
    });
    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      nodeId: node.id,
      message: autoPublish
        ? `${node.label} completed with publishing status ${publishStatus}.`
        : `${node.label} created a draft distribution plan.`,
      data: {
        nodeType: node.type,
        provider: providerName,
        autoPublish,
        publishIntent,
        status: publishStatus,
        distributionPlanId,
        packageArtifactId: packageArtifact._id,
        targetAccountCount: socialAccountIds.length,
        scheduledFor,
        outputPorts: outputRefs.map((outputRef) => outputRef.port),
        placeholderExecution: false,
      },
    });
  return {
    costUsd: 0,
    emittedArtifactIds: [...emittedArtifactIds],
    finalPackageArtifactIds: [...finalPackageArtifactIds],
  };
  }



  return null;
}
