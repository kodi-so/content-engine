import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  approvalPolicyValidator,
  platformValidator,
  publishingPolicyValidator,
  publishingProviderValidator,
  scheduleConfigValidator,
  workflowGraphValidator,
  workflowTriggerValidator,
} from "../validators";
import {
  createStarterWorkflowGraph,
  type WorkflowEdge,
  type WorkflowGraph,
} from "../../src/lib/workflow/workflowGraph";
import {
  createWorkflowGraphFromTemplate,
  listWorkflowTemplates,
  type WorkflowTemplateId,
} from "../../src/lib/workflow/workflowTemplates";
import { validateWorkflowGraph } from "../../src/lib/workflow/workflowGraphValidation";
import { createWorkflowRun } from "../workflows/runCreation";
import { nextScheduledRunAt } from "../workflows/scheduling";

type WorkflowDoc = Doc<"workflows">;
type WorkflowGraphDoc = typeof workflowGraphValidator.type;
type WorkflowNodeDoc = WorkflowGraphDoc["nodes"][number];
type WorkflowEdgeDoc = WorkflowGraphDoc["edges"][number];

const DEFAULT_PUBLISHING_PROVIDER = "postiz";

const workflowNodeValidator = v.object({
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

const workflowEdgeValidator = v.object({
  id: v.string(),
  sourceNodeId: v.string(),
  sourcePort: v.string(),
  targetNodeId: v.string(),
  targetPort: v.string(),
});

function requireUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

function asWorkflowGraph(graph: WorkflowGraphDoc): WorkflowGraph {
  return graph as unknown as WorkflowGraph;
}

function asWorkflowGraphDoc(graph: WorkflowGraph): WorkflowGraphDoc {
  return graph as unknown as WorkflowGraphDoc;
}

function validationFailureMessage(
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

function assertValidGraph(
  graph: WorkflowGraphDoc,
  mode: "draft" | "executable" = "executable"
) {
  const message = validationFailureMessage(graph, mode);
  if (message) throw new Error(message);
}

function workflowSummary(workflow: WorkflowDoc) {
  return {
    workflowId: workflow._id,
    brandId: workflow.brandId,
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

async function getOwnedWorkflow(
  ctx: MutationCtx,
  id: Id<"workflows">,
  userId: string
) {
  const workflow = await ctx.db.get(id);
  if (!workflow || workflow.userId !== userId) throw new Error("Workflow not found");
  return workflow;
}

async function assertOwnedBrand(ctx: MutationCtx, brandId: Id<"brands">, userId: string) {
  const brand = await ctx.db.get(brandId);
  if (!brand || brand.userId !== userId) throw new Error("Brand not found");
  return brand;
}

async function resolveWorkflowBrand(
  ctx: MutationCtx,
  userId: string,
  brandId?: Id<"brands">
) {
  return brandId ? await assertOwnedBrand(ctx, brandId, userId) : undefined;
}

async function assertOwnedSocialAccount(
  ctx: MutationCtx,
  args: {
    socialAccountId?: Id<"socialAccounts">;
    brandId?: Id<"brands">;
    userId: string;
  }
) {
  if (!args.socialAccountId) return;

  const account = await ctx.db.get(args.socialAccountId);
  if (!account || account.userId !== args.userId) {
    throw new Error("Social account not found");
  }
  if (args.brandId && account.brandId && account.brandId !== args.brandId) {
    throw new Error("Social account does not belong to the workflow brand");
  }
}

async function createWorkflow(
  ctx: MutationCtx,
  args: {
    userId: string;
    brandId?: Id<"brands">;
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
  const brand = await resolveWorkflowBrand(ctx, args.userId, args.brandId);
  await assertOwnedSocialAccount(ctx, {
    socialAccountId: args.socialAccountId,
    brandId: brand?._id,
    userId: args.userId,
  });
  assertValidGraph(args.graph, "draft");

  const name = args.name.trim();
  if (!name) throw new Error("Workflow name is required");

  const now = Date.now();
  return await ctx.db.insert("workflows", {
    userId: args.userId,
    brandId: brand?._id,
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

async function patchWorkflowGraph(
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

export const list = query({
  handler: async (ctx) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return workflows.map(workflowSummary);
  },
});

export const get = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await ctx.db.get(args.id);
    if (!workflow || workflow.userId !== userId) return null;

    return workflow;
  },
});

export const validateGraph = query({
  args: { graph: workflowGraphValidator },
  handler: async (_ctx, args) => {
    return validateWorkflowGraph(asWorkflowGraph(args.graph));
  },
});

export const createBlank = mutation({
  args: {
    brandId: v.optional(v.id("brands")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    name: v.string(),
    description: v.optional(v.string()),
    publishingProvider: v.optional(publishingProviderValidator),
    defaultPlatforms: v.optional(v.array(platformValidator)),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());

    return await createWorkflow(ctx, {
      userId,
      brandId: args.brandId,
      socialAccountId: args.socialAccountId,
      name: args.name,
      description: args.description,
      publishingPolicy: {
        provider: args.publishingProvider ?? DEFAULT_PUBLISHING_PROVIDER,
        autoPublish: false,
        defaultPlatforms: args.defaultPlatforms ?? ["tiktok"],
      },
      graph: asWorkflowGraphDoc(createStarterWorkflowGraph()),
    });
  },
});

export const createFromTemplate = mutation({
  args: {
    templateId: v.string(),
    brandId: v.optional(v.id("brands")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    creativeRequest: v.optional(v.string()),
    publishingPolicy: v.optional(publishingPolicyValidator),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const template = listWorkflowTemplates().find((candidate) => candidate.id === args.templateId);
    if (!template) throw new Error("Workflow template not found");

    const graph = createWorkflowGraphFromTemplate(
      template.id as WorkflowTemplateId,
      { creativeRequest: args.creativeRequest }
    );

    return await createWorkflow(ctx, {
      userId,
      brandId: args.brandId,
      socialAccountId: args.socialAccountId,
      name: args.name?.trim() || template.name,
      description: args.description ?? `MCP template draft: ${template.name}`,
      publishingPolicy: args.publishingPolicy ?? {
        provider: template.defaultPublishingProvider,
        autoPublish: false,
        defaultPlatforms: ["tiktok"],
      },
      graph: asWorkflowGraphDoc(graph),
    });
  },
});

export const updateMetadata = mutation({
  args: {
    id: v.id("workflows"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    socialAccountId: v.optional(v.union(v.id("socialAccounts"), v.null())),
    trigger: v.optional(workflowTriggerValidator),
    scheduleConfig: v.optional(scheduleConfigValidator),
    approvalPolicy: v.optional(approvalPolicyValidator),
    publishingPolicy: v.optional(publishingPolicyValidator),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await getOwnedWorkflow(ctx, args.id, userId);

    if (args.socialAccountId) {
      await assertOwnedSocialAccount(ctx, {
        socialAccountId: args.socialAccountId,
        brandId: workflow.brandId,
        userId,
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
  },
});

export const updateGraph = mutation({
  args: {
    id: v.id("workflows"),
    graph: workflowGraphValidator,
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await getOwnedWorkflow(ctx, args.id, userId);
    await patchWorkflowGraph(ctx, workflow, args.graph);
    return workflow._id;
  },
});

export const addNode = mutation({
  args: {
    workflowId: v.id("workflows"),
    node: workflowNodeValidator,
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await getOwnedWorkflow(ctx, args.workflowId, userId);
    const graph = {
      ...workflow.graph,
      nodes: [...workflow.graph.nodes, args.node as WorkflowNodeDoc],
    };

    await patchWorkflowGraph(ctx, workflow, graph);
    return workflow._id;
  },
});

export const updateNode = mutation({
  args: {
    workflowId: v.id("workflows"),
    nodeId: v.string(),
    label: v.optional(v.string()),
    position: v.optional(v.object({ x: v.number(), y: v.number() })),
    provider: v.optional(v.union(v.string(), v.null())),
    model: v.optional(v.union(v.string(), v.null())),
    config: v.optional(v.record(v.string(), v.any())),
    inputBindings: v.optional(v.union(v.any(), v.null())),
    retention: v.optional(v.union(v.any(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await getOwnedWorkflow(ctx, args.workflowId, userId);
    let found = false;
    const nodes = workflow.graph.nodes.map((node) => {
      if (node.id !== args.nodeId) return node;
      found = true;
      const updatedNode = {
        ...node,
        ...(args.label !== undefined ? { label: args.label } : {}),
        ...(args.position !== undefined ? { position: args.position } : {}),
        ...(args.config !== undefined ? { config: args.config } : {}),
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
        else updatedNode.inputBindings = args.inputBindings;
      }
      if (args.retention !== undefined) {
        if (args.retention === null) delete updatedNode.retention;
        else updatedNode.retention = args.retention;
      }

      return updatedNode;
    });

    if (!found) throw new Error("Workflow node not found");

    await patchWorkflowGraph(ctx, workflow, {
      ...workflow.graph,
      nodes,
    });
    return workflow._id;
  },
});

export const deleteNode = mutation({
  args: {
    workflowId: v.id("workflows"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await getOwnedWorkflow(ctx, args.workflowId, userId);
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
  },
});

export const connectNodes = mutation({
  args: {
    workflowId: v.id("workflows"),
    edgeId: v.optional(v.string()),
    sourceNodeId: v.string(),
    sourcePort: v.string(),
    targetNodeId: v.string(),
    targetPort: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await getOwnedWorkflow(ctx, args.workflowId, userId);
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
  },
});

export const disconnectEdge = mutation({
  args: {
    workflowId: v.id("workflows"),
    edgeId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await getOwnedWorkflow(ctx, args.workflowId, userId);
    const edges = workflow.graph.edges.filter((edge) => edge.id !== args.edgeId);
    if (edges.length === workflow.graph.edges.length) throw new Error("Workflow edge not found");

    await patchWorkflowGraph(ctx, workflow, {
      ...workflow.graph,
      edges,
    });
    return workflow._id;
  },
});

export const replaceEdge = mutation({
  args: {
    workflowId: v.id("workflows"),
    edgeId: v.string(),
    edge: workflowEdgeValidator,
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await getOwnedWorkflow(ctx, args.workflowId, userId);
    let found = false;
    const edges = workflow.graph.edges.map((edge) => {
      if (edge.id !== args.edgeId) return edge;
      found = true;
      return args.edge as WorkflowEdge;
    });
    if (!found) throw new Error("Workflow edge not found");

    await patchWorkflowGraph(ctx, workflow, {
      ...workflow.graph,
      edges,
    });
    return workflow._id;
  },
});

export const runWorkflow = mutation({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const workflow = await getOwnedWorkflow(ctx, args.workflowId, userId);
    assertValidGraph(workflow.graph);

    return await createWorkflowRun(ctx, { userId, workflow });
  },
});
