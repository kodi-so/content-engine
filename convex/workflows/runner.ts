import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { artifactLifecycleValidator, workflowGraphValidator } from "../validators";

type WorkflowGraphForRun = typeof workflowGraphValidator.type;
type WorkflowGraphNodeForRun = WorkflowGraphForRun["nodes"][number];
type ArtifactLifecycleForRun = typeof artifactLifecycleValidator.type;
type NodeRetentionModeForRun = "inherit" | "keep" | "discard" | "keep_on_failure";
type ResolvedInputsForRun = {
  inputs?: Record<string, {
    source?: string;
    value?: unknown;
    artifactIds?: string[];
    metadata?: Record<string, unknown>;
  }>;
  summary?: Record<string, unknown>;
};
type MediaKindForRun = "image" | "video" | "audio" | "media";

type MediaNodeItemForRun = {
  id: string;
  source: "artifact" | "brand_asset" | "persona_asset" | "uploaded";
  kind: MediaKindForRun;
  title?: string;
  storageUrl?: string;
  data?: unknown;
  metadata?: unknown;
};

function adjacencyForGraph(graph: WorkflowGraphForRun): Map<string, string[]> {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  return adjacency;
}

function reachableNodeIdsFromRunner(graph: WorkflowGraphForRun): Set<string> {
  const runnerNode = graph.nodes.find((node) => node.type === "runner") ?? graph.nodes[0];
  if (!runnerNode) return new Set();

  const adjacency = adjacencyForGraph(graph);
  const reachableNodeIds = new Set<string>();
  const stack = [runnerNode.id];

  while (stack.length) {
    const nodeId = stack.pop();
    if (!nodeId || reachableNodeIds.has(nodeId)) continue;

    reachableNodeIds.add(nodeId);
    stack.push(...(adjacency.get(nodeId) ?? []));
  }

  return reachableNodeIds;
}

function dependencyNodeIdsForGraph(graph: WorkflowGraphForRun): Map<string, string[]> {
  const dependenciesByNodeId = new Map(
    graph.nodes.map((node) => [node.id, new Set<string>()])
  );

  for (const edge of graph.edges) {
    const dependencies = dependenciesByNodeId.get(edge.targetNodeId);
    if (dependencies) dependencies.add(edge.sourceNodeId);
  }

  return new Map(
    [...dependenciesByNodeId.entries()].map(([nodeId, dependencies]) => [
      nodeId,
      [...dependencies].sort(),
    ])
  );
}

function readyNodesForPass(
  nodes: WorkflowGraphNodeForRun[],
  dependencyNodeIdsByNode: Map<string, string[]>,
  pendingNodeIds: Set<string>,
  completedNodeIds: Set<string>
): WorkflowGraphNodeForRun[] {
  return nodes.filter((node) => {
    if (!pendingNodeIds.has(node.id)) return false;
    const dependencyNodeIds = dependencyNodeIdsByNode.get(node.id) ?? [];
    return dependencyNodeIds.every((nodeId) => completedNodeIds.has(nodeId));
  });
}

function outboundPortsForNode(
  graph: WorkflowGraphForRun,
  nodeId: string
): string[] {
  return [
    ...new Set(
      graph.edges
        .filter((edge) => edge.sourceNodeId === nodeId)
        .map((edge) => edge.sourcePort)
    ),
  ].sort();
}

function mediaNodeOutputPorts(): string[] {
  return ["media", "image", "video", "audio"];
}

function retentionModeForNode(node: WorkflowGraphNodeForRun): NodeRetentionModeForRun {
  const retention = node.retention;
  if (!retention || typeof retention !== "object" || Array.isArray(retention)) return "inherit";
  const mode = (retention as Record<string, unknown>).mode;

  if (
    mode === "inherit" ||
    mode === "keep" ||
    mode === "discard" ||
    mode === "keep_on_failure"
  ) {
    return mode;
  }

  return "inherit";
}

function placeholderLifecycleForNode(
  graph: WorkflowGraphForRun,
  node: WorkflowGraphNodeForRun
): ArtifactLifecycleForRun {
  const retentionMode = retentionModeForNode(node);
  const runMode = graph.runSettings?.mode ?? "production";
  const graphRetention = graph.runSettings?.artifactRetention;

  if (retentionMode === "keep") return "saved";
  if (retentionMode === "discard") return "discarded";
  if (retentionMode === "keep_on_failure") return "discarded";
  if (runMode === "test" || graphRetention === "keep_all") return "debug";
  return "discarded";
}

function isPostPackageNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "post_compiler";
}

function isTerminalPackageConsumer(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "export" || node.type === "auto_post";
}

function isMediaNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "media";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringFromValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const data = value as Record<string, unknown>;
  for (const key of ["caption", "text", "content", "prompt"]) {
    const candidate = data[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return undefined;
}

function artifactIdsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): Id<"artifacts">[] {
  const ids = new Set<string>();
  const inputs = resolvedInputs.inputs ?? {};
  const orderedInputs = [
    ...preferredKeys.flatMap((key) => (inputs[key] ? [[key, inputs[key]] as const] : [])),
    ...Object.entries(inputs).filter(([key]) => !preferredKeys.includes(key)),
  ];

  for (const [, input] of orderedInputs) {
    for (const artifactId of input.artifactIds ?? []) {
      ids.add(artifactId);
    }
  }

  return [...ids] as Id<"artifacts">[];
}

function postPackageArtifactIdsFromInputs(
  resolvedInputs: ResolvedInputsForRun
): Id<"artifacts">[] {
  const inputs = resolvedInputs.inputs ?? {};
  const ids = new Set<string>();
  if (inputs.post_package) {
    for (const artifactId of inputs.post_package.artifactIds ?? []) {
      ids.add(artifactId);
    }
  }

  for (const input of [inputs.post_package, inputs.input].filter(Boolean)) {
    const value = objectValue(input?.value);
    if (value.type === "publish_payload" && typeof value.artifactId === "string") {
      ids.add(value.artifactId);
    }
  }

  return [...ids] as Id<"artifacts">[];
}

function postPackageDataForNode(
  node: WorkflowGraphNodeForRun,
  resolvedInputs: ResolvedInputsForRun,
  sourceArtifactIds: Id<"artifacts">[]
) {
  const inputs = resolvedInputs.inputs ?? {};
  const config = objectValue(node.config);
  const metadataInput = objectValue(inputs.metadata?.value);
  const platformSettings = objectValue(config.platformSettings);
  const destinationPolicy = objectValue(config.destinationPolicy);
  const configuredCaption = stringFromValue(config.caption);
  const inputCaption =
    stringFromValue(inputs.caption?.value) ??
    stringFromValue(inputs.text?.value) ??
    stringFromValue(inputs.input?.value);
  const postType =
    typeof config.postType === "string" && config.postType.trim()
      ? config.postType.trim()
      : "video";

  return {
    schemaVersion: 1,
    kind: "post_package",
    postType,
    name:
      typeof config.name === "string" && config.name.trim()
        ? config.name.trim()
        : `${node.label} package`,
    caption: configuredCaption ?? inputCaption,
    mediaArtifactIds: sourceArtifactIds.map((artifactId) => String(artifactId)),
    platformSettings,
    destinationPolicy: {
      destination:
        typeof config.destination === "string" && config.destination.trim()
          ? config.destination.trim()
          : undefined,
      ...destinationPolicy,
    },
    metadata: {
      ...metadataInput,
      sourceNodeId: node.id,
      sourceNodeType: node.type,
      inputSummary: resolvedInputs.summary ?? {},
    },
  };
}

function mediaOutputRefsForNode(
  nodeId: string,
  items: MediaNodeItemForRun[]
) {
  return mediaNodeOutputPorts().flatMap((port) => {
    const matchingItems =
      port === "media"
        ? items
        : items.filter((item) => item.kind === port);
    if (!matchingItems.length) return [];

    const artifactIds = matchingItems
      .filter((item) => item.source === "artifact")
      .map((item) => item.id as Id<"artifacts">);

    return [{
      nodeId,
      port,
      ...(artifactIds.length ? { artifactIds } : {}),
      value: {
        kind: port,
        items: matchingItems,
        count: matchingItems.length,
      },
    }];
  });
}

function stringArrayFromConfig(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function mediaKindFromMimeType(mimeType?: string): MediaKindForRun {
  if (!mimeType) return "media";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "media";
}

function mediaKindFromArtifact(artifact: {
  type: string;
  data?: unknown;
}): MediaKindForRun {
  const data = objectValue(artifact.data);
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : undefined;
  const mimeKind = mediaKindFromMimeType(mimeType);
  if (mimeKind !== "media") return mimeKind;

  if (artifact.type === "image" || artifact.type === "thumbnail") return "image";
  if (artifact.type === "video") return "video";
  return "media";
}

function uploadedMediaItemsFromConfig(value: unknown): MediaNodeItemForRun[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index): MediaNodeItemForRun[] => {
    if (typeof item === "string" && item.trim()) {
      return [{
        id: `uploaded:${index}`,
        source: "uploaded",
        kind: "media",
        storageUrl: item.trim(),
      } satisfies MediaNodeItemForRun];
    }

    const record = objectValue(item);
    const storageUrl = record.storageUrl ?? record.url;
    if (typeof storageUrl !== "string" || !storageUrl.trim()) return [];
    const mimeType = typeof record.mimeType === "string" ? record.mimeType : undefined;
    const configuredKind = record.kind;
    const kind =
      configuredKind === "image" ||
      configuredKind === "video" ||
      configuredKind === "audio" ||
      configuredKind === "media"
        ? configuredKind
        : mediaKindFromMimeType(mimeType);

    return [{
      id: typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `uploaded:${index}`,
      source: "uploaded",
      kind,
      title: typeof record.title === "string" ? record.title : undefined,
      storageUrl: storageUrl.trim(),
      metadata: record,
    } satisfies MediaNodeItemForRun];
  });
}

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
    const reachableNodeIds = reachableNodeIdsFromRunner(graph);
    const runnableNodes = graph.nodes.filter((node) => reachableNodeIds.has(node.id));
    const dependencyNodeIdsByNode = dependencyNodeIdsForGraph(graph);
    const pendingNodeIds = new Set(runnableNodes.map((node) => node.id));
    const completedNodeIds = new Set<string>();
    const emittedArtifactIds = new Set<Id<"artifacts">>();
    const finalPackageArtifactIds = new Set<Id<"artifacts">>();
    let executedNodeCount = 0;
    let passCount = 0;

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
              placeholderExecution: !isMediaNode(node),
            },
          });

          if (isMediaNode(node)) {
            const mediaItems = await ctx.runQuery(
              internal.workflows.runner.resolveMediaNodeItems,
              {
                runId: context.run._id,
                nodeId: node.id,
              }
            );
            const outputRefs = mediaOutputRefsForNode(node.id, mediaItems);

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
              message: `${node.label} exposed ${mediaItems.length} media reference${mediaItems.length === 1 ? "" : "s"}.`,
              data: {
                nodeType: node.type,
                mediaCount: mediaItems.length,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          const outboundPorts = outboundPortsForNode(graph, node.id);
          const packageArtifactIds = postPackageArtifactIdsFromInputs(resolvedInputs);
          const shouldCreatePostPackage =
            isPostPackageNode(node) ||
            (isTerminalPackageConsumer(node) && packageArtifactIds.length === 0);
          const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
            "media",
            "video",
            "image",
            "audio",
            "input",
          ]);
          const createdPostPackageArtifactId = shouldCreatePostPackage
            ? await ctx.runMutation(internal.workflows.runner.createPostPackageArtifact, {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                nodeId: node.id,
                label: node.label,
                sourceArtifactIds,
                packageData: postPackageDataForNode(node, resolvedInputs, sourceArtifactIds),
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
      const fallbackPackageArtifactId = await ctx.runMutation(
        internal.workflows.runner.createPostPackageArtifact,
        {
          userId: context.run.userId,
          brandId: context.run.brandId,
          workflowId: context.workflow._id,
          workflowRunId: context.run._id,
          nodeId: "workflow",
          label: context.workflow.name,
          sourceArtifactIds: [...emittedArtifactIds],
          packageData: {
            schemaVersion: 1,
            kind: "post_package",
            postType: context.workflow.contentFormat,
            name: `${context.workflow.name} package`,
            mediaArtifactIds: [...emittedArtifactIds].map((artifactId) => String(artifactId)),
            platformSettings: {},
            destinationPolicy: {
              destination: "media_library",
            },
            metadata: {
              sourceNodeId: "workflow",
              sourceNodeType: "workflow_fallback",
              reason: "No reachable terminal node produced a post package.",
            },
          },
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
      message: "Workflow graph completed placeholder execution.",
      data: {
        executedNodeCount,
        finalPackageArtifactIds: [...finalPackageArtifactIds],
        passCount,
        skippedUnreachableNodeIds: graph.nodes
          .filter((node) => !reachableNodeIds.has(node.id))
          .map((node) => node.id),
      },
    });

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "completed",
      summary: `Executed ${executedNodeCount} workflow nodes.`,
      costUsd: 0,
      completedAt: Date.now(),
    });
  },
});

export const createPlaceholderArtifact = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.id("brands"),
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
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Workflow run not found");

    const workflow = await ctx.db.get(run.workflowId);
    if (!workflow) throw new Error("Workflow not found");

    const node = workflow.graph.nodes.find((candidateNode) => candidateNode.id === args.nodeId);
    if (!node || node.type !== "media") throw new Error("Media node not found");

    const config = objectValue(node.config);
    const artifactIds = stringArrayFromConfig(config.artifactIds);
    const brandAssetIds = stringArrayFromConfig(config.brandAssetIds);
    const personaAssetIds = stringArrayFromConfig(config.personaAssetIds);
    const items: MediaNodeItemForRun[] = [];

    for (const artifactId of artifactIds) {
      const artifact = await ctx.db.get(artifactId as Id<"artifacts">);
      if (!artifact || artifact.userId !== run.userId) continue;

      items.push({
        id: String(artifact._id),
        source: "artifact",
        kind: mediaKindFromArtifact(artifact),
        title: artifact.title,
        storageUrl: artifact.storageUrl,
        data: artifact.data,
        metadata: {
          artifactType: artifact.type,
          reviewStatus: artifact.reviewStatus,
        },
      });
    }

    for (const assetId of brandAssetIds) {
      const asset = await ctx.db.get(assetId as Id<"brandAssets">);
      if (!asset || asset.userId !== run.userId) continue;

      items.push({
        id: String(asset._id),
        source: "brand_asset",
        kind: "image",
        title: asset.name,
        storageUrl: asset.storageUrl,
        metadata: {
          assetType: asset.type,
          description: asset.description,
          metadata: asset.metadata,
        },
      });
    }

    for (const personaId of personaAssetIds) {
      const persona = await ctx.db.get(personaId as Id<"brandAssets">);
      if (!persona || persona.userId !== run.userId) continue;

      items.push({
        id: String(persona._id),
        source: "persona_asset",
        kind: "image",
        title: persona.name,
        storageUrl: persona.storageUrl,
        metadata: {
          assetType: persona.type,
          description: persona.description,
          metadata: persona.metadata,
        },
      });
    }

    items.push(...uploadedMediaItemsFromConfig(config.uploadedMedia));

    return items;
  },
});

export const createPostPackageArtifact = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.id("brands"),
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
