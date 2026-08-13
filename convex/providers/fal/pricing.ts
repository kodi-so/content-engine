import { v } from "convex/values";
import { internal } from "../../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server";
import { ROSTER_MODELS, rosterModelIds } from "../../../src/lib/generation/modelRoster";
import { falPlatformRequest } from "./client";

type FalPrice = {
  currency: string;
  endpoint_id: string;
  unit: string;
  unit_price: number;
};

type FalPricingResponse = {
  has_more: boolean;
  next_cursor: string | null;
  prices: FalPrice[];
};

const FAL_PRICING_API_URL = "https://api.fal.ai/v1/models/pricing";

function pricingEndpointIds() {
  const endpointIds = [
    ...ROSTER_MODELS.flatMap(rosterModelIds),
    "fal-ai/nano-banana-2/edit",
    "fal-ai/nano-banana-pro/edit",
    "openai/gpt-image-2/image-to-image",
  ].map((endpointId) => {
    if (endpointId === "fal-ai/xai/tts/v1") return "xai/tts/v1";
    if (endpointId.startsWith("fal-ai/seedance-2.0")) {
      return endpointId.replace(/^fal-ai\//, "bytedance/");
    }
    return endpointId;
  });
  return [...new Set(endpointIds)].sort((left, right) => left.localeCompare(right));
}

export const listRosterEndpointIds = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async () => pricingEndpointIds(),
});

export const upsertSnapshots = internalMutation({
  args: {
    fetchedAt: v.number(),
    prices: v.array(v.object({
      currency: v.string(),
      endpointId: v.string(),
      raw: v.optional(v.any()),
      unit: v.string(),
      unitPriceUsd: v.number(),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const price of args.prices) {
      const existing = await ctx.db
        .query("providerPriceSnapshots")
        .withIndex("by_provider_and_endpoint", (q) =>
          q.eq("provider", "fal").eq("endpointId", price.endpointId)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          currency: price.currency,
          unit: price.unit,
          unitPriceUsd: price.unitPriceUsd,
          raw: price.raw,
          fetchedAt: args.fetchedAt,
          updatedAt: now,
        });
        continue;
      }
      await ctx.db.insert("providerPriceSnapshots", {
        provider: "fal",
        endpointId: price.endpointId,
        currency: price.currency,
        unit: price.unit,
        unitPriceUsd: price.unitPriceUsd,
        raw: price.raw,
        fetchedAt: args.fetchedAt,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const syncRosterPrices = internalAction({
  args: {},
  returns: v.object({
    endpointCount: v.number(),
    priceCount: v.number(),
    syncedAt: v.number(),
  }),
  handler: async (ctx): Promise<{
    endpointCount: number;
    priceCount: number;
    syncedAt: number;
  }> => {
    const endpointIds: string[] = await ctx.runQuery(
      internal.providers.fal.pricing.listRosterEndpointIds,
      {}
    );
    const response = await falPlatformRequest<FalPricingResponse>(
      "get_model_pricing",
      `${FAL_PRICING_API_URL}?endpoint_id=${encodeURIComponent(endpointIds.join(","))}`,
      { method: "GET" }
    );
    const syncedAt = Date.now();
    await ctx.runMutation(internal.providers.fal.pricing.upsertSnapshots, {
      fetchedAt: syncedAt,
      prices: response.prices.flatMap((price) =>
        Number.isFinite(price.unit_price) && price.unit_price >= 0
          ? [{
              endpointId: price.endpoint_id,
              unitPriceUsd: price.unit_price,
              unit: price.unit,
              currency: price.currency || "USD",
              raw: price,
            }]
          : []
      ),
    });
    return {
      endpointCount: endpointIds.length,
      priceCount: response.prices.length,
      syncedAt,
    };
  },
});
