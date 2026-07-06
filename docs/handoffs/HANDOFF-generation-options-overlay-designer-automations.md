# Handoff: Generation options + resolution cascade, shared overlay designer, workflows → automations pivot

This document covers three workstreams. They are independent enough to land as separate
PR-sized chunks, but implement them **in order A → B → C**: A is small and C consumes A's
resolution cascade. Each workstream leaves the app working and shippable.

There are no external users. The only data in Convex is the developer's own. **No
backwards compatibility, no legacy shims, no deprecated-but-kept code.** When something is
replaced, delete the old thing entirely.

---

# Workstream A — Model capability options + resolution cascade

## Problem

1. **Resolution is invisible and deployment-global.** For fal image models it comes from
   the env var `CONTENT_ENGINE_IMAGE_RESOLUTION` with a hardcoded fallback
   `DEFAULT_FAL_IMAGE_RESOLUTION = "2K"` (`convex/providers/fal/payloads.ts` lines 14 and
   243–245). No UI exposes it — not the Create tab, not settings, not the agent tools.
   GPT Image 2 has `quality: "high"` hardcoded (`payloads.ts` ~line 229). Video
   resolution tiers (PixVerse up to 1080p, Veo 4K) are never set; provider defaults win.
2. **Model-specific optional API fields are unreachable.** NanoBanana Pro has a web-search
   toggle, thinking levels, etc. The only path is the raw `metadata.arguments`
   passthrough (`providerArgumentOverrides` in `payloads.ts`), which nothing populates
   from the agent tools or the Create tab.
3. **The agent has no guidance on resolution/quality**, so it can neither honor "make it
   4K" reliably nor economize by default.

## Architecture principle

**Extend the model-roster pattern; do not invent a parallel one.** The roster
(`src/lib/generation/modelRoster.ts`) is already the single source of truth for
durations, aspect ratios, reference limits, and pricing. Model-specific options become
one more typed capability map on `RosterModel`, feeding: (a) planner model cards,
(b) runtime validation + defaults, (c) capability-driven Create-tab controls,
(d) the settings UI.

Three tiers of exposure:

- **Universal fields** (prompt, aspectRatio, count, durationSeconds) — stay first-class
  tool-schema fields and form fields. No change.
- **Common quality knobs** (resolution, quality) — typed roster options, exposed in the
  Create tab, settable by the agent, defaulted by the cascade below.
- **Long tail** (web search, safety tolerance, thinking level) — typed roster options
  with defaults, settable by the agent when the user asks, **no dedicated UI** (at most
  an "Advanced" disclosure in the Create tab).

**Resolution default cascade (precedence, highest first):**

1. Explicit per-request value (user typed "4K" / agent set `options.resolution`)
2. Automation `generationDefaults.imageResolution` (added in Workstream C)
3. Workspace `aiGenerationSettings.imageResolution` (new)
4. Roster option default for the selected model

The env var `CONTENT_ENGINE_IMAGE_RESOLUTION` is **deleted**, not deprecated.

## Phase A1 — Roster `options` capability map

In `src/lib/generation/modelRoster.ts`:

```ts
export type RosterModelOptionKey = "resolution" | "quality" | "webSearch";

export type RosterModelOption =
  | {
      kind: "enum";
      payloadKey: string;          // exact provider payload field, e.g. "resolution"
      values: string[];
      default: string;
      label: string;               // UI label
      costNote?: string;           // e.g. "4K roughly doubles cost"
      exposure: "standard" | "advanced";
    }
  | {
      kind: "boolean";
      payloadKey: string;
      default: boolean;
      label: string;
      costNote?: string;
      exposure: "standard" | "advanced";
    };

export type RosterModel = {
  // ...existing fields...
  options?: Partial<Record<RosterModelOptionKey, RosterModelOption>>;
};
```

Populate per model. **Verify every `payloadKey` and value list against the fal model page
for that endpoint before committing — do not trust this table blindly:**

| Roster model | Option | Expected shape (verify) |
|---|---|---|
| `nano-banana-2`, `nano-banana-pro` | `resolution` | enum `["1K","2K","4K"]`, payloadKey `resolution`, default `"2K"`, exposure standard |
| `nano-banana-2`, `nano-banana-pro` | `webSearch` | boolean, default false, exposure advanced (verify exact payload key on the fal endpoint) |
| `gpt-image-2` | `quality` | enum (likely `["low","medium","high"]`), payloadKey `quality`, default `"high"`, exposure standard |
| `pixverse-v6` | `resolution` | enum resolution tiers up to 1080p, exposure standard (verify values) |
| `veo-3-1` | `resolution` | enum incl. 1080p/4K tiers if the endpoint supports it (verify; skip if not) |

Models without a given option simply omit it. Add a helper:

```ts
export function rosterOptionsForModel(model: RosterModel): Partial<Record<RosterModelOptionKey, RosterModelOption>>;
export function normalizeRosterOptionValue(option: RosterModelOption, value: unknown): string | boolean | undefined;
// normalize = validate against values/type; return undefined for invalid input (caller falls back to cascade)
```

Include `options` in `modelCardsForPlanner()` output so the planner sees what each model
supports, including `costNote`s.

## Phase A2 — Workspace setting + cascade resolution

1. **Validator/schema**: add `imageResolution: v.optional(v.string())` to the
   `aiGenerationSettings` validator (find it in `convex/validators.ts`; it is referenced
   from `convex/schema.ts` line ~87). Allowed values `"1K" | "2K" | "4K"`.
2. **`src/lib/providers/aiGenerationDefaults.ts`**: add `imageResolution` to
   `AiGenerationSettings`, `DEFAULT_AI_GENERATION_SETTINGS` (default `"2K"`), and
   `resolveAiGenerationSettings`.
3. **Settings UI** (`src/features/settings/AiProvidersSettingsSection.tsx`): add a
   resolution select next to the image model select. Only show values the currently
   selected image model supports (from roster options); if the model has no resolution
   option, hide the control.
4. **Cascade implementation**: the generation request pipeline
   (`convex/create/execution/mediaGenerationExecution.ts` →
   `contentRequests.generation` → `convex/content/requestExecution/*` → provider) must
   carry a resolved `options` record. Concretely:
   - Add `options: v.optional(v.record(v.string(), v.union(v.string(), v.boolean())))`
     to the `generation` object validator on `contentRequests` (find the validator in
     `convex/validators.ts`).
   - In `createGenerationRequestForToolCall` (`mediaGenerationExecution.ts`): read
     `input.options`, validate each key via `normalizeRosterOptionValue` against the
     resolved model's roster options, drop invalid/unknown keys, then fill missing
     `resolution` from workspace settings (automation default slots in here in
     Workstream C). Persist the resolved record on `generation.options` and echo it in
     the tool-call `output` for the work-log UI.
   - Extend `GenerateImageInput` / `GenerateVideoInput` (`convex/providers/model.ts`)
     with `options?: Record<string, string | boolean>`. Trace
     `convex/content/requestExecution/requestExecutionHelpers.ts` to pass
     `generation.options` through to the provider input.
   - In `falImagePayload` / `falVideoPayload` (`convex/providers/fal/payloads.ts`): map
     each option through its roster `payloadKey` via `addIfDefined`. Delete the
     `process.env.CONTENT_ENGINE_IMAGE_RESOLUTION` read and
     `DEFAULT_FAL_IMAGE_RESOLUTION`; the resolution the payload uses is
     `input.options.resolution` falling back to the roster default for that model.
     Remove the hardcoded `quality: "high"` for gpt-image-2 in favor of the same
     mechanism. Keep `providerArgumentOverrides` (`metadata.arguments`) as the final
     spread — it remains the raw escape hatch and wins over typed options.

## Phase A3 — Agent tool surface

In `convex/create/tools/registry.ts`, add to `media.generateImage` and
`media.generateVideo` input schemas:

```ts
options: looseObjectSchema(
  "Optional model-specific options such as resolution or quality. Keys and allowed values come from the selected model's card. Omit for workspace defaults."
),
```

Planner guidance (append to the `model_selection` module in
`convex/create/agent/agentPromptModules.ts`):

- "Model cards list per-model options (resolution, quality, web search) with allowed
  values and cost notes. Set input.options only when the user's intent calls for it;
  otherwise omit it and workspace defaults apply."
- "Default resolution follows workspace settings. Choose 4K only when the user asks for
  print, poster, zoom/crop headroom, or explicitly high resolution — note the cost
  difference. Never set 4K for ordinary social posts."
- "Enable web search style options only when the request depends on real-world, current,
  or factual visual references the model would otherwise not know."

## Phase A4 — Create tab capability-driven controls

The Create tab builds provider input from a config record
(`src/features/create/createSubmitPayload.ts`,
`src/lib/create/createGenerationConfig.ts`, fields rendered by
`src/features/create/CreateGenerationFields.tsx` /
`src/components/create/CreateGenerationConfigField.tsx`). Add:

- A generic "model options" section rendered from the selected model's roster options:
  enum options with `exposure: "standard"` render as selects (with costNote as helper
  text); `"advanced"` options go behind a collapsed "Advanced" disclosure.
- Selected values flow into the submitted provider input as the same `options` record
  used in A2 (add `options` to the allowed keys in `providerInputForGenerationSubmit`).
- Default state = cascade (workspace setting for resolution, roster defaults otherwise).

## Workstream A acceptance criteria

- No reference to `CONTENT_ENGINE_IMAGE_RESOLUTION` remains anywhere.
- Workspace settings shows a resolution default; changing it changes the fal payload for
  the next agent-generated image (verify in provider logs / request record).
- "Make me a 4K poster of X" through agent chat produces a fal request with
  `resolution: "4K"`; a plain "make me an image of X" uses the workspace default.
- Invalid option values from the planner (e.g. `resolution: "8K"`) are dropped and the
  cascade default is used; the run does not fail.
- Create tab shows resolution/quality selects for models that support them and hides
  them otherwise.

---

# Workstream B — Shared overlay layout designer

## Problem

The overlay **data model** is already unified — `MediaTextOverlayBlock` /
`TimedMediaTextOverlayBlock` in `convex/lib/mediaTextOverlays.ts`, shared by slideshows
and Studio video projects, editable afterwards via the `mediaOverlay.updateText` tool.
What is not unified is the **design intelligence**:

- **Slideshows**: the LLM planner (`convex/content/planningPrompts.ts`) emits per-slide
  `textBlocks` with concrete geometry (x/y/width/height percentages, fontSize,
  fontWeight, colors, stroke) which `convex/content/planning.ts` clamps (fontSize
  28–128, x 0–88, y 0–92, …). The planner is guessing pixel percentages in prose.
- **Studio videos**: `buildStudioTextOverlaysFromInput`
  (`convex/create/studio/studioComposition.ts`) is crude: if the planner didn't pass
  structured overlays, it scrapes quoted strings from the brief, slots the first at the
  top / last at y=76 / rest mid-frame (`defaultOverlayFrame`), fixed font sizes (68/46),
  and distributes timing evenly across the video regardless of clip boundaries.
- Neither path knows about platform safe areas (TikTok/Reels UI chrome).

## Architecture principle (agreed design)

**Content and layout *intent* are creatively coupled; concrete geometry is not.**

- The **slideshow planner keeps owning**, in one pass with the image prompts: the copy,
  the number of blocks, each block's semantic zone (top/center/bottom), emphasis, and
  contrast/scrim strategy — because background prompts must reserve negative space where
  text sits. It **stops emitting** concrete x/y/width/height/fontSize/fontWeight/stroke.
- A new **shared, deterministic layout designer** converts semantic intent → concrete
  `MediaTextOverlayBlock`s for both slideshows and video. Deterministic-first: text
  measurement, hierarchy scale, safe areas, and stacking are computable; the LLM only
  supplies intent. No new LLM call is introduced.
- The existing clamps in `mediaTextOverlays.ts` stay as the final safety net.
- Explicit geometry always wins: blocks that already carry user-set or
  explicitly-provided x/y/fontSize (e.g. from slideshow editor edits via
  `convex/content/slideshow/slideshowRequestEditing.ts`, or `mediaOverlay.updateText`
  patches) pass through untouched.

## Phase B1 — The designer module

New file `convex/lib/overlayLayoutDesigner.ts` (pure functions, no ctx, unit-testable):

```ts
export type OverlayZone = "top" | "center" | "bottom";

export type OverlayDesignBlockIntent = {
  id?: string;
  role: MediaTextOverlayRole;              // eyebrow | headline | body | bullet_list | cta
  text: string;
  emphasis?: MediaTextOverlayEmphasis;
  zone?: OverlayZone;                      // default by role: headline→center, eyebrow→top, cta/body→bottom
  align?: MediaTextOverlayAlign;
  // explicit geometry passthrough — if x/y/fontSize present, designer does not touch them
  x?: number; y?: number; width?: number; height?: number; fontSize?: number;
  // timing intent (video only)
  startSeconds?: number; endSeconds?: number; clipIndex?: number;
};

export type OverlayDesignRequest = {
  medium: "slideshow_slide" | "video";
  aspectRatio: string;                     // "9:16" | "4:5" | "1:1" | "16:9"
  blocks: OverlayDesignBlockIntent[];
  contrastStrategy?: "none" | "shadow" | "gradient_scrim" | "solid_scrim";
  applyPlatformSafeArea?: boolean;         // default true for 9:16 and 4:5
  totalDurationSeconds?: number;           // video only
  clipBoundariesSeconds?: number[];        // video only: cumulative clip end times
};

export function designOverlayBlocks(request: OverlayDesignRequest): MediaTextOverlayBlock[];
export function designTimedOverlayBlocks(request: OverlayDesignRequest): TimedMediaTextOverlayBlock[];
```

Deterministic rules (tune values during implementation, but start here):

- **Safe areas** (percent insets, applied when `applyPlatformSafeArea`): for 9:16 —
  top 10 (status bar/username), bottom 22 (caption + actions), right 14 (action rail),
  left 4. For 4:5 — top 8, bottom 12, right 8, left 4. Landscape/1:1 — 6 all around.
  All block frames are placed inside the safe rect.
- **Zone placement**: stack blocks assigned to the same zone vertically with a 3% gap,
  ordered eyebrow → headline → body → bullet_list → cta. `top` anchors at safe-top,
  `bottom` anchors so the stack ends at safe-bottom, `center` centers the stack
  vertically within the safe rect.
- **Font size**: base by role (headline 72, cta 60, body 44, bullet_list 40, eyebrow 32
  — matching current slideshow defaults), then scale down for long text: multiply by
  `clamp(sqrt(40 / max(text.length, 20)), 0.6, 1.0)` so a 120-char headline lands
  around 44 rather than overflowing. Width defaults to the full safe width; height from
  estimated line count (chars-per-line derived from fontSize and width).
- **Styling from contrast strategy**: `shadow`/default → white text, black stroke
  (strokeWidth 8 primary / 5 secondary — current studio values); `solid_scrim` →
  `backgroundStyle: "solid"` with black background at 0.55 opacity and strokeWidth 0;
  `gradient_scrim` → stroke like shadow (the scrim itself is baked into the background
  image by the slideshow pipeline, not the overlay).
- **Timing (video)**: if a block has explicit start/end, keep it. If it has `clipIndex`,
  align to that clip's boundary window from `clipBoundariesSeconds`. Otherwise
  distribute sequentially across clip windows (one block per clip while blocks remain,
  then even subdivision), minimum visible duration 1.5s, and a lone block spans the
  full duration.
- Run every produced block through `normalizeMediaTextOverlayBlock` /
  `normalizeTimedMediaTextOverlayBlock` before returning.

Add unit tests mirroring how existing pure convex libs are tested in `tests/` (follow
the pattern of the bundled e2e/unit tests under `tests/e2e/create/`; a plain node test
via `tests/support/runBundledTest.mjs` is fine).

## Phase B2 — Slideshow pipeline integration

1. **Planner prompt** (`convex/content/planningPrompts.ts`): change the textBlocks
   contract. Each block: `id`, `role`, `text`, `emphasis`, optional `align`, optional
   `zone` (top/center/bottom). Remove instructions asking for x/y/width/geometry and
   "large readable font sizes" — replace with: "Choose each block's zone so text sits
   over the negative space you reserved in backgroundPrompt; state that reserved space
   explicitly in backgroundPrompt."
2. **Validation** (`convex/content/planning.ts`): the per-block validator
   (`slides[i].textBlocks[j]`) now requires only role/text/emphasis and accepts optional
   zone/align; delete the required x/y/width/height/fontSize/fontWeight/stroke/color
   parsing (keep accepting them as optional passthrough so explicit geometry still
   validates).
3. **Concrete geometry**: where the plan becomes a canonical spec
   (`convex/content/slideshow/slideshowAdapter.ts` — `normalizeTextBlock` /
   `slideFromCopy` / `buildCanonicalSlideshowSpec`), call
   `designOverlayBlocks({ medium: "slideshow_slide", aspectRatio, blocks, contrastStrategy: slide.layout.contrast })`
   for blocks lacking explicit geometry. Delete the hand-rolled defaults in
   `normalizeTextBlock` (x=10, y=42/56, fontSize 72/46, …) — the designer replaces them.
4. **Editing paths** (`slideshowRequestEditing.ts`, `slideshowRequestMutations.ts`,
   `mediaOverlay.updateText` handler in `convex/create/studio/mediaOverlayEditing.ts`):
   no behavioral change — they operate on concrete blocks and must keep doing so.
   Verify user-edited geometry survives a re-render.

## Phase B3 — Studio video integration

1. In `buildStudioTextOverlaysFromInput` (`convex/create/studio/studioComposition.ts`):
   keep the two text sources (structured `textOverlays`/`overlays`/`captions` records,
   and the quoted-string fallback from brief/timeline) but replace `defaultOverlayFrame`,
   the fixed font sizes, and the even-time distribution with
   `designTimedOverlayBlocks`. Compute `clipBoundariesSeconds` from the same clip
   duration data `buildCreateAgentStudioDraft` already sums (cumulative ends of the
   clips array) and pass it in.
2. **Tool schema** (`studio.compose` in `convex/create/tools/registry.ts`): document the
   intent fields in the `textOverlays` description — each overlay record may carry
   `text`, `role`, `zone`, `clipIndex`, `startSeconds`/`endSeconds`. Add
   plannerGuidance: "When the user asks for text on a video, pass structured
   textOverlays with role and zone (and clipIndex or start/end when timing matters)
   instead of quoting text in the brief. To add text to an existing generated video, use
   studio.compose with that video artifact plus textOverlays, then studio.render."
3. This makes "generate a video, then put text over it" a first-class agent path; verify
   it end-to-end (see acceptance criteria).

## Workstream B acceptance criteria

- Unit tests for `overlayLayoutDesigner` cover: safe-area clamping per aspect ratio,
  zone stacking order, long-text font shrink, solid-scrim styling, clip-aligned timing,
  explicit-geometry passthrough.
- Slideshow planner no longer emits geometry; a rendered slideshow has all text inside
  the 9:16 safe area (bottom blocks end above the 22% caption zone).
- Agent flow "generate a 10s video of X, then overlay the title 'Y' at the top for the
  first 3 seconds" produces a Studio project whose overlay has zone=top geometry and
  endSeconds ≈ 3.
- `mediaOverlay.updateText` relative adjustments (deltaY etc.) still work on
  designer-produced blocks.
- `npm run test:e2e:create:slideshows` and the studio-composition e2e pass (update
  fixtures where they assert the old default geometry).

---

# Workstream C — Remove workflows entirely; build agent-managed Automations

## Problem / decision

The node-canvas Workflows tab is the wrong abstraction for this product. The user thinks
"post 4 slideshows a week about pilates, keep topics varied" — a brief + cadence +
guardrails, not a DAG. The agent already owns structure decisions, and maintaining a
second execution semantics (graph runner) competes with the agent runtime forever.
Decision: **delete the entire workflow system — schema, runtime, canvas UI, agent tool —
and replace it with an Automation entity whose runs are ordinary Create agent threads.**
The thing that makes account automation work is **variation with memory** (topic pillars
+ a ledger of what was posted), which is agent state, not graph topology.

Key facts about the current system:

- Tables: `workflows`, `workflowRuns`, `workflowRunEvents`, `workflowRunNodeStates`
  (`convex/schema.ts` lines 253, 400, 426, 441); optional `workflowId`/`workflowRunId`
  columns on `artifacts`, `slideshows`, `distributionPlans`, `postMetrics`.
- Backend: `convex/workflows/**` (definitions, runner, runs, runCreation, inputResolver,
  scheduling, agentPresets, postCompilerPresets, `handlers/**`, `runtime/**`).
- Scheduling: `convex/workflows/scheduling.ts` computes interval/daily/weekly next-run
  times with posting times + timezones; `runDueWorkflows` is registered as a cron in
  `convex/system/crons.ts`.
- Publishing is **already independent**: `convex/publishing/distributionPlans.ts` has a
  standalone `publish` action (line ~273) that calls the provider
  (`publishNow`/scheduled) — the workflow `auto_post` node is just one caller.
- Frontend: `src/features/workflow-canvas/`, `src/components/workflow/` (canvas board,
  palette, inspector, execution panel, …), `src/pages/WorkflowCanvasPage.tsx`,
  `src/hooks/workflow/`, `src/lib/workflow/` (graph types — note
  `WorkflowProviderName` is imported by non-workflow code like
  `src/lib/providers/aiGenerationDefaults.ts`), library browser
  (`src/features/library/LibraryWorkflowBrowser.tsx`), Create-tab drafts panel
  (`src/features/create/RecentWorkflowDrafts.tsx`).
- Agent integration: `workflow.createDraft` tool (`convex/create/tools/registry.ts`),
  `convex/create/workflowExport.ts`,
  `convex/create/agent/agentWorkflowDraftActions.ts`, "Save as Workflow" in
  `src/features/agent-create/components/FinalReviewActions.tsx`, and the e2e test
  `tests/e2e/create/agent/workflow-export.e2e.ts` wired into `package.json`.
- The `prompt_variation` agent preset (`convex/workflows/agentPresets.ts`) is the seed
  of the topic-variation idea — the concept survives as the automation topic picker;
  the preset file does not.

## Phase C0 — Extract survivors (before any deletion)

1. **Scheduling engine** → new `convex/automations/scheduling.ts`. Port the pure
   next-run computation from `convex/workflows/scheduling.ts`
   (`scheduleType`, posting-times/day-of-week/hour/minute handling, timezone handling,
   `nextScheduledRunAtAfter`, the catch-up loop) generalized to read from the new
   `automations` table. Port `scheduleConfigValidator` (and the approval-policy
   validator if reusable) from `convex/validators.ts` into automation-named validators.
   Re-point the cron in `convex/system/crons.ts` from
   `internal.workflows.scheduling.runDueWorkflows` to
   `internal.automations.scheduling.runDueAutomations`.
2. **Provider-name types**: `WorkflowProviderName` and any other types in
   `src/lib/workflow/workflowGraph.ts` that non-workflow code imports (check
   `aiGenerationDefaults.ts`, publishing routing, generation ops) move to a neutral
   module, e.g. `src/lib/providers/providerNames.ts`, renamed without the "Workflow"
   prefix (`GenerationProviderName`). Delete
   `generationModeForWorkflowNode` / `generationDefaultForWorkflowNode` from
   `aiGenerationDefaults.ts` — nothing will call them.
3. Audit `convex/providers/falModelCatalog.ts` + the `providerModels` table: per the
   model-intelligence handoff they only feed the workflow-builder UI. If nothing else
   reads them after canvas deletion, delete the module, the scrape pipeline, and the
   table too.

## Phase C1 — Schema: `automations` + `automationRuns`

```ts
automations: defineTable({
  userId: v.string(),
  workspaceId: v.optional(v.id("workspaces")),
  socialAccountIds: v.array(v.id("socialAccounts")),
  name: v.string(),
  // conversational surface — the agent edits these
  brief: v.string(),                        // theme, voice, audience, do/don't — freeform NL
  pillars: v.array(v.string()),             // content pillars, e.g. ["ab exercises", "posture tips"]
  formatMix: v.optional(v.string()),        // e.g. "mostly slideshows, occasional video"
  // structured config
  scheduleConfig: automationScheduleValidator,   // ported from workflow scheduleConfig
  approvalMode: v.union(v.literal("auto_publish"), v.literal("require_approval")),
  generationDefaults: v.optional(v.object({
    imageResolution: v.optional(v.string()),     // overrides workspace (Workstream A cascade slot 2)
    aspectRatio: v.optional(v.string()),
    imageModel: v.optional(v.string()),
    videoModel: v.optional(v.string()),
  })),
  budget: v.optional(v.object({
    maxUsdPerRun: v.optional(v.number()),
    maxUsdPerMonth: v.optional(v.number()),
  })),
  isActive: v.boolean(),
  nextRunAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_workspace", ["workspaceId"])
  .index("by_active_next_run", ["isActive", "nextRunAt"]),

automationRuns: defineTable({
  automationId: v.id("automations"),
  userId: v.string(),
  workspaceId: v.optional(v.id("workspaces")),
  createThreadId: v.optional(v.id("createThreads")),
  topic: v.string(),                        // the chosen angle — this IS the topic ledger
  pillar: v.optional(v.string()),
  status: v.union(
    v.literal("picking_topic"), v.literal("generating"),
    v.literal("awaiting_approval"), v.literal("publishing"),
    v.literal("published"), v.literal("failed"), v.literal("skipped")
  ),
  distributionPlanId: v.optional(v.id("distributionPlans")),
  costUsd: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_automation", ["automationId"])
  .index("by_automation_started", ["automationId", "startedAt"])
  .index("by_status", ["status"]),
```

On `artifacts` and `distributionPlans`, replace the deleted
`workflowId`/`workflowRunId` columns with optional `automationId`/`automationRunId`
(keep `postMetrics` linkable through `distributionPlanId`, which already exists).

## Phase C2 — Run pipeline

`runDueAutomations` (cron, every few minutes) → for each active automation with
`nextRunAt <= now`: advance `nextRunAt` (same catch-up semantics as the old scheduler),
insert an `automationRuns` row, and schedule the run action. The run action:

1. **Topic picker** — one LLM call (reuse the text-generation provider plumbing used by
   `text.generate`): input = brief + pillars + formatMix + the last ~20 `topic` values
   from `automationRuns` for this automation (the ledger). Output (strict JSON) =
   `{ pillar, topic, angle, contentBrief }` where `contentBrief` is a concrete
   one-paragraph brief for a single post ("Create a slideshow: 5 pilates moves that fix
   desk posture — hook: …"). Instruction: must not repeat or closely paraphrase any
   ledger topic. This is the successor of the old `prompt_variation` preset concept.
2. **Seed a Create thread** — create a `createThreads` row with a new
   `origin: "automation"` field (add to schema; default "user" elsewhere) +
   `automationRunId`, checkpoint mode off, and post the `contentBrief` as the user
   message. The agent then runs the existing tool loop unchanged — slideshow.render /
   media.* / studio.* — which is the whole point: an automation run is debuggable as a
   normal agent conversation.
3. **Unattended execution policy** — the agent runtime must not stall on human gates for
   automation-origin threads: checkpoints disabled, and confirmation-required tools
   (`publishing.prepare` has `confirmation.required: true`, `artifact.export` too) are
   auto-confirmed **only** for automation threads. Gate publishing on `approvalMode`
   instead: `auto_publish` → create the distribution plan and call
   `publishing.distributionPlans.publish` (or schedule it for the configured posting
   time); `require_approval` → leave the plan in draft status, mark the run
   `awaiting_approval`, surface it in the Automations UI (approving publishes via the
   existing plan actions).
4. **Guardrails** — accumulate tool-call `costUsd` on the run; if `maxUsdPerRun` is
   exceeded mid-run, stop and mark failed with the reason. Check `maxUsdPerMonth`
   (sum of the automation's runs this calendar month) before starting; skip the run
   (status "skipped") when exhausted. Hard-cap agent loop iterations per run.
5. **Generation defaults** — thread the automation's `generationDefaults` into the
   Workstream A cascade in `createGenerationRequestForToolCall` (slot 2, between
   explicit input and workspace settings) and into the aspect-ratio/model defaults the
   same way (automation default model wins over workspace default, explicit planner
   choice wins over both).

## Phase C3 — Agent tools for managing automations

Replace `workflow.createDraft` with automation tools in
`convex/create/tools/registry.ts` (same `agentRuntimeTool` pattern):

- `automation.create` — input: name, brief, pillars, schedule (structured), approvalMode,
  socialAccountIds, optional generationDefaults/budget. Confirmation required
  (risk: low). Created **inactive**; activation is an explicit user action.
- `automation.update` — patch fields by automation id or name; this is how "lean more
  into ab-focused content" or "post 5x per week instead" works conversationally.
- `automation.list` — descriptors for planner context (name, schedule summary, isActive,
  last run topic/status).

Planner guidance: "When the user wants recurring/scheduled/autopilot posting, propose an
automation: draft the brief and pillars from the conversation, confirm the schedule and
approval mode, then call automation.create. When the user references an existing
automation, use automation.update rather than creating a new one." Also: "To turn the
current conversation's output style into a recurring series, create an automation whose
brief describes what was just made" — this replaces the old save-as-workflow affordance
in `FinalReviewActions.tsx` (swap the button to "Turn into automation", which sends that
prompt to the agent).

## Phase C4 — UI: Automations tab

Replace the Workflows nav entry (`src/app/navigation.ts`, routes in `src/App.tsx`) with
an Automations page:

- **List**: card per automation — name, human schedule summary ("Mon/Wed/Fri 9:00 CT"),
  isActive toggle (pause/resume), last 3 runs with status chips, next run time.
- **Detail**: brief (editable textarea), pillars (editable chips), schedule editor
  (reuse the posting-times UI patterns from the old workflow scheduling config if any
  are worth salvaging; otherwise simple selects), approval mode, generation defaults
  (aspect ratio, resolution, models — same roster-driven selects as settings), budget
  fields, run history (topic, status, cost, link to the Create thread and the published
  post), and pending-approval queue when approvalMode is require_approval.
- **"Manage in chat"** button that opens the Create agent with the automation referenced.

No canvas, no nodes, no graph anywhere.

## Phase C5 — Deletion checklist

Data first: wipe all rows from `workflows`, `workflowRuns`, `workflowRunEvents`,
`workflowRunNodeStates` (dashboard or a one-off internal mutation run via
`npx convex run`) **before** removing the table definitions, then delete in this order:

**Backend**
- [ ] `convex/workflows/` — entire directory
- [ ] `convex/create/workflowExport.ts`
- [ ] `convex/create/agent/agentWorkflowDraftActions.ts`
- [ ] `workflow.createDraft` tool from `convex/create/tools/registry.ts` (+ its
      handling in `agentToolPlanning.ts` / `toolExecution.ts` if special-cased)
- [ ] Workflow validators from `convex/validators.ts` (`workflowGraphValidator`,
      trigger/policy validators not ported in C0)
- [ ] Tables `workflows`, `workflowRuns`, `workflowRunEvents`, `workflowRunNodeStates`
      from `convex/schema.ts`; `workflowId`/`workflowRunId` columns from `artifacts`,
      `slideshows`, `distributionPlans`, `postMetrics`, and anywhere else
      `v.id("workflows")` appears
- [ ] Workflow references in `convex/mcp/resources.ts`
- [ ] `createFromRunner` in `convex/publishing/distributionPlans.ts` (workflow-runner-only
      entry point) — replace with the automation-run entry point from C2
- [ ] `convex/providers/falModelCatalog.ts` + `providerModels` table if C0 audit
      confirms nothing else uses them

**Frontend**
- [ ] `src/features/workflow-canvas/`, `src/components/workflow/`,
      `src/hooks/workflow/`, `src/pages/WorkflowCanvasPage.tsx`
- [ ] `src/lib/workflow/` (after C0 type extraction)
- [ ] `src/features/create/RecentWorkflowDrafts.tsx` and its usage
- [ ] "Save as Workflow" affordance in
      `src/features/agent-create/components/FinalReviewActions.tsx` (replaced per C3)
- [ ] `src/features/library/LibraryWorkflowBrowser.tsx` + workflow entries in
      `libraryTypes.ts` / `libraryOutputs.ts` / `assetTypes.ts` / `artifactUtils.ts`
- [ ] Workflow nav/route/shell references: `src/app/navigation.ts`, `src/App.tsx`,
      `src/components/AppShell.tsx`, `src/types.ts`, `src/components/ui.tsx`,
      `src/lib/publishingRouting.ts`, `src/components/library/ReferenceAssetField.tsx`,
      create-mode plumbing (`createModes.ts`, `createGenerationConfig.ts`,
      `generationOperations.ts`, `CreateModeTabs.tsx`, `createPageHelpers.ts`,
      `useCreateReferenceFiles.ts`, `VideoComposerPage.tsx`, `CreateToolsPage.tsx`,
      `LibraryPage.tsx`) — use the grep below to find every touchpoint

**Tests / scripts**
- [ ] Delete `tests/e2e/create/agent/workflow-export.e2e.ts`; remove it from the
      `test:e2e:create:agent` script in `package.json`; add an equivalent e2e for
      automation.create if feasible
- [ ] Update any other tests referencing workflow types

**Done criterion**: `grep -ri "workflow" src/ convex/ tests/ --include="*.ts" --include="*.tsx" -l`
returns **zero files** (excluding `convex/_generated`, which regenerates). Naming the new
system "automations" (never "automation workflow") makes this check meaningful. Then
`npm run build` and `npx convex dev --once` succeed, and all e2e scripts pass.

## Workstream C acceptance criteria

- Creating an automation via chat ("post pilates slideshows every Mon/Wed/Fri at 9am,
  let me approve before posting") yields an inactive automation with a sensible brief +
  pillars; activating it and forcing `nextRunAt = now` produces a run that: picks a
  topic not in the ledger, generates a slideshow in a normal Create thread, creates a
  draft distribution plan, and lands in the approval queue.
- With `auto_publish`, the run publishes through `distributionPlans.publish` without any
  human interaction, and the run row links thread + plan + cost.
- Two consecutive runs of the same automation pick meaningfully different topics
  (ledger dedup works).
- Budget: setting `maxUsdPerRun` to $0.01 causes the next run to fail fast with a clear
  error; monthly exhaustion skips runs.
- The workflow grep done-criterion above passes; the app has no Workflows nav entry, no
  canvas route, and no dead code paths.

---

# Recommended implementation order & verification

1. **A** (roster options + cascade + settings + tool surface + Create tab) — small,
   self-contained.
2. **B** (designer module + slideshow integration + studio integration) — independent of
   A; do B1 with unit tests before touching the pipelines.
3. **C0–C1** (extraction + schema), **C2–C4** (runtime, tools, UI), **C5** (deletion) —
   deletion is last so the app never has a gap where neither system exists.

After each workstream: `npm run build`, `npx convex dev --once` (schema + typecheck),
`npm run test:e2e:create:slideshows`, `npm run test:e2e:create:agent` (updated per C5).
For anything touching fal payloads, verify the exact request against the fal model
page for that endpoint — payload keys in this doc marked "verify" must not be assumed.
