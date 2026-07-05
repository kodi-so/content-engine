# Handoff: Clean up Create-agent chat transcript (dedupe work log vs chat)

## Problem

A recent fix made the agent loop reliable by persisting verbose `tool_result` messages and
status updates so the planner model can see tool completions. Those messages are also
rendered verbatim in the chat UI, so a simple one-image turn now reads like this:

1. Work log entry: planStep title + model chip + full tool prompt + result thumbnail (good)
2. Chat: plan message restating the same prompt
3. Chat: `Tool "Create an image of a tan, brunette woman taking a mirror selfie…"
   completed successfully. Produced: Image artifact "A tan, brunette woman taking a mirror
   selfie…" (ready).` + the image rendered a second time
4. Chat: "Thinking through the next step." (permanently fossilized)
5. Chat: final summary restating the same sentence again

Same sentence ~5 times, image twice. The design principle for the fix: **the persisted
message stream feeds two audiences.** The planner model needs verbose redundant context
(keep persisting it — do NOT remove the `tool_result` messages, they fixed an agent loop
bug). The human needs a narrative. Separate them by *rendering rules*, not by deleting
model context.

## Target experience (single-image turn)

> **User:** Cool, i want you to generate a similar image…
> *(while working: existing live "Working for Ns" indicator + live work log)*
> **▸ Worked for 3s** *(collapsed work log: tool title, model, prompt, result thumbnail)*
> **Agent:** Here's the new gym mirror selfie — tan and brunette, with a different pose,
> outfit, and locker room. Want any tweaks?
> *(generated image attached to this final message)*

Work log = process. Chat = narrative + deliverable. Status/tool_result kinds = hidden.

## Current pipeline (read these files first)

Backend (Convex):
- `convex/create/agent.ts` — `completionMessageForToolResult` (~line 100–125) composes the
  `tool_result` text; `applyAgentDecision` (~line 269) handles the final `kind: "chat"`
  decision; `continueAfterAsyncResult` (~line 845) appends "Finished {label}." (status) +
  the tool_result message.
- `convex/create/execution/asyncToolReconciliation.ts` —
  `continueAgentLoopAfterToolCompletion` (~line 290) appends "Thinking through the next
  step." (status).
- `convex/create/agent/agentThreadRecords.ts` — `appendMessage` (line 101) accepts
  `artifactIds` and all message kinds.
- `convex/create/planning.ts` — `toolDescriptorMap()` provides short tool labels
  (e.g. "Generate image").

Frontend (React):
- `src/features/agent-create/model/agentCreateSurfaceSelectors.ts` —
  `renderedAgentCreateMessages` (line 270) builds the transcript; currently filters via
  brittle content-regex helpers.
- `src/features/agent-create/model/agentCreateSurfaceModel.ts` —
  `isRoutineProgressMessage` / `isTransientQueuedMessage` (lines 195–217): the regex
  filters. `shouldAttachToolArtifactsToChat` (line 219).
- `src/features/agent-create/components/AgentCreateMessageList.tsx` — renders messages,
  the per-message work log (`AgentMessageWorkLog`), `stripRedundantPlan` (line 234), and
  message artifacts via `AgentCreateArtifactGrid`. `visibleChatArtifacts` (line 43)
  filters which attached artifacts render.
- `src/features/agent-create/AgentCreateSurface.tsx` — lines 280–360: `showActivity`,
  `activeThinkingStep` (a live "Thinking through next steps" work-log step driven by
  `thread.status === "planning"`), `workingMessageId`. Note line 356: the fallback
  `workingMessageId` is the last non-user message — check this still resolves sensibly
  after backend change B3.
- Messages arrive with `kind` (`chat | clarification | plan | status | tool_result |
  final_review`), `artifactIds`, and tool calls link to their plan message via
  `toolCall.messageId`.

## Changes

### B1 — Fix the `tool_result` message cosmetics (backend)

In `completionMessageForToolResult` (`convex/create/agent.ts`):
- `toolCall.label` is the planStep — a full sentence — so the message quotes a paragraph
  as a tool name. Use the short descriptor label instead:
  `toolDescriptorMap().get(toolCall.toolName)?.label ?? toolCall.label`.
- Artifact captions are the full generation prompt. Compact the caption in the message to
  ~90 chars (there is a `compactLogValue` helper in
  `convex/create/agent/agentDiagnostics.ts`).

Result shape: `Tool "Generate image" completed successfully. Produced: Image artifact
"A tan, brunette woman taking a mirror selfie in a gym locker…" (ready).`
This message is model-facing; it just shouldn't be absurd if a human sees it.

### B2 — Attach the turn's deliverables to the final chat message (backend)

In `applyAgentDecision` (`convex/create/agent.ts`), in the `decision.kind === "chat"`
branch: when this is a continuation turn (`thread.turnDecisionCount > 0`), collect the
media artifacts produced during this turn and pass their ids as `artifactIds` to
`appendMessage`:
- Query `createToolCalls` for the thread, filter `createdAt >= userMessage.createdAt`,
  gather `toolCall.artifactIds`.
- Keep only artifacts that exist, have a `storageUrl`, are image/video/audio (see
  `artifactMediaKind` in `convex/create/references/referenceResolution.ts`), and pass the
  thread workspace/user ownership check (same pattern as `artifactsForContentRequest` in
  the same file).
- Dedupe.

The frontend already renders `message.artifactIds` via `explicitArtifacts` in
`renderedAgentCreateMessages`, so the image then appears with the final summary for free.
Side effect on model context: the chat message will carry `generatedImageUrls` into future
planner turns (via `buildTurnContextSections`) — that is acceptable and shares the
existing 4-image attachment budget.

### B3 — Stop persisting "Thinking through the next step." (backend)

In `continueAgentLoopAfterToolCompletion`
(`convex/create/execution/asyncToolReconciliation.ts` ~line 290), remove the
`appendAgentMessage` for "Thinking through the next step.". It is filtered out of model
context (kind `status`) and the UI already has a live equivalent (`activeThinkingStep` in
`AgentCreateSurface.tsx` renders "Thinking through next steps" whenever
`thread.status === "planning"` with no active tool). Verify after removal that the live
indicator still appears between tool completion and the next decision, and that the
`workingMessageId` fallback (`AgentCreateSurface.tsx` line 356) doesn't break — it should
fall back to the plan message.

Keep the "Finished {label}." status messages being persisted (cheap, and F1 hides them).

### F1 — Kind-based transcript filtering (frontend, the main change)

In `renderedAgentCreateMessages`
(`src/features/agent-create/model/agentCreateSurfaceSelectors.ts` line 277), replace the
content-regex filtering with kind-based rules:

- Drop `kind === "tool_result"` from the transcript entirely (it is model food; the work
  log already shows the same tool + result).
- Drop `kind === "status"` EXCEPT failure/attention messages. Before dropping, audit
  where status messages carry unique failure info: `toolExecution.ts` appends
  `"{label} failed: …"`, `asyncToolReconciliation.ts` appends
  `"{label} failed after it was queued: …"`, and several "There are no ready … yet."
  notices in `toolOutputActions.ts`. Failures are ALSO surfaced via work-log step
  `errorMessage` and the thread-level error banner (`statusMessage` in
  `AgentCreateSurface.tsx`), but the "no ready previews" notices are status-only — keep
  status messages that don't match a known-routine allowlist, or (better) keep any status
  message containing "failed"/"no ready"/"not exportable" and drop the rest. Use
  simple predicates on kind + a small set of prefixes; the goal is deleting the current
  regex soup, not growing it.
- Delete `isRoutineProgressMessage` and `isTransientQueuedMessage` from
  `agentCreateSurfaceModel.ts` (superseded), including their handling of the old
  "Queued … as a preview request." tool_result messages — those are covered by dropping
  all tool_result kinds.
- This is retroactive by design: old threads' fossilized status/tool_result messages
  disappear from the transcript too.

### F2 — Only show plan text for multi-step plans (frontend)

In `AgentCreateMessageList.tsx`: for `kind === "plan"` messages, render the message
content only when the plan is multi-step; for a single-step plan the content duplicates
the work-log entry title. Use the message's `toolSteps` count (tool calls are linked via
`toolCall.messageId`): if `toolSteps.length <= 1`, render only the work log for that
message (drop the text). Keep `stripRedundantPlan` for the multi-step case (it strips the
numbered "Plan:" list, leaving the one-line summary above the work log). Edge case: a plan
message whose tools are all still queued mid-turn still has toolSteps — count steps, not
completed steps.

### F3 — Verify the deliverable renders correctly (frontend, verification of B2)

After B2, the final chat message has image artifacts. Confirm `visibleChatArtifacts`
(`AgentCreateMessageList.tsx` line 43) lets ready images through (it should), the
`AgentCreateArtifactGrid` actions (save/download/open) work from that message, and the
image is NOT also rendered a second time by anything else in the chat body (the work-log
copy stays, inside the collapsed section).

## What NOT to change

- Do not stop persisting `tool_result` messages or change what the planner model sees in
  `buildTurnContextSections` / `messagesForModel` (other than the B1 wording and B2
  artifactIds side effects described above). The verbose model context fixed a re-planning
  loop bug — see git history / HANDOFF-agent-loop-fix.md if present.
- Do not remove the work log; it is the intended home for process detail.
- Do not change checkpoint rendering (`CheckpointPrompt`) or final-review actions.

## Verification

- `npx tsc --noEmit` clean; `npm run test:e2e` passes (contract tests live in
  `tests/e2e/create/**`; extend `tests/e2e/create/agent/planning.e2e.ts` if any exported
  helper behavior changes).
- Add/extend a frontend-model test if the repo grows one for
  `renderedAgentCreateMessages` filtering; otherwise assert the new predicates in the
  planning contract test if they're exported from a shared module.
- Manual acceptance (dev: `npm run dev` + `npm run convex:dev`): run the mirror-selfie
  scenario (image reference + "generate a similar image"). Expected transcript after the
  turn: user message → one collapsed "Worked for Ns" work log (prompt + thumbnail inside)
  → one final agent message with the image attached and a short summary. No "Tool …
  completed successfully" text, no "Thinking through the next step.", no duplicate image
  in the chat body. While working: live thinking indicator appears between tool completion
  and the next decision.
- Regression: trigger a failing generation (or simulate) and confirm the failure is still
  visible to the user (work-log step error + error banner, and any kept status message).
- Open an OLD thread from before this change and confirm the transcript reads cleanly
  (fossilized status/tool_result messages hidden) with no missing deliverables.
