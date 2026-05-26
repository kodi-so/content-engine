import type { Connection, Edge, Node } from "@xyflow/react";
import type {
  NodeRetentionPolicy,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowPort,
  WorkflowProviderName,
} from "./workflowGraph";
import {
  getWorkflowNodeDefinition,
  isWorkflowNodeType,
} from "./workflowNodeCatalog";
import {
  automaticTargetPortForSource,
  portTypesAreCompatible,
  WORKFLOW_CANVAS_INPUT_HANDLE_ID,
} from "./workflowPortMapping";
import {
  modelCategoryForNodeType,
  recommendedModelIdForNodeType,
} from "./workflowModelCatalog";

export type WorkflowCanvasNodeExecutionStatus =
  | "queued"
  | "running"
  | "failed"
  | "blocked"
  | "completed";

export type WorkflowCanvasNodeData = Record<string, unknown> & {
  config: Record<string, unknown>;
  executionStatus?: WorkflowCanvasNodeExecutionStatus;
  label: string;
  model?: string;
  provider?: WorkflowProviderName;
  retention?: NodeRetentionPolicy;
  type: WorkflowNodeType;
};

export type WorkflowFlowNode = Node<WorkflowCanvasNodeData>;

type WorkflowConnection = {
  source: string | null;
  sourceHandle?: string | null;
  target: string | null;
  targetHandle?: string | null;
};

export function toFlowNodes(graph: WorkflowGraph): WorkflowFlowNode[] {
  return graph.nodes
    .filter((node) => isWorkflowNodeType(node.type))
    .map((node) => ({
      id: node.id,
      type: "workflowNode",
      position: node.position,
      data: {
        config: cloneConfig(node.config),
        label: node.label,
        model: node.model ?? recommendedModelIdForNodeType(node.type),
        provider: node.provider ?? getWorkflowNodeDefinition(node.type).defaultProvider,
        retention: node.retention,
        type: node.type,
      },
    }));
}

export function toFlowEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    sourceHandle: edge.sourcePort,
    target: edge.targetNodeId,
    targetHandle: WORKFLOW_CANVAS_INPUT_HANDLE_ID,
    animated: false,
    deletable: true,
    type: "bezier",
  }));
}

export function cloneConfig(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

export function nextNodeId(type: WorkflowNodeType, nodes: WorkflowFlowNode[]): string {
  const baseId = type.replace(/_/g, "-");
  const usedIds = new Set(nodes.map((node) => node.id));
  let index = 1;

  while (usedIds.has(`${baseId}-${index}`)) {
    index += 1;
  }

  return `${baseId}-${index}`;
}

export function nextNodePosition(nodes: WorkflowFlowNode[]) {
  const index = Math.max(0, nodes.length - 1);

  return {
    x: 140 + (index % 3) * 300,
    y: 120 + Math.floor(index / 3) * 210,
  };
}

function sanitizeEdgeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
}

export function nextEdgeId(connection: Connection, edges: Edge[]): string {
  const baseId = [
    connection.source,
    connection.sourceHandle,
    "to",
    connection.target,
    connection.targetHandle,
  ]
    .filter(Boolean)
    .map((value) => sanitizeEdgeIdPart(String(value)))
    .join("-");
  const usedIds = new Set(edges.map((edge) => edge.id));
  let edgeId = baseId;
  let index = 2;

  while (usedIds.has(edgeId)) {
    edgeId = `${baseId}-${index}`;
    index += 1;
  }

  return edgeId;
}

function findPort(
  node: WorkflowFlowNode,
  handleId: string,
  direction: "input" | "output"
): WorkflowPort | null {
  const definition = getWorkflowNodeDefinition(node.data.type);
  const ports = direction === "input" ? definition.inputPorts : definition.outputPorts;

  return ports.find((port) => port.id === handleId) ?? null;
}

function wouldCreateCycle(
  connection: WorkflowConnection,
  edges: Edge[]
): boolean {
  if (!connection.source || !connection.target) return false;
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  }

  const sourceTargets = adjacency.get(connection.source) ?? [];
  sourceTargets.push(connection.target);
  adjacency.set(connection.source, sourceTargets);

  const stack = [connection.target];
  const visited = new Set<string>();

  while (stack.length) {
    const nodeId = stack.pop();
    if (!nodeId || visited.has(nodeId)) continue;
    if (nodeId === connection.source) return true;

    visited.add(nodeId);
    stack.push(...(adjacency.get(nodeId) ?? []));
  }

  return false;
}

export function validateCanvasConnection(
  connection: WorkflowConnection,
  nodes: WorkflowFlowNode[],
  edges: Edge[]
): string | null {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
    return "Connection must start and end on a named port.";
  }
  if (connection.source === connection.target) {
    return "A node cannot connect to itself.";
  }
  if (edges.some((edge) =>
    edge.source === connection.source &&
    edge.target === connection.target &&
    edge.sourceHandle === connection.sourceHandle &&
    edge.targetHandle === connection.targetHandle
  )) {
    return "That port connection already exists.";
  }

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) return "Connection references a missing node.";

  const sourcePort = findPort(sourceNode, connection.sourceHandle, "output");
  if (!sourcePort) return "Connection references an unknown port.";
  const isRunnerControlEdge = sourceNode.data.type === "runner" && sourcePort.id === "run";
  if (connection.targetHandle === WORKFLOW_CANVAS_INPUT_HANDLE_ID) {
    const targetDefinition = getWorkflowNodeDefinition(targetNode.data.type);
    const targetPort = automaticTargetPortForSource(targetDefinition, sourcePort);
    if (!isRunnerControlEdge && !targetPort) {
      return `${sourcePort.label} output cannot map to ${targetNode.data.label}.`;
    }
  } else {
    const targetPort = findPort(targetNode, connection.targetHandle, "input");
    if (!targetPort) return "Connection references an unknown port.";
    if (!isRunnerControlEdge && !portTypesAreCompatible(sourcePort.dataType, targetPort.dataType)) {
      return `${sourcePort.label} output cannot connect to ${targetPort.label} input.`;
    }
  }
  if (wouldCreateCycle(connection, edges)) {
    return "Connection would create a cycle.";
  }

  return null;
}

export function toWorkflowGraph(
  sourceGraph: WorkflowGraph,
  nodes: WorkflowFlowNode[],
  edges: Edge[]
): WorkflowGraph {
  const sourceNodes = new Map(sourceGraph.nodes.map((node) => [node.id, node]));

  return {
    ...sourceGraph,
    nodes: nodes.map((node) => {
      const definition = getWorkflowNodeDefinition(node.data.type);
      const graphNode: WorkflowNode = {
        id: node.id,
        type: node.data.type,
        label: node.data.label,
        position: node.position,
        config: cloneConfig(node.data.config ?? definition.defaultConfig),
        retention: node.data.retention ?? definition.defaultRetention,
      };

      if (modelCategoryForNodeType(node.data.type)) {
        graphNode.provider = "bulkapis";
      } else if (node.data.provider) {
        graphNode.provider = node.data.provider;
      }
      if (node.data.model) graphNode.model = node.data.model;
      const existingNode = sourceNodes.get(node.id);
      if (existingNode?.inputBindings) graphNode.inputBindings = existingNode.inputBindings;

      return graphNode;
    }),
    edges: edges.map((edge) => {
      const graphEdge: WorkflowEdge = {
        id: edge.id,
        sourceNodeId: edge.source,
        sourcePort: String(edge.sourceHandle ?? "output"),
        targetNodeId: edge.target,
        targetPort: WORKFLOW_CANVAS_INPUT_HANDLE_ID,
      };

      return graphEdge;
    }),
  };
}
