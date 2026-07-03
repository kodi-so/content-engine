import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import {
  approvalPolicyValidator,
  platformValidator,
  publishingPolicyValidator,
  publishingProviderValidator,
  scheduleConfigValidator,
  workflowGraphValidator,
  workflowTriggerValidator,
} from "../validators";
import { createStarterWorkflowGraph } from "../../src/lib/workflow/workflowGraph";
import { validateWorkflowGraph } from "../../src/lib/workflow/workflowGraphValidation";
import { createWorkflowRun } from "../workflows/runCreation";
import { requireBetaAccess } from "../auth/users";
import {
  DEFAULT_PUBLISHING_PROVIDER,
  addWorkflowNode,
  asWorkflowGraph,
  asWorkflowGraphDoc,
  assertValidGraph,
  connectWorkflowNodes,
  createWorkflow,
  deleteWorkflowNode,
  disconnectWorkflowEdge,
  getOwnedWorkflow,
  patchWorkflowGraph,
  replaceWorkflowEdge,
  requireUserId,
  updateWorkflowMetadata,
  updateWorkflowNode,
  workflowEdgeValidator,
  workflowNodeValidator,
  workflowSummary,
  type WorkflowNodeDoc,
} from "./workflowCommands";

export const list = query({
  handler: async (ctx) => {
    const userId = requireUserId(await requireBetaAccess(ctx));
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return workflows.map(workflowSummary);
  },
});

export const listForMcp = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return workflows.map(workflowSummary);
  },
});

export const get = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const userId = requireUserId(await requireBetaAccess(ctx));
    const workflow = await ctx.db.get(args.id);
    if (!workflow || workflow.userId !== userId) return null;

    return workflow;
  },
});

export const getForMcp = internalQuery({
  args: { userId: v.string(), id: v.id("workflows") },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.id);
    if (!workflow || workflow.userId !== args.userId) return null;

    return workflow;
  },
});

export const validateGraph = query({
  args: { graph: workflowGraphValidator },
  handler: async (_ctx, args) => {
    return validateWorkflowGraph(asWorkflowGraph(args.graph));
  },
});

export const validateGraphForMcp = internalQuery({
  args: { graph: workflowGraphValidator },
  handler: async (_ctx, args) => {
    return validateWorkflowGraph(asWorkflowGraph(args.graph));
  },
});

export const createBlank = mutation({
  args: {
    socialAccountId: v.optional(v.id("socialAccounts")),
    name: v.string(),
    description: v.optional(v.string()),
    publishingProvider: v.optional(publishingProviderValidator),
    defaultPlatforms: v.optional(v.array(platformValidator)),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await requireBetaAccess(ctx));

    return await createWorkflow(ctx, {
      userId,
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

export const createBlankForMcp = internalMutation({
  args: {
    userId: v.string(),
    socialAccountId: v.optional(v.id("socialAccounts")),
    name: v.string(),
    description: v.optional(v.string()),
    publishingProvider: v.optional(publishingProviderValidator),
    defaultPlatforms: v.optional(v.array(platformValidator)),
  },
  handler: async (ctx, args) => {
    return await createWorkflow(ctx, {
      userId: args.userId,
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
    const userId = requireUserId(await requireBetaAccess(ctx));
    return await updateWorkflowMetadata(ctx, { ...args, userId });
  },
});

export const updateMetadataForMcp = internalMutation({
  args: {
    userId: v.string(),
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
    return await updateWorkflowMetadata(ctx, args);
  },
});

export const updateGraph = mutation({
  args: {
    id: v.id("workflows"),
    graph: workflowGraphValidator,
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await requireBetaAccess(ctx));
    const workflow = await getOwnedWorkflow(ctx, args.id, userId);
    await patchWorkflowGraph(ctx, workflow, args.graph);
    return workflow._id;
  },
});

export const updateGraphForMcp = internalMutation({
  args: {
    userId: v.string(),
    id: v.id("workflows"),
    graph: workflowGraphValidator,
  },
  handler: async (ctx, args) => {
    const workflow = await getOwnedWorkflow(ctx, args.id, args.userId);
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
    const userId = requireUserId(await requireBetaAccess(ctx));
    return await addWorkflowNode(ctx, {
      userId,
      workflowId: args.workflowId,
      node: args.node as WorkflowNodeDoc,
    });
  },
});

export const addNodeForMcp = internalMutation({
  args: {
    userId: v.string(),
    workflowId: v.id("workflows"),
    node: workflowNodeValidator,
  },
  handler: async (ctx, args) => {
    return await addWorkflowNode(ctx, {
      userId: args.userId,
      workflowId: args.workflowId,
      node: args.node as WorkflowNodeDoc,
    });
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
    const userId = requireUserId(await requireBetaAccess(ctx));
    return await updateWorkflowNode(ctx, { ...args, userId });
  },
});

export const updateNodeForMcp = internalMutation({
  args: {
    userId: v.string(),
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
    return await updateWorkflowNode(ctx, args);
  },
});

export const deleteNode = mutation({
  args: {
    workflowId: v.id("workflows"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await requireBetaAccess(ctx));
    return await deleteWorkflowNode(ctx, { ...args, userId });
  },
});

export const deleteNodeForMcp = internalMutation({
  args: {
    userId: v.string(),
    workflowId: v.id("workflows"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    return await deleteWorkflowNode(ctx, args);
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
    const userId = requireUserId(await requireBetaAccess(ctx));
    return await connectWorkflowNodes(ctx, { ...args, userId });
  },
});

export const connectNodesForMcp = internalMutation({
  args: {
    userId: v.string(),
    workflowId: v.id("workflows"),
    edgeId: v.optional(v.string()),
    sourceNodeId: v.string(),
    sourcePort: v.string(),
    targetNodeId: v.string(),
    targetPort: v.string(),
  },
  handler: async (ctx, args) => {
    return await connectWorkflowNodes(ctx, args);
  },
});

export const disconnectEdge = mutation({
  args: {
    workflowId: v.id("workflows"),
    edgeId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await requireBetaAccess(ctx));
    return await disconnectWorkflowEdge(ctx, { ...args, userId });
  },
});

export const disconnectEdgeForMcp = internalMutation({
  args: {
    userId: v.string(),
    workflowId: v.id("workflows"),
    edgeId: v.string(),
  },
  handler: async (ctx, args) => {
    return await disconnectWorkflowEdge(ctx, args);
  },
});

export const replaceEdge = mutation({
  args: {
    workflowId: v.id("workflows"),
    edgeId: v.string(),
    edge: workflowEdgeValidator,
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await requireBetaAccess(ctx));
    return await replaceWorkflowEdge(ctx, {
      userId,
      workflowId: args.workflowId,
      edgeId: args.edgeId,
      edge: args.edge,
    });
  },
});

export const replaceEdgeForMcp = internalMutation({
  args: {
    userId: v.string(),
    workflowId: v.id("workflows"),
    edgeId: v.string(),
    edge: workflowEdgeValidator,
  },
  handler: async (ctx, args) => {
    return await replaceWorkflowEdge(ctx, args);
  },
});

export const runWorkflow = mutation({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const userId = requireUserId(await requireBetaAccess(ctx));
    const workflow = await getOwnedWorkflow(ctx, args.workflowId, userId);
    assertValidGraph(workflow.graph);

    return await createWorkflowRun(ctx, { userId, workflow });
  },
});

export const runWorkflowForMcp = internalMutation({
  args: { userId: v.string(), workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const workflow = await getOwnedWorkflow(ctx, args.workflowId, args.userId);
    assertValidGraph(workflow.graph);

    return await createWorkflowRun(ctx, { userId: args.userId, workflow });
  },
});
