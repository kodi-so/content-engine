import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import { getPublishingProvider } from "../providers";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  platformValidator,
  publishingProviderValidator,
  socialAccountStatusValidator,
} from "../validators";

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    if (!identity) return [];

    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, identity.subject);
      return await ctx.db
        .query("socialAccounts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .collect();
    }

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
    const identity = await requireBetaAccess(ctx);
    if (!identity) return [];

    const brand = await ctx.db.get(args.brandId);
    if (!brand) return [];
    if (brand.workspaceId) {
      await requireWorkspaceMember(ctx, brand.workspaceId, identity.subject);
    } else if (brand.userId !== identity.subject) {
      return [];
    }

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
    workspaceId: v.optional(v.id("workspaces")),
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccessForAction(ctx);

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
      workspaceId: args.workspaceId,
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
    workspaceId: v.optional(v.id("workspaces")),
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
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);

    const brand = args.brandId ? await ctx.db.get(args.brandId) : null;
    if (args.brandId) {
      if (!brand) {
        throw new Error("Brand not found");
      }
      if (brand.workspaceId) {
        await requireWorkspaceMember(ctx, brand.workspaceId, userId);
      } else if (brand.userId !== userId) {
        throw new Error("Brand not found");
      }
    }
    const workspace = args.workspaceId || brand?.workspaceId
      ? await resolveWritableWorkspace(ctx, userId, args.workspaceId ?? brand?.workspaceId)
      : defaultWorkspace;
    if (brand?.workspaceId && brand.workspaceId !== workspace._id) {
      throw new Error("Brand does not belong to this workspace");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("socialAccounts")
      .withIndex("by_external_account", (q) =>
        q.eq("provider", args.provider).eq("externalAccountId", args.externalAccountId)
      )
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();

    const accountFields = {
      workspaceId: workspace._id,
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
      userId,
      ...accountFields,
      createdAt: now,
    });
  },
});

export const upsertSyncedAccounts = internalMutation({
  args: {
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
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
    const brand = args.brandId ? await ctx.db.get(args.brandId) : null;
    if (args.brandId) {
      if (!brand) {
        throw new Error("Brand not found");
      }
      if (brand.workspaceId) {
        await requireWorkspaceMember(ctx, brand.workspaceId, args.userId);
      } else if (brand.userId !== args.userId) {
        throw new Error("Brand not found");
      }
    }
    const workspace = await resolveWritableWorkspace(
      ctx,
      args.userId,
      args.workspaceId ?? brand?.workspaceId
    );

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
        workspaceId: workspace._id,
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
    const identity = await requireBetaAccess(ctx);

    const account = await ctx.db.get(args.id);
    if (!account) {
      throw new Error("Social account not found");
    }
    if (account.workspaceId) {
      await requireWorkspaceMember(ctx, account.workspaceId, identity.subject);
    } else if (account.userId !== identity.subject) {
      throw new Error("Social account not found");
    }

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand) {
        throw new Error("Brand not found");
      }
      if (brand.workspaceId) {
        await requireWorkspaceMember(ctx, brand.workspaceId, identity.subject);
      } else if (brand.userId !== identity.subject) {
        throw new Error("Brand not found");
      }
      if (account.workspaceId && brand.workspaceId && account.workspaceId !== brand.workspaceId) {
        throw new Error("Brand does not belong to this account workspace");
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
    const identity = await requireBetaAccess(ctx);

    const account = await ctx.db.get(args.id);
    if (!account) {
      throw new Error("Social account not found");
    }
    if (account.workspaceId) {
      await requireWorkspaceMember(ctx, account.workspaceId, identity.subject);
    } else if (account.userId !== identity.subject) {
      throw new Error("Social account not found");
    }

    await ctx.db.delete(args.id);
  },
});
