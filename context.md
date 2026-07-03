# Context Handoff

This document summarizes the long-running slideshow generation thread: what we tested, what we learned, what changed in the codebase, and the current product direction.

## Current Product Area

The active work is the slideshow creation workflow for a content platform that can generate TikTok-style vertical slideshows across any niche.

There are two production modes:

- `background_plus_overlay`: the image model generates the background/subject image and the app renders text blocks over it.
- `full_graphic_generation`: the image model generates the whole finished slide, including text, typography, layout, and graphic design.

The main user-facing workflow is:

1. User enters a prompt.
2. User selects a production mode.
3. User may select reference assets.
4. Planner creates a slideshow plan.
5. Image-prompt writer creates per-slide image prompts.
6. Image generator creates slide images.
7. App renders/edits/previews the slideshow.

## Core Product Philosophy Shift

The biggest conclusion from this thread is that the user prompt should drive creative output much more than the system prompt.

Earlier iterations tried to make the system prompt act like an all-knowing creative director. That produced over-authored, overfit, and sometimes "AI-looking" slideshows. The better long-term strategy is:

- System prompts provide the minimum production contract and glue.
- User prompts provide creative specificity.
- Planner preserves user intent, slide order, visual style, subjects, text, examples, references, and camera direction.
- Planner fills blanks only when the user leaves something unspecified.
- Image prompts should be direct, concrete, and faithful to the user prompt.

The platform should not expect a vague user prompt to magically reproduce a specific viral TikTok aesthetic. If the user wants something like a real viral slideshow, the user prompt should describe that reference style with enough specificity.

Long-term, this likely means the product should include either:

- A persistent assistant/agent inside the UI that helps users craft excellent prompts.
- A prompt-building skill/workflow that can inspect examples, screenshots, or a TikTok URL and produce a detailed slideshow prompt.
- A way for users to provide per-slide intent, example images, CTA inserts, and reference usage explicitly.

The planner should become more of a faithful compiler than a hidden creative author.

## Important User Preferences

These preferences were repeated many times and should guide future work:

- Avoid hard-coded niche libraries, curated exercise templates, or domain-specific logic.
- Avoid web retrieval for slideshow generation for now. This is not mission-critical content.
- Avoid fallback behavior that silently papers over invalid model output.
- Avoid hard-coded phrase sanitizers or brittle prompt cleanup.
- Avoid negative/avoid-style instructions in system prompts.
- Avoid overfitting system prompts to one example, such as badges, yellow mascot exercises, gym girl UGC, or specific TikTok references.
- Prefer generalizable prompt guidance: describe placement, camera angle, character positioning, typography, object relationships, scene details, and topic-specific visual details.
- Background plus overlay mode should not ask the image model to render text.
- Full graphic mode may ask the image model to render text.
- UGC/camera-roll style content usually belongs in `background_plus_overlay`, because app-rendered text is more reliable and UGC imagery should feel like real photos.
- Captions belong to post artifacts, not slideshow plans.
- Slide count should be semantically determined, with minimum 2 slides.
- Reference image usage should be per slide, explicit, and binary.

## Major Testing History

### Initial Test Matrix

The original six UI tests were:

1. Overlay mode, no reference.
2. Overlay mode, yellow mascot reference.
3. Overlay mode, gym girl reference.
4. Full graphic mode, no reference.
5. Full graphic mode, yellow mascot reference.
6. Full graphic mode, gym girl reference.

The most important early test was full graphic yellow mascot:

Prompt:

```text
Create a 6-slide fully designed TikTok slideshow called Top 5 Exercises For A Wide Back. Use the selected yellow superhero mascot reference consistently throughout. Generate each slide as a complete finished graphic with visible text included in the image. Use a clean light gray background, chunky black typography, yellow highlight words, small yellow "Save for later" badge, and bold fitness poster composition.

Slides:
1. Top 5 Exercises For A Wide Back
2. Exercise 1: Pull-Ups
3. Exercise 2: Lat Pulldowns
4. Exercise 3: Seated Rows
5. Exercise 4: Single-Arm Dumbbell Rows
6. Exercise 5: Chest-Supported Rows
```

### Yellow Mascot Exercise Findings

The first full-graphic outputs improved after prompt work but still had issues:

- Lat pulldown sometimes faced the wrong direction or showed incorrect machine positioning.
- Seated rows sometimes depicted the wrong equipment.
- Single-arm dumbbell rows were sometimes close but not anatomically correct.
- Chest-supported rows often failed: wrong bench, wrong body orientation, extra limbs, incorrect weights.
- Badge placement and typography varied across slides.

We concluded:

- Image models often need concrete scene mechanics, not just exercise names.
- Long prompts can help structure but can also become too wordy.
- The best image prompt for a complex visual is often concise but specific about body position, object placement, camera, and typography.
- Better image models helped meaningfully, but prompt quality still matters.

The ideal single-arm dumbbell row prompt became closer to:

```text
Create a complete vertical 9:16 comic fitness poster using the reference character.

Shared style:
Clean light gray background. Yellow superhero mascot reference with glossy yellow skin, black athletic shorts, smooth mask face, white eyes, crisp black outlines. Chunky bold condensed poster typography. Small yellow "Save for later" badge anchored bottom-right.

Visible text, exact line breaks:
Exercise 4:
Single-Arm Dumbbell Rows

Typography:
Place headline in the top-left safe area. "Exercise 4:" is black. "Single-Arm Dumbbell Rows" is entirely bright yellow with a thin black outline.

Scene:
Side-view single-arm dumbbell row. A flat black workout bench runs horizontally across the lower half of the image. The mascot's support-side knee and hand are planted on the bench. The opposite foot is planted on the floor beside the bench. Torso is long, flat, and nearly parallel to the bench. The working hand holds one black dumbbell, pulling it upward toward the hip. Elbow is bent and close to the ribs. Back, shoulder, and arm muscles are flexed.

Camera and framing:
Full body and full bench visible. Slight three-quarter side view, eye-level camera, centered composition. Mascot and bench occupy the middle of the frame, headline above.

Style consistency:
Finished bold comic fitness poster matching the yellow mascot slideshow style.
```

The important learning was not the exact exercise wording. The generalizable learning is that prompts should specify:

- The main subject.
- The exact action.
- The objects/equipment needed.
- Spatial relationships between body, objects, and environment.
- Camera angle and crop.
- Typography placement and treatment for full graphic mode.
- Which reference assets are actually used.

### Model Provider Work

We discussed using the latest/best image model. The app was moved toward a stronger image model path through fal.ai. There were timeouts when switching models, because the higher-quality model takes longer than the previous cheaper/faster one.

Current expectation:

- Better image model quality can help a lot.
- The better model may take materially longer.
- Timeouts need to be configured around the selected model's latency.
- Multiple minutes is not a great UX, but the tradeoff may be acceptable for high-quality generation.

### Overlay Mode Text Leakage

A major bug appeared in background plus overlay mode:

- Generated background images included text inside the image.
- The app then rendered text on top, creating duplicate text.

Root cause:

- Overlay image prompts inherited too much full-graphic/design language.
- Overlay prompts mentioned headline placement, typography, text overlays, and visual style instructions that caused image models to render text.

Fix direction:

- Overlay `backgroundPrompt` now focuses on the generated picture only.
- Text belongs in `textBlocks`.
- Full graphic mode has typography/text instructions.
- Background plus overlay mode does not describe graphic text layout in the image prompt.

### Gym Girl / Viral TikTok Comparison

The user compared generated "gym girl" slideshow outputs to a viral TikTok slideshow with millions of views.

The viral TikTok looked authentic because it used:

- Real camera-roll photos.
- Imperfect crops.
- Inconsistent but natural lighting.
- POV shots.
- Object closeups.
- Dark gym mirror selfies.
- Outdoor running selfies.
- Food closeups.
- Bathroom sink/toothbrush shots.
- Strength training photos.
- Treadmill POV.
- An app CTA screenshot slide.
- Large app-rendered white text with outline/shadow.

Generated outputs looked AI-generated because they were:

- Too polished.
- Too centered.
- Too clean.
- Too consistent.
- Too literal.
- Too staged.
- Too "creator posing in every slide."
- Often lacking real camera-roll messiness and variation.

The conclusion:

- For authentic UGC-like slideshows, the user prompt needs to explicitly ask for camera-roll imagery and varied per-slide scene types.
- The system prompt should preserve that specificity, not invent its own visual interpretation.
- A reference image of a person should only be used on slides where that person is visible.
- Object-only slides should not send unrelated subject reference images.

## Reference Image Architecture

We added slide-level reference usage.

### Previous Problem

If a reference image was selected, it could be sent to every slide generation. That caused problems for UGC/camera-roll slideshows:

- Fruit bowl slides could be influenced by the gym girl reference.
- Toothbrush/object slides could unnecessarily include or imply the person.
- The model might overuse the reference even when the slide should be object-only or POV.

### Current Design

Each slide now has:

```ts
useReferenceImage?: boolean
```

The planner schema requires a boolean. Normalized production slides store `true` when the reference should be used and omit the field otherwise.

The image generation request only sends selected reference assets for slides where `useReferenceImage === true`.

The regenerate UI exposes a checkbox:

```text
Use selected reference image
```

This lets the user override reference usage for a regenerated slide.

### Current Behavior

Reference should be true when:

- The selected character/person/mascot appears as the subject.
- A visible face, body, body part, or reflection is part of the image.
- The slide explicitly needs the selected reference identity or style.

Reference should be false when:

- The slide is an object closeup.
- The slide is a food/meal scene with no person visible.
- The slide is a phone/app screenshot placeholder.
- The slide uses the reference only as broad background context.

## Caption Decision

The `caption` field was removed from slideshow plan expectations.

Reasoning:

- Caption relates to posting/distribution context.
- A slideshow itself is an artifact.
- A post artifact can later use slideshow context to generate a caption.

Future post-generation can look at:

- Slideshow title.
- Slide text.
- Visual plan.
- Platform/account context.
- Campaign/CTA context.

Then it can create a caption at post time.

## Slide Count Decision

We hit an error:

```text
Planner output is invalid: expected at least 6 slides, received 5
```

This came from too rigid an assumption about minimum slide counts.

Current decision:

- Minimum slide count should be 2.
- There should not be a universal default that implies all slideshows have a semantic slide count hint.
- Most prompts may not specify a count.
- Planner should semantically infer count from prompt, explicit slide list, narrative structure, and content needs.

The preference is semantic LLM interpretation, not brittle string parsing.

## Prompt Chain Reset

The biggest implementation change in the latest work was resetting the planning and image-prompt chain.

### Before

The system prompt tried to encode a lot of creative direction:

- Viral TikTok styling.
- UGC-like camera roll heuristics.
- Full graphic typography details.
- Overlay layout ideas.
- Prompt-writing templates that could overpower the user prompt.

This made the system over-opinionated.

### Now

The planner prompt is much smaller.

It tells the planner:

- Create a production slideshow plan from the user's prompt.
- Treat the user prompt as the creative source of truth.
- Preserve named title/hook.
- Preserve explicit slide count, order, text, style, subjects, camera direction, references, and examples.
- Pair scene sequences with slide sequences by order.
- Fill unspecified choices with simple, coherent defaults.
- Use 9:16 for TikTok/Reels/Shorts/mobile.
- Choose slide count semantically.
- Set per-slide `useReferenceImage`.

Overlay mode instructions now:

- Use `background_plus_overlay`.
- Plan app-rendered copy.
- `primaryText` preserves explicit slide text.
- `secondaryText` and `bullets` only exist when requested or clearly described.
- For explicit title-only slide lists, secondary text is empty and bullets are empty.

Full graphic mode instructions now:

- Use `full_graphic_generation`.
- `visibleText` is the text inside the generated image.
- Match explicit user-provided slide text.
- Summarize finished graphic style in `visualSystem`.

Image prompt writer now:

- Receives the raw user prompt again.
- Receives the normalized plan.
- Writes direct prompts with concrete subjects, settings, objects, lighting, framing, style, and reference usage.
- Uses full graphic sections only for full graphic mode.
- Uses background-only sections for overlay mode.

## Current Code State

Modified files currently include:

- `convex/content/planning.ts`
- `convex/content/types.ts`
- `convex/content/requests.ts`
- `convex/content/dryRun.ts`
- `convex/content/formatContracts.ts`
- `src/components/SlideshowPreview.tsx`
- `src/pages/create/types.ts`
- `src/pages/create/useCreateSlideshow.ts`
- `src/types.ts`
- `docs/platform-architecture.md`
- `context.md`

The previous commit before this handoff was:

```text
5708e59 Improve create preview editing
```

Prior relevant commits:

```text
38617e1 Improve prompt-driven slideshow image generation
3e9ba8b Support prompt-driven slideshow generation modes
```

## Verification Performed

After the latest reset changes:

```text
npm run build
npx convex dev --once
```

Both passed.

Convex still shows a non-blocking warning:

```text
Warning: Unknown property in `node`: `version`
```

There is also a minor Convex update notice. This is unrelated to the slideshow work.

Dry runs were executed against a realistic camera-roll prompt. The final dry run used `openai/gpt-4.1` for both planner and image-prompt writer.

The final dry run showed:

- 7 slides preserved.
- Title/hook preserved.
- Explicit slide text preserved as primary text.
- Secondary text empty for title-only slide list.
- Bullets empty for title-only slide list.
- Reference true for visible gym girl mirror selfie.
- Reference true for visible gym girl running selfie.
- Reference false for fruit bowl, app/phone, bathroom sink, meal prep, treadmill POV.
- Prompt sections separated properly for overlay mode.

## Current Dry Run Prompt

Useful test prompt:

```text
Create a 7-slide TikTok slideshow similar to a real fitness creator camera roll. Use background plus overlay mode. The visual style should feel like imperfect phone photos from one person day: dark gym mirror selfie, outdoor running selfie, fruit bowl closeup, fixed app CTA placeholder, bathroom sink toothbrush shot, protein meal cutting board, treadmill POV. Use the selected gym girl reference only on slides where the creator is visibly in the image. Slides: 1. If I Had 3 Months To Get Fit Again 2. Run 5km 3x Per Week 3. Eat A Lot Of Fruit 4. Track Every Workout 5. Brush Teeth When Snacking 6. Be Intentional With Food 7. Walk 10,000 Steps
```

Expected behavior:

- Background plus overlay mode.
- Seven slides.
- Primary text exactly follows the slide list.
- No invented supporting text.
- No bullets.
- Slide 1 uses reference.
- Slide 2 uses reference.
- Slides 3-7 do not use reference unless visible person content is requested.
- Background prompts describe images, not typography or rendered text.

## Useful Future UI Tests

Retest the original matrix:

1. Overlay mode, no reference.
2. Overlay mode, yellow mascot reference.
3. Overlay mode, gym girl reference.
4. Full graphic mode, no reference.
5. Full graphic mode, yellow mascot reference.
6. Full graphic mode, gym girl reference.

Additional tests worth running:

1. Camera-roll UGC prompt with explicit scenes and explicit slide list.
2. Same prompt but less specific, to see how much the planner fills.
3. Full graphic yellow mascot exercise list with stronger image model.
4. Overlay yellow mascot exercise list, to ensure background prompts contain no generated text.
5. Object-only slide with selected person reference, to confirm reference is not sent.
6. Regenerate one visible-person slide with reference checked.
7. Regenerate one object-only slide with reference unchecked.
8. Switch production mode before generation and confirm the UI makes the mode obvious.

## Open Product/UX Issues

### Production Mode Confusion

The user accidentally generated in background plus overlay mode while expecting full graphic generation. This was a bad UX.

Potential fixes:

- Make selected production mode more visible at generation time.
- Show a pre-generation summary: mode, reference assets, estimated time, expected text behavior.
- Warn when prompt asks for "text included in the image" but mode is overlay.
- Warn when prompt asks for overlay text/readable app-rendered text but mode is full graphic.

This should be handled carefully without brittle phrase parsing. A semantic LLM classification or preflight check may be better.

### CTA Slides

The viral TikTok slideshow had a fixed app CTA slide. Future slideshow generation should support CTA slides as a first-class option.

Possible future design:

- User can provide a CTA asset/image.
- Planner can reserve a slide for it.
- AI generation is skipped for fixed CTA slide images.
- App renders text over fixed CTA slide or embeds it as a slide artifact.

### Prompt Assistant

The user sees a long-term need for an agent in the UI that knows how the platform works.

Potential assistant capabilities:

- Explain production modes.
- Ask clarifying questions before generation.
- Turn vague ideas into strong slideshow prompts.
- Analyze screenshots or TikTok examples.
- Produce per-slide prompts.
- Recommend when to use references.
- Recommend when to use overlay vs full graphic.
- Help regenerate individual slides.

This aligns with the new philosophy: the platform can help the user create better prompts, but the slideshow generation chain should preserve those prompts faithfully.

### Example-Based Prompting

Potential future workflow:

1. User uploads screenshots from a viral slideshow.
2. Agent analyzes the visual style, text style, framing, scene sequencing, and CTA pattern.
3. Agent produces a detailed user prompt.
4. Planner preserves that prompt and compiles it into a slideshow plan.
5. User can edit per-slide scenes before generation.

This is likely better than trying to bake "viral TikTok style" into the system prompt.

## Known Tradeoffs

### Stronger Planner Model

The planner now defaults to `openai/gpt-4.1` when `CONTENT_ENGINE_TEXT_MODEL` is not set. This improves semantic interpretation but costs more than `gpt-4o-mini`.

Reason:

- Planner quality matters.
- Reference usage and user-prompt preservation are semantic tasks.
- A weaker planner made brittle decisions around visible-person references and title preservation.

### Prompt Length

Prompt length clamping was removed from normalization.

Reason:

- Arbitrary limits were truncating useful image prompt detail.
- If limits are needed later, they should be model/provider-aware and explicit.

### No Fallbacks

Fallback behavior was removed or reduced where it could hide invalid planner output.

Reason:

- Silent continuation can create bad product behavior.
- If the prompt writer omits a slide or mismatches output, that should fail loudly.

## Next Recommended Steps

1. Keep testing prompt-driven slideshow creation across more niches before adding niche-specific logic.
2. Add a prompt-assistant workflow that can turn vague slideshow ideas, screenshots, or references into explicit per-slide creative briefs.
3. Add first-class CTA/fixed-media slide support instead of making the image model invent app screenshot slides.
4. Improve individual slide regeneration UX, because selective slide iteration is now the expected path from good first draft to postable output.
5. Consider showing a pre-generation mode summary/warning so users do not confuse background+overlay with full graphic generation.
6. Keep full-graphic exercise tests around as regression tests for typography, character consistency, and concrete exercise mechanics.

## Big Picture Direction

The platform should become a general content generation engine where:

- User intent is explicit and preserved.
- The system compiles intent into production artifacts.
- References are reusable assets, but applied per slide.
- Slideshows are artifacts.
- Posts are separate artifacts that can include captions, platform metadata, CTA context, and distribution plans.
- CTA/fixed-media slides become first-class.
- A prompt/creative assistant helps users get from vague intent to high-quality generation prompts.

The main risk to avoid is turning the planner into a hidden template system. The planner should understand the user's prompt, keep what is specified, and fill missing pieces conservatively.

## Latest Image Prompt Writer Update

After reviewing the first camera-roll UI output, we concluded that overlay image prompts were still too rigid and checklist-like. The prompt writer has now been adjusted so `background_plus_overlay` prompts are natural plain-text image descriptions instead of mandatory `### Create / ### Scene / ### Camera...` sections.

Key changes:

- Overlay prompt section-heading validation was removed; full-graphic prompt section validation remains.
- The image-prompt writer system prompt now asks for natural, concrete, faithful expansion of the user brief instead of rigid templates.
- Overlay background prompts now preserve app-rendered text separation while describing lived-in visual details such as imperfect crop, clutter, reflections, grain, lighting, and handheld framing when the user asks for camera-roll/UGC style.
- Planner instructions now preserve paired scene cues in each slide `purpose` and avoid turning object/detail scenes into person/reference scenes just because a person reference is selected.
- Fixed app/phone/screenshot/CTA placeholder prompts can include UI text inside the screen content without using the generic "No text or graphic overlays" ending.

Latest dry run against the 7-slide gym girl camera-roll prompt produced the target planning behavior:

- 7 slides.
- Primary text preserved exactly.
- No invented secondary text or bullets.
- Slide 1 and 2 use the gym girl reference.
- Slides 3-7 do not use the gym girl reference.
- Overlay background prompts are natural prose, not markdown-section checklists.
- Slide 5 remains a bathroom sink/toothbrush scene rather than a selected-person reference scene.

## Latest UI Test Results

### Camera-Roll Overlay Test

The 7-slide fitness camera-roll prompt was run in `background_plus_overlay` mode with the generated `Gym Girl v2` reference selected.

Result:

- The output was a meaningful improvement over earlier polished/staged generations.
- Slide sequence read like a real camera roll: gym mirror selfie, outdoor run selfie, fruit bowl, app/phone, bathroom sink, meal prep, treadmill.
- Reference usage worked as intended: creator-visible slides used the person reference, while object/detail slides did not.
- Object/detail slides were stronger and more believable after the natural prose prompt-writer update.
- Remaining issues were normal per-slide quality issues rather than architecture issues: slide 2 had some identity drift, and slide 7 leaned toward phone/app tracking instead of pure treadmill POV.

Conclusion:

- `background_plus_overlay` is now viable for UGC/camera-roll style slideshows when the user prompt gives clear scene sequencing.
- The next product improvement is selective slide regeneration and prompt-assistant support, not expanding system prompts.

### Full Graphic Yellow Mascot Test

The yellow mascot wide-back exercise slideshow was rerun in `full_graphic_generation` mode with the yellow mascot reference selected. The prompt removed the old "Save for later" badge requirement and instead focused on:

- Complete vertical 9:16 comic fitness posters.
- Consistent yellow superhero mascot as the main character.
- Clean light gray background.
- Chunky black typography with yellow highlight words.
- Concrete exercise mechanics for pull-ups, lat pulldowns, seated cable rows, single-arm dumbbell rows, and chest-supported dumbbell rows.

Result:

- The output looked solid and usable.
- Mascot consistency was good enough across slides.
- The poster system was coherent.
- Slide 3 seated cable rows was especially strong: clear equipment, clear body mechanics, readable text.
- Slide 4 single-arm dumbbell rows and slide 5 chest-supported rows were much closer than earlier attempts.
- Typography still varied somewhat, and side-card carousel dimming makes final inspection slide-by-slide important.

Conclusion:

- Full graphic mode is viable when the user prompt gives explicit visual system details and concrete subject/equipment mechanics.
- The old badge instruction should not be included by default; it distracts from the actual content unless the user asks for it.

## Latest Technical Fixes

### Reference Image Memory Fix

We hit this Convex error during generation:

```text
JavaScript execution ran out of memory (maximum memory usage: 64 MB)
```

Root cause:

- `content/requests:execute` fetched selected reference assets and converted them to base64 strings inside the Convex action.
- Large reference/source images can exceed Convex's 64 MB action memory limit.

Fix:

- `ReferenceAsset` now supports URL references.
- Slideshow execution now passes Convex storage URLs to fal.ai instead of materializing reference images as base64 in Convex.
- fal reference image handling now prefers URLs and only falls back to base64 data URLs when provided.
- Gemini still requires base64 reference images and now fails explicitly if URL-only references are sent to it.

### Create Page Layout Fix

The create page briefly had horizontal overflow and clipped content after reference assets were added and layout tweaks were attempted.

Current intent:

- The app shell uses normal sidebar + shrinkable workspace grid behavior.
- Top-level grids use shrink-safe/autofit columns where needed.
- Reference cards are small fixed-width cards inside an internal horizontal scroll strip, rather than stretching to fill the whole row.
- The whole page should not rely on hidden horizontal overflow to mask layout bugs.

## Latest Publishing Infrastructure Work

The slideshow editor is considered good enough for now. The active product direction shifted toward building the downstream posting/distribution loop so real TikTok account testing can teach us faster than continued editor polishing.

### Data Ownership Cleanup

We clarified the source-of-truth boundaries. The current consolidated reference
lives in `docs/platform-architecture.md`.

Current intended ownership:

- `contentRequests`: one-off creation job input/status. New rows link to `planArtifactId`; `plan` remains only for older/debug rows.
- `workflowRuns`: automation execution state and events.
- `artifacts`: immutable generated outputs and provenance.
- `slideshows`: mutable slideshow editor state.
- `distributionPlans`: publishing intent and post queue records.
- `postMetrics`: analytics snapshots.

The intended pipeline is:

```text
content request or workflow run
-> immutable generated artifacts
-> optional mutable format editor, such as slideshows
-> immutable publish-ready artifacts
-> distribution plan
-> metrics snapshots
```

### Publish-Ready Slideshow Assets

Saved slideshows can now create a draft post from the Library.

Flow:

1. User clicks `Create draft post` on a saved slideshow.
2. The browser renders the current slideshow state into final slide images.
3. The app uploads those images to Convex storage.
4. Convex creates `rendered_asset` artifacts with `format: "slideshow_rendered_slide"`.
5. Convex creates a draft `distributionPlan` referencing those rendered artifacts.

Important behavior:

- In `full_graphic_generation`, rendered assets may look identical to the generated image artifacts because the image model already produced the full finished slide.
- In `background_plus_overlay`, generated `image` artifacts are background images only, while `rendered_asset` artifacts contain the baked-in app-rendered text and are the publish-ready files.
- `rendered_asset` artifacts should not appear as separate review cards in the normal Review Queue. They are implementation details of the draft post bundle.
- Distribution Plans now show a compact image bundle preview.
- Once a slideshow has a distribution plan whose artifacts point back to that slideshow, the slideshow is hidden from the Review Queue.

### Manual Publishing Provider

A minimal `manual` publishing provider was added so the queue can work before Post Bridge/Postiz integration.

Current behavior:

- `Mark published` marks a manual distribution plan as published inside Content Engine.
- This does not publish anything to an external platform.
- Manual plans do not show `Status` or `Metrics` buttons because there are no external provider IDs to sync.
- For real providers later, `Status` should sync provider/platform status, and `Metrics` should sync analytics.

Distribution plan destructive action labels now vary by state:

- `draft` / `failed`: `Delete draft`
- `published`: `Archive`
- `scheduled`: `Cancel`

The published-state confirmation warns that archiving only removes the Content Engine record and does not delete anything from a social platform.

### Posting Provider Strategy

The current strategy is:

1. Build provider-agnostic post queue infrastructure first.
2. Use Post Bridge or Postiz later as the first live hosted provider adapter.
3. Keep direct TikTok API/audit work as a later strategic path if the platform gets traction.

Post Bridge research indicated it likely gives the fastest path to public posting and basic analytics without doing our own TikTok audit immediately, but we should still confirm TikTok photo carousel support and analytics behavior before committing.

TikTok direct-post research confirmed that unaudited TikTok API clients are too restricted for the immediate learning loop. The user's TikTok developer account is approved, but the client is unaudited; audit-readiness is a product readiness project, not just an API task.

## Latest Image Model Routing

We researched `gemini-3.1-flash-image-preview` and decided it is a better default for high-volume overlay/background image generation, while keeping Pro for full graphic slides.

Current defaults:

- Slideshow planner: OpenRouter, `CONTENT_ENGINE_TEXT_MODEL || "openai/gpt-4.1"`.
- Image prompt writer: OpenRouter, `CONTENT_ENGINE_IMAGE_PROMPT_TEXT_MODEL || CONTENT_ENGINE_TEXT_MODEL || "openai/gpt-4.1"`.
- `background_plus_overlay` slideshow images: `fal-ai/gemini-3.1-flash-image-preview`.
- `background_plus_overlay` reference-image slides: `fal-ai/gemini-3.1-flash-image-preview/edit`.
- `full_graphic_generation` slideshow images: `fal-ai/gemini-3-pro-image-preview`.
- `full_graphic_generation` reference-image slides: `fal-ai/gemini-3-pro-image-preview/edit`.
- Generic fal default image model: `fal-ai/gemini-3.1-flash-image-preview`.

The fal adapter now recognizes these Gemini image families and sends them through the newer payload schema:

- `fal-ai/gemini-3-pro-image-preview`
- `fal-ai/gemini-3-pro-image-preview/edit`
- `fal-ai/gemini-3.1-flash-image-preview`
- `fal-ai/gemini-3.1-flash-image-preview/edit`
- `fal-ai/nano-banana-pro`
- `fal-ai/nano-banana-pro/edit`
- `fal-ai/nano-banana-2`
- `fal-ai/nano-banana-2/edit`

When reference images are present, the fal adapter auto-switches supported non-edit model IDs to `/edit`.

Rationale:

- Overlay mode does not need model-rendered text, so Flash is likely a better speed/cost default.
- Full graphic mode depends more on typography, layout, and finished graphic design, so Pro remains the safer default.

## Latest Verification

After the data ownership, publishing queue, manual provider, distribution plan UI, and image model routing changes, the following passed:

```text
npx convex codegen
npm run build
npx convex dev --once
```

The Convex warning remains non-blocking:

```text
Warning: Unknown property in `node`: `version`
```

Convex also still shows a minor update notice. Both are unrelated to the current work.
