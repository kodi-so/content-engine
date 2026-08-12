import type { Doc } from "../_generated/dataModel";

type DailyCadence = { kind: "daily"; times: Array<{ hour: number; minute: number }> };
type WeeklyCadence = {
  kind: "weekly";
  slots: Array<{ dayOfWeek: number; hour: number; minute: number }>;
};

export const DEFAULT_ACCOUNT_TIMEZONE = "America/Chicago";
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const weekdayIndexes: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function localTimeFormatter(timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function localTimeParts(timestamp: number, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    dayOfWeek: weekdayIndexes[value("weekday")] ?? 0,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function normalizedDailyTimes(cadence: DailyCadence) {
  return cadence.times.map((time) => ({
    hour: Math.max(0, Math.min(23, Math.floor(time.hour))),
    minute: Math.max(0, Math.min(59, Math.floor(time.minute))),
  }));
}

function normalizedWeeklySlots(cadence: WeeklyCadence) {
  return cadence.slots.map((slot) => ({
    dayOfWeek: Math.max(0, Math.min(6, Math.floor(slot.dayOfWeek))),
    hour: Math.max(0, Math.min(23, Math.floor(slot.hour))),
    minute: Math.max(0, Math.min(59, Math.floor(slot.minute))),
  }));
}

function nextCadenceTime(account: Doc<"socialAccounts">, after: number) {
  if (account.autopilotStatus !== "active" || !account.autopilot) return undefined;
  const timezone = account.autopilot.timezone || DEFAULT_ACCOUNT_TIMEZONE;
  const cadence = account.autopilot.cadence;
  const formatter = localTimeFormatter(timezone);
  const start = Math.ceil((after + MINUTE_MS) / MINUTE_MS) * MINUTE_MS;
  const maxMinutes = cadence.kind === "weekly" ? 8 * 24 * 60 : 2 * 24 * 60;
  const dailyTimes = cadence.kind === "daily" ? normalizedDailyTimes(cadence) : [];
  const weeklySlots = cadence.kind === "weekly" ? normalizedWeeklySlots(cadence) : [];

  for (let offset = 0; offset <= maxMinutes; offset += 1) {
    const candidate = start + offset * MINUTE_MS;
    const local = localTimeParts(candidate, formatter);
    const matches = cadence.kind === "daily"
      ? dailyTimes.some((time) => time.hour === local.hour && time.minute === local.minute)
      : weeklySlots.some((slot) =>
          slot.dayOfWeek === local.dayOfWeek &&
          slot.hour === local.hour &&
          slot.minute === local.minute
        );
    if (matches) return candidate;
  }

  return start + (cadence.kind === "weekly" ? 7 * DAY_MS : DAY_MS);
}

export function nextAutopilotRunAt(account: Doc<"socialAccounts">, from = Date.now()) {
  return nextCadenceTime(account, from);
}

export function nextAutopilotRunAfterDue(account: Doc<"socialAccounts">, now: number) {
  let nextRunAt = nextCadenceTime(
    account,
    account.nextAutopilotRunAt && account.nextAutopilotRunAt > 0
      ? account.nextAutopilotRunAt
      : now
  );
  while (nextRunAt !== undefined && nextRunAt <= now) {
    nextRunAt = nextCadenceTime(account, nextRunAt);
  }
  return nextRunAt;
}
