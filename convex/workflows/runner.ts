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

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "running",
    });

    const message =
      "Graph workflow execution is not implemented yet. Workflow versions now store graph JSON; the graph runner lands in the execution tickets.";

    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "error",
      message,
      data: {
        schemaVersion: context.version.graph.schemaVersion,
        nodeCount: context.version.graph.nodes.length,
        edgeCount: context.version.graph.edges.length,
      },
    });

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "failed",
      errorMessage: message,
      completedAt: Date.now(),
    });
  },
});
