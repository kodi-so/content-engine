# Product Working Notes

This document is a parking lot for product decisions, open questions, and implementation game plans that are still being shaped. Once a direction is settled, promote it into `docs/product-rearchitecture-plan.md` and `docs/rearchitecture-task-tracker.md`.

## Create Tab and One-Off Content

Date captured: 2026-05-04

### Current State

The app currently treats workflows as the main content creation path:

- Users create a workflow from the Workflows page.
- Users trigger that workflow from the Runs page.
- Generated outputs appear as artifacts in the Library.
- The backend `createManualRun` path requires a `workflowId`.

The schema already allows artifacts to exist without `workflowId` or `workflowRunId`, but there is no user-facing one-off content creation path yet.

### Product Direction

Add a primary tab named `Create`.

The `Create` tab should let a user generate a single piece of content from a prompt without first creating a workflow. This should feel like the default creative surface for ad hoc work, drafts, experiments, and single-use posts.

Workflows should become the repeatable automation layer: saved recipes for producing content consistently for a brand, account, format, schedule, and publishing policy.

### Proposed Product Model

- `Create`: one-off content generation from a prompt, brand, optional account/platform, format, references, and review/export/publish actions.
- `Workflows`: repeatable content systems that can run manually or on a schedule.
- `Library`: all generated content artifacts, whether created one-off or through workflows.
- `Runs`: operational/debug visibility for agent execution, not the primary creation surface.

### Implementation Preference

Prefer adding a dedicated one-off content request concept instead of pretending every one-off generation is a workflow.

Possible backend shape:

- Add a `contentRequests` table for ad hoc creation jobs.
- Store prompt, brand, optional social account/platform, content format, status, cost, error state, and timestamps.
- Link generated artifacts to `contentRequestId`.
- Keep `workflowId` and `workflowRunId` optional on artifacts for workflow-generated content.

Possible frontend shape:

- Add `Create` to the main nav.
- Add a creation form with brand, optional account/platform, content format, and prompt.
- Show recent one-off requests and their generated artifacts.
- Send successful outputs into Library/review just like workflow artifacts.

### Open Questions

- Should one-off content support publishing/distribution plans immediately, or start with generation and review only?
- Should one-off creation reuse workflow step definitions internally, or have a simpler runner that calls shared generation helpers?
- Should users be able to convert a successful one-off prompt into a workflow?
- Should `Runs` show one-off content requests, or should it remain workflow-only?

## Agentic Content Creation Flow

Date captured: 2026-05-04

### Raw Notes Synthesis

The base product flow should be an agent that can take a vague human prompt and turn it into a complete, structured content creation spec. Humans should not need to write perfect prompts. The product should do the prompt optimization and schema completion work for them.

The agent can ask clarifying questions, but only when the answer materially changes the output. It should ask if the requested format is ambiguous, such as slideshow vs video. It should not ask low-level craft questions that a competent creative director should decide, such as tiny typography or layout preferences.

Workflows should build on top of this same base creation flow. A one-off `Create` request contains specific instructions for a single piece of content. A workflow contains recurring strategy, account context, variation rules, and generation policies that produce many specific content requests over time.

### Product Principles

- The agent should act like a creative director, not a form wizard.
- The user gives intent, references, and constraints; the system fills in structure, production decisions, and tool choices.
- Every content type should have an explicit schema the agent gradually fills.
- The schema should drive generation, preview, review, revision, saving, and publishing.
- Workflows are repeatable strategy wrappers around the same creation engine, not a separate content system.

### Clarifying Question Policy

Ask the user when ambiguity affects the concept, format, brand fit, or production path.

Examples worth asking:

- Is this meant to be a slideshow, video, static image, or caption/text post?
- Which brand/account should this be for if multiple are available?
- Should this content teach, sell, entertain, react, or imitate a reference?
- Should a supplied reference be copied structurally, visually, or just used as inspiration?

Examples the agent should decide itself:

- Exact slide count within an acceptable range.
- Font sizing, spacing, and most layout choices.
- Whether a title slide or CTA slide is needed, based on the content strategy.
- Image prompt wording, shot composition, and supporting visual details.

### Content Type Notes

Slideshows are the best first content format. Given a base prompt, the agent should decide slide count, slide roles, hook/title slide, optional fixed CTA slide, overlay copy, visual direction, and image prompt per slide.

Themed slideshow accounts need stronger reference-based image consistency. The product should support creating and saving reusable visual assets, characters, objects, and style references, then using them during content generation.

Video formats need a more advanced creative-director planner. The agent may need to generate multiple clips, choose the right model/tool for each clip, create base images, animate them, stitch clips together, add captions/subtitles, and produce a coherent final video.

UGC-style accounts need consistent AI people or characters. The product should support base images or videos as identity/style anchors for repeated reaction videos, demonstration videos, and reference-inspired outputs.

Reference ingestion is an important future capability. Users should be able to feed in a TikTok video or slideshow, have the system understand and describe the structure, and optionally produce a recreation prompt or reusable workflow idea.

### Preview and Asset Lifecycle

The product should save generated previews immediately so they can be inspected, approved, revised, or discarded.

A likely model:

- Store previews and saved outputs in the artifact system.
- Add lifecycle/status fields such as `preview`, `saved`, `discarded`, or equivalent.
- Show only the current preview in the main creation UI.
- When the user asks for edits, generate a replacement preview and hide or discard the previous one.
- Once the user approves or saves, mark the chosen artifact as saved/reviewable.

Implementation caution: completely deleting every rejected preview may make debugging, cost tracking, and provider failure analysis harder. A better first pass may be to hide discarded previews from the product UI while retaining enough internal metadata for observability, then add cleanup later.

### Architecture Implications

- Add a first-class `contentRequests` concept for one-off creation.
- Add or extend content format contracts so each format has an input schema, planning schema, artifact schema, preview renderer, and supported tools.
- Build a schema-filling planner before generation. The planner should decide whether it has enough information or needs one clarifying question.
- Keep generation providers behind capability-based adapters rather than hard-coding a single provider per format.
- Treat workflows as stored strategies that can create many `contentRequests` with variation instructions.
- Add reference asset support as a first-class input to both one-off creation and workflows.

### Provider and Tool Research Queue

Research should focus on capabilities and integration shape, not just model quality.

Questions to answer:

- Should Gemini Nano Banana/Nano Banana Pro be added alongside fal.ai for image generation and editing?
- Is Arcads best used as a provider adapter for AI UGC/ad videos, or should the product build equivalent flows from lower-level video/image/voice/lipsync tools?
- Does Glif still have usable API or MCP access, and is it stable enough to depend on?
- Which APIs are best for video editing operations such as clip stitching, captions, audio mixing, transitions, resizing, and final rendering?
- Which tools can reliably ingest TikTok/slideshow references and output useful scene/structure descriptions?

### Proposed Next Step

Before implementation, write a focused `Create v1` product/technical spec. It should define:

- The first supported content type.
- The one-off request lifecycle.
- The schema-filling planner.
- The clarifying question policy.
- The preview/revision/save lifecycle.
- The artifact model changes.
- The minimum provider/tool requirements.

Recommended V1: one-off slideshow creation from prompt, brand, optional reference assets, and optional account/platform.
