import type { WorkflowPort, WorkflowPortDataType } from "./workflowGraph";
import type { WorkflowNodeCatalogEntry } from "./workflowNodeCatalog";

export const WORKFLOW_CANVAS_INPUT_HANDLE_ID = "input";

export function portTypesAreCompatible(
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

const preferredTargetPortIdsBySourceType: Record<WorkflowPortDataType, string[]> = {
  any: ["input", "context"],
  text: ["prompt", "caption", "request", "text", "context", "input"],
  json: ["context", "metadata", "brand_context", "input"],
  prompt: ["prompt", "request", "caption", "context", "input"],
  image: ["reference_image", "image", "media", "input"],
  video: ["reference_video", "video", "media", "input"],
  audio: ["voice_reference", "audio", "media", "input"],
  media: ["media", "input"],
  slide_spec: ["slide_spec", "input"],
  slideshow: ["slideshow", "media", "input"],
  post_package: ["post_package", "input"],
  artifact: ["input", "artifact", "media"],
};

export function automaticTargetPortForSource(
  targetDefinition: WorkflowNodeCatalogEntry,
  sourcePort: WorkflowPort
): WorkflowPort | null {
  const compatiblePorts = targetDefinition.inputPorts.filter((targetPort) =>
    portTypesAreCompatible(sourcePort.dataType, targetPort.dataType)
  );
  if (!compatiblePorts.length) return null;

  const exactPort = compatiblePorts.find((targetPort) => targetPort.id === sourcePort.id);
  if (exactPort) return exactPort;

  const preferredIds = preferredTargetPortIdsBySourceType[sourcePort.dataType] ?? [];
  for (const preferredId of preferredIds) {
    const preferredPort = compatiblePorts.find((targetPort) => targetPort.id === preferredId);
    if (preferredPort) return preferredPort;
  }

  return compatiblePorts.find((targetPort) => targetPort.required) ?? compatiblePorts[0];
}
