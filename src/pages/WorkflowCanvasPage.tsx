import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Box,
  Brain,
  Clapperboard,
  Download,
  FileText,
  Image,
  MessageSquare,
  Mic,
  PackageCheck,
  Play,
  Save,
  Send,
  Sparkles,
  Upload,
  Video,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Page } from "../components/ui";
import type {
  NodeRetentionMode,
  NodeRetentionPolicy,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowPort,
  WorkflowPortDataType,
  WorkflowProviderName,
} from "../lib/workflowGraph";
import {
  getWorkflowNodeDefinition,
  isWorkflowNodeType,
  listWorkflowNodeDefinitions,
} from "../lib/workflowNodeCatalog";
import { validateWorkflowGraph } from "../lib/workflowGraphValidation";

const nodeTypes = {
  workflowNode: WorkflowCanvasNode,
};

const nodeIcons = {
  runner: Play,
  comment: MessageSquare,
  media: Upload,
  llm: Brain,
  ai_agent: Sparkles,
  image_generation: Image,
  video_generation: Video,
  audio_generation: Mic,
  lipsync: WandSparkles,
  native_slideshow_planner: FileText,
  native_slideshow_renderer: Clapperboard,
  ai_video_editor: Clapperboard,
  post_compiler: PackageCheck,
  export: Download,
  auto_post: Send,
} satisfies Record<WorkflowNodeType, typeof Play>;

type WorkflowCanvasNodeData = Record<string, unknown> & {
  config: Record<string, unknown>;
  label: string;
  model?: string;
  provider?: WorkflowProviderName;
  retention?: NodeRetentionPolicy;
  type: WorkflowNodeType;
};

type WorkflowFlowNode = Node<WorkflowCanvasNodeData>;

type WorkflowConnection = {
  source: string | null;
  sourceHandle?: string | null;
  target: string | null;
  targetHandle?: string | null;
};

const paletteSections = [
  { category: "control", label: "Control" },
  { category: "input", label: "Input" },
  { category: "language", label: "Language" },
  { category: "agent", label: "Agents" },
  { category: "generation", label: "Generation" },
  { category: "assembly", label: "Assembly" },
  { category: "output", label: "Output" },
  { category: "utility", label: "Utility" },
] as const;

const providerOptions: Array<{ value: WorkflowProviderName; label: string }> = [
  { value: "bulkapis", label: "BulkAPIs" },
  { value: "gemini", label: "Gemini" },
  { value: "fal", label: "fal.ai" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "postiz", label: "Postiz" },
  { value: "manual", label: "Manual" },
];

const retentionOptions: Array<{ value: NodeRetentionMode; label: string }> = [
  { value: "inherit", label: "Inherit workflow default" },
  { value: "keep", label: "Keep output" },
  { value: "discard", label: "Discard output" },
  { value: "keep_on_failure", label: "Keep on failure" },
];

function WorkflowCanvasNode({ data }: NodeProps<WorkflowFlowNode>) {
  const definition = getWorkflowNodeDefinition(data.type);
  const Icon = nodeIcons[data.type] ?? Box;

  return (
    <div className={`workflow-node workflow-node-${definition.role}`}>
      {definition.inputPorts.map((port, index) => (
        <Handle
          className="workflow-port workflow-port-input"
          id={port.id}
          key={port.id}
          position={Position.Left}
          style={{ top: `${portOffset(index, definition.inputPorts.length)}%` }}
          type="target"
        />
      ))}

      <div className="workflow-node-header">
        <span className="workflow-node-icon">
          <Icon size={16} />
        </span>
        <span>{data.label}</span>
      </div>
      <p>{definition.description}</p>
      <div className="workflow-node-ports">
        {definition.inputPorts.length ? (
          <div className="workflow-node-port-list">
            {definition.inputPorts.map((port) => (
              <span key={port.id}>{port.label}</span>
            ))}
          </div>
        ) : (
          <span aria-hidden="true" />
        )}

        {definition.outputPorts.length ? (
          <div className="workflow-node-port-list workflow-node-port-list-output">
            {definition.outputPorts.map((port) => (
              <span key={port.id}>{port.label}</span>
            ))}
          </div>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
      <div className="workflow-node-meta">
        <span>{definition.category}</span>
        <span>{definition.configSchemaMode.replace(/_/g, " ")}</span>
      </div>

      {definition.outputPorts.map((port, index) => (
        <Handle
          className="workflow-port workflow-port-output"
          id={port.id}
          key={port.id}
          position={Position.Right}
          style={{ top: `${portOffset(index, definition.outputPorts.length)}%` }}
          type="source"
        />
      ))}
    </div>
  );
}

function portOffset(index: number, count: number): number {
  if (count <= 1) return 50;
  const available = 68;
  return 16 + (available / (count - 1)) * index;
}

function toFlowNodes(graph: WorkflowGraph): WorkflowFlowNode[] {
  return graph.nodes
    .filter((node) => isWorkflowNodeType(node.type))
    .map((node) => ({
      id: node.id,
      type: "workflowNode",
      position: node.position,
      data: {
        config: cloneConfig(node.config),
        label: node.label,
        model: node.model,
        provider: node.provider,
        retention: node.retention,
        type: node.type,
      },
    }));
}

function toFlowEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    sourceHandle: edge.sourcePort,
    target: edge.targetNodeId,
    targetHandle: edge.targetPort,
    animated: false,
    deletable: true,
    type: "smoothstep",
  }));
}

function cloneConfig(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

function nextNodeId(type: WorkflowNodeType, nodes: WorkflowFlowNode[]): string {
  const baseId = type.replace(/_/g, "-");
  const usedIds = new Set(nodes.map((node) => node.id));
  let index = 1;

  while (usedIds.has(`${baseId}-${index}`)) {
    index += 1;
  }

  return `${baseId}-${index}`;
}

function nextNodePosition(nodes: WorkflowFlowNode[]) {
  const index = Math.max(0, nodes.length - 1);

  return {
    x: 140 + (index % 3) * 300,
    y: 120 + Math.floor(index / 3) * 210,
  };
}

function sanitizeEdgeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
}

function nextEdgeId(connection: Connection, edges: Edge[]): string {
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

function portTypesAreCompatible(
  sourceType: WorkflowPortDataType,
  targetType: WorkflowPortDataType
): boolean {
  if (targetType === "any" || sourceType === "any" || sourceType === targetType) return true;
  if (targetType === "media") {
    return ["image", "video", "audio", "slideshow", "media", "artifact"].includes(sourceType);
  }
  if (targetType === "text" || targetType === "prompt") {
    return sourceType === "text" || sourceType === "prompt";
  }
  if (targetType === "artifact") {
    return ["image", "video", "audio", "slideshow", "artifact"].includes(sourceType);
  }

  return false;
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

function validateCanvasConnection(
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
  const targetPort = findPort(targetNode, connection.targetHandle, "input");
  if (!sourcePort || !targetPort) return "Connection references an unknown port.";
  if (!portTypesAreCompatible(sourcePort.dataType, targetPort.dataType)) {
    return `${sourcePort.label} output cannot connect to ${targetPort.label} input.`;
  }
  if (wouldCreateCycle(connection, edges)) {
    return "Connection would create a cycle.";
  }

  return null;
}

function toWorkflowGraph(
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

      if (node.data.provider) graphNode.provider = node.data.provider;
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
        targetPort: String(edge.targetHandle ?? "input"),
      };

      return graphEdge;
    }),
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unable to save workflow graph.";
}

function formatConfigLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPrimitiveConfigValue(value: unknown): value is string | number | boolean {
  return ["string", "number", "boolean"].includes(typeof value);
}

function configInputType(value: unknown): "text" | "number" | "checkbox" {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "checkbox";
  return "text";
}

function coerceConfigValue(value: string, previousValue: unknown): unknown {
  if (typeof previousValue === "number") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : previousValue;
  }

  return value;
}

export function WorkflowCanvasPage() {
  const { workflowId } = useParams();
  const workflow = useQuery(
    api.workflows.definitions.get,
    workflowId ? { id: workflowId as Id<"workflows"> } : "skip"
  );
  const updateGraph = useMutation(api.workflows.definitions.updateGraph);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const flowNodes = useMemo(
    () => (workflow ? toFlowNodes(workflow.graph as WorkflowGraph) : []),
    [workflow]
  );
  const flowEdges = useMemo(
    () => (workflow ? toFlowEdges(workflow.graph as WorkflowGraph) : []),
    [workflow]
  );
  const hasRunnerNode = nodes.some((node) => node.data.type === "runner");
  const paletteDefinitions = useMemo(() => listWorkflowNodeDefinitions(), []);
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );
  const selectedNodeDefinition = selectedNode
    ? getWorkflowNodeDefinition(selectedNode.data.type)
    : null;
  const selectedConfigEntries = Object.entries(selectedNode?.data.config ?? {});

  useEffect(() => {
    if (!workflow) return;

    setNodes(flowNodes);
    setEdges(flowEdges);
    setIsDirty(false);
    setSaveStatus("");
    setConnectionStatus("");
  }, [flowEdges, flowNodes, setEdges, setNodes, workflow]);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [nodes, selectedNodeId]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      if (changes.some((change) => change.type === "position" || change.type === "dimensions")) {
        setIsDirty(true);
        setSaveStatus("");
      }

      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some((change) => change.type === "remove" || change.type === "add")) {
        setIsDirty(true);
        setSaveStatus("");
        setConnectionStatus("");
      }

      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  const handleAddNode = useCallback(
    (type: WorkflowNodeType) => {
      const definition = getWorkflowNodeDefinition(type);

      if (type === "runner" && hasRunnerNode) return;

      setNodes((currentNodes) => {
        const nodeId = nextNodeId(type, currentNodes);
        setSelectedNodeId(nodeId);

        return [
          ...currentNodes,
          {
            id: nodeId,
            type: "workflowNode",
            position: nextNodePosition(currentNodes),
            data: {
              config: cloneConfig(definition.defaultConfig),
              label: definition.label,
              provider: definition.defaultProvider,
              retention: definition.defaultRetention,
              type,
            },
          },
        ];
      });
      setIsDirty(true);
      setSaveStatus("");
      setConnectionStatus("");
    },
    [hasRunnerNode, setNodes]
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      validateCanvasConnection(connection, nodes, edges) === null,
    [edges, nodes]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const validationError = validateCanvasConnection(connection, nodes, edges);

      if (validationError) {
        setConnectionStatus(validationError);
        return;
      }

      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            id: nextEdgeId(connection, currentEdges),
            animated: false,
            deletable: true,
            type: "smoothstep",
          },
          currentEdges
        )
      );
      setIsDirty(true);
      setSaveStatus("");
      setConnectionStatus("Connected");
    },
    [edges, nodes, setEdges]
  );

  const updateSelectedNodeData = useCallback(
    (updater: (data: WorkflowCanvasNodeData) => Partial<WorkflowCanvasNodeData>) => {
      if (!selectedNodeId) return;

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...updater(node.data),
                },
              }
            : node
        )
      );
      setIsDirty(true);
      setSaveStatus("");
      setConnectionStatus("");
    },
    [selectedNodeId, setNodes]
  );

  const updateSelectedConfigValue = useCallback(
    (key: string, value: unknown) => {
      updateSelectedNodeData((data) => ({
        config: {
          ...data.config,
          [key]: value,
        },
      }));
    },
    [updateSelectedNodeData]
  );

  const handleSaveGraph = useCallback(async () => {
    if (!workflow) return;

    setIsSaving(true);
    setSaveStatus("");

    try {
      const graph = toWorkflowGraph(workflow.graph as WorkflowGraph, nodes, edges);
      const validation = validateWorkflowGraph(graph);

      if (!validation.valid) {
        setSaveStatus(validation.errors[0]?.message ?? "Workflow graph is invalid.");
        return;
      }

      await updateGraph({ id: workflow._id, graph });
      setIsDirty(false);
      setSaveStatus("Saved");
      setConnectionStatus("");
    } catch (error) {
      setSaveStatus(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [edges, nodes, updateGraph, workflow]);

  if (!workflowId) {
    return (
      <Page title="Workflow" description="No workflow was selected.">
        <Link className="secondary-button workflow-back-link" to="/workflows">
          <ArrowLeft size={16} />
          Back to workflows
        </Link>
      </Page>
    );
  }

  if (workflow === undefined) {
    return <div className="workflow-canvas-loading">Loading workflow canvas...</div>;
  }

  if (workflow === null) {
    return (
      <Page title="Workflow not found" description="This workflow may have been deleted or belongs to another account.">
        <Link className="secondary-button workflow-back-link" to="/workflows">
          <ArrowLeft size={16} />
          Back to workflows
        </Link>
      </Page>
    );
  }

  return (
    <section className="workflow-detail-page">
      <header className="workflow-canvas-header">
        <div>
          <Link className="workflow-back-link" to="/workflows">
            <ArrowLeft size={16} />
            Workflows
          </Link>
          <h1>{workflow.name}</h1>
          <p>{workflow.description || `${workflow.contentFormat} workflow`}</p>
        </div>
        <div className="workflow-canvas-stats">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} edges</span>
          <span>{workflow.isActive ? "Active" : "Paused"}</span>
        </div>
        <div className="workflow-canvas-actions">
          {saveStatus ? <span>{saveStatus}</span> : null}
          <button
            className="primary-button"
            disabled={!isDirty || isSaving}
            onClick={() => {
              void handleSaveGraph();
            }}
            type="button"
          >
            <Save size={16} />
            {isSaving ? "Saving" : "Save graph"}
          </button>
        </div>
      </header>

      <div className="workflow-canvas-layout">
        <aside className="workflow-node-palette" aria-label="Workflow node palette">
          <div className="workflow-node-palette-header">
            <h2>Add node</h2>
            <span>{paletteDefinitions.length} types</span>
          </div>

          {paletteSections.map((section) => {
            const sectionDefinitions = paletteDefinitions.filter(
              (definition) => definition.category === section.category
            );

            if (!sectionDefinitions.length) return null;

            return (
              <section className="workflow-palette-section" key={section.category}>
                <h3>{section.label}</h3>
                <div className="workflow-palette-list">
                  {sectionDefinitions.map((definition) => {
                    const Icon = nodeIcons[definition.type] ?? Box;
                    const isDisabled = definition.type === "runner" && hasRunnerNode;

                    return (
                      <button
                        className="workflow-palette-button"
                        disabled={isDisabled}
                        key={definition.type}
                        onClick={() => handleAddNode(definition.type)}
                        type="button"
                      >
                        <span className="workflow-palette-icon">
                          <Icon size={15} />
                        </span>
                        <span>
                          <strong>{definition.label}</strong>
                          <small>
                            {isDisabled ? "Already on canvas" : definition.providerRequirement}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </aside>

        <div className="workflow-canvas-shell">
          <ReactFlowProvider>
            <ReactFlow
              colorMode="light"
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.35 }}
              maxZoom={1.4}
              minZoom={0.35}
              nodes={nodes}
              nodeTypes={nodeTypes}
              nodesDraggable
              nodesFocusable
              isValidConnection={isValidConnection}
              onConnect={handleConnect}
              onEdgesChange={handleEdgesChange}
              onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
              onNodesChange={handleNodesChange}
              onPaneClick={() => setSelectedNodeId(null)}
              panOnScroll
              proOptions={{ hideAttribution: true }}
            >
              <Background color="oklch(75% 0.034 220)" gap={22} size={1.2} />
              <MiniMap pannable zoomable />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
          {connectionStatus ? (
            <div className="workflow-canvas-status" role="status">
              {connectionStatus}
            </div>
          ) : null}
        </div>

        <aside className="workflow-node-inspector" aria-label="Workflow node inspector">
          {selectedNode && selectedNodeDefinition ? (
            <>
              <div className="workflow-node-inspector-header">
                <span className="workflow-node-inspector-icon">
                  {(() => {
                    const Icon = nodeIcons[selectedNode.data.type] ?? Box;
                    return <Icon size={16} />;
                  })()}
                </span>
                <div>
                  <h2>{selectedNode.data.label}</h2>
                  <p>{selectedNodeDefinition.description}</p>
                </div>
              </div>

              <div className="workflow-inspector-group">
                <label className="workflow-inspector-field">
                  <span>Label</span>
                  <input
                    onChange={(event) =>
                      updateSelectedNodeData(() => ({ label: event.target.value }))
                    }
                    type="text"
                    value={selectedNode.data.label}
                  />
                </label>

                <label className="workflow-inspector-field">
                  <span>Provider</span>
                  <select
                    disabled={selectedNodeDefinition.providerRequirement === "none"}
                    onChange={(event) =>
                      updateSelectedNodeData(() => ({
                        provider: event.target.value
                          ? (event.target.value as WorkflowProviderName)
                          : undefined,
                      }))
                    }
                    value={selectedNode.data.provider ?? ""}
                  >
                    <option value="">No provider</option>
                    {providerOptions.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="workflow-inspector-field">
                  <span>Model</span>
                  <input
                    disabled={selectedNodeDefinition.providerRequirement === "none"}
                    onChange={(event) =>
                      updateSelectedNodeData(() => ({
                        model: event.target.value || undefined,
                      }))
                    }
                    placeholder="Provider model id"
                    type="text"
                    value={selectedNode.data.model ?? ""}
                  />
                </label>
              </div>

              <div className="workflow-inspector-group">
                <label className="workflow-inspector-field">
                  <span>Retention</span>
                  <select
                    onChange={(event) =>
                      updateSelectedNodeData((data) => ({
                        retention: {
                          ...(data.retention ?? {}),
                          mode: event.target.value as NodeRetentionMode,
                        },
                      }))
                    }
                    value={selectedNode.data.retention?.mode ?? "inherit"}
                  >
                    {retentionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="workflow-inspector-toggle">
                  <input
                    checked={selectedNode.data.retention?.exposeInLibrary ?? false}
                    onChange={(event) =>
                      updateSelectedNodeData((data) => ({
                        retention: {
                          mode: data.retention?.mode ?? "inherit",
                          exposeInLibrary: event.target.checked,
                        },
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Expose output in media library</span>
                </label>
              </div>

              <div className="workflow-inspector-group">
                <div className="workflow-inspector-section-heading">
                  <h3>Config</h3>
                  <span>{selectedNodeDefinition.configSchemaMode.replace(/_/g, " ")}</span>
                </div>

                {selectedConfigEntries.length ? (
                  selectedConfigEntries.map(([configKey, configValue]) => {
                    if (!isPrimitiveConfigValue(configValue)) {
                      return (
                        <div className="workflow-inspector-static-field" key={configKey}>
                          <span>{formatConfigLabel(configKey)}</span>
                          <code>
                            {Array.isArray(configValue)
                              ? `${configValue.length} items`
                              : "Structured value"}
                          </code>
                        </div>
                      );
                    }

                    const inputType = configInputType(configValue);

                    return (
                      <label className="workflow-inspector-field" key={configKey}>
                        <span>{formatConfigLabel(configKey)}</span>
                        {inputType === "checkbox" ? (
                          <input
                            checked={Boolean(configValue)}
                            onChange={(event) =>
                              updateSelectedConfigValue(configKey, event.target.checked)
                            }
                            type="checkbox"
                          />
                        ) : (
                          <input
                            onChange={(event) =>
                              updateSelectedConfigValue(
                                configKey,
                                coerceConfigValue(event.target.value, configValue)
                              )
                            }
                            type={inputType}
                            value={String(configValue)}
                          />
                        )}
                      </label>
                    );
                  })
                ) : (
                  <p className="workflow-inspector-empty">This node has no static config yet.</p>
                )}
              </div>
            </>
          ) : (
            <div className="workflow-inspector-empty-state">
              <Box size={18} />
              <h2>Select a node</h2>
              <p>Node settings appear here without running the workflow.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
