import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

export const executeRun = internalAction({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.workflows.runs.getExecutionContext, {
      runId: args.runId,
    });
    if (!context) {
      throw new Error("Workflow run context not found");
    }

    const runnerNodeId =
      context.workflow.graph.nodes.find((node) => node.type === "runner")?.id ??
      context.workflow.graph.nodes[0]?.id;
    const message =
      "Graph workflow execution is not implemented yet. Workflows now store graph JSON; the graph runner lands in the execution tickets.";

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "running",
      ...(runnerNodeId ? { currentNodeId: runnerNodeId } : {}),
    });

    if (runnerNodeId) {
      await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
        runId: context.run._id,
        nodeId: runnerNodeId,
        status: "running",
      });

      await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
        runId: context.run._id,
        nodeId: runnerNodeId,
        status: "failed",
        errorMessage: message,
        completedAt: Date.now(),
      });
    }

    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "error",
      ...(runnerNodeId ? { nodeId: runnerNodeId } : {}),
      message,
      data: {
        schemaVersion: context.workflow.graph.schemaVersion,
        nodeCount: context.workflow.graph.nodes.length,
        edgeCount: context.workflow.graph.edges.length,
      },
    });

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "failed",
      ...(runnerNodeId ? { errorNodeId: runnerNodeId } : {}),
      errorMessage: message,
      completedAt: Date.now(),
    });
  },
});
