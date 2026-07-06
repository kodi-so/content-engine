import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { nextScheduledRunAt } from "../../automations/scheduling";

function recordInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function scheduleConfig(value: unknown) {
  const record = recordInput(value);
  const postingTimes = Array.isArray(record.postingTimes)
    ? record.postingTimes.flatMap((item) => {
        const time = recordInput(item);
        const dayOfWeek = typeof time.dayOfWeek === "number" ? time.dayOfWeek : 1;
        const hour = typeof time.hour === "number" ? time.hour : 9;
        const minute = typeof time.minute === "number" ? time.minute : 0;
        return [{ dayOfWeek, hour, minute }];
      })
    : [{ dayOfWeek: 1, hour: 9, minute: 0 }];
  return {
    timezone: stringValue(record.timezone) ?? "America/Chicago",
    postingTimes,
  };
}

function idArray(value: unknown): Id<"socialAccounts">[] {
  return stringArray(value) as Id<"socialAccounts">[];
}

async function completeToolCall(
  ctx: MutationCtx,
  toolCall: Doc<"createToolCalls">,
  output: Record<string, unknown>
) {
  const now = Date.now();
  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output,
    completedAt: now,
    updatedAt: now,
  });
}

export async function createAutomationForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = recordInput(toolCall.input);
  const now = Date.now();
  const automationId = await ctx.db.insert("automations", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    socialAccountIds: idArray(input.socialAccountIds),
    name: stringValue(input.name) ?? "Untitled automation",
    brief: stringValue(input.brief) ?? stringValue(input.description) ?? "Create recurring social content.",
    pillars: stringArray(input.pillars),
    formatMix: stringValue(input.formatMix),
    scheduleConfig: scheduleConfig(input.schedule ?? input.scheduleConfig),
    approvalMode: input.approvalMode === "auto_publish" ? "auto_publish" : "require_approval",
    generationDefaults: recordInput(input.generationDefaults),
    budget: recordInput(input.budget),
    isActive: false,
    createdAt: now,
    updatedAt: now,
  });
  const automation = await ctx.db.get(automationId);
  await ctx.db.patch(automationId, {
    nextRunAt: automation ? nextScheduledRunAt(automation) : undefined,
  });
  await completeToolCall(ctx, toolCall, {
    automationId,
    status: "created_inactive",
    isActive: false,
  });
}

export async function listAutomationsForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const automations = thread.workspaceId
    ? await ctx.db
        .query("automations")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", thread.workspaceId))
        .collect()
    : await ctx.db
        .query("automations")
        .withIndex("by_user", (q) => q.eq("userId", thread.userId))
        .collect();
  await completeToolCall(ctx, toolCall, {
    automations: automations.map((automation) => ({
      id: automation._id,
      name: automation.name,
      brief: automation.brief,
      pillars: automation.pillars,
      approvalMode: automation.approvalMode,
      isActive: automation.isActive,
      nextRunAt: automation.nextRunAt,
    })),
  });
}

export async function updateAutomationForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = recordInput(toolCall.input);
  const id = stringValue(input.automationId) as Id<"automations"> | undefined;
  const name = stringValue(input.name);
  const automation = id
    ? await ctx.db.get(id)
    : name
      ? (thread.workspaceId
          ? await ctx.db.query("automations").withIndex("by_workspace", (q) => q.eq("workspaceId", thread.workspaceId)).collect()
          : await ctx.db.query("automations").withIndex("by_user", (q) => q.eq("userId", thread.userId)).collect()
        ).find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())
      : null;
  if (!automation) throw new Error("Automation not found");
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (input.brief !== undefined) patch.brief = stringValue(input.brief) ?? automation.brief;
  if (input.pillars !== undefined) patch.pillars = stringArray(input.pillars);
  if (input.formatMix !== undefined) patch.formatMix = stringValue(input.formatMix);
  if (input.schedule !== undefined || input.scheduleConfig !== undefined) {
    patch.scheduleConfig = scheduleConfig(input.schedule ?? input.scheduleConfig);
  }
  if (input.approvalMode === "auto_publish" || input.approvalMode === "require_approval") {
    patch.approvalMode = input.approvalMode;
  }
  if (input.generationDefaults !== undefined) patch.generationDefaults = recordInput(input.generationDefaults);
  if (input.budget !== undefined) patch.budget = recordInput(input.budget);
  await ctx.db.patch(automation._id, patch);
  await completeToolCall(ctx, toolCall, {
    automationId: automation._id,
    status: "updated",
  });
}
