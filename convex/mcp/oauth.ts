import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { action, mutation, query } from "../_generated/server";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { requireBetaAccess } from "../auth/users";
import { randomToken, sha256Hex } from "./oauthCrypto";
import { MCP_SCOPES, type McpScope } from "./scopes";

const approveRequest = makeFunctionReference<
  "mutation",
  {
    requestId: Id<"mcpOauthAuthorizationRequests">;
    userId: string;
    workspaceId: Id<"workspaces">;
    codeHash: string;
  },
  { redirectUri: string; state?: string }
>("mcp/oauthRecords:approveAuthorizationRequest");

const denyRequest = makeFunctionReference<
  "mutation",
  { requestId: Id<"mcpOauthAuthorizationRequests">; userId: string },
  { redirectUri: string; state?: string }
>("mcp/oauthRecords:denyAuthorizationRequest");

function redirectWithParams(
  redirectUri: string,
  params: Record<string, string | undefined>
) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

export const authorizationRequest = query({
  args: { requestId: v.id("mcpOauthAuthorizationRequests") },
  handler: async (ctx, args) => {
    await requireBetaAccess(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "pending" || request.expiresAt <= Date.now()) {
      return null;
    }
    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", request.clientId))
      .unique();
    return {
      id: request._id,
      clientName: client?.clientName || "External agent",
      scopes: request.scopes.map((scope) => ({
        id: scope,
        description: MCP_SCOPES[scope as McpScope] ?? scope,
      })),
      expiresAt: request.expiresAt,
    };
  },
});

export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireBetaAccess(ctx);
    const tokens = await ctx.db
      .query("mcpOauthTokens")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
    const now = Date.now();
    const activeTokens = tokens.filter((token) => !token.revokedAt && token.refreshExpiresAt > now);
    return await Promise.all(activeTokens.map(async (token) => {
      const client = await ctx.db
        .query("mcpOauthClients")
        .withIndex("by_client_id", (q) => q.eq("clientId", token.clientId))
        .unique();
      return {
        id: token._id,
        clientName: client?.clientName || "External agent",
        workspaceId: token.workspaceId,
        scopes: token.scopes,
        lastUsedAt: token.lastUsedAt,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        refreshExpiresAt: token.refreshExpiresAt,
      };
    }));
  },
});

export const revokeConnection = mutation({
  args: { id: v.id("mcpOauthTokens") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const token = await ctx.db.get(args.id);
    if (!token || token.userId !== identity.subject) throw new Error("OAuth connection not found");
    await ctx.db.patch(token._id, { revokedAt: Date.now(), updatedAt: Date.now() });
  },
});

export const respondToAuthorization = action({
  args: {
    requestId: v.id("mcpOauthAuthorizationRequests"),
    approved: v.boolean(),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccessForAction(ctx);
    if (!identity) throw new Error("Not authenticated");

    if (!args.approved) {
      const denied = await ctx.runMutation(denyRequest, {
        requestId: args.requestId,
        userId: identity.subject,
      });
      return {
        redirectUrl: redirectWithParams(denied.redirectUri, {
          error: "access_denied",
          state: denied.state,
        }),
      };
    }
    if (!args.workspaceId) throw new Error("Choose a workspace to authorize");

    const code = randomToken("ce_code_");
    const approved = await ctx.runMutation(approveRequest, {
      requestId: args.requestId,
      userId: identity.subject,
      workspaceId: args.workspaceId,
      codeHash: await sha256Hex(code),
    });
    return {
      redirectUrl: redirectWithParams(approved.redirectUri, {
        code,
        state: approved.state,
      }),
    };
  },
});
