import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { getPublishingProvider } from "../providers";
import {
  platformValidator,
  publishingProviderValidator,
  socialAccountStatusValidator,
} from "../validators";

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

function normalizePlatform(platform: string):
  | "tiktok"
  | "instagram"
  | "youtube"
  | "x"
  | "linkedin"
  | "facebook"
  | "threads"
  | "pinterest"
  | null {
  if (platform === "instagram-standalone") return "instagram";
  if (platform === "linkedin-page") return "linkedin";
  if (
    platform === "tiktok" ||
    platform === "instagram" ||
    platform === "youtube" ||
    platform === "x" ||
    platform === "linkedin" ||
    platform === "facebook" ||
    platform === "threads" ||
    platform === "pinterest"
  ) {
    return platform;
  }

  return null;
}

export const syncProviderAccounts = action({
  args: {
    provider: publishingProviderValidator,
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const provider = getPublishingProvider(args.provider);
    const synced = await provider.listAccounts({});
    const accounts = synced.accounts
      .map((account) => {
        const platform = normalizePlatform(account.platform);
        if (!platform) return null;

        return {
          externalAccountId: account.externalAccountId,
          platform,
          username: account.username,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
          status: account.status,
          capabilities: account.capabilities,
          metadata: account.metadata,
        };
      })
      .filter((account): account is NonNullable<typeof account> => account !== null);

    await ctx.runMutation(internal.accounts.socialAccounts.upsertSyncedAccounts, {
      userId: identity.subject,
      brandId: args.brandId,
      provider: args.provider,
      accounts,
      syncedAt: synced.syncedAt,
    });

    return {
      synced: accounts.length,
      skipped: synced.accounts.length - accounts.length,
      provider: args.provider,
      syncedAt: synced.syncedAt,
    };
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

export const upsertSyncedAccounts = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    provider: publishingProviderValidator,
    syncedAt: v.number(),
    accounts: v.array(
      v.object({
        externalAccountId: v.string(),
        platform: platformValidator,
        username: v.string(),
        displayName: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        status: socialAccountStatusValidator,
        capabilities: v.optional(v.array(v.string())),
        metadata: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.userId !== args.userId) {
        throw new Error("Brand not found");
      }
    }

    const existingAccounts = await ctx.db
      .query("socialAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .collect();
    const existingByExternalId = new Map(
      existingAccounts.map((account) => [account.externalAccountId, account])
    );
    const syncedExternalIds = new Set(args.accounts.map((account) => account.externalAccountId));

    for (const account of args.accounts) {
      const existing = existingByExternalId.get(account.externalAccountId);
      const fields = {
        brandId: args.brandId ?? existing?.brandId,
        provider: args.provider,
        platform: account.platform,
        externalAccountId: account.externalAccountId,
        username: account.username,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        status: account.status,
        capabilities: account.capabilities,
        metadata: account.metadata,
        lastSyncedAt: args.syncedAt,
        updatedAt: Date.now(),
      };

      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("socialAccounts", {
          userId: args.userId,
          ...fields,
          createdAt: Date.now(),
        });
      }
    }

    for (const existing of existingAccounts) {
      if (syncedExternalIds.has(existing.externalAccountId)) continue;
      await ctx.db.patch(existing._id, {
        status: "disconnected",
        lastSyncedAt: args.syncedAt,
        updatedAt: Date.now(),
      });
    }
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
