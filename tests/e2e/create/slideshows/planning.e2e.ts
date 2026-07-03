import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCanonicalSlideshowSpec } from "../../../../convex/content/slideshow/slideshowAdapter";
import { normalizePlan } from "../../../../convex/content/planning";
import {
  overlaySlideshowPlanSchema,
  singleOverlayImagePromptWriterSchema,
  type SlideshowPlannerOutput,
  type SingleImagePromptWriterOutput,
} from "../../../../convex/content/types";
import {
  promptForSlide,
  providerImagePrompt,
} from "../../../../convex/content/requestExecution/requestExecutionHelpers";

type JsonSchema = {
  additionalProperties?: boolean;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string;
};

function assertStrictStructuredSchema(schema: JsonSchema, path = "schema") {
  if (schema.type === "object" || schema.properties) {
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];
    const missing = Object.keys(properties).filter((key) => !required.includes(key));

    assert.deepEqual(
      missing,
      [],
      `${path}.required must include every key in properties for strict structured output`
    );
  }

  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    assertStrictStructuredSchema(child, `${path}.properties.${key}`);
  }

  if (schema.items) assertStrictStructuredSchema(schema.items, `${path}.items`);
}

const plan: SlideshowPlannerOutput = {
  format: "slideshow",
  renderingMode: "background_plus_overlay",
  creativeBrief: {
    narrativePattern: "A routine carousel where each slide teaches one low-impact legs exercise.",
    targetSlideCount: 7,
    reasoning: "Exercise-group slideshows should behave like a compact app exercise library.",
    visualStyle: "Premium wellness app vector-style exercise illustrations.",
    tone: "calm, practical, beginner-friendly",
    layoutStrategy: {
      hookPlacement: "top",
      contentPlacement: "bottom",
    },
  },
  visualSystem:
    "Premium wellness app exercise library, soft off-white background, clean vector-style exercise illustrations, refined linework, subtle shading, muted sage/rose/charcoal palette, consistent female fitness model with brown ponytail, neutral workout clothes, yoga mat when needed.",
  title: "Legs Mobility + Strength",
  aspectRatio: "9:16",
  slides: [
    ["slide_01", "Routine hook", "Legs Mobility + Strength", "6 low-impact moves for hips, glutes, quads, and hamstrings."],
    ["slide_02", "Bodyweight squat", "Bodyweight Squat", "Sit the hips back, knees track over toes, chest tall."],
    ["slide_03", "Reverse lunge", "Reverse Lunge", "Step back softly, front foot planted, torso upright."],
    ["slide_04", "Glute bridge", "Glute Bridge", "Press through heels, lift hips, ribs down."],
    ["slide_05", "Side-lying leg raise", "Side-Lying Leg Raise", "Keep hips stacked and lift with control."],
    ["slide_06", "Hamstring walkout", "Hamstring Walkout", "Bridge up, slowly walk heels away and back."],
    ["slide_07", "Prescription", "Prescription", "2-3 rounds, 8-12 reps each, slow controlled tempo."],
  ].map(([slideId, purpose, headline, body], index) => ({
    slideId,
    purpose,
    useReferenceImage: false,
    textBlocks: [
      {
        id: `${slideId}_headline`,
        text: headline,
        x: 8,
        y: index === 0 ? 10 : 68,
        width: 84,
        height: 12,
        align: "left",
        fontSize: index === 0 ? 82 : 58,
        fontWeight: 800,
        color: "#FFFFFF",
        strokeColor: "#111111",
        strokeWidth: 14,
        backgroundStyle: "none",
        backgroundColor: "#000000",
      },
      {
        id: `${slideId}_body`,
        text: body,
        x: 8,
        y: index === 0 ? 24 : 80,
        width: 84,
        height: 10,
        align: "left",
        fontSize: 38,
        fontWeight: 600,
        color: "#FFFFFF",
        strokeColor: "#111111",
        strokeWidth: 10,
        backgroundStyle: "none",
        backgroundColor: "#000000",
      },
    ],
    layout: {
      intent: `Show ${purpose} with generous negative space for editable overlay text.`,
      density: "medium",
      contrastStrategy: "shadow",
    },
  })),
};

const imagePrompts = {
  renderingMode: "background_plus_overlay",
  slides: plan.slides.map((slide): SingleImagePromptWriterOutput => ({
    slideId: slide.slideId,
    visualBrief: `Clean app-library illustration for ${slide.purpose}.`,
    backgroundPrompt: `Clean vector-style exercise illustration for ${slide.purpose}, consistent character, off-white background, generous negative space, no baked-in text.`,
  })),
};

assertStrictStructuredSchema(overlaySlideshowPlanSchema);
assertStrictStructuredSchema(singleOverlayImagePromptWriterSchema);

const normalized = normalizePlan(
  plan,
  imagePrompts,
  "Create a 7-slide vertical mobile fitness slideshow for a beginner-friendly legs routine.",
  undefined,
  "background_plus_overlay"
);

assert.equal(normalized.slides.length, 7);
assert.equal(normalized.renderingMode, "background_plus_overlay");
for (const slide of normalized.slides) {
  assert.equal(slide.renderingMode, "background_plus_overlay");
  assert.ok(slide.textBlocks.length > 0);
  for (const block of slide.textBlocks) {
    assert.equal(typeof block.height, "number");
    assert.ok(block.height >= 4 && block.height <= 96);
  }
  const imagePrompt = providerImagePrompt(
    promptForSlide(slide),
    normalized.aspectRatio,
    normalized.renderingMode
  );
  assert.match(imagePrompt, /Vertical 9:16 full-bleed image/);
}

const imageBySlideIndex = new Map(
  normalized.slides.map((slide) => [
    slide.index,
    {
      artifactId: `artifact_${slide.index}`,
      url: `https://example.com/slide-${slide.index}.png`,
    },
  ])
);
const spec = buildCanonicalSlideshowSpec({
  plan: normalized,
  dimensions: { width: 1080, height: 1920 },
  imageBySlideIndex,
});

assert.equal(spec.slides.length, 7);
assert.equal(spec.slides[0].backgroundImageUrl, "https://example.com/slide-1.png");

const bulkApisSource = readFileSync("convex/providers/modelProviders/bulkapis.ts", "utf8");
assert.match(
  bulkApisSource,
  /DEFAULT_BULKAPIS_CHAT_MODEL = "gpt-5-2"/,
  "BulkAPIs fallback must use the available gpt-5-2 model id"
);

console.log("Slideshow planning E2E contract passed");
