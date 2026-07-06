# Handoff: Agent Create transcript redesign + full pipeline audit

## Why this doc exists

A slideshow run ("recreate this TikTok slideshow about glute exercises") surfaced a cluster
of UX problems: two separate work logs for one request, a step labeled "Draft the slideshow
outline" that silently produced the entire finished slideshow, slide images rendered three
times (work-log Result grid, full-size chat cards, inside the editable slideshow), a useless
"file" summary card with an Export button, and no closing agent message at all.

None of these are isolated bugs. They share three root causes, and this doc fixes the causes
across **all** output types (image, video, audio, text, slideshow, studio, analysis), not the
slideshow symptoms:

1. **Backend structure leaks into the transcript.** The UI renders one work log per agent
   *decision turn* and attaches artifacts per *tool call*, so the user sees the loop's
   internal shape instead of "my request → the work → the deliverable."
2. **"Intermediate vs final" was designed but never wired.** The tool registry declares
   `artifactBehavior.intermediate` (`convex/create/tools/types.ts:51`, set per tool in
   `convex/create/tools/registry.ts`) and threads have `finalArtifactIds` — but **no code
   consumes either**. Every artifact a tool touches flows to the UI with equal weight.
3. **Long-running tools are opaque.** A tool call maps to exactly one work-log step
   (`toolProgressStepsForCall`, `agentCreateToolProgress.ts:144`), even when the backend has
   rich stage/progress state (slideshow `planning → generating`, studio renders).

Read `docs/handoffs/HANDOFF-agent-loop-fix.md` and `HANDOFF-chat-ux-cleanup.md` first — this
doc builds on both and must not regress them.

## Design invariants (do not violate)

- **Two audiences, one message stream.** Persisted `status`/`tool_result` messages are model
  food that fixed a re-planning loop bug. Change *rendering rules*, never delete model
  context. `buildTurnContextSections` (`convex/create/agent/agentTurnContextBuilder.ts`),
  `messagesForModel`, the artifact ledger, and the turn tool-progress section stay intact.
- **Chat = narrative + deliverables. Work log = process + provenance.** Anything that is not
  the final deliverable or the agent talking belongs inside the (collapsed) work log.
- **One request = one work log**, regardless of how many decision turns the loop takes.
- **Every request ends with the agent saying something.** No output type may end a turn
  silently.

## Target experience (applies to every output type)

```
User: <request>

▸ Worked for 52s                        ← ONE collapsed log per request
    ✓ Analyze the reference slideshow      (analysis gist inside)
    ✓ Plan slides and copy                 (outline expandable here)
    ✓ Generate slide images (7/7)          (thumbnails behind "Result")
    ✓ Assemble slideshow

Agent: Here's your glute-growth slideshow — 6 exercises following the
       reference's hook/list/CTA structure. Want different exercises
       or copy changes?
[inline editable slideshow — the ONLY artifact in the chat body]
```

While working, the same log is pinned open with a live timer and the current step
highlighted. A simple chat answer renders with no log at all. A single-image request is the
degenerate case: one log with one step, final message with the image attached.

---

## Audit findings

Severity: **[P0]** broken/incoherent for users · **[P1]** materially degrades trust or
clarity · **[P2]** worth fixing while in the area.

### A. Transcript & work-log structure

- **A1 [P0] One work log per decision turn, not per request.**
  `applyAgentDecision` appends a `plan` message per decision (`convex/create/agent.ts:417`),
  tool calls link to that message, and `toolStepsByMessageId`
  (`agentCreateSurfaceSelectors.ts:250`) + `AgentCreateMessageList.tsx:359` render a log per
  message. A request that takes N decision turns shows N logs.

- **A2 [P0] Slideshow turns end silently.** `continueAfterAsyncResult`
  (`convex/create/agent.ts:924-936`) special-cases `slideshow.render`: when it completes
  with nothing queued, it sets thread status `ready` and **skips**
  `continueAgentLoopAfterToolCompletion` — so the final `kind:"chat"` decision that every
  other tool gets never happens. No summary, no closure, inconsistent with image/video/text
  turns.

- **A3 [P1] Work-log timers overlap.** Every log in a turn uses the same
  `startedAt={previousUserMessage?.createdAt}` (`AgentCreateMessageList.tsx:364`), so with
  multiple logs the second one's "Worked for 45s" includes the first log's 3s. Durations
  double-count. (Fixing A1 makes this moot — one log, one timer.)

- **A4 [P1] Completed plan logs never collapse.** `defaultOpen={message.kind === "plan"}`
  (`AgentCreateMessageList.tsx:361`) plus the sync effect in `AgentMessageWorkLog`
  (lines 128-130) keep plan logs expanded forever. Finished work should collapse to
  "▸ Worked for Ns".

- **A5 [P0] Step labels describe a plan that was collapsed away.**
  `nativeSlideshowToolCalls` (`agentDecision.ts:420-452`) merges the planner's multi-step
  intent into one `slideshow.render` call but reuses the *first* step's `planStep` as the
  label (line 444) — hence "Draft the slideshow outline…" labeling the entire pipeline. Any
  future tool-call collapsing has the same hazard. Rule: a collapsed call must get a label
  that spans the whole tool ("Create the slideshow"), never a sub-step's label.

- **A6 [P1] Wrong model attribution.** `resolvedModelByContentRequestId`
  (`agentCreateSurfaceSelectors.ts:58-74`) takes the first artifact carrying a `model` —
  for slideshows that's the `slide_spec` plan artifact, so the step chip shows the *text*
  model (`openai/gpt-4.1`) for an image-generation pipeline. Attribution should be
  per-stage (planner model on the plan step, image model on the generation step) once C1
  lands, or prefer media artifacts' models until then.

- **A7 [P0] Long-running tools are a single opaque step.** One tool call = one step
  (`toolProgressStepsForCall`). `slideshow.render` runs plan → per-slide prompt writing →
  N image generations → overlay design → assemble (45s+), and the backend already tracks
  stages (`internal.content.requests.transition`: `planning`/`generating`;
  per-slide results exist in the action). Studio renders have the same problem. Users watch
  a spinner with a wrong label (A5) and then get a finished product they never saw coming.

- **A8 [P2] Two different "thinking" presentations.** `ThinkingMessage` renders a pill for
  the initial turn and a synthetic work-log step otherwise
  (`AgentCreateMessageList.tsx:200-232`, `activeThinkingStep` in
  `AgentCreateSurface.tsx:337`). After A1, thinking should just be the live head of the
  single per-request log in both cases.

### B. Artifact flow (the duplication machine)

- **B1 [P0] Async completion over-attaches artifacts to the tool call.**
  `artifactsForCompletedAsyncTool` (`convex/create/agent.ts:163-196`) grabs **every**
  artifact on the content request — including non-deliverables like the `slide_spec` plan
  artifact — and patches them onto `toolCall.artifactIds` (`agent.ts:917-922`). From there
  they flow to `directArtifacts` (`agentThreadOutputs.ts:86-97`), get built as ready
  artifacts (`agentCreateOutputArtifacts.ts:167-182`), and render in chat. This is exactly
  where the "Glute Gains… [file] [Export]" card comes from.

- **B2 [P0] Chat attachment is a tool-name whitelist, not a deliverable check.**
  `shouldAttachToolArtifactsToChat` (`agentCreateSurfaceModel.ts:215`) whitelists
  `slideshow.render` (and others), so all seven slide images render as full-size chat cards
  *in addition to* the work-log Result grid *and* inside the editable slideshow. Three
  renderings of the same pixels.

- **B3 [P0] `intermediate` and `finalArtifactIds` are dead schema.** The registry declares
  which tools emit intermediates (`registry.ts`: image/video/audio/text are
  `intermediate: true`; slideshow/studio-render/export are final), and completion paths set
  `thread.finalArtifactIds` (`toolExecution.ts:108,198`, `studioRenderRequests.ts:163`) —
  but nothing reads either. Wire this concept end to end; it is the principled fix for B1/B2.

- **B4 [P1] The generic summary card earns nothing.** `AgentCreateArtifactCard`'s
  non-preview branch renders title (= prompt), description (= prompt again), model chip,
  kind badge, Export — all redundant next to a real deliverable. After B1–B3 it should only
  ever appear for genuinely card-shaped things (analysis briefs already have their own
  better card; distribution plans, automations).

- **B5 [P1] Final chat message attaches all turn media, not deliverables.**
  `mediaArtifactsProducedSinceUserMessage` (`agent.ts:198-230`) collects every image/video/
  audio artifact from the turn's tool calls. For a slideshow turn (once A2 is fixed) that
  would staple 7 slide images to the closing message. Filter to final artifacts (B3).

### C. Loop & infrastructure soundness

- **C1 [P1] Cost attribution is silently wrong.** Work-log cost chips read
  `toolCall.costUsd` (`agentCreateToolProgress.ts:167`) and the composer total sums the same
  (`AgentCreateSurface.tsx:252-258`), but only `completeTextGeneration` and
  `completeVideoRender` ever set it. Async content-request costs (all fal image/video/audio
  and the entire slideshow pipeline, summed on `contentRequests.costUsd`,
  `convex/content/requests.ts:511`) are never patched onto the tool call —
  `continueAfterAsyncResult` patches only `artifactIds` (`agent.ts:917-922`). The displayed
  spend undercounts the most expensive operations. Fix: copy `request.costUsd` onto the
  tool call at reconciliation.

- **C2 [P1] No stuck-run recovery.** Loop resumption relies on async completion callbacks
  (`continueAfterAsyncResult`) and a **client-side** effect
  (`AgentCreateSurface.tsx:530-548`) that auto-continues queued tools in auto mode. If a
  provider callback is dropped or the user closes the tab at the wrong moment, the thread
  sits in `running`/`planning` forever with no watchdog. Add a scheduled reconciliation
  (cron or delayed self-check per run) that re-runs `executeRunnableQueuedTools` /
  `reconcileAsyncToolFailures` for threads stuck in active statuses beyond a threshold, and
  move auto-mode continuation server-side so it doesn't require a mounted React component.

- **C3 [P2] Dead-end status for unwired tools.** `executeRunnableQueuedTools` appends "…its
  executable wrapper is not connected yet" (`toolExecution.ts:505-509`) and leaves the tool
  queued forever. Every registry tool now has an executor; if this branch is unreachable,
  delete it — if reachable, fail the tool call so the loop can proceed.

- **C4 [P2] Failures surface in triplicate** (status message + step `errorMessage` + thread
  error banner). Keep the work-log step error + banner with Retry; let the status message
  stay model-only (extend the attention filter in `agentCreateSurfaceModel.ts:195` once the
  other two are verified sufficient).

### D. Content quality (generation pipeline)

- **D1 [P1] No copy coherence pass.** The slideshow planner copied the reference's
  "Duration:" label onto rep-based values ("Duration: 10-12 reps"). Two-part fix in
  `convex/content/planningPrompts.ts` SLIDE COPY rules: labels must agree with their values,
  and reference adaptation carries structure *roles*, not literal label text. Then add one
  cheap text-model QA pass over all `textBlocks` before image generation (label/unit
  mismatches, truncation, duplicated hooks) — pennies next to the per-slide LLM + image
  calls already being made.

- **D2 [P1] Text overlays overlap the image subject.** `designOverlayBlocks`
  (`convex/lib/overlayLayoutDesigner.ts:164`) is deterministic zone math with no knowledge
  of the generated pixels; the only mitigation is prompting the image model to "reserve
  negative space" (`planningPrompts.ts:153-155`), which is unreliable.
  - Floor (one day): auto-escalate `contrastStrategy` to `gradient_scrim`/`solid_scrim`
    (already implemented, `overlayLayoutDesigner.ts:110`) for bottom-zone body text, so
    overlap is always legible.
  - Fix (one week): after each slide image generates, run a cheap vision/subject-detection
    call to get the subject bounding box and pass it to the layout designer as an avoidance
    rect — extend `OverlayDesignRequest` with `avoidRects`, shift the zone's y or flip
    bottom→top when occupied. The percent-coordinate architecture makes this a small
    extension, and `mediaOverlay.updateText` already gives users/agent manual recovery.

---

## Implementation plan

Phases are independently shippable, ordered by user impact. Within each phase, backend
changes land before frontend.

### Phase 1 — One request, one log, one closing message (A1–A6, A8)

1. **Unified per-request log (frontend).** Replace per-message grouping: partition tool
   steps by "turn" = [user message, next user message). Render one `AgentMessageWorkLog`
   anchored at the turn's first agent message; later plan messages in the same turn
   contribute steps, not new logs. Interleave meaningful agent prose (plan summary) inside
   or directly under the log. `activeThinkingStep` becomes the live tail step of that log.
   Timer = first step start → last step completion (fixes A3). Collapse when the turn's
   final chat message exists (fixes A4).
2. **Closing message for slideshow turns (backend).** In `continueAfterAsyncResult`, replace
   the silent `status: "ready"` short-circuit with a deterministic final `kind:"chat"`
   message ("Your slideshow '<title>' is ready — N slides. …") carrying the slideshow as
   its deliverable. Deterministic is preferred over running another decision turn: zero
   re-plan risk, zero cost, and the slideshow entity isn't in the model's artifact ledger,
   so a planner-written summary risks confabulation. (If you instead run the decision turn,
   first add slideshows to the ledger.)
3. **Label + model attribution.** In `nativeSlideshowToolCalls`, stop reusing the sub-step
   `planStep` when collapsing (use "Create the slideshow" unless the planner's step already
   describes the whole job). In `resolvedModelByContentRequestId`, prefer media artifacts'
   models over `slide_spec`.

### Phase 2 — Deliverables vs process (B1–B5)

1. **Wire `intermediate` end to end (backend).** At async reconciliation, split the content
   request's artifacts: deliverables (per the owning tool's `artifactBehavior` +
   `contentFormat`) vs process artifacts (`slide_spec`, prompt records, per-slide images
   when the deliverable is the slideshow entity). Persist the distinction — either a
   `deliverable: boolean` on the tool call's artifact linkage or by finally using
   `thread.finalArtifactIds` consistently across all completion paths.
2. **Chat renders deliverables only (frontend).** Replace the `shouldAttachToolArtifactsToChat`
   tool-name whitelist with the deliverable flag. Work-log steps keep everything (Result
   grid = provenance). Result: slideshow turns show the inline editable slideshow once;
   image turns show the image once, on the final message.
3. **Outline as a step result.** Surface the `slide_spec` plan (slides + copy) as an
   expandable text result on the planning step — same pattern the work log already uses for
   `text.generate` documents (`ToolProgressTimeline.tsx:158-181`). Debug mode keeps its
   existing hard checkpoint (`debugPauseAfterPlanning`). This is the "abstract the
   reasoning, surface the plan" answer for every pipeline, not just slideshows.

### Phase 3 — Pipeline transparency (A7)

1. **Sub-step progress records.** Add a lightweight `progress` payload to `contentRequests`
   (stage + counts, e.g. `{stage: "generating", completed: 4, total: 7}`), updated by the
   slideshow action at each transition and per-slide completion. Studio renders already
   have status granularity — map it the same way.
2. **Render sub-steps.** `toolProgressStepsForCall` expands a tool call with progress into
   child steps ("Plan slides ✓ → Generate slide images (4/7) → Assemble"). This is additive;
   tools without progress payloads keep rendering one step.

### Phase 4 — Soundness & quality (C1–C4, D1–D2)

- Copy `contentRequests.costUsd` → `toolCall.costUsd` at reconciliation (C1).
- Stuck-run watchdog + server-side auto-continue (C2). Suggested: when a thread enters
  `running`/`planning`, schedule a check N minutes out that re-runs reconciliation if the
  thread hasn't progressed.
- Delete or fail-fast the unwired-tool branch (C3); dedupe failure surfaces (C4).
- Copy QA rules + pass (D1); scrim floor then subject-avoidance rects (D2).

## What NOT to change

- Anything the planner model consumes: persisted `status`/`tool_result` messages,
  `buildTurnContextSections`, the artifact ledger, `messagesForModel`, decision schema.
  (Phase 2's artifact split must not remove artifacts from the ledger — the model should
  keep seeing everything.)
- Checkpoint mechanics (`CheckpointPrompt`, debug pauses, `approveCheckpoint`), the
  repeated-plan guard (`shouldPauseForRepeatedPlan`), or the decision cap.
- The native slideshow single-tool-call design (`nativeSlideshowToolCalls`) — collapsing is
  correct; only its label handling is wrong.

## Verification

- `npx tsc --noEmit` clean; `npm run test:e2e` passes; extend
  `tests/e2e/create/agent/planning.e2e.ts` for exported helpers that change
  (`nativeSlideshowToolCalls` label, step partitioning if extracted to a shared module).
- **Slideshow scenario** (the one from this audit: TikTok photo URL + "similar slideshow
  with @Contour_Character"): expect ONE work log (analyze → plan [outline expandable] →
  generate (n/n) → assemble), a closing agent message, the inline editable slideshow as the
  only chat artifact, no "file" card, no full-size slide images in chat, image-model chip on
  the generation step, cost chips present.
- **Single-image scenario**: one log, one step, final message with the image attached once.
- **Chat-only scenario**: no log at all.
- **Failure scenario**: kill a generation mid-run; failure shows on the step + banner with
  Retry; no triplicate text; thread recoverable.
- **Stuck-run scenario** (Phase 4): drop an async callback (or point at a dead provider) and
  confirm the watchdog fails the tool call and unsticks the thread.
- **Old threads**: open a pre-change thread; transcript renders cleanly with the new
  grouping (fossilized messages hidden, no missing deliverables).
