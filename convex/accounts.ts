import { v } from "convex/values";
import { mutation, query, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Platform type for type safety
const platformValidator = v.union(
  v.literal("tiktok"),
  v.literal("instagram"),
  v.literal("twitter")
);

// Get all accounts for current user (excludes tokens for security)
export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();

    // Remove sensitive token data
    return accounts.map(({ accessToken, refreshToken, ...safeAccount }) => safeAccount);
  },
});

// Get accounts by platform for current user
export const listByPlatform = query({
  args: { platform: platformValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    return await ctx.db
      .query("accounts")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", identity.subject).eq("platform", args.platform)
      )
      .collect();
  },
});

// Get a single account by ID
export const get = query({
  args: { id: v.id("accounts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const account = await ctx.db.get(args.id);
    if (!account || account.userId !== identity.subject) {
      return null;
    }
    // Don't expose tokens to the client
    const { accessToken, refreshToken, ...safeAccount } = account;
    return safeAccount;
  },
});

// Remove/disconnect an account
export const remove = mutation({
  args: { id: v.id("accounts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const account = await ctx.db.get(args.id);
    if (!account || account.userId !== identity.subject) {
      throw new Error("Account not found");
    }

    await ctx.db.delete(args.id);
  },
});

// ============ OAuth Flow Functions ============

// Generate OAuth state and store it
export const createOAuthState = mutation({
  args: {
    platform: platformValidator,
    redirectUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Generate random state
    const state = crypto.randomUUID();
    const now = Date.now();

    // Store state (expires in 10 minutes)
    await ctx.db.insert("oauthStates", {
      state,
      userId: identity.subject,
      platform: args.platform,
      redirectUrl: args.redirectUrl,
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000,
    });

    return state;
  },
});

// Validate OAuth state and return user info (internal - called from HTTP action)
export const validateOAuthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const oauthState = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!oauthState) {
      return null;
    }

    // Check if expired
    if (oauthState.expiresAt < Date.now()) {
      await ctx.db.delete(oauthState._id);
      return null;
    }

    // Delete the state (one-time use)
    await ctx.db.delete(oauthState._id);

    return {
      userId: oauthState.userId,
      platform: oauthState.platform,
      redirectUrl: oauthState.redirectUrl,
    };
  },
});

// Store account after successful OAuth (internal - called from HTTP action)
export const storeAccount = internalMutation({
  args: {
    userId: v.string(),
    platform: platformValidator,
    username: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    platformUserId: v.string(),
    scopes: v.optional(v.array(v.string())),
    // Account-level stats (from user.info.stats scope)
    followerCount: v.optional(v.number()),
    followingCount: v.optional(v.number()),
    likesCount: v.optional(v.number()),
    videoCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if account already exists for this user and platform user
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .filter((q) => q.eq(q.field("platformUserId"), args.platformUserId))
      .first();

    if (existing) {
      // Update existing account
      await ctx.db.patch(existing._id, {
        username: args.username,
        displayName: args.displayName,
        avatarUrl: args.avatarUrl,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken ?? existing.refreshToken,
        tokenExpiresAt: args.tokenExpiresAt,
        scopes: args.scopes,
        followerCount: args.followerCount,
        followingCount: args.followingCount,
        likesCount: args.likesCount,
        videoCount: args.videoCount,
        statsLastUpdated: now,
        isActive: true,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new account
    return await ctx.db.insert("accounts", {
      userId: args.userId,
      platform: args.platform,
      username: args.username,
      displayName: args.displayName,
      avatarUrl: args.avatarUrl,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: args.tokenExpiresAt,
      platformUserId: args.platformUserId,
      scopes: args.scopes,
      followerCount: args.followerCount,
      followingCount: args.followingCount,
      likesCount: args.likesCount,
      videoCount: args.videoCount,
      statsLastUpdated: now,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Get account with tokens (internal only - for posting/API calls)
export const getWithTokens = internalMutation({
  args: { id: v.id("accounts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Update tokens after refresh (internal)
export const updateTokens = internalMutation({
  args: {
    id: v.id("accounts"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: args.tokenExpiresAt,
      updatedAt: Date.now(),
    });
  },
});

// Refresh TikTok access token using refresh token
export const refreshTikTokToken = internalAction({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Get the account with tokens
    const account = await ctx.runMutation(internal.accounts.getWithTokens, {
      id: args.accountId,
    });

    if (!account) {
      return { success: false, error: "Account not found" };
    }

    if (!account.refreshToken) {
      return { success: false, error: "No refresh token available" };
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

    if (!clientKey || !clientSecret) {
      return { success: false, error: "TikTok credentials not configured" };
    }

    try {
      const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: account.refreshToken,
        }),
      });

      const data = await response.json();

      if (data.error || !data.access_token) {
        console.error("TikTok token refresh error:", data);
        return {
          success: false,
          error: data.error_description || "Failed to refresh token",
        };
      }

      // Update the tokens in the database
      await ctx.runMutation(internal.accounts.updateTokens, {
        id: args.accountId,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || account.refreshToken,
        tokenExpiresAt: data.expires_in
          ? Date.now() + data.expires_in * 1000
          : undefined,
      });

      return { success: true };
    } catch (err) {
      console.error("Token refresh error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

// Get a valid access token, refreshing if needed (internal action)
export const getValidAccessToken = internalAction({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args): Promise<{ token: string | null; error?: string }> => {
    const account = await ctx.runMutation(internal.accounts.getWithTokens, {
      id: args.accountId,
    });

    if (!account || !account.accessToken) {
      return { token: null, error: "Account not found or no access token" };
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const isExpired = account.tokenExpiresAt
      ? account.tokenExpiresAt < Date.now() + bufferTime
      : false;

    if (isExpired && account.refreshToken) {
      // Try to refresh the token
      const refreshResult = await ctx.runAction(internal.accounts.refreshTikTokToken, {
        accountId: args.accountId,
      });

      if (!refreshResult.success) {
        return { token: null, error: refreshResult.error };
      }

      // Get the updated account
      const updatedAccount = await ctx.runMutation(internal.accounts.getWithTokens, {
        id: args.accountId,
      });

      return { token: updatedAccount?.accessToken || null };
    }

    return { token: account.accessToken };
  },
});

// Update account stats (internal mutation)
export const updateAccountStats = internalMutation({
  args: {
    accountId: v.id("accounts"),
    followerCount: v.optional(v.number()),
    followingCount: v.optional(v.number()),
    likesCount: v.optional(v.number()),
    videoCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.accountId, {
      followerCount: args.followerCount,
      followingCount: args.followingCount,
      likesCount: args.likesCount,
      videoCount: args.videoCount,
      statsLastUpdated: now,
      updatedAt: now,
    });
  },
});

// Refresh account stats from TikTok API (internal action)
export const refreshAccountStats = internalAction({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Get valid access token
    const tokenResult = await ctx.runAction(internal.accounts.getValidAccessToken, {
      accountId: args.accountId,
    });

    if (!tokenResult.token) {
      return { success: false, error: tokenResult.error || "No valid token" };
    }

    try {
      // Fetch user stats from TikTok
      const response = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=follower_count,following_count,likes_count,video_count",
        {
          headers: {
            Authorization: `Bearer ${tokenResult.token}`,
          },
        }
      );

      const data = await response.json();

      if (data.error?.code !== "ok" && data.error) {
        console.error("TikTok user stats error:", data);
        return { success: false, error: "Failed to fetch user stats" };
      }

      const userInfo = data.data?.user || {};

      // Update account with new stats
      await ctx.runMutation(internal.accounts.updateAccountStats, {
        accountId: args.accountId,
        followerCount: userInfo.follower_count,
        followingCount: userInfo.following_count,
        likesCount: userInfo.likes_count,
        videoCount: userInfo.video_count,
      });

      return { success: true };
    } catch (err) {
      console.error("Error refreshing account stats:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});
