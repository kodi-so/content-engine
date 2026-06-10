import type { UserIdentity } from "convex/server";
import { v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

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

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() ?? "";
}

function betaAccessEmails() {
  return (process.env.BETA_ACCESS_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

async function isApprovedForBeta(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  identity: UserIdentity
) {
  const email = normalizeEmail(identity.email);
  if (!email) return false;
  if (betaAccessEmails().includes(email)) return true;

  const entry = await ctx.db
    .query("waitlistEntries")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  return entry?.status === "approved";
}

export async function requireCurrentIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

export async function requireCurrentUserId(
  ctx: AuthCtx & { db: QueryCtx["db"] | MutationCtx["db"] }
) {
  const identity = await requireBetaAccess(ctx);
  return identity.subject;
}

export async function requireBetaAccess(ctx: AuthCtx & { db: QueryCtx["db"] | MutationCtx["db"] }) {
  const identity = await requireCurrentIdentity(ctx);
  if (!(await isApprovedForBeta(ctx, identity))) {
    throw new Error("Content Engine is in private beta");
  }
  return identity;
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

async function getActiveWorkspaceMembership(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  userId: string
) {
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId)
    )
    .unique();

  return membership?.status === "active" ? membership : null;
}

function isLegacyDefaultWorkspaceName(name: string, identity: UserIdentity) {
  const trimmedName = identity.name?.trim();
  return (
    name === "Personal workspace" ||
    (trimmedName ? name === `${trimmedName}'s workspace` : false)
  );
}

async function ensureDefaultWorkspace(ctx: MutationCtx, identity: UserIdentity) {
  const userId = identity.subject;
  const now = Date.now();

  const memberships = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .collect();
  const existingWorkspaces = await Promise.all(
    memberships.map((membership) => ctx.db.get(membership.workspaceId))
  );
  const existingWorkspace =
    existingWorkspaces
      .filter((workspace): workspace is Doc<"workspaces"> => Boolean(workspace))
      .sort((first, second) => first.createdAt - second.createdAt)[0] ?? null;

  if (existingWorkspace) {
    const membership = await getActiveWorkspaceMembership(
      ctx,
      existingWorkspace._id,
      userId
    );
    if (!membership) {
      await ctx.db.insert("workspaceMembers", {
        workspaceId: existingWorkspace._id,
        userId,
        role: "owner",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
    if (isLegacyDefaultWorkspaceName(existingWorkspace.name, identity)) {
      await ctx.db.patch(existingWorkspace._id, {
        name: "Personal",
        updatedAt: now,
      });
      return { ...existingWorkspace, name: "Personal", updatedAt: now };
    }
    return existingWorkspace;
  }

  const workspaceId = await ctx.db.insert("workspaces", {
    name: "Personal",
    ownerUserId: userId,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("workspaceMembers", {
    workspaceId,
    userId,
    role: "owner",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Failed to create default workspace");
  return workspace;
}

export async function ensureCurrentUser(ctx: MutationCtx) {
  const identity = await requireCurrentIdentity(ctx);
  if (!(await isApprovedForBeta(ctx, identity))) {
    throw new Error("Content Engine is in private beta");
  }
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
    const defaultWorkspace = await ensureDefaultWorkspace(ctx, identity);
    return { identity, userId: identity.subject, user, defaultWorkspace };
  }

  const patch: Partial<Doc<"users">> = {
    ...profile,
    updatedAt: now,
    lastSeenAt: now,
  };
  await ctx.db.patch(existing._id, patch);
  const user = await ctx.db.get(existing._id);
  if (!user) throw new Error("Failed to update user");
  const defaultWorkspace = await ensureDefaultWorkspace(ctx, identity);
  return { identity, userId: identity.subject, user, defaultWorkspace };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    if (!(await isApprovedForBeta(ctx, identity))) {
      return {
        accessStatus: "pending" as const,
        user: null,
        memberships: [],
        workspaces: [],
      };
    }
    const user = await getUserBySubject(ctx, identity.subject);
    if (!user) return null;

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", identity.subject).eq("status", "active")
      )
      .collect();
    const workspaces = await Promise.all(
      memberships.map((membership) => ctx.db.get(membership.workspaceId))
    );

    return {
      accessStatus: "approved" as const,
      user,
      memberships,
      workspaces: workspaces.filter(
        (workspace): workspace is Doc<"workspaces"> => Boolean(workspace)
      ),
    };
  },
});

export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const { defaultWorkspace, user } = await ensureCurrentUser(ctx);
    return { user, defaultWorkspace };
  },
});

export const hasBetaAccessForEmail = internalQuery({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!email) return false;
    if (betaAccessEmails().includes(email)) return true;

    const entry = await ctx.db
      .query("waitlistEntries")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    return entry?.status === "approved";
  },
});
