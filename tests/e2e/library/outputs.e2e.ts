import assert from "node:assert/strict";
import type { ArtifactDoc, SlideshowDoc } from "../../../src/types";
import {
  createOutputsFromArtifacts,
  textDraftOutputsFromArtifacts,
} from "../../../src/features/library/libraryOutputs";
import { visibleLibrarySlideshows } from "../../../src/features/library/librarySlideshows";

function artifact(overrides: Partial<ArtifactDoc>): ArtifactDoc {
  return {
    _creationTime: 1,
    _id: "artifact-base",
    createdAt: 1,
    reviewStatus: "not_required",
    type: "text_draft",
    updatedAt: 1,
    userId: "user-1",
    ...overrides,
  } as ArtifactDoc;
}

const legacyDraft = artifact({
  _id: "artifact-legacy",
  createdAt: 10,
  data: { text: "Legacy run draft" },
  title: "Legacy draft",
  type: "scene_spec",
});
const savedDraft = artifact({
  _id: "artifact-saved",
  createdAt: 20,
  data: { text: "Saved pending draft" },
  lifecycle: "saved",
  reviewStatus: "pending",
  title: "Saved draft",
  type: "script",
});
const debugDraft = artifact({
  _id: "artifact-debug",
  data: { text: "Internal trace" },
  lifecycle: "debug",
});

const drafts = textDraftOutputsFromArtifacts([legacyDraft, savedDraft, debugDraft]);
assert.deepEqual(
  drafts.map((draft) => String(draft.artifactId)),
  ["artifact-saved", "artifact-legacy"],
  "Saved drafts and legacy durable drafts should be visible, but debug text should stay hidden"
);
assert.equal(drafts[0]?.reviewStatus, "pending");
assert.equal(drafts[1]?.text, "Legacy run draft");

const media = artifact({
  _id: "artifact-image",
  data: { mimeType: "image/png", source: "create_page" },
  lifecycle: "saved",
  storageUrl: "https://example.com/image.png",
  type: "image",
});
assert.equal(createOutputsFromArtifacts([media]).length, 1);
assert.equal(createOutputsFromArtifacts([savedDraft]).length, 0);

function slideshow(overrides: Partial<SlideshowDoc>): SlideshowDoc {
  return {
    _creationTime: 1,
    _id: "slideshow-base",
    createdAt: 1,
    spec: { format: "slideshow", slides: [] },
    status: "preview",
    title: "Slideshow",
    updatedAt: 1,
    userId: "user-1",
    ...overrides,
  } as SlideshowDoc;
}

const previewSlideshow = slideshow({
  _id: "slideshow-preview",
  status: "preview",
  updatedAt: 30,
});
const savedSlideshow = slideshow({
  _id: "slideshow-saved",
  status: "saved",
  updatedAt: 20,
});
const discardedSlideshow = slideshow({
  _id: "slideshow-discarded",
  status: "discarded",
  updatedAt: 40,
});

assert.deepEqual(
  visibleLibrarySlideshows([
    savedSlideshow,
    discardedSlideshow,
    previewSlideshow,
  ]).map((slideshow) => String(slideshow._id)),
  ["slideshow-preview", "slideshow-saved"],
  "Library should show generated previews and saved slideshows, but not discarded work"
);

console.log("Library exposes generated drafts and slideshow previews alongside saved media.");
