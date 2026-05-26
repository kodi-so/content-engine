import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { nodeInputBindingValidator, workflowGraphValidator } from "../validators";
import {
  getWorkflowNodeDefinition,
  isWorkflowNodeType,
} from "../../src/lib/workflowNodeCatalog";
import {
  automaticTargetPortForSource,
  WORKFLOW_CANVAS_INPUT_HANDLE_ID,
} from "../../src/lib/workflowPortMapping";

type WorkflowGraphForResolver = typeof workflowGraphValidator.type;
type WorkflowGraphNodeForResolver = WorkflowGraphForResolver["nodes"][number];
type NodeInputBindingForResolver = typeof nodeInputBindingValidator.type;

type ResolvedInputSource =
  | "config"
  | "literal"
  | "node_output"
  | "artifact"
  | "media_asset"
  | "persona";

type ResolvedInput = {
  source: ResolvedInputSource;
  value?: unknown;
  artifactIds?: string[];
  metadata?: Record<string, unknown>;
};

function pickOutputKey(value: unknown, outputKey?: string): unknown {
  if (!outputKey) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  return (value as Record<string, unknown>)[outputKey];
}

function addPortInput(
  inputs: Record<string, ResolvedInput>,
  key: string,
  input: ResolvedInput
) {
  const existingInput = inputs[key];
  if (!existingInput) {
    inputs[key] = input;
    return;
  }

  const existingValues = Array.isArray(existingInput.value)
    ? existingInput.value
    : [existingInput.value];
  inputs[key] = {
    source: "node_output",
    value: [...existingValues, input.value],
    artifactIds: [
      ...(existingInput.artifactIds ?? []),
      ...(input.artifactIds ?? []),
    ],
    metadata: {
      multiple: true,
      sources: [
        ...(Array.isArray(existingInput.metadata?.sources)
          ? existingInput.metadata.sources
          : [existingInput.metadata].filter(Boolean)),
        input.metadata,
      ].filter(Boolean),
    },
  };
}

function inputSummary(inputs: Record<string, ResolvedInput>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, input]) => [
      key,
      {
        source: input.source,
        artifactCount: input.artifactIds?.length ?? 0,
        hasValue: input.value !== undefined,
      },
    ])
  );
}

function creativeAssetValue(asset: {
  _id: Id<"creativeAssets">;
  name: string;
  assetKind: string;
  mediaType: string;
  storageUrl: string;
  description?: string;
  usageNotes?: string;
  metadata?: unknown;
}) {
  return {
    assetId: asset._id,
    name: asset.name,
    assetKind: asset.assetKind,
    mediaType: asset.mediaType,
    storageUrl: asset.storageUrl,
    description: asset.description,
    usageNotes: asset.usageNotes,
    metadata: asset.metadata,
  };
}

function isOwnedCreativeAsset(
  asset: Doc<"creativeAssets"> | null,
  userId: string
): asset is Doc<"creativeAssets"> {
  return Boolean(asset && asset.userId === userId);
}

async function personaAssetsForIds(
  ctx: QueryCtx,
  assetIds: Id<"creativeAssets">[],
  userId: string
) {
  const assets = await Promise.all(assetIds.map((assetId) => ctx.db.get(assetId)));
  return assets
    .filter((asset) => isOwnedCreativeAsset(asset, userId))
    .map((asset) => creativeAssetValue(asset));
}

function upstreamOutputRefsForNode(
  graph: WorkflowGraphForResolver,
  node: WorkflowGraphNodeForResolver,
  nodeStatesById: Map<string, { outputRefs?: Array<{
    nodeId: string;
    port: string;
    artifactIds?: string[];
    value?: unknown;
  }> }>
): Record<string, ResolvedInput> {
  const inputs: Record<string, ResolvedInput> = {};

  for (const edge of graph.edges) {
    if (edge.targetNodeId !== node.id) continue;
    if (edge.sourcePort === "run") continue;

    let targetPortId = edge.targetPort;
    if (edge.targetPort === WORKFLOW_CANVAS_INPUT_HANDLE_ID) {
      const sourceNode = graph.nodes.find((candidateNode) => candidateNode.id === edge.sourceNodeId);
      if (!sourceNode || !isWorkflowNodeType(sourceNode.type) || !isWorkflowNodeType(node.type)) {
        continue;
      }

      const sourceDefinition = getWorkflowNodeDefinition(sourceNode.type);
      const sourcePort = sourceDefinition.outputPorts.find((port) => port.id === edge.sourcePort);
      if (!sourcePort) continue;

      const targetDefinition = getWorkflowNodeDefinition(node.type);
      const targetPort = automaticTargetPortForSource(targetDefinition, sourcePort);
      if (!targetPort) continue;
      targetPortId = targetPort.id;
    }

    const sourceNodeState = nodeStatesById.get(edge.sourceNodeId);
    const matchingOutputRefs = (sourceNodeState?.outputRefs ?? []).filter(
      (outputRef) => outputRef.port === edge.sourcePort
    );

    for (const outputRef of matchingOutputRefs) {
      addPortInput(inputs, targetPortId, {
        source: "node_output",
        value: outputRef.value,
        artifactIds: outputRef.artifactIds?.map((artifactId) => String(artifactId)),
        metadata: {
          sourceNodeId: edge.sourceNodeId,
          sourcePort: edge.sourcePort,
          targetPort: targetPortId,
        },
      });
    }
  }

  return inputs;
}

export const resolveForNode = internalQuery({
  args: {
    runId: v.id("workflowRuns"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Workflow run not found");

    const workflow = await ctx.db.get(run.workflowId);
    if (!workflow) throw new Error("Workflow not found");

    const graph = workflow.graph as WorkflowGraphForResolver;
    const node = graph.nodes.find((candidateNode) => candidateNode.id === args.nodeId);
    if (!node) throw new Error(`Workflow node not found for ${args.nodeId}`);

    const nodeStates = await ctx.db
      .query("workflowRunNodeStates")
      .withIndex("by_run", (q) => q.eq("workflowRunId", args.runId))
      .collect();
    const nodeStatesById = new Map(
      nodeStates.map((nodeState) => [nodeState.nodeId, nodeState])
    );
    const inputs: Record<string, ResolvedInput> = {};

    for (const [key, value] of Object.entries(node.config)) {
      inputs[key] = {
        source: "config",
        value,
      };
    }

    for (const [key, input] of Object.entries(
      upstreamOutputRefsForNode(graph, node, nodeStatesById)
    )) {
      inputs[key] = input;
    }

    for (const [key, binding] of Object.entries(node.inputBindings ?? {})) {
      const resolvedInput = await resolveBinding(ctx, run.userId, binding, nodeStatesById);
      inputs[key] = resolvedInput;
    }

    return {
      nodeId: node.id,
      nodeType: node.type,
      inputs,
      summary: inputSummary(inputs),
    };
  },
});

async function resolveBinding(
  ctx: QueryCtx,
  userId: string,
  binding: NodeInputBindingForResolver,
  nodeStatesById: Map<string, { outputRefs?: Array<{
    nodeId: string;
    port: string;
    artifactIds?: string[];
    value?: unknown;
  }> }>
): Promise<ResolvedInput> {
  if (binding.type === "literal") {
    return {
      source: "literal",
      value: binding.value,
    };
  }

  if (binding.type === "node_output") {
    const sourceNodeState = nodeStatesById.get(binding.sourceNodeId);
    const matchingOutputRefs = (sourceNodeState?.outputRefs ?? []).filter(
      (outputRef) => outputRef.port === binding.sourcePort
    );
    const values = matchingOutputRefs.map((outputRef) =>
      pickOutputKey(outputRef.value, binding.outputKey)
    );

    return {
      source: "node_output",
      value: values.length === 1 ? values[0] : values,
      artifactIds: matchingOutputRefs.flatMap((outputRef) =>
        (outputRef.artifactIds ?? []).map((artifactId) => String(artifactId))
      ),
      metadata: {
        sourceNodeId: binding.sourceNodeId,
        sourcePort: binding.sourcePort,
        outputKey: binding.outputKey,
      },
    };
  }

  if (binding.type === "artifact") {
    const artifact = await ctx.db.get(binding.artifactId as Id<"artifacts">);
    if (!artifact || artifact.userId !== userId) {
      throw new Error("Bound artifact not found");
    }

    return {
      source: "artifact",
      value: {
        artifactId: artifact._id,
        type: artifact.type,
        title: artifact.title,
        storageUrl: artifact.storageUrl,
        data: artifact.data,
      },
      artifactIds: [String(artifact._id)],
    };
  }

  if (binding.type === "media_asset") {
    const asset = await ctx.db.get(binding.assetId as Id<"creativeAssets">);
    if (!asset || asset.userId !== userId) {
      throw new Error("Bound media asset not found");
    }

    return {
      source: "media_asset",
      value: creativeAssetValue(asset),
    };
  }

  const persona = await ctx.db.get(binding.personaId as Id<"personas">);
  if (!persona || persona.userId !== userId) {
    throw new Error("Bound persona not found");
  }
  const sourceAssets = await personaAssetsForIds(ctx, persona.sourceAssetIds, userId);
  const generatedAssets = await personaAssetsForIds(ctx, persona.generatedAssetIds, userId);
  const voiceAssets = await personaAssetsForIds(ctx, persona.voiceAssetIds, userId);

  return {
    source: "persona",
    value: {
      personaId: persona._id,
      assetKey: binding.assetKey,
      name: persona.name,
      personaType: persona.personaType,
      description: persona.description,
      identityPrompt: persona.identityPrompt,
      visualConstraints: persona.visualConstraints,
      usageNotes: persona.usageNotes,
      sourceAssets,
      generatedAssets,
      voiceAssets,
      assets: [...sourceAssets, ...generatedAssets, ...voiceAssets],
      metadata: persona.metadata,
    },
  };
}
