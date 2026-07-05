# Create Agent Improvements — Implementation Spec

Target: the Create agent (`convex/create/**`, agent UI in `src/features/agent-create/**`).
This spec breaks the agreed improvements into small, independently shippable work items.
Do them in order within a phase; phases 1–6 are largely independent of each other unless a
dependency is called out.

## Ground rules for the implementing agent

- **One work item per session/PR.** Do not bundle items. Do not refactor beyond the item's scope.
- **Verification after every item** (all must pass before the item is "done"):
  - `npx tsc -p tsconfig.json --noEmit` (frontend typecheck, run from repo root)
  - `PATH="$HOME/.nvm/versions/node/v23.6.0/bin:$PATH" npx convex codegen`
    (regenerates `convex/_generated` and typechecks the Convex directory; the convex CLI
    crashes on the default Node 18 — you MUST use the Node 23 path shown)
  - `npm run test:e2e:create:agent` (agent contract tests)
- **No backward-compatibility logic — this is a solo-dev project with disposable test data.**
  Do not write legacy code paths, `?? fallback` defaults for "old rows", or migration
  handling. When an item adds a field that should always exist, declare it **required** in
  the schema and always write it at insert time.
- **Dev data reset**: Convex validates all existing rows on deploy, so adding a required
  field fails while old rows exist. Items marked "requires data reset" mean: before
  deploying, clear these tables in the Convex dashboard (Data tab → table → Clear):
  `createThreads`, `createMessages`, `createToolCalls`, `createCheckpoints`. They only hold
  test conversations; nothing in the library/artifacts depends on them. Tell the user in the
  PR notes that a reset was required.
- Use `v.optional(...)` ONLY when the field is optional in the domain itself (e.g. a summary
  that legitimately doesn't exist until compaction first runs) — never as a compatibility
  measure. Never rename or remove existing fields.
- Match existing code style: no comment noise, small pure helpers, `camelCase` Convex fields.

## Key files map (read these before starting any item)

| Concern | File |
| --- | --- |
| Agent turn entry, decision action, apply/fail mutations | `convex/create/agent.ts` |
| Decision prompt, JSON parsing/normalizing | `convex/create/agent/agentDecision.ts` |
| Planned tool recording | `convex/create/agent/agentToolPlanning.ts` |
| Tool queue executor | `convex/create/toolExecution.ts` (`executeRunnableQueuedTools`) |
| Loop continuation + debug checkpoints | `convex/create/execution/asyncToolReconciliation.ts` |
| Tool registry + descriptor types | `convex/create/tools/registry.ts`, `convex/create/tools/types.ts` |
| Prior-image reference resolution | `convex/create/execution/mediaGenerationExecution.ts` |
| Model provider interface / OpenRouter adapter | `convex/providers/model.ts`, `convex/providers/modelProviders/openrouter.ts` |
| Tables: createThreads / createMessages / createToolCalls / createCheckpoints | `convex/schema.ts` (~lines 320–395) |
| Agent UI timeline | `src/features/agent-create/components/ToolProgressTimeline.tsx` |

Current architecture in one paragraph: `submit` (mutation) appends the user message and
schedules `decideAgentTurn` (internal action). That action builds a prompt from the last 16
thread messages and asks OpenRouter (`openai/gpt-4.1` by default) for one JSON decision:
`chat`, `clarify`, or `create` with an ordered `toolCalls` list. `applyAgentDecision` records
tool calls as `createToolCalls` rows and `executeRunnableQueuedTools` starts them (currently
one at a time). Async completions re-enter the executor; when the queue drains,
`continueAgentLoopAfterToolCompletion` schedules another `decideAgentTurn` so the model can
observe results and plan the next step. Debug-mode checkpoints pause before spend and before
reusing fresh outputs.

---

## Phase 1 — Strict decision & tool schemas

### WI-1.1 Define a JSON Schema for the agent decision and pass it to the model

**Goal:** the decision call uses OpenRouter's strict `json_schema` response format instead of
free-form JSON.

**Context:** `provider.generateStructured` already forwards `schema` + `schemaName` to
OpenRouter as `response_format: { type: "json_schema", strict: true, ... }`
(see `generateOpenRouterStructured` in `convex/providers/modelProviders/openrouter.ts`).
The call site in `decideAgentTurn` (`convex/create/agent.ts`) currently passes only a `parser`.

**Requirements:**
1. In `convex/create/agent/agentDecision.ts`, export `AGENT_DECISION_JSON_SCHEMA`: a JSON
   Schema (plain object, OpenAI strict-mode compatible) describing the decision:
   - `kind`: enum `chat | clarify | create` (required)
   - `response`: string (required)
   - `outputType`: enum `image | video | audio | slideshow | analysis | text` (nullable)
   - `toolCalls`: array of objects `{ tool: string, prompt: string, planStep: string | null,
     input: object | null }` (nullable)
   - `planSteps`: array of strings (nullable)
   - `productionPlan`: object with `finalArtifact`, `sourceRoles`, `units`, `assembly`,
     `render` (nullable)
   - `brief`: string (nullable)
   - Strict mode requires `additionalProperties: false` and every property listed in
     `required` (use nullable types for optional semantics).
2. In `decideAgentTurn`, pass `schema: AGENT_DECISION_JSON_SCHEMA` and
   `schemaName: "create_agent_decision"` to `generateStructured`. Keep the existing
   `parser: normalizeAgentDecision` (it stays as the validation/normalization layer).
3. Trim the "Return only JSON with this shape" section of `createAgentSystemPrompt` to a
   short note that the response format is enforced — remove the hand-written example object
   (the schema now carries the shape).

**Acceptance:** typecheck + codegen + agent contracts pass; sending a message in the agent UI
still produces chat replies and create plans (manual smoke test).

### WI-1.2 Remove the regex fallback parser; add one model repair round

**Goal:** malformed decisions are never regex-salvaged; instead the model gets exactly one
chance to fix its output, then the turn fails cleanly.

**Context:** `parseJsonObject` in `agentDecision.ts` falls back to `text.match(/\{[\s\S]*\}/)`.
`normalizeAgentDecision` also silently coerces unknown `kind` values to `chat`.

**Requirements:**
1. Delete the regex fallback in `parseJsonObject`. On `JSON.parse` failure, throw a typed
   error, e.g. `class AgentDecisionParseError extends Error { constructor(message, public readonly modelText: string) ... }`.
2. In `normalizeAgentDecision`, unknown `kind` throws `AgentDecisionParseError` instead of
   defaulting to chat. (Keep the existing "create without valid outputType/toolCalls/brief →
   clarify" behavior — that is semantic normalization, not parse failure.)
3. In `decideAgentTurn`, wrap the `generateStructured` call: if it throws
   `AgentDecisionParseError` (or the provider's "invalid structured output" `ProviderError`),
   retry **once** with an extra user message appended:
   `"Your previous response was not valid: <error>. Respond again following the required JSON schema exactly."`
   If the retry also fails, fall through to the existing `failAgentDecision` path.
4. Do not loop more than once. Log both failures with the existing
   `createAgentDecisionErrorLog` diagnostics.

**Acceptance:** typecheck + codegen + contracts pass. Add a unit-style contract test (follow
the pattern of existing tests under `tests/e2e/create/agent/`) asserting: valid JSON parses;
prose-wrapped JSON throws `AgentDecisionParseError`; unknown kind throws.

### WI-1.3 Real JSON Schemas for tool inputs in the registry

**Goal:** every executable tool's `inputSchema` is a real JSON Schema instead of a
`placeholder` description map.

**Context:** `CreateToolSchema` in `convex/create/tools/types.ts` already supports
`{ kind: "json_schema", schema }`. The registry (`convex/create/tools/registry.ts`) uses
`placeholder` field maps. The planner prompt serializes `inputFields` only for placeholder
schemas (see `createAgentSystemPrompt`).

**Requirements:**
1. For each executable tool (`analyze.source`, `references.list`, `text.generate`,
   `mediaOverlay.updateText`, `media.generateImage`, `media.generateVideo`,
   `media.renderVideo`, `media.generateAudio`, `media.lipsync`, `slideshow.render`,
   `studio.compose`, `studio.render`, `artifact.save`, `artifact.export`,
   `publishing.prepare`, `workflow.createDraft`), replace the placeholder with
   `kind: "json_schema"` and a schema describing its accepted `input` fields.
   Derive the fields from two sources of truth: the existing placeholder `fields` map, and
   what the execution code actually reads from `toolCall.input` (grep each tool's executor in
   `convex/create/execution/*.ts` for `input.` accesses — e.g. `mediaGenerationExecution.ts`
   reads `usePriorImageOutputs`, `priorImageOutputIndex`, `aspectRatio`, `durationSeconds`,
   `count`, `provider`, `model`; `slideshow.render` reads `requestedRenderingMode`, `brief`,
   `plan`).
   Use enums where values are closed sets (e.g. `requestedRenderingMode`:
   `background_plus_overlay | full_graphic_generation`; `aspectRatio`: keep as string with a
   `description` listing common values — it is not a closed set).
2. Every field gets a `description` — these descriptions are read by the model, so move the
   relevant guidance into them (e.g. on `priorImageOutputIndex`: "Zero-based index into the
   prior generated images in this thread; use when this call must animate/extend one specific
   earlier image.").
3. Update `createAgentSystemPrompt` to serialize the full schema for `json_schema` tools
   (currently it only handles the placeholder branch): include `name`, `label`,
   `description`, `category`, and `inputSchema.schema`.
4. Keep placeholder support in the type for the two demo tools (`create.noop`,
   `create.echo`) — do not delete the union member.

**Acceptance:** typecheck + codegen + contracts pass; planner smoke test still produces valid
plans for an image request and a slideshow request.

### WI-1.4 Validate planned tool inputs at decision time

**Goal:** a decision that references bad tool inputs is caught before any tool call rows are
written, and the model is told what was wrong.

**Depends on:** WI-1.3.

**Requirements:**
1. Add `validateToolCallInput(toolName, input): string[]` (returns human-readable error
   strings, empty = valid) in a new file `convex/create/tools/validateToolInput.ts`.
   Implement a minimal JSON Schema checker for the subset used in the registry (types,
   enums, required, additionalProperties) — do NOT add a dependency; ~100 lines is expected.
2. Call it from `normalizeAgentDecision` (or a wrapper used by `decideAgentTurn`) for each
   planned tool call. Unknown tool names are already dropped — change that: an unknown tool
   name is now a validation error, not a silent drop.
3. On validation errors, use the same single repair round added in WI-1.2: re-ask the model
   once with the error list. If still invalid, `failAgentDecision` with a message listing the
   errors.

**Acceptance:** typecheck + codegen + contracts pass; add contract tests: valid input passes;
wrong enum value produces an error naming the field; unknown tool name produces an error.

---

## Phase 2 — Prompt decomposition

### WI-2.1 Move per-tool guidance onto tool descriptors

**Goal:** policy bullets that are about one specific tool live with that tool, not in the
global prompt.

**Context:** `createProductionPlanningPolicy()` in `agentDecision.ts` has ~28 bullets; several
are tool-specific.

**Requirements:**
1. Add `plannerGuidance?: string[]` to `CreateToolPlannerDescriptor` in
   `convex/create/tools/types.ts`.
2. Move these bullets (verbatim, do not rewrite) from `createProductionPlanningPolicy` into
   the matching registry entries:
   - both `slideshow.render` bullets ("always use exactly one slideshow.render...", "default
     to editable text overlays...") → `slideshow.render`
   - the Kling model-default bullet → `media.generateVideo`
   - the `mediaOverlay.updateText` bullet → `mediaOverlay.updateText`
   - the `analyze.source` bullet ("When the user supplies a URL...") → `analyze.source`
   - the studio.compose/studio.render bullet → `studio.compose`
   - the text-bearing-graphic bullets (last two) → `media.generateImage`
3. In `createAgentSystemPrompt`, render each tool's `plannerGuidance` inside its tool card
   (after the description), and remove the moved bullets from the global list.
4. Bullets that describe cross-tool strategy (decomposition, continuity stills→video,
   dependency boundaries, prompt perspective) stay global for now (WI-2.2 modularizes them).

**Acceptance:** typecheck + codegen + contracts pass. Add a contract test that asserts every
moved bullet string still appears somewhere in the assembled system prompt (no guidance lost).

### WI-2.2 Split the global policy into category modules with an assembler

**Goal:** the system prompt is assembled from named modules instead of one flat array.

**Requirements:**
1. New file `convex/create/agent/agentPromptModules.ts` exporting:
   - `CORE_AGENT_PROMPT: string[]` — identity, chat/clarify/create contract, checkpoint
     note, planSteps formatting rules (the bullets currently outside
     `createProductionPlanningPolicy`, minus the JSON shape section removed in WI-1.1).
   - `PROMPT_MODULES: Record<AgentPromptModuleName, string[]>` with module names:
     `production_planning` (decomposition, dependency boundaries, iterative planning),
     `visual_continuity` (states→stills→image-to-video, usePriorImageOutputs/
     priorImageOutputIndex strategy, reference-grounded prompt shapes),
     `assembly_and_render` (multi-clip studio flow),
     `text_in_media` (where text belongs semantically).
   - `buildAgentSystemPrompt(options: { modules: AgentPromptModuleName[] }): string` —
     core + selected modules + tool cards (reuse the tool-card rendering from WI-2.1).
2. Rewrite `createAgentSystemPrompt()` as `buildAgentSystemPrompt({ modules: ALL_MODULES })`
   so behavior is unchanged in this item. Delete `createProductionPlanningPolicy`.
3. Every existing bullet must land in exactly one place (core, a module, or a tool's
   `plannerGuidance`). Extend the WI-2.1 contract test to assert the full-modules prompt
   contains all bullets.

**Acceptance:** typecheck + codegen + contracts pass; prompt-content test green.

### WI-2.3 Select modules per turn

**Goal:** continuation decisions only carry the policy modules relevant to the work in flight.

**Depends on:** WI-2.2.

**Requirements:**
1. In `decideAgentTurn`, decide the module list:
   - **First decision of a user turn** (no `createToolCalls` created after the triggering
     user message): all modules. This keeps initial planning fully informed.
   - **Continuation decisions** (scheduled by `continueAgentLoopAfterToolCompletion`):
     always `production_planning`; add `visual_continuity` if any thread tool call is
     `media.*`; add `assembly_and_render` if any is `studio.*` or `media.renderVideo`; add
     `text_in_media` if `thread.lastInferredOutputType` is `image` or `slideshow`.
2. Implement the selection as a pure exported function
   `selectPromptModules(input: { isContinuation: boolean; toolNames: string[]; lastInferredOutputType?: string }): AgentPromptModuleName[]`
   in `agentPromptModules.ts`, with contract tests for each branch.
3. Pass the needed inputs from `agentTurnContext` (it already loads thread + messages; add a
   lightweight tool-name list to its return value).

**Acceptance:** typecheck + codegen + contracts pass; selection unit tests green.

---

## Phase 3 — Context overhaul

### WI-3.1 One-line captions on generated media artifacts

**Goal:** every generated image/video/audio artifact stores a short human/model-readable
caption at creation time, so later planning can refer to outputs precisely without vision.

**Requirements:**
1. Find the artifact insert/patch sites for generated media (grep `insert("artifacts"` under
   `convex/content/` and `convex/create/`; the main ones are the content-request pipeline in
   `convex/content/requestExecution/contentRequestExecution.ts` and studio render completion).
2. At each site, set `data.caption`: the generation prompt for that asset, truncated to 140
   chars (word boundary, append `…`). For slideshow slide images use
   `"Slide <index>: <truncated slide prompt>"`.
3. No schema change needed (`artifacts.data` is `v.any()`).
4. Do not backfill existing artifacts.

**Acceptance:** typecheck + codegen + contracts pass; generate an image in the agent UI and
verify the artifact row has `data.caption` (manual check via Convex dashboard or a temporary
log).

### WI-3.2 Structured turn context (pinned brief + artifact ledger + filtered messages)

**Goal:** replace the flat "last 16 messages" window with a structured context block.

**Depends on:** WI-3.1 (captions make the ledger useful; ship after it).

**Context:** `agentTurnContext` in `convex/create/agent.ts` slices the last 16 messages and
inlines text-artifact content. `messageForModel` in `agentDecision.ts` converts each to a
chat message. Prior-image index semantics: `mediaGenerationExecution.ts` resolves
`priorImageOutputIndex` against prior image outputs — the ledger MUST enumerate images in the
same order that resolution uses (read `toolReferenceCollection.ts` /
`mediaGenerationExecution.ts` and reuse or extract the same enumeration helper; do not write
a second, subtly different ordering).

**Requirements:**
1. New file `convex/create/agent/agentTurnContextBuilder.ts` exporting
   `buildTurnContextSections(...)` returning:
   - `pinned`: the first `kind: "plan"` agent message of the current user turn (if any) plus
     the effective brief — labeled "Current request and plan".
   - `artifactLedger`: ordered list of generated artifacts in the thread:
     `#<n> [<type>] <caption ?? title> (tool: <label>, status: ready|saved)`, where image
     numbering matches `priorImageOutputIndex` resolution order. Include a line stating
     exactly that: "Image numbers correspond to priorImageOutputIndex."
   - `recentMessages`: thread messages EXCLUDING `kind: "status"` (they are UI noise),
     newest-last, up to a character budget (default 48_000 chars, env-overridable via
     `CONTENT_ENGINE_AGENT_CONTEXT_CHARS`), dropping oldest first. Keep the existing
     `generatedTextContext` inlining for text artifacts.
2. Rework `agentTurnContext` to return these sections; rework the message assembly in
   `decideAgentTurn` to send: system prompt, then one user message containing pinned +
   ledger sections, then the recent messages via `messageForModel`, then the existing final
   instruction message.
3. Remove the hard `slice(-16)`.

**Acceptance:** typecheck + codegen + contracts pass; add contract tests for the builder:
status messages excluded; ledger ordering matches the prior-image enumeration helper on a
synthetic fixture; char budget drops oldest messages first.

### WI-3.3 Compaction summary for dropped history

**Goal:** when the char budget drops old messages, the model still gets a compact summary of
them instead of nothing.

**Depends on:** WI-3.2.

**Requirements:**
1. Schema: add to `createThreads`: `contextSummary: v.optional(v.string())` and
   `contextSummaryThroughMessageId: v.optional(v.id("createMessages"))`.
2. In `decideAgentTurn` (action — it can call the model), when the builder reports dropped
   messages: if `contextSummaryThroughMessageId` already covers the dropped range, reuse the
   cached `contextSummary`. Otherwise call `provider.generateText` (same provider/model as
   the agent, `maxTokens: 600`) with the dropped messages and the previous summary, asking
   for a factual digest of "what was requested, produced, decided, and rejected"; persist it
   via a small internal mutation, then include it as a "Earlier conversation summary"
   section before `recentMessages`.
3. Summarization failure must not fail the turn: on error, proceed without a summary and log.

**Acceptance:** typecheck + codegen + contracts pass; manual test: a long thread (force a tiny
budget via the env var) still plans sensibly and writes `contextSummary` once, reusing it on
the next turn.

---

## Phase 4 — Loop safety

### WI-4.1 Stale-decision guard (decision run ID)

**Goal:** an in-flight `decideAgentTurn` whose thread moved on (user stopped it or sent a new
message) can no longer apply its decision.

**Context:** `applyAgentDecision` / `failAgentDecision` in `convex/create/agent.ts` only check
that the thread and message exist. `submit`, `stopThread` (`agentStopActions.ts`), and
`continueAgentLoopAfterToolCompletion` are the state movers.

**Requires data reset** (see ground rules).

**Requirements:**
1. Schema: add `decisionRunId: v.string()` (required) to `createThreads`; set it at thread
   creation (`createThreadForTurn`) with `crypto.randomUUID()`.
2. Generate a new run id and patch it onto the thread in: `submit` (each user turn) and
   `continueAgentLoopAfterToolCompletion` (each continuation), right before scheduling
   `decideAgentTurn`. Pass the run id as a required arg to `decideAgentTurn`, which forwards
   it to `applyAgentDecision` / `failAgentDecision`.
3. Both mutations no-op (return early, log at info level) when
   `thread.decisionRunId !== args.decisionRunId`.
4. `stopCreateThread` patches a fresh `decisionRunId` (invalidating any in-flight decision).
5. A decision action already sitting in the scheduler at deploy time will fail its arg
   validation loudly; that is acceptable — delete the affected test thread.

**Acceptance:** typecheck + codegen + contracts pass; contract test: applying a decision with
a mismatched run id changes nothing (no new messages, no tool calls).

### WI-4.2 Re-decision cap + duplicate-plan detection → checkpoint, not failure

**Goal:** a confused model cannot loop forever; instead the thread pauses with a "keep
going?" checkpoint.

**Depends on:** WI-4.1 (touches the same functions; do 4.1 first).

**Requires data reset** (see ground rules).

**Requirements:**
1. Schema: add to `createThreads`: `turnDecisionCount: v.number()` (required, set to `0` at
   thread creation) and `lastPlanSignature: v.optional(v.string())` (domain-optional: absent
   until the first create plan of a turn).
2. `submit` resets both (`0`, `undefined`). `applyAgentDecision` increments
   `turnDecisionCount` for every decision it applies.
3. Cap: in `continueAgentLoopAfterToolCompletion`, if `turnDecisionCount >= cap` (default 15,
   env `CONTENT_ENGINE_AGENT_MAX_TURN_DECISIONS`), do NOT schedule another decision. Instead
   insert an open `createCheckpoints` row (label `"Continue working?"`, message explaining
   the agent has taken N planning steps on this request and is pausing for confirmation) and
   set thread status `waiting_for_user`. `approveCheckpoint` (existing) resets
   `turnDecisionCount` to 0 when it approves a checkpoint with that label — the existing
   `executeRunnableQueuedTools` → empty queue → continue-loop path then resumes naturally.
4. Duplicate plan: in `applyAgentDecision` for `create` decisions, compute a signature:
   `JSON.stringify(decision.toolCalls)` (they are already normalized/ordered). If it equals
   `thread.lastPlanSignature`, treat it like the cap being hit (checkpoint, do not queue the
   duplicate tools). Otherwise store the new signature.
5. `chat` / `clarify` decisions are never blocked by the cap (they end the loop anyway).

**Acceptance:** typecheck + codegen + contracts pass; contract tests: (a) decision count
increments and resets on new user message; (b) identical consecutive create plans in one turn
produce a checkpoint and no duplicate tool calls.

---

## Phase 5 — Parallel dispatch of independent tool calls

Highest-risk phase. Read `executeRunnableQueuedTools` fully before starting. Ship 5.1 and 5.2
separately.

### WI-5.1 Record explicit dependencies between planned tool calls

**Goal:** each queued tool call knows which earlier calls it must wait for.

**Requires data reset** (see ground rules).

**Requirements:**
1. Schema: add `dependsOnToolCallIds: v.array(v.id("createToolCalls"))` (required) to
   `createToolCalls`. Every insert site writes it; `[]` means "no dependencies". Grep for
   all `insert("createToolCalls"` sites — `recordPlannedTools` is the main one, but any
   other (e.g. tool calls recorded by output actions) writes `[]`.
2. In `recordPlannedTools` (`convex/create/agent/agentToolPlanning.ts`), derive dependencies
   among the calls of the SAME decision, in plan order:
   - `analyze.source`, `references.list`: no dependencies.
   - `text.generate` and `media.generate*` / `media.lipsync` WITHOUT
     `input.usePriorImageOutputs` or `input.priorImageOutputIndex`: depend on all earlier
     `analyze.source` calls in this decision.
   - generation calls WITH `usePriorImageOutputs` or `priorImageOutputIndex`: depend on ALL
     earlier calls in this decision.
   - `media.renderVideo`, `slideshow.render`, `studio.compose`, `studio.render`,
     `artifact.save`, `artifact.export`, `publishing.prepare`, `workflow.createDraft`:
     depend on ALL earlier calls in this decision.
3. Store the resolved ids (insert calls first, then patch dependencies, or insert in order
   and collect ids as you go).
4. No executor changes in this item — field is written but unused.

**Acceptance:** typecheck + codegen + contracts pass; contract test over a synthetic
decision: `[generateImage a, generateImage b, generateVideo(usePriorImageOutputs), studio.compose]`
yields deps: a→[], b→[], video→[a,b], compose→[a,b,video].

### WI-5.2 Executor starts all runnable calls (bounded concurrency)

**Goal:** independent generation calls run concurrently; dependent calls still wait.

**Depends on:** WI-5.1.

**Context:** today `executeRunnableQueuedTools` iterates queued calls and `break`s after
starting most tools. Global gates `waitForPendingContentRequestsIfNeeded` /
`waitForPendingAnalysisIfNeeded` block on ANY pending work in the thread.

**Requirements:**
1. A queued call is **runnable** when every id in `dependsOnToolCallIds` has status
   `succeeded` AND its async output (content request / analysis job / render request) is
   complete — reuse the pending-check helpers but scope them to the dependency ids' outputs
   rather than the whole thread.
2. Start every runnable call in queue order until `min(4, runnable)` calls are running
   (running = status `running` OR succeeded-with-pending-async-output). Env override
   `CONTENT_ENGINE_AGENT_MAX_PARALLEL_TOOLS`.
3. Non-runnable calls are skipped (not `break`) so later independent calls still start.
4. Thread status computation at the end of the function is unchanged in meaning: any
   running → `running`, blocked → `waiting_for_user`, queued-only → `planning`, none →
   continue-loop/idle as today.
5. Convex mutations are serialized per-document via OCC, so concurrent completion callbacks
   invoking `executeRunnableQueuedTools` are safe; do not add locking.

**Acceptance:** typecheck + codegen + contracts pass; manual test: ask the agent for "three
separate images of X, Y, Z" and verify all three content requests are created before the
first completes (check `createdAt` timestamps or thread timeline); a continuity plan
(image → video from that image) still runs strictly in order.

---

## Phase 6 — Cost surfacing (passive)

### WI-6.1 Per-step and per-thread cost in the agent timeline

**Goal:** show what each tool call cost and the thread total, display-only.

**Context:** `createToolCalls.costUsd` and `createThreads.costUsd` already exist and are
written by several completion paths. The UI step type (`AgentCreateToolProgressStep` in
`src/features/agent-create/model/agentCreateTypes.ts`) already has `costLabel` — check where
tool steps are assembled (grep `costLabel` in `src/features/agent-create/` and
`convex/create/threads.ts`) and complete the plumbing if it is partial.

**Requirements:**
1. Ensure the thread message/timeline query returns `costUsd` per tool call; map it to
   `costLabel` formatted as `$0.038` (3 decimals under $1, 2 above).
2. Render the label as a muted chip on completed steps in `ToolProgressTimeline.tsx` (only
   when present).
3. Show a thread-total line ("Generation cost this thread: $X.XX") in the thread sidebar or
   surface header — smallest reasonable placement; sum client-side from steps if the thread
   field is not consistently maintained.
4. No spending controls, no gating — display only.

**Acceptance:** typecheck passes; generate an image and see a cost chip on the step (when the
provider reports cost) and a thread total.

---

## Backlog (explicitly deferred — do not implement)

- Retry/backoff on the decision LLM call (fold into the OpenRouter adapter later).
- Streaming token output for chat/clarify replies.
- Multimodal output verification / self-review (revisit for auto mode).
- Offline eval harness for decision prompts.

## Suggested implementation order

1. WI-1.1 → WI-1.2 → WI-1.3 → WI-1.4 (foundation for everything else)
2. WI-4.1 → WI-4.2 (small, independent, high safety value)
3. WI-2.1 → WI-2.2 → WI-2.3
4. WI-3.1 → WI-3.2 → WI-3.3
5. WI-5.1 → WI-5.2
6. WI-6.1 (anytime)

| Item | Status |
| --- | --- |
| WI-1.1 strict decision schema | ☐ |
| WI-1.2 remove regex fallback + repair round | ☐ |
| WI-1.3 tool input JSON Schemas | ☐ |
| WI-1.4 tool input validation | ☐ |
| WI-2.1 tool-owned guidance | ☐ |
| WI-2.2 prompt modules + assembler | ☐ |
| WI-2.3 per-turn module selection | ☐ |
| WI-3.1 artifact captions | ☐ |
| WI-3.2 structured turn context | ☐ |
| WI-3.3 compaction summary | ☐ |
| WI-4.1 decision run ID | ☐ |
| WI-4.2 re-decision cap + duplicate detection | ☐ |
| WI-5.1 explicit tool dependencies | ☐ |
| WI-5.2 parallel executor | ☐ |
| WI-6.1 cost surfacing | ☐ |
