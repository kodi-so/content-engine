import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { artifactLifecycleValidator } from "../validators";
import {
  dependencyNodeIdsForGraph,
  outboundPortsForNode,
  readyNodesForPass,
  runnableNodeIdsForGraph,
} from "./runtime/graphExecution";
import {
  isAiAgentNode,
  isImplementedNode,
  isLlmNode,
  isMediaNode,
  isTerminalPackageConsumer,
  placeholderLifecycleForNode,
} from "./runtime/nodeRuntime";
import type { MediaNodeItemForRun } from "./runtime/outputRefs";
import {
  postPackageArtifactIdsFromInputs,
  postPackageDataForNode,
  postPackageDataForWorkflowFallback,
} from "./runtime/publishPackaging";
import { artifactIdsFromInputs, artifactsForIds } from "./runtime/artifactInputs";
import { executeGenerationNode } from "./handlers/generationNodeHandlers";
import { executeMediaNode } from "./handlers/mediaNodeHandlers";
import { executePublishingNode } from "./handlers/publishingNodeHandlers";
import { executeSlideshowNode } from "./handlers/slideshowNodeHandlers";
import { executeAiAgentNode, executeLlmNode } from "./handlers/textNodeHandlers";
import { resolveMediaNodeItemsForRun } from "./runtime/mediaNodeItems";

export const executeRun = internalAction({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.workflows.runs.getExecutionContext, {
      runId: args.runId,
    });
    if (!context) {
      throw new Error("Workflow run context not found");
    }

    const graph = context.workflow.graph;
    const runnableNodeIds = runnableNodeIdsForGraph(graph);
    const runnableNodes = graph.nodes.filter((node) => runnableNodeIds.has(node.id));
    const dependencyNodeIdsByNode = dependencyNodeIdsForGraph(graph);
    const pendingNodeIds = new Set(runnableNodes.map((node) => node.id));
    const completedNodeIds = new Set<string>();
    const emittedArtifactIds = new Set<Id<"artifacts">>();
    const finalPackageArtifactIds = new Set<Id<"artifacts">>();
    let executedNodeCount = 0;
    let passCount = 0;
    let totalCostUsd = 0;

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "running",
      ...(runnableNodes[0] ? { currentNodeId: runnableNodes[0].id } : {}),
    });

    if (!runnableNodes.length) {
      const message = "Workflow graph has no nodes reachable from the runner.";
      await ctx.runMutation(internal.workflows.runs.recordEvent, {
        userId: context.run.userId,
        workflowRunId: context.run._id,
        workflowId: context.workflow._id,
        type: "error",
        message,
      });
      await ctx.runMutation(internal.workflows.runs.transitionRun, {
        runId: context.run._id,
        status: "failed",
        errorMessage: message,
        completedAt: Date.now(),
      });
      return;
    }

    while (pendingNodeIds.size) {
      passCount += 1;
      const readyNodes = readyNodesForPass(
        runnableNodes,
        dependencyNodeIdsByNode,
        pendingNodeIds,
        completedNodeIds
      );

      if (!readyNodes.length) {
        const message =
          "Workflow graph executor could not find a runnable node. Check for invalid dependencies.";
        await ctx.runMutation(internal.workflows.runs.recordEvent, {
          userId: context.run.userId,
          workflowRunId: context.run._id,
          workflowId: context.workflow._id,
          type: "error",
          message,
          data: {
            pendingNodeIds: [...pendingNodeIds].sort(),
            completedNodeIds: [...completedNodeIds].sort(),
          },
        });
        await ctx.runMutation(internal.workflows.runs.transitionRun, {
          runId: context.run._id,
          status: "failed",
          errorMessage: message,
          completedAt: Date.now(),
        });
        return;
      }

      for (const node of readyNodes) {
        await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
          runId: context.run._id,
          nodeId: node.id,
          status: "queued",
        });
      }

      for (const node of readyNodes) {
        try {
          const resolvedInputs = await ctx.runQuery(
            internal.workflows.inputResolver.resolveForNode,
            {
              runId: context.run._id,
              nodeId: node.id,
            }
          );

          await ctx.runMutation(internal.workflows.runs.transitionRun, {
            runId: context.run._id,
            status: "running",
            currentNodeId: node.id,
          });
          await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
            runId: context.run._id,
            nodeId: node.id,
            status: "running",
          });
          await ctx.runMutation(internal.workflows.runs.recordEvent, {
            userId: context.run.userId,
            workflowRunId: context.run._id,
            workflowId: context.workflow._id,
            type: "node_started",
            nodeId: node.id,
            message: `${node.label} started.`,
            data: {
              nodeType: node.type,
              inputSummary: resolvedInputs.summary,
              placeholderExecution: !isImplementedNode(node),
            },
          });

          if (isMediaNode(node)) {
            const result = await executeMediaNode({
              ctx,
              context,
              graph,
              node,
              resolvedInputs,
            });
            totalCostUsd += result.costUsd;
            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isLlmNode(node)) {
            const result = await executeLlmNode({
              ctx,
              context,
              graph,
              node,
              resolvedInputs,
            });
            for (const artifactId of result.emittedArtifactIds ?? []) emittedArtifactIds.add(artifactId);
            totalCostUsd += result.costUsd;
            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isAiAgentNode(node)) {
            const result = await executeAiAgentNode({
              ctx,
              context,
              graph,
              node,
              resolvedInputs,
            });
            for (const artifactId of result.emittedArtifactIds ?? []) emittedArtifactIds.add(artifactId);
            totalCostUsd += result.costUsd;
            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          const generationResult = await executeGenerationNode({
            ctx,
            context,
            graph,
            node,
            resolvedInputs,
          });
          if (generationResult) {
            for (const artifactId of generationResult.emittedArtifactIds ?? []) emittedArtifactIds.add(artifactId);
            totalCostUsd += generationResult.costUsd;
            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          const slideshowResult = await executeSlideshowNode({
            ctx,
            context,
            graph,
            node,
            resolvedInputs,
          });
          if (slideshowResult) {
            for (const artifactId of slideshowResult.emittedArtifactIds ?? []) emittedArtifactIds.add(artifactId);
            totalCostUsd += slideshowResult.costUsd;
            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          const publishingResult = await executePublishingNode({
            ctx,
            context,
            graph,
            node,
            resolvedInputs,
          });
          if (publishingResult) {
            for (const artifactId of publishingResult.emittedArtifactIds ?? []) emittedArtifactIds.add(artifactId);
            for (const artifactId of publishingResult.finalPackageArtifactIds ?? []) finalPackageArtifactIds.add(artifactId);
            totalCostUsd += publishingResult.costUsd;
            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          const outboundPorts = outboundPortsForNode(graph, node.id);
          const packageArtifactIds = postPackageArtifactIdsFromInputs(resolvedInputs);
          const shouldCreatePostPackage =
            isTerminalPackageConsumer(node) && packageArtifactIds.length === 0;
          const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
            "slideshow",
            "slide_spec",
            "media",
            "video",
            "image",
            "audio",
            "input",
          ]);
          const packageData = shouldCreatePostPackage
            ? postPackageDataForNode({
                node,
                resolvedInputs,
                sourceArtifactIds,
                sourceArtifacts: await artifactsForIds(ctx, sourceArtifactIds),
              })
            : undefined;
          const createdPostPackageArtifactId = shouldCreatePostPackage
            ? await ctx.runMutation(internal.workflows.runner.createPostPackageArtifact, {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                nodeId: node.id,
                label: node.label,
                sourceArtifactIds,
                packageData: packageData!,
              })
            : undefined;
          const consumedOrCreatedPackageIds = [
            ...packageArtifactIds,
            ...(createdPostPackageArtifactId ? [createdPostPackageArtifactId] : []),
          ];
          for (const artifactId of consumedOrCreatedPackageIds) {
            finalPackageArtifactIds.add(artifactId);
            emittedArtifactIds.add(artifactId);
          }
          const outputRefs = outboundPorts.map((port) => ({
            nodeId: node.id,
            port,
            value: {
              placeholderExecution: !createdPostPackageArtifactId,
              nodeId: node.id,
              nodeType: node.type,
              label: node.label,
              ...(createdPostPackageArtifactId
                ? {
                    kind: "post_package",
                    artifactId: createdPostPackageArtifactId,
                    postType: packageData!.postType,
                    name: packageData!.name,
                    caption: packageData!.caption,
                    mediaArtifactIds: packageData!.mediaArtifactIds,
                    mediaSummary: packageData!.mediaSummary,
                    primaryPlatformPreset: packageData!.primaryPlatformPreset,
                    platformPackages: packageData!.platformPackages,
                  }
                : {}),
              inputSummary: resolvedInputs.summary,
            },
          }));
          const lifecycle = placeholderLifecycleForNode(graph, node);
          const placeholderArtifactId = createdPostPackageArtifactId
            ? undefined
            : await ctx.runMutation(
                internal.workflows.runner.createPlaceholderArtifact,
                {
                  userId: context.run.userId,
                  brandId: context.run.brandId,
                  workflowId: context.workflow._id,
                  workflowRunId: context.run._id,
                  nodeId: node.id,
                  nodeType: node.type,
                  label: node.label,
                  lifecycle,
                  inputSummary: resolvedInputs.summary,
                  outputPorts: outputRefs.map((outputRef) => outputRef.port),
                }
              );
          if (placeholderArtifactId) emittedArtifactIds.add(placeholderArtifactId);
          const outputRefsWithArtifact = outputRefs.map((outputRef) => ({
            ...outputRef,
            ...(outputRef.port === "post_package"
              ? { artifactIds: consumedOrCreatedPackageIds }
              : createdPostPackageArtifactId
                ? { artifactIds: consumedOrCreatedPackageIds }
                : placeholderArtifactId
                  ? { artifactIds: [placeholderArtifactId] }
                  : {}),
          }));

          await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
            runId: context.run._id,
            nodeId: node.id,
            status: "succeeded",
            ...(outputRefsWithArtifact.length ? { outputRefs: outputRefsWithArtifact } : {}),
            costUsd: 0,
          });
          await ctx.runMutation(internal.workflows.runs.recordEvent, {
            userId: context.run.userId,
            workflowRunId: context.run._id,
            workflowId: context.workflow._id,
            type: "node_completed",
            nodeId: node.id,
            message: `${node.label} completed with placeholder execution.`,
            data: {
              nodeType: node.type,
              lifecycle: createdPostPackageArtifactId ? "saved" : lifecycle,
              artifactId: createdPostPackageArtifactId ?? placeholderArtifactId,
              packageArtifactIds: consumedOrCreatedPackageIds,
              outputPorts: outputRefsWithArtifact.map((outputRef) => outputRef.port),
              placeholderExecution: !createdPostPackageArtifactId,
            },
          });

          pendingNodeIds.delete(node.id);
          completedNodeIds.add(node.id);
          executedNodeCount += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : `${node.label} failed during execution.`;
          await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
            runId: context.run._id,
            nodeId: node.id,
            status: "failed",
            errorMessage: message,
          });
          await ctx.runMutation(internal.workflows.runs.recordEvent, {
            userId: context.run.userId,
            workflowRunId: context.run._id,
            workflowId: context.workflow._id,
            type: "error",
            nodeId: node.id,
            message,
          });
          await ctx.runMutation(internal.workflows.runs.transitionRun, {
            runId: context.run._id,
            status: "failed",
            errorNodeId: node.id,
            errorMessage: message,
            completedAt: Date.now(),
          });
          return;
        }
      }
    }

    if (!finalPackageArtifactIds.size) {
      const fallbackSourceArtifactIds = [...emittedArtifactIds];
      const fallbackSourceArtifacts = await artifactsForIds(ctx, fallbackSourceArtifactIds);
      const fallbackPackageArtifactId = await ctx.runMutation(
        internal.workflows.runner.createPostPackageArtifact,
        {
          userId: context.run.userId,
          brandId: context.run.brandId,
          workflowId: context.workflow._id,
          workflowRunId: context.run._id,
          nodeId: "workflow",
          label: context.workflow.name,
          sourceArtifactIds: fallbackSourceArtifactIds,
          packageData: postPackageDataForWorkflowFallback({
            workflowName: context.workflow.name,
            sourceArtifactIds: fallbackSourceArtifactIds,
            sourceArtifacts: fallbackSourceArtifacts,
          }),
        }
      );
      finalPackageArtifactIds.add(fallbackPackageArtifactId);
      await ctx.runMutation(internal.workflows.runs.recordEvent, {
        userId: context.run.userId,
        workflowRunId: context.run._id,
        workflowId: context.workflow._id,
        type: "artifact_created",
        message: "Workflow fallback post package created.",
        data: {
          artifactId: fallbackPackageArtifactId,
        },
      });
    }

    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      message: "Workflow graph completed execution.",
      data: {
        executedNodeCount,
        finalPackageArtifactIds: [...finalPackageArtifactIds],
        passCount,
        costUsd: totalCostUsd,
        skippedNonRunnableNodeIds: graph.nodes
          .filter((node) => !runnableNodeIds.has(node.id))
          .map((node) => node.id),
      },
    });

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "completed",
      summary: `Executed ${executedNodeCount} workflow nodes.`,
      costUsd: totalCostUsd,
      completedAt: Date.now(),
    });
  },
});

export const createPlaceholderArtifact = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    workflowId: v.id("workflows"),
    workflowRunId: v.id("workflowRuns"),
    nodeId: v.string(),
    nodeType: v.string(),
    label: v.string(),
    lifecycle: artifactLifecycleValidator,
    inputSummary: v.any(),
    outputPorts: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("artifacts", {
      userId: args.userId,
      brandId: args.brandId,
      workflowId: args.workflowId,
      workflowRunId: args.workflowRunId,
      type: "text_draft",
      title: `${args.label} placeholder output`,
      data: {
        placeholderExecution: true,
        nodeId: args.nodeId,
        nodeType: args.nodeType,
        inputSummary: args.inputSummary,
        outputPorts: args.outputPorts,
      },
      lifecycle: args.lifecycle,
      reviewStatus: "not_required",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const resolveMediaNodeItems = internalQuery({
  args: {
    runId: v.id("workflowRuns"),
    nodeId: v.string(),
  },
  handler: async (ctx, args): Promise<MediaNodeItemForRun[]> => {
    return await resolveMediaNodeItemsForRun(ctx, args);
  },
});

export const createPostPackageArtifact = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    workflowId: v.id("workflows"),
    workflowRunId: v.id("workflowRuns"),
    nodeId: v.string(),
    label: v.string(),
    sourceArtifactIds: v.array(v.id("artifacts")),
    packageData: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("artifacts", {
      userId: args.userId,
      brandId: args.brandId,
      workflowId: args.workflowId,
      workflowRunId: args.workflowRunId,
      parentArtifactIds: args.sourceArtifactIds.length ? args.sourceArtifactIds : undefined,
      type: "publish_payload",
      title: `${args.label} post package`,
      data: args.packageData,
      lifecycle: "saved",
      reviewStatus: "not_required",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
