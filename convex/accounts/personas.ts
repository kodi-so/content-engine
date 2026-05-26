import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { personaTypeValidator } from "../validators";

type PersonaAssetField = "sourceAssetIds" | "generatedAssetIds" | "voiceAssetIds";

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

async function assertOwnedBrand(
  ctx: QueryCtx | MutationCtx,
  brandId: Id<"brands">,
  userId: string
) {
  const brand = await ctx.db.get(brandId);
  if (!brand || brand.userId !== userId) throw new Error("Brand not found");
  return brand;
}

function uniqueIds(ids: Id<"creativeAssets">[]) {
  return [...new Set(ids.map(String))] as Id<"creativeAssets">[];
}

async function validateCreativeAssets(
  ctx: QueryCtx | MutationCtx,
  args: {
    assetIds: Id<"creativeAssets">[];
    userId: string;
    brandId: Id<"brands">;
    field: PersonaAssetField;
  }
) {
  const assetIds = uniqueIds(args.assetIds);
  const assets = await Promise.all(assetIds.map((assetId) => ctx.db.get(assetId)));

  for (const asset of assets) {
    if (!asset || asset.userId !== args.userId || asset.brandId !== args.brandId) {
      throw new Error("Persona asset not found");
    }

    if (
      args.field === "voiceAssetIds" &&
      asset.mediaType !== "audio" &&
      asset.assetKind !== "voice"
    ) {
      throw new Error("Persona voice references must be audio or voice creative assets");
    }
  }

  return assetIds;
}

function cleanStringArray(values?: string[]) {
  const cleaned = values
    ?.map((value) => value.trim())
    .filter(Boolean);
  return cleaned?.length ? cleaned : undefined;
}

function personaSummary(persona: Doc<"personas">) {
  return {
    personaId: persona._id,
    brandId: persona.brandId,
    name: persona.name,
    personaType: persona.personaType,
    description: persona.description,
    identityPrompt: persona.identityPrompt,
    visualConstraints: persona.visualConstraints,
    sourceAssetIds: persona.sourceAssetIds,
    generatedAssetIds: persona.generatedAssetIds,
    voiceAssetIds: persona.voiceAssetIds,
    usageNotes: persona.usageNotes,
    metadata: persona.metadata,
    createdAt: persona.createdAt,
    updatedAt: persona.updatedAt,
  };
}

export const list = query({
  args: { brandId: v.optional(v.id("brands")) },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.userId !== userId) return [];
      return await ctx.db
        .query("personas")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("personas")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("personas") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const persona = await ctx.db.get(args.id);
    if (!persona || persona.userId !== userId) return null;
    return persona;
  },
});

export const create = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.string(),
    personaType: v.optional(personaTypeValidator),
    description: v.optional(v.string()),
    identityPrompt: v.optional(v.string()),
    visualConstraints: v.optional(v.array(v.string())),
    sourceAssetIds: v.optional(v.array(v.id("creativeAssets"))),
    generatedAssetIds: v.optional(v.array(v.id("creativeAssets"))),
    voiceAssetIds: v.optional(v.array(v.id("creativeAssets"))),
    usageNotes: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    await assertOwnedBrand(ctx, args.brandId, userId);

    const name = args.name.trim();
    if (!name) throw new Error("Persona name is required");

    const sourceAssetIds = await validateCreativeAssets(ctx, {
      assetIds: args.sourceAssetIds ?? [],
      userId,
      brandId: args.brandId,
      field: "sourceAssetIds",
    });
    const generatedAssetIds = await validateCreativeAssets(ctx, {
      assetIds: args.generatedAssetIds ?? [],
      userId,
      brandId: args.brandId,
      field: "generatedAssetIds",
    });
    const voiceAssetIds = await validateCreativeAssets(ctx, {
      assetIds: args.voiceAssetIds ?? [],
      userId,
      brandId: args.brandId,
      field: "voiceAssetIds",
    });

    const now = Date.now();
    return await ctx.db.insert("personas", {
      userId,
      brandId: args.brandId,
      name,
      personaType: args.personaType ?? "ai_influencer",
      description: args.description?.trim() || undefined,
      identityPrompt: args.identityPrompt?.trim() || "",
      visualConstraints: cleanStringArray(args.visualConstraints),
      sourceAssetIds,
      generatedAssetIds,
      voiceAssetIds,
      usageNotes: args.usageNotes?.trim() || undefined,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("personas"),
    name: v.optional(v.string()),
    personaType: v.optional(personaTypeValidator),
    description: v.optional(v.string()),
    identityPrompt: v.optional(v.string()),
    visualConstraints: v.optional(v.array(v.string())),
    sourceAssetIds: v.optional(v.array(v.id("creativeAssets"))),
    generatedAssetIds: v.optional(v.array(v.id("creativeAssets"))),
    voiceAssetIds: v.optional(v.array(v.id("creativeAssets"))),
    usageNotes: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const persona = await ctx.db.get(args.id);
    if (!persona || persona.userId !== userId) throw new Error("Persona not found");
    await assertOwnedBrand(ctx, persona.brandId, userId);

    const patch: Partial<Doc<"personas">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Persona name is required");
      patch.name = name;
    }
    if (args.personaType !== undefined) patch.personaType = args.personaType;
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.identityPrompt !== undefined) patch.identityPrompt = args.identityPrompt.trim();
    if (args.visualConstraints !== undefined) patch.visualConstraints = cleanStringArray(args.visualConstraints);
    if (args.usageNotes !== undefined) patch.usageNotes = args.usageNotes.trim() || undefined;
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    if (args.sourceAssetIds !== undefined) {
      patch.sourceAssetIds = await validateCreativeAssets(ctx, {
        assetIds: args.sourceAssetIds,
        userId,
        brandId: persona.brandId,
        field: "sourceAssetIds",
      });
    }
    if (args.generatedAssetIds !== undefined) {
      patch.generatedAssetIds = await validateCreativeAssets(ctx, {
        assetIds: args.generatedAssetIds,
        userId,
        brandId: persona.brandId,
        field: "generatedAssetIds",
      });
    }
    if (args.voiceAssetIds !== undefined) {
      patch.voiceAssetIds = await validateCreativeAssets(ctx, {
        assetIds: args.voiceAssetIds,
        userId,
        brandId: persona.brandId,
        field: "voiceAssetIds",
      });
    }

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("personas") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const persona = await ctx.db.get(args.id);
    if (!persona || persona.userId !== userId) throw new Error("Persona not found");
    await ctx.db.delete(args.id);
  },
});

export const summarize = query({
  args: { id: v.id("personas") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await ctx.auth.getUserIdentity());
    const persona = await ctx.db.get(args.id);
    if (!persona || persona.userId !== userId) return null;
    return personaSummary(persona);
  },
});
