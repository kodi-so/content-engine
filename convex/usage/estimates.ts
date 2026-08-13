import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireBetaAccess } from "../auth/users";
import { estimateResolvedGenerationCost } from "./costEstimation";
import { modelProviderValidator } from "../validators";

const generationEstimateValidator = v.object({
  accuracy: v.union(v.literal("exact"), v.literal("approximate")),
  costUsd: v.number(),
  currency: v.literal("USD"),
  modelId: v.string(),
  modelLabel: v.string(),
  parameters: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  pricingVersion: v.string(),
  quantity: v.number(),
  source: v.union(v.literal("pricing_snapshot"), v.literal("static_pricing")),
  unit: v.string(),
  unitPriceUsd: v.number(),
});

export const generation = query({
  args: {
    provider: modelProviderValidator,
    mode: v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("lipsync")
    ),
    modelId: v.optional(v.string()),
    count: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    nativeAudio: v.optional(v.boolean()),
    options: v.optional(v.record(v.string(), v.union(v.string(), v.boolean()))),
    referenceCount: v.optional(v.number()),
    referenceVideoCount: v.optional(v.number()),
    textLength: v.optional(v.number()),
  },
  returns: v.union(v.null(), generationEstimateValidator),
  handler: async (ctx, args) => {
    await requireBetaAccess(ctx);
    return await estimateResolvedGenerationCost(ctx, args) ?? null;
  },
});
