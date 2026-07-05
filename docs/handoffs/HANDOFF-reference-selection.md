# Handoff: Explicit reference selection for media generation (stop reference shotgunning)

## Problem (observed)

Thread flow: user pastes a gym locker-room selfie → agent generates image A (locker room)
→ agent generates image B (gym floor, black hair) → user says "Please make her brunette
and tan and white" (clearly meaning: edit image B, the most recent one).

The resulting fal request contained THREE `image_urls`: the originally pasted selfie,
image A, and image B. The edit model blended them and resurrected the locker-room
background the user had explicitly moved away from. The planner's prompt was semantically
correct ("Edit the previously generated image of the girl with black hair…") but the
executor attached everything.

## Root cause (three mechanisms, all verified in code)

1. **Thread-wide mention carryover.** `agentTurnContext` (`convex/create/agent.ts`
   ~line 148) flattens reference mentions from EVERY message in the thread;
   `applyAgentDecision` passes them to `recordPlannedTools`
   (`convex/create/agent/agentToolPlanning.ts`), which injects them into every planned
   tool call's input via `baseEnrichedInput` (`convex/create/planning.ts`).
   `resolveToolReferences` (`convex/create/references/referenceResolution.ts` line 166)
   resolves them into `imageReferences`. So the image pasted in message 1 rides along on
   every generation call in the thread, forever.

2. **Keyword heuristic.** `createGenerationRequestForToolCall`
   (`convex/create/execution/mediaGenerationExecution.ts` lines 134–150): if the brief
   matches `isRevisionBrief` (`/\b(revise|revision|change|update|modify|improve|redo|edit)\b/i`,
   line 67) — or `usePriorImageOutputs === true` — it attaches ALL prior ready image
   artifacts in the thread. The same heuristic attaches all prior videos for video mode
   (line 168) and all prior audio for audio mode (line 183). Lipsync unconditionally
   attaches all prior images + videos + audio (lines 197–234).

3. **Missing selector.** `media.generateImage`'s input schema
   (`convex/create/tools/registry.ts` ~line 328) only has the all-or-nothing
   `usePriorImageOutputs` boolean. `priorImageOutputIndex` exists only on
   `media.generateVideo` (~line 364), and `selectedPriorArtifacts`
   (`convex/create/execution/toolExecutionShared.ts` line 133) is only applied in the
   video branch. Meanwhile the artifact ledger
   (`convex/create/agent/agentTurnContextBuilder.ts`) tells the planner "Only Image #
   numbers correspond to priorImageOutputIndex" — implying selectivity the image tool
   doesn't have.

## Architecture principle for this change

**The planner decides references; the runtime is boring and literal.** The planner sees
the conversation, the artifact ledger (with stable Image # indexes), and the turn
progress. The executor must never infer semantic intent from prompt keywords. It resolves
exactly what the structured input selects, plus deterministic defaults described below.

## Changes

### 1 — Add index-based prior-image selection to `media.generateImage`

In `convex/create/tools/registry.ts`, add to the `media.generateImage` input schema:
- `priorImageOutputIndexes`: array of zero-based indexes into the prior generated images
  (the ledger's Image # numbers). Description: "Zero-based Image # indexes from the
  generated artifact ledger. Use this to edit or vary specific earlier generated images;
  only these images are attached as references."
- `priorImageOutputIndex`: single number, same meaning, convenience for the common
  single-image edit. Normalize to the array form.

Update the description of `usePriorImageOutputs` to discourage it except for genuine
all-prior style/continuity: "When true, attach ALL prior generated images as
continuity/style references. Prefer priorImageOutputIndexes when specific images are the
target."

Check `convex/create/tools/validateToolInput.ts` handles the new fields (a number-array
schema helper may need to be added alongside `numberSchema`/`objectArraySchema`).

### 2 — Replace the shared selector helper and wire it for image AND video

Replace/extend `selectedPriorArtifacts` in `toolExecutionShared.ts` with a helper that
supports both keys, e.g. `selectedPriorArtifactsByIndexes(artifacts, input)`:
- If `priorImageOutputIndexes` is a valid array of indexes → return exactly those
  artifacts (in the given order, dropping out-of-range indexes).
- Else if `priorImageOutputIndex` is a valid single index → that one artifact.
- Else → return `undefined` (meaning "no explicit selection", distinct from "selected
  nothing") so callers can distinguish.

In `createGenerationRequestForToolCall` (`mediaGenerationExecution.ts`), image branch:
- Explicit indexes present → attach only those prior images.
- Else `usePriorImageOutputs === true` → attach all prior images.
- Else → attach none. **Delete the `isRevisionBrief(brief)` condition for images.**

Video branch: keep the existing image-index selection (now via the shared helper, also
supporting the plural form).

### 3 — Remove the revision-keyword heuristic everywhere it exists

- **Image:** delete (covered in change 2).
- **Video:** delete the `isRevisionBrief` → attach-all-prior-videos block (line 168).
  Add an explicit `usePriorVideoOutputs` boolean to `media.generateVideo`'s input schema
  ("When true, attach all prior generated videos in this thread as references, e.g. for
  a revision of an earlier video.") and attach prior videos only when it is true.
- **Audio:** delete the `isRevisionBrief` → attach-all-prior-audio block (line 183). Add
  an explicit `usePriorAudioOutputs` boolean to `media.generateAudio`, same pattern.
- Delete `isRevisionBrief` itself once unused.
- **Lipsync:** OUT OF SCOPE for this change — it unconditionally attaches all prior
  images/videos/audio and genuinely needs references to function; leave as-is and add a
  `TODO` comment noting it should move to explicit selection in a follow-up.

### 4 — Scope mention carryover: current-message mentions always, carried mentions only when nothing explicit is selected

Rule: a tool call that explicitly selects prior outputs (`priorImageOutputIndexes` /
`priorImageOutputIndex` present, or `usePriorImageOutputs` / `usePriorVideoOutputs` /
`usePriorAudioOutputs` true) gets ONLY the mentions from the CURRENT user message
injected — carried-over mentions from earlier messages are suppressed. A call with no
explicit selection keeps today's behavior (thread-wide carryover), which preserves the
"generate a similar image to the one I pasted earlier" flow.

Do this at planning time, where mention injection already happens:
- `applyAgentDecision` (`convex/create/agent.ts`) currently passes
  `effectiveBrief.referenceMentions` (thread-wide) to `recordPlannedTools`. Also pass the
  current message's own mentions (`userMessage.referenceMentions`, already loaded in the
  mutation).
- In `recordPlannedTools` / `enrichPlannedToolInput`
  (`agentToolPlanning.ts` / `planning.ts`): per planned call, if the call's input has an
  explicit prior-output selection, inject only the current-message mentions as
  `referenceMentions`; otherwise inject the thread-wide set.
- Nuance this preserves: "combine the image I'm pasting NOW with Image #1" works — the
  current mention and the selected prior output both attach. Note `uniqueReferenceAssets`
  already dedupes by url+mimeType if the same image arrives via both paths.
- Do not touch explicit `input.references` the planner passes — those always resolve.

### 5 — Update the planner prompt modules (ships in the SAME change — critical)

Removing the keyword heuristic without teaching the planner the new field causes a WORSE
regression: an edit call with no references means `referenceCount === 0`, so
`effectiveQueuedModelForToolOutput` (`mediaGenerationExecution.ts` line 46) never appends
`/edit` to the fal model — the "edit" becomes pure text-to-image and generates a brand-new
random person. The prompt update is load-bearing, not polish.

In `convex/create/agent/agentPromptModules.ts` (`visual_continuity` module), revise the
prior-image guidance:
- Replace the video-centric `priorImageOutputIndex` bullets with tool-agnostic rules,
  e.g.: "When the user asks to edit, revise, or make a variation of a previously
  generated image, set input.priorImageOutputIndexes on the media.generateImage call to
  exactly the ledger Image # index(es) of the target image(s). The runtime attaches ONLY
  what you select — nothing is attached automatically."
- "Use input.usePriorImageOutputs=true only when ALL prior generated images should act as
  continuity/style references."
- "When the user's request targets an uploaded/pasted reference rather than a generated
  image, do not set prior-output fields; the referenced upload is attached via the
  message mentions."
- Add the video/audio equivalents for `usePriorVideoOutputs` / `usePriorAudioOutputs`
  ("when revising an earlier generated video/audio…").
- Keep the ledger sentence "Only Image # numbers correspond to priorImageOutputIndex" in
  `agentTurnContextBuilder.ts` consistent with the new field names (mention the plural
  form).

### 6 — Pin the ledger/executor index contract

The Image # indexes the planner sees and the indexes the executor resolves MUST agree.
Both derive from `readyArtifactsForThreadToolOutputs`
(`convex/create/execution/threadToolOutputs.ts` line 57), which iterates tool calls in
creation order — append-only, so indexes are stable across a turn. Two actions:

a) **Fix the index-shift hazard:** that function only includes requests with
   `status === "ready"`. `saveReadyOutputsForThread` patches requests to `"saved"`, so
   saving outputs mid-thread REMOVES them from the ledger and shifts every subsequent
   Image # index. Change the filter to `status === "ready" || status === "saved"` so
   indexes are durable. Audit call sites for behavior changes this causes
   (ledger, `buildTurnContextSections` image URLs, image/video/lipsync prior-artifact
   attachment — including saved images as selectable references is semantically correct
   in all of them).

b) **State and test the contract.** Add a comment on
   `readyArtifactsForThreadToolOutputs` that its ordering defines the ledger's Image #
   indexes AND the executor's index resolution, and must remain creation-ordered and
   append-only. Add a contract test (see Verification) asserting ledger lines and
   selector resolution agree on ordering.

## What NOT to change

- Keep thread-wide mention carryover as the default when no explicit prior-output
  selection exists (first-turn "similar image" flows depend on it).
- Do not reintroduce any prompt-keyword inference in the executor.
- Do not touch the tool_result/context changes from the agent-loop fix or the chat-UX
  rendering rules (see HANDOFF-agent-loop-fix.md / HANDOFF-chat-ux-cleanup.md if present).
- `media.lipsync` attachment behavior stays as-is (TODO comment only).

## Verification

- `npx tsc --noEmit` clean; `npm run test:e2e` passes.
- Extend `tests/e2e/create/agent/planning.e2e.ts`:
  - `selectedPriorArtifactsByIndexes`: plural array, single index, out-of-range dropped,
    absent → undefined.
  - Input normalization/validation for `priorImageOutputIndexes` (single → array; array
    of numbers validates against the schema).
  - Mention scoping: explicit selection → only current-message mentions injected;
    no selection → thread-wide mentions injected (test via the exported planning helpers).
  - Prompt contract: system prompt contains the new priorImageOutputIndexes guidance.
  - Index contract: given a synthetic artifact list, ledger Image # lines and
    selector resolution use the same ordering.
- Manual acceptance (reproduce the observed bug): paste a reference image → "generate a
  similar image" (turn 1 SHOULD attach the pasted image — carryover intact) → "generate
  another one with black hair" → "make her brunette and tan and white". Expected: the
  planner sets priorImageOutputIndexes=[<index of black-hair image>], and the fal request
  contains EXACTLY ONE image_url (the black-hair image). Also verify the fal model gets
  the `/edit` suffix (referenceCount is 1, not 0).
- Regression: "combine this with the first image" + a newly pasted image in that message
  → both the new mention and the selected prior image attach.
- Regression: save outputs mid-thread, then request an edit of an earlier image — the
  index still resolves to the same image (change 6a).
