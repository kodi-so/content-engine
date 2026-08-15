import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { CreateReferenceMention } from "../create/planning";

export type ActiveAccountReference = {
  asset: Doc<"creativeAssets">;
  link: Doc<"accountReferences">;
};

function referenceInstruction(reference: ActiveAccountReference) {
  const explicitInstruction = reference.link.instruction?.trim();
  if (explicitInstruction) return explicitInstruction;
  if (reference.link.role === "identity") {
    return "Use as the account's primary character reference. Preserve the same recognizable facial features, hair, and proportions across visual content.";
  }
  return `Use as an account ${reference.link.role.replace(/_/g, " ")} reference.`;
}

export function accountReferenceMention(
  reference: ActiveAccountReference
): CreateReferenceMention {
  return {
    token: `@${reference.asset.name.replace(/\s+/g, "_").toLowerCase()}`,
    label: reference.asset.name,
    entityType: "creative_asset",
    entityId: String(reference.asset._id),
    mediaType: reference.asset.mediaType,
    storageUrl: reference.asset.storageUrl,
    instruction: referenceInstruction(reference),
  };
}

export async function activeAccountReferences(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  socialAccountId: Id<"socialAccounts">
): Promise<ActiveAccountReference[]> {
  const links = await ctx.db
    .query("accountReferences")
    .withIndex("by_social_account", (q) => q.eq("socialAccountId", socialAccountId))
    .take(50);
  const activeLinks = links.filter((link) => link.isActive);
  const assets = await Promise.all(
    activeLinks.map((link) => ctx.db.get(link.creativeAssetId))
  );
  const references = activeLinks.flatMap((link, index) => {
    const asset = assets[index];
    return asset ? [{ asset, link }] : [];
  });
  return references.sort((first, second) =>
    Number(second.link.role === "identity") - Number(first.link.role === "identity")
  );
}

export async function activeAccountReferenceMentions(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  socialAccountId: Id<"socialAccounts">
) {
  const references = await activeAccountReferences(ctx, socialAccountId);
  return references.map(accountReferenceMention);
}
