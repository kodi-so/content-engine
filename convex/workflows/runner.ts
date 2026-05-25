import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { workflowGraphValidator } from "../validators";

type WorkflowGraphForRun = typeof workflowGraphValidator.type;
type WorkflowGraphNodeForRun = WorkflowGraphForRun["nodes"][number];

function adjacencyForGraph(graph: WorkflowGraphForRun): Map<string, string[]> {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  return adjacency;
}

function reachableNodeIdsFromRunner(graph: WorkflowGraphForRun): Set<string> {
  const runnerNode = graph.nodes.find((node) => node.type === "runner") ?? graph.nodes[0];
  if (!runnerNode) return new Set();

  const adjacency = adjacencyForGraph(graph);
  const reachableNodeIds = new Set<string>();
  const stack = [runnerNode.id];

  while (stack.length) {
    const nodeId = stack.pop();
    if (!nodeId || reachableNodeIds.has(nodeId)) continue;

    reachableNodeIds.add(nodeId);
    stack.push(...(adjacency.get(nodeId) ?? []));
  }

  return reachableNodeIds;
}

function dependencyNodeIdsForGraph(graph: WorkflowGraphForRun): Map<string, string[]> {
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

function readyNodesForPass(
  nodes: WorkflowGraphNodeForRun[],
  dependencyNodeIdsByNode: Map<string, string[]>,
  pendingNodeIds: Set<string>,
  completedNodeIds: Set<string>
): WorkflowGraphNodeForRun[] {
  return nodes.filter((node) => {
    if (!pendingNodeIds.has(node.id)) return false;
    const dependencyNodeIds = dependencyNodeIdsByNode.get(node.id) ?? [];
    return dependencyNodeIds.every((nodeId) => completedNodeIds.has(nodeId));
  });
}

export const executeRun = internalAction({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.workflows.runs.getExecutionContext, {
      runId: args.runId,
    });
    if (!context) {
      throw new Error("Workflow run context not found");
    }

    const graph = context.workflow.graph;
    const reachableNodeIds = reachableNodeIdsFromRunner(graph);
    const runnableNodes = graph.nodes.filter((node) => reachableNodeIds.has(node.id));
    const dependencyNodeIdsByNode = dependencyNodeIdsForGraph(graph);
    const pendingNodeIds = new Set(runnableNodes.map((node) => node.id));
    const completedNodeIds = new Set<string>();
    let executedNodeCount = 0;
    let passCount = 0;

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "running",
      ...(runnableNodes[0] ? { currentNodeId: runnableNodes[0].id } : {}),
    });

    if (!runnableNodes.length) {
      const message = "Workflow graph has no nodes reachable from the runner.";
      await ctx.runMutation(internal.workflows.runs.recordEvent, {
        userId: context.run.userId,
        workflowRunId: context.run._id,
        workflowId: context.workflow._id,
        type: "error",
        message,
      });
      await ctx.runMutation(internal.workflows.runs.transitionRun, {
        runId: context.run._id,
        status: "failed",
        errorMessage: message,
        completedAt: Date.now(),
      });
      return;
    }

    while (pendingNodeIds.size) {
      passCount += 1;
      const readyNodes = readyNodesForPass(
        runnableNodes,
        dependencyNodeIdsByNode,
        pendingNodeIds,
        completedNodeIds
      );

      if (!readyNodes.length) {
        const message =
          "Workflow graph executor could not find a runnable node. Check for invalid dependencies.";
        await ctx.runMutation(internal.workflows.runs.recordEvent, {
          userId: context.run.userId,
          workflowRunId: context.run._id,
          workflowId: context.workflow._id,
          type: "error",
          message,
          data: {
            pendingNodeIds: [...pendingNodeIds].sort(),
            completedNodeIds: [...completedNodeIds].sort(),
          },
        });
        await ctx.runMutation(internal.workflows.runs.transitionRun, {
          runId: context.run._id,
          status: "failed",
          errorMessage: message,
          completedAt: Date.now(),
        });
        return;
      }

      for (const node of readyNodes) {
        await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
          runId: context.run._id,
          nodeId: node.id,
          status: "queued",
        });
      }

      for (const node of readyNodes) {
        try {
          await ctx.runMutation(internal.workflows.runs.transitionRun, {
            runId: context.run._id,
            status: "running",
            currentNodeId: node.id,
          });
          await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
            runId: context.run._id,
            nodeId: node.id,
            status: "running",
          });
          await ctx.runMutation(internal.workflows.runs.recordEvent, {
            userId: context.run.userId,
            workflowRunId: context.run._id,
            workflowId: context.workflow._id,
            type: "node_started",
            nodeId: node.id,
            message: `${node.label} started.`,
            data: {
              nodeType: node.type,
              placeholderExecution: true,
            },
          });

          await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
            runId: context.run._id,
            nodeId: node.id,
            status: "succeeded",
            costUsd: 0,
          });
          await ctx.runMutation(internal.workflows.runs.recordEvent, {
            userId: context.run.userId,
            workflowRunId: context.run._id,
            workflowId: context.workflow._id,
            type: "node_completed",
            nodeId: node.id,
            message: `${node.label} completed with placeholder execution.`,
            data: {
              nodeType: node.type,
              placeholderExecution: true,
            },
          });

          pendingNodeIds.delete(node.id);
          completedNodeIds.add(node.id);
          executedNodeCount += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : `${node.label} failed during execution.`;
          await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
            runId: context.run._id,
            nodeId: node.id,
            status: "failed",
            errorMessage: message,
          });
          await ctx.runMutation(internal.workflows.runs.recordEvent, {
            userId: context.run.userId,
            workflowRunId: context.run._id,
            workflowId: context.workflow._id,
            type: "error",
            nodeId: node.id,
            message,
          });
          await ctx.runMutation(internal.workflows.runs.transitionRun, {
            runId: context.run._id,
            status: "failed",
            errorNodeId: node.id,
            errorMessage: message,
            completedAt: Date.now(),
          });
          return;
        }
      }
    }

    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      message: "Workflow graph completed placeholder execution.",
      data: {
        executedNodeCount,
        passCount,
        skippedUnreachableNodeIds: graph.nodes
          .filter((node) => !reachableNodeIds.has(node.id))
          .map((node) => node.id),
      },
    });

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "completed",
      summary: `Executed ${executedNodeCount} workflow nodes.`,
      costUsd: 0,
      completedAt: Date.now(),
    });
  },
});
