import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureCurrentUser, requireCurrentUserId } from "../auth/users";

const workspaceRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer")
);

const assignableWorkspaceRoleValidator = v.union(
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer")
);

type WorkspaceRole = Doc<"workspaceMembers">["role"];

const managerRoles = new Set<WorkspaceRole>(["owner", "admin"]);

export async function getActiveMembership(
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

export async function requireWorkspaceMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  userId: string,
  allowedRoles?: Set<WorkspaceRole>
) {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Workspace not found");

  const membership = await getActiveMembership(ctx, workspaceId, userId);
  if (!membership) throw new Error("Workspace not found");
  if (allowedRoles && !allowedRoles.has(membership.role)) {
    throw new Error("Not authorized for this workspace");
  }

  return { workspace, membership };
}

export async function defaultWorkspaceForUser(ctx: QueryCtx | MutationCtx, userId: string) {
  const memberships = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .collect();
  const workspaces = await Promise.all(
    memberships.map((membership) => ctx.db.get(membership.workspaceId))
  );

  return workspaces
    .filter((workspace): workspace is Doc<"workspaces"> => Boolean(workspace))
    .sort((first, second) => first.createdAt - second.createdAt)[0] ?? null;
}

export async function resolveWritableWorkspace(
  ctx: MutationCtx,
  userId: string,
  workspaceId?: Id<"workspaces">
) {
  if (workspaceId) {
    const { workspace } = await requireWorkspaceMember(ctx, workspaceId, userId);
    return workspace;
  }

  const workspace = await defaultWorkspaceForUser(ctx, userId);
  if (!workspace) throw new Error("Workspace not found");
  return workspace;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();
    const workspaces = await Promise.all(
      memberships.map(async (membership) => ({
        membership,
        workspace: await ctx.db.get(membership.workspaceId),
      }))
    );

    return workspaces
      .filter(
        (item): item is { membership: Doc<"workspaceMembers">; workspace: Doc<"workspaces"> } =>
          Boolean(item.workspace)
      )
      .sort((first, second) => {
        return second.workspace.updatedAt - first.workspace.updatedAt;
      });
  },
});

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    clerkOrganizationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Workspace name is required");

    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      ownerUserId: userId,
      createdByUserId: userId,
      clerkOrganizationId: args.clerkOrganizationId?.trim() || undefined,
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

    return workspaceId;
  },
});

export const update = mutation({
  args: {
    id: v.id("workspaces"),
    name: v.optional(v.string()),
    clerkOrganizationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const { workspace } = await requireWorkspaceMember(ctx, args.id, userId, managerRoles);
    const patch: Partial<Doc<"workspaces">> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Workspace name is required");
      patch.name = name;
    }
    if (args.clerkOrganizationId !== undefined) {
      patch.clerkOrganizationId = args.clerkOrganizationId.trim() || undefined;
    }

    await ctx.db.patch(workspace._id, patch);
  },
});

export const upsertMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: assignableWorkspaceRoleValidator,
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx);
    const { workspace } = await requireWorkspaceMember(
      ctx,
      args.workspaceId,
      currentUserId,
      managerRoles
    );

    if (!args.userId.trim()) throw new Error("User id is required");
    if (args.userId === currentUserId) throw new Error("Use role changes for your own membership");
    if (workspace.ownerUserId === args.userId) {
      throw new Error("Transfer ownership before changing the owner role");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        status: "active",
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      role: args.role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertMemberByEmail = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: assignableWorkspaceRoleValidator,
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx);
    const { workspace } = await requireWorkspaceMember(
      ctx,
      args.workspaceId,
      currentUserId,
      managerRoles
    );

    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required");

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), email))
      .first();
    if (!user) {
      throw new Error("That person needs to sign in once before they can be added");
    }
    if (user.subject === currentUserId) {
      throw new Error("Use role changes for your own membership");
    }
    if (workspace.ownerUserId === user.subject) {
      throw new Error("Transfer ownership before changing the owner role");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", user.subject)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        status: "active",
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId: user.subject,
      role: args.role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listMembers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx);
    await requireWorkspaceMember(ctx, args.workspaceId, currentUserId);

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const rows = await Promise.all(
      memberships.map(async (membership) => ({
        membership,
        user: await ctx.db
          .query("users")
          .withIndex("by_subject", (q) => q.eq("subject", membership.userId))
          .unique(),
      }))
    );

    const roleRank: Record<WorkspaceRole, number> = {
      owner: 0,
      admin: 1,
      member: 2,
      viewer: 3,
    };

    return rows
      .filter((row) => row.membership.status === "active")
      .sort((first, second) => {
        return roleRank[first.membership.role] - roleRank[second.membership.role];
      });
  },
});

export const setMemberRole = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: workspaceRoleValidator,
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx);
    const { workspace, membership: currentMembership } = await requireWorkspaceMember(
      ctx,
      args.workspaceId,
      currentUserId,
      managerRoles
    );
    const membership = await getActiveMembership(ctx, args.workspaceId, args.userId);
    if (!membership) throw new Error("Workspace member not found");

    const now = Date.now();
    if (args.role === "owner") {
      if (currentMembership.role !== "owner") {
        throw new Error("Only the owner can transfer ownership");
      }
      if (workspace.ownerUserId === args.userId) return;

      const currentOwnerMembership = await getActiveMembership(
        ctx,
        args.workspaceId,
        workspace.ownerUserId
      );
      if (currentOwnerMembership) {
        await ctx.db.patch(currentOwnerMembership._id, {
          role: "admin",
          updatedAt: now,
        });
      }
      await ctx.db.patch(membership._id, {
        role: "owner",
        updatedAt: now,
      });
      await ctx.db.patch(workspace._id, {
        ownerUserId: args.userId,
        updatedAt: now,
      });
      return;
    }

    if (workspace.ownerUserId === args.userId) {
      throw new Error("Transfer ownership before changing the owner role");
    }

    await ctx.db.patch(membership._id, {
      role: args.role,
      updatedAt: now,
    });
  },
});

export const removeMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx);
    const { workspace } = await requireWorkspaceMember(
      ctx,
      args.workspaceId,
      currentUserId,
      managerRoles
    );
    if (args.userId === currentUserId) {
      throw new Error("You cannot remove yourself from a workspace");
    }
    if (workspace.ownerUserId === args.userId) {
      throw new Error("Workspace owner cannot be removed");
    }

    const membership = await getActiveMembership(ctx, args.workspaceId, args.userId);
    if (!membership) throw new Error("Workspace member not found");

    await ctx.db.patch(membership._id, {
      status: "removed",
      updatedAt: Date.now(),
    });
  },
});
