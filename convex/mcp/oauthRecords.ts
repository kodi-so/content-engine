import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { requireWorkspaceMember } from "../workspaces/workspaces";

export const registerClient = internalMutation({
  args: {
    clientId: v.string(),
    clientName: v.optional(v.string()),
    redirectUris: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("mcpOauthClients", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return args.clientId;
  },
});

export const getClient = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, args) => await ctx.db
    .query("mcpOauthClients")
    .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
    .unique(),
});

export const createAuthorizationRequest = internalMutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    state: v.optional(v.string()),
    scopes: v.array(v.string()),
    codeChallenge: v.string(),
    resource: v.string(),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (!client || !client.redirectUris.includes(args.redirectUri)) {
      throw new Error("Unknown OAuth client or redirect URI");
    }
    const now = Date.now();
    return await ctx.db.insert("mcpOauthAuthorizationRequests", {
      ...args,
      status: "pending",
      expiresAt: now + 10 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const approveAuthorizationRequest = internalMutation({
  args: {
    requestId: v.id("mcpOauthAuthorizationRequests"),
    userId: v.string(),
    workspaceId: v.id("workspaces"),
    codeHash: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "pending" || request.expiresAt <= Date.now()) {
      throw new Error("OAuth authorization request has expired");
    }
    await requireWorkspaceMember(ctx, args.workspaceId, args.userId);
    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "approved",
      userId: args.userId,
      workspaceId: args.workspaceId,
      updatedAt: now,
    });
    await ctx.db.insert("mcpOauthAuthorizationCodes", {
      codeHash: args.codeHash,
      userId: args.userId,
      workspaceId: args.workspaceId,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      scopes: request.scopes,
      codeChallenge: request.codeChallenge,
      resource: request.resource,
      expiresAt: now + 5 * 60 * 1000,
      createdAt: now,
    });
    return {
      redirectUri: request.redirectUri,
      state: request.state,
    };
  },
});

export const denyAuthorizationRequest = internalMutation({
  args: {
    requestId: v.id("mcpOauthAuthorizationRequests"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "pending" || request.expiresAt <= Date.now()) {
      throw new Error("OAuth authorization request has expired");
    }
    await ctx.db.patch(request._id, {
      status: "denied",
      userId: args.userId,
      updatedAt: Date.now(),
    });
    return { redirectUri: request.redirectUri, state: request.state };
  },
});

export const exchangeAuthorizationCode = internalMutation({
  args: {
    codeHash: v.string(),
    codeChallenge: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    resource: v.string(),
    accessTokenHash: v.string(),
    refreshTokenHash: v.string(),
    accessExpiresAt: v.number(),
    refreshExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const code = await ctx.db
      .query("mcpOauthAuthorizationCodes")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    const now = Date.now();
    if (!code || code.consumedAt || code.expiresAt <= now) {
      throw new Error("Invalid or expired authorization code");
    }
    if (
      code.clientId !== args.clientId ||
      code.redirectUri !== args.redirectUri ||
      code.resource !== args.resource ||
      code.codeChallenge !== args.codeChallenge
    ) {
      throw new Error("Authorization code verification failed");
    }
    await ctx.db.patch(code._id, { consumedAt: now });
    await ctx.db.insert("mcpOauthTokens", {
      accessTokenHash: args.accessTokenHash,
      refreshTokenHash: args.refreshTokenHash,
      userId: code.userId,
      workspaceId: code.workspaceId,
      clientId: code.clientId,
      scopes: code.scopes,
      resource: code.resource,
      expiresAt: args.accessExpiresAt,
      refreshExpiresAt: args.refreshExpiresAt,
      createdAt: now,
      updatedAt: now,
    });
    return { scopes: code.scopes };
  },
});

export const rotateRefreshToken = internalMutation({
  args: {
    refreshTokenHash: v.string(),
    clientId: v.string(),
    resource: v.string(),
    accessTokenHash: v.string(),
    nextRefreshTokenHash: v.string(),
    accessExpiresAt: v.number(),
    refreshExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("mcpOauthTokens")
      .withIndex("by_refresh_token_hash", (q) => q.eq("refreshTokenHash", args.refreshTokenHash))
      .unique();
    const now = Date.now();
    if (
      !token ||
      token.revokedAt ||
      token.refreshExpiresAt <= now ||
      token.clientId !== args.clientId ||
      token.resource !== args.resource
    ) {
      throw new Error("Invalid or expired refresh token");
    }
    await ctx.db.patch(token._id, { revokedAt: now, updatedAt: now });
    await ctx.db.insert("mcpOauthTokens", {
      accessTokenHash: args.accessTokenHash,
      refreshTokenHash: args.nextRefreshTokenHash,
      userId: token.userId,
      workspaceId: token.workspaceId,
      clientId: token.clientId,
      scopes: token.scopes,
      resource: token.resource,
      expiresAt: args.accessExpiresAt,
      refreshExpiresAt: args.refreshExpiresAt,
      createdAt: now,
      updatedAt: now,
    });
    return { scopes: token.scopes };
  },
});

export const resolveAccessToken = internalQuery({
  args: { accessTokenHash: v.string(), resource: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("mcpOauthTokens")
      .withIndex("by_access_token_hash", (q) => q.eq("accessTokenHash", args.accessTokenHash))
      .unique();
    if (!token || token.revokedAt || token.expiresAt <= Date.now() || token.resource !== args.resource) {
      return null;
    }
    return {
      tokenId: token._id,
      userId: token.userId,
      workspaceId: token.workspaceId,
      scopes: token.scopes,
    };
  },
});

export const recordTokenUse = internalMutation({
  args: { tokenId: v.id("mcpOauthTokens") },
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token || token.revokedAt) return;
    await ctx.db.patch(token._id, { lastUsedAt: Date.now(), updatedAt: Date.now() });
  },
});
