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
  Activity,
  AlertCircle,
  ArrowLeft,
  Box,
  Brain,
  Clock,
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
import type { Doc, Id } from "../../convex/_generated/dataModel";
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
  executionStatus?: WorkflowCanvasNodeExecutionStatus;
  label: string;
  model?: string;
  provider?: WorkflowProviderName;
  retention?: NodeRetentionPolicy;
  type: WorkflowNodeType;
};

type WorkflowFlowNode = Node<WorkflowCanvasNodeData>;
type ProviderCatalogName = Exclude<WorkflowProviderName, "postiz">;
type ProviderModelDoc = Doc<"providerModels">;
type WorkflowRunDoc = Doc<"workflowRuns">;
type WorkflowCanvasNodeExecutionStatus = "running" | "failed" | "completed";
type ConfigFieldType = "string" | "number" | "boolean" | "enum" | "json";

type ConfigField = {
  key: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  advanced: boolean;
  defaultValue?: unknown;
  description?: string;
  enumValues?: string[];
};

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

const primaryConfigFieldKeys = new Set([
  "agentMode",
  "aspectRatio",
  "audioUrl",
  "autoPublish",
  "caption",
  "count",
  "destination",
  "durationSeconds",
  "endFrameUrl",
  "fileName",
  "folder",
  "imageUrl",
  "maxDurationSeconds",
  "maxTokens",
  "mode",
  "name",
  "optimizeFor",
  "platform",
  "postType",
  "prompt",
  "referenceImageUrl",
  "referenceVideoUrl",
  "removeSilence",
  "renderMode",
  "request",
  "resolution",
  "responseFormat",
  "scheduledAt",
  "scriptLengthSeconds",
  "seed",
  "slideCount",
  "startFrameUrl",
  "systemPrompt",
  "temperature",
  "text",
  "tone",
  "trigger",
  "videoUrl",
  "voice",
  "voiceReferenceUrl",
  "webhookUrl",
]);

function WorkflowCanvasNode({ data }: NodeProps<WorkflowFlowNode>) {
  const definition = getWorkflowNodeDefinition(data.type);
  const Icon = nodeIcons[data.type] ?? Box;
  const executionClass = data.executionStatus
    ? ` workflow-node-execution-${data.executionStatus}`
    : "";

  return (
    <div className={`workflow-node workflow-node-${definition.role}${executionClass}`}>
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
      {data.executionStatus ? (
        <span className="workflow-node-run-state">{data.executionStatus}</span>
      ) : null}
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProviderCatalogName(value?: WorkflowProviderName): value is ProviderCatalogName {
  return value === "bulkapis" || value === "gemini" || value === "fal" || value === "openrouter" || value === "manual";
}

function schemaFieldTypeFromValue(value: unknown): ConfigFieldType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  return "json";
}

function enumValuesFromSchemaProperty(property: Record<string, unknown>): string[] | undefined {
  const enumValues = Array.isArray(property.enum) ? property.enum : property.options;
  if (!Array.isArray(enumValues)) return undefined;

  const values = enumValues
    .map((value) => {
      if (isRecord(value)) {
        const nestedValue = value.value ?? value.id ?? value.name ?? value.label;
        return nestedValue === undefined ? null : String(nestedValue);
      }
      return value === undefined || value === null ? null : String(value);
    })
    .filter((value): value is string => Boolean(value));

  return values.length ? values : undefined;
}

function schemaPropertyFieldType(property: Record<string, unknown>): ConfigFieldType {
  if (enumValuesFromSchemaProperty(property)?.length) return "enum";

  const type = Array.isArray(property.type) ? property.type[0] : property.type;
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  if (type === "string") return "string";
  return "json";
}

function schemaFieldsFromRecordSchema(schema: unknown): ConfigField[] {
  if (!isRecord(schema)) return [];

  const candidateSchema =
    isRecord(schema.properties) || Array.isArray(schema.required)
      ? schema
      : isRecord(schema.schema)
        ? schema.schema
        : isRecord(schema.parameters)
          ? schema.parameters
          : schema;

  if (isRecord(candidateSchema.properties)) {
    const requiredKeys = new Set(
      Array.isArray(candidateSchema.required)
        ? candidateSchema.required.map((key) => String(key))
        : []
    );

    return Object.entries(candidateSchema.properties).map(([key, rawProperty]) => {
      const property = isRecord(rawProperty) ? rawProperty : {};
      const enumValues = enumValuesFromSchemaProperty(property);
      const type = schemaPropertyFieldType(property);

      return {
        key,
        label: typeof property.title === "string" ? property.title : formatConfigLabel(key),
        type,
        required: requiredKeys.has(key),
        advanced: isAdvancedConfigField(key, type),
        defaultValue: property.default,
        description: typeof property.description === "string" ? property.description : undefined,
        enumValues,
      };
    });
  }

  const fieldList =
    Array.isArray(candidateSchema.fields)
      ? candidateSchema.fields
      : Array.isArray(candidateSchema.inputs)
        ? candidateSchema.inputs
        : Array.isArray(candidateSchema.parameters)
          ? candidateSchema.parameters
          : [];

  return fieldList.flatMap((rawField) => {
    if (!isRecord(rawField)) return [];
    const keyValue = rawField.key ?? rawField.name ?? rawField.id;
    if (typeof keyValue !== "string" || !keyValue) return [];

    const enumValues = enumValuesFromSchemaProperty(rawField);
    const type =
      enumValues?.length
        ? "enum"
        : rawField.type === "number" || rawField.type === "integer"
          ? "number"
          : rawField.type === "boolean"
            ? "boolean"
            : rawField.type === "string"
              ? "string"
              : schemaFieldTypeFromValue(rawField.default);

    return [
      {
        key: keyValue,
        label: typeof rawField.label === "string" ? rawField.label : formatConfigLabel(keyValue),
        type,
        required: rawField.required === true,
        advanced: isAdvancedConfigField(keyValue, type),
        defaultValue: rawField.default,
        description: typeof rawField.description === "string" ? rawField.description : undefined,
        enumValues,
      },
    ];
  });
}

function friendlyConfigFieldKeysForNode(type: WorkflowNodeType): string[] {
  switch (type) {
    case "runner":
      return ["trigger"];
    case "comment":
      return ["text"];
    case "media":
      return ["assetIds"];
    case "llm":
      return ["systemPrompt", "prompt", "responseFormat", "temperature", "maxTokens", "seed"];
    case "ai_agent":
      return ["agentMode", "request", "scriptLengthSeconds", "referenceImageUrl"];
    case "image_generation":
      return ["prompt", "aspectRatio", "resolution", "count", "seed", "referenceImageUrl", "webhookUrl"];
    case "video_generation":
      return [
        "prompt",
        "aspectRatio",
        "durationSeconds",
        "resolution",
        "seed",
        "imageUrl",
        "startFrameUrl",
        "endFrameUrl",
        "referenceVideoUrl",
        "webhookUrl",
      ];
    case "audio_generation":
      return ["mode", "text", "voice", "voiceReferenceUrl", "temperature", "cfgScale", "seed", "removeSilence", "webhookUrl"];
    case "lipsync":
      return ["videoUrl", "audioUrl", "webhookUrl"];
    case "native_slideshow_planner":
      return ["prompt", "slideCount", "aspectRatio", "platform", "tone"];
    case "native_slideshow_renderer":
      return ["renderMode", "aspectRatio", "resolution"];
    case "ai_video_editor":
      return ["renderMode", "prompt", "systemPrompt", "knowledgeBase", "aspectRatio", "maxDurationSeconds", "webhookUrl"];
    case "post_compiler":
      return ["postType", "caption", "name"];
    case "export":
      return ["destination", "folder", "fileName", "optimizeFor"];
    case "auto_post":
      return ["platforms", "caption", "scheduledAt", "autoPublish"];
  }
}

function friendlyConfigFieldForKey(key: string, config: Record<string, unknown>): ConfigField {
  const currentValue = config[key];
  const defaultField: ConfigField = {
    key,
    label: formatConfigLabel(key),
    type: schemaFieldTypeFromValue(currentValue),
    required: false,
    advanced: isAdvancedConfigField(key, schemaFieldTypeFromValue(currentValue)),
  };

  switch (key) {
    case "agentMode":
      return {
        ...defaultField,
        type: "enum",
        enumValues: [
          "analyze_input",
          "script_writer",
          "prompt_variation",
          "sora_prompting",
          "image_gen_agent",
          "kling_prompting",
          "grab_frame_extract_audio",
        ],
      };
    case "aspectRatio":
      return {
        ...defaultField,
        type: "enum",
        enumValues: ["9:16", "16:9", "1:1", "4:5", "3:4"],
      };
    case "autoPublish":
    case "removeSilence":
      return { ...defaultField, type: "boolean" };
    case "count":
    case "durationSeconds":
    case "maxDurationSeconds":
    case "maxTokens":
    case "scriptLengthSeconds":
    case "seed":
    case "slideCount":
    case "temperature":
    case "cfgScale":
      return { ...defaultField, type: "number" };
    case "destination":
      return {
        ...defaultField,
        type: "enum",
        enumValues: ["media_library", "download", "google_drive"],
      };
    case "mode":
      return { ...defaultField, type: "enum", enumValues: ["tts", "sound_effect", "music"] };
    case "postType":
      return {
        ...defaultField,
        type: "enum",
        enumValues: ["video", "slideshow", "carousel", "single_image", "thread"],
      };
    case "renderMode":
      return {
        ...defaultField,
        type: "enum",
        enumValues: ["video_render", "music_edit", "native"],
      };
    case "responseFormat":
      return { ...defaultField, type: "enum", enumValues: ["text", "json"] };
    case "trigger":
      return { ...defaultField, type: "enum", enumValues: ["manual", "schedule", "event"] };
    case "assetIds":
    case "knowledgeBase":
    case "platforms":
      return { ...defaultField, type: "json", advanced: true };
    default:
      return defaultField;
  }
}

function isAdvancedConfigField(key: string, type: ConfigFieldType): boolean {
  if (type === "json") return true;

  return !primaryConfigFieldKeys.has(key);
}

function configFieldsForNode(
  type: WorkflowNodeType,
  config: Record<string, unknown>,
  selectedModel: ProviderModelDoc | null
): ConfigField[] {
  const fieldsByKey = new Map<string, ConfigField>();
  const modelSchemaFields = schemaFieldsFromRecordSchema(selectedModel?.schemaSnapshot?.inputSchema);

  for (const field of modelSchemaFields) {
    fieldsByKey.set(field.key, field);
  }

  for (const key of friendlyConfigFieldKeysForNode(type)) {
    if (!fieldsByKey.has(key)) {
      fieldsByKey.set(key, friendlyConfigFieldForKey(key, config));
    }
  }

  for (const key of Object.keys(config)) {
    if (!fieldsByKey.has(key)) {
      fieldsByKey.set(key, friendlyConfigFieldForKey(key, config));
    }
  }

  return [...fieldsByKey.values()].sort((a, b) => {
    if (a.advanced !== b.advanced) return a.advanced ? 1 : -1;
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

function configFieldValue(field: ConfigField, config: Record<string, unknown>): unknown {
  if (config[field.key] !== undefined) return config[field.key];
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "boolean") return false;
  return "";
}

function formatConfigFieldTextareaValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function coerceConfigFieldValue(field: ConfigField, value: string, previousValue: unknown): unknown {
  if (field.type === "number") {
    if (!value.trim()) return "";
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : previousValue;
  }

  if (field.type === "json") {
    if (!value.trim()) return "";
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function formatTimestamp(value?: number): string {
  if (!value) return "Not started";
  return new Date(value).toLocaleString();
}

function formatDuration(run: WorkflowRunDoc): string {
  const start = run.startedAt ?? run.createdAt;
  const end = run.completedAt ?? Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function nodeExecutionStatus(
  nodeId: string,
  run: WorkflowRunDoc | null
): WorkflowCanvasNodeExecutionStatus | undefined {
  if (!run) return undefined;
  if (run.errorNodeId === nodeId) return "failed";
  if (run.currentNodeId === nodeId && run.status === "running") return "running";
  if (run.currentNodeId === nodeId && run.status === "completed") return "completed";
  return undefined;
}

export function WorkflowCanvasPage() {
  const { workflowId } = useParams();
  const workflow = useQuery(
    api.workflows.definitions.get,
    workflowId ? { id: workflowId as Id<"workflows"> } : "skip"
  );
  const workflowRuns = useQuery(
    api.workflows.runs.list,
    workflowId ? { workflowId: workflowId as Id<"workflows"> } : "skip"
  );
  const updateGraph = useMutation(api.workflows.definitions.updateGraph);
  const createManualRun = useMutation(api.workflows.runs.createManualRun);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [runActionStatus, setRunActionStatus] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<Id<"workflowRuns"> | null>(null);

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
  const selectedProviderCatalogName = isProviderCatalogName(selectedNode?.data.provider)
    ? selectedNode.data.provider
    : undefined;
  const selectedProviderModels = useQuery(
    api.providers.modelCatalog.list,
    selectedProviderCatalogName ? { provider: selectedProviderCatalogName } : "skip"
  );
  const selectedProviderModel = useMemo(
    () =>
      selectedProviderModels?.find(
        (model) => model.modelId === selectedNode?.data.model
      ) ?? null,
    [selectedNode?.data.model, selectedProviderModels]
  );
  const selectedConfigFields = useMemo(
    () =>
      selectedNode
        ? configFieldsForNode(
            selectedNode.data.type,
            selectedNode.data.config,
            selectedProviderModel
          )
        : [],
    [selectedNode, selectedProviderModel]
  );
  const selectedPrimaryConfigFields = selectedConfigFields.filter((field) => !field.advanced);
  const selectedAdvancedConfigFields = selectedConfigFields.filter((field) => field.advanced);
  const editableGraph = useMemo(
    () => (workflow ? toWorkflowGraph(workflow.graph as WorkflowGraph, nodes, edges) : null),
    [edges, nodes, workflow]
  );
  const graphValidation = useMemo(
    () => (editableGraph ? validateWorkflowGraph(editableGraph) : null),
    [editableGraph]
  );
  const selectedRun = useMemo(
    () =>
      workflowRuns?.find((run) => run._id === selectedRunId) ??
      workflowRuns?.[0] ??
      null,
    [selectedRunId, workflowRuns]
  );
  const selectedRunEvents = useQuery(
    api.workflows.runs.getEvents,
    selectedRun ? { workflowRunId: selectedRun._id } : "skip"
  );
  const selectedRunArtifacts = useQuery(
    api.artifacts.records.list,
    selectedRun ? { workflowRunId: selectedRun._id } : "skip"
  );
  const nodesWithExecutionState = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          executionStatus: nodeExecutionStatus(node.id, selectedRun),
        },
      })),
    [nodes, selectedRun]
  );
  const selectedNodeRunEvents = selectedNode
    ? selectedRunEvents?.filter((event) => event.nodeId === selectedNode.id) ?? []
    : [];

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

  useEffect(() => {
    if (!workflowRuns) return;
    if (!workflowRuns.length) {
      setSelectedRunId(null);
      return;
    }
    if (selectedRunId && workflowRuns.some((run) => run._id === selectedRunId)) return;

    setSelectedRunId(workflowRuns[0]._id);
  }, [selectedRunId, workflowRuns]);

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

  const handleCreateManualRun = useCallback(async () => {
    if (!workflow) return;

    if (isDirty) {
      setRunActionStatus("Save the workflow graph before starting a run.");
      return;
    }

    if (!graphValidation?.valid) {
      setRunActionStatus(graphValidation?.errors[0]?.message ?? "Workflow graph is invalid.");
      return;
    }

    setIsCreatingRun(true);
    setRunActionStatus("");

    try {
      const runId = await createManualRun({ workflowId: workflow._id });
      setSelectedRunId(runId);
      setRunActionStatus("Run queued");
    } catch (error) {
      setRunActionStatus(getErrorMessage(error));
    } finally {
      setIsCreatingRun(false);
    }
  }, [createManualRun, graphValidation, isDirty, workflow]);

  const renderConfigField = (field: ConfigField) => {
    if (!selectedNode) return null;

    const value = configFieldValue(field, selectedNode.data.config);

    return (
      <label className="workflow-inspector-field" key={field.key}>
        <span>
          {field.label}
          {field.required ? " *" : ""}
        </span>
        {field.type === "boolean" ? (
          <input
            checked={Boolean(value)}
            onChange={(event) => updateSelectedConfigValue(field.key, event.target.checked)}
            type="checkbox"
          />
        ) : field.type === "enum" ? (
          <select
            onChange={(event) => updateSelectedConfigValue(field.key, event.target.value)}
            value={String(value)}
          >
            {!field.required ? <option value="">Unset</option> : null}
            {(field.enumValues ?? []).map((option) => (
              <option key={option} value={option}>
                {formatConfigLabel(option)}
              </option>
            ))}
          </select>
        ) : field.type === "json" ? (
          <textarea
            onChange={(event) =>
              updateSelectedConfigValue(
                field.key,
                coerceConfigFieldValue(field, event.target.value, value)
              )
            }
            spellCheck={false}
            value={formatConfigFieldTextareaValue(value)}
          />
        ) : (
          <input
            onChange={(event) =>
              updateSelectedConfigValue(
                field.key,
                coerceConfigFieldValue(field, event.target.value, value)
              )
            }
            type={field.type === "number" ? "number" : "text"}
            value={String(value)}
          />
        )}
        {field.description ? <small>{field.description}</small> : null}
      </label>
    );
  };

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
              nodes={nodesWithExecutionState}
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
                    onChange={(event) => {
                      const provider = event.target.value
                        ? (event.target.value as WorkflowProviderName)
                        : undefined;

                      updateSelectedNodeData((data) => ({
                        provider,
                        model: provider === data.provider ? data.model : undefined,
                      }));
                    }}
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
                  <select
                    disabled={
                      selectedNodeDefinition.providerRequirement === "none" ||
                      !selectedProviderCatalogName ||
                      !selectedProviderModels?.length
                    }
                    onChange={(event) =>
                      updateSelectedNodeData(() => ({
                        model: event.target.value || undefined,
                      }))
                    }
                    value={selectedNode.data.model ?? ""}
                  >
                    <option value="">
                      {selectedProviderCatalogName
                        ? selectedProviderModels === undefined
                          ? "Loading models"
                          : "Select model"
                        : "No model catalog"}
                    </option>
                    {selectedNode.data.model && !selectedProviderModel ? (
                      <option value={selectedNode.data.model}>{selectedNode.data.model}</option>
                    ) : null}
                    {(selectedProviderModels ?? []).map((model) => (
                      <option key={model._id} value={model.modelId}>
                        {model.displayName} ({model.category})
                      </option>
                    ))}
                  </select>
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
                  <span>
                    {selectedProviderModel
                      ? selectedProviderModel.displayName
                      : selectedNodeDefinition.configSchemaMode.replace(/_/g, " ")}
                  </span>
                </div>

                {selectedPrimaryConfigFields.length ? (
                  selectedPrimaryConfigFields.map((field) => renderConfigField(field))
                ) : (
                  <p className="workflow-inspector-empty">This node has no static config yet.</p>
                )}

                {selectedAdvancedConfigFields.length ? (
                  <div className="workflow-inspector-advanced">
                    <div className="workflow-inspector-section-heading">
                      <h3>Advanced</h3>
                      <span>{selectedAdvancedConfigFields.length} fields</span>
                    </div>
                    {selectedAdvancedConfigFields.map((field) => renderConfigField(field))}
                  </div>
                ) : null}
              </div>

              <div className="workflow-inspector-group">
                <div className="workflow-inspector-section-heading">
                  <h3>Run Debug</h3>
                  <span>{selectedRun ? formatStatus(selectedRun.status) : "No run"}</span>
                </div>
                {selectedNodeRunEvents.length ? (
                  <div className="workflow-node-event-list">
                    {selectedNodeRunEvents.map((event) => (
                      <div className="workflow-node-event" key={event._id}>
                        <span>{formatStatus(event.type)}</span>
                        <p>{event.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="workflow-inspector-empty">
                    No node events or debug artifacts for the selected run yet.
                  </p>
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

        <section className="workflow-execution-panel" aria-label="Workflow execution panel">
          <div className="workflow-execution-header">
            <div>
              <h2>Execution</h2>
              <p>
                Runs use the saved graph only. Editing nodes or edges never starts execution.
              </p>
            </div>
            <button
              className="primary-button"
              disabled={isCreatingRun || isDirty || !graphValidation?.valid}
              onClick={() => {
                void handleCreateManualRun();
              }}
              type="button"
            >
              <Play size={16} />
              {isCreatingRun ? "Queueing" : "Run workflow"}
            </button>
          </div>

          <div className="workflow-execution-summary">
            <span>
              <Activity size={14} />
              {graphValidation?.valid ? "Graph valid" : "Graph needs attention"}
            </span>
            <span>
              <Clock size={14} />
              {workflow.trigger === "schedule" ? "Scheduled trigger" : "Manual trigger"}
            </span>
            <span>
              <AlertCircle size={14} />
              {workflow.isActive ? "Active" : "Paused"}
            </span>
            <span>{workflowRuns?.length ?? 0} runs</span>
          </div>

          {isDirty ? (
            <p className="workflow-execution-warning">Save graph changes before starting a run.</p>
          ) : null}
          {!graphValidation?.valid && graphValidation?.errors[0] ? (
            <p className="workflow-execution-warning">{graphValidation.errors[0].message}</p>
          ) : null}
          {runActionStatus ? <p className="workflow-execution-status">{runActionStatus}</p> : null}

          <div className="workflow-execution-grid">
            <div className="workflow-run-history">
              <div className="workflow-execution-section-heading">
                <h3>Recent Runs</h3>
                <span>{workflowRuns ? `${workflowRuns.length}` : "Loading"}</span>
              </div>
              {!workflowRuns ? (
                <p className="workflow-inspector-empty">Loading runs...</p>
              ) : workflowRuns.length ? (
                <div className="workflow-run-list">
                  {workflowRuns.slice(0, 8).map((run) => (
                    <button
                      className={`workflow-run-row${
                        selectedRun?._id === run._id ? " workflow-run-row-selected" : ""
                      }`}
                      key={run._id}
                      onClick={() => setSelectedRunId(run._id)}
                      type="button"
                    >
                      <span className={`workflow-run-status workflow-run-status-${run.status}`}>
                        {formatStatus(run.status)}
                      </span>
                      <strong>{formatTimestamp(run.createdAt)}</strong>
                      <small>{run.summary || run.errorMessage || "Workflow run record"}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="workflow-inspector-empty">No runs for this workflow yet.</p>
              )}
            </div>

            <div className="workflow-run-detail">
              <div className="workflow-execution-section-heading">
                <h3>Selected Run</h3>
                <span>{selectedRun ? formatStatus(selectedRun.status) : "None"}</span>
              </div>

              {selectedRun ? (
                <>
                  <div className="workflow-run-metrics">
                    <span>
                      <strong>Started</strong>
                      {formatTimestamp(selectedRun.startedAt)}
                    </span>
                    <span>
                      <strong>Duration</strong>
                      {formatDuration(selectedRun)}
                    </span>
                    <span>
                      <strong>Cost</strong>
                      {selectedRun.costUsd ? `$${selectedRun.costUsd.toFixed(4)}` : "$0"}
                    </span>
                    <span>
                      <strong>Current node</strong>
                      {selectedRun.currentNodeId || selectedRun.errorNodeId || "None"}
                    </span>
                  </div>

                  {selectedRun.errorMessage ? (
                    <p className="workflow-execution-warning">{selectedRun.errorMessage}</p>
                  ) : null}

                  <div className="workflow-run-debug-grid">
                    <div>
                      <div className="workflow-execution-section-heading">
                        <h3>Events</h3>
                        <span>{selectedRunEvents ? selectedRunEvents.length : "Loading"}</span>
                      </div>
                      {selectedRunEvents?.length ? (
                        <div className="workflow-run-event-list">
                          {selectedRunEvents.map((event) => (
                            <div className="workflow-run-event" key={event._id}>
                              <span>{formatStatus(event.type)}</span>
                              <strong>{event.nodeId || "Workflow"}</strong>
                              <p>{event.message}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="workflow-inspector-empty">No events recorded yet.</p>
                      )}
                    </div>

                    <div>
                      <div className="workflow-execution-section-heading">
                        <h3>Artifacts</h3>
                        <span>
                          {selectedRunArtifacts ? selectedRunArtifacts.length : "Loading"}
                        </span>
                      </div>
                      {selectedRunArtifacts?.length ? (
                        <div className="workflow-run-artifact-list">
                          {selectedRunArtifacts.map((artifact) => (
                            <div className="workflow-run-artifact" key={artifact._id}>
                              <span>{formatStatus(artifact.type)}</span>
                              <strong>{artifact.title || "Untitled artifact"}</strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="workflow-inspector-empty">
                          No artifacts have been produced for this run yet.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="workflow-inspector-empty">Select or create a run to inspect it.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
