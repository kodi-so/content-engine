import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import { isProviderError } from "../providers/errors";
import { getPublishingProvider } from "../providers";
import type { PublishingAccount } from "../providers/publishing";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  platformValidator,
  publishingProviderValidator,
  socialAccountStatusValidator,
} from "../validators";

type UpsertSyncedAccountsResult = {
  disconnected: number;
  inserted: number;
  linked: number;
  updated: number;
};

type SyncProviderAccountsResult = {
  inserted: number;
  linked: number;
  provider: "postiz" | "post_bridge" | "manual";
  skipped: number;
  synced: number;
  syncedAt: number;
  updated: number;
};

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

function normalizePlatform(platform: string):
  | "tiktok"
  | "instagram"
  | "youtube"
  | "x"
  | "linkedin"
  | "facebook"
  | "threads"
  | "pinterest"
  | "bluesky"
  | "google_business"
  | null {
  if (platform === "instagram-standalone") return "instagram";
  if (platform === "linkedin-page") return "linkedin";
  if (platform === "twitter") return "x";
  if (
    platform === "tiktok" ||
    platform === "instagram" ||
    platform === "youtube" ||
    platform === "x" ||
    platform === "linkedin" ||
    platform === "facebook" ||
    platform === "threads" ||
    platform === "pinterest" ||
    platform === "bluesky" ||
    platform === "google_business"
  ) {
    return platform;
  }

  return null;
}

function normalizedAccountHandle(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeAccountMetadata(existing: unknown, synced: unknown) {
  if (!isRecord(existing)) return synced;
  if (!isRecord(synced)) return existing;

  return {
    ...existing,
    ...synced,
    credentials: isRecord(existing.credentials) ? existing.credentials : synced.credentials,
  };
}

function logProviderSyncError(provider: string, error: unknown) {
  if (isProviderError(error)) {
    console.error("Social account provider sync failed", {
      provider,
      operation: error.operation,
      code: error.code,
      statusCode: error.statusCode,
      retryable: error.retryable,
      message: error.message,
      details: error.details,
    });
    return;
  }

  console.error("Social account provider sync failed", {
    provider,
    message: error instanceof Error ? error.message : "Unknown sync error",
  });
}

function providerSyncFailureMessage(provider: string, error: unknown): string {
  if (provider === "post_bridge" && isProviderError(error)) {
    if (error.code === "configuration") {
      return "PostBridge sync is not configured yet. Add POSTBRIDGE_API_KEY to your Convex environment, then try again.";
    }

    if (error.code === "authentication") {
      return "PostBridge rejected the configured credentials for account sync. The API returned authentication failed, which can mean the token is invalid, expired, or missing a required user identifier.";
    }

    if (error.code === "authorization") {
      return "PostBridge rejected this API key for account sync. Check that the key has access to this PostBridge user or workspace.";
    }
  }

  if (isProviderError(error) && error.retryable) {
    return "The publishing provider is temporarily unavailable. Wait a moment, then try syncing again.";
  }

  return "Account sync failed. Check the Convex logs for provider details, then try again.";
}

export const syncProviderAccounts = action({
  args: {
    provider: publishingProviderValidator,
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<SyncProviderAccountsResult> => {
    const identity = await requireBetaAccessForAction(ctx);

    const provider = getPublishingProvider(args.provider);
    const syncedAccounts: PublishingAccount[] = [];
    let cursor: string | undefined;
    let syncedAt = Date.now();
    try {
      do {
        const syncedPage = await provider.listAccounts({ cursor });
        syncedAccounts.push(...syncedPage.accounts);
        syncedAt = syncedPage.syncedAt;
        cursor = syncedPage.nextCursor;
      } while (cursor);
    } catch (error) {
      logProviderSyncError(args.provider, error);
      throw new Error(providerSyncFailureMessage(args.provider, error));
    }

    const accounts = syncedAccounts
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

    const syncResult = await ctx.runMutation(
      internal.accounts.socialAccounts.upsertSyncedAccounts,
      {
        userId: identity.subject,
        workspaceId: args.workspaceId,
        provider: args.provider,
        accounts,
        syncedAt,
      }
    ) as UpsertSyncedAccountsResult;

    return {
      synced: accounts.length,
      linked: syncResult.linked,
      inserted: syncResult.inserted,
      updated: syncResult.updated,
      skipped: syncedAccounts.length - accounts.length,
      provider: args.provider,
      syncedAt,
    };
  },
});

export const upsertManual = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
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

    const workspace = args.workspaceId
      ? await resolveWritableWorkspace(ctx, userId, args.workspaceId)
      : defaultWorkspace;

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

export const updateCredentials = mutation({
  args: {
    id: v.id("socialAccounts"),
    email: v.string(),
    password: v.string(),
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

    const metadata = isRecord(account.metadata) ? account.metadata : {};
    const existingCredentials = isRecord(metadata.credentials)
      ? metadata.credentials
      : {};

    await ctx.db.patch(args.id, {
      metadata: {
        ...metadata,
        credentials: {
          ...existingCredentials,
          email: args.email.trim(),
          password: args.password,
        },
      },
      updatedAt: Date.now(),
    });
  },
});

export const upsertSyncedAccounts = internalMutation({
  args: {
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
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
    const workspace = await resolveWritableWorkspace(
      ctx,
      args.userId,
      args.workspaceId
    );

    const allUserAccounts = await ctx.db
      .query("socialAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const workspaceAccounts = allUserAccounts.filter(
      (account) => account.workspaceId === workspace._id
    );
    const existingAccounts = workspaceAccounts.filter(
      (account) => account.provider === args.provider
    );
    const unlinkedAccounts = workspaceAccounts.filter(
      (account) => account.provider === "manual"
    );
    const existingByExternalId = new Map(
      existingAccounts.map((account) => [account.externalAccountId, account])
    );
    const unlinkedByPlatformAndUsername = new Map(
      unlinkedAccounts.map((account) => [
        `${account.platform}:${normalizedAccountHandle(account.username)}`,
        account,
      ])
    );
    const syncedExternalIds = new Set(args.accounts.map((account) => account.externalAccountId));
    const linkedUnlinkedIds = new Set<string>();
    let inserted = 0;
    let linked = 0;
    let updated = 0;
    let disconnected = 0;

    for (const account of args.accounts) {
      const existing = existingByExternalId.get(account.externalAccountId);
      const matchingUnlinked = unlinkedByPlatformAndUsername.get(
        `${account.platform}:${normalizedAccountHandle(account.username)}`
      );
      const fields = {
        workspaceId: workspace._id,
        provider: args.provider,
        platform: account.platform,
        externalAccountId: account.externalAccountId,
        username: account.username,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        status: account.status,
        capabilities: account.capabilities,
        metadata: mergeAccountMetadata(matchingUnlinked?.metadata, account.metadata),
        lastSyncedAt: args.syncedAt,
        updatedAt: Date.now(),
      };

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...fields,
          metadata: mergeAccountMetadata(existing.metadata, account.metadata),
        });
        updated += 1;
      } else if (matchingUnlinked && !linkedUnlinkedIds.has(String(matchingUnlinked._id))) {
        linkedUnlinkedIds.add(String(matchingUnlinked._id));
        await ctx.db.patch(matchingUnlinked._id, fields);
        linked += 1;
      } else {
        await ctx.db.insert("socialAccounts", {
          userId: args.userId,
          ...fields,
          createdAt: Date.now(),
        });
        inserted += 1;
      }
    }

    for (const existing of existingAccounts) {
      if (syncedExternalIds.has(existing.externalAccountId)) continue;
      await ctx.db.patch(existing._id, {
        status: "disconnected",
        lastSyncedAt: args.syncedAt,
        updatedAt: Date.now(),
      });
      disconnected += 1;
    }

    return {
      disconnected,
      inserted,
      linked,
      updated,
    };
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
