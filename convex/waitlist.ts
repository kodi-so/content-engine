import { v } from "convex/values";
import { mutation } from "./_generated/server";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const requestAccess = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    intendedUse: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!email) throw new Error("Email is required");

    const now = Date.now();
    const existing = await ctx.db
      .query("waitlistEntries")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    const patch = {
      name: args.name?.trim() || undefined,
      intendedUse: args.intendedUse?.trim() || undefined,
      source: args.source?.trim() || "landing",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { status: existing.status };
    }

    await ctx.db.insert("waitlistEntries", {
      email,
      ...patch,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return { status: "pending" };
  },
});

export const approveByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = normalizeEmail(args.email);
    if (!email) throw new Error("Email is required");

    const now = Date.now();
    const existing = await ctx.db
      .query("waitlistEntries")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "approved",
        approvedAt: now,
        approvedByUserId: identity?.subject,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("waitlistEntries", {
      email,
      status: "approved",
      source: "manual",
      createdAt: now,
      updatedAt: now,
      approvedAt: now,
      approvedByUserId: identity?.subject,
    });
  },
});
