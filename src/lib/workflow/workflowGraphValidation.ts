import {
  WORKFLOW_GRAPH_SCHEMA_VERSION,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
} from "./workflowGraph";
import {
  getWorkflowNodeDefinition,
  isRunnerWorkflowNodeType,
  isTerminalWorkflowNodeType,
  isWorkflowNodeType,
} from "./workflowNodeCatalog";
import { WORKFLOW_CANVAS_INPUT_HANDLE_ID } from "./workflowPortMapping";

export type WorkflowGraphValidationErrorCode =
  | "unsupported_schema_version"
  | "missing_node_id"
  | "duplicate_node_id"
  | "invalid_node_type"
  | "missing_node_label"
  | "invalid_node_position"
  | "missing_edge_id"
  | "duplicate_edge_id"
  | "missing_edge_endpoint"
  | "unknown_edge_node"
  | "unknown_edge_port"
  | "self_edge"
  | "missing_runner"
  | "multiple_runners"
  | "missing_terminal_node"
  | "cycle_detected";

export type WorkflowGraphValidationError = {
  code: WorkflowGraphValidationErrorCode;
  message: string;
  path: string;
};

export type WorkflowGraphValidationResult = {
  valid: boolean;
  errors: WorkflowGraphValidationError[];
};

export type WorkflowGraphValidationMode = "draft" | "executable";

function validationError(
  code: WorkflowGraphValidationErrorCode,
  message: string,
  path: string
): WorkflowGraphValidationError {
  return { code, message, path };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateNode(
  node: WorkflowNode,
  index: number,
  seenNodeIds: Set<string>,
  errors: WorkflowGraphValidationError[]
) {
  const nodePath = `nodes[${index}]`;

  if (!node.id.trim()) {
    errors.push(validationError(
      "missing_node_id",
      "Workflow node id is required.",
      `${nodePath}.id`
    ));
  } else if (seenNodeIds.has(node.id)) {
    errors.push(validationError(
      "duplicate_node_id",
      `Workflow node id "${node.id}" is duplicated.`,
      `${nodePath}.id`
    ));
  } else {
    seenNodeIds.add(node.id);
  }

  if (!isWorkflowNodeType(node.type)) {
    errors.push(validationError(
      "invalid_node_type",
      `Workflow node type "${node.type}" is not supported.`,
      `${nodePath}.type`
    ));
  }

  if (!node.label.trim()) {
    errors.push(validationError(
      "missing_node_label",
      "Workflow node label is required.",
      `${nodePath}.label`
    ));
  }

  if (!isFiniteNumber(node.position.x) || !isFiniteNumber(node.position.y)) {
    errors.push(validationError(
      "invalid_node_position",
      "Workflow node position must include finite x and y values.",
      `${nodePath}.position`
    ));
  }
}

function validateEdge(
  edge: WorkflowEdge,
  index: number,
  nodesById: Map<string, WorkflowNode>,
  seenEdgeIds: Set<string>,
  errors: WorkflowGraphValidationError[]
) {
  const edgePath = `edges[${index}]`;

  if (!edge.id.trim()) {
    errors.push(validationError(
      "missing_edge_id",
      "Workflow edge id is required.",
      `${edgePath}.id`
    ));
  } else if (seenEdgeIds.has(edge.id)) {
    errors.push(validationError(
      "duplicate_edge_id",
      `Workflow edge id "${edge.id}" is duplicated.`,
      `${edgePath}.id`
    ));
  } else {
    seenEdgeIds.add(edge.id);
  }

  if (!edge.sourceNodeId.trim() || !edge.targetNodeId.trim()) {
    errors.push(validationError(
      "missing_edge_endpoint",
      "Workflow edge source and target node ids are required.",
      edgePath
    ));
    return;
  }

  if (edge.sourceNodeId === edge.targetNodeId) {
    errors.push(validationError(
      "self_edge",
      "Workflow edge cannot connect a node to itself.",
      edgePath
    ));
  }

  const sourceNode = nodesById.get(edge.sourceNodeId);
  const targetNode = nodesById.get(edge.targetNodeId);

  if (!sourceNode) {
    errors.push(validationError(
      "unknown_edge_node",
      `Workflow edge source node "${edge.sourceNodeId}" does not exist.`,
      `${edgePath}.sourceNodeId`
    ));
  }

  if (!targetNode) {
    errors.push(validationError(
      "unknown_edge_node",
      `Workflow edge target node "${edge.targetNodeId}" does not exist.`,
      `${edgePath}.targetNodeId`
    ));
  }

  if (sourceNode && isWorkflowNodeType(sourceNode.type)) {
    const sourceDefinition = getWorkflowNodeDefinition(sourceNode.type);
    if (!sourceDefinition.outputPorts.some((port) => port.id === edge.sourcePort)) {
      errors.push(validationError(
        "unknown_edge_port",
        `Workflow edge source port "${edge.sourcePort}" does not exist on ${sourceDefinition.label}.`,
        `${edgePath}.sourcePort`
      ));
    }
  }

  if (targetNode && isWorkflowNodeType(targetNode.type)) {
    const targetDefinition = getWorkflowNodeDefinition(targetNode.type);
    if (
      edge.targetPort !== WORKFLOW_CANVAS_INPUT_HANDLE_ID &&
      !targetDefinition.inputPorts.some((port) => port.id === edge.targetPort)
    ) {
      errors.push(validationError(
        "unknown_edge_port",
        `Workflow edge target port "${edge.targetPort}" does not exist on ${targetDefinition.label}.`,
        `${edgePath}.targetPort`
      ));
    }
  }
}

function findCycle(graph: WorkflowGraph): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const visit = (nodeId: string): string[] | null => {
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      return [...path.slice(cycleStart), nodeId];
    }
    if (visited.has(nodeId)) return null;

    visiting.add(nodeId);
    path.push(nodeId);
    for (const nextNodeId of adjacency.get(nodeId) ?? []) {
      const cycle = visit(nextNodeId);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  };

  for (const node of graph.nodes) {
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }

  return null;
}

export function validateWorkflowGraph(
  graph: WorkflowGraph,
  mode: WorkflowGraphValidationMode = "executable"
): WorkflowGraphValidationResult {
  const errors: WorkflowGraphValidationError[] = [];

  if (graph.schemaVersion !== WORKFLOW_GRAPH_SCHEMA_VERSION) {
    errors.push(validationError(
      "unsupported_schema_version",
      `Workflow graph schema version ${graph.schemaVersion} is not supported.`,
      "schemaVersion"
    ));
  }

  const seenNodeIds = new Set<string>();
  graph.nodes.forEach((node, index) => {
    validateNode(node, index, seenNodeIds, errors);
  });

  const nodesById = new Map(
    graph.nodes
      .filter((node) => node.id)
      .map((node) => [node.id, node])
  );
  const seenEdgeIds = new Set<string>();
  graph.edges.forEach((edge, index) => {
    validateEdge(edge, index, nodesById, seenEdgeIds, errors);
  });

  const runnerNodes = graph.nodes.filter((node) =>
    isWorkflowNodeType(node.type) && isRunnerWorkflowNodeType(node.type)
  );
  if (runnerNodes.length === 0) {
    errors.push(validationError(
      "missing_runner",
      "Workflow graph must include exactly one runner node.",
      "nodes"
    ));
  } else if (runnerNodes.length > 1) {
    errors.push(validationError(
      "multiple_runners",
      "Workflow graph can only include one runner node.",
      "nodes"
    ));
  }

  if (
    mode === "executable" &&
    !graph.nodes.some((node) =>
      isWorkflowNodeType(node.type) && isTerminalWorkflowNodeType(node.type)
    )
  ) {
    errors.push(validationError(
      "missing_terminal_node",
      "Workflow graph must include an export or auto-post terminal node.",
      "nodes"
    ));
  }

  if (!errors.some((error) =>
    error.code === "unknown_edge_node" ||
    error.code === "missing_node_id" ||
    error.code === "duplicate_node_id" ||
    error.code === "missing_edge_endpoint" ||
    error.code === "self_edge"
  )) {
    const cycle = findCycle(graph);
    if (cycle) {
      errors.push(validationError(
        "cycle_detected",
        `Workflow graph cannot contain cycles: ${cycle.join(" -> ")}.`,
        "edges"
      ));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
