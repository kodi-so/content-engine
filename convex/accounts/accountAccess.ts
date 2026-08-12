import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireWorkspaceMember } from "../workspaces/workspaces";

export async function requireSocialAccountAccess(
  ctx: MutationCtx | QueryCtx,
  socialAccountId: Id<"socialAccounts">,
  userId: string
) {
  const account = await ctx.db.get(socialAccountId);
  if (!account) throw new Error("Social account not found");
  if (account.workspaceId) {
    await requireWorkspaceMember(ctx, account.workspaceId, userId);
  } else if (account.userId !== userId) {
    throw new Error("Social account not found");
  }
  return account;
}

export async function requireAccountPostAccess(
  ctx: MutationCtx | QueryCtx,
  accountPostId: Id<"accountPosts">,
  userId: string
) {
  const post = await ctx.db.get(accountPostId);
  if (!post) throw new Error("Account post not found");
  await requireSocialAccountAccess(ctx, post.socialAccountId, userId);
  return post;
}
