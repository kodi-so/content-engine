import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  approvalPolicyValidator,
  publishingPolicyValidator,
  scheduleConfigValidator,
  workflowGraphValidator,
  workflowTriggerValidator,
} from "../validators";
import { nextScheduledRunAt } from "./scheduling";

async function resolveWorkflowBrand(
  ctx: MutationCtx,
  userId: string,
  brandId?: Id<"brands">
) {
  if (!brandId) return undefined;

  const brand = await ctx.db.get(brandId);
  if (!brand || brand.userId !== userId) {
    throw new Error("Brand not found");
  }
  return brand;
}

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const workflow = await ctx.db.get(args.id);
    if (!workflow || workflow.userId !== identity.subject) return null;

    return workflow;
  },
});

export const create = mutation({
  args: {
    brandId: v.optional(v.id("brands")),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const brand = await resolveWorkflowBrand(ctx, identity.subject, args.brandId);

    if (args.socialAccountId) {
      const account = await ctx.db.get(args.socialAccountId);
      if (!account || account.userId !== identity.subject) {
        throw new Error("Social account not found");
      }
      if (brand && account.brandId && account.brandId !== brand._id) {
        throw new Error("Social account does not belong to the workflow brand");
      }
    }

    const now = Date.now();
    const workflowId = await ctx.db.insert("workflows", {
      userId: identity.subject,
      brandId: brand?._id,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workflow = await ctx.db.get(args.id);
    if (!workflow || workflow.userId !== identity.subject) {
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workflow = await ctx.db.get(args.id);
    if (!workflow || workflow.userId !== identity.subject) {
      throw new Error("Workflow not found");
    }

    const now = Date.now();
    return await ctx.db.insert("workflows", {
      userId: workflow.userId,
      brandId: workflow.brandId,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== identity.subject) {
      throw new Error("Workflow run not found");
    }
    if (run.status !== "completed") {
      throw new Error("Only completed runs can become workflow drafts");
    }

    const workflow = await ctx.db.get(run.workflowId);
    if (!workflow || workflow.userId !== identity.subject) {
      throw new Error("Source workflow not found");
    }

    if (workflow.brandId) {
      const brand = await ctx.db.get(workflow.brandId);
      if (!brand || brand.userId !== identity.subject) {
        throw new Error("Brand not found");
      }
    }

    if (workflow.socialAccountId) {
      const account = await ctx.db.get(workflow.socialAccountId);
      if (!account || account.userId !== identity.subject) {
        throw new Error("Social account not found");
      }
    }

    const runLabel = run.generatedTopic || run.generatedHook || workflow.name;
    const name = args.name?.trim() || `${runLabel} draft`;
    const now = Date.now();

    return await ctx.db.insert("workflows", {
      userId: identity.subject,
      brandId: workflow.brandId,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workflow = await ctx.db.get(args.id);
    if (!workflow || workflow.userId !== identity.subject) {
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

export const setActive = mutation({
  args: {
    id: v.id("workflows"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workflow = await ctx.db.get(args.id);
    if (!workflow || workflow.userId !== identity.subject) {
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workflow = await ctx.db.get(args.id);
    if (!workflow || workflow.userId !== identity.subject) {
      throw new Error("Workflow not found");
    }

    await ctx.db.delete(args.id);
  },
});
