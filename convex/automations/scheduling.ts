import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { getModelProvider } from "../providers";

type AutomationDoc = Doc<"automations">;
type PostingTime = { dayOfWeek?: number; hour: number; minute: number };

const DEFAULT_TIMEZONE = "America/Chicago";
const SCHEDULER_BATCH_SIZE = 25;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const weekdayIndexes: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function localParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    dayOfWeek: weekdayIndexes[part("weekday")] ?? 0,
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}

function findNextLocalPostingTime(
  after: number,
  timezone: string,
  times: PostingTime[],
  type: "daily" | "weekly"
) {
  const normalizedTimes = times.map((time) => ({
    ...time,
    hour: Math.max(0, Math.min(23, Math.floor(time.hour))),
    minute: Math.max(0, Math.min(59, Math.floor(time.minute))),
    dayOfWeek: time.dayOfWeek === undefined ? undefined : Math.max(0, Math.min(6, Math.floor(time.dayOfWeek))),
  }));
  const start = Math.ceil((after + MINUTE_MS) / MINUTE_MS) * MINUTE_MS;
  const maxMinutes = type === "weekly" ? 8 * 24 * 60 : 2 * 24 * 60;

  for (let offset = 0; offset <= maxMinutes; offset += 1) {
    const candidate = start + offset * MINUTE_MS;
    const local = localParts(candidate, timezone);
    const match = normalizedTimes.some((time) =>
      time.hour === local.hour &&
      time.minute === local.minute &&
      (type === "daily" || time.dayOfWeek === local.dayOfWeek)
    );
    if (match) return candidate;
  }

  return start + (type === "weekly" ? 7 * DAY_MS : DAY_MS);
}

function scheduleType(automation: AutomationDoc): "daily" | "weekly" {
  const uniqueDays = new Set(automation.scheduleConfig.postingTimes.map((time) => time.dayOfWeek));
  return uniqueDays.size <= 1 ? "daily" : "weekly";
}

function postingTimes(automation: AutomationDoc, type: "daily" | "weekly"): PostingTime[] {
  const times = automation.scheduleConfig.postingTimes.length
    ? automation.scheduleConfig.postingTimes
    : [{ dayOfWeek: 1, hour: 9, minute: 0 }];
  return times.map((time) => ({
    dayOfWeek: type === "weekly" ? time.dayOfWeek : undefined,
    hour: time.hour,
    minute: time.minute,
  }));
}

function nextScheduledRunAtAfter(automation: AutomationDoc, after: number) {
  if (!automation.isActive) return undefined;
  const type = scheduleType(automation);
  return findNextLocalPostingTime(
    after,
    automation.scheduleConfig.timezone || DEFAULT_TIMEZONE,
    postingTimes(automation, type),
    type
  );
}

export function nextScheduledRunAt(automation: AutomationDoc, from = Date.now()) {
  return nextScheduledRunAtAfter(automation, from);
}

function nextRunAfterDueAutomation(automation: AutomationDoc, now: number) {
  let nextRunAt = nextScheduledRunAtAfter(
    automation,
    automation.nextRunAt && automation.nextRunAt > 0 ? automation.nextRunAt : now
  );
  while (nextRunAt !== undefined && nextRunAt <= now) {
    nextRunAt = nextScheduledRunAtAfter(automation, nextRunAt);
  }
  return nextRunAt;
}

export function calendarMonthStart(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(timestamp));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return Date.UTC(year, month - 1, 1);
}

function parseTopicPickerJson(text: string): {
  angle?: string;
  contentBrief?: string;
  pillar?: string;
  topic?: string;
} {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = match?.[0] ?? trimmed;
  const parsed = JSON.parse(jsonText) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, string>
    : {};
}

function fallbackTopicPlan(automation: AutomationDoc, ledger: string[]) {
  const ledgerSet = new Set(ledger.map((topic) => topic.toLowerCase()));
  const pillar = automation.pillars.find((candidate) => !ledgerSet.has(candidate.toLowerCase())) ??
    automation.pillars[0] ??
    "content idea";
  const topic = `${pillar}: ${new Date().toLocaleDateString("en-US", {
    timeZone: automation.scheduleConfig.timezone || DEFAULT_TIMEZONE,
  })}`;
  const contentBrief = [
    automation.brief,
    `Create one post about: ${topic}.`,
    automation.formatMix ? `Format mix guidance: ${automation.formatMix}.` : undefined,
    automation.approvalMode === "auto_publish"
      ? "Prepare the post for publishing when complete."
      : "Prepare a draft for approval when complete.",
  ].filter(Boolean).join("\n");
  return { pillar, topic, contentBrief };
}

export const runDueAutomations = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const dueAutomations = await ctx.db
      .query("automations")
      .withIndex("by_active_next_run", (q) =>
        q.eq("isActive", true).lte("nextRunAt", now)
      )
      .take(SCHEDULER_BATCH_SIZE);

    for (const automation of dueAutomations) {
      const monthStart = calendarMonthStart(now, automation.scheduleConfig.timezone || DEFAULT_TIMEZONE);
      const monthRuns = await ctx.db
        .query("automationRuns")
        .withIndex("by_automation_started", (q) => q.eq("automationId", automation._id))
        .filter((q) => q.gte(q.field("startedAt"), monthStart))
        .collect();
      const monthCost = monthRuns.reduce((sum, run) => sum + (run.costUsd ?? 0), 0);
      const monthlyBudget = automation.budget?.maxUsdPerMonth;
      if (monthlyBudget !== undefined && monthCost >= monthlyBudget) {
        await ctx.db.insert("automationRuns", {
          automationId: automation._id,
          userId: automation.userId,
          workspaceId: automation.workspaceId,
          topic: "Monthly budget exhausted",
          status: "skipped",
          errorMessage: `Monthly budget of $${monthlyBudget.toFixed(2)} is exhausted.`,
          startedAt: now,
          completedAt: now,
        });
        await ctx.db.patch(automation._id, {
          nextRunAt: nextRunAfterDueAutomation(automation, now),
          updatedAt: now,
        });
        continue;
      }

      const runId = await ctx.db.insert("automationRuns", {
        automationId: automation._id,
        userId: automation.userId,
        workspaceId: automation.workspaceId,
        topic: "Picking topic",
        status: "picking_topic",
        startedAt: now,
      });
      await ctx.db.patch(automation._id, {
        nextRunAt: nextRunAfterDueAutomation(automation, now),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.automations.scheduling.startAutomationRun, {
        runId,
      });
    }

    return { checkedAt: now, dueAutomationCount: dueAutomations.length };
  },
});

export const startAutomationRun = internalAction({
  args: { runId: v.id("automationRuns") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.automations.scheduling.getAutomationRunStartContext, args);
    if (!context) return;
    const { automation, ledger } = context;
    let topicPlan = fallbackTopicPlan(automation, ledger);
    try {
      const provider = getModelProvider("openrouter");
      const response = await provider.generateText({
        systemPrompt: [
          "You pick varied topics for a recurring social content automation.",
          "Return strict JSON only with keys: pillar, topic, angle, contentBrief.",
          "Do not repeat or closely paraphrase any ledger topic.",
          "contentBrief must be one concrete paragraph for exactly one post.",
        ].join("\n"),
        prompt: [
          `Automation name: ${automation.name}`,
          `Brief: ${automation.brief}`,
          automation.pillars.length ? `Pillars: ${automation.pillars.join(", ")}` : undefined,
          automation.formatMix ? `Format mix: ${automation.formatMix}` : undefined,
          ledger.length ? `Recent topic ledger:\n${ledger.map((topic) => `- ${topic}`).join("\n")}` : "Recent topic ledger: none",
          automation.approvalMode === "auto_publish"
            ? "The run can prepare publishing after content is ready."
            : "The run should prepare a draft for human approval.",
        ].filter(Boolean).join("\n\n"),
        model: process.env.CONTENT_ENGINE_AUTOMATION_TOPIC_MODEL?.trim() || undefined,
        maxTokens: 700,
        metadata: { automationId: automation._id, automationRunId: args.runId },
      });
      const parsed = parseTopicPickerJson(response.text);
      topicPlan = {
        pillar: parsed.pillar?.trim() || topicPlan.pillar,
        topic: parsed.topic?.trim() || topicPlan.topic,
        contentBrief: parsed.contentBrief?.trim() || topicPlan.contentBrief,
      };
    } catch (error) {
      await ctx.runMutation(internal.automations.scheduling.markAutomationRunFailed, {
        runId: args.runId,
        errorMessage: error instanceof Error ? error.message : "Topic picker failed",
      });
      return;
    }
    await ctx.runMutation(internal.automations.scheduling.seedCreateThreadForAutomationRun, {
      runId: args.runId,
      ...topicPlan,
    });
  },
});

export const getAutomationRunStartContext = internalQuery({
  args: { runId: v.id("automationRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const automation = await ctx.db.get(run.automationId);
    if (!automation) return null;
    const priorRuns = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation_started", (q) => q.eq("automationId", automation._id))
      .order("desc")
      .take(21);
    return {
      automation,
      run,
      ledger: priorRuns
        .filter((item) => item._id !== run._id && item.topic !== "Picking topic")
        .slice(0, 20)
        .map((item) => item.topic),
    };
  },
});

export const markAutomationRunFailed = internalMutation({
  args: { errorMessage: v.string(), runId: v.id("automationRuns") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });
  },
});

export const markAutomationRunPublishOutcome = internalMutation({
  args: {
    errorMessage: v.optional(v.string()),
    ok: v.boolean(),
    runId: v.id("automationRuns"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.ok ? "published" : "failed",
      errorMessage: args.ok ? undefined : args.errorMessage ?? "Publishing failed",
      completedAt: Date.now(),
    });
  },
});

export const seedCreateThreadForAutomationRun = internalMutation({
  args: {
    contentBrief: v.string(),
    pillar: v.optional(v.string()),
    runId: v.id("automationRuns"),
    topic: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;
    const automation = await ctx.db.get(run.automationId);
    if (!automation) return;
    const now = Date.now();
    const threadId = await ctx.db.insert("createThreads", {
      userId: automation.userId,
      workspaceId: automation.workspaceId,
      origin: "automation",
      automationRunId: run._id,
      title: automation.name,
      status: "planning",
      checkpointMode: "auto",
      decisionRunId: crypto.randomUUID(),
      turnDecisionCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const messageId = await ctx.db.insert("createMessages", {
      userId: automation.userId,
      workspaceId: automation.workspaceId,
      createThreadId: threadId,
      role: "user",
      content: args.contentBrief,
      kind: "chat",
      createdAt: now,
    });
    const decisionRunId = crypto.randomUUID();
    await ctx.db.patch(threadId, { decisionRunId, updatedAt: now });
    await ctx.db.patch(run._id, {
      createThreadId: threadId,
      pillar: args.pillar,
      topic: args.topic,
      status: "generating",
    });
    await ctx.scheduler.runAfter(0, internal.create.agent.decideAgentTurn, {
      checkpointMode: "auto",
      decisionRunId,
      threadId,
      userMessageId: messageId,
    });
  },
});
