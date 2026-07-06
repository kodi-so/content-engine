# Handoff: Automations screen — full UI design spec

The current `src/pages/AutomationsPage.tsx` is a first pass with real functional gaps.
This spec defines exactly what the screen offers. Backend mutations/queries mostly exist
(`convex/automations/automations.ts`); gaps that need new backend work are called out in
the last section.

## Defects in the current implementation (fix all)

1. **No social account picker.** `saveAutomation` silently binds
   `(accounts ?? []).slice(0, 1)` — the first account in the workspace
   (`AutomationsPage.tsx` line 106). An automation is *for* an account; this must be an
   explicit control.
2. **Schedule is a single day + a raw text "Hour" field**, and the timezone is hardcoded
   to `"America/Chicago"` on save (line 112) while display formatting reads the stored
   timezone. The schema supports multiple `postingTimes` (day/hour/minute) + timezone.
3. **Budget is not surfaced** even though `budget.maxUsdPerRun/maxUsdPerMonth` exists in
   the schema and mutations.
4. **Generation defaults are incomplete**: no `aspectRatio` (schema has it), and the
   resolution select hardcodes `["1K","2K","4K"]` instead of deriving values from the
   selected image model's roster `options` (hide when the model has no resolution
   option).
5. **No run history detail**: the list shows bare status chips; there is no topic, cost,
   date, link to the Create thread, or link to the published post anywhere.
6. **No approval queue.** `awaiting_approval` runs are the entire point of
   `require_approval` mode and there is no way to review/approve/reject from this screen.
7. **No next-run display, no "Run now"** (essential for testing an automation without
   waiting for the schedule), **no delete**.
8. **"Manage in chat" loses the automation identity**: it sends only the name + brief as
   prose and hardcodes `checkpointMode: "debug"`. The message should carry the
   automation id so `automation.update` targets it deterministically.
9. Saving a selected automation always overwrites the schedule with the single day/hour
   fields — editing an automation that had multiple posting times would destroy them.

## Screen layout

Two-column layout (keep the current shell): **left rail = automation list**, **right =
detail**. The detail area is organized as sections in one scrollable form, in this
order: header, Content, Accounts & publishing, Schedule, Generation defaults,
Guardrails, Runs & approvals. On `New`, only header + the first five sections show
(Runs & approvals appears once the automation exists).

## Left rail — automation list

Each card shows:
- **Name** + **Active/Paused** badge.
- **Schedule summary** in human form: `"Mon/Wed/Fri · 9:00 AM CT"` (all posting times'
  days, then the times; if times differ per day, `"Mon 9:00, Fri 5:00 PM CT"`).
- **Next run**: `"Next: Wed 9:00 AM"` from `nextRunAt` (omit when paused).
- **Last 3 run chips**, colored by status (published=green, failed=red,
  awaiting_approval=amber, else neutral) — clicking a chip selects the automation *and*
  scrolls to Runs & approvals.
- **Attention badge**: amber dot + count when any run is `awaiting_approval`.

Rail header: title + `New` button (resets the form to a draft). Empty state: one
sentence plus a "Create your first automation" button and a secondary "Ask the agent to
set one up" button that opens Create chat with a seeded prompt.

## Detail header

- **Title** = automation name (or "New automation").
- **Status pill**: Active / Paused / Draft (unsaved).
- Actions (right-aligned):
  - **Activate/Pause** toggle button (existing `setActive` mutation). Disabled with a
    tooltip until the automation has ≥1 account and ≥1 posting time.
  - **Run now** — triggers one immediate run outside the schedule (new backend action;
    see gaps). Confirm dialog states the estimated behavior: "Picks a topic and creates
    one post now. Approval mode still applies."
  - **Manage in chat** — opens Create chat seeded with a message that includes the
    automation id token (e.g. `Manage automation automation:<id> ("<name>")`) so the
    agent's `automation.update` calls target it. Do not force debug checkpoint mode.
  - **Delete** — destructive, confirm dialog, cascades to nothing (runs are kept for
    history but orphan-marked, or deleted — pick one and be consistent; simplest:
    delete runs too).

## Section: Content

- **Name** — text input, required.
- **Brief** — textarea (7+ rows), required. Helper text: "Audience, voice, themes,
  guardrails, output style. The agent reads this every run."
- **Pillars** — chip input: type + Enter adds a chip, × removes. Stored as `string[]`.
  Placeholder: "ab exercises, posture tips, myth-busting". At least one recommended but
  not required (topic picker falls back to the brief).
- **Format mix** — text input with placeholder "mostly slideshows, occasional video".

## Section: Accounts & publishing

- **Social accounts** — multi-select of the workspace's connected accounts, each option
  showing platform icon + handle. Required to activate. (Backend already stores
  `socialAccountIds: v.array(...)`.)
- **Approval mode** — segmented control, two options with descriptions:
  - *Require approval*: "Runs stop at a draft post. You approve from this screen."
  - *Auto publish*: "Posts go out without review." Show a subtle warning row when
    selected.

## Section: Schedule

- **Timezone** — searchable select of IANA timezones, defaulting to the browser
  timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), never hardcoded.
- **Posting times** — editable list; each row = **Day** select (Mon–Sun) + **Time**
  input (native `<input type="time">`, stores hour+minute) + remove button. "Add time"
  button appends a row. Minimum 1 row to activate.
- **Next run preview** — computed line under the list: "Next run: Wednesday, Jul 8,
  9:00 AM CT" (reuse the scheduling module's next-run computation via a small query, or
  duplicate the pure function client-side — it lives in shared code).

## Section: Generation defaults

One line of helper text: "Overrides workspace defaults for this automation's runs. The
agent can still deviate when a specific request calls for it."

- **Aspect ratio** — select: `Default (9:16)`, `9:16`, `4:5`, `1:1`, `16:9`.
- **Image model** — select: "Workspace default" + image roster models (existing).
- **Image resolution** — select whose options come from the *effective* image model's
  roster `options.resolution.values` (effective = automation override if set, else the
  workspace's default image model). Include a "Workspace default" empty option. Hide the
  control when the effective model has no resolution option.
- **Video model** — select: "Workspace default" + video roster models (existing).

## Section: Guardrails

- **Max cost per run (USD)** — number input, optional, placeholder "e.g. 2.00". Helper:
  "A run stops and fails when it exceeds this."
- **Max cost per month (USD)** — number input, optional. Helper: "Runs are skipped once
  this month's automation spend reaches this."
- **Month-to-date spend** — read-only line computed from this automation's runs in the
  current calendar month.

## Section: Runs & approvals (existing automations only)

- **Pending approvals block** (only when non-empty, pinned on top, amber-tinted): one
  card per `awaiting_approval` run — topic, date, media thumbnail(s) from the
  distribution plan's artifacts, caption preview, and three actions:
  - **Approve & publish** → calls the existing `distributionPlans.publish` path and
    advances the run to published.
  - **Open in chat** → opens the run's Create thread for revisions.
  - **Reject** → marks the run failed/skipped with reason "rejected"; plan is removed
    or left in draft (pick one; removing is cleaner).
- **Run history table**: newest first, columns — Date, Topic (+ pillar as muted
  subtext), Status chip, Cost (`$0.43`), Links (→ Create thread, → published post URL
  when available via the plan's `externalPostIds`). 10 per page with "Load more".
- Failed runs show `errorMessage` on an expandable row.

## Save behavior

- Single **Save** button (existing pattern is fine). Save must round-trip *all* fields —
  in particular the full `postingTimes` array and timezone (defect 9), all
  `generationDefaults`, and `budget`.
- Dirty-state indicator ("Unsaved changes") when the form diverges from the loaded
  automation; switching list selection with dirty state asks to confirm discard.

## Backend gaps to implement alongside

1. **`automations.runNow`** mutation/action: inserts a run + schedules the run pipeline
   for one immediate execution, bypassing `nextRunAt` (do not mutate the schedule).
2. **`automations.remove`** mutation (+ chosen run cascade).
3. **Runs query**: `automationRuns.listForAutomation(automationId, paginated)` joining
   enough plan/thread data for the table (thread id, plan status, artifact thumbnails,
   external post ids). The current `list` query's `recentRuns` (last 3) stays for rail
   chips.
4. **Approve/Reject** endpoints for `awaiting_approval` runs wiring to the existing
   distribution-plan publish path.
5. **Month-to-date spend**: cheap aggregate query over this automation's runs since the
   1st of the month.

## Acceptance criteria

- Creating an automation requires explicitly choosing account(s); nothing is silently
  defaulted.
- An automation with posting times Mon 9:00 + Fri 17:00 in America/New_York survives a
  load→save round trip unchanged.
- "Run now" on a paused automation executes one run and does not change `nextRunAt` or
  `isActive`.
- A `require_approval` run appears in Pending approvals with media preview; Approve
  publishes it and the history row gains the external post link.
- Budget fields persist and the month-to-date line matches the sum of run costs.
- The resolution select shows only values the effective image model supports.
