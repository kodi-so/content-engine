import { v } from "convex/values";
import { internal } from "../../_generated/api";
import {
  internalAction,
  internalMutation,
} from "../../_generated/server";
import { insertUsageEvent } from "../../usage/records";
import { falAdminRequest, hasFalAdminApiKey } from "./client";

type FalBillingEvent = {
  request_id: string;
  endpoint_id: string;
  timestamp: string;
  output_units: number;
  unit_price: number;
  cost_subtotal: number;
  cost_discount: number;
  cost_total: number;
  cost_estimate_nano_usd: number;
};

type FalBillingResponse = {
  billing_events: FalBillingEvent[];
  next_cursor: string | null;
  has_more: boolean;
};

const FAL_BILLING_EVENTS_URL = "https://api.fal.ai/v1/models/billing-events";

export const recordBillingEvents = internalMutation({
  args: {
    events: v.array(v.object({
      requestId: v.string(),
      endpointId: v.string(),
      timestamp: v.string(),
      outputUnits: v.number(),
      unitPriceUsd: v.number(),
      costSubtotalUsd: v.number(),
      costDiscountUsd: v.number(),
      costTotalUsd: v.number(),
      raw: v.any(),
    })),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let insertedCount = 0;
    for (const billingEvent of args.events) {
      const related = await ctx.db
        .query("usageEvents")
        .withIndex("by_provider_request", (q) =>
          q.eq("provider", "fal").eq("providerRequestId", billingEvent.requestId)
        )
        .order("desc")
        .take(20);
      if (related.some((event) =>
        event.eventKind === "charge" && event.source === "provider_billing_event"
      )) continue;
      const submission = related.find((event) => event.eventKind === "provider_submission");
      if (!submission) continue;
      await insertUsageEvent(ctx, {
        userId: submission.userId,
        workspaceId: submission.workspaceId,
        createThreadId: submission.createThreadId,
        createToolCallId: submission.createToolCallId,
        contentRequestId: submission.contentRequestId,
        provider: "fal",
        modelId: billingEvent.endpointId || submission.modelId,
        operationKey: submission.operationKey,
        providerRequestId: billingEvent.requestId,
        category: submission.category,
        eventKind: "charge",
        source: "provider_billing_event",
        actualCostUsd: billingEvent.costTotalUsd,
        quantity: billingEvent.outputUnits,
        unitPriceUsd: billingEvent.unitPriceUsd,
        parameters: submission.parameters,
        priceSnapshot: {
          costSubtotalUsd: billingEvent.costSubtotalUsd,
          costDiscountUsd: billingEvent.costDiscountUsd,
          raw: billingEvent.raw,
        },
        completedAt: Number.isFinite(Date.parse(billingEvent.timestamp))
          ? Date.parse(billingEvent.timestamp)
          : Date.now(),
      });
      if (submission.contentRequestId) {
        const requestEvents = await ctx.db
          .query("usageEvents")
          .withIndex("by_content_request", (q) =>
            q.eq("contentRequestId", submission.contentRequestId)
          )
          .order("desc")
          .take(200);
        const latestCharges = new Map<string, number>();
        for (const event of requestEvents) {
          if (event.eventKind !== "charge" || latestCharges.has(event.operationKey)) continue;
          latestCharges.set(event.operationKey, event.actualCostUsd ?? 0);
        }
        latestCharges.set(submission.operationKey, billingEvent.costTotalUsd);
        const requestTotalCostUsd = [...latestCharges.values()].reduce(
          (sum, cost) => sum + cost,
          0
        );
        await ctx.db.patch(submission.contentRequestId, {
          costUsd: requestTotalCostUsd,
          updatedAt: Date.now(),
        });
        if (submission.createToolCallId) {
          await ctx.db.patch(submission.createToolCallId, {
            costUsd: requestTotalCostUsd,
            updatedAt: Date.now(),
          });
        }
      }
      insertedCount += 1;
    }
    return insertedCount;
  },
});

export const reconcileRecentBillingEvents = internalAction({
  args: {},
  returns: v.object({
    checkedRequestCount: v.number(),
    recordedEventCount: v.number(),
    skipped: v.boolean(),
  }),
  handler: async (ctx): Promise<{
    checkedRequestCount: number;
    recordedEventCount: number;
    skipped: boolean;
  }> => {
    if (!hasFalAdminApiKey()) {
      return { checkedRequestCount: 0, recordedEventCount: 0, skipped: true };
    }
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let cursor: string | null = null;
    let pageCount = 0;
    let checkedRequestCount = 0;
    let recordedEventCount = 0;
    do {
      const query = new URLSearchParams({ start, limit: "200" });
      if (cursor) query.set("cursor", cursor);
      const response: FalBillingResponse = await falAdminRequest<FalBillingResponse>(
        "get_billing_events",
        `${FAL_BILLING_EVENTS_URL}?${query.toString()}`,
        { method: "GET" }
      );
      checkedRequestCount += response.billing_events.length;
      recordedEventCount += await ctx.runMutation(
        internal.providers.fal.billing.recordBillingEvents,
        {
          events: response.billing_events.flatMap((event) =>
            event.request_id && Number.isFinite(event.cost_total)
              ? [{
                  requestId: event.request_id,
                  endpointId: event.endpoint_id,
                  timestamp: event.timestamp,
                  outputUnits: event.output_units,
                  unitPriceUsd: event.unit_price,
                  costSubtotalUsd: event.cost_subtotal,
                  costDiscountUsd: event.cost_discount,
                  costTotalUsd: event.cost_total,
                  raw: event,
                }]
              : []
          ),
        }
      );
      cursor = response.has_more ? response.next_cursor : null;
      pageCount += 1;
    } while (cursor && pageCount < 20);
    return {
      checkedRequestCount,
      recordedEventCount,
      skipped: false,
    };
  },
});
