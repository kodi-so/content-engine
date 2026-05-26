import type { WorkflowNodeHandlerArgs, WorkflowNodeHandlerResult } from "../runtime/executionTypes";
import { executeAudioGenerationNode } from "./generation/audioGenerationNodeHandler";
import { executeImageGenerationNode } from "./generation/imageGenerationNodeHandler";
import { executeVideoGenerationNode } from "./generation/videoGenerationNodeHandler";
import { executeVideoTransformNode } from "./generation/videoTransformNodeHandlers";

const generationHandlers = [
  executeImageGenerationNode,
  executeVideoGenerationNode,
  executeAudioGenerationNode,
  executeVideoTransformNode,
];

export async function executeGenerationNode(
  args: WorkflowNodeHandlerArgs
): Promise<WorkflowNodeHandlerResult | null> {
  for (const handler of generationHandlers) {
    const result = await handler(args);
    if (result) return result;
  }

  return null;
}
