import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  approvalPolicyValidator,
  contentFormatValidator,
  publishingPolicyValidator,
  scheduleConfigValidator,
  workflowGraphValidator,
  workflowTriggerValidator,
} from "../validators";

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

    const activeVersion = workflow.activeVersionId
      ? await ctx.db.get(workflow.activeVersionId)
      : null;

    return { ...workflow, activeVersion };
  },
});

export const create = mutation({
  args: {
    brandId: v.id("brands"),
    socialAccountId: v.optional(v.id("socialAccounts")),
    name: v.string(),
    description: v.optional(v.string()),
    contentFormat: contentFormatValidator,
    trigger: workflowTriggerValidator,
    scheduleConfig: v.optional(scheduleConfigValidator),
    approvalPolicy: approvalPolicyValidator,
    publishingPolicy: publishingPolicyValidator,
    strategy: v.optional(v.any()),
    graph: workflowGraphValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.userId !== identity.subject) {
      throw new Error("Brand not found");
    }

    if (args.socialAccountId) {
      const account = await ctx.db.get(args.socialAccountId);
      if (!account || account.userId !== identity.subject) {
        throw new Error("Social account not found");
      }
    }

    const now = Date.now();
    const workflowId = await ctx.db.insert("workflows", {
      userId: identity.subject,
      brandId: args.brandId,
      socialAccountId: args.socialAccountId,
      name: args.name,
      description: args.description,
      contentFormat: args.contentFormat,
      trigger: args.trigger,
      scheduleConfig: args.scheduleConfig,
      approvalPolicy: args.approvalPolicy,
      publishingPolicy: args.publishingPolicy,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });

    const versionId = await ctx.db.insert("workflowVersions", {
      userId: identity.subject,
      workflowId,
      version: 1,
      strategy: args.strategy,
      graph: args.graph,
      createdAt: now,
      createdBy: identity.subject,
    });

    await ctx.db.patch(workflowId, {
      activeVersionId: versionId,
      updatedAt: now,
    });

    return workflowId;
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
