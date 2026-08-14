import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "../_generated/server";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import {
  fetchSocialProfile,
  resolveSocialDiscoveryTarget,
  type SocialDiscoveryPlatform,
} from "../providers/scrapeCreators/client";
import { requireWorkspaceMember } from "../workspaces/workspaces";

const MISSING_AVATAR_RETRY_MS = 60 * 60 * 1_000;
const PROFILE_IMAGE_REFRESH_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_PROFILE_IMAGE_BYTES = 5 * 1_024 * 1_024;
const MAX_PROFILE_SYNC_BATCH = 20;

const profilePlatformValidator = v.union(
  v.literal("instagram"),
  v.literal("tiktok")
);

type ProfileSyncCandidate = {
  id: Id<"socialAccounts">;
  platform: SocialDiscoveryPlatform;
  username: string;
};

type ProfileSyncSummary = {
  attempted: number;
  failed: number;
  updated: number;
};

function supportsProfileImages(
  platform: Doc<"socialAccounts">["platform"]
): platform is SocialDiscoveryPlatform {
  return platform === "instagram" || platform === "tiktok";
}

function profileNeedsSync(account: Doc<"socialAccounts">, now: number) {
  if (!supportsProfileImages(account.platform)) return false;
  if (!account.profileSyncedAt) return true;
  const elapsed = now - account.profileSyncedAt;
  return account.avatarStorageId
    ? elapsed >= PROFILE_IMAGE_REFRESH_MS
    : elapsed >= MISSING_AVATAR_RETRY_MS;
}

async function downloadProfileImage(sourceUrl: string) {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; ContentEngine/1.0)",
    },
  });
  if (!response.ok) {
    throw new Error(`Profile image download failed with status ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error("Profile image is too large to store");
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") {
    throw new Error("Profile image response was not an image");
  }

  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error(bytes.byteLength ? "Profile image is too large to store" : "Profile image was empty");
  }

  return new Blob([bytes], { type: contentType || "image/jpeg" });
}

export async function withResolvedAccountAvatar(
  ctx: Pick<QueryCtx, "storage">,
  account: Doc<"socialAccounts">
) {
  if (!account.avatarStorageId) return account;
  const storedAvatarUrl = await ctx.storage.getUrl(account.avatarStorageId);
  return storedAvatarUrl
    ? { ...account, avatarUrl: storedAvatarUrl }
    : account;
}

export const listSyncCandidates = internalQuery({
  args: {
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    now: v.number(),
  },
  returns: v.array(v.object({
    id: v.id("socialAccounts"),
    platform: profilePlatformValidator,
    username: v.string(),
  })),
  handler: async (ctx, args): Promise<ProfileSyncCandidate[]> => {
    let accounts;
    if (args.workspaceId) {
      const workspaceId = args.workspaceId;
      await requireWorkspaceMember(ctx, workspaceId, args.userId);
      accounts = await ctx.db
        .query("socialAccounts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .take(200);
    } else {
      accounts = await ctx.db
        .query("socialAccounts")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .take(200);
    }

    return accounts
      .filter((account) => profileNeedsSync(account, args.now))
      .slice(0, MAX_PROFILE_SYNC_BATCH)
      .map((account) => ({
        id: account._id,
        platform: account.platform as SocialDiscoveryPlatform,
        username: account.username,
      }));
  },
});

export const saveSyncResult = internalMutation({
  args: {
    accountId: v.id("socialAccounts"),
    syncedAt: v.number(),
    avatarStorageId: v.optional(v.id("_storage")),
    displayName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      if (args.avatarStorageId) await ctx.storage.delete(args.avatarStorageId);
      return null;
    }

    await ctx.db.patch(account._id, {
      ...(args.avatarStorageId ? { avatarStorageId: args.avatarStorageId } : {}),
      ...(args.displayName && (!account.displayName || account.displayName === account.username)
        ? { displayName: args.displayName }
        : {}),
      profileSyncedAt: args.syncedAt,
      updatedAt: Date.now(),
    });

    if (
      args.avatarStorageId &&
      account.avatarStorageId &&
      account.avatarStorageId !== args.avatarStorageId
    ) {
      await ctx.storage.delete(account.avatarStorageId);
    }
    return null;
  },
});

export const sync = action({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  returns: v.object({
    attempted: v.number(),
    failed: v.number(),
    updated: v.number(),
  }),
  handler: async (ctx, args): Promise<ProfileSyncSummary> => {
    const identity = await requireBetaAccessForAction(ctx);
    const syncedAt = Date.now();
    const candidates: ProfileSyncCandidate[] = await ctx.runQuery(
      internal.accounts.profileImages.listSyncCandidates,
      {
        userId: identity.subject,
        workspaceId: args.workspaceId,
        now: syncedAt,
      }
    );
    let failed = 0;
    let updated = 0;

    for (const candidate of candidates) {
      let newStorageId: Id<"_storage"> | undefined;
      try {
        const target = resolveSocialDiscoveryTarget({
          profile: candidate.username,
          platform: candidate.platform,
        });
        const profile = await fetchSocialProfile(target);
        if (!profile.avatarUrl) {
          failed += 1;
          continue;
        }

        const image = await downloadProfileImage(profile.avatarUrl);
        newStorageId = await ctx.storage.store(image);
        await ctx.runMutation(internal.accounts.profileImages.saveSyncResult, {
          accountId: candidate.id,
          syncedAt,
          avatarStorageId: newStorageId,
          ...(profile.displayName ? { displayName: profile.displayName } : {}),
        });
        newStorageId = undefined;
        updated += 1;
      } catch (error) {
        if (newStorageId) await ctx.storage.delete(newStorageId);
        console.error("Social account profile image sync failed", {
          accountId: candidate.id,
          platform: candidate.platform,
          message: error instanceof Error ? error.message : "Unknown profile image sync error",
        });
        failed += 1;
      }
    }

    return {
      attempted: candidates.length,
      failed,
      updated,
    };
  },
});
