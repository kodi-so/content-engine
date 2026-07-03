import assert from "node:assert/strict";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
  buildCreateAgentStudioDraft,
  buildStudioTextOverlaysFromInput,
  selectCreateAgentStudioVisualArtifacts,
} from "../../../../convex/create/studio/studioComposition";

const overlayInput = {
  aspectRatio: "16:9",
  textOverlays: [
    { text: "Before", startSeconds: 0, endSeconds: 2, y: 10 },
    { caption: "After six months", startSeconds: 2, endSeconds: 5, y: 76 },
  ],
};

const overlays = buildStudioTextOverlaysFromInput(overlayInput, 5);
assert.equal(overlays.length, 2);
assert.equal(overlays[0].text, "Before");
assert.equal(overlays[1].text, "After six months");
assert.equal(overlays[0].startSeconds, 0);
assert.equal(overlays[1].endSeconds, 5);

const quotedOverlays = buildStudioTextOverlaysFromInput({
  brief: "Stitch the videos and add text 'Hook' then caption 'Payoff'.",
}, 8);
assert.deepEqual(quotedOverlays.map((overlay) => overlay.text), ["Hook", "Payoff"]);

const draft = buildCreateAgentStudioDraft({
  audioArtifacts: [
    {
      _id: "artifact_audio_1",
      data: {
        durationSeconds: 4.5,
        kind: "audio",
        mimeType: "audio/mpeg",
      },
      storageUrl: "https://example.com/voiceover.mp3",
      title: "Voiceover",
    },
  ] as unknown as Doc<"artifacts">[],
  aspectRatio: "16:9",
  input: overlayInput,
  imageArtifacts: [
    {
      _id: "artifact_image_1",
      data: {
        kind: "image",
        mimeType: "image/png",
      },
      storageUrl: "https://example.com/character.png",
      title: "Character Still",
    },
  ] as unknown as Doc<"artifacts">[],
  videoArtifacts: [
    {
      _id: "artifact_video_1",
      data: {
        durationSeconds: 2.5,
        mimeType: "video/mp4",
      },
      storageUrl: "https://example.com/clip-1.mp4",
      title: "Clip 1",
    },
    {
      _id: "artifact_video_2",
      data: {
        durationSeconds: 2.5,
        mimeType: "video/mp4",
      },
      storageUrl: "https://example.com/clip-2.mp4",
      title: "Clip 2",
    },
  ] as unknown as Doc<"artifacts">[],
});

assert.equal(draft.aspectRatio, "16:9");
assert.equal(draft.clips.length, 2);
assert.equal(draft.audioTracks.length, 1);
assert.equal(draft.audioTracks[0].title, "Voiceover");
assert.equal(draft.clips[0].trimStartSeconds, 0);
assert.equal(draft.textOverlays.length, 2);

const selectedByDefault = selectCreateAgentStudioVisualArtifacts({
  imageArtifacts: [
    {
      _id: "artifact_image_1",
      data: { kind: "image", mimeType: "image/png" },
      storageUrl: "https://example.com/character.png",
      title: "Character Still",
    },
  ] as unknown as Doc<"artifacts">[],
  input: {},
  videoArtifacts: [
    {
      _id: "artifact_video_1",
      data: { durationSeconds: 2.5, mimeType: "video/mp4" },
      storageUrl: "https://example.com/clip-1.mp4",
      title: "Clip 1",
    },
  ] as unknown as Doc<"artifacts">[],
});
assert.equal(selectedByDefault.videoArtifacts.length, 1);
assert.equal(selectedByDefault.imageArtifacts.length, 0);

const explicitlySelected = selectCreateAgentStudioVisualArtifacts({
  imageArtifacts: [
    {
      _id: "artifact_image_1",
      data: { kind: "image", mimeType: "image/png" },
      storageUrl: "https://example.com/character.png",
      title: "Character Still",
    },
  ] as unknown as Doc<"artifacts">[],
  input: { artifactIds: ["artifact_video_1", "artifact_image_1"] },
  videoArtifacts: [
    {
      _id: "artifact_video_1",
      data: { durationSeconds: 2.5, mimeType: "video/mp4" },
      storageUrl: "https://example.com/clip-1.mp4",
      title: "Clip 1",
    },
  ] as unknown as Doc<"artifacts">[],
});
assert.equal(explicitlySelected.videoArtifacts.length, 1);
assert.equal(explicitlySelected.imageArtifacts.length, 1);

console.log("Agent Create Studio composition contract passed");
