import {
  WORKFLOW_NODE_TYPES,
  type NodeRetentionPolicy,
  type WorkflowNodeType,
  type WorkflowPort,
  type WorkflowPortDataType,
  type WorkflowProviderName,
} from "./workflowGraph";

export type WorkflowNodeCategory =
  | "control"
  | "utility"
  | "input"
  | "language"
  | "agent"
  | "generation"
  | "assembly"
  | "output";

export type WorkflowNodeRole =
  | "runner"
  | "standard"
  | "terminal"
  | "annotation";

export type WorkflowNodeConfigSchemaMode =
  | "static"
  | "provider_model_schema"
  | "custom";

export type WorkflowNodeProviderRequirement =
  | "none"
  | "optional"
  | "required";

export type WorkflowNodeCatalogEntry = {
  type: WorkflowNodeType;
  label: string;
  description: string;
  category: WorkflowNodeCategory;
  role: WorkflowNodeRole;
  executable: boolean;
  configSchemaMode: WorkflowNodeConfigSchemaMode;
  providerRequirement: WorkflowNodeProviderRequirement;
  defaultProvider?: WorkflowProviderName;
  inputPorts: WorkflowPort[];
  outputPorts: WorkflowPort[];
  defaultConfig: Record<string, unknown>;
  defaultRetention?: NodeRetentionPolicy;
  outputArtifactTypes?: string[];
};

function port(
  id: string,
  label: string,
  dataType: WorkflowPortDataType,
  options: Pick<WorkflowPort, "required" | "multiple" | "description"> = {}
): WorkflowPort {
  return { id, label, dataType, ...options };
}

export const WORKFLOW_NODE_CATALOG = [
  {
    type: "runner",
    label: "Runner",
    description: "Starts a workflow manually, on a schedule, or from an external trigger.",
    category: "control",
    role: "runner",
    executable: false,
    configSchemaMode: "static",
    providerRequirement: "none",
    inputPorts: [],
    outputPorts: [port("run", "Run", "json")],
    defaultConfig: {
      trigger: "manual",
      scheduleType: "interval",
      intervalHours: 24,
      timezone: "America/Chicago",
      runsPerExecution: 1,
      retryCount: 0,
      timeoutSeconds: 900,
      failureBehavior: "stop_workflow",
    },
  },
  {
    type: "comment",
    label: "Comment",
    description: "Adds non-executing notes to the workflow canvas.",
    category: "utility",
    role: "annotation",
    executable: false,
    configSchemaMode: "static",
    providerRequirement: "none",
    inputPorts: [],
    outputPorts: [],
    defaultConfig: { text: "" },
  },
  {
    type: "media",
    label: "Media",
    description: "Provides uploaded or library media to downstream nodes.",
    category: "input",
    role: "standard",
    executable: false,
    configSchemaMode: "static",
    providerRequirement: "none",
    inputPorts: [],
    outputPorts: [
      port("media", "Media", "media", { multiple: true }),
      port("image", "Image", "image", { multiple: true }),
      port("video", "Video", "video", { multiple: true }),
      port("audio", "Audio", "audio", { multiple: true }),
    ],
    defaultConfig: {
      artifactIds: [],
      brandAssetIds: [],
      personaAssetIds: [],
      uploadedMedia: [],
    },
    defaultRetention: { mode: "keep", exposeInLibrary: false },
    outputArtifactTypes: ["image", "video", "rendered_asset"],
  },
  {
    type: "llm",
    label: "LLM",
    description: "Generates text, prompts, scripts, captions, or structured JSON.",
    category: "language",
    role: "standard",
    executable: true,
    configSchemaMode: "provider_model_schema",
    providerRequirement: "required",
    defaultProvider: "bulkapis",
    inputPorts: [
      port("prompt", "Prompt", "prompt"),
      port("context", "Context", "json", { multiple: true }),
    ],
    outputPorts: [
      port("text", "Text", "text"),
      port("json", "JSON", "json"),
      port("prompt", "Prompt", "prompt"),
    ],
    defaultConfig: { systemPrompt: "", prompt: "", responseFormat: "text" },
    defaultRetention: { mode: "discard" },
    outputArtifactTypes: ["text_draft", "caption", "script", "prompt"],
  },
  {
    type: "ai_agent",
    label: "AI Agent",
    description: "Runs a higher-level content agent such as prompt variation or script writing.",
    category: "agent",
    role: "standard",
    executable: true,
    configSchemaMode: "custom",
    providerRequirement: "required",
    defaultProvider: "bulkapis",
    inputPorts: [
      port("request", "Request", "prompt"),
      port("context", "Context", "json", { multiple: true }),
      port("media", "Media", "media", { multiple: true }),
    ],
    outputPorts: [
      port("text", "Text", "text"),
      port("prompt", "Prompt", "prompt"),
      port("json", "JSON", "json"),
      port("media", "Media", "media", { multiple: true }),
    ],
    defaultConfig: { agentMode: "prompt_variation", request: "" },
    defaultRetention: { mode: "discard" },
    outputArtifactTypes: ["prompt", "script", "scene_spec"],
  },
  {
    type: "image_generation",
    label: "Image Generation",
    description: "Generates images from prompts and optional reference media.",
    category: "generation",
    role: "standard",
    executable: true,
    configSchemaMode: "provider_model_schema",
    providerRequirement: "required",
    defaultProvider: "bulkapis",
    inputPorts: [
      port("prompt", "Prompt", "prompt", { required: true }),
      port("reference_image", "Reference Image", "image", { multiple: true }),
    ],
    outputPorts: [port("image", "Image", "image", { multiple: true })],
    defaultConfig: { prompt: "", aspectRatio: "9:16", count: 1 },
    defaultRetention: { mode: "keep_on_failure" },
    outputArtifactTypes: ["image"],
  },
  {
    type: "video_generation",
    label: "Video Generation",
    description: "Generates video from prompts, images, frames, or model-specific references.",
    category: "generation",
    role: "standard",
    executable: true,
    configSchemaMode: "provider_model_schema",
    providerRequirement: "required",
    defaultProvider: "bulkapis",
    inputPorts: [
      port("prompt", "Prompt", "prompt"),
      port("image", "Image", "image"),
      port("start_frame", "Start Frame", "image"),
      port("end_frame", "End Frame", "image"),
      port("reference_video", "Reference Video", "video"),
    ],
    outputPorts: [port("video", "Video", "video")],
    defaultConfig: { prompt: "", aspectRatio: "9:16", durationSeconds: 5 },
    defaultRetention: { mode: "keep_on_failure" },
    outputArtifactTypes: ["video"],
  },
  {
    type: "audio_generation",
    label: "Audio Generation",
    description: "Generates speech, sound effects, or other audio assets.",
    category: "generation",
    role: "standard",
    executable: true,
    configSchemaMode: "provider_model_schema",
    providerRequirement: "required",
    defaultProvider: "bulkapis",
    inputPorts: [
      port("text", "Text", "text"),
      port("voice_reference", "Voice Reference", "audio"),
    ],
    outputPorts: [port("audio", "Audio", "audio")],
    defaultConfig: { text: "", mode: "tts" },
    defaultRetention: { mode: "keep_on_failure" },
    outputArtifactTypes: ["rendered_asset"],
  },
  {
    type: "lipsync",
    label: "Lip Sync",
    description: "Combines a source video and audio track into a lip-synced video.",
    category: "generation",
    role: "standard",
    executable: true,
    configSchemaMode: "provider_model_schema",
    providerRequirement: "required",
    defaultProvider: "bulkapis",
    inputPorts: [
      port("video", "Video", "video", { required: true }),
      port("audio", "Audio", "audio", { required: true }),
    ],
    outputPorts: [port("video", "Video", "video")],
    defaultConfig: {},
    defaultRetention: { mode: "keep_on_failure" },
    outputArtifactTypes: ["video"],
  },
  {
    type: "native_slideshow_planner",
    label: "Slideshow Planner",
    description: "Plans native slideshow structure, slide copy, and visual direction.",
    category: "assembly",
    role: "standard",
    executable: true,
    configSchemaMode: "custom",
    providerRequirement: "optional",
    defaultProvider: "bulkapis",
    inputPorts: [
      port("prompt", "Prompt", "prompt", { required: true }),
      port("brand_context", "Brand Context", "json"),
      port("media", "Media", "media", { multiple: true }),
    ],
    outputPorts: [port("slide_spec", "Slide Spec", "slide_spec")],
    defaultConfig: { slideCount: 5, aspectRatio: "9:16" },
    defaultRetention: { mode: "discard" },
    outputArtifactTypes: ["slide_spec"],
  },
  {
    type: "native_slideshow_renderer",
    label: "Slideshow Renderer",
    description: "Renders a native slideshow spec into a publishable asset.",
    category: "assembly",
    role: "standard",
    executable: true,
    configSchemaMode: "custom",
    providerRequirement: "none",
    inputPorts: [
      port("slide_spec", "Slide Spec", "slide_spec", { required: true }),
      port("media", "Media", "media", { multiple: true }),
    ],
    outputPorts: [
      port("slideshow", "Slideshow", "slideshow"),
      port("video", "Video", "video"),
    ],
    defaultConfig: { renderMode: "native" },
    defaultRetention: { mode: "keep_on_failure" },
    outputArtifactTypes: ["rendered_asset", "video"],
  },
  {
    type: "ai_video_editor",
    label: "AI Video Editor",
    description: "Assembles or edits video from assets and an editing prompt.",
    category: "assembly",
    role: "standard",
    executable: true,
    configSchemaMode: "provider_model_schema",
    providerRequirement: "required",
    defaultProvider: "bulkapis",
    inputPorts: [
      port("prompt", "Prompt", "prompt"),
      port("media", "Media", "media", { multiple: true }),
      port("video", "Video", "video", { multiple: true }),
      port("image", "Image", "image", { multiple: true }),
      port("audio", "Audio", "audio", { multiple: true }),
    ],
    outputPorts: [port("video", "Video", "video")],
    defaultConfig: { prompt: "", aspectRatio: "9:16", renderMode: "video_render" },
    defaultRetention: { mode: "keep_on_failure" },
    outputArtifactTypes: ["video"],
  },
  {
    type: "post_compiler",
    label: "Post Compiler",
    description: "Packages media, caption, and metadata into one final post package.",
    category: "assembly",
    role: "standard",
    executable: true,
    configSchemaMode: "static",
    providerRequirement: "none",
    inputPorts: [
      port("media", "Media", "media", { required: true }),
      port("caption", "Caption", "text"),
      port("metadata", "Metadata", "json"),
    ],
    outputPorts: [port("post_package", "Post Package", "post_package")],
    defaultConfig: { postType: "video", caption: "" },
    defaultRetention: { mode: "keep", exposeInLibrary: true },
    outputArtifactTypes: ["publish_payload"],
  },
  {
    type: "export",
    label: "Export",
    description: "Exports a post package or media asset to the library or a connected destination.",
    category: "output",
    role: "terminal",
    executable: true,
    configSchemaMode: "static",
    providerRequirement: "none",
    inputPorts: [
      port("input", "Input", "any", { required: true }),
      port("post_package", "Post Package", "post_package"),
    ],
    outputPorts: [port("artifact", "Artifact", "artifact")],
    defaultConfig: { destination: "media_library" },
    defaultRetention: { mode: "keep", exposeInLibrary: true },
    outputArtifactTypes: ["rendered_asset", "publish_payload"],
  },
  {
    type: "auto_post",
    label: "Auto Post",
    description: "Publishes a post package to one or more connected social accounts.",
    category: "output",
    role: "terminal",
    executable: true,
    configSchemaMode: "provider_model_schema",
    providerRequirement: "required",
    defaultProvider: "bulkapis",
    inputPorts: [port("post_package", "Post Package", "post_package", { required: true })],
    outputPorts: [port("result", "Result", "json")],
    defaultConfig: { platforms: [], autoPublish: false },
    defaultRetention: { mode: "keep", exposeInLibrary: true },
    outputArtifactTypes: ["publish_payload"],
  },
] satisfies WorkflowNodeCatalogEntry[];

export const WORKFLOW_NODE_CATALOG_BY_TYPE = Object.fromEntries(
  WORKFLOW_NODE_CATALOG.map((definition) => [definition.type, definition])
) as Record<WorkflowNodeType, WorkflowNodeCatalogEntry>;

for (const type of WORKFLOW_NODE_TYPES) {
  if (!WORKFLOW_NODE_CATALOG_BY_TYPE[type]) {
    throw new Error(`Missing workflow node catalog entry for "${type}".`);
  }
}

if (
  new Set(WORKFLOW_NODE_CATALOG.map((definition) => definition.type)).size !==
  WORKFLOW_NODE_CATALOG.length
) {
  throw new Error("Workflow node catalog contains duplicate node types.");
}

export function listWorkflowNodeDefinitions(): WorkflowNodeCatalogEntry[] {
  return [...WORKFLOW_NODE_CATALOG];
}

export function getWorkflowNodeDefinition(
  type: WorkflowNodeType
): WorkflowNodeCatalogEntry {
  return WORKFLOW_NODE_CATALOG_BY_TYPE[type];
}

export function isWorkflowNodeType(value: string): value is WorkflowNodeType {
  return (WORKFLOW_NODE_TYPES as readonly string[]).includes(value);
}

export function isTerminalWorkflowNodeType(type: WorkflowNodeType): boolean {
  return WORKFLOW_NODE_CATALOG_BY_TYPE[type].role === "terminal";
}

export function isRunnerWorkflowNodeType(type: WorkflowNodeType): boolean {
  return WORKFLOW_NODE_CATALOG_BY_TYPE[type].role === "runner";
}
