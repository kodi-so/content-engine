# Handoff: Video tooling roadmap — captions, music ducking, transitions, Ken Burns, trims; Studio demoted to contextual editor

## Product principle

**The agent is the editor; the UI is the review-and-nudge surface.** Every editing
capability lands agent-first: it is expressed in the composition data model, settable
through `studio.compose` (and editable through `mediaOverlay.updateText`-style follow-up
tools), and rendered by the Remotion pipeline. The Studio UI then inherits the same
capability as a small direct-manipulation control — it exists so tiny corrections don't
require CapCut, not to compete with CapCut. We are explicitly NOT building: keyframe
animation, filters/LUTs, speed ramps, sticker libraries, or a freeform timeline editor.

Known escape hatch (deliberate, not a gap): TikTok-licensed trending sounds can only be
attached inside TikTok. Publishing must support "send as draft" so those posts arrive in
TikTok ready for a 10-second native edit. Everything else should finish in-app.

## Current state (verified)

- Composition model (`src/features/video-composer/videoComposerModel.ts`):
  `VideoComposerClip` (ordered, `trimStartSeconds`/`trimEndSeconds`),
  `VideoComposerAudioTrack` (start, trim, `volume`), `TimedTextOverlay`. Rendered by
  Remotion (`src/features/video-composer/remotion/`, `renderVideoComposition.ts`) in the
  browser and by the render worker (`services/studio-render-worker/`).
- **No transition concept anywhere** — every clip boundary is a hard cut.
- **No captions/transcription anywhere** — text overlays are manually specified blocks;
  nothing derives timed captions from audio or from a TTS script.
- **No music behavior** — audio tracks have static volume; no ducking.
- **Images in compositions are static** — no zoom/pan (Ken Burns).
- Agent side: `studio.compose` (`convex/create/studio/studioComposition.ts` →
  `buildCreateAgentStudioDraft`) builds clips/audio/text overlays. It always sets
  `trimStartSeconds: 0` and never sets trims from planner input. Text overlays go
  through the shared overlay layout designer (`convex/lib/overlayLayoutDesigner.ts`)
  with per-clip timing via `clipIndex`. The before/after two-clip use case (different
  text per clip) already works; the boundary is a hard cut.
- Follow-up edits: `mediaOverlay.updateText` patches text overlays on slideshows and
  Studio projects.

Implement phases in order. Each phase = data model + agent tool surface + Remotion
render + minimal UI control, in that order within the phase.

---

## Phase 1 — Composition model extensions (foundation)

Extend the shared composition types (client `videoComposerModel.ts` + the convex-side
draft builder + the `videoProjects` persistence validator — trace where the draft is
persisted and keep all three in sync):

```ts
export type ClipTransitionType = "cut" | "crossfade" | "dip_to_black" | "dip_to_white" | "whip";

export type VideoComposerClip = {
  // ...existing...
  transitionToNext?: { type: ClipTransitionType; durationSeconds: number }; // default cut
  kenBurns?: {                                    // image clips only
    direction: "zoom_in" | "zoom_out" | "pan_left" | "pan_right";
    intensity: "subtle" | "medium";               // maps to scale 1.05/1.12
  };
};

export type VideoComposerAudioTrack = {
  // ...existing...
  role: "voiceover" | "music" | "sfx";            // default "voiceover" for TTS artifacts, else "music"
  ducking?: { enabled: boolean; duckVolume: number }; // music volume under active voiceover, default 0.25
};

export type CaptionWord = { text: string; startSeconds: number; endSeconds: number };
export type CaptionSegment = { id: string; text: string; startSeconds: number; endSeconds: number; words?: CaptionWord[] };

export type VideoCompositionDraft = {
  // ...existing...
  captions?: {
    segments: CaptionSegment[];
    stylePreset: "clean_bold" | "karaoke_highlight" | "boxed_lines";
    zone: "center" | "bottom";                    // designer places within safe area
  };
};
```

All new fields optional so existing drafts remain valid. Add normalizers alongside the
existing ones (clamp transition duration 0.2–1.0s; ignore `kenBurns` on video clips;
clamp `duckVolume` 0–1).

## Phase 2 — Auto captions (highest value; ship first after Phase 1)

Two sources of word timing:

1. **Known-script path (TTS voiceovers).** When `media.generateAudio` produces a
   voiceover, we already have the exact text. Persist the source text on the audio
   artifact's `data` (verify it isn't already there). Caption generation v1 estimates
   word timing by distributing words across the measured audio duration weighted by
   word length (chars+1), which is accurate enough for short-form. If the TTS provider
   returns character/word timestamps (check each fal TTS endpoint — ElevenLabs exposes
   timestamps; verify for xAI TTS and Seed Speech), prefer real timestamps.
2. **Unknown-audio path (ASR).** New provider call for speech-to-text on fal (verify
   current endpoint — `fal-ai/whisper` or its successor — and that it returns word-level
   timestamps). Wrap it in the standard provider plumbing with cost metadata.

Backend:

- New pure module `convex/lib/captionTiming.ts`: `estimateCaptionSegments(text, durationSeconds)`
  (split into segments of ≤5 words / ≤2.5s, produce word timings) and
  `segmentsFromProviderTimestamps(...)`. Unit-test both.
- New agent tool `media.captions` in `convex/create/tools/registry.ts`:
  - input: `targetKind` ("video_project" | "auto"), optional `projectId`, `source`
    ("voiceover_script" | "transcribe"), `stylePreset`, `zone`, optional `language`.
  - behavior: resolves the target Studio project, finds the voiceover track's script
    (or transcribes the composited audio), writes `captions` onto the project draft.
  - plannerGuidance: "When the user asks for captions or subtitles on a video, use
    media.captions on the Studio project instead of creating individual text overlays.
    Use textOverlays only for titles, hooks, CTAs, and design text."
- `studio.compose` input gains `captions: "auto" | { stylePreset?, zone? }` so a single
  compose call can request captions without a second tool round-trip.

Remotion render:

- New `CaptionsLayer` component rendering `captions.segments` inside the platform safe
  area (reuse the safe-area constants from the overlay designer). Presets:
  - `clean_bold`: white 800-weight text, black stroke, one line per segment.
  - `karaoke_highlight`: same, with the currently-spoken word (from `words`) filled in
    an accent color — the TikTok look.
  - `boxed_lines`: solid rounded box behind each line.
- Captions render above clips, below text overlays.

UI (Studio editor): a Captions panel — preset picker (3 visual thumbnails), zone toggle
(center/bottom), per-segment text list with editable text and start/end fields, and a
"Regenerate captions" button. No word-level editing UI; editing a segment's text
re-estimates its word timing.

## Phase 3 — Music + ducking

- `media.generateAudio` mode "music" artifacts default to `role: "music"` when added by
  `buildCreateAgentStudioDraft`; TTS artifacts default to `role: "voiceover"`.
- Ducking is computed at render time: wherever a `voiceover`-role track is audible, all
  `music`-role tracks with `ducking.enabled` ramp to `duckVolume` with 0.3s ramps.
  Implement as a volume envelope in the Remotion audio components (both browser preview
  and worker render).
- `studio.compose` input: audio entries accept `role` and `ducking`; plannerGuidance:
  "When combining voiceover and music, keep both tracks full-length and rely on ducking;
  do not trim the music around speech."
- UI: per-audio-track role badge + volume slider + ducking toggle (visible on music
  tracks only).

## Phase 4 — Transitions

- Render: implement the 5 transition types in the Remotion composition. `crossfade` and
  dips are opacity fades over the overlap window; `whip` is a fast 0.3s directional
  slide+blur. Overlapping frames come from extending the outgoing clip's tail (use
  trimmed source when available; otherwise freeze the last frame — document this).
- Ensure total duration math stays consistent: transitions consume the overlap from the
  outgoing clip; `compositionDuration` and caption/overlay timing must use the adjusted
  boundaries. Update `clipBoundariesSeconds` passed to the overlay designer accordingly.
- `studio.compose`: clip entries accept `transitionToNext` (type + optional duration);
  plannerGuidance: "Default to cut. Use crossfade for softer mood shifts, dip_to_black
  for scene/time changes, whip for energetic reveals (e.g. before/after)."
- UI: a small button on each clip boundary in the timeline opening a popover: 5
  transition options (icons) + duration stepper.

## Phase 5 — Ken Burns on image clips

- Render: scale/translate animation across the clip's duration per `direction` +
  `intensity`. Subtle = 1.0→1.05 scale (or 5% pan), medium = 1.0→1.12.
- Default behavior: when `buildCreateAgentStudioDraft` adds an **image** clip and the
  input doesn't specify otherwise, set `kenBurns: { direction: "zoom_in", intensity: "subtle" }`
  — static full-frame stills read as broken in short-form video. Allow `kenBurns: null`
  in tool input to force static.
- UI: per-image-clip select (None / Zoom in / Zoom out / Pan left / Pan right) +
  subtle/medium toggle.

## Phase 6 — Agent-controllable trims

- `studio.compose` clip entries accept `trimStartSeconds` / `trimEndSeconds` (and
  `durationSeconds` for images). `buildCreateAgentStudioDraft` maps them through the
  existing normalizers instead of hardcoding `trimStartSeconds: 0`.
- plannerGuidance: "Use trims to cut dead air or select the strongest moment of a
  generated clip, e.g. seconds 2–6 of an 8-second generation."
- UI already supports trims; no UI work.

## Phase 7 — Studio demoted to contextual editor (UI design spec)

Goal: Studio stops being a destination; it becomes an inspector you land in from an
artifact and leave quickly.

1. **Remove the Studio/Video Composer entry from primary navigation**
   (`src/app/navigation.ts`). Keep the route (deep-linkable) but reach it only via:
   - **Agent chat**: every video/Studio-project artifact card gets an "Edit in Studio"
     action.
   - **Library**: same action on video project outputs.
   - **Automations approval queue**: "Edit" on a pending run's video opens its project.
2. **Editor chrome** (rework of the existing composer page, not a rebuild):
   - Header: project title, "Back to [chat|library|approvals]" (returns to the exact
     origin), autosave indicator, primary **Render** button (existing render request
     flow), and **"Ask the agent"** — a small inline prompt box that submits a message
     to the project's Create thread and closes the editor (round-trip escape hatch for
     anything the UI can't do).
   - Left: vertical strip of clip thumbnails with drag-reorder, per-clip trim handles
     (existing), transition dot between clips (Phase 4), Ken Burns select on image
     clips (Phase 5).
   - Center: preview player (existing) with safe-area guide overlay toggle (renders the
     9:16 top/bottom/right insets from the overlay designer constants).
   - Right: three stacked panels — **Text** (existing overlay list; click-to-select on
     the preview, drag to move, corner-drag to resize; edits write the same concrete
     block fields `mediaOverlay.updateText` uses), **Captions** (Phase 2 panel),
     **Audio** (Phase 3 panel).
3. **Scope guardrail**: no feature exists in the UI that the agent cannot set through
   `studio.compose` / follow-up tools. If a control is proposed that has no
   data-model backing, the data model comes first.

## Acceptance criteria

- Phase 2: "Add captions to this video" in chat produces karaoke-style captions aligned
  to the voiceover within ~200ms perceived accuracy on a 30s TTS voiceover; captions
  respect the bottom safe area; segment text is editable in the Studio panel.
- Phase 3: a composition with voiceover + music renders with music audibly ducked under
  speech and restored between lines, identically in browser preview and worker render.
- Phase 4: "Make a before/after video from these two clips with a whip transition"
  works end-to-end from chat; overlay/caption timings remain aligned to the adjusted
  clip boundaries.
- Phase 5: image clips animate by default; `kenBurns: null` from the agent yields a
  static frame.
- Phase 6: "Use seconds 2 to 6 of that clip" from chat produces the correct trim.
- Phase 7: Studio is reachable only from artifact contexts; the nav has no Studio
  entry; a text nudge (drag an overlay 5% up, hit Render) completes without touching
  chat; "Ask the agent" round-trips to the project's thread.
- Browser preview and worker render stay visually identical for every phase (shared
  Remotion composition code is the single source of truth).
