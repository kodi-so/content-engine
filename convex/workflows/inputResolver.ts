import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { nodeInputBindingValidator, workflowGraphValidator } from "../validators";

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
    const sourceNodeState = nodeStatesById.get(edge.sourceNodeId);
    const matchingOutputRefs = (sourceNodeState?.outputRefs ?? []).filter(
      (outputRef) => outputRef.port === edge.sourcePort
    );

    for (const outputRef of matchingOutputRefs) {
      addPortInput(inputs, edge.targetPort, {
        source: "node_output",
        value: outputRef.value,
        artifactIds: outputRef.artifactIds?.map((artifactId) => String(artifactId)),
        metadata: {
          sourceNodeId: edge.sourceNodeId,
          sourcePort: edge.sourcePort,
          targetPort: edge.targetPort,
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
    const asset = await ctx.db.get(binding.assetId as Id<"brandAssets">);
    if (!asset || asset.userId !== userId) {
      throw new Error("Bound media asset not found");
    }

    return {
      source: "media_asset",
      value: {
        assetId: asset._id,
        name: asset.name,
        type: asset.type,
        storageUrl: asset.storageUrl,
        description: asset.description,
        metadata: asset.metadata,
      },
    };
  }

  const personaAsset = await ctx.db.get(binding.personaId as Id<"brandAssets">);
  if (!personaAsset || personaAsset.userId !== userId) {
    throw new Error("Bound persona asset not found");
  }

  return {
    source: "persona",
    value: {
      personaId: personaAsset._id,
      assetKey: binding.assetKey,
      name: personaAsset.name,
      type: personaAsset.type,
      storageUrl: personaAsset.storageUrl,
      description: personaAsset.description,
      metadata: personaAsset.metadata,
    },
  };
}
