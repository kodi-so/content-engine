# Scheduled Workflows

Scheduled execution is driven by the workflow's Runner node configuration, not a
separate form-only scheduling surface.

## Runner Configuration

The Runner node supports:

- `trigger`: set to `schedule` for scheduled execution.
- `scheduleType`: `interval`, `daily`, or `weekly`.
- `intervalHours`: used when `scheduleType` is `interval`.
- `scheduleDayOfWeek`: used when `scheduleType` is `weekly`, with `0` as Sunday
  and `1` as Monday.
- `scheduleHour`: local hour from `0` to `23` for daily/weekly schedules.
- `scheduleMinute`: local minute from `0` to `59` for daily/weekly schedules.
- `timezone`: IANA timezone name, defaulting to `America/Chicago`.
- `runsPerExecution`: number of runs to enqueue for each scheduled execution,
  capped at 10.

The legacy workflow-level `scheduleConfig.postingTimes` is still respected by
the scheduler when present, but the canvas Runner node is the future-facing
source of truth.

## Activation

Workflows do not run just because a schedule is configured. A scheduled workflow
must be activated from the workflow canvas.

Activation sets `isActive` and computes `nextRunAt`. Pausing clears `nextRunAt`.
Saving graph changes on an active workflow recomputes `nextRunAt`, which keeps
Runner schedule edits reflected in the operational schedule.

## Cron Execution

`convex/system/crons.ts` runs `internal.workflows.scheduling.runDueWorkflows`
every five minutes.

The scheduler:

1. Finds active workflows whose `nextRunAt` is due.
2. Verifies the workflow still uses a scheduled Runner trigger.
3. Creates one or more queued runs using the shared run creation helper.
4. Marks those runs with `trigger: "schedule"` and `scheduledFor`.
5. Advances `nextRunAt`.

Manual runs continue to use the existing manual run path.
