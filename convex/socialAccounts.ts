import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  platformValidator,
  publishingProviderValidator,
  socialAccountStatusValidator,
} from "./validators";

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("socialAccounts")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const listByBrand = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.userId !== identity.subject) return [];

    return await ctx.db
      .query("socialAccounts")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
  },
});

export const upsertManual = mutation({
  args: {
    brandId: v.optional(v.id("brands")),
    provider: publishingProviderValidator,
    platform: platformValidator,
    externalAccountId: v.string(),
    username: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    status: v.optional(socialAccountStatusValidator),
    capabilities: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.userId !== identity.subject) {
        throw new Error("Brand not found");
      }
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("socialAccounts")
      .withIndex("by_external_account", (q) =>
        q.eq("provider", args.provider).eq("externalAccountId", args.externalAccountId)
      )
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    const accountFields = {
      brandId: args.brandId,
      provider: args.provider,
      platform: args.platform,
      externalAccountId: args.externalAccountId,
      username: args.username,
      displayName: args.displayName,
      avatarUrl: args.avatarUrl,
      status: args.status ?? "connected",
      capabilities: args.capabilities,
      metadata: args.metadata,
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, accountFields);
      return existing._id;
    }

    return await ctx.db.insert("socialAccounts", {
      userId: identity.subject,
      ...accountFields,
      createdAt: now,
    });
  },
});

export const assignBrand = mutation({
  args: {
    id: v.id("socialAccounts"),
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const account = await ctx.db.get(args.id);
    if (!account || account.userId !== identity.subject) {
      throw new Error("Social account not found");
    }

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.userId !== identity.subject) {
        throw new Error("Brand not found");
      }
    }

    await ctx.db.patch(args.id, {
      brandId: args.brandId,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("socialAccounts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const account = await ctx.db.get(args.id);
    if (!account || account.userId !== identity.subject) {
      throw new Error("Social account not found");
    }

    await ctx.db.delete(args.id);
  },
});
