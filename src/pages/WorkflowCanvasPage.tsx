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
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Box,
  Brain,
  Check,
  ChevronDown,
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
  Search,
  Send,
  Sparkles,
  Upload,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
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
  WorkflowProviderName,
} from "../lib/workflowGraph";
import {
  getWorkflowNodeDefinition,
  isWorkflowNodeType,
  listWorkflowNodeDefinitions,
  type WorkflowNodeCatalogEntry,
} from "../lib/workflowNodeCatalog";
import {
  getWorkflowAgentPreset,
  workflowAgentPresetIds,
} from "../lib/workflowAgentPresets";
import { validateWorkflowGraph } from "../lib/workflowGraphValidation";
import {
  automaticTargetPortForSource,
  portTypesAreCompatible,
  WORKFLOW_CANVAS_INPUT_HANDLE_ID,
} from "../lib/workflowPortMapping";
import { postCompilerPresetIds } from "../lib/postCompilerPresets";

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
type ProviderCatalogName = Exclude<WorkflowProviderName, "postiz" | "post_bridge">;
type ProviderModelDoc = Doc<"providerModels">;
type WorkflowRunDoc = Doc<"workflowRuns">;
type WorkflowRunNodeStateDoc = Doc<"workflowRunNodeStates">;
type WorkflowCanvasNodeExecutionStatus =
  | "queued"
  | "running"
  | "failed"
  | "blocked"
  | "completed";
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

type WorkflowSelectOption = {
  value: string;
  label: string;
  description?: string;
  meta?: string;
  recommendationTag?: string;
  tags?: string[];
};

type WorkflowSelectProps = {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: WorkflowSelectOption[];
  placeholder: string;
  rich?: boolean;
  value?: string;
};

type ImageModelUiContract = {
  prompt: {
    visible: boolean;
    required: boolean;
    canComeFromInput: boolean;
    canBeConfiguredLocally: boolean;
  };
  images: {
    visible: boolean;
    required: boolean;
    canComeFromInput: boolean;
    canBeUploadedLocally: boolean;
    multiple: boolean;
    maxCount?: number;
  };
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
];

const BULKAPIS_IMAGE_MODEL_FALLBACKS = [
  { modelId: "nano-banana-2", displayName: "Nano Banana 2" },
  { modelId: "nano-banana-pro", displayName: "Nano Banana Pro" },
  { modelId: "nano-banana-edit", displayName: "Nano Banana Edit" },
  { modelId: "seedream-4.5", displayName: "Seedream 4.5" },
  { modelId: "gpt-image-2", displayName: "GPT Image 2" },
  { modelId: "gpt-image-2-edit", displayName: "GPT Image 2 Edit" },
  { modelId: "gpt-image-1.5", displayName: "GPT Image 1.5" },
  { modelId: "flux-2-pro", displayName: "Flux-2 Pro" },
];

const recommendedImageModels: Record<string, { rank: number; tag: string; note: string }> = {
  "nano-banana-pro": {
    rank: 1,
    tag: "Recommended",
    note: "Recommended default for high-quality image generation and reference-aware editing.",
  },
  "nano-banana-2": {
    rank: 2,
    tag: "Fast default",
    note: "Good everyday default for fast image generation.",
  },
  "gpt-image-2": {
    rank: 3,
    tag: "High quality",
    note: "High-quality option for polished image generation.",
  },
};

const recommendedVideoModels: Record<string, { rank: number; tag: string; note: string }> = {
  "kling-3-0": {
    rank: 1,
    tag: "Recommended",
    note: "Recommended high-quality Kling option for polished video generation.",
  },
  "kling-2-5-turbo": {
    rank: 2,
    tag: "Cheap / fast",
    note: "Cost-conscious option for faster video generation.",
  },
  "seedance-1-5-pro": {
    rank: 3,
    tag: "Cinematic",
    note: "Strong option for cinematic text-to-video and image-to-video work.",
  },
  "runway-aleph": {
    rank: 4,
    tag: "Edit",
    note: "Recommended when the task is transforming or editing existing video.",
  },
};

const recommendedChatModels: Record<string, { rank: number; tag: string; note: string }> = {
  "gpt-5-2": {
    rank: 1,
    tag: "Recommended",
    note: "Strong default for text, planning, captions, and structured workflow reasoning.",
  },
  "gemini-3-flash": {
    rank: 2,
    tag: "Fast default",
    note: "Cost-conscious chat model for quick generation and structured text tasks.",
  },
  "claude-sonnet-4-5": {
    rank: 3,
    tag: "High quality",
    note: "High-quality option for writing, analysis, and agent-style tasks.",
  },
};

const recommendedAudioModels: Record<string, { rank: number; tag: string; note: string }> = {
  "elevenlabs-turbo-2-5": {
    rank: 1,
    tag: "Recommended",
    note: "Fast, practical default for text-to-speech generation.",
  },
  "chatterbox-tts": {
    rank: 2,
    tag: "Voice clone",
    note: "Useful when the task needs voice-cloned speech from a reference audio.",
  },
  "elevenlabs-sfx-v2": {
    rank: 3,
    tag: "Sound effects",
    note: "Use for generating sound effects from text descriptions.",
  },
};

const recommendedLipsyncModels: Record<string, { rank: number; tag: string; note: string }> = {
  "omnihuman-1-5": {
    rank: 1,
    tag: "Recommended",
    note: "Higher quality lip-sync option for audio-driven human video.",
  },
  "fabric-1-0": {
    rank: 2,
    tag: "Fast default",
    note: "Practical lip-sync option when speed and cost matter.",
  },
};

const recommendedVideoRenderModels: Record<string, { rank: number; tag: string; note: string }> = {
  "music-edit-render-auto": {
    rank: 1,
    tag: "Recommended",
    note: "Agent-assisted render option for music-edit style video assembly.",
  },
  "music-edit-render": {
    rank: 2,
    tag: "Advanced",
    note: "Detailed render model for explicit asset/template control.",
  },
};

const modelDisplayNameOverrides: Record<string, string> = {
  "chatterbox-tts": "Chatterbox TTS",
  "claude-sonnet-4-5": "Claude Sonnet 4.5",
  "elevenlabs-sfx-v2": "ElevenLabs Sound Effect V2",
  "elevenlabs-turbo-2-5": "ElevenLabs Turbo 2.5",
  "fabric-1-0": "VEED Fabric 1.0",
  "flux-2-pro": "Flux-2 Pro",
  "gemini-3-flash": "Gemini 3 Flash",
  "gpt-5-2": "GPT-5.2",
  "gpt-image-1": "GPT Image 1",
  "gpt-image-1.5": "GPT Image 1.5",
  "gpt-image-2": "GPT Image 2",
  "gpt-image-2-edit": "GPT Image 2 Edit",
  "kling-2-5-turbo": "Kling 2.5 Turbo Pro",
  "kling-3-0": "Kling 3.0",
  "music-edit-render": "Music Edit Render",
  "music-edit-render-auto": "Music Edit Render Auto",
  "nano-banana-2": "Nano Banana 2",
  "nano-banana-edit": "Nano Banana Edit",
  "nano-banana-pro": "Nano Banana Pro",
  "omnihuman-1-5": "OmniHuman v1.5",
  "seedance-1-5-pro": "Seedance 1.5 Pro",
  "seedream-4.5": "Seedream 4.5",
};

type ProviderModelCategory = ProviderModelDoc["category"];

function modelCategoryForNodeType(type: WorkflowNodeType): ProviderModelCategory | undefined {
  switch (type) {
    case "llm":
    case "ai_agent":
    case "native_slideshow_planner":
      return "chat";
    case "image_generation":
      return "image";
    case "video_generation":
      return "video";
    case "audio_generation":
      return "audio";
    case "lipsync":
      return "lipsync";
    case "ai_video_editor":
      return "video_render";
    default:
      return undefined;
  }
}

function recommendationMapForNodeType(
  type: WorkflowNodeType
): Record<string, { rank: number; tag: string; note: string }> | null {
  switch (type) {
    case "llm":
    case "ai_agent":
    case "native_slideshow_planner":
      return recommendedChatModels;
    case "image_generation":
      return recommendedImageModels;
    case "video_generation":
      return recommendedVideoModels;
    case "audio_generation":
      return recommendedAudioModels;
    case "lipsync":
      return recommendedLipsyncModels;
    case "ai_video_editor":
      return recommendedVideoRenderModels;
    default:
      return null;
  }
}

function recommendedModelIdForNodeType(type: WorkflowNodeType): string | undefined {
  const recommendations = recommendationMapForNodeType(type);

  if (!recommendations) return undefined;

  return Object.entries(recommendations).sort(([, a], [, b]) => a.rank - b.rank)[0]?.[0];
}

function formatModelDisplayName(modelId: string): string {
  const override = modelDisplayNameOverrides[modelId];
  if (override) return override;

  return modelId
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^gpt$/i.test(part)) return "GPT";
      if (/^ai$/i.test(part)) return "AI";
      if (/^\d+(?:\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function configSectionTitleForNodeType(type: WorkflowNodeType): string {
  if ([
    "ai_video_editor",
    "ai_agent",
    "audio_generation",
    "image_generation",
    "lipsync",
    "llm",
    "native_slideshow_planner",
    "video_generation",
  ].includes(type)) {
    return "Inputs";
  }

  if (type === "media") return "Media";
  if (type === "auto_post") return "Publishing";
  if (type === "export") return "Export";
  return "Config";
}

type PaletteTooltipState = {
  label: string;
  description: string;
  top: number;
  left: number;
};

const retentionOptions: Array<{ value: NodeRetentionMode; label: string }> = [
  { value: "inherit", label: "Inherit workflow default" },
  { value: "keep", label: "Keep output" },
  { value: "discard", label: "Discard output" },
  { value: "keep_on_failure", label: "Keep on failure" },
];

const hiddenImageGenerationConfigKeys = new Set([
  "audio_url",
  "audio_urls",
  "audioUrl",
  "end_frame",
  "end_frame_url",
  "image_input",
  "input_url",
  "image_url",
  "image_urls",
  "input_urls",
  "max_tokens",
  "messages",
  "reference_image",
  "reference_image_url",
  "reference_image_urls",
  "referenceImageUrl",
  "reference_video",
  "reference_video_url",
  "reference_video_urls",
  "referenceVideoUrl",
  "resolution",
  "seed",
  "song_url",
  "start_frame",
  "start_frame_url",
  "upscale_factor",
  "video_url",
  "video_urls",
  "videoUrl",
  "webhook_url",
  "webhookUrl",
]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

const primaryConfigFieldKeys = new Set([
  "agentMode",
  "analysisFocus",
  "aspectRatio",
  "audioFromInputNode",
  "audioUrl",
  "autoPublish",
  "captionFromInputNode",
  "creativeAssetIds",
  "caption",
  "count",
  "cta",
  "destination",
  "durationSeconds",
  "endFrameUrl",
  "failureBehavior",
  "fileName",
  "folder",
  "fps",
  "height",
  "hookStyle",
  "imageUrl",
  "imageFromInputNode",
  "intervalHours",
  "localReferenceAudios",
  "localReferenceImages",
  "localReferenceVideos",
  "maxDurationSeconds",
  "maxTokens",
  "mediaFromInputNode",
  "mode",
  "motionStyle",
  "name",
  "optimizeFor",
  "platform",
  "personaIds",
  "postType",
  "prompt",
  "promptFromInputNode",
  "referenceImageUrl",
  "referenceVideoUrl",
  "removeSilence",
  "renderMode",
  "request",
  "requestFromInputNode",
  "resolution",
  "responseFormat",
  "retryCount",
  "runsPerExecution",
  "scheduleDayOfWeek",
  "scheduleHour",
  "scheduleMinute",
  "scheduledAt",
  "scheduleType",
  "scriptLengthSeconds",
  "seed",
  "slideCount",
  "startFrameUrl",
  "systemPrompt",
  "temperature",
  "text",
  "textFromInputNode",
  "timeoutSeconds",
  "timezone",
  "tone",
  "trigger",
  "turboMode",
  "uploadedMedia",
  "videoUrl",
  "voice",
  "voiceFromInputNode",
  "voiceReferenceUrl",
  "variationGoal",
  "webhookUrl",
  "width",
]);

function WorkflowCanvasNode({ data }: NodeProps<WorkflowFlowNode>) {
  const definition = getWorkflowNodeDefinition(data.type);
  const Icon = nodeIcons[data.type] ?? Box;
  const executionClass = data.executionStatus
    ? ` workflow-node-execution-${data.executionStatus}`
    : "";
  const hasInputHandle = data.type !== "runner";
  const showModelStatus =
    Boolean(modelCategoryForNodeType(data.type)) &&
    Boolean(data.model);

  return (
    <div
      className={`workflow-node workflow-node-${definition.role}${
        showModelStatus ? " workflow-node-with-model" : ""
      }${executionClass}`}
    >
      {hasInputHandle ? (
        <Handle
          className="workflow-port workflow-port-input"
          id={WORKFLOW_CANVAS_INPUT_HANDLE_ID}
          position={Position.Left}
          style={{ top: "50%" }}
          type="target"
        />
      ) : null}

      <div className="workflow-node-header">
        <span className="workflow-node-icon">
          <Icon size={16} />
        </span>
        <span>{data.label}</span>
      </div>
      {data.executionStatus ? (
        <span className="workflow-node-run-state">{data.executionStatus}</span>
      ) : null}
      {showModelStatus ? (
        <div className="workflow-node-model">
          <strong>{formatModelDisplayName(String(data.model))}</strong>
        </div>
      ) : null}

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

function WorkflowSelect({
  disabled = false,
  onChange,
  options,
  placeholder,
  rich = false,
  value,
}: WorkflowSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = rich && query.trim()
    ? options.filter((option) => {
        const haystack = [
          option.label,
          option.description,
          option.meta,
          ...(option.tags ?? []),
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      })
    : options;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!selectRef.current?.contains(event.target as globalThis.Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div className={`workflow-select${rich ? " workflow-select-rich" : ""}`} ref={selectRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="workflow-select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            setQuery("");
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        type="button"
      >
        <span className="workflow-select-trigger-copy">
          <strong>{selectedOption?.label ?? placeholder}</strong>
          {selectedOption?.description || selectedOption?.meta ? (
            <small>{selectedOption.description ?? selectedOption.meta}</small>
          ) : null}
        </span>
        <ChevronDown size={15} />
      </button>

      {isOpen ? (
        <div className="workflow-select-popover" role="listbox">
          {rich ? (
            <label className="workflow-select-search">
              <Search size={14} />
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                type="search"
                value={query}
              />
            </label>
          ) : null}
          <div className="workflow-select-options">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    aria-selected={selected}
                    className={`workflow-select-option${selected ? " workflow-select-option-selected" : ""}`}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      setQuery("");
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="workflow-select-option-main">
                      <span>
                        <span className="workflow-select-title-line">
                          <strong>{option.label}</strong>
                          {option.recommendationTag ? <b>{option.recommendationTag}</b> : null}
                        </span>
                        {option.meta ? <em>{option.meta}</em> : null}
                      </span>
                      {selected ? <Check size={14} /> : null}
                    </span>
                    {option.description ? <small>{option.description}</small> : null}
                    {option.tags?.length ? (
                      <span className="workflow-select-tags">
                        {option.tags.slice(0, 5).map((tag) => (
                          <b key={tag}>{tag}</b>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <span className="workflow-select-empty">No matches</span>
            )}
          </div>
        </div>
      ) : null}
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
        model: node.model ?? recommendedModelIdForNodeType(node.type),
        provider: node.provider ?? getWorkflowNodeDefinition(node.type).defaultProvider,
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
    targetHandle: WORKFLOW_CANVAS_INPUT_HANDLE_ID,
    animated: false,
    deletable: true,
    type: "bezier",
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

  const directPropertyEntries = Object.entries(candidateSchema).filter(([key, value]) =>
    key !== "required" &&
    isRecord(value) &&
    (
      typeof value.type === "string" ||
      Array.isArray(value.enum) ||
      Array.isArray(value.options) ||
      value.default !== undefined ||
      typeof value.description === "string"
    )
  );

  if (directPropertyEntries.length) {
    const requiredKeys = new Set(
      Array.isArray(candidateSchema.required)
        ? candidateSchema.required.map((key) => String(key))
        : []
    );

    return directPropertyEntries.map(([key, rawProperty]) => {
      const property = rawProperty as Record<string, unknown>;
      const enumValues = enumValuesFromSchemaProperty(property);
      const type = schemaPropertyFieldType(property);

      return {
        key,
        label: typeof property.title === "string" ? property.title : formatConfigLabel(key),
        type,
        required: property.required === true || requiredKeys.has(key),
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

function friendlyConfigFieldKeysForNode(
  type: WorkflowNodeType,
  config: Record<string, unknown>
): string[] {
  switch (type) {
    case "runner":
      return [
        "trigger",
        "scheduleType",
        "intervalHours",
        "timezone",
        "runsPerExecution",
        "retryCount",
        "timeoutSeconds",
        "failureBehavior",
      ];
    case "comment":
      return ["text"];
    case "media":
      return ["artifactIds", "creativeAssetIds", "personaIds", "uploadedMedia"];
    case "llm":
      return ["systemPrompt", "promptFromInputNode", "prompt", "responseFormat", "temperature", "maxTokens"];
    case "ai_agent":
      return getWorkflowAgentPreset(config.agentMode).configKeys;
    case "image_generation":
      return [
        "promptFromInputNode",
        "prompt",
        "imageFromInputNode",
        "localReferenceImages",
        "aspectRatio",
        "count",
      ];
    case "video_generation":
      return [
        "promptFromInputNode",
        "prompt",
        "imageFromInputNode",
        "localReferenceImages",
        "localReferenceVideos",
        "aspectRatio",
        "durationSeconds",
        "resolution",
      ];
    case "audio_generation":
      return [
        "mode",
        "textFromInputNode",
        "text",
        "voiceFromInputNode",
        "localReferenceAudios",
        "voice",
        "temperature",
        "cfgScale",
        "removeSilence",
      ];
    case "lipsync":
      return [
        "imageFromInputNode",
        "localReferenceImages",
        "localReferenceVideos",
        "audioFromInputNode",
        "localReferenceAudios",
        "resolution",
        "turboMode",
      ];
    case "native_slideshow_planner":
      return ["promptFromInputNode", "prompt", "slideCount", "aspectRatio", "platform", "tone"];
    case "native_slideshow_renderer":
      return ["renderMode", "aspectRatio", "resolution"];
    case "ai_video_editor":
      return [
        "renderMode",
        "promptFromInputNode",
        "prompt",
        "mediaFromInputNode",
        "uploadedMedia",
        "systemPrompt",
        "knowledgeBase",
        "aspectRatio",
        "maxDurationSeconds",
      ];
    case "post_compiler":
      return ["postType", "platformPreset", "captionFromInputNode", "caption", "name", "optimizeForPlatforms"];
    case "export":
      return ["destination", "folder", "fileName", "optimizeFor"];
    case "auto_post":
      return ["autoPublish", "socialAccountIds", "captionFromInputNode", "caption", "scheduledAt", "timezone"];
  }
}

function friendlyConfigFieldForKey(key: string, config: Record<string, unknown>): ConfigField {
  const currentValue = config[key];
  const inferredType = schemaFieldTypeFromValue(currentValue);
  const defaultField: ConfigField = {
    key,
    label: formatConfigLabel(key),
    type: inferredType,
    required: false,
    advanced: isAdvancedConfigField(key, inferredType),
  };

  switch (key) {
    case "agentMode":
      return {
        ...defaultField,
        type: "enum",
        enumValues: workflowAgentPresetIds(),
      };
    case "aspectRatio":
      return {
        ...defaultField,
        type: "enum",
        enumValues: ["9:16", "16:9", "1:1", "4:5", "3:4"],
      };
    case "autoPublish":
    case "audioFromInputNode":
    case "captionFromInputNode":
    case "imageFromInputNode":
    case "mediaFromInputNode":
    case "promptFromInputNode":
    case "removeSilence":
    case "requestFromInputNode":
    case "textFromInputNode":
    case "turboMode":
    case "voiceFromInputNode":
      return {
        ...defaultField,
        label: key === "promptFromInputNode"
          ? "Prompt from input node"
          : key === "imageFromInputNode"
            ? "Image from input node"
            : key === "audioFromInputNode"
              ? "Audio from input node"
              : key === "captionFromInputNode"
                ? "Caption from input node"
              : key === "mediaFromInputNode"
                ? "Media from input node"
                : key === "requestFromInputNode"
                  ? "Request from input node"
                  : key === "textFromInputNode"
                    ? "Text from input node"
                    : key === "voiceFromInputNode"
                      ? "Voice from input node"
            : defaultField.label,
        type: "boolean",
      };
    case "count":
    case "durationSeconds":
    case "intervalHours":
    case "maxDurationSeconds":
    case "maxTokens":
    case "retryCount":
    case "runsPerExecution":
    case "scheduleDayOfWeek":
    case "scheduleHour":
    case "scheduleMinute":
    case "scriptLengthSeconds":
    case "seed":
    case "slideCount":
    case "temperature":
    case "timeoutSeconds":
    case "cfgScale":
    case "fps":
    case "height":
    case "width":
      return { ...defaultField, type: "number" };
    case "failureBehavior":
      return {
        ...defaultField,
        type: "enum",
        enumValues: ["stop_workflow", "continue_dependents", "skip_dependents"],
      };
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
    case "platformPreset":
      return {
        ...defaultField,
        type: "enum",
        enumValues: postCompilerPresetIds(),
      };
    case "renderMode":
      return {
        ...defaultField,
        type: "enum",
        enumValues: ["video_render", "music_edit", "native"],
      };
    case "responseFormat":
      return { ...defaultField, type: "enum", enumValues: ["text", "json"] };
    case "scheduleType":
      return {
        ...defaultField,
        type: "enum",
        enumValues: ["interval", "daily", "weekly"],
      };
    case "trigger":
      return { ...defaultField, type: "enum", enumValues: ["manual", "schedule", "event"] };
    case "assetIds":
    case "artifactIds":
    case "creativeAssetIds":
    case "personaIds":
    case "knowledgeBase":
    case "localReferenceAudios":
    case "localReferenceImages":
    case "localReferenceVideos":
    case "lockedDetails":
    case "avoid":
    case "platforms":
    case "uploadedMedia":
      return {
        ...defaultField,
        label: key === "localReferenceImages"
          ? "Reference images"
          : key === "localReferenceVideos"
            ? "Reference videos"
            : key === "localReferenceAudios"
              ? "Reference audio"
              : defaultField.label,
        type: "json",
        advanced: ![
          "localReferenceImages",
          "localReferenceVideos",
          "localReferenceAudios",
          "uploadedMedia",
        ].includes(key),
      };
    default:
      return defaultField;
  }
}

function isAdvancedConfigField(key: string, type: ConfigFieldType): boolean {
  if (type === "json") return true;

  return !primaryConfigFieldKeys.has(key);
}

function imageConfigFieldHiddenByContract(
  key: string,
  selectedModel: ProviderModelDoc | null,
  imageContract?: ImageModelUiContract | null
): boolean {
  if ((key === "prompt" || key === "promptFromInputNode") && imageContract?.prompt.visible === false) {
    return true;
  }

  if (key === "promptFromInputNode" && imageContract?.prompt.canComeFromInput === false) {
    return true;
  }

  if (key === "prompt" && imageContract?.prompt.canBeConfiguredLocally === false) {
    return true;
  }

  if (
    (key === "localReferenceImages" || key === "imageFromInputNode") &&
    imageContract?.images.visible === false
  ) {
    return true;
  }

  if (key === "imageFromInputNode" && imageContract?.images.canComeFromInput === false) {
    return true;
  }

  if (key === "localReferenceImages" && imageContract?.images.canBeUploadedLocally === false) {
    return true;
  }

  if (selectedModel && (key === "aspectRatio" || key === "count")) {
    return true;
  }

  return false;
}

function configFieldHiddenForNode(
  type: WorkflowNodeType,
  key: string,
  selectedModel: ProviderModelDoc | null,
  imageContract?: ImageModelUiContract | null
): boolean {
  if (hiddenImageGenerationConfigKeys.has(key)) return true;
  if (type === "image_generation" && imageConfigFieldHiddenByContract(key, selectedModel, imageContract)) {
    return true;
  }

  if (!selectedModel) return false;

  if (type === "video_generation" && ["aspectRatio", "durationSeconds", "resolution"].includes(key)) {
    return true;
  }

  if (type === "lipsync" && ["resolution", "turboMode"].includes(key)) {
    return true;
  }

  if (type === "ai_video_editor" && ["aspectRatio", "maxDurationSeconds", "renderMode"].includes(key)) {
    return true;
  }

  if (type === "audio_generation" && ["cfgScale", "temperature"].includes(key)) {
    return true;
  }

  return false;
}

function configFieldsForNode(
  type: WorkflowNodeType,
  config: Record<string, unknown>,
  selectedModel: ProviderModelDoc | null,
  imageContract?: ImageModelUiContract | null
): ConfigField[] {
  const fieldsByKey = new Map<string, ConfigField>();
  const modelSchemaFields = schemaFieldsFromRecordSchema(selectedModel?.schemaSnapshot?.inputSchema);

  for (const field of modelSchemaFields) {
    if (configFieldHiddenForNode(type, field.key, selectedModel, imageContract)) continue;
    fieldsByKey.set(field.key, field);
  }

  for (const key of friendlyConfigFieldKeysForNode(type, config)) {
    if (configFieldHiddenForNode(type, key, selectedModel, imageContract)) continue;
    if (!fieldsByKey.has(key)) {
      const field = friendlyConfigFieldForKey(key, config);
      fieldsByKey.set(
        key,
        key === "prompt" && imageContract?.prompt.required
          ? { ...field, required: true }
          : field
      );
    }
  }

  for (const key of Object.keys(config)) {
    if (configFieldHiddenForNode(type, key, selectedModel, imageContract)) continue;
    if (!fieldsByKey.has(key)) {
      fieldsByKey.set(key, friendlyConfigFieldForKey(key, config));
    }
  }

  return [...fieldsByKey.values()].sort((a, b) => {
    const fieldOrderByType: Partial<Record<WorkflowNodeType, string[]>> = {
      image_generation: [
        "imageFromInputNode",
        "localReferenceImages",
        "promptFromInputNode",
        "prompt",
        "aspectRatio",
        "count",
      ],
      video_generation: [
        "imageFromInputNode",
        "localReferenceImages",
        "localReferenceVideos",
        "promptFromInputNode",
        "prompt",
        "aspectRatio",
        "durationSeconds",
      ],
      audio_generation: [
        "mode",
        "textFromInputNode",
        "text",
        "voiceFromInputNode",
        "localReferenceAudios",
        "voice",
      ],
      lipsync: [
        "imageFromInputNode",
        "localReferenceImages",
        "localReferenceVideos",
        "audioFromInputNode",
        "localReferenceAudios",
        "resolution",
        "turboMode",
      ],
      ai_video_editor: [
        "mediaFromInputNode",
        "uploadedMedia",
        "promptFromInputNode",
        "prompt",
        "renderMode",
        "systemPrompt",
        "knowledgeBase",
        "aspectRatio",
        "maxDurationSeconds",
      ],
      ai_agent: ["agentMode", "requestFromInputNode", "request", "tone", "platform", "temperature", "maxTokens"],
      llm: ["systemPrompt", "promptFromInputNode", "prompt", "responseFormat", "temperature", "maxTokens"],
      native_slideshow_planner: ["promptFromInputNode", "prompt", "slideCount", "aspectRatio", "platform", "tone"],
      post_compiler: ["postType", "platformPreset", "captionFromInputNode", "caption", "name", "optimizeForPlatforms"],
      auto_post: ["autoPublish", "socialAccountIds", "captionFromInputNode", "caption", "scheduledAt", "timezone"],
    };
    const fieldOrder = fieldOrderByType[type];
    if (fieldOrder) {
      const aIndex = fieldOrder.indexOf(a.key);
      const bIndex = fieldOrder.indexOf(b.key);
      if (aIndex !== bIndex) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
          (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }
    }

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

const defaultImageModelUiContract: ImageModelUiContract = {
  prompt: {
    visible: true,
    required: true,
    canComeFromInput: true,
    canBeConfiguredLocally: true,
  },
  images: {
    visible: true,
    required: false,
    canComeFromInput: true,
    canBeUploadedLocally: true,
    multiple: true,
  },
};

function imageModelUiContractFromModel(
  model: ProviderModelDoc | null | undefined
): ImageModelUiContract {
  const metadata = isRecord(model?.metadata) ? model.metadata : {};
  const uiContract = isRecord(metadata.uiContract) ? metadata.uiContract : {};
  const prompt = isRecord(uiContract.prompt) ? uiContract.prompt : {};
  const images = isRecord(uiContract.images) ? uiContract.images : {};
  const maxCount = typeof images.maxCount === "number" && Number.isFinite(images.maxCount)
    ? images.maxCount
    : undefined;

  return {
    prompt: {
      visible: typeof prompt.visible === "boolean"
        ? prompt.visible
        : defaultImageModelUiContract.prompt.visible,
      required: typeof prompt.required === "boolean"
        ? prompt.required
        : defaultImageModelUiContract.prompt.required,
      canComeFromInput: typeof prompt.canComeFromInput === "boolean"
        ? prompt.canComeFromInput
        : defaultImageModelUiContract.prompt.canComeFromInput,
      canBeConfiguredLocally: typeof prompt.canBeConfiguredLocally === "boolean"
        ? prompt.canBeConfiguredLocally
        : defaultImageModelUiContract.prompt.canBeConfiguredLocally,
    },
    images: {
      visible: typeof images.visible === "boolean"
        ? images.visible
        : defaultImageModelUiContract.images.visible,
      required: typeof images.required === "boolean"
        ? images.required
        : defaultImageModelUiContract.images.required,
      canComeFromInput: typeof images.canComeFromInput === "boolean"
        ? images.canComeFromInput
        : defaultImageModelUiContract.images.canComeFromInput,
      canBeUploadedLocally: typeof images.canBeUploadedLocally === "boolean"
        ? images.canBeUploadedLocally
        : defaultImageModelUiContract.images.canBeUploadedLocally,
      multiple: typeof images.multiple === "boolean"
        ? images.multiple
        : defaultImageModelUiContract.images.multiple,
      ...(maxCount ? { maxCount } : {}),
    },
  };
}

function providerModelSourceLabel(model: ProviderModelDoc | null | undefined): string | undefined {
  const raw = isRecord(model?.schemaSnapshot?.raw) ? model.schemaSnapshot.raw : {};
  const provider = raw.provider;
  return typeof provider === "string" && provider.trim() ? provider.trim() : undefined;
}

function modelInputSchema(model: ProviderModelDoc | null | undefined): Record<string, unknown> {
  const schemaSnapshot = isRecord(model?.schemaSnapshot) ? model.schemaSnapshot : {};
  return isRecord(schemaSnapshot.inputSchema) ? schemaSnapshot.inputSchema : {};
}

function modelSchemaFieldRequired(schema: Record<string, unknown>, key: string): boolean {
  const field = schema[key];
  return isRecord(field) && field.required === true;
}

function providerModelCapabilityTags(
  model: ProviderModelDoc | null | undefined,
  nodeType?: WorkflowNodeType
): string[] {
  if (!model) return [];

  const metadata = isRecord(model.metadata) ? model.metadata : {};
  const providerCapabilities = Array.isArray(metadata.providerCapabilities)
    ? metadata.providerCapabilities.filter((tag): tag is string => typeof tag === "string")
    : [];

  let requirementTags: string[] = [];
  if (nodeType === "image_generation") {
    const contract = imageModelUiContractFromModel(model);
    requirementTags = [
      contract.prompt.visible
        ? contract.prompt.required
          ? "Prompt required"
          : "Prompt optional"
        : "No prompt",
      contract.images.visible
        ? contract.images.required
          ? "Image required"
          : "Images optional"
        : undefined,
      contract.images.visible && contract.images.multiple
        ? contract.images.maxCount
          ? `Up to ${contract.images.maxCount} images`
          : "Multi-image"
        : contract.images.visible
          ? "Single image"
          : undefined,
    ].filter((tag): tag is string => Boolean(tag));
  }

  if (nodeType === "video_generation") {
    const schema = modelInputSchema(model);
    const hasImageInput = [
      "image",
      "image_url",
      "image_urls",
      "start_frame",
      "start_frame_url",
      "end_frame",
      "end_frame_url",
      "reference_image",
      "reference_image_url",
    ].some((key) => schema[key] !== undefined);
    const imageRequired = [
      "image",
      "image_url",
      "image_urls",
      "start_frame",
      "start_frame_url",
    ].some((key) => modelSchemaFieldRequired(schema, key));

    requirementTags = [
      modelSchemaFieldRequired(schema, "prompt") ? "Prompt required" : "Prompt optional",
      hasImageInput ? imageRequired ? "Image required" : "Image optional" : undefined,
    ].filter((tag): tag is string => Boolean(tag));
  }

  return [...new Set([...providerCapabilities, ...requirementTags])];
}

type LocalReferenceFileKind = "image" | "video" | "audio" | "media";

function localReferenceFilesFromConfig(
  config: Record<string, unknown>,
  key: string,
  fallbackKind: LocalReferenceFileKind
) {
  const value = config[key];
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const storageUrl = record.storageUrl ?? record.url;
    if (typeof storageUrl !== "string" || !storageUrl.trim()) return [];

    return [{
      id: typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : storageUrl,
      storageUrl,
      title: typeof record.title === "string" ? record.title : "Reference file",
      mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
      kind: typeof record.kind === "string" ? record.kind : fallbackKind,
    }];
  });
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
  nodeStates: WorkflowRunNodeStateDoc[] | undefined
): WorkflowCanvasNodeExecutionStatus | undefined {
  const nodeState = nodeStates?.find((state) => state.nodeId === nodeId);
  if (!nodeState) return undefined;

  if (nodeState.status === "queued") return "queued";
  if (nodeState.status === "running") return "running";
  if (nodeState.status === "failed") return "failed";
  if (nodeState.status === "blocked") return "blocked";
  if (nodeState.status === "succeeded") return "completed";
  return undefined;
}

export function WorkflowCanvasPage() {
  const { workflowId } = useParams();
  const workflow = useQuery(
    api.workflows.definitions.get,
    workflowId ? { id: workflowId as Id<"workflows"> } : "skip"
  );
  const workflowPersonas = useQuery(
    api.accounts.personas.list,
    workflow?.brandId ? { brandId: workflow.brandId } : "skip"
  );
  const workflowRuns = useQuery(
    api.workflows.runs.list,
    workflowId ? { workflowId: workflowId as Id<"workflows"> } : "skip"
  );
  const updateGraph = useMutation(api.workflows.definitions.updateGraph);
  const createManualRun = useMutation(api.workflows.runs.createManualRun);
  const setWorkflowActive = useMutation(api.workflows.definitions.setActive);
  const uploadReferenceImage = useAction(api.storage.files.uploadBase64ImageWithMetadata);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isUpdatingActiveState, setIsUpdatingActiveState] = useState(false);
  const [isUploadingImageReference, setIsUploadingImageReference] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [runActionStatus, setRunActionStatus] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<Id<"workflowRuns"> | null>(null);
  const [openDrawer, setOpenDrawer] = useState<"node" | "execution" | null>(null);
  const [paletteTooltip, setPaletteTooltip] = useState<PaletteTooltipState | null>(null);

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
  const selectedNodeModelCategory = selectedNode
    ? modelCategoryForNodeType(selectedNode.data.type)
    : undefined;
  const showProviderControl = Boolean(
    selectedNodeDefinition &&
      selectedNodeDefinition.providerRequirement !== "none" &&
      !selectedNodeModelCategory &&
      selectedNode?.data.type !== "auto_post"
  );
  const showModelControl = Boolean(selectedNodeModelCategory);
  const showRetentionControl = selectedNode?.data.type !== "comment";
  const showRunDebugSection = selectedNode?.data.type !== "comment";
  const showPaletteTooltip = useCallback(
    (
      target: HTMLElement,
      definition: WorkflowNodeCatalogEntry,
      isDisabled: boolean
    ) => {
      const rect = target.getBoundingClientRect();
      setPaletteTooltip({
        label: definition.label,
        description: isDisabled ? "Already on canvas" : definition.description,
        top: rect.top + rect.height / 2,
        left: rect.right + 10,
      });
    },
    []
  );
  const selectedModelCategory = selectedNodeModelCategory;
  const selectedProviderCatalogName = selectedModelCategory
    ? "bulkapis"
    : isProviderCatalogName(selectedNode?.data.provider)
      ? selectedNode.data.provider
      : undefined;
  const selectedProviderModels = useQuery(
    api.providers.modelCatalog.list,
    selectedProviderCatalogName
      ? {
          provider: selectedProviderCatalogName,
          ...(selectedModelCategory ? { category: selectedModelCategory } : {}),
        }
      : "skip"
  );
  const selectedModelOptions = useMemo(() => {
    if (selectedNode?.data.type === "image_generation" && !selectedProviderModels?.length) {
      return BULKAPIS_IMAGE_MODEL_FALLBACKS;
    }

    return (selectedProviderModels ?? []).map((model) => ({
      modelId: model.modelId,
      displayName: model.displayName,
    }));
  }, [selectedNode?.data.type, selectedProviderModels]);
  const selectedProviderModel = useMemo(
    () =>
      selectedProviderModels?.find(
        (model) => model.modelId === selectedNode?.data.model
      ) ?? null,
    [selectedNode?.data.model, selectedProviderModels]
  );
  const selectedModelPickerOptions = useMemo(() => {
    const options = selectedModelOptions.map((model) => {
      const modelDoc = selectedProviderModels?.find(
        (providerModel) => providerModel.modelId === model.modelId
      );
      const recommendation = selectedNode
        ? recommendationMapForNodeType(selectedNode.data.type)?.[model.modelId]
        : undefined;

      return {
        value: model.modelId,
        label: model.displayName,
        description: recommendation?.note ?? modelDoc?.description,
        meta: providerModelSourceLabel(modelDoc),
        recommendationTag: recommendation?.tag,
        tags: providerModelCapabilityTags(modelDoc, selectedNode?.data.type),
        rank: recommendation?.rank ?? 1000,
      };
    }).sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.label.localeCompare(b.label);
    });

    if (
      selectedNode?.data.model &&
      !options.some((option) => option.value === selectedNode.data.model)
    ) {
      options.unshift({
        value: selectedNode.data.model,
        label: selectedNode.data.model,
        description: "This model is saved on the node but is not in the current catalog.",
        meta: undefined,
        recommendationTag: undefined,
        tags: ["Saved model"],
        rank: 0,
      });
    }

    return options;
  }, [selectedModelOptions, selectedNode, selectedProviderModels]);
  const selectedImageModelUiContract = useMemo(
    () =>
      selectedNode?.data.type === "image_generation"
        ? imageModelUiContractFromModel(selectedProviderModel)
        : null,
    [selectedNode?.data.type, selectedProviderModel]
  );
  const selectedConfigFields = useMemo(
    () =>
      selectedNode
        ? configFieldsForNode(
            selectedNode.data.type,
            selectedNode.data.config,
            selectedProviderModel,
            selectedImageModelUiContract
          )
        : [],
    [selectedImageModelUiContract, selectedNode, selectedProviderModel]
  );
  const selectedPrimaryConfigFields = selectedConfigFields.filter((field) => !field.advanced);
  const selectedAdvancedConfigFields = selectedConfigFields.filter((field) => field.advanced);
  const editableGraph = useMemo(
    () => (workflow ? toWorkflowGraph(workflow.graph as WorkflowGraph, nodes, edges) : null),
    [edges, nodes, workflow]
  );
  const draftGraphValidation = useMemo(
    () => (editableGraph ? validateWorkflowGraph(editableGraph, "draft") : null),
    [editableGraph]
  );
  const graphValidation = useMemo(
    () => (editableGraph ? validateWorkflowGraph(editableGraph, "executable") : null),
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
  const selectedRunNodeStates = useQuery(
    api.workflows.runs.getNodeStates,
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
          executionStatus: nodeExecutionStatus(node.id, selectedRunNodeStates),
        },
      })),
    [nodes, selectedRunNodeStates]
  );
  const selectedNodeRunState = selectedNode
    ? selectedRunNodeStates?.find((state) => state.nodeId === selectedNode.id) ?? null
    : null;
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
      setOpenDrawer((currentDrawer) => (currentDrawer === "node" ? null : currentDrawer));
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
      const defaultModel = recommendedModelIdForNodeType(type);

      if (type === "runner" && hasRunnerNode) return;

      setNodes((currentNodes) => {
        const nodeId = nextNodeId(type, currentNodes);
        setSelectedNodeId(nodeId);
        setOpenDrawer("node");

        return [
          ...currentNodes,
          {
            id: nodeId,
            type: "workflowNode",
            position: nextNodePosition(currentNodes),
            data: {
              config: cloneConfig(definition.defaultConfig),
              label: definition.label,
              model: defaultModel,
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

  const handleSelectNode = useCallback(
    (node: WorkflowFlowNode) => {
      setSelectedNodeId(node.id);
      setOpenDrawer("node");

      if (node.data.model) return;

      const defaultModel = recommendedModelIdForNodeType(node.data.type);
      if (!defaultModel) return;

      const definition = getWorkflowNodeDefinition(node.data.type);
      setNodes((currentNodes) =>
        currentNodes.map((currentNode) =>
          currentNode.id === node.id
            ? {
                ...currentNode,
                data: {
                  ...currentNode.data,
                  model: defaultModel,
                  provider: currentNode.data.provider ?? definition.defaultProvider,
                },
              }
            : currentNode
        )
      );
      setIsDirty(true);
      setSaveStatus("");
      setConnectionStatus("");
    },
    [setNodes]
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
            type: "bezier",
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

  const updateSelectedBooleanConfigValue = useCallback(
    (key: string, value: boolean) => {
      updateSelectedNodeData((data) => ({
        config: {
          ...data.config,
          [key]: value,
        },
      }));
    },
    [updateSelectedNodeData]
  );

  const handleLocalReferenceFileUpload = useCallback(
    async (
      event: ChangeEvent<HTMLInputElement>,
      configKey: string,
      kind: LocalReferenceFileKind,
      options: { multiple?: boolean; maxCount?: number } = {}
    ) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      event.target.value = "";

      if (!selectedFiles.length || !selectedNode) return;

      setIsUploadingImageReference(true);
      setSaveStatus("");

      try {
        const existingFiles = localReferenceFilesFromConfig(
          selectedNode.data.config,
          configKey,
          kind
        );
        const maxCount = options.maxCount;
        const remainingSlots = maxCount
          ? Math.max(0, maxCount - existingFiles.length)
          : options.multiple === false
            ? 1
            : selectedFiles.length;
        const files = selectedFiles.slice(0, remainingSlots);

        if (!files.length) {
          setSaveStatus(maxCount ? `This field allows up to ${maxCount} file${maxCount === 1 ? "" : "s"}.` : "This field only allows one file.");
          return;
        }

        const uploadedFiles = await Promise.all(
          files.map(async (file) => {
            const uploaded = await uploadReferenceImage({
              base64Data: await readFileAsDataUrl(file),
              filename: file.name,
            });

            return {
              id: String(uploaded.storageId),
              storageUrl: uploaded.storageUrl,
              title: file.name,
              mimeType: uploaded.mimeType,
              kind,
            };
          })
        );

        updateSelectedNodeData((data) => ({
          config: {
            ...data.config,
            [configKey]: [
              ...(options.multiple === false
                ? []
                : localReferenceFilesFromConfig(data.config, configKey, kind)),
              ...uploadedFiles,
            ],
          },
        }));
      } catch (error) {
        setSaveStatus(getErrorMessage(error));
      } finally {
        setIsUploadingImageReference(false);
      }
    },
    [
      selectedNode,
      updateSelectedNodeData,
      uploadReferenceImage,
    ]
  );

  const removeLocalReferenceFile = useCallback(
    (configKey: string, fileId: string, kind: LocalReferenceFileKind) => {
      updateSelectedNodeData((data) => ({
        config: {
          ...data.config,
          [configKey]: localReferenceFilesFromConfig(data.config, configKey, kind).filter(
            (file) => file.id !== fileId
          ),
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
      const validation = validateWorkflowGraph(graph, "draft");

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

  const handleToggleActive = useCallback(async () => {
    if (!workflow) return;

    if (isDirty) {
      setSaveStatus("Save the workflow graph before changing its active state.");
      return;
    }

    setIsUpdatingActiveState(true);
    setSaveStatus("");

    try {
      await setWorkflowActive({ id: workflow._id, isActive: !workflow.isActive });
      setSaveStatus(workflow.isActive ? "Workflow paused" : "Workflow activated");
    } catch (error) {
      setSaveStatus(getErrorMessage(error));
    } finally {
      setIsUpdatingActiveState(false);
    }
  }, [isDirty, setWorkflowActive, workflow]);

  const localFileFieldMeta = useCallback(
    (fieldKey: string): {
      accept: string;
      disabled: boolean;
      disabledCopy: string;
      kind: LocalReferenceFileKind;
      multiple: boolean;
      maxCount?: number;
    } | null => {
      if (!selectedNode) return null;

      if (fieldKey === "localReferenceImages") {
        return {
          accept: "image/*",
          disabled: selectedNode.data.config.imageFromInputNode === true,
          disabledCopy: "Using image data from a connected input node.",
          kind: "image",
          multiple: selectedNode.data.type === "image_generation"
            ? selectedImageModelUiContract?.images.multiple !== false
            : true,
          maxCount: selectedNode.data.type === "image_generation"
            ? selectedImageModelUiContract?.images.maxCount
            : undefined,
        };
      }

      if (fieldKey === "localReferenceVideos") {
        return {
          accept: "video/*",
          disabled: selectedNode.data.config.imageFromInputNode === true ||
            selectedNode.data.config.mediaFromInputNode === true,
          disabledCopy: "Using video/media data from a connected input node.",
          kind: "video",
          multiple: true,
        };
      }

      if (fieldKey === "localReferenceAudios") {
        return {
          accept: "audio/*",
          disabled: selectedNode.data.config.audioFromInputNode === true ||
            selectedNode.data.config.voiceFromInputNode === true,
          disabledCopy: "Using audio data from a connected input node.",
          kind: "audio",
          multiple: true,
        };
      }

      if (fieldKey === "uploadedMedia") {
        return {
          accept: "image/*,video/*,audio/*",
          disabled: selectedNode.data.config.mediaFromInputNode === true,
          disabledCopy: "Using media from a connected input node.",
          kind: "media",
          multiple: true,
        };
      }

      return null;
    },
    [selectedImageModelUiContract?.images.maxCount, selectedImageModelUiContract?.images.multiple, selectedNode]
  );

  const renderConfigField = (field: ConfigField) => {
    if (!selectedNode) return null;

    const value = configFieldValue(field, selectedNode.data.config);
    const isImageGenerationNode = selectedNode.data.type === "image_generation";
    const promptFromInputNode = selectedNode.data.config.promptFromInputNode === true;
    const localTextDisabledByInput =
      (field.key === "caption" && selectedNode.data.config.captionFromInputNode === true) ||
      (field.key === "prompt" && promptFromInputNode) ||
      (field.key === "request" && selectedNode.data.config.requestFromInputNode === true) ||
      (field.key === "text" && selectedNode.data.config.textFromInputNode === true);

    if (field.key === "personaIds") {
      const selectedPersonaIds = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];

      return (
        <div className="workflow-inspector-field" key={field.key}>
          <span>{field.label}</span>
          <div className="workflow-persona-picker">
            {!workflow?.brandId && <small>Select a brand to use personas.</small>}
            {workflow?.brandId && !workflowPersonas && <small>Loading personas...</small>}
            {workflowPersonas?.length === 0 && (
              <small>No personas exist for this workflow brand.</small>
            )}
            {workflowPersonas?.map((persona) => {
              const personaId = String(persona._id);
              const selected = selectedPersonaIds.includes(personaId);
              return (
                <button
                  className={selected ? "selected" : ""}
                  key={persona._id}
                  type="button"
                  onClick={() =>
                    updateSelectedConfigValue(
                      field.key,
                      selected
                        ? selectedPersonaIds.filter((id) => id !== personaId)
                        : [...selectedPersonaIds, personaId]
                    )
                  }
                >
                  <strong>{persona.name}</strong>
                  <span>
                    {persona.personaType.replace(/_/g, " ")} ·{" "}
                    {persona.sourceAssetIds.length +
                      persona.generatedAssetIds.length +
                      persona.voiceAssetIds.length} assets
                  </span>
                </button>
              );
            })}
          </div>
          {field.description ? <small>{field.description}</small> : null}
        </div>
      );
    }

    const localFileMeta = localFileFieldMeta(field.key);
    if (localFileMeta) {
      const files = localReferenceFilesFromConfig(
        selectedNode.data.config,
        field.key,
        localFileMeta.kind
      );
      const localFilesDisabled = localFileMeta.disabled ||
        (isImageGenerationNode &&
          field.key === "localReferenceImages" &&
          selectedImageModelUiContract?.images.canBeUploadedLocally === false);

      return (
        <div className="workflow-inspector-field workflow-inspector-field-paired" key={field.key}>
          <span>{field.label}</span>
          <div
            className={`workflow-reference-upload${localFilesDisabled ? " is-disabled" : ""}`}
          >
            <label>
              <Upload size={15} />
              <span>{isUploadingImageReference ? "Uploading..." : "Upload files"}</span>
              <input
                accept={localFileMeta.accept}
                disabled={isUploadingImageReference || localFilesDisabled}
                multiple={localFileMeta.multiple}
                onChange={(event) => {
                  void handleLocalReferenceFileUpload(event, field.key, localFileMeta.kind, {
                    multiple: localFileMeta.multiple,
                    maxCount: localFileMeta.maxCount,
                  });
                }}
                type="file"
              />
            </label>
          </div>
          {files.length ? (
            <div className="workflow-reference-list">
              {files.map((file) => (
                <div className="workflow-reference-item" key={file.id}>
                  {file.kind === "image" ? <img alt="" src={file.storageUrl} /> : (
                    <span className="workflow-reference-file-kind">{String(file.kind).slice(0, 1).toUpperCase()}</span>
                  )}
                  <span>{file.title}</span>
                  <button
                    aria-label={`Remove ${file.title}`}
                    disabled={localFilesDisabled}
                    onClick={() => removeLocalReferenceFile(field.key, file.id, localFileMeta.kind)}
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <small>
              {localFilesDisabled
                ? localFileMeta.disabledCopy
                : isImageGenerationNode && selectedImageModelUiContract?.images.required
                ? "At least one image is required for this model."
                : "No files uploaded."}
              {localFileMeta.maxCount
                ? ` Up to ${localFileMeta.maxCount} allowed.`
                : !localFileMeta.multiple
                  ? " One image allowed."
                  : null}
            </small>
          )}
          {localFilesDisabled && files.length ? (
            <small>Uploaded files are saved here but ignored while the input toggle is enabled.</small>
          ) : null}
          {field.description ? <small>{field.description}</small> : null}
        </div>
      );
    }

    if (field.type === "enum") {
      return (
        <div className="workflow-inspector-field" key={field.key}>
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <WorkflowSelect
            onChange={(nextValue) => updateSelectedConfigValue(field.key, nextValue)}
            options={[
              ...(!field.required ? [{ value: "", label: "Unset" }] : []),
              ...(field.enumValues ?? []).map((option) => ({
                value: option,
                label: formatConfigLabel(option),
              })),
            ]}
            placeholder="Select option"
            value={String(value)}
          />
          {field.description ? <small>{field.description}</small> : null}
        </div>
      );
    }

    const multilineTextKeys = new Set([
      "caption",
      "knowledgeBase",
      "prompt",
      "request",
      "systemPrompt",
      "text",
    ]);

    if (multilineTextKeys.has(field.key)) {
      const localPromptDisabled = localTextDisabledByInput ||
        (isImageGenerationNode &&
          selectedImageModelUiContract?.prompt.canBeConfiguredLocally === false);

      return (
        <label className="workflow-inspector-field workflow-inspector-field-paired" key={field.key}>
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <textarea
            className="workflow-prompt-textarea"
            disabled={localPromptDisabled}
            onChange={(event) =>
              updateSelectedConfigValue(
                field.key,
                coerceConfigFieldValue(field, event.target.value, value)
              )
            }
            value={String(value)}
          />
          {localPromptDisabled && localTextDisabledByInput ? (
            <small>Using text from a connected input node. This local value is saved but ignored.</small>
          ) : field.description ? (
            <small>{field.description}</small>
          ) : null}
        </label>
      );
    }

    if (field.type === "boolean") {
      return (
        <div
          className={`workflow-inspector-field${
            field.key.endsWith("FromInputNode") ? " workflow-inspector-field-paired" : ""
          }`}
          key={field.key}
        >
          <label className="workflow-inspector-toggle">
            <input
              checked={Boolean(value)}
              onChange={(event) =>
                updateSelectedBooleanConfigValue(field.key, event.target.checked)
              }
              type="checkbox"
            />
            <span>
              {field.label}
              {field.required ? " *" : ""}
            </span>
          </label>
          {field.description ? <small>{field.description}</small> : null}
        </div>
      );
    }

    return (
      <label className="workflow-inspector-field" key={field.key}>
        <span>
          {field.label}
          {field.required ? " *" : ""}
        </span>
        {field.type === "json" ? (
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

  const paletteTooltipStyle = paletteTooltip
    ? ({
        top: `${paletteTooltip.top}px`,
        left: `${paletteTooltip.left}px`,
      } satisfies CSSProperties)
    : undefined;

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
        <div className="workflow-canvas-title">
          <Link className="workflow-back-link" to="/workflows">
            <ArrowLeft size={16} />
            Workflows
          </Link>
          <div>
            <h1>{workflow.name}</h1>
            <p>{workflow.description || "Workflow canvas"}</p>
          </div>
        </div>
        <div className="workflow-canvas-stats">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} edges</span>
          <span>{workflow.isActive ? "Active" : "Paused"}</span>
          {workflow.nextRunAt ? (
            <span>Next {new Date(workflow.nextRunAt).toLocaleString()}</span>
          ) : null}
        </div>
        <div className="workflow-canvas-actions">
          {saveStatus ? <span>{saveStatus}</span> : null}
          <button
            className={`secondary-button${openDrawer === "execution" ? " workflow-toolbar-button-active" : ""}`}
            onClick={() =>
              setOpenDrawer((currentDrawer) =>
                currentDrawer === "execution" ? null : "execution"
              )
            }
            type="button"
          >
            <Activity size={16} />
            Executions
          </button>
          <button
            className="secondary-button"
            disabled={isCreatingRun || isDirty || !graphValidation?.valid}
            onClick={() => {
              setOpenDrawer("execution");
              void handleCreateManualRun();
            }}
            type="button"
          >
            <Play size={16} />
            {isCreatingRun ? "Queueing" : "Run once"}
          </button>
          <button
            className="secondary-button"
            disabled={isUpdatingActiveState}
            onClick={() => {
              void handleToggleActive();
            }}
            type="button"
          >
            <Clock size={16} />
            {workflow.isActive ? "Pause" : "Activate"}
          </button>
          <button
            className="primary-button"
            disabled={!isDirty || isSaving || !draftGraphValidation?.valid}
            onClick={() => {
              void handleSaveGraph();
            }}
            type="button"
          >
            <Save size={16} />
            {isSaving ? "Saving" : "Save"}
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
                      <span
                        className="workflow-palette-button-wrap"
                        key={definition.type}
                        onBlur={() => setPaletteTooltip(null)}
                        onFocus={(event) =>
                          showPaletteTooltip(event.currentTarget, definition, isDisabled)
                        }
                        onMouseEnter={(event) =>
                          showPaletteTooltip(event.currentTarget, definition, isDisabled)
                        }
                        onMouseLeave={() => setPaletteTooltip(null)}
                      >
                        <button
                          className="workflow-palette-button"
                          disabled={isDisabled}
                          aria-label={`Add ${definition.label}`}
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
                      </span>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </aside>

        {paletteTooltip ? (
          <div
            className="workflow-palette-tooltip"
            role="tooltip"
            style={paletteTooltipStyle}
          >
            <strong>{paletteTooltip.label}</strong>
            <span>{paletteTooltip.description}</span>
          </div>
        ) : null}

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
              onNodeClick={(_event, node) => handleSelectNode(node)}
              onNodesChange={handleNodesChange}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setOpenDrawer((currentDrawer) => (currentDrawer === "node" ? null : currentDrawer));
              }}
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

        <aside
          className={`workflow-node-inspector workflow-side-drawer${
            openDrawer === "node" ? " workflow-side-drawer-open" : ""
          }`}
          aria-label="Workflow node inspector"
        >
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
                <button
                  aria-label="Close node settings"
                  className="workflow-drawer-close"
                  onClick={() => setOpenDrawer(null)}
                  type="button"
                >
                  <X size={16} />
                </button>
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

                {showProviderControl ? (
                  <div className="workflow-inspector-field">
                    <span>Provider</span>
                    <WorkflowSelect
                      disabled={selectedNodeDefinition.providerRequirement === "none"}
                      onChange={(nextValue) => {
                        const provider = nextValue
                          ? (nextValue as WorkflowProviderName)
                          : undefined;

                        updateSelectedNodeData((data) => ({
                          provider,
                          model: provider === data.provider ? data.model : undefined,
                        }));
                      }}
                      options={[
                        { value: "", label: "No provider" },
                        ...providerOptions.map((provider) => ({
                          value: provider.value,
                          label: provider.label,
                        })),
                      ]}
                      placeholder="Select provider"
                      value={selectedNode.data.provider ?? ""}
                    />
                  </div>
                ) : null}

                {showModelControl ? (
                  <div className="workflow-inspector-field">
                    <span>Model</span>
                    <WorkflowSelect
                      disabled={!selectedProviderCatalogName || !selectedModelOptions.length}
                      onChange={(nextValue) =>
                        updateSelectedNodeData(() => ({
                          model: nextValue || undefined,
                          provider: "bulkapis",
                        }))
                      }
                      options={selectedModelPickerOptions}
                      placeholder={
                        selectedProviderCatalogName
                          ? selectedProviderModels === undefined
                            ? "Loading models"
                            : "Select model"
                          : "No model catalog"
                      }
                      rich
                      value={selectedNode.data.model ?? ""}
                    />
                    <small>
                      {selectedProviderModel?.description ??
                        "Uses the workspace BulkAPIs integration."}
                    </small>
                  </div>
                ) : null}
              </div>

              <div className="workflow-inspector-group">
                <div className="workflow-inspector-section-heading">
                  <h3>{configSectionTitleForNodeType(selectedNode.data.type)}</h3>
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

              {showRetentionControl ? (
              <div className="workflow-inspector-group">
                <div className="workflow-inspector-field">
                  <span>Retention</span>
                  <WorkflowSelect
                    onChange={(nextValue) =>
                      updateSelectedNodeData((data) => ({
                        retention: {
                          ...(data.retention ?? {}),
                          mode: nextValue as NodeRetentionMode,
                        },
                      }))
                    }
                    options={retentionOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    placeholder="Select retention"
                    value={selectedNode.data.retention?.mode ?? "inherit"}
                  />
                </div>

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
              ) : null}

              {showRunDebugSection ? (
              <div className="workflow-inspector-group">
                <div className="workflow-inspector-section-heading">
                  <h3>Run Debug</h3>
                  <span>
                    {selectedNodeRunState
                      ? formatStatus(selectedNodeRunState.status)
                      : selectedRun
                        ? formatStatus(selectedRun.status)
                        : "No run"}
                  </span>
                </div>
                {selectedNodeRunState ? (
                  <div className="workflow-node-state-card">
                    <span>{formatStatus(selectedNodeRunState.status)}</span>
                    <strong>
                      {selectedNodeRunState.startedAt
                        ? formatTimestamp(selectedNodeRunState.startedAt)
                        : "Not started"}
                    </strong>
                    {selectedNodeRunState.errorMessage ? (
                      <p>{selectedNodeRunState.errorMessage}</p>
                    ) : selectedNodeRunState.blockedByNodeIds?.length ? (
                      <p>Blocked by {selectedNodeRunState.blockedByNodeIds.join(", ")}</p>
                    ) : (
                      <p>
                        {selectedNodeRunState.dependencyNodeIds.length
                          ? `Depends on ${selectedNodeRunState.dependencyNodeIds.join(", ")}`
                          : "No upstream dependencies"}
                      </p>
                    )}
                  </div>
                ) : null}
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
              ) : null}
            </>
          ) : (
            <div className="workflow-inspector-empty-state">
              <Box size={18} />
              <h2>Select a node</h2>
              <p>Node settings appear here without running the workflow.</p>
            </div>
          )}
        </aside>

        <section
          className={`workflow-execution-panel workflow-side-drawer${
            openDrawer === "execution" ? " workflow-side-drawer-open" : ""
          }`}
          aria-label="Workflow execution panel"
        >
          <div className="workflow-execution-header">
            <div>
              <h2>Execution</h2>
              <p>
                Runs use the saved graph only. Editing nodes or edges never starts execution.
              </p>
            </div>
            <div className="workflow-execution-header-actions">
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
              <button
                aria-label="Close executions"
                className="workflow-drawer-close"
                onClick={() => setOpenDrawer(null)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
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
                        <h3>Nodes</h3>
                        <span>
                          {selectedRunNodeStates ? selectedRunNodeStates.length : "Loading"}
                        </span>
                      </div>
                      {selectedRunNodeStates?.length ? (
                        <div className="workflow-run-node-state-list">
                          {selectedRunNodeStates.map((nodeState) => (
                            <div
                              className={`workflow-run-node-state workflow-run-node-state-${nodeState.status}`}
                              key={nodeState._id}
                            >
                              <span>{formatStatus(nodeState.status)}</span>
                              <strong>{nodeState.label}</strong>
                              <p>
                                {nodeState.errorMessage ||
                                  (nodeState.blockedByNodeIds?.length
                                    ? `Blocked by ${nodeState.blockedByNodeIds.join(", ")}`
                                    : `${nodeState.dependencyNodeIds.length} dependencies`)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="workflow-inspector-empty">
                          No node execution state recorded yet.
                        </p>
                      )}
                    </div>

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
