import { internal } from "../../_generated/api";
import type {
  WorkflowNodeHandlerArgs,
  WorkflowNodeHandlerResult,
} from "../runtime/executionTypes";
import { mediaOutputRefsForNode } from "../runtime/outputRefs";

export async function executeMediaNode({
  ctx,
  context,
  node,
}: WorkflowNodeHandlerArgs): Promise<WorkflowNodeHandlerResult> {
  const mediaItems = await ctx.runQuery(
    internal.workflows.runner.resolveMediaNodeItems,
    {
      runId: context.run._id,
      nodeId: node.id,
    }
  );
  const outputRefs = mediaOutputRefsForNode(node.id, mediaItems);

  await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
    runId: context.run._id,
    nodeId: node.id,
    status: "succeeded",
    outputRefs,
    costUsd: 0,
  });
  await ctx.runMutation(internal.workflows.runs.recordEvent, {
    userId: context.run.userId,
    workflowRunId: context.run._id,
    workflowId: context.workflow._id,
    type: "node_completed",
    nodeId: node.id,
    message: `${node.label} exposed ${mediaItems.length} media reference${mediaItems.length === 1 ? "" : "s"}.`,
    data: {
      nodeType: node.type,
      mediaCount: mediaItems.length,
      outputPorts: outputRefs.map((outputRef) => outputRef.port),
      placeholderExecution: false,
    },
  });

  return { costUsd: 0 };
}
