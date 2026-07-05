# Handoff: Model intelligence — curated roster, duration planning, multi-shot, native audio, user model control

## Problem

The Create agent currently has no model intelligence:

1. **Duration is blind.** `media.generateVideo`'s `durationSeconds` is "Optional target
   duration in seconds" with zero planner guidance. If omitted, fal's model default (~5s)
   applies. If set, `normalizeFalVideoDurationForModel`
   (`src/lib/generation/videoDurationConstraints.ts`) silently snaps it to the model's
   allowed values (planner asks Kling for 30s → gets 15s, never told). The planner cannot
   plan scene/dialogue timing because it doesn't know any model's duration options.
2. **Model choice is hardcoded.** Image default is `fal-ai/gemini-3.1-flash-image-preview`
   (`mediaGenerationExecution.ts` line 26); video is one plannerGuidance line hardcoding
   Kling v3 pro (`registry.ts` ~line 362) plus a deterministic t2v/i2v variant switch
   (`defaultCreateVideoModel`, `mediaGenerationExecution.ts` line 67). The planner can pass
   `input.model` but has never been told what exists. The scraped fal catalog
   (`providerModels` table via `convex/providers/falModelCatalog.ts`) feeds only the
   workflow-builder UI, never the agent.
3. **Multi-shot models are unused.** Current models (Kling 3.0 storyboard, Seedance 2.0,
   Sora 2) generate multiple scene cuts with consistent characters in ONE generation, with
   cleaner cuts than stitching separate clips. Our prompt actively forbids this:
   `agentPromptModules.ts` line 47 says "Use one video generation call only when the
   desired output is one coherent shot…" — correct for the previous model generation,
   wrong now.
4. **Audio is an afterthought.** Veo 3.1 / Sora 2 / Seedance 2.0 generate synchronized
   dialogue + sound in the same video generation. Our pipeline only knows the
   TTS-then-lipsync chain, `GenerateVideoInput` (`convex/providers/model.ts` line 117) has
   no audio field, and `media.lipsync` still attaches ALL prior images+videos+audio
   unconditionally (the TODO at `mediaGenerationExecution.ts` line 191).
5. **The user has no model control.** Workspace `aiGenerationSettings`
   (`convex/validators.ts` line 23) picks only a *provider* per mode, not a model. There
   is no way to say "use Sora for this one" in chat.

## Architecture principle

**One curated model roster is the single source of truth.** A hand-picked list of ~10–15
models (NOT the ~600 scraped `providerModels` rows) with typed capability metadata. It
feeds: (a) compact model cards in the planner prompt, (b) runtime defaults and
normalization, (c) the settings UI dropdowns, (d) the chat model-picker chips. The planner
chooses models/durations *informed by the roster*; the runtime stays boring and literal —
it enforces constraints and user overrides deterministically, never inferring intent from
prose. (Same principle as the reference-selection change.)

Implement in phases IN ORDER below. Each phase leaves the app working and shippable.

---

## Phase 1 — The model roster (foundation, everything depends on it)

New file `src/lib/generation/modelRoster.ts` (same placement pattern as
`videoDurationConstraints.ts`, which convex already imports — the roster must be
importable from BOTH `convex/**` and `src/**`).

```ts
export type RosterModelMode = "image" | "video" | "audio" | "lipsync";

export type RosterModel = {
  id: string;                       // stable roster key, e.g. "kling-v3-pro"
  label: string;                    // "Kling v3 Pro"
  mode: RosterModelMode;
  aliases: string[];                // lowercase match terms: ["kling", "kling 3", ...]
  // Video models often have per-variant fal ids; use whichever exist:
  falModelId?: string;              // single-id models (image/audio/lipsync)
  textToVideoModelId?: string;
  imageToVideoModelId?: string;
  referenceToVideoModelId?: string; // multi-reference models (Seedance 2.0)
  durationConstraint?: VideoDurationConstraint; // reuse the existing type
  aspectRatios?: string[];
  nativeAudio?: boolean;            // generates synchronized audio/dialogue
  multiShot?: boolean;              // supports multiple scene cuts in one generation
  maxReferenceImages?: number;
  approxCostPerSecondUsd?: number;  // optional, rough
  strengths: string;                // ONE short sentence for the model card
  isDefault?: boolean;              // at most one per mode
};
```

Seed roster (verify EVERY fal id and constraint against fal.ai model pages / the synced
`providerModels` table before finalizing — do NOT invent ids; the ones below already
appear in this codebase or its constraint table, the rest are candidates to confirm):

- **Image**: `fal-ai/gemini-3.1-flash-image-preview` (default; edit-capable via `/edit`),
  `fal-ai/gemini-3-pro-image-preview`, `fal-ai/nano-banana-pro`, `fal-ai/nano-banana-2`
  (all four are in `isEditableFalImageModel`).
- **Video**: Kling v3 pro (default; `fal-ai/kling-video/v3/pro/text-to-video` +
  `.../image-to-video`, 3–15s), Kling O3 (`kling-video/o3...`, quality tier — confirm
  variants), Seedance 2.0 (`fal-ai/bytedance/seedance-2.0/...` — the reference-to-video
  variant is already our lipsync default; multiShot, nativeAudio, up to 9 reference
  images, 15–20s — confirm variants + constraints), Sora 2 (`sora-2` t2v/i2v, durations
  4/8/12/16/20, nativeAudio, multiShot, physics strengths), Veo 3.1 (confirm fal id;
  ~8s max, best nativeAudio), Pixverse v6 (1–15s), LTX-2-19B (frameCount, long clips).
- **Audio**: `fal-ai/xai/tts/v1` (default TTS, current `DEFAULT_FAL_AUDIO_MODEL`); add one
  music model and one premium TTS if available on fal (confirm ids, e.g. ElevenLabs TTS).
- **Lipsync**: current default `fal-ai/bytedance/seedance-2.0/reference-to-video`; add a
  dedicated lipsync model if one is active on fal (confirm).

Also in this phase:

- Refactor `falVideoDurationConstraintForModel` to look up the roster first (match any of
  the model-id fields), keeping the existing substring fallbacks so non-roster override
  strings still normalize. `videoDurationConstraints.ts` stays the home of the
  normalization *functions*; the *data* migrates to the roster.
- Helpers: `rosterModelsForMode(mode)`, `rosterModelById(id)`,
  `resolveRosterModelAlias(text)` (lowercase includes-match over aliases + label),
  `defaultRosterModelForMode(mode)`.
- Contract test: roster integrity — unique ids/aliases, exactly one `isDefault` per mode,
  every video entry has a duration constraint and at least one video model id field.

## Phase 2 — Planner model cards + duration intelligence

**Model cards in the system prompt.** In `agentPromptModules.ts`, add a fourth module
`model_selection` (add to `AgentPromptModuleName`, `ALL_AGENT_PROMPT_MODULES`, and
`selectPromptModules` — include it whenever `visual_continuity` is included). Its content:
a short rules preamble plus a compact JSON array of model cards built from the roster
(label, roster id, mode, allowed durations, aspect ratios, nativeAudio, multiShot,
maxReferenceImages, strengths, approx cost). Keep it dense — this is the planner's menu.
Rules preamble:

- "Choose the video/image model per tool call by setting input.model to the model's fal
  id from the card (for video, the runtime picks the text-to-video vs image-to-video
  variant automatically — pass the roster id or either variant id)."
- "Pick durations ONLY from the model's allowed values. Derive each clip's duration from
  its content: spoken dialogue runs ~2.5 words/second; add time for actions and camera
  moves. Always set durationSeconds explicitly for video calls — never rely on defaults."
- "If the user names a model, resolve it against the model cards and use it."

**Runtime accepts roster ids.** In `mediaGenerationExecution.ts`, before
`defaultCreateVideoModel`: if `input.model` matches a roster id or alias, map it to the
concrete fal id (for video, defer variant choice to the existing
`referenceImageCount > 0` switch, now generalized to read the roster entry's
`textToVideoModelId`/`imageToVideoModelId`). Unknown strings pass through unchanged
(power-user escape hatch).

**Make the duration snap visible.** In `createGenerationRequestForToolCall`, when
`normalizedCreateDurationSeconds` changes the requested value, record BOTH on the tool
output: `requestedDurationSeconds` and `durationSeconds`. Include a short note in the
tool_result completion message (built in `completionMessageForToolResult`,
`convex/create/agent.ts`) when they differ, e.g. "(duration adjusted from 30s to 15s —
model max)" so the planner learns the constraint mid-turn instead of silently drifting.

**Registry description update.** `registry.ts` `durationSeconds` description becomes:
"Target duration in seconds. Required in practice for video: choose an allowed value for
the selected model from the model cards." Delete the hardcoded Kling plannerGuidance line
(~362) — superseded by model cards.

## Phase 3 — Multi-shot routing (prompt-only, cheap, rides on Phase 2)

In `agentPromptModules.ts` `visual_continuity`, replace the line
"Use one video generation call only when the desired output is one coherent shot…" with:

- "Use ONE video generation call for: a single coherent shot; OR a short multi-scene
  sequence on a multiShot-capable model (see model cards) when the total duration fits
  within that model's maximum and the scenes share one continuous audio/mood. Describe
  each shot and where the cut happens directly in the prompt (e.g. 'Shot 1 (0–5s): …
  Cut to Shot 2 (5–10s): …'). Multi-shot generations keep characters consistent across
  cuts automatically."
- "Prefer separate per-scene generations + Studio assembly when: total duration exceeds
  the model max, scenes need different aspect ratios or models, the user is iterating
  scene-by-scene, or individual scenes may need re-generation later (a multi-shot
  generation can only be re-rolled as a whole)."
- Keep the stills-first continuity rules unchanged; they still apply to the per-scene
  path, and multi-shot models still accept reference stills.

Add a `multiShot` note to the affected model cards' strengths so the planner connects the
rule to concrete models. No runtime changes in this phase.

## Phase 4 — Native audio + audio/lipsync accounting

### 4a — Native audio on video generation

- `registry.ts` `media.generateVideo` input: add
  `nativeAudio: booleanSchema("When true and the selected model supports it, generate synchronized audio (dialogue, ambient sound) in the same video generation. Put spoken dialogue in the prompt as quoted lines with speaker attribution.")`.
- `convex/providers/model.ts` `GenerateVideoInput`: add `nativeAudio?: boolean`.
- Thread it: `createGenerationRequestForToolCall` reads `input.nativeAudio` (only for
  mode "video", only when the resolved model's roster entry has `nativeAudio: true` —
  drop it otherwise) → store on the `generation` object → the request-execution path
  (`convex/content/requestExecution/requestExecutionHelpers.ts`) passes it into the
  provider input → `falVideoPayload` (`convex/providers/fal/payloads.ts`) maps it to the
  per-model provider param. Param names differ per model (Veo exposes a
  `generate_audio`-style boolean; Sora 2 always generates audio; Seedance 2.0 — confirm
  via fal schema). Add a small map in `payloads.ts` keyed by model-id substring, mirroring
  how duration constraints are keyed. For models that ALWAYS generate audio, send nothing.
- Planner guidance (append to the `model_selection` module):
  - "For scenes with characters speaking, prefer a nativeAudio-capable model with
    input.nativeAudio=true and the dialogue quoted in the prompt. This produces
    synchronized speech, lip movement, and ambient sound in one generation."
  - "Use the separate media.generateAudio + media.lipsync chain only when: a specific or
    cloned voice is required, a voiceover spans multiple clips or a montage, the chosen
    video model lacks native audio, or the user asks to change speech on an existing
    video."

### 4b — Extend the artifact ledger to videos and audio

Currently only images get stable indexes ("Image #N"). Videos/audio can't be addressed,
which blocks explicit lipsync selection and makes `usePriorVideoOutputs` all-or-nothing.

- In `buildTurnContextSections` (`agentTurnContextBuilder.ts`): build `Video #N` and
  `Audio #N` ledger lines the same way as images (via
  `readyArtifactsForThreadToolOutputs(ctx, thread, undefined, "video" | "audio")`), before
  the leftover "Artifact N" lines. Update the ledger header sentence to: "Image #, Video #,
  and Audio # numbers are the only valid values for the priorOutput index fields."
- The index contract from the reference-selection change (creation-ordered, append-only,
  includes "saved") applies identically — extend the existing contract test to the new
  sections.

### 4c — Explicit prior-output selection for video/audio + lipsync (closes the TODO)

- Generalize `selectedPriorArtifactsByIndexes` (`toolExecutionShared.ts`) to take the
  input key names (e.g. `(artifacts, input, "priorVideoOutputIndexes",
  "priorVideoOutputIndex")`) so one helper serves images, videos, and audio.
- `media.generateVideo`: add `priorVideoOutputIndexes` / `priorVideoOutputIndex`
  ("Zero-based Video # ledger indexes; attach specific earlier generated videos as
  references, e.g. to extend or revise them."). Selection precedence identical to images:
  explicit indexes → those; else `usePriorVideoOutputs === true` → all; else none.
- `media.generateAudio`: add `priorAudioOutputIndexes` / `priorAudioOutputIndex`, same
  pattern alongside the existing `usePriorAudioOutputs`.
- `media.lipsync`: add `priorImageOutputIndex`, `priorVideoOutputIndex`,
  `priorAudioOutputIndex` (singular is enough — lipsync takes one visual source and one
  audio). In `createGenerationRequestForToolCall`'s lipsync branch: when ANY selector is
  present, attach exactly the selected artifacts (plus current-message mentions) and skip
  the attach-all blocks; when none are present, keep today's attach-all fallback (lipsync
  genuinely needs references, so failing closed is worse). Remove the TODO comment.
- Prompt (visual_continuity): "For media.lipsync, set priorImageOutputIndex or
  priorVideoOutputIndex to the visual source and priorAudioOutputIndex to the speech
  audio. Only the selected artifacts are used."
- Mention-scoping parity: the planning-time rule from the reference-selection change
  (explicit prior-output selection → only current-message mentions injected) must treat
  the new video/audio selector fields as "explicit selection" too — update the predicate
  where `recordPlannedTools`/`enrichPlannedToolInput` checks for it.

## Phase 5 — User model control (settings default + chat chip picker)

### 5a — Workspace default models

- `aiGenerationSettingsValidator` (`convex/validators.ts`): add optional `imageModel`,
  `videoModel`, `audioModel`, `lipsyncModel` (roster ids, validated on write against the
  roster in the workspace settings mutation — reject unknown ids).
- `mediaGenerationExecution.ts`: add `modelForMediaMode(workspace, mode)` next to
  `providerForMediaMode`; it resolves the roster id to fal id(s). Use it wherever the
  hardcoded defaults live today: `DEFAULT_CREATE_FAL_IMAGE_MODEL` usage and
  `defaultCreateVideoModel` (workspace default roster entry supplies the t2v/i2v variant
  ids). Audio/lipsync: same treatment for `DEFAULT_FAL_AUDIO_MODEL` /
  `DEFAULT_FAL_LIPSYNC_MODEL` — the create path should pass the resolved model instead of
  relying on provider-level constants.
- `SettingsPage.tsx` already edits `aiGenerationSettings` — add per-mode model dropdowns
  fed from `rosterModelsForMode` (label + strengths as helper text).

### 5b — Chat model chips (the picker UX)

Reuse the existing mention machinery — `RichMentionTextarea`
(`src/components/references/RichMentionTextarea.tsx`) already supports multiple
`triggerChars` (default `["@"]`) and exposes which trigger opened the popover
(`activeMention.mention.trigger`, ~line 182).

- **Trigger**: pass `triggerChars={["@", "/"]}` from `AgentCreatePrompt.tsx`. When the
  active trigger is `/`, show ONLY model options; when `@`, show ONLY reference/asset
  options (current behavior). This needs a filter hook in `RichMentionTextarea` or in the
  option list the caller passes — add an optional `trigger?: string` field to the option
  type and filter in the popover; keep it minimal. If threading the trigger through turns
  out invasive, fallback plan: put models in the same `@` popover as a separate "Models"
  group at the bottom. `/` at the start of empty input may collide with users typing
  literal slashes mid-URL — only open the model popover when `/` starts a word (same
  word-boundary rule the `@` trigger already uses).
- **Options**: build model mention options in `AgentCreateSurface.tsx` from the roster
  (import from `src/lib/generation/modelRoster.ts`): label, roster id, mode. Selecting one
  snaps a chip into the text exactly like reference chips (token via
  `mentionTokenForLabel`).
- **Data model**: extend `createReferenceMentionValidator` `entityType` union with
  `"model"`; `entityId` = roster id; `mediaType`/`storageUrl` unset. Model mentions ride
  the existing `referenceMentions` submit path — no new API surface.
- **Backend guards**: `resolveToolReferences` (`referenceResolution.ts`) must skip
  `entityType === "model"` mentions (they are not media references). Audit anything else
  that consumes mentions generically (`buildEffectiveBrief`, `messagesForModel` image
  attachment) — model mentions must be inert there.
- **Enforcement (runtime, not prompt)**: at planning time in
  `recordPlannedTools`/`enrichPlannedToolInput` (`agentToolPlanning.ts` / `planning.ts`):
  for each model mention on the CURRENT user message, override `input.model` with the
  resolved model on every planned tool call whose mode matches the mention's roster mode
  (image mention → media.generateImage calls, video mention → media.generateVideo, etc.).
  This is deterministic — the chip wins even if the planner picked something else. Chips
  scope to that message's turn only; carried-over model mentions from earlier messages are
  ignored (only read them from `userMessage.referenceMentions`).
- **Planner context**: also surface it in `buildTurnContextSections`' contextBlock:
  "User-selected model for this request: Kling v3 Pro (video)." so the plan and durations
  are consistent with the enforced model.
- **Typed fallback**: with model cards (Phase 2) the planner already resolves "use sora
  for this" by itself; `resolveRosterModelAlias` + the runtime roster-id mapping make the
  typed path work without the chip. No extra work beyond Phase 2.

Precedence, lowest to highest: hardcoded default → workspace default model → planner's
`input.model` → current-message model chip.

## What NOT to change

- The duration clamp stays as the runtime safety net even after the planner is informed.
- The deterministic t2v/i2v variant switch stays (generalized to roster variants, not
  removed).
- Stills-first visual continuity rules stay; multi-shot is an additional route, not a
  replacement.
- No executor keyword/semantic inference anywhere — all new behavior is driven by
  structured input, roster data, or user chips.
- Do not surface the scraped `providerModels` table to the agent; the curated roster only.
- Reference-selection semantics from HANDOFF-reference-selection.md stay intact (Phase 4c
  extends the same pattern; it must not regress image selection or mention scoping).

## Verification

Per phase: `npx tsc --noEmit` clean, `npm run test:e2e` passes.

Contract tests to add (extend `tests/e2e/create/agent/planning.e2e.ts` or a sibling):
- Roster integrity (Phase 1, described above).
- System prompt contains model cards + duration rules when `model_selection` is selected
  (Phase 2).
- Roster id / alias → fal id resolution incl. video variant choice by reference count
  (Phase 2).
- Tool output records `requestedDurationSeconds` vs `durationSeconds` when snapped
  (Phase 2).
- Ledger renders Video #/Audio # sections; index contract holds across types (Phase 4b).
- Generalized selector helper for video/audio keys; lipsync explicit-selection vs
  attach-all fallback (Phase 4c).
- `nativeAudio` dropped for non-capable models, mapped to the right fal param for capable
  ones (Phase 4a).
- Model mention: skipped by reference resolution; overrides `input.model` on
  mode-matching calls; ignored when carried over from earlier messages (Phase 5b).
- Workspace default model plumbed into generation when planner passes no model (Phase 5a).

Manual acceptance:
1. **Duration intelligence**: "Make a 12-second video of a chef plating a dish, then a
   close-up of the sauce" → planner sets explicit durations allowed by the chosen model;
   if it requests an unsupported value, the tool_result shows the adjustment note.
2. **Multi-shot**: same request on Seedance 2.0/Kling 3.0 → ONE generation whose prompt
   describes both shots and the cut, not two stitched clips.
3. **Native audio**: "Create a video of a woman saying 'welcome back to my channel'" →
   single nativeAudio generation with quoted dialogue in the prompt; no TTS or lipsync
   calls.
4. **Lipsync selection**: thread with 2 images + 1 audio → "lipsync the second image to
   the audio" → fal request contains exactly that image + that audio.
5. **Chip**: type `/`, pick "Sora 2", send "a cat surfing" → fal request uses the sora-2
   model id and a duration from {4,8,12,16,20}; chip renders in the sent message.
6. **Settings default**: set workspace video model to Veo → a prompt-only video request
   with no chip and no model mention uses Veo.
7. **Typed override**: "use kling for this one" with no chip → Kling model id in the fal
   request.

## Recommended implementation order (restated)

1 (roster) → 2 (model cards + duration) → 3 (multi-shot prompt) → 4 (native audio +
ledger + lipsync) → 5 (user control). Phase 5 only depends on Phase 1 and can be built in
parallel with 3–4 if desired. Ship and manually verify each phase before the next; 2 and 3
change planner behavior and are the highest-leverage/lowest-code phases.
