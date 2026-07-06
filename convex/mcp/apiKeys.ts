import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { action, mutation, query } from "../_generated/server";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { requireBetaAccess } from "../auth/users";

const KEY_PREFIX = "ce_mcp_";
const DEFAULT_SCOPES = [
  "resources:read",
  "artifacts:read",
  "publishing:plan",
];

const insertApiKey = makeFunctionReference<
  "mutation",
  {
    userId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string[];
  },
  Id<"mcpApiKeys">
>("mcp/apiKeyRecords:insert");

function requireUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function publicKeyRecord(key: {
  _id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  revokedAt?: number;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    id: key._id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    revokedAt: key.revokedAt,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

export const list = query({
  handler: async (ctx) => {
    const userId = requireUserId(await requireBetaAccess(ctx));
    const keys = await ctx.db
      .query("mcpApiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return keys.map(publicKeyRecord);
  },
});

export const create = action({
  args: {
    name: v.string(),
    scopes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await requireBetaAccessForAction(ctx));
    const name = args.name.trim();
    if (!name) throw new Error("API key name is required");

    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const plaintextKey = `${KEY_PREFIX}${base64Url(randomBytes)}`;
    const keyHash = await sha256Hex(plaintextKey);
    const keyPrefix = `${plaintextKey.slice(0, 14)}...`;
    const scopes = args.scopes?.length ? args.scopes : DEFAULT_SCOPES;

    const id: Id<"mcpApiKeys"> = await ctx.runMutation(insertApiKey, {
      userId,
      name,
      keyPrefix,
      keyHash,
      scopes,
    });

    return {
      id,
      key: plaintextKey,
      keyPrefix,
      scopes,
    };
  },
});

export const revoke = mutation({
  args: { id: v.id("mcpApiKeys") },
  handler: async (ctx, args) => {
    const userId = requireUserId(await requireBetaAccess(ctx));
    const key = await ctx.db.get(args.id);
    if (!key || key.userId !== userId) throw new Error("MCP API key not found");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      revokedAt: now,
      updatedAt: now,
    });
  },
});
