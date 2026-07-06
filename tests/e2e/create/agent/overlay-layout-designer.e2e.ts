import assert from "node:assert/strict";
import {
  designOverlayBlocks,
  designTimedOverlayBlocks,
} from "../../../../convex/lib/overlayLayoutDesigner";

const safeBlocks = designOverlayBlocks({
  medium: "slideshow_slide",
  aspectRatio: "9:16",
  blocks: [
    { role: "headline", text: "Desk posture fix", zone: "bottom" },
  ],
});
assert.equal(safeBlocks.length, 1);
assert.ok(safeBlocks[0].y + safeBlocks[0].height <= 78);
assert.ok(safeBlocks[0].x + safeBlocks[0].width <= 86);

const stacked = designOverlayBlocks({
  medium: "slideshow_slide",
  aspectRatio: "9:16",
  blocks: [
    { role: "body", text: "Supporting detail", zone: "top" },
    { role: "headline", text: "Main hook", zone: "top" },
    { role: "eyebrow", text: "Pilates", zone: "top" },
  ],
});
assert.deepEqual(stacked.map((block) => block.role), ["eyebrow", "headline", "body"]);
assert.ok(stacked[0].y < stacked[1].y);
assert.ok(stacked[1].y < stacked[2].y);

const [shortHeadline] = designOverlayBlocks({
  medium: "slideshow_slide",
  aspectRatio: "9:16",
  blocks: [{ role: "headline", text: "Short hook" }],
});
const [longHeadline] = designOverlayBlocks({
  medium: "slideshow_slide",
  aspectRatio: "9:16",
  blocks: [{ role: "headline", text: "A much longer headline that needs to shrink so it still fits inside a mobile-safe text area without crowding the frame" }],
});
assert.ok(longHeadline.fontSize < shortHeadline.fontSize);

const [solid] = designOverlayBlocks({
  medium: "slideshow_slide",
  aspectRatio: "4:5",
  contrastStrategy: "solid_scrim",
  blocks: [{ role: "cta", text: "Save this" }],
});
assert.equal(solid.backgroundStyle, "solid");
assert.equal(solid.strokeWidth, 0);
assert.equal(solid.backgroundOpacity, 0.55);

const timed = designTimedOverlayBlocks({
  medium: "video",
  aspectRatio: "9:16",
  totalDurationSeconds: 10,
  clipBoundariesSeconds: [3, 7, 10],
  blocks: [
    { role: "headline", text: "First clip", zone: "top", clipIndex: 0 },
    { role: "body", text: "Second clip", zone: "bottom", clipIndex: 1 },
  ],
});
assert.equal(timed[0].startSeconds, 0);
assert.equal(timed[0].endSeconds, 3);
assert.equal(timed[1].startSeconds, 3);
assert.equal(timed[1].endSeconds, 7);

const [explicit] = designOverlayBlocks({
  medium: "slideshow_slide",
  aspectRatio: "9:16",
  blocks: [
    { role: "headline", text: "Keep my frame", x: 20, y: 30, width: 60, height: 12, fontSize: 51 },
  ],
});
assert.equal(explicit.x, 20);
assert.equal(explicit.y, 30);
assert.equal(explicit.fontSize, 51);

console.log("Overlay layout designer contract passed");
