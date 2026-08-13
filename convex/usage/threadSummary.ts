import type { Doc, Id } from "../_generated/dataModel";

export type ThreadUsageSummaryItem = {
  operationKey: string;
  createToolCallId?: Id<"createToolCalls">;
  label: string;
  modelId: string;
  category: string;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  outstandingEstimatedCostUsd: number;
  parameters?: unknown;
  status: string;
};

export function buildThreadUsageSummary(args: {
  events: Doc<"usageEvents">[];
  thread: Doc<"createThreads">;
  toolCalls: Doc<"createToolCalls">[];
}) {
  const estimates = new Map<string, Doc<"usageEvents">>();
  const charges = new Map<string, Doc<"usageEvents">>();
  const eventsByToolCallId = new Map<string, Doc<"usageEvents">[]>();
  for (const event of args.events) {
    if (event.eventKind === "estimate" && !estimates.has(event.operationKey)) {
      estimates.set(event.operationKey, event);
    }
    if (event.eventKind === "charge" && !charges.has(event.operationKey)) {
      charges.set(event.operationKey, event);
    }
    if (event.createToolCallId) {
      const key = String(event.createToolCallId);
      eventsByToolCallId.set(key, [...(eventsByToolCallId.get(key) ?? []), event]);
    }
  }

  const items: ThreadUsageSummaryItem[] = args.toolCalls.flatMap(
    (toolCall): ThreadUsageSummaryItem[] => {
      const toolEvents = eventsByToolCallId.get(String(toolCall._id)) ?? [];
      const latestEstimates = new Map<string, Doc<"usageEvents">>();
      const uniqueCharges = new Map<string, Doc<"usageEvents">>();
      for (const event of toolEvents) {
        if (event.eventKind === "estimate" && !latestEstimates.has(event.operationKey)) {
          latestEstimates.set(event.operationKey, event);
        }
        if (event.eventKind === "charge" && !uniqueCharges.has(event.operationKey)) {
          uniqueCharges.set(event.operationKey, event);
        }
      }
      const estimateEvents = [...latestEstimates.values()];
      const estimate = estimateEvents[0];
      const actualCostUsd = [...uniqueCharges.values()].reduce(
        (sum, event) => sum + (event.actualCostUsd ?? 0),
        0
      );
      const estimatedByCategory = new Map<string, number>();
      for (const event of estimateEvents) {
        estimatedByCategory.set(
          event.category,
          (estimatedByCategory.get(event.category) ?? 0) + (event.estimatedCostUsd ?? 0)
        );
      }
      const chargedByCategory = new Map<string, number>();
      for (const event of uniqueCharges.values()) {
        chargedByCategory.set(
          event.category,
          (chargedByCategory.get(event.category) ?? 0) + (event.actualCostUsd ?? 0)
        );
      }
      const outstandingEstimatedCostUsd = [...estimatedByCategory].reduce(
        (sum, [category, estimatedCostUsd]) =>
          sum + Math.max(0, estimatedCostUsd - (chargedByCategory.get(category) ?? 0)),
        0
      );
      const source = estimate ?? [...uniqueCharges.values()][0];
      if (!source) return [];
      return [{
        operationKey: `tool:${toolCall._id}`,
        createToolCallId: toolCall._id,
        label: toolCall.label,
        modelId: source.modelId,
        category: source.category,
        estimatedCostUsd: estimate?.estimatedCostUsd,
        actualCostUsd: uniqueCharges.size ? actualCostUsd : undefined,
        outstandingEstimatedCostUsd,
        parameters: estimate?.parameters ?? source.parameters,
        status: toolCall.status,
      }];
    }
  );

  for (const [operationKey, charge] of charges) {
    if (charge.createToolCallId) continue;
    items.push({
      operationKey,
      label: charge.category === "agent" ? "Agent planning" : charge.modelId,
      modelId: charge.modelId,
      category: charge.category,
      estimatedCostUsd: estimates.get(operationKey)?.estimatedCostUsd,
      actualCostUsd: charge.actualCostUsd,
      outstandingEstimatedCostUsd: 0,
      parameters: estimates.get(operationKey)?.parameters ?? charge.parameters,
      status: "succeeded",
    });
  }

  const actualCostUsd = items.reduce((sum, item) => sum + (item.actualCostUsd ?? 0), 0);
  const outstandingEstimatedCostUsd = items.reduce((sum, item) =>
    item.status !== "failed" && item.status !== "canceled"
      ? sum + item.outstandingEstimatedCostUsd
      : sum,
    0
  );
  const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return {
    actualCostUsd: rounded(actualCostUsd),
    outstandingEstimatedCostUsd: rounded(outstandingEstimatedCostUsd),
    totalCostUsd: rounded(actualCostUsd + outstandingEstimatedCostUsd),
    isFinal:
      args.thread.status !== "planning" &&
      args.thread.status !== "running" &&
      args.thread.status !== "waiting_for_user" &&
      !args.toolCalls.some((toolCall) =>
        toolCall.status === "queued" || toolCall.status === "running" || toolCall.status === "blocked"
      ),
    items,
  };
}
