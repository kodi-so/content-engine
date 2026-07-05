# Handoff: Fix Create-agent re-planning loop (duplicate image generations)

## Problem

When a user asks the Create agent for a single image, the agent generates it, then re-plans
and generates the same image again — observed 3 generations in a row before the planner
finally chose `kind="chat"` on the 4th decision pass. Each pass produced a slightly reworded
prompt for the same task.

## Architecture context (how the loop works today)

The Create agent is a plan → execute → re-decide loop built on Convex:

1. `submit` (`convex/create/agent.ts`) stores the user message and schedules
   `decideAgentTurn` (same file, ~line 345).
2. `decideAgentTurn` builds context via `agentTurnContext` →
   `buildTurnContextSections` (`convex/create/agent/agentTurnContextBuilder.ts`), calls the
   planner model (structured JSON decision: `chat` | `clarify` | `create`), then
   `applyAgentDecision` records planned tool calls and runs
   `executeRunnableQueuedTools` (`convex/create/toolExecution.ts`).
3. Async media generations (fal image/video via `contentRequests`) complete later and call
   `continueAfterAsyncResult` (`convex/create/agent.ts`, ~line 653), which appends a
   "Finished {label}." message and re-runs `executeRunnableQueuedTools`.
4. When nothing is queued/running/pending, `executeRunnableQueuedTools` calls
   `continueAgentLoopAfterToolCompletion`
   (`convex/create/execution/asyncToolReconciliation.ts`, ~line 261), which appends
   "Thinking through the next step." and schedules `decideAgentTurn` again against the
   **same latest user message**.

## Root cause (verified in code)

The planner is re-invoked after tool completion but is never shown that the work completed:

1. **Completion signals are invisible to the model.** The "Finished {label}." message
   (`continueAfterAsyncResult`, `convex/create/agent.ts` ~line 736) and "Thinking through the
   next step." are appended with `kind: "status"`, and `buildTurnContextSections` filters
   status messages out of model context
   (`convex/create/agent/agentTurnContextBuilder.ts` line 81:
   `messages.filter((m) => m.kind !== "status")`). Some sync tools append
   `kind: "tool_result"` messages (which DO reach the model), but the async media-generation
   completion path appends none. The only evidence of completion is a one-line artifact
   ledger entry (`Image #0 [image] <caption> (tool: ..., status: ready)`), and the generated
   image itself is never attached (image attachment in `messagesForModel`,
   `convex/create/agent/agentDecision.ts` ~line 229, only pulls from user
   `referenceMentions`).

2. **The continuation prompt pushes toward re-creating.** Every decision pass ends with the
   same user message: "Decide the next assistant action for the latest user message." plus
   "Effective brief for creation, if relevant: …" (`decideAgentTurn`,
   `convex/create/agent.ts` ~lines 455–462). `context.isContinuation` is computed
   (`agentTurnContext`, line 167) but only used to trim prompt modules — it never changes
   the instruction.

3. **The repeat-plan guard is too brittle.** `applyAgentDecision` pauses with a
   "Continue working?" checkpoint only when `JSON.stringify(decision.toolCalls)` is
   byte-identical to `thread.lastPlanSignature` (`convex/create/agent.ts` lines 232–250).
   The model rewords `prompt` slightly each pass, so the guard never fires. The only
   backstop is the hard cap of 15 decisions (`CONTENT_ENGINE_AGENT_MAX_TURN_DECISIONS`,
   `asyncToolReconciliation.ts` line 16).

## Changes to implement

### Change 1 — Append a `tool_result` message when an async generation completes (primary fix)

In `continueAfterAsyncResult` (`convex/create/agent.ts`, the block ~lines 729–756 where
`readySource` is found and "Finished {label}." is appended):

- Keep the existing `kind: "status"` message for the UI, but ALSO append a
  `kind: "tool_result"` agent message describing the result, with the produced
  `artifactIds` attached. Both `appendMessage`
  (`convex/create/agent/agentThreadRecords.ts` line 101) and `appendAgentMessage`
  (`convex/create/execution/toolExecutionShared.ts` line 53) already accept
  `artifactIds` and `kind: "tool_result"`, and `tool_result` messages already flow into
  model context. Alternatively, replace the status message with a single `tool_result`
  message if the UI treats them equivalently — check the frontend rendering of message
  kinds before deciding.
- Resolve artifacts: prefer `toolCall.artifactIds` if populated; otherwise for a
  `contentRequests` source, query `artifacts` via the `by_content_request` index (see
  `readyArtifactIdsForThread` in `convex/create/execution/toolOutputActions.ts` for the
  pattern, including the workspace/user ownership filter).
- Message content should let the planner recognize completion and map it to the plan, e.g.:
  `Tool "Generate image" completed successfully. Produced: Image artifact "<caption or title>" (ready).`
  Use the tool label and artifact caption/title (see `artifactCaption` in
  `agentTurnContextBuilder.ts`).
- Cover all async sources handled by `continueAfterAsyncResult`: contentRequests,
  videoAnalysisJobs (note `sourceAnalysisExecution.ts` already appends its own
  `tool_result` — avoid duplicating), and studioRenderRequests (check
  `studioToolExecution.ts`, which appends `tool_result` in some paths).

### Change 2 — Make continuation decisions explicit about completion state

Two parts:

a) **Turn progress section.** In `buildTurnContextSections`
   (`convex/create/agent/agentTurnContextBuilder.ts`), add a section to `contextBlock`
   listing this turn's tool calls (those with `createdAt >= userMessage.createdAt`) with
   label + status, e.g.:

   ```
   Tool calls for the current request:
   1. Generate image — succeeded (produced Image #0)
   All planned tool calls for this request have completed.
   ```

   Include failed/blocked/queued/running states when present ("2 of 3 completed, 1
   running") so this stays accurate mid-turn.

b) **Continuation instruction.** In `decideAgentTurn` (`convex/create/agent.ts`
   ~lines 455–462), when `context.isContinuation` is true, replace the final user message
   with completion-aware wording, e.g.:

   > "The planned tool calls for this request have finished; their results appear above
   > and in the artifact ledger. If the user's request is now satisfied, respond with
   > kind=\"chat\" summarizing what was produced. Only plan additional tool calls if
   > something specific is still missing or a follow-up step was already planned. Do NOT
   > re-create outputs that already exist in the ledger."

   Keep the existing wording for the initial (non-continuation) decision.

### Change 3 — Attach generated images to model context

So the planner can see (not just read about) what was produced:

- In `buildTurnContextSections`, build a map of image artifact `storageUrl`s from this
  thread's tool-call artifacts (it already loads artifacts for `generatedTextContext`;
  `readyArtifactsForThreadToolOutputs` from `execution/threadToolOutputs.ts` is already
  imported and used for the ledger).
- Extend `TurnContextMessage` with an optional `generatedImageUrls: string[]` populated on
  the `tool_result` messages from Change 1 (via their `artifactIds`).
- In `messageForModel` / `messagesForModel` (`convex/create/agent/agentDecision.ts`
  ~lines 195–258), include these as `image_url` content parts, sharing the existing
  `maxAttachedImages = 4` budget (newest-first, same as the current reference-image logic).

### Change 4 — Loosen the repeat-plan guard (safety net)

In `applyAgentDecision` (`convex/create/agent.ts` line 232), change the signature from
`JSON.stringify(decision.toolCalls)` to a normalized form that ignores prompt/planStep
wording:

```ts
const planSignature = JSON.stringify(
  decision.toolCalls.map((c) => ({ tool: c.toolName, input: c.input ?? null }))
);
```

Only trip the checkpoint on continuation decisions (`thread.turnDecisionCount > 0`) and
when no tool call has failed since the previous plan (a legitimate retry after failure may
plan the same tools). Note the tradeoff: iterative flows that intentionally call the same
tool with the same input in consecutive decisions would pause at the "Continue working?"
checkpoint — that is acceptable as a recoverable safety net (user clicks approve, which
already resets `lastPlanSignature` in `approveCheckpoint`).

## Priorities

Changes 1 and 2 are the real fix — do those first. Change 3 improves result quality
judgment; Change 4 is a cheap backstop. All four are intended.

## Verification

- Existing e2e planning test: `tests/e2e/create/agent/planning.e2e.ts` (must keep passing;
  note there are uncommitted local modifications across `convex/create/**` — build on the
  working tree as-is).
- Add coverage for: (a) continuation decision context contains the tool-result message and
  turn-progress section; (b) normalized plan signature triggers the "Continue working?"
  checkpoint when the same tools+inputs are re-planned with reworded prompts; (c) the
  continuation instruction swap on `isContinuation`.
- Acceptance scenario (from the observed bug): user sends one image request with a
  reference image → exactly one `media.*` generation runs → on the next decision pass the
  planner chooses `kind="chat"` and summarizes, with no second generation. If the model
  still re-plans, the normalized signature guard must pause it before a duplicate
  generation executes.
