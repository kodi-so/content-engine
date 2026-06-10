import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";

const brandFields = {
  name: v.string(),
  description: v.optional(v.string()),
  niche: v.optional(v.string()),
  audience: v.optional(v.string()),
  voice: v.optional(v.string()),
  visualStyle: v.optional(v.string()),
  offer: v.optional(v.string()),
  constraints: v.optional(v.array(v.string())),
  examplePosts: v.optional(v.array(v.string())),
  performanceNotes: v.optional(v.string()),
};

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) return [];

    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, identity.subject);
      return await ctx.db
        .query("brands")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .collect();
    }

    const userBrands = await ctx.db
      .query("brands")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();

    return userBrands;
  },
});

export const get = query({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) return null;

    const brand = await ctx.db.get(args.id);
    if (!brand) return null;
    if (brand.workspaceId) {
      await requireWorkspaceMember(ctx, brand.workspaceId, identity.subject);
    } else if (brand.userId !== identity.subject) {
      return null;
    }

    return brand;
  },
});

export const getForRunner = internalQuery({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    ...brandFields,
  },
  handler: async (ctx, args) => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    const workspace = args.workspaceId
      ? await resolveWritableWorkspace(ctx, userId, args.workspaceId)
      : defaultWorkspace;
    const { workspaceId, ...brandArgs } = args;
    void workspaceId;

    const now = Date.now();
    return await ctx.db.insert("brands", {
      userId,
      workspaceId: workspace._id,
      ...brandArgs,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("brands"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    niche: v.optional(v.string()),
    audience: v.optional(v.string()),
    voice: v.optional(v.string()),
    visualStyle: v.optional(v.string()),
    offer: v.optional(v.string()),
    constraints: v.optional(v.array(v.string())),
    examplePosts: v.optional(v.array(v.string())),
    performanceNotes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);

    const brand = await ctx.db.get(args.id);
    if (!brand) {
      throw new Error("Brand not found");
    }
    if (brand.workspaceId) {
      await requireWorkspaceMember(ctx, brand.workspaceId, identity.subject);
    } else if (brand.userId !== identity.subject) {
      throw new Error("Brand not found");
    }

    const { id, ...updates } = args;
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    await ctx.db.patch(id, {
      ...cleanUpdates,
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);

    const brand = await ctx.db.get(args.id);
    if (!brand) {
      throw new Error("Brand not found");
    }
    if (brand.workspaceId) {
      await requireWorkspaceMember(ctx, brand.workspaceId, identity.subject);
    } else if (brand.userId !== identity.subject) {
      throw new Error("Brand not found");
    }

    await ctx.db.delete(args.id);
  },
});
