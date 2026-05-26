import { internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { createWorkflowRun } from "./runCreation";

type WorkflowDoc = Doc<"workflows">;
type RunnerConfig = Record<string, unknown>;
type PostingTime = { dayOfWeek?: number; hour: number; minute: number };

const DEFAULT_TIMEZONE = "America/Chicago";
const MAX_RUNS_PER_EXECUTION = 10;
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

function numberFromConfig(config: RunnerConfig, key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringFromConfig(config: RunnerConfig, key: string, fallback: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function runnerConfig(workflow: WorkflowDoc): RunnerConfig {
  const runner = workflow.graph.nodes.find((node) => node.type === "runner");
  return runner?.config ?? {};
}

export function workflowUsesSchedule(workflow: WorkflowDoc) {
  const config = runnerConfig(workflow);
  return workflow.trigger === "schedule" || config.trigger === "schedule";
}

export function runsPerScheduledExecution(workflow: WorkflowDoc) {
  const config = runnerConfig(workflow);
  return Math.max(
    1,
    Math.min(
      MAX_RUNS_PER_EXECUTION,
      Math.floor(numberFromConfig(config, "runsPerExecution", 1))
    )
  );
}

function scheduleType(workflow: WorkflowDoc): "interval" | "daily" | "weekly" {
  const config = runnerConfig(workflow);
  const value = config.scheduleType;
  if (value === "daily" || value === "weekly" || value === "interval") return value;
  return workflow.scheduleConfig?.postingTimes.length ? "weekly" : "interval";
}

function scheduleTimezone(workflow: WorkflowDoc) {
  return stringFromConfig(
    runnerConfig(workflow),
    "timezone",
    workflow.scheduleConfig?.timezone || DEFAULT_TIMEZONE
  );
}

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

function postingTimesForWorkflow(
  workflow: WorkflowDoc,
  type: "daily" | "weekly"
): PostingTime[] {
  const config = runnerConfig(workflow);
  const configuredTimes = workflow.scheduleConfig?.postingTimes ?? [];

  if (configuredTimes.length) {
    return configuredTimes.map((time) => ({
      dayOfWeek: type === "weekly" ? time.dayOfWeek : undefined,
      hour: time.hour,
      minute: time.minute,
    }));
  }

  return [
    {
      dayOfWeek: type === "weekly"
        ? Math.max(0, Math.min(6, Math.floor(numberFromConfig(config, "scheduleDayOfWeek", 1))))
        : undefined,
      hour: Math.max(0, Math.min(23, Math.floor(numberFromConfig(config, "scheduleHour", 9)))),
      minute: Math.max(0, Math.min(59, Math.floor(numberFromConfig(config, "scheduleMinute", 0)))),
    },
  ];
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
    dayOfWeek: time.dayOfWeek === undefined
      ? undefined
      : Math.max(0, Math.min(6, Math.floor(time.dayOfWeek))),
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

function nextScheduledRunAtAfter(workflow: WorkflowDoc, after: number) {
  if (!workflow.isActive || !workflowUsesSchedule(workflow)) return undefined;

  const type = scheduleType(workflow);
  if (type === "interval") {
    const intervalHours = Math.max(
      1,
      numberFromConfig(runnerConfig(workflow), "intervalHours", 24)
    );
    return after + intervalHours * HOUR_MS;
  }

  return findNextLocalPostingTime(
    after,
    scheduleTimezone(workflow),
    postingTimesForWorkflow(workflow, type),
    type
  );
}

export function nextScheduledRunAt(workflow: WorkflowDoc, from = Date.now()) {
  return nextScheduledRunAtAfter(workflow, from);
}

function nextRunAfterDueWorkflow(workflow: WorkflowDoc, now: number) {
  let nextRunAt = nextScheduledRunAtAfter(
    workflow,
    workflow.nextRunAt && workflow.nextRunAt > 0 ? workflow.nextRunAt : now
  );

  while (nextRunAt !== undefined && nextRunAt <= now) {
    nextRunAt = nextScheduledRunAtAfter(workflow, nextRunAt);
  }

  return nextRunAt;
}

export const runDueWorkflows = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const dueWorkflows = await ctx.db
      .query("workflows")
      .withIndex("by_active_next_run", (q) =>
        q.eq("isActive", true).lte("nextRunAt", now)
      )
      .take(SCHEDULER_BATCH_SIZE);
    let queuedRuns = 0;
    let disabledSchedules = 0;

    for (const workflow of dueWorkflows) {
      if (!workflowUsesSchedule(workflow)) {
        disabledSchedules += 1;
        await ctx.db.patch(workflow._id, {
          nextRunAt: undefined,
          updatedAt: now,
        });
        continue;
      }

      const runCount = runsPerScheduledExecution(workflow);
      for (let index = 0; index < runCount; index += 1) {
        await createWorkflowRun(ctx, {
          userId: workflow.userId,
          workflow,
          trigger: "schedule",
          scheduledFor: workflow.nextRunAt ?? now,
        });
        queuedRuns += 1;
      }

      await ctx.db.patch(workflow._id, {
        nextRunAt: nextRunAfterDueWorkflow(workflow, now),
        updatedAt: now,
      });
    }

    return {
      checkedAt: now,
      dueWorkflowCount: dueWorkflows.length,
      queuedRuns,
      disabledSchedules,
    };
  },
});
