import type { UserIdentity } from "convex/server";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
};

type UserProfilePatch = {
  clerkUserId: string;
  subject: string;
  tokenIdentifier: string;
  issuer: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
};

export async function requireCurrentIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

export async function requireCurrentUserId(ctx: AuthCtx) {
  const identity = await requireCurrentIdentity(ctx);
  return identity.subject;
}

function profileFromIdentity(identity: UserIdentity): UserProfilePatch {
  return {
    clerkUserId: identity.subject,
    subject: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
    issuer: identity.issuer,
    email: identity.email,
    name: identity.name,
    avatarUrl: identity.pictureUrl,
  };
}

async function getUserBySubject(ctx: QueryCtx | MutationCtx, subject: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_subject", (q) => q.eq("subject", subject))
    .unique();
}

export async function ensureCurrentUser(ctx: MutationCtx) {
  const identity = await requireCurrentIdentity(ctx);
  const now = Date.now();
  const profile = profileFromIdentity(identity);
  const existing = await getUserBySubject(ctx, identity.subject);

  if (!existing) {
    const docId = await ctx.db.insert("users", {
      ...profile,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    const user = await ctx.db.get(docId);
    if (!user) throw new Error("Failed to create user");
    return { identity, userId: identity.subject, user };
  }

  const patch: Partial<Doc<"users">> = {
    ...profile,
    updatedAt: now,
    lastSeenAt: now,
  };
  await ctx.db.patch(existing._id, patch);
  const user = await ctx.db.get(existing._id);
  if (!user) throw new Error("Failed to update user");
  return { identity, userId: identity.subject, user };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await getUserBySubject(ctx, identity.subject);
  },
});

export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await ensureCurrentUser(ctx);
    return user;
  },
});
