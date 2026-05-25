import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import {
  modelProviderValidator,
  providerModelCapabilitiesValidator,
  providerModelCategoryValidator,
  providerModelSchemaSnapshotValidator,
} from "../validators";

export const list = query({
  args: {
    provider: v.optional(modelProviderValidator),
    category: v.optional(providerModelCategoryValidator),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const includeInactive = args.includeInactive === true;
    let models;

    if (args.provider && args.category) {
      models = await ctx.db
        .query("providerModels")
        .withIndex("by_provider_category", (q) =>
          q.eq("provider", args.provider!).eq("category", args.category!)
        )
        .collect();
    } else if (args.provider) {
      models = await ctx.db
        .query("providerModels")
        .withIndex("by_provider", (q) => q.eq("provider", args.provider!))
        .collect();
    } else {
      models = await ctx.db.query("providerModels").collect();
    }

    return models
      .filter((model) => includeInactive || model.isActive)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
});

export const getByProviderModel = query({
  args: {
    provider: modelProviderValidator,
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("providerModels")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", args.provider).eq("modelId", args.modelId)
      )
      .unique();
  },
});

export const upsert = internalMutation({
  args: {
    provider: modelProviderValidator,
    modelId: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    category: providerModelCategoryValidator,
    capabilities: providerModelCapabilitiesValidator,
    pricing: v.optional(v.any()),
    schemaSnapshot: providerModelSchemaSnapshotValidator,
    isActive: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
    lastSyncedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerModels")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", args.provider).eq("modelId", args.modelId)
      )
      .unique();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        description: args.description,
        category: args.category,
        capabilities: args.capabilities,
        pricing: args.pricing,
        schemaSnapshot: args.schemaSnapshot,
        isActive: args.isActive ?? existing.isActive,
        metadata: args.metadata,
        updatedAt: now,
        lastSyncedAt: args.lastSyncedAt ?? existing.lastSyncedAt,
      });

      return existing._id;
    }

    return await ctx.db.insert("providerModels", {
      provider: args.provider,
      modelId: args.modelId,
      displayName: args.displayName,
      description: args.description,
      category: args.category,
      capabilities: args.capabilities,
      pricing: args.pricing,
      schemaSnapshot: args.schemaSnapshot,
      isActive: args.isActive ?? true,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: args.lastSyncedAt,
    });
  },
});
