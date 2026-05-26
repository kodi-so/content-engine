export const WORKFLOW_GRAPH_SCHEMA_VERSION = 1 as const;

export type WorkflowGraphSchemaVersion = typeof WORKFLOW_GRAPH_SCHEMA_VERSION;

export const WORKFLOW_NODE_TYPES = [
  "runner",
  "comment",
  "media",
  "llm",
  "ai_agent",
  "image_generation",
  "video_generation",
  "audio_generation",
  "lipsync",
  "native_slideshow_planner",
  "native_slideshow_renderer",
  "ai_video_editor",
  "post_compiler",
  "export",
  "auto_post",
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export type WorkflowPortDataType =
  | "any"
  | "text"
  | "json"
  | "prompt"
  | "image"
  | "video"
  | "audio"
  | "media"
  | "slide_spec"
  | "slideshow"
  | "post_package"
  | "artifact";

export type WorkflowProviderName =
  | "bulkapis"
  | "gemini"
  | "fal"
  | "openrouter"
  | "postiz"
  | "post_bridge"
  | "manual";

export type WorkflowRunMode = "test" | "production";

export type WorkflowArtifactRetentionMode =
  | "keep_all"
  | "final_only"
  | "keep_on_failure";

export type WorkflowPoint = {
  x: number;
  y: number;
};

export type WorkflowCanvasViewport = WorkflowPoint & {
  zoom: number;
};

export type WorkflowCanvasState = {
  viewport?: WorkflowCanvasViewport;
};

export type WorkflowRunSettings = {
  mode?: WorkflowRunMode;
  artifactRetention?: WorkflowArtifactRetentionMode;
};

export type WorkflowPort = {
  id: string;
  label: string;
  dataType: WorkflowPortDataType;
  required?: boolean;
  multiple?: boolean;
  description?: string;
};

export type NodeInputBinding =
  | {
      type: "literal";
      value: unknown;
    }
  | {
      type: "node_output";
      sourceNodeId: string;
      sourcePort: string;
      outputKey?: string;
    }
  | {
      type: "artifact";
      artifactId: string;
    }
  | {
      type: "media_asset";
      assetId: string;
    }
  | {
      type: "persona";
      personaId: string;
      assetKey?: string;
    };

export type NodeRetentionMode =
  | "inherit"
  | "keep"
  | "discard"
  | "keep_on_failure";

export type NodeRetentionPolicy = {
  mode: NodeRetentionMode;
  exposeInLibrary?: boolean;
};

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  label: string;
  position: WorkflowPoint;
  provider?: WorkflowProviderName;
  model?: string;
  config: Record<string, unknown>;
  inputBindings?: Record<string, NodeInputBinding>;
  retention?: NodeRetentionPolicy;
};

export type WorkflowEdge = {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};

export type WorkflowGraph = {
  schemaVersion: WorkflowGraphSchemaVersion;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  canvas?: WorkflowCanvasState;
  runSettings?: WorkflowRunSettings;
};

export type WorkflowOutputRef = {
  nodeId: string;
  port: string;
  artifactIds?: string[];
  value?: unknown;
};

export type WorkflowNodeExecutionStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export type WorkflowNodeExecutionState = {
  nodeId: string;
  status: WorkflowNodeExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  costUsd?: number;
  errorMessage?: string;
  outputRefs?: WorkflowOutputRef[];
};

export function createEmptyWorkflowGraph(): WorkflowGraph {
  return {
    schemaVersion: WORKFLOW_GRAPH_SCHEMA_VERSION,
    nodes: [],
    edges: [],
  };
}

export function createStarterWorkflowGraph(): WorkflowGraph {
  return {
    schemaVersion: WORKFLOW_GRAPH_SCHEMA_VERSION,
    nodes: [
      {
        id: "runner",
        type: "runner",
        label: "Runner",
        position: { x: 80, y: 180 },
        config: {
          trigger: "manual",
          scheduleType: "interval",
          intervalHours: 24,
          scheduleDayOfWeek: 1,
          scheduleHour: 9,
          scheduleMinute: 0,
          timezone: "America/Chicago",
          runsPerExecution: 1,
          retryCount: 0,
          timeoutSeconds: 900,
          failureBehavior: "stop_workflow",
        },
      },
      {
        id: "export",
        type: "export",
        label: "Export",
        position: { x: 420, y: 180 },
        config: {
          destination: "media_library",
        },
      },
    ],
    edges: [
      {
        id: "runner-to-export",
        sourceNodeId: "runner",
        sourcePort: "run",
        targetNodeId: "export",
        targetPort: "input",
      },
    ],
    canvas: {
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}
