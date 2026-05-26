import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type WorkflowDoc = Doc<"workflows">;
type WorkflowGraph = WorkflowDoc["graph"];

function dependencyNodeIdsForGraph(graph: WorkflowGraph): Map<string, string[]> {
  const dependenciesByNodeId = new Map(
    graph.nodes.map((node) => [node.id, new Set<string>()])
  );

  for (const edge of graph.edges) {
    const dependencies = dependenciesByNodeId.get(edge.targetNodeId);
    if (dependencies) dependencies.add(edge.sourceNodeId);
  }

  return new Map(
    [...dependenciesByNodeId.entries()].map(([nodeId, dependencies]) => [
      nodeId,
      [...dependencies].sort(),
    ])
  );
}

export async function createWorkflowRun(
  ctx: MutationCtx,
  args: {
    userId: string;
    workflow: WorkflowDoc;
    trigger?: WorkflowDoc["trigger"];
    scheduledFor?: number;
  }
): Promise<Id<"workflowRuns">> {
  const now = Date.now();
  const trigger = args.trigger ?? "manual";
  const runId = await ctx.db.insert("workflowRuns", {
    userId: args.userId,
    workflowId: args.workflow._id,
    brandId: args.workflow.brandId,
    socialAccountId: args.workflow.socialAccountId,
    trigger,
    status: "queued",
    scheduledFor: args.scheduledFor,
    createdAt: now,
    updatedAt: now,
  });

  const dependencyNodeIdsByNode = dependencyNodeIdsForGraph(args.workflow.graph);
  for (const node of args.workflow.graph.nodes) {
    await ctx.db.insert("workflowRunNodeStates", {
      userId: args.userId,
      workflowRunId: runId,
      workflowId: args.workflow._id,
      nodeId: node.id,
      nodeType: node.type,
      label: node.label,
      status: "idle",
      dependencyNodeIds: dependencyNodeIdsByNode.get(node.id) ?? [],
      createdAt: now,
      updatedAt: now,
    });
  }

  await ctx.db.insert("workflowRunEvents", {
    userId: args.userId,
    workflowRunId: runId,
    workflowId: args.workflow._id,
    type: "run_created",
    message: trigger === "schedule"
      ? "Scheduled workflow run queued."
      : "Manual workflow run queued.",
    createdAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.workflows.runner.executeRun, { runId });

  return runId;
}
