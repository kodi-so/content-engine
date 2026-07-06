import assert from "node:assert/strict";
import {
  estimateCaptionSegments,
  estimateSpeechDurationSeconds,
  segmentsFromProviderTimestamps,
} from "../../../../convex/lib/captionTiming";
import {
  designOverlayBlocks,
  designTimedOverlayBlocks,
  platformSafeInsets,
} from "../../../../convex/lib/overlayLayoutDesigner";
import {
  normalizeAudioDucking,
  normalizeClipKenBurns,
  normalizeClipTransition,
  normalizeCompositionCaptions,
} from "../../../../src/features/video-composer/videoComposerModel";

// --- caption timing: estimation from a known script ---

const script = "Start with the hundred. Keep your core tight and breathe. Finish strong with a teaser hold!";
const segments = estimateCaptionSegments(script, 10);

assert.ok(segments.length >= 3, "long script splits into multiple segments");
assert.equal(segments[0].startSeconds, 0, "first segment starts at zero");
const lastSegment = segments[segments.length - 1];
assert.ok(
  Math.abs(lastSegment.endSeconds - 10) < 0.01,
  `caption timing spans the full audio duration (got ${lastSegment.endSeconds})`
);
for (const segment of segments) {
  assert.ok(segment.words.length <= 5, "segments cap at 5 words");
  assert.ok(segment.endSeconds > segment.startSeconds, "segments have positive duration");
  assert.ok(segment.words.length > 0, "segments carry word timing for karaoke styling");
}
for (let index = 1; index < segments.length; index += 1) {
  assert.ok(
    segments[index].startSeconds >= segments[index - 1].endSeconds - 0.001,
    "segments do not overlap"
  );
}

// Sentence punctuation forces a break even under the word cap.
const sentenceSegments = estimateCaptionSegments("One two. Three four five six seven.", 4);
assert.equal(sentenceSegments[0].text, "One two.", "sentence end breaks the segment");

// Duration estimation fallback.
assert.ok(
  Math.abs(estimateSpeechDurationSeconds("one two three four five") - 2) < 0.01,
  "speech duration estimates at 2.5 words per second"
);

// --- caption timing: provider word timestamps ---

const providerSegments = segmentsFromProviderTimestamps([
  { word: "Hello", start: 0, end: 0.4 },
  { word: "there.", start: 0.4, end: 0.9 },
  { text: "Big", timestamp: [1.1, 1.3] },
  { text: "finish", timestamp: [1.3, 1.8] },
]);
assert.equal(providerSegments.length, 2, "provider timestamps split on sentence end");
assert.equal(providerSegments[0].text, "Hello there.");
assert.ok(Math.abs(providerSegments[1].startSeconds - 1.1) < 0.001);

// --- composition normalizers ---

assert.equal(normalizeClipTransition({ type: "cut" }), undefined, "cut normalizes to no transition");
assert.deepEqual(
  normalizeClipTransition({ type: "crossfade", durationSeconds: 5 }),
  { type: "crossfade", durationSeconds: 1 },
  "transition duration clamps to 1s max"
);
assert.deepEqual(
  normalizeClipTransition({ type: "whip", durationSeconds: 0.9 }),
  { type: "whip", durationSeconds: 0.3 },
  "whip is fixed at 0.3s"
);

const imageClip = { mediaKind: "image" as const, storageUrl: "https://example.com/a.png" };
const videoClip = { mediaKind: "video" as const, storageUrl: "https://example.com/a.mp4" };
assert.deepEqual(
  normalizeClipKenBurns(imageClip, { direction: "zoom_in", intensity: "medium" }),
  { direction: "zoom_in", intensity: "medium" }
);
assert.equal(
  normalizeClipKenBurns(videoClip, { direction: "zoom_in" }),
  undefined,
  "Ken Burns is ignored on video clips"
);

assert.deepEqual(
  normalizeAudioDucking({ enabled: true }),
  { enabled: true, duckVolume: 0.25 },
  "ducking defaults duckVolume to 0.25"
);
assert.equal(normalizeAudioDucking({ enabled: false }), undefined);

const captions = normalizeCompositionCaptions(
  {
    segments: [
      { text: "Hello", startSeconds: 0, endSeconds: 1 },
      { text: "", startSeconds: 1, endSeconds: 2 },
      { text: "World", startSeconds: 50, endSeconds: 60 },
    ],
    stylePreset: "karaoke_highlight",
    zone: "center",
  },
  10
);
assert.ok(captions, "captions normalize");
assert.equal(captions!.segments.length, 2, "empty segments are dropped");
assert.equal(captions!.segments[1].endSeconds, 10, "segment timing clamps to duration");
assert.equal(captions!.stylePreset, "karaoke_highlight");
assert.equal(captions!.zone, "center");

// --- overlay designer: safe areas and clip-aligned timing ---

const insets = platformSafeInsets("9:16");
assert.equal(insets.bottom, 22, "9:16 bottom safe inset covers caption/action UI");

const designed = designOverlayBlocks({
  medium: "slideshow_slide",
  aspectRatio: "9:16",
  blocks: [
    { role: "headline", text: "Grow your glutes" },
    { role: "cta", text: "Save this workout", zone: "bottom" },
  ],
});
assert.equal(designed.length, 2);
for (const block of designed) {
  assert.ok(block.y + block.height <= 100 - insets.bottom + 0.001, "blocks stay above bottom safe inset");
  assert.ok(block.y >= insets.top - 0.001, "blocks stay below top safe inset");
}

const timed = designTimedOverlayBlocks({
  medium: "video",
  aspectRatio: "9:16",
  blocks: [
    { role: "headline", text: "BEFORE", clipIndex: 0 },
    { role: "headline", text: "AFTER", clipIndex: 1 },
  ],
  totalDurationSeconds: 10,
  clipBoundariesSeconds: [4, 10],
});
assert.equal(timed.length, 2);
assert.equal(timed[0].startSeconds, 0, "clip 0 overlay starts at clip 0");
assert.ok(Math.abs(timed[0].endSeconds! - 4) < 0.01, "clip 0 overlay ends at the boundary");
assert.ok(Math.abs(timed[1].startSeconds - 4) < 0.01, "clip 1 overlay starts at the boundary");

console.log("Caption timing and composition model contract passed");
