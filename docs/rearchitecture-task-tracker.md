# Re-Architecture Task Tracker

This is the living implementation tracker for the Content Engine re-architecture. Update the status as work is completed.

Status values:

- `Not Started`
- `In Progress`
- `Blocked`
- `Done`

## Milestone 0: Planning Baseline

### CE-0001: Create re-architecture documentation

Status: `Done`

Goal: Capture the new product direction, architecture, provider strategy, migration plan, and implementation tracker.

Acceptance criteria:

- `docs/product-rearchitecture-plan.md` exists.
- `docs/rearchitecture-task-tracker.md` exists.
- The docs explain the build-vs-rewire decision.
- The docs identify major milestones and task breakdown.

### CE-0002: Confirm first provider choices

Status: `Not Started`

Goal: Decide which providers become first-class integrations for the first rebuild pass.

Recommended decision:

- Publishing: Postiz first.
- Model/media: Gemini preserved, fal.ai added, OpenRouter added.
- Competitive/specialized: ReelFarm researched but not core dependency.
- Secondary publishing candidate: Post Bridge.

Acceptance criteria:

- Provider choices are documented.
- Any required API keys/accounts are identified.
- Known provider limits are captured.
- Open questions are tracked.

## Milestone 1: Provider Research and Technical Spikes

### CE-0050: Manual provider account and API key setup

Status: `Not Started`

Goal: Track the external setup work that requires owner action before live provider calls can be tested.

Recommended timing:

- Do not block content creation pipeline work on this.
- Complete OpenRouter/Gemini/fal.ai setup when we are ready to run real generation calls instead of dry-run/error-path validation.
- Complete Postiz setup after the content creation pipeline produces usable artifacts worth publishing.

Acceptance criteria:

- Create or confirm OpenRouter account and API key.
- Create or confirm Google Gemini API key if Gemini remains in the generation mix.
- Create or confirm fal.ai account and API key.
- Create or confirm Postiz account and API key.
- Connect at least one real social account inside Postiz.
- Add required environment variables to the Convex deployment/dev environment.
- Run one provider smoke test per configured service.

Manual variables to collect:

- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY`
- `FAL_API_KEY`
- `POSTIZ_API_KEY`
- Optional: `OPENROUTER_SITE_URL`
- Optional: `OPENROUTER_APP_NAME`
- Optional: `POSTIZ_BASE_URL`
- Optional: `FAL_QUEUE_BASE_URL`

Notes:

- Local dry-run toggles exist for provider-path testing without credentials: `POSTIZ_DRY_RUN`, `FAL_DRY_RUN`, and `OPENROUTER_DRY_RUN`.
- Live publishing should be one of the last provider checks, after artifact generation, review, and rendering are working well.

### CE-0101: Spike Postiz publishing API

Status: `Done`

Goal: Validate that Postiz can handle account integrations, media uploads, post creation, scheduling, and analytics for the platforms we care about.

Acceptance criteria:

- Confirm authentication method for our app.
- Confirm how connected social accounts are represented.
- Confirm upload flow for images/videos.
- Confirm post creation and scheduling payloads.
- Confirm analytics endpoints and returned metrics.
- Document rate limits and failure modes.
- Produce a minimal adapter design.

### CE-0102: Spike Post Bridge API

Status: `Not Started`

Goal: Evaluate whether Post Bridge should be supported as a publishing provider.

Acceptance criteria:

- Confirm access requirements and pricing.
- Confirm authentication method.
- Confirm supported platforms.
- Confirm upload/post/schedule endpoints.
- Confirm analytics support.
- Compare capabilities against Postiz.
- Decide whether to implement now, later, or not at all.

### CE-0103: Analyze ReelFarm API as competitive blueprint

Status: `Not Started`

Goal: Extract useful product and API ideas from ReelFarm without making it the default foundation.

Acceptance criteria:

- Document slideshow generation endpoints.
- Document automation endpoints.
- Document TikTok publishing/analytics endpoints.
- Document media library/research endpoints.
- Document rate limits and concurrency limits.
- Identify features worth borrowing for our own workflow model.
- Decide whether ReelFarm should be an optional provider.

### CE-0104: Spike fal.ai media model provider

Status: `Done`

Goal: Validate fal.ai as the primary provider for fast-moving image/video/audio generation models.

Acceptance criteria:

- Confirm authentication and request pattern.
- Identify target models for image generation.
- Identify target models for video generation.
- Identify target models for lipsync/avatar generation.
- Confirm async job behavior and polling/webhook options.
- Document expected costs and failure handling.
- Produce a model-provider adapter design.

### CE-0105: Spike OpenRouter LLM provider

Status: `Done`

Goal: Validate OpenRouter as the primary LLM routing provider.

Acceptance criteria:

- Confirm OpenAI-compatible API usage.
- Confirm model selection and fallback options.
- Confirm structured output support strategy.
- Confirm rate limit and cost behavior.
- Decide how to choose models per workflow step.
- Produce a model-provider adapter design.

### CE-0106: Spike Canva MCP and Connect APIs

Status: `Not Started`

Goal: Decide where Canva belongs in the content creation pipeline.

Acceptance criteria:

- Confirm what Canva MCP can do for design creation/editing/export.
- Confirm Connect API requirements for Autofill and Export.
- Identify whether Canva requires user-interactive auth.
- Decide whether Canva is a workflow tool, template renderer, or later integration.
- Document limitations.

## Milestone 2: New Domain Model

### CE-0201: Design Convex schema v2

Status: `Done`

Goal: Design new tables for brands, provider accounts, workflows, workflow versions, workflow runs, run events, artifacts, distribution plans, and metrics.

Acceptance criteria:

- Schema design is documented before implementation.
- Existing data migration is explicitly out of scope because there is no production data.
- User ownership and indexes are planned.
- Sensitive provider fields are separated or protected.
- Old tables are removed from the active schema.

### CE-0202: Add `brands` table and APIs

Status: `Done`

Goal: Replace the old product-centric concept with a richer brand/account strategy model.

Acceptance criteria:

- `brands` table exists.
- User-scoped list/get/create/update/delete APIs exist.
- Brand stores niche, audience, voice, visual style, constraints, examples, and performance notes.
- Old `products` code is removed rather than migrated.

### CE-0203: Add provider-backed `socialAccounts` model

Status: `Done`

Goal: Represent social accounts connected through external providers rather than direct TikTok OAuth.

Acceptance criteria:

- `socialAccounts` table exists.
- Account stores provider, provider account ID, platform, username, avatar, status, capabilities, and brand ID.
- User-scoped APIs exist.
- Old direct platform `accounts` code is removed.

### CE-0204: Add workflow definition model

Status: `Done`

Goal: Store repeatable content pipelines as versioned workflows.

Acceptance criteria:

- `workflows` table exists.
- `workflowVersions` or equivalent versioning exists.
- Workflow stores brand/account context, schedule, approval, publishing
  policies, and a graph. Output type is derived from terminal nodes and
  artifacts rather than a workflow-level content format.
- Active/inactive state is supported.
- Update behavior preserves old run explainability.

### CE-0205: Add workflow run and event model

Status: `Done`

Goal: Track every execution of a workflow with durable status and logs.

Acceptance criteria:

- `workflowRuns` table exists.
- `workflowRunEvents` table exists.
- Runs capture trigger, status, current step, timestamps, cost, error, and summary.
- Events capture step logs, model calls, tool calls, and decisions.
- Queries support run history by workflow/user/status.

### CE-0206: Add artifact model

Status: `Done`

Goal: Store generated outputs as typed artifacts linked to workflow runs.

Acceptance criteria:

- `artifacts` table exists.
- Artifact types include prompt, text, caption, image, slide spec, rendered slide, video, thumbnail, and publish payload.
- Artifacts support storage URLs and structured JSON.
- Artifacts store provider/model/prompt metadata.
- Parent-child artifact relationships are supported.

### CE-0207: Add distribution plan and metrics model

Status: `Done`

Goal: Separate publishing intent/status and performance metrics from generated content.

Acceptance criteria:

- `distributionPlans` table exists.
- Plans store target accounts, schedule, provider payload, approval state, publish status, and external IDs.
- `postMetrics` or equivalent table exists.
- Metrics link back to account, distribution plan, artifact, and workflow run where possible.

## Milestone 3: Provider Abstraction Layer

### CE-0301: Create publishing provider interface

Status: `Done`

Goal: Define a common interface for scheduling, publishing, uploading media, listing accounts, and syncing metrics.

Acceptance criteria:

- Interface supports account listing/syncing.
- Interface supports media upload.
- Interface supports post scheduling.
- Interface supports immediate publishing.
- Interface supports status polling.
- Interface supports analytics sync where provider allows.
- Provider errors map into normalized internal errors.

### CE-0302: Implement Postiz publishing adapter

Status: `Done`

Goal: Make Postiz the first concrete publishing provider.

Acceptance criteria:

- Adapter authenticates with configured credentials.
- Adapter can sync connected integrations/accounts.
- Adapter can upload media.
- Adapter can schedule posts.
- Adapter can publish immediately.
- Adapter can fetch post status and metrics where available.
- Adapter has basic tests or a local dry-run path.

### CE-0303: Create model provider interface

Status: `Done`

Goal: Define a common interface for text, structured JSON, image, video, and async generation.

Acceptance criteria:

- Interface supports text generation.
- Interface supports structured output.
- Interface supports image generation.
- Interface supports video generation.
- Interface supports async job polling.
- Interface captures provider/model/cost metadata.
- Existing Gemini calls can be wrapped.

### CE-0304: Wrap existing Gemini provider

Status: `Done`

Goal: Move Gemini behind the new provider interface as a clean adapter without preserving legacy helper APIs.

Acceptance criteria:

- Gemini model calls are routed through the provider abstraction.
- Errors are normalized.

### CE-0305: Implement fal.ai provider adapter

Status: `Done`

Goal: Add fal.ai as a media generation provider.

Acceptance criteria:

- Adapter can submit image generation jobs.
- Adapter can submit video generation jobs.
- Adapter supports async polling or webhook-ready state.
- Adapter stores provider metadata on artifacts.
- At least one image model and one video model are validated.

### CE-0306: Implement OpenRouter provider adapter

Status: `Done`

Goal: Add OpenRouter as the primary LLM routing provider.

Acceptance criteria:

- Adapter supports chat/text generation.
- Adapter supports structured JSON output strategy.
- Adapter supports model selection per workflow step.
- Adapter captures model/cost metadata where available.
- Fallback behavior is documented.

### CE-0307: Add asset storage provider abstraction

Status: `Not Started`

Goal: Let generated media move from Convex file storage to R2/S3-compatible object storage when asset scale, cost, or CDN behavior requires it.

Timing note:

- Keep Convex file storage during workflow and content-quality validation.
- Introduce this before large video output, durable export archives, or high-volume provider-ready media delivery.

Acceptance criteria:

- Workflow renderer and provider adapters write files through an internal storage interface.
- Convex storage remains a supported development/default adapter.
- R2 or S3-compatible storage can be configured for production assets.
- Artifact records preserve storage provider, object key, MIME type, public/private URL, and source metadata.
- Publishing adapters can consume stored assets without knowing the backing storage provider.

## Milestone 4: Workflow Runner

### CE-0401: Define workflow step schema

Status: `Done`

Goal: Create a structured representation for repeatable workflow steps.

Acceptance criteria:

- Step types are documented.
- Initial step types include generate text, generate image, generate video, render slideshow, create caption, create distribution plan, request approval, and publish.
- Step input/output references can point to previous artifacts.
- Validation catches unsupported step configurations.

### CE-0402: Build workflow runner skeleton

Status: `Done`

Goal: Execute workflow runs step by step with durable state.

Acceptance criteria:

- Runner can start a run from a workflow.
- Runner records status transitions.
- Runner records run events.
- Runner stops on errors and stores useful error details.
- Runner can be resumed or retried safely.

### CE-0403: Add manual workflow trigger

Status: `Done`

Goal: Let a user trigger a workflow run manually from the app.

Acceptance criteria:

- API exists to create a manual workflow run.
- Runner starts the run.
- UI can display status and events.
- Errors are visible in run history.

### CE-0404: Add scheduled workflow trigger

Status: `Not Started`

Goal: Replace old automation scheduling with scheduled workflow runs.

Acceptance criteria:

- Cron creates due workflow runs.
- Next run time is calculated from workflow schedule.
- Paused workflows do not run.
- Schedule changes affect future runs.
- Missed/failed runs are visible.

### CE-0405: Add approval gate support

Status: `In Progress`

Goal: Allow workflows to pause for human approval before publishing.

Acceptance criteria:

- Workflow step can request approval.
- Run pauses in approval-required status.
- User can approve or request revision on artifacts.
- Approved distribution plans become publish-ready.
- Revision-needed distribution plans stay blocked from publishing.
- Approved runs resume or resolve cleanly.
- Rejected runs stop cleanly with reason.

## Milestone 5: Slideshow Rebuild

User testing checkpoint:

- Ask Gabe to test when CE-0501, CE-0503, CE-0504, and CE-0705 are complete enough to create, inspect, review, and render several slideshow styles end to end.
- Suggested tests: educational slideshow, product/offer slideshow, contrarian hook slideshow, and visual story slideshow.
- Capture feedback on hook quality, slide sequence, visual prompt quality, image relevance, text readability, review ergonomics, and export/publish readiness.

### CE-0501: Convert slideshow generation into workflow steps

Status: `In Progress`

Goal: Make slideshows the first native content format in the workflow system.

Acceptance criteria:

- Structured slideshow spec generation exists as a workflow step.
- Slide visual prompts are extracted into `image_prompt` artifacts.
- Text and image generation become logged workflow steps.
- Slide specs are stored as artifacts.
- Generated images are stored as artifacts.
- Async image jobs can resolve into final image artifacts.
- Generated slideshow content links to workflow run.

### CE-0502: Preserve slideshow editor

Status: `Not Started`

Goal: Keep the useful editing experience while backing it with artifacts/workflow data.

Acceptance criteria:

- Text element editing works in the new artifact model.
- Aspect ratio changes work in the new artifact model.
- Image regeneration works in the new artifact model.
- Download/export works in the new artifact model.
- Edited outputs update artifact records.

### CE-0503: Render final slideshow assets for publishing

Status: `In Progress`

Goal: Produce provider-ready rendered images from slideshow artifacts.

Acceptance criteria:

- Rendered slide image files are saved as artifacts.
- SVG renderer creates reviewable slide files before final PNG/video export.
- Rendered outputs include text overlays.
- Output dimensions match platform requirements.
- Distribution plan references rendered artifacts.

### CE-0504: Build artifact library behavior

Status: `Done`

Goal: Make the library show artifact/workflow-backed content.

Acceptance criteria:

- Library can show slideshow workflow outputs.
- Content can be filtered by brand/account/artifact type/review status.
- Review queue defaults to final review artifacts instead of raw pipeline internals.
- Rendered slideshow artifacts are grouped by run into a swipeable review bundle.
- Pipeline debug artifacts can be inspected when troubleshooting generation runs.
- Test runs, artifacts, and distribution plans can be deleted from the UI to prevent dev-data bloat.
- A slideshow bundle can be deleted in one action for manual testing cleanup.

### CE-0505: Improve slideshow generation reliability diagnostics

Status: `In Progress`

Goal: Make image-generation failures obvious and actionable during manual testing.

Acceptance criteria:

- Failed provider jobs retain provider error metadata.
- Library debug view surfaces provider error messages.
- Renderer falls back gracefully when an image is unavailable.
- Prompting discourages generated images from including text, logos, UI, or fake typography because the renderer owns slide text.
- User can tell which slides used real generated images versus fallback backgrounds.

## Milestone 6: Publishing and Scheduling

Milestone note:

Publishing infrastructure exists early so distribution plans can be shaped correctly, but live posting should be validated after the content creation pipeline produces provider-ready artifacts.

### CE-0601: Add provider-backed scheduling path

Status: `Done`

Goal: Schedule posts through the publishing provider abstraction.

Acceptance criteria:

- New distribution plans can be scheduled through Postiz.
- Provider post IDs are stored.
- Provider errors are visible in run history.
- Direct TikTok code is not present in the active codebase.

### CE-0602: Add provider-backed immediate publish path

Status: `Done`

Goal: Publish immediately through the provider abstraction.

Acceptance criteria:

- Manual publish uses Postiz adapter.
- Provider status is stored.
- External post links are stored when available.
- Failure states are clear to the user.

### CE-0603: Sync provider accounts

Status: `Done`

Goal: Pull connected accounts/integrations from the publishing provider into Content Engine.

Acceptance criteria:

- User can trigger account sync.
- Provider accounts are stored as `socialAccounts`.
- Account capabilities are recorded.
- Disconnected accounts are marked appropriately.

### CE-0604: Sync post metrics

Status: `Done`

Goal: Import performance metrics from provider/platform APIs.

Acceptance criteria:

- Scheduled sync updates metrics.
- Manual refresh exists.
- Metrics link back to workflow/distribution/artifacts.
- Analytics UI reads from the new metrics model.

## Milestone 7: UI Reframe

### CE-0701: Add Brands UI

Status: `In Progress`

Goal: Let users manage brand strategy and assets.

Acceptance criteria:

- User can create/edit/delete brands.
- User can set niche, audience, voice, visual style, and constraints.
- Reference images are associated with brands.
- Old products UI is removed.

### CE-0702: Add Social Accounts UI

Status: `In Progress`

Goal: Show provider-backed connected accounts.

Acceptance criteria:

- Accounts list by platform/provider/brand.
- Account sync action exists.
- Account connection status is visible.
- User can assign account to brand.

### CE-0703: Add Workflows UI

Status: `In Progress`

Goal: Let users create, edit, activate, pause, and inspect workflows.

Acceptance criteria:

- Workflow list exists.
- Workflow detail page exists.
- Workflow creation supports slideshow workflows first.
- Workflow status and next run are visible.
- Manual run action exists.

### CE-0704: Add Run Console UI

Status: `In Progress`

Goal: Show the agent's work in a transparent and debuggable way.

Acceptance criteria:

- Run list and detail views exist.
- Step events are visible.
- Artifacts are visible.
- Errors are readable.
- Approval-required runs are obvious.

### CE-0705: Add Artifact Review UI

Status: `In Progress`

Goal: Let users review generated content before publishing.

Acceptance criteria:

- User can preview images, slides, captions, and videos.
- User can approve/reject artifacts.
- User can request revision with artifact-level feedback notes.
- User can request regeneration for revised image prompts, image artifacts, and rendered slides.
- Regenerated artifacts can replace their source artifact in a distribution plan.
- Approval state feeds back into workflow runner.

### CE-0706: Update navigation

Status: `Done`

Goal: Move navigation away from the old playground model and toward operations.

Acceptance criteria:

- Primary nav includes Dashboard, Brands, Accounts, Workflows, Runs, Library, Analytics, Settings.
- Old playground routes are removed.
- App routes now focus on the operations console.

## Milestone 8: Additional Content Formats

### CE-0801: Define hook/demo video format

Status: `Not Started`

Goal: Add the first video-oriented content workflow after slideshows.

Acceptance criteria:

- Format input/output schema is defined.
- Required model/tool steps are identified.
- Script/hook/demo structure is generated.
- Video artifact output is supported.

### CE-0802: Define AI UGC video format

Status: `Not Started`

Goal: Support persona-led or avatar-led UGC-style videos.

Acceptance criteria:

- Format input/output schema is defined.
- Persona/reference asset requirements are documented.
- Video/lipsync/avatar provider choice is validated.
- Publishing path works through distribution plans.

### CE-0803: Define talking-avatar format

Status: `Not Started`

Goal: Support repeatable talking-head video workflows.

Acceptance criteria:

- Format input/output schema is defined.
- Avatar/lipsync provider is selected.
- Script generation step works.
- Video generation step works.

## Milestone 9: Performance Feedback Loop

### CE-0901: Link metrics to workflow learnings

Status: `Not Started`

Goal: Turn post performance into reusable strategy memory.

Acceptance criteria:

- Metrics can be summarized by brand/account/workflow/content format.
- Winning topics/hooks/styles can be identified.
- Learnings are stored in a structured way.
- Future workflow runs can reference learnings.

### CE-0902: Add topic strategy engine

Status: `Not Started`

Goal: Generate or select better topics based on brand context and historical performance.

Acceptance criteria:

- Topic candidates can be generated.
- Candidates can be scored.
- Past performance influences scoring.
- User can approve or seed topic queues.

### CE-0903: Add automated experimentation

Status: `Not Started`

Goal: Let workflows test variations in hooks, styles, captions, and posting times.

Acceptance criteria:

- Workflow can define experiment dimensions.
- Runs record variation metadata.
- Metrics can be compared by variation.
- Winning variations can be promoted.

## Milestone 10: Cleanup and Decommissioning

### CE-1001: Deprecate direct TikTok OAuth

Status: `Done`

Goal: Remove direct TikTok account connection from the active codebase.

Acceptance criteria:

- Direct TikTok OAuth UI is removed.
- Direct TikTok callback route is removed.

### CE-1002: Deprecate old scheduled posts model

Status: `Done`

Goal: Remove old scheduled post flow.

Acceptance criteria:

- No new workflows write to old `scheduledPosts`.
- Old scheduled UI is replaced.
- Old cron path is removed.

### CE-1003: Deprecate old automations model

Status: `Done`

Goal: Replace old automations with workflows.

Acceptance criteria:

- Old automation UI is removed.
- Old automation cron path is removed.
- Workflow runs fully replace automation runs.

### CE-1004: Clean up obsolete code paths

Status: `In Progress`

Goal: Remove unused code after migration is complete.

Acceptance criteria:

- Unused Convex functions are removed.
- Unused React pages/components are removed.
- Deprecated environment variables are removed from docs.
- Build passes.
- Core smoke tests pass.

## Working Notes

When completing a task:

- Change its status to `In Progress` when started.
- Change its status to `Done` only after implementation and verification.
- Add short notes under the task if important decisions were made.
- If blocked, set status to `Blocked` and explain the blocker.
