import type { artifactLifecycleValidator, workflowGraphValidator } from "../../validators";

type WorkflowGraphForRun = typeof workflowGraphValidator.type;
type WorkflowGraphNodeForRun = WorkflowGraphForRun["nodes"][number];
type ArtifactLifecycleForRun = typeof artifactLifecycleValidator.type;
type NodeRetentionModeForRun = "inherit" | "keep" | "discard" | "keep_on_failure";

export function mediaNodeOutputPorts(): string[] {
  return ["media", "image", "video", "audio"];
}

function retentionModeForNode(node: WorkflowGraphNodeForRun): NodeRetentionModeForRun {
  const retention = node.retention;
  if (!retention || typeof retention !== "object" || Array.isArray(retention)) return "inherit";
  const mode = (retention as Record<string, unknown>).mode;

  if (
    mode === "inherit" ||
    mode === "keep" ||
    mode === "discard" ||
    mode === "keep_on_failure"
  ) {
    return mode;
  }

  return "inherit";
}

export function placeholderLifecycleForNode(
  graph: WorkflowGraphForRun,
  node: WorkflowGraphNodeForRun
): ArtifactLifecycleForRun {
  const retentionMode = retentionModeForNode(node);
  const runMode = graph.runSettings?.mode ?? "production";
  const graphRetention = graph.runSettings?.artifactRetention;

  if (retentionMode === "keep") return "saved";
  if (retentionMode === "discard") return "discarded";
  if (retentionMode === "keep_on_failure") return "discarded";
  if (runMode === "test" || graphRetention === "keep_all") return "debug";
  return "discarded";
}

export function isPostPackageNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "post_compiler";
}

export function isExportNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "export";
}

export function isAutoPostNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "auto_post";
}

export function isTerminalPackageConsumer(node: WorkflowGraphNodeForRun): boolean {
  return isExportNode(node) || isAutoPostNode(node);
}

export function isMediaNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "media";
}

export function isLlmNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "llm";
}

export function isAiAgentNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "ai_agent";
}

export function isImageGenerationNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "image_generation";
}

export function isVideoGenerationNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "video_generation";
}

export function isAudioGenerationNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "audio_generation";
}

export function isLipsyncNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "lipsync";
}

export function isAiVideoEditorNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "ai_video_editor";
}

export function isNativeSlideshowPlannerNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "native_slideshow_planner";
}

export function isNativeSlideshowRendererNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "native_slideshow_renderer";
}

export function isImplementedNode(node: WorkflowGraphNodeForRun): boolean {
  return isMediaNode(node) ||
    isLlmNode(node) ||
    isAiAgentNode(node) ||
    isImageGenerationNode(node) ||
    isVideoGenerationNode(node) ||
    isAudioGenerationNode(node) ||
    isLipsyncNode(node) ||
    isAiVideoEditorNode(node) ||
    isNativeSlideshowPlannerNode(node) ||
    isNativeSlideshowRendererNode(node) ||
    isExportNode(node) ||
    isAutoPostNode(node);
}
