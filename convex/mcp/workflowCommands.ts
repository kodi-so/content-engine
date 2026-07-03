import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { workflowGraphValidator } from "../validators";
import type { WorkflowEdge, WorkflowGraph } from "../../src/lib/workflow/workflowGraph";
import { validateWorkflowGraph } from "../../src/lib/workflow/workflowGraphValidation";
import { nextScheduledRunAt } from "../workflows/scheduling";

export type WorkflowDoc = Doc<"workflows">;
export type WorkflowGraphDoc = typeof workflowGraphValidator.type;
export type WorkflowNodeDoc = WorkflowGraphDoc["nodes"][number];
export type WorkflowEdgeDoc = WorkflowGraphDoc["edges"][number];

export const DEFAULT_PUBLISHING_PROVIDER = "post_bridge";

export const workflowNodeValidator = v.object({
  id: v.string(),
  type: v.string(),
  label: v.string(),
  position: v.object({
    x: v.number(),
    y: v.number(),
  }),
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  config: v.record(v.string(), v.any()),
  inputBindings: v.optional(v.any()),
  retention: v.optional(v.any()),
});

export const workflowEdgeValidator = v.object({
  id: v.string(),
  sourceNodeId: v.string(),
  sourcePort: v.string(),
  targetNodeId: v.string(),
  targetPort: v.string(),
});

export function requireUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

export function asWorkflowGraph(graph: WorkflowGraphDoc): WorkflowGraph {
  return graph as unknown as WorkflowGraph;
}

export function asWorkflowGraphDoc(graph: WorkflowGraph): WorkflowGraphDoc {
  return graph as unknown as WorkflowGraphDoc;
}

export function validationFailureMessage(
  graph: WorkflowGraphDoc,
  mode: "draft" | "executable" = "executable"
) {
  const result = validateWorkflowGraph(asWorkflowGraph(graph), mode);
  if (result.valid) return null;

  return [
    "Invalid workflow graph:",
    ...result.errors.map((error) => `- ${error.path}: ${error.message}`),
  ].join("\n");
}

export function assertValidGraph(
  graph: WorkflowGraphDoc,
  mode: "draft" | "executable" = "executable"
) {
  const message = validationFailureMessage(graph, mode);
  if (message) throw new Error(message);
}

export function workflowSummary(workflow: WorkflowDoc) {
  return {
    workflowId: workflow._id,
    socialAccountId: workflow.socialAccountId,
    name: workflow.name,
    description: workflow.description,
    trigger: workflow.trigger,
    scheduleConfig: workflow.scheduleConfig,
    approvalPolicy: workflow.approvalPolicy,
    publishingPolicy: workflow.publishingPolicy,
    isActive: workflow.isActive,
    nodeCount: workflow.graph.nodes.length,
    edgeCount: workflow.graph.edges.length,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}

export async function getOwnedWorkflow(
  ctx: MutationCtx,
  id: Id<"workflows">,
  userId: string
) {
  const workflow = await ctx.db.get(id);
  if (!workflow || workflow.userId !== userId) throw new Error("Workflow not found");
  return workflow;
}

export async function assertOwnedSocialAccount(
  ctx: MutationCtx,
  args: {
    socialAccountId?: Id<"socialAccounts">;
    userId: string;
  }
) {
  if (!args.socialAccountId) return;

  const account = await ctx.db.get(args.socialAccountId);
  if (!account || account.userId !== args.userId) {
    throw new Error("Social account not found");
  }
}

export async function createWorkflow(
  ctx: MutationCtx,
  args: {
    userId: string;
    socialAccountId?: Id<"socialAccounts">;
    name: string;
    description?: string;
    trigger?: WorkflowDoc["trigger"];
    scheduleConfig?: WorkflowDoc["scheduleConfig"];
    approvalPolicy?: WorkflowDoc["approvalPolicy"];
    publishingPolicy?: WorkflowDoc["publishingPolicy"];
    graph: WorkflowGraphDoc;
  }
) {
  await assertOwnedSocialAccount(ctx, {
    socialAccountId: args.socialAccountId,
    userId: args.userId,
  });
  assertValidGraph(args.graph, "draft");

  const name = args.name.trim();
  if (!name) throw new Error("Workflow name is required");

  const now = Date.now();
  return await ctx.db.insert("workflows", {
    userId: args.userId,
    socialAccountId: args.socialAccountId,
    name,
    description: args.description?.trim() || undefined,
    trigger: args.trigger ?? "manual",
    scheduleConfig: args.scheduleConfig,
    approvalPolicy: args.approvalPolicy ?? { mode: "always" },
    publishingPolicy: args.publishingPolicy ?? {
      provider: DEFAULT_PUBLISHING_PROVIDER,
      autoPublish: false,
      defaultPlatforms: ["tiktok"],
    },
    graph: args.graph,
    isActive: false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function patchWorkflowGraph(
  ctx: MutationCtx,
  workflow: WorkflowDoc,
  graph: WorkflowGraphDoc
) {
  assertValidGraph(graph, "draft");
  await ctx.db.patch(workflow._id, {
    graph,
    nextRunAt: workflow.isActive
      ? nextScheduledRunAt({ ...workflow, graph })
      : workflow.nextRunAt,
    updatedAt: Date.now(),
  });
}

export async function updateWorkflowMetadata(
  ctx: MutationCtx,
  args: {
    userId: string;
    id: Id<"workflows">;
    name?: string;
    description?: string;
    socialAccountId?: Id<"socialAccounts"> | null;
    trigger?: WorkflowDoc["trigger"];
    scheduleConfig?: WorkflowDoc["scheduleConfig"];
    approvalPolicy?: WorkflowDoc["approvalPolicy"];
    publishingPolicy?: WorkflowDoc["publishingPolicy"];
  }
) {
  const workflow = await getOwnedWorkflow(ctx, args.id, args.userId);

  if (args.socialAccountId) {
    await assertOwnedSocialAccount(ctx, {
      socialAccountId: args.socialAccountId,
      userId: args.userId,
    });
  }

  const patch: Partial<WorkflowDoc> = {
    updatedAt: Date.now(),
  };
  if (args.name !== undefined) {
    const name = args.name.trim();
    if (!name) throw new Error("Workflow name is required");
    patch.name = name;
  }
  if (args.description !== undefined) patch.description = args.description.trim() || undefined;
  if (args.socialAccountId !== undefined) patch.socialAccountId = args.socialAccountId ?? undefined;
  if (args.trigger !== undefined) patch.trigger = args.trigger;
  if (args.scheduleConfig !== undefined) patch.scheduleConfig = args.scheduleConfig;
  if (args.approvalPolicy !== undefined) patch.approvalPolicy = args.approvalPolicy;
  if (args.publishingPolicy !== undefined) patch.publishingPolicy = args.publishingPolicy;
  if (workflow.isActive && (args.trigger !== undefined || args.scheduleConfig !== undefined)) {
    patch.nextRunAt = nextScheduledRunAt({ ...workflow, ...patch });
  }

  await ctx.db.patch(workflow._id, patch);
  return workflow._id;
}

export async function addWorkflowNode(
  ctx: MutationCtx,
  args: { workflowId: Id<"workflows">; userId: string; node: WorkflowNodeDoc }
) {
  const workflow = await getOwnedWorkflow(ctx, args.workflowId, args.userId);
  await patchWorkflowGraph(ctx, workflow, {
    ...workflow.graph,
    nodes: [...workflow.graph.nodes, args.node],
  });
  return workflow._id;
}

export async function updateWorkflowNode(
  ctx: MutationCtx,
  args: {
    userId: string;
    workflowId: Id<"workflows">;
    nodeId: string;
    label?: string;
    position?: { x: number; y: number };
    provider?: string | null;
    model?: string | null;
    config?: Record<string, unknown>;
    inputBindings?: unknown | null;
    retention?: unknown | null;
  }
) {
  const workflow = await getOwnedWorkflow(ctx, args.workflowId, args.userId);
  let found = false;
  const nodes = workflow.graph.nodes.map((node) => {
    if (node.id !== args.nodeId) return node;
    found = true;
    const updatedNode = {
      ...node,
      ...(args.label !== undefined ? { label: args.label } : {}),
      ...(args.position !== undefined ? { position: args.position } : {}),
      ...(args.config !== undefined ? { config: args.config as WorkflowNodeDoc["config"] } : {}),
    };

    if (args.provider !== undefined) {
      if (args.provider === null) delete updatedNode.provider;
      else updatedNode.provider = args.provider;
    }
    if (args.model !== undefined) {
      if (args.model === null) delete updatedNode.model;
      else updatedNode.model = args.model;
    }
    if (args.inputBindings !== undefined) {
      if (args.inputBindings === null) delete updatedNode.inputBindings;
      else updatedNode.inputBindings = args.inputBindings as WorkflowNodeDoc["inputBindings"];
    }
    if (args.retention !== undefined) {
      if (args.retention === null) delete updatedNode.retention;
      else updatedNode.retention = args.retention as WorkflowNodeDoc["retention"];
    }

    return updatedNode;
  });

  if (!found) throw new Error("Workflow node not found");
  await patchWorkflowGraph(ctx, workflow, { ...workflow.graph, nodes });
  return workflow._id;
}

export async function deleteWorkflowNode(
  ctx: MutationCtx,
  args: { workflowId: Id<"workflows">; userId: string; nodeId: string }
) {
  const workflow = await getOwnedWorkflow(ctx, args.workflowId, args.userId);
  const nodes = workflow.graph.nodes.filter((node) => node.id !== args.nodeId);
  if (nodes.length === workflow.graph.nodes.length) throw new Error("Workflow node not found");

  await patchWorkflowGraph(ctx, workflow, {
    ...workflow.graph,
    nodes,
    edges: workflow.graph.edges.filter(
      (edge) => edge.sourceNodeId !== args.nodeId && edge.targetNodeId !== args.nodeId
    ),
  });
  return workflow._id;
}

export async function connectWorkflowNodes(
  ctx: MutationCtx,
  args: {
    userId: string;
    workflowId: Id<"workflows">;
    edgeId?: string;
    sourceNodeId: string;
    sourcePort: string;
    targetNodeId: string;
    targetPort: string;
  }
) {
  const workflow = await getOwnedWorkflow(ctx, args.workflowId, args.userId);
  const edge = {
    id: args.edgeId?.trim() || `${args.sourceNodeId}:${args.sourcePort}->${args.targetNodeId}:${args.targetPort}`,
    sourceNodeId: args.sourceNodeId,
    sourcePort: args.sourcePort,
    targetNodeId: args.targetNodeId,
    targetPort: args.targetPort,
  } satisfies WorkflowEdgeDoc;

  const duplicateConnection = workflow.graph.edges.some((candidate) =>
    candidate.sourceNodeId === edge.sourceNodeId &&
    candidate.sourcePort === edge.sourcePort &&
    candidate.targetNodeId === edge.targetNodeId &&
    candidate.targetPort === edge.targetPort
  );
  if (duplicateConnection) throw new Error("Workflow edge already exists");

  await patchWorkflowGraph(ctx, workflow, {
    ...workflow.graph,
    edges: [...workflow.graph.edges, edge],
  });
  return workflow._id;
}

export async function disconnectWorkflowEdge(
  ctx: MutationCtx,
  args: { workflowId: Id<"workflows">; userId: string; edgeId: string }
) {
  const workflow = await getOwnedWorkflow(ctx, args.workflowId, args.userId);
  const edges = workflow.graph.edges.filter((edge) => edge.id !== args.edgeId);
  if (edges.length === workflow.graph.edges.length) throw new Error("Workflow edge not found");

  await patchWorkflowGraph(ctx, workflow, {
    ...workflow.graph,
    edges,
  });
  return workflow._id;
}

export async function replaceWorkflowEdge(
  ctx: MutationCtx,
  args: {
    userId: string;
    workflowId: Id<"workflows">;
    edgeId: string;
    edge: WorkflowEdge;
  }
) {
  const workflow = await getOwnedWorkflow(ctx, args.workflowId, args.userId);
  let found = false;
  const edges = workflow.graph.edges.map((edge) => {
    if (edge.id !== args.edgeId) return edge;
    found = true;
    return args.edge;
  });
  if (!found) throw new Error("Workflow edge not found");

  await patchWorkflowGraph(ctx, workflow, {
    ...workflow.graph,
    edges,
  });
  return workflow._id;
}
