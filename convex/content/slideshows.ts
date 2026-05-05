import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { slideshowStatusValidator } from "../validators";

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

export const list = query({
  args: {
    contentRequestId: v.optional(v.id("contentRequests")),
    workflowRunId: v.optional(v.id("workflowRuns")),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());

    if (args.contentRequestId) {
      const rows = await ctx.db
        .query("slideshows")
        .withIndex("by_content_request", (q) =>
          q.eq("contentRequestId", args.contentRequestId!)
        )
        .collect();
      return rows.filter((row) => row.userId === userId);
    }

    if (args.workflowRunId) {
      const rows = await ctx.db
        .query("slideshows")
        .withIndex("by_workflow_run", (q) =>
          q.eq("workflowRunId", args.workflowRunId!)
        )
        .collect();
      return rows.filter((row) => row.userId === userId);
    }

    return await ctx.db
      .query("slideshows")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getForRunner = internalQuery({
  args: { slideshowId: v.id("slideshows") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.slideshowId);
  },
});

export const listForContentRequest = internalQuery({
  args: {
    requestId: v.id("contentRequests"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("slideshows")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", args.requestId))
      .collect();
    return rows.filter((row) => row.userId === args.userId);
  },
});

export const createFromRunner = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.id("brands"),
    socialAccountId: v.optional(v.id("socialAccounts")),
    contentRequestId: v.optional(v.id("contentRequests")),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    title: v.string(),
    caption: v.optional(v.string()),
    status: v.optional(slideshowStatusValidator),
    spec: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("slideshows", {
      ...args,
      status: args.status ?? "preview",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateFromRunner = internalMutation({
  args: {
    slideshowId: v.id("slideshows"),
    userId: v.string(),
    title: v.optional(v.string()),
    caption: v.optional(v.string()),
    status: v.optional(slideshowStatusValidator),
    spec: v.optional(v.any()),
    savedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const slideshow = await ctx.db.get(args.slideshowId);
    if (!slideshow || slideshow.userId !== args.userId) {
      throw new Error("Slideshow not found");
    }

    const patch: Partial<Doc<"slideshows">> = {
      updatedAt: Date.now(),
    };
    if (args.title !== undefined) patch.title = args.title;
    if (args.caption !== undefined) patch.caption = args.caption;
    if (args.status !== undefined) patch.status = args.status;
    if (args.spec !== undefined) patch.spec = args.spec;
    if (args.savedAt !== undefined) patch.savedAt = args.savedAt;

    await ctx.db.patch(args.slideshowId, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("slideshows") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const slideshow = await ctx.db.get(args.id);
    if (!slideshow || slideshow.userId !== userId) {
      throw new Error("Slideshow not found");
    }
    await ctx.db.delete(args.id);
  },
});
