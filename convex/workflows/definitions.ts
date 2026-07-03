import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  approvalPolicyValidator,
  publishingPolicyValidator,
  scheduleConfigValidator,
  workflowGraphValidator,
  workflowTriggerValidator,
} from "../validators";
import { nextScheduledRunAt } from "./scheduling";

async function resolveWorkflowAccess(
  ctx: MutationCtx | QueryCtx,
  workflowId: Id<"workflows">,
  userId: string
) {
  const workflow = await ctx.db.get(workflowId);
  if (!workflow) return null;
  if (workflow.workspaceId) {
    await requireWorkspaceMember(ctx, workflow.workspaceId, userId);
  } else if (workflow.userId !== userId) {
    return null;
  }
  return workflow;
}

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) return [];

    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, identity.subject);
      return await ctx.db
        .query("workflows")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("workflows")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) return null;

    const workflow = await resolveWorkflowAccess(ctx, args.id, identity.subject);
    if (!workflow) return null;

    return workflow;
  },
});

export const create = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    name: v.string(),
    description: v.optional(v.string()),
    trigger: workflowTriggerValidator,
    scheduleConfig: v.optional(scheduleConfigValidator),
    approvalPolicy: approvalPolicyValidator,
    publishingPolicy: publishingPolicyValidator,
    graph: workflowGraphValidator,
  },
  handler: async (ctx, args) => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);

    const account = args.socialAccountId ? await ctx.db.get(args.socialAccountId) : null;
    if (args.socialAccountId) {
      if (!account) {
        throw new Error("Social account not found");
      }
      if (account.workspaceId) {
        await requireWorkspaceMember(ctx, account.workspaceId, userId);
      } else if (account.userId !== userId) {
        throw new Error("Social account not found");
      }
    }
    const workspace = args.workspaceId || account?.workspaceId
      ? await resolveWritableWorkspace(
        ctx,
        userId,
        args.workspaceId ?? account?.workspaceId
      )
      : defaultWorkspace;
    if (account?.workspaceId && account.workspaceId !== workspace._id) {
      throw new Error("Social account does not belong to this workspace");
    }

    const now = Date.now();
    const workflowId = await ctx.db.insert("workflows", {
      userId,
      workspaceId: workspace._id,
      socialAccountId: args.socialAccountId,
      name: args.name,
      description: args.description,
      trigger: args.trigger,
      scheduleConfig: args.scheduleConfig,
      approvalPolicy: args.approvalPolicy,
      publishingPolicy: args.publishingPolicy,
      graph: args.graph,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });

    return workflowId;
  },
});

export const updateMetadata = mutation({
  args: {
    id: v.id("workflows"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) throw new Error("Not authenticated");

    const workflow = await resolveWorkflowAccess(ctx, args.id, identity.subject);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    const patch: Partial<Doc<"workflows">> = {
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Workflow name is required");
      patch.name = name;
    }
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }

    await ctx.db.patch(args.id, patch);
  },
});

export const duplicate = mutation({
  args: {
    id: v.id("workflows"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) throw new Error("Not authenticated");

    const workflow = await resolveWorkflowAccess(ctx, args.id, identity.subject);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    const now = Date.now();
    return await ctx.db.insert("workflows", {
      userId: workflow.userId,
      workspaceId: workflow.workspaceId,
      socialAccountId: workflow.socialAccountId,
      name: args.name?.trim() || `${workflow.name} copy`,
      description: workflow.description,
      trigger: workflow.trigger,
      scheduleConfig: workflow.scheduleConfig,
      approvalPolicy: workflow.approvalPolicy,
      publishingPolicy: {
        ...workflow.publishingPolicy,
        autoPublish: false,
      },
      graph: workflow.graph,
      ...(workflow.modelDefaults ? { modelDefaults: workflow.modelDefaults } : {}),
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createFromRun = mutation({
  args: {
    runId: v.id("workflowRuns"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) throw new Error("Not authenticated");

    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Workflow run not found");
    }
    if (run.workspaceId) {
      await requireWorkspaceMember(ctx, run.workspaceId, identity.subject);
    } else if (run.userId !== identity.subject) {
      throw new Error("Workflow run not found");
    }
    if (run.status !== "completed") {
      throw new Error("Only completed runs can become workflow drafts");
    }

    const workflow = await resolveWorkflowAccess(ctx, run.workflowId, identity.subject);
    if (!workflow) {
      throw new Error("Source workflow not found");
    }

    if (workflow.socialAccountId) {
      const account = await ctx.db.get(workflow.socialAccountId);
      if (!account) {
        throw new Error("Social account not found");
      }
      if (account.workspaceId) {
        await requireWorkspaceMember(ctx, account.workspaceId, identity.subject);
      } else if (account.userId !== identity.subject) {
        throw new Error("Social account not found");
      }
    }

    const runLabel = run.generatedTopic || run.generatedHook || workflow.name;
    const name = args.name?.trim() || `${runLabel} draft`;
    const now = Date.now();

    return await ctx.db.insert("workflows", {
      userId: identity.subject,
      workspaceId: workflow.workspaceId ?? run.workspaceId,
      socialAccountId: workflow.socialAccountId,
      name,
      description: `Run draft: ${workflow.name}`,
      trigger: workflow.trigger,
      scheduleConfig: workflow.scheduleConfig,
      approvalPolicy: workflow.approvalPolicy,
      publishingPolicy: {
        ...workflow.publishingPolicy,
        autoPublish: false,
      },
      graph: workflow.graph,
      ...(workflow.modelDefaults ? { modelDefaults: workflow.modelDefaults } : {}),
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateGraph = mutation({
  args: {
    id: v.id("workflows"),
    graph: workflowGraphValidator,
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) throw new Error("Not authenticated");

    const workflow = await resolveWorkflowAccess(ctx, args.id, identity.subject);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    await ctx.db.patch(args.id, {
      graph: args.graph,
      nextRunAt: workflow.isActive
        ? nextScheduledRunAt({ ...workflow, graph: args.graph })
        : workflow.nextRunAt,
      updatedAt: Date.now(),
    });
  },
});

export const updateNodePositions = mutation({
  args: {
    id: v.id("workflows"),
    positions: v.array(
      v.object({
        nodeId: v.string(),
        position: v.object({
          x: v.number(),
          y: v.number(),
        }),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) throw new Error("Not authenticated");

    const workflow = await resolveWorkflowAccess(ctx, args.id, identity.subject);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    const positionsByNodeId = new Map(
      args.positions.map((position) => [position.nodeId, position.position])
    );
    const graph = workflow.graph;

    await ctx.db.patch(args.id, {
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) => {
          const position = positionsByNodeId.get(node.id);
          return position ? { ...node, position } : node;
        }),
      },
      updatedAt: Date.now(),
    });
  },
});

export const setActive = mutation({
  args: {
    id: v.id("workflows"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) throw new Error("Not authenticated");

    const workflow = await resolveWorkflowAccess(ctx, args.id, identity.subject);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    await ctx.db.patch(args.id, {
      isActive: args.isActive,
      nextRunAt: args.isActive ? nextScheduledRunAt({ ...workflow, isActive: true }) : undefined,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) throw new Error("Not authenticated");

    const workflow = await resolveWorkflowAccess(ctx, args.id, identity.subject);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    await ctx.db.delete(args.id);
  },
});
