import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

export async function requireBetaAccessForAction(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const approved = await ctx.runQuery(internal.auth.users.hasBetaAccessForEmail, {
    email: identity.email,
  });
  if (!approved) throw new Error("Content Engine is in private beta");

  return identity;
}
