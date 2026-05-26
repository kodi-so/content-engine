import {
  WORKFLOW_GRAPH_SCHEMA_VERSION,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowProviderName,
} from "./workflowGraph";
import type { PostCompilerPresetId } from "./postCompilerPresets";
import type { WorkflowTemplatePlaceholder, WorkflowTemplatePlaceholderKind } from "./workflowTemplateTypes";

const defaultRunnerConfig = {
  trigger: "manual",
  scheduleType: "interval",
  intervalHours: 24,
  scheduleDayOfWeek: 1,
  scheduleHour: 9,
  scheduleMinute: 0,
  timezone: "America/Chicago",
  runsPerExecution: 1,
  retryCount: 0,
  timeoutSeconds: 1200,
  failureBehavior: "stop_workflow",
};

export function runner(position: { x: number; y: number }): WorkflowNode {
  return {
    id: "runner",
    type: "runner",
    label: "Runner",
    position,
    config: { ...defaultRunnerConfig },
  };
}

export function note(id: string, text: string, position: { x: number; y: number }): WorkflowNode {
  return {
    id,
    type: "comment",
    label: "Operator Note",
    position,
    config: { text },
  };
}

export function media(
  id: string,
  label: string,
  position: { x: number; y: number },
  config: Record<string, unknown> = {}
): WorkflowNode {
  return {
    id,
    type: "media",
    label,
    position,
    config: {
      artifactIds: [],
      creativeAssetIds: [],
      personaIds: [],
      uploadedMedia: [],
      ...config,
    },
    retention: { mode: "keep", exposeInLibrary: false },
  };
}

export function agent(args: {
  id: string;
  label: string;
  position: { x: number; y: number };
  mode: "script_writer" | "prompt_variation" | "image_prompting" | "video_prompting";
  request: string;
  config?: Record<string, unknown>;
  provider?: WorkflowProviderName;
}): WorkflowNode {
  return {
    id: args.id,
    type: "ai_agent",
    label: args.label,
    position: args.position,
    provider: args.provider ?? "bulkapis",
    config: {
      agentMode: args.mode,
      request: args.request,
      tone: "natural",
      platform: "tiktok",
      ...args.config,
    },
    retention: { mode: "discard" },
  };
}

export function imageGeneration(args: {
  id: string;
  label: string;
  position: { x: number; y: number };
  count?: number;
  prompt?: string;
}): WorkflowNode {
  return {
    id: args.id,
    type: "image_generation",
    label: args.label,
    position: args.position,
    provider: "bulkapis",
    config: {
      prompt: args.prompt ?? "",
      aspectRatio: "9:16",
      count: args.count ?? 1,
    },
    retention: { mode: "keep", exposeInLibrary: true },
  };
}

export function videoGeneration(args: {
  id: string;
  label: string;
  position: { x: number; y: number };
  prompt?: string;
}): WorkflowNode {
  return {
    id: args.id,
    type: "video_generation",
    label: args.label,
    position: args.position,
    provider: "bulkapis",
    config: {
      prompt: args.prompt ?? "",
      aspectRatio: "9:16",
      durationSeconds: 5,
    },
    retention: { mode: "keep_on_failure" },
  };
}

export function audioGeneration(id: string, position: { x: number; y: number }): WorkflowNode {
  return {
    id,
    type: "audio_generation",
    label: "Voiceover",
    position,
    provider: "bulkapis",
    config: {
      mode: "tts",
      text: "",
      removeSilence: true,
    },
    retention: { mode: "keep_on_failure" },
  };
}

export function lipsync(id: string, position: { x: number; y: number }): WorkflowNode {
  return {
    id,
    type: "lipsync",
    label: "Lip Sync",
    position,
    provider: "bulkapis",
    config: {},
    retention: { mode: "keep_on_failure" },
  };
}

export function videoEditor(args: {
  id: string;
  label: string;
  position: { x: number; y: number };
  prompt: string;
}): WorkflowNode {
  return {
    id: args.id,
    type: "ai_video_editor",
    label: args.label,
    position: args.position,
    provider: "bulkapis",
    config: {
      renderMode: "video_render",
      prompt: args.prompt,
      aspectRatio: "9:16",
      maxDurationSeconds: 30,
    },
    retention: { mode: "keep_on_failure" },
  };
}

export function postCompiler(
  postType: string,
  position: { x: number; y: number },
  platformPreset: PostCompilerPresetId = "tiktok_vertical_video"
): WorkflowNode {
  return {
    id: "post_compiler",
    type: "post_compiler",
    label: "Post Compiler",
    position,
    config: {
      postType,
      platformPreset,
      caption: "{{CAPTION}}",
      name: "{{POST_NAME}}",
    },
    retention: { mode: "keep", exposeInLibrary: true },
  };
}

export function exportNode(position: { x: number; y: number }): WorkflowNode {
  return {
    id: "export",
    type: "export",
    label: "Export",
    position,
    config: {
      destination: "media_library",
      folder: "{{OUTPUT_FOLDER}}",
      fileName: "{{FILE_NAME}}",
      optimizeFor: "tiktok",
    },
    retention: { mode: "keep", exposeInLibrary: true },
  };
}

export function graph(nodes: WorkflowNode[], edges: WorkflowGraph["edges"]): WorkflowGraph {
  return {
    schemaVersion: WORKFLOW_GRAPH_SCHEMA_VERSION,
    nodes,
    edges,
    canvas: {
      viewport: { x: 0, y: 0, zoom: 0.82 },
    },
    runSettings: {
      mode: "test",
      artifactRetention: "keep_all",
    },
  };
}

function input(
  key: string,
  label: string,
  kind: WorkflowTemplatePlaceholderKind,
  description: string,
  required = true
): WorkflowTemplatePlaceholder {
  return { key, label, kind, description, required };
}

export const commonInputs = {
  brand: input("brand_context", "Brand context", "brand_context", "The brand, product, audience, offer, and creative constraints."),
  persona: input("persona", "Persona", "persona", "One or more reusable personas selected in the Media node."),
  media: input("media", "Reference media", "media", "Creative assets, product images, app captures, b-roll, or uploaded references."),
  prompt: input("creative_request", "Creative request", "prompt", "The angle, hook, transformation, or scene direction for this workflow."),
  product: input("product_context", "Product context", "product_context", "The app, feature, product, offer, or use case being promoted."),
  voice: input("voice_reference", "Voice reference", "voice", "An audio creative asset to guide speech, narration, or avatar voice.", false),
  platform: input("platform", "Platform", "platform", "The target posting surface and aspect ratio assumptions."),
};
