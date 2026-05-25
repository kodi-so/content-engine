# Studio Workflow Platform Plan

This document captures the agreed direction for turning Content Engine from a
one-off slideshow generator into a canvas-native, provider-backed, agentic
content automation platform.

The plan is intentionally broken into small tickets. Each ticket should be
implemented one at a time. Before executing a ticket, Codex should explain the
planned changes, affected files, data model impact, verification approach, and
known risks.

## Product Direction

Content Engine should become a platform for building autonomous content systems.
The central product surface is `Studio`, with `Workflows` as the flagship
canvas-based builder. A workflow is a reusable graph of nodes that can generate,
assemble, export, and publish one final post package per run.

The product must support slideshows and videos as first-class targets. The
workflow system should also be flexible enough to support AI UGC ads, talking
avatar content, app demo videos, transformation content, static image posts,
caption sets, and future formats.

## Locked Decisions

- The top-level product area is named `Studio`.
- Workflows are always canvas-native. There should not be a separate form-only
  workflow builder.
- The workflow list is the entry point; opening a workflow loads its canvas.
- Use React Flow for the first canvas implementation.
- Persist our own typed workflow graph format, independent of React Flow's
  internal shape.
- Node execution is explicit only: user clicks `Run`, a schedule fires, or an
  external MCP/API call starts a run.
- Editing nodes must never automatically spend credits, call providers, or
  create artifacts.
- A workflow run should produce one final post package.
- A workflow graph may be many-to-many. Nodes can branch, merge, fan out, and
  consume multiple upstream outputs.
- Intermediate artifact retention is configurable.
- Debug outputs should be inspectable inside the workflow canvas.
- The Library should primarily show final or intentionally retained artifacts,
  not every intermediate node output.
- BulkAPIs is the default provider for AI generation and media generation,
  behind a swappable provider layer.
- BulkAPIs should not be used for posting in the near-term platform plan.
- Postiz and/or Post Bridge should remain the publishing providers behind the
  publishing abstraction.
- BulkAPIs model-specific node fields should come from cached model schemas.
- MCP is a first-class external integration surface, not a later local-only
  helper.
- Existing slideshow functionality should become native workflow nodes rather
  than remain a separate generation island.
- `Create` should evolve into prompt-to-workflow / quick-run, using the same
  workflow engine.

## Current Repository Baseline

The current repository already has a useful foundation:

- Convex tables for brands, social accounts, workflows, workflow runs, run
  events, artifacts, slideshows, distribution plans, and metrics.
- A mature one-off slideshow creation path through `contentRequests`.
- Graph-native workflow definitions stored directly on workflows; graph
  execution is intentionally deferred to the runner tickets.
- Provider abstractions for model providers and publishing providers.
- Existing adapters for Gemini, fal.ai, OpenRouter, Postiz, and manual
  publishing.
- A Library surface that can review artifacts, render slideshow assets, create
  distribution plans, publish, sync status, and sync metrics.

The main architectural gap is that one-off slideshow generation and generic
workflow execution are parallel systems. The workflow engine should become the
shared foundation.

## BulkAPIs Research Baseline

As of this planning pass, the BulkAPIs documentation describes:

- Base URL: `https://bulkapis.com/api/v1`
- Authentication via bearer API key, e.g. `Authorization: Bearer bulk_ak_...`
- A shared response envelope:
  - success: `{ "success": true, "data": { ... } }`
  - error: `{ "success": false, "error": { "code": "...", "message": "..." } }`
- Common error codes including `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
  `VALIDATION_ERROR`, `RATE_LIMITED`, `ACCOUNT_NEEDS_REAUTH`,
  `PLATFORM_ERROR`, `INTERNAL_ERROR`, and `DUPLICATE`.
- Rate limits described as 30 requests/minute for most endpoints and 5
  requests/minute for bulk endpoints.
- Unified AI generation through `POST /api/v1/ai/generate`.
- Async AI flow for image, video, audio, music, and lipsync:
  - submit `POST /api/v1/ai/generate`
  - poll `GET /api/v1/ai/tasks/{taskId}` every 3-5 seconds
  - result media URLs are valid for 14 days
- Sync AI flow for chat/LLM responses.
- Optional `webhook_url` for async completion notifications.
- `GET /api/v1/ai/models` as the source of truth for per-model
  `inputSchema`, `resultSchema`, pricing, and capabilities.
- Broad model categories:
  - Image generation and image editing
  - Video generation and image-to-video
  - Lipsync
  - Chat/LLM with vision
  - Audio/TTS
  - Speech-to-text
  - Music generation
  - Video Render, described as Claude + Remotion video composition from assets
    and prompts
- Social automation APIs currently documented around X/Twitter:
  - connected accounts
  - X OAuth connect
  - DMs
  - inbox/conversations
  - posts
  - automations
  - comments
  - media upload
  - analytics
  - schedules
  - X intelligence
  - viral watch
  - webhooks
  - API keys
  - usage and billing

BulkAPIs publishing coverage decision:

- Decision: do not use BulkAPIs for posting right now.
- BulkAPIs should power AI generation, model catalog metadata, async AI task
  polling/webhooks, and model-specific media-generation capabilities.
- Postiz and/or Post Bridge should remain the publishing providers for
  `auto_post`, distribution plans, account sync, scheduling, status sync, and
  publishing metrics.
- BulkAPIs docs currently show social automation concentrated around
  X/Twitter. That may become useful later for X-specific research or growth
  automation, but it should not be part of the initial posting architecture.
- Account storage should keep provider-specific external account IDs for the
  selected publishing provider: Postiz integration IDs for Postiz channels,
  Post Bridge IDs if/when that adapter is implemented, and normalized platform
  handles in our own `socialAccounts` table.
- Webhooks should remain provider-neutral in our app: normalize publishing
  provider status events into our run/event/distribution records rather than
  exposing raw provider event names to workflow code.

Important implementation implication: our BulkAPIs integration should treat
`GET /api/v1/ai/models` as live provider metadata and should not hard-code model
parameters like Kling, Veo, Nano Banana, or lipsync inputs into the database
schema.

## Target Information Architecture

Recommended navigation grouping:

```text
Studio
- Create
- Workflows
- Personas
- Media Library

Operations
- Runs
- Publishing
- Analytics

Workspace
- Brands
- Accounts
- Settings
```

Short-term implementation can keep existing routes while adding the new
workflow detail canvas. Full navigation restructuring should happen after the
workflow foundation is stable.

## Core Concepts

### Workflow

A workflow is a saved content system. It has a list/card entry point and a
canvas detail view. Every saved workflow has a graph definition.

### Workflow Graph

Each workflow stores its current graph as domain JSON, not raw React Flow JSON:

```ts
type WorkflowGraph = {
  schemaVersion: 1;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  canvas?: {
    viewport?: { x: number; y: number; zoom: number };
  };
};

type WorkflowNode = {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  provider?: string;
  model?: string;
  config: Record<string, unknown>;
  inputBindings?: Record<string, NodeInputBinding>;
  retention?: NodeRetentionPolicy;
};

type WorkflowEdge = {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};
```

React Flow can render and edit this graph, but persisted data should be owned by
Content Engine.

### Workflow Run

A run is one execution of the workflow's current graph. A run should produce
one final post package. Runs keep status, node logs, provider jobs, costs,
errors, and final artifacts; they do not preserve historical workflow graphs.

### Node Execution

Nodes consume typed inputs and produce typed outputs. Outputs should become
artifacts when retention policy requires it or when they are needed by a
downstream node.

### Post Package

A post package is the final compiled output for a run. It may contain media,
caption, platform-specific settings, target accounts, and publishing/export
instructions.

### Personas And Assets

Personas and assets are reusable creative references. They should cover:

- AI personas: consistent fictional people for UGC.
- Transformation identities: before/after or progression state references.
- Mascots and characters.
- Product assets: logos, app screenshots, product shots.
- Style references.
- Voice references.

## Initial Node Catalog

### Core V1 Nodes

- Runner
- Comment
- Media input
- LLM
- AI Agent
- Image Generation
- Video Generation
- Audio/TTS
- Lipsync
- Native Slideshow Planner
- Native Slideshow Renderer
- AI Video Editor / Video Render
- Post Compiler
- Export
- Auto Post

### Later Nodes

- Filter
- Sort
- Code
- Trend Research
- Viral Watch
- Comment-to-DM automation
- Metrics feedback
- Variant ranker

## Execution Modes And Retention

Avoid framing this as a heavy enterprise feature in the UI. Internally, support:

- `test`: debug-oriented run. Keep node outputs, logs, and previews. Do not
  auto-post unless explicitly allowed.
- `production`: normal run. Follow terminal node behavior. Save final outputs
  by default. Save intermediate outputs according to retention settings.

Retention settings should support:

- Keep all node outputs.
- Keep final output only.
- Keep intermediate outputs only on failure.
- Per-node override.

## MCP Strategy

MCP should be designed as a first-class external integration surface. It should
use the same backend APIs and domain model as the app.

Auth and access model:

- The canonical auth plan is documented in
  [MCP Auth And Access Model](./mcp-auth-access-model.md).
- V1 MCP access should use user-owned API keys sent as bearer tokens.
- Clerk/OAuth bearer tokens can be added later for delegated HTTP MCP clients.
- Server-side app tokens should not be used for user-facing MCP access.
- Every MCP request must resolve to one Content Engine user and enforce scopes
  plus entity ownership before reading or mutating data.
- Publishing through MCP must require an explicit publishing scope and continue
  to respect workflow approval/publishing policies.

Initial MCP resources:

- Product architecture guide.
- Workflow graph schema.
- Node catalog.
- Built-in workflow templates.
- AI Agent prompt recipes.
- BulkAPIs model catalog snapshot.
- Brand/persona/asset summaries.

Resource contract:

- The canonical resource list is documented in
  [MCP Resources](./mcp-resources.md).
- Resource URIs use the `content-engine://...` custom scheme and should be read
  through the Content Engine MCP server, not fetched directly.
- The backend resource registry lives in `convex/mcp/resources.ts`.

Initial MCP tools:

- List workflows.
- Create workflow from template.
- Create blank workflow.
- Update workflow graph.
- Add/update/delete node.
- Connect/disconnect nodes.
- Run workflow.
- Inspect run.
- List artifacts for run.
- Approve or mark artifact for revision.
- Export or publish a post package where allowed.

Workflow tool contract:

- The canonical workflow tool list is documented in
  [MCP Workflow Tools](./mcp-workflow-tools.md).
- The backend workflow tool handlers live in `convex/mcp/workflows.ts`.
- Tool handlers operate on the same workflow graph model as the web app and
  validate graph changes before saving.

## Phase Plan And Tickets

### Phase 0: Stabilize Planning Baseline

Goal: preserve the current product decisions and avoid accidental drift.

#### SW-0001: Save Studio workflow architecture plan

Status: `Done`

Deliverables:

- Add this document.
- Capture locked product decisions.
- Capture BulkAPIs research baseline.
- Capture phased ticket breakdown.

Acceptance criteria:

- Roadmap exists in `docs/`.
- Tickets are small enough to execute one by one.
- The doc states that Codex should explain each ticket before implementation.

#### SW-0002: Update existing roadmap references

Status: `Done`

Deliverables:

- Update the existing product/rearchitecture docs to point at this Studio
  workflow plan as the current direction.
- Mark older slideshow-only assumptions as superseded where needed.

Acceptance criteria:

- Existing docs do not contradict the canvas-first direction.
- No implementation code changes.

#### SW-0003: Fix current TypeScript issues

Status: `Done`

Deliverables:

- Remove unused `ImagePromptWriterOutput` import in `convex/content/planning.ts`.
- Fix `beginTextEdit` button click handler in `src/components/SlideshowPreview.tsx`.

Acceptance criteria:

- `npm run build` passes.
- `npx tsc --noEmit` passes or only reports known generated-code issues.

### Phase 1: Workflow Graph Foundation

Goal: replace the current workflow step array with a typed graph foundation
that reflects the workflow canvas architecture directly.

#### SW-0101: Define workflow graph types

Status: `Done`

Deliverables:

- Add shared TypeScript types for `WorkflowGraph`, `WorkflowNode`,
  `WorkflowEdge`, ports, bindings, node config, and retention policy.
- Keep types independent from React Flow.
- Note: the first type module lives in `src/lib/workflowGraph.ts`; backend
  imports should be finalized when graph validation/runtime APIs are introduced
  so we do not churn TypeScript path configuration prematurely.

Acceptance criteria:

- Types are importable by frontend and Convex code.
- Graph supports many-to-many node relationships.
- Graph supports node positions and canvas viewport.

#### SW-0102: Add graph validation helpers

Status: `Done`

Deliverables:

- Add validation for node IDs, edge references, port references, graph cycles,
  terminal node existence, and one-final-post expectation.
- Decide whether cycles are rejected for v1.
- Decision: v1 requires exactly one runner node and rejects cycles.

Acceptance criteria:

- Invalid graph edges are rejected before saving.
- A workflow cannot run without a runner node.
- A workflow cannot run without a terminal export/post/compiler path.

#### SW-0103: Store graph JSON for workflows

Status: `Done`

Deliverables:

- Replace workflow definition `steps` with canonical `graph` JSON.
- Update workflow creation to seed a minimal canvas-native graph.
- Remove old step-array validators and step execution modules.
- Keep manual runs honest with a graph-runner placeholder until graph
  execution tickets implement node execution.

Acceptance criteria:

- Workflows store graph definitions.
- New workflows are created with a valid starter graph.
- No backend API accepts the old step-array workflow definition.

#### SW-0104: Collapse workflow versions into current workflow graph

Status: `Done`

Deliverables:

- Remove `workflowVersions`.
- Remove `activeVersionId` from workflows and `workflowVersionId` from runs.
- Store the current graph directly on each workflow.
- Add an API for saving the current workflow graph.
- Keep run history as statuses, node events, and artifact references instead
  of historical graph snapshots.

Acceptance criteria:

- Canvas can save without running.
- Runs use the workflow's current graph.
- No backend API or schema field references workflow versions.

#### SW-0105: Add node catalog registry

Status: `Done`

Deliverables:

- Add a typed registry of node definitions, ports, config schema, defaults,
  provider requirements, and output artifact types.
- Include `runner`, `comment`, `media`, `llm`, `ai_agent`,
  `image_generation`, `video_generation`, `audio_generation`, `lipsync`,
  `native_slideshow_planner`, `native_slideshow_renderer`, `ai_video_editor`,
  `post_compiler`, `export`, and `auto_post`.
- Mark provider/model-specific config as dynamic so exact BulkAPIs model
  parameters can be researched in the per-node implementation tickets.
- Use the catalog for graph node and port validation.

Acceptance criteria:

- Frontend can list node types from the catalog.
- Runner can resolve execution handlers by node type.
- Catalog includes the agreed v1 workflow vocabulary, including Comment, Audio
  Generation, Lip Sync, and AI Video Editor.

### Phase 2: Workflow List And Canvas UI

Goal: make Workflows list-first and canvas-native.

#### SW-0201: Install and wire React Flow

Status: `Done`

Deliverables:

- Add React Flow dependency.
- Create a minimal canvas page that renders nodes and edges from a workflow
  graph.
- Add a workflow detail route at `/workflows/:workflowId`.
- Make workflow list entries open the canvas route.
- Keep the first canvas read-only; editing controls land in later canvas
  tickets.

Acceptance criteria:

- Opening a workflow shows a pannable/zoomable canvas.
- Saved node positions render correctly.
- No provider execution is connected yet.

#### SW-0202: Build workflow list entry point

Status: `Done`

Deliverables:

- Keep Workflows as list-first.
- Add filters for brand, format, status, and schedule state.
- Add actions for new blank workflow, new from template, and open workflow.
- New blank workflow creation navigates directly to the workflow canvas.
- Template creation is enabled once workflow templates are implemented.

Acceptance criteria:

- User sees list before canvas.
- Blank workflow creation opens canvas.
- Existing workflows remain visible.

#### SW-0203: Build canvas node palette

Status: `Done`

Deliverables:

- Add a node palette for core node types.
- Support adding nodes to canvas.

Acceptance criteria:

- User can add core nodes.
- New nodes get stable IDs and default config.
- Canvas save persists added nodes.

Implementation notes:

- Added a catalog-driven node palette grouped by node category.
- Converted the canvas to controlled React Flow state with explicit graph saving.
- Runner additions are disabled once the workflow already has its single runner.

#### SW-0204: Build node settings inspector

Status: `Done`

Deliverables:

- Add side inspector for selected node.
- Support editing label, model/provider fields, common config fields, and
  retention policy.

Acceptance criteria:

- Editing settings does not execute nodes.
- Changes persist to the current workflow graph.

Implementation notes:

- Added a selected-node inspector to the canvas workspace.
- Node label, provider, model, retention, and primitive config values can be edited without execution.
- The controlled canvas state now carries graph config so newly added nodes can be configured before saving.

#### SW-0205: Build edge/port connection UI

Status: `Done`

Deliverables:

- Define visible input/output ports for nodes.
- Support connecting compatible ports.
- Show validation errors for incompatible connections.

Acceptance criteria:

- User can connect many-to-many graph relationships.
- Invalid connections are blocked or clearly marked.

Implementation notes:

- Added visible input/output port labels on workflow nodes.
- Users can connect compatible ports directly on the canvas; edges persist through the existing graph save.
- Duplicate edges, self-edges, incompatible port types, missing ports, and cycles are blocked before saving.

#### SW-0206: Add canvas execution panel

Status: `Done`

Deliverables:

- Add run button.
- Add run history inside workflow detail.
- Show per-node status, latest outputs, errors, duration, and cost.

Acceptance criteria:

- User can inspect a run without leaving the canvas.
- Debug artifacts are visible at the node that produced them.

Implementation notes:

- Added an execution panel to the workflow canvas with a manual run button, graph status, run history, selected-run metrics, events, and artifacts.
- Manual runs use the existing durable workflow run records and require the saved graph to be valid before queueing.
- The selected run can highlight current/error node state, and the node inspector shows node-scoped run events when present.

### Phase 3: BulkAPIs Provider Foundation

Goal: make BulkAPIs the default generation provider while preserving provider
abstraction.

#### SW-0301: Add BulkAPIs environment configuration

Status: `Done`

Deliverables:

- Add `BULKAPIS_API_KEY`.
- Add optional `BULKAPIS_BASE_URL`.
- Update `.env.example`.
- Document that keys are server-side only.

Acceptance criteria:

- No BulkAPIs key is exposed to the client.
- Missing config produces clear provider errors.

Implementation notes:

- Added server-only `BULKAPIS_API_KEY` and optional `BULKAPIS_BASE_URL` documentation.
- Added a shared backend BulkAPIs config helper with a default base URL and provider-style missing-key error.
- Added `bulkapis` to the model provider type and validator so the next adapter ticket can register it cleanly.

#### SW-0302: Add BulkAPIs model provider adapter

Status: `Done`

Deliverables:

- Register `bulkapis` as a model provider.
- Implement chat generation.
- Implement async generation submit for image/video/audio/lipsync/music/render.
- Implement task polling.
- Normalize provider errors.

Acceptance criteria:

- Adapter matches existing model provider interface or cleanly extends it.
- Async task IDs are stored in artifacts/run outputs.
- Provider result media URLs are normalized into generated assets.

Implementation notes:

- Registered `bulkapis` as a backend model provider.
- Added shared BulkAPIs request handling, envelope errors, HTTP status mapping, sync chat/structured generation, async image/video submit, and task polling.
- Added a conservative `metadata.bulkapisInput` escape hatch for model-specific fields until the model catalog/schema tickets make node config dynamic.
- Audio, lipsync, music, and video-render are supported by BulkAPIs but need workflow-node-specific runner adapters because the current provider interface only models text, image, video, and task polling.

#### SW-0303: Add provider model catalog table

Status: `Done`

Deliverables:

- Add table for provider models, schema snapshots, pricing, category,
  capabilities, and sync timestamps.

Acceptance criteria:

- BulkAPIs model metadata can be cached.
- Node configuration can reference the provider schema snapshot it was built
  from.

Implementation notes:

- Added a shared `providerModels` table for model metadata, pricing, capabilities, schema snapshots, and sync timestamps.
- Added provider/category/model indexes for UI lookup and sync upserts.
- Added model catalog list/get/upsert backend functions; live BulkAPIs fetching remains in SW-0304.

#### SW-0304: Implement BulkAPIs model catalog sync

Status: `Done`

Deliverables:

- Fetch `GET /api/v1/ai/models`.
- Store `inputSchema`, `resultSchema`, pricing, and capabilities.
- Add manual sync action.
- Add error state and last synced time.

Acceptance criteria:

- Settings or provider admin surface can trigger sync.
- Node editor can read cached model schemas.

Implementation notes:

- Added authenticated manual sync action for `GET /ai/models`.
- Normalizes BulkAPIs models into provider catalog category, capabilities, pricing, schema snapshots, raw metadata, and `lastSyncedAt`.
- Tightened catalog writes behind an internal upsert mutation; clients can trigger sync or read catalog data but cannot directly mutate model metadata.

#### SW-0305: Add dynamic schema-driven settings renderer

Status: `Done`

Deliverables:

- Render model-specific fields from cached `inputSchema`.
- Add friendly wrappers for common fields: prompt, image input, audio input,
  duration, aspect ratio, resolution, count, seed, webhook.

Acceptance criteria:

- Image/video/audio/lipsync nodes change fields when model changes.
- Unknown schema fields are still editable in an advanced section.

Implementation notes:

- The canvas inspector now reads cached provider models and switches the model
  control from free text to a catalog-backed selector.
- Node config fields are merged from the selected model's cached `inputSchema`,
  node-specific friendly fields, and any existing saved config keys.
- Unknown or structured fields render in an editable Advanced section instead
  of becoming read-only blobs.

#### SW-0306: Evaluate BulkAPIs publishing coverage

Status: `Done`

Deliverables:

- Verify which social platforms BulkAPIs supports for posts, scheduling,
  analytics, and OAuth.
- Compare against Postiz.
- Decide whether BulkAPIs should replace Postiz, coexist with Postiz/Post
  Bridge, or stay out of posting initially.

Acceptance criteria:

- Decision is documented before removing Postiz code.
- No existing publishing capability is removed prematurely.

Implementation notes:

- Reviewed BulkAPIs docs across accounts, posts, media, analytics, schedules,
  automations, comments, DMs, X intelligence, viral watch, and webhooks.
- Reviewed Postiz public API docs for integrations, post creation/scheduling,
  platform settings, provider coverage, and analytics.
- Decision: do not use BulkAPIs for posting right now. BulkAPIs should remain
  focused on AI/model/media generation.
- Postiz and/or Post Bridge should remain the publishing path for TikTok-first
  and multi-platform workflows.
- Next implementation should keep `auto_post` and distribution plans routed
  through the publishing abstraction without adding a BulkAPIs posting adapter.

### Phase 4: Graph Runner

Goal: execute workflow graphs node by node with durable run state.

#### SW-0401: Add graph run execution model

Status: `Done`

Deliverables:

- Add run data for node statuses, started/completed times, errors, cost, output
  refs, and provider jobs.
- Preserve existing workflow run/event concepts.

Acceptance criteria:

- A run can show status per node.
- A failed node blocks dependent nodes.

Implementation notes:

- Added durable `workflowRunNodeStates` records with per-node status,
  dependency IDs, blocked-by IDs, provider jobs, output refs, timing, cost, and
  errors.
- Manual run creation now snapshots one node-state row per saved graph node.
- Added backend queries/mutations for reading node states and transitioning a
  node state; failed nodes mark downstream dependent nodes as blocked.
- The current runner stub now fails against the runner node so the canvas can
  display failed/blocked node state before the real executor lands.
- The workflow canvas execution panel now reads node states and shows per-node
  run status in both the canvas nodes and selected run debug panel.

#### SW-0402: Build graph topological executor

Status: `Done`

Deliverables:

- Execute ready nodes based on dependencies.
- Support fan-out and merge.
- Prevent automatic execution on edit.

Acceptance criteria:

- User-triggered run executes graph from runner to terminal nodes.
- Many-to-many graph dependencies work.

Implementation notes:

- Replaced the runner stub with a defensive topological executor.
- The executor starts at the single runner node, walks nodes reachable from the
  runner, and executes ready batches once all upstream dependencies have
  succeeded.
- Fan-out and merge are represented through dependency tracking: multiple ready
  downstream nodes can run in the same pass, and merge nodes wait for every
  upstream dependency.
- Node bodies still use placeholder execution until Phase 5 node-specific
  tickets land, but run/node status, events, and summaries now reflect real DAG
  scheduling instead of immediately failing.
- If the executor cannot make progress, it fails the run with pending/completed
  node context rather than hanging.

#### SW-0403: Add input binding resolver

Status: `Done`

Deliverables:

- Resolve a node input from config literal, upstream output, media asset,
  persona, or previous artifact.

Acceptance criteria:

- "Prompt from input node" and "image from input node" are represented as
  bindings, not ad hoc booleans.

Implementation notes:

- Added a typed `nodeInputBindingValidator` for literal values, node outputs,
  artifacts, creative assets, and personas.
- Added a backend input resolver that combines node config, incoming graph
  edges, explicit `inputBindings`, upstream node output refs, artifacts, and
  reusable creative assets into one resolved input map.
- The graph executor now resolves inputs before each placeholder node execution
  and records input summaries in node events.
- Placeholder node execution now emits output refs for outbound ports so
  downstream nodes can resolve upstream inputs through the same path the real
  Phase 5 node bodies will use.

#### SW-0404: Add artifact retention policies

Status: `Done`

Deliverables:

- Implement run-level and node-level retention.
- Hide debug artifacts from Library unless retained or final.
- Keep failure debug outputs when configured.

Acceptance criteria:

- Test runs can keep every output.
- Production runs can keep final output only.

Implementation notes:

- Added a `debug` artifact lifecycle for run/debug outputs that should remain
  inspectable without becoming Library content.
- Artifact list queries now return run artifacts for run inspection, but hide
  debug/preview/discarded artifacts from general Library-style queries unless
  debug artifacts are explicitly requested.
- Workflow graph settings now include optional run mode and artifact retention
  policy fields for future UI/MCP control.
- Placeholder executor outputs now create lifecycle-tagged artifacts and attach
  them to node output refs, so retention behavior can be tested before real
  node implementations create media artifacts.
- Test/keep-all placeholder outputs are `debug`, node-level `keep` outputs are
  `saved`, and default production or discarded intermediates are `discarded`
  until terminal/final-output tickets promote final artifacts.

#### SW-0405: Add terminal post package compiler

Status: `Done`

Deliverables:

- Define final post package schema.
- Compile media, caption, platform settings, and destination policy.

Acceptance criteria:

- Every successful workflow run has one final post package.
- Export and Auto Post consume post packages.

Implementation notes:

- Added a post package artifact contract using `publish_payload` artifacts with
  `schemaVersion`, `kind`, `postType`, `caption`, `mediaArtifactIds`,
  `platformSettings`, `destinationPolicy`, and metadata.
- `post_compiler` nodes now create saved post package artifacts instead of only
  placeholder outputs.
- Terminal `export` and `auto_post` nodes consume upstream post packages when
  present; if a terminal node receives media/input without a package, it creates
  a fallback final post package so successful runs still have one final package.
- The runner also creates a workflow-level fallback package at completion if no
  reachable node produced a post package, preventing successful runs from ending
  without a final package artifact.
- Post package artifact IDs are attached to node output refs so Export/Auto
  Post implementation tickets can consume the package without re-resolving raw
  upstream node outputs.
- Library artifact summaries now describe publish payloads as post packages
  with post type, media count, and caption readiness.

### Phase 5: Core Node Implementations

Goal: implement the first useful node set for slideshow and video workflows.

#### SW-0501: Runner node

Status: `Done`

Deliverables:

- Add manual run support.
- Add schedule configuration placeholder.
- Add retries, timeout, and failure behavior fields.

Acceptance criteria:

- A workflow must have one runner node.
- Runner config is visible in canvas inspector.

Implementation notes:

- Runner node defaults now include manual trigger mode, schedule placeholders,
  retry count, timeout seconds, runs per execution, timezone, and failure
  behavior.
- Starter workflows use the same concrete runner config as the node catalog.
- The canvas inspector renders runner controls as first-class fields with enums
  for trigger, schedule type, and failure behavior, plus numeric controls for
  retry/timeout/scheduling values.
- The one-runner invariant was already enforced by graph validation and the
  palette add-node guard; this ticket keeps that behavior intact.

#### SW-0502: Media node

Status: `Done`

Deliverables:

- Support uploaded image/video/audio assets.
- Support references to existing media library assets and persona-attached
  assets.

Acceptance criteria:

- Downstream nodes can consume media outputs.

Implementation notes:

- Media node config now uses explicit `artifactIds`, `creativeAssetIds`, and
  `uploadedMedia` arrays instead of one ambiguous asset list.
- Persona selection was added in SW-0602 through `personaIds`, which exposes
  each persona's attached source, generated, and voice assets downstream.
- The canvas inspector exposes those fields in the Media node config section as
  structured editable JSON values.
- The graph runner resolves Media node references into typed media items from
  saved artifacts, reusable creative assets, and uploaded media URL records.
- Media nodes now emit concrete `media`, `image`, `video`, and `audio` output
  refs with artifact IDs where available, so downstream nodes can consume media
  through the normal input resolver.

#### SW-0503: LLM node

Status: `Done`

Deliverables:

- Support provider/model selection.
- Support system prompt, user prompt, and prompt-from-input binding.
- Support structured output option.

Acceptance criteria:

- LLM node can produce text artifacts for downstream nodes.

Implementation notes:

- The workflow runner now treats `llm` as a real executable node instead of a
  placeholder.
- LLM execution resolves provider/model from the graph node, then calls the
  registered model provider adapter for text or structured JSON generation.
- Prompt execution supports `systemPrompt`, `prompt`, and upstream `context`
  inputs, including prompt-from-input style bindings through the shared input
  resolver.
- LLM outputs are saved as retained `text_draft` artifacts according to the
  workflow/node retention policy and emit `text`, `prompt`, and optional `json`
  output refs for downstream nodes.
- Runner events now record model-call metadata, generated artifact IDs, output
  ports, and provider cost where returned.

#### SW-0504: AI Agent node

Status: `Done`

Deliverables:

- Add agent preset registry.
- Initial presets: analyze input, script writer, prompt variation, image
  prompting agent, video prompting agent.

Acceptance criteria:

- Agent node has preset-specific settings.
- Agent node produces typed outputs.

Implementation notes:

- Added the initial AI Agent preset registry with analyze input, script writer,
  prompt variation, image prompting, and video prompting presets.
- The canvas inspector now derives AI Agent config fields from the selected
  preset instead of showing one generic settings shape for every agent.
- AI Agent nodes now execute through the registered model provider abstraction
  using structured output, with preset-specific system prompts and prompt
  assembly for request, context, media, and settings.
- Agent outputs are saved as typed artifacts (`text_draft`, `script`, or
  `prompt`) according to the selected preset and emit typed output refs such as
  `analysis`, `script`, `prompt`, `text`, and `json`.

#### SW-0505: Image Generation node

Status: `Done`

Deliverables:

- Use BulkAPIs by default.
- Support model-specific settings from schema.
- Support prompt and image input bindings.

Acceptance criteria:

- Node can generate one or more image outputs.
- Async task status is visible in canvas.

Implementation notes:

- The workflow runner now treats `image_generation` as a real executable node.
- Image generation resolves prompts from config or upstream prompt bindings,
  resolves reference images from media/image/reference-image inputs, and calls
  the registered model provider with BulkAPIs as the catalog default.
- Model-specific settings from the node config are passed through to provider
  input overrides while workflow-level fields such as prompt, aspect ratio,
  count, and reference image URL remain normalized.
- Generated images are stored in Convex storage, saved as `image` artifacts
  according to the node/workflow retention policy, and emitted on the `image`
  output port for downstream nodes.
- Async provider jobs are attached to the workflow node state during submission,
  polling, and completion so the canvas can surface job status.

#### SW-0506: Video Generation node

Status: `Done`

Deliverables:

- Use BulkAPIs by default.
- Support text-to-video, image-to-video, start/end frame, reference video, and
  model-specific fields via schema.

Acceptance criteria:

- Kling/Veo-style model differences are driven by model schema and normalized
  node bindings.

Implementation notes:

- The workflow runner now treats `video_generation` as a real executable node.
- Video generation resolves prompt, aspect ratio, duration, image-to-video,
  start-frame, end-frame, and reference-video inputs from config or upstream
  node bindings.
- Normalized start/end/reference media URLs are passed through provider input
  overrides alongside schema-driven model fields so BulkAPIs/Kling/Veo-style
  model requirements can be represented without hardcoding a separate node per
  model.
- Video jobs are submitted through the registered model provider, attached to
  the workflow node state, polled until completion, and marked succeeded with
  provider job status metadata.
- Completed video assets are stored in Convex storage, saved as `video`
  artifacts according to retention policy, and emitted on the `video` output
  port for downstream editor, compiler, export, and posting nodes.

#### SW-0507: Audio/TTS node

Status: `Done`

Deliverables:

- Support text input, voice reference input, and model-specific audio settings.

Acceptance criteria:

- Node can produce audio artifacts for lipsync or video render nodes.

Implementation notes:

- Extended the shared model provider abstraction with audio generation support
  instead of making Audio/TTS a BulkAPIs-only runner special case.
- BulkAPIs audio generation now uses the same async `/ai/generate` and
  `/ai/tasks/{taskId}` flow as image/video, matching the documented Audio/TTS
  input fields (`text`, optional voice `audio_url`, temperature/exaggeration,
  CFG, seed, and schema-driven extras).
- The workflow runner now treats `audio_generation` as a real executable node,
  resolving text and optional voice reference audio from config or upstream
  bindings.
- Generated audio is stored in Convex storage, saved as `rendered_asset`
  artifacts with `kind: "audio"`, and emitted on the `audio` output port for
  downstream lipsync and video render nodes.
- Async provider job status is attached to the workflow node state during
  submission, polling, and completion.

#### SW-0508: Lipsync node

Status: `Done`

Deliverables:

- Support video/image input, audio input, model selection, and model-specific
  settings.

Acceptance criteria:

- Node can consume upstream media and audio outputs.

Implementation notes:

- Extended the shared model provider abstraction with lipsync generation
  support so the node can use BulkAPIs without hardcoding provider calls in the
  runner.
- BulkAPIs lipsync generation now submits async `/ai/generate` jobs with
  normalized `image_url` or `video_url`, required `audio_url`, optional
  resolution/turbo settings, and schema-driven provider extras.
- The workflow node catalog now accepts either an image or video input plus the
  required audio input.
- The workflow runner now treats `lipsync` as a real executable node, resolving
  upstream image/video/audio artifacts or configured URLs, polling the provider
  task until a video is returned, storing the result, and emitting it on the
  `video` output port.
- Async provider job status is attached to the workflow node state during
  submission, polling, and completion.

#### SW-0509: AI Video Editor / Video Render node

Status: `Done`

Deliverables:

- Use BulkAPIs Video Render.
- Support media inputs, prompt, system prompt, knowledge base, aspect ratio,
  dimensions, FPS, and max duration.

Acceptance criteria:

- Node can stitch or compose final video output from upstream assets.

Implementation notes:

- Extended the shared model provider abstraction with video-render generation
  support so the AI Video Editor can use BulkAPIs Video Render through the same
  adapter layer as image, video, audio, and lipsync nodes.
- BulkAPIs video render now submits async `/ai/generate` jobs with prompt,
  optional system prompt, knowledge base, normalized media URLs, aspect ratio,
  dimensions, FPS, max duration, and schema-driven provider extras.
- The workflow runner now treats `ai_video_editor` as a real executable node,
  resolving upstream images, videos, audio, and media library references into
  render media assets.
- Completed render outputs are stored in Convex storage, saved as `video`
  artifacts according to retention policy, and emitted on the `video` output
  port for post compiler, export, or auto-post nodes.
- Async provider job status is attached to the workflow node state during
  submission, polling, and completion.

#### SW-0510: Native Slideshow Planner node

Status: `Done`

Deliverables:

- Adapt existing one-off slideshow planner to graph node execution.
- Produce slide spec artifacts.

Acceptance criteria:

- Existing prompt quality is preserved.
- Slide specs can feed image and renderer nodes.

Implementation notes:

- The workflow runner now treats `native_slideshow_planner` as a real
  executable node instead of a placeholder.
- Planner execution reuses the existing production slideshow planning prompts,
  schemas, image-prompt writer pass, and `normalizePlan` logic from the
  one-off Create flow.
- The node resolves prompt, brand context, media references, slide count,
  aspect ratio, platform, tone, and optional rendering mode from config or
  upstream inputs.
- Planner output is saved as a `slide_spec` artifact with provider metadata,
  image-prompt metadata, reference counts, and input summary.
- The node emits a `slide_spec` output ref so downstream image generation and
  native slideshow renderer nodes can consume the planned slideshow.

#### SW-0511: Native Slideshow Renderer node

Status: `Done`

Deliverables:

- Adapt existing slideshow renderer/editor output to workflow artifacts.
- Produce rendered slide assets for post packages.

Acceptance criteria:

- Existing slideshow previews remain usable.
- Rendered outputs can feed Post Compiler.

Implementation notes:

- The workflow runner executes `native_slideshow_renderer` nodes by consuming a
  `slide_spec` output, building the shared canonical slideshow spec, and
  creating an editable `slideshows` preview row.
- Renderer nodes create a `rendered_asset` workflow artifact with the native
  slideshow manifest, slideshow id, dimensions, slide count, source spec id,
  and any mapped image artifact ids.
- Post Compiler can now receive slideshow outputs directly, and package
  gathering includes slideshow artifacts alongside image, video, audio, and
  media inputs.

#### SW-0512: Post Compiler node

Status: `Done`

Deliverables:

- Compile slideshow, single image, carousel, video, caption, and platform
  settings into one post package.

Acceptance criteria:

- Workflow run final output is one post package.

Implementation notes:

- Post Compiler now executes as a first-class runner branch rather than through
  the generic placeholder/terminal block.
- Compiled `publish_payload` artifacts use a richer schema with inferred
  `postType`, caption, `mediaArtifactIds`, ordered `mediaItems`, media counts,
  platform settings, destination policy, and optimization targets.
- Native slideshow renderer outputs compile as slideshow media items, while
  single images, multiple images/carousels, video, and audio are inferred from
  artifact types and asset metadata.

#### SW-0513: Export node

Status: `Done`

Deliverables:

- Export post package to Media Library first.
- Add future extension points for download and external destinations.

Acceptance criteria:

- Successful run can end without publishing.

Implementation notes:

- Export now executes as a real terminal node and is included in the runner's
  implemented-node set.
- Media Library export marks the final post package as exported by appending an
  export record to the saved `publish_payload` artifact rather than creating a
  placeholder artifact.
- If Export receives raw media instead of a post package, it compiles a package
  first and then exports that package.
- Download and external destinations are represented as explicit pending export
  records so future delivery integrations can attach without pretending an
  upload already happened.

#### SW-0514: Auto Post node

Status: `Done`

Deliverables:

- Use publishing provider abstraction.
- Support manual, Postiz, and Post Bridge after publishing coverage decision.

Acceptance criteria:

- Workflow can auto-post only when explicitly configured.
- Publishing errors are visible on the node and run.

Implementation notes:

- Auto Post now executes as a real terminal node and routes through the
  publishing provider abstraction instead of BulkAPIs.
- The node creates a distribution plan from the upstream post package. If
  `autoPublish` is not explicitly true, the plan remains a draft for later
  manual publishing.
- When `autoPublish` is true, the runner publishes or schedules through the
  selected provider (`manual`, `postiz`, or `post_bridge` once an adapter is
  registered) and records provider status, external post ids, and failures on
  the node, run events, distribution plan, and post package artifact.
- Auto Post defaults to `manual` instead of BulkAPIs, and the canvas provider
  selector now exposes Post Bridge as a publishing provider option.

### Phase 6: Personas And Assets

Goal: create reusable creative identities and assets for workflow nodes.

#### SW-0601: Rename and expand reusable asset concept

Status: `Done`

Deliverables:

- Introduce broader `creativeAssets` or `personas/assets` product model.
- Replace the narrow reusable asset model cleanly.

Acceptance criteria:

- Product assets, style refs, mascots, personas, and voice refs can be stored.

Implementation notes:

- Replaced the old `brandAssets` table/API with `creativeAssets`, using
  `assetKind` and `mediaType` fields so reusable assets can represent products,
  style references, mascots, personas, voice references, logos, characters,
  people, and other files.
- Updated Create slideshow reference selection and workflow media nodes to use
  `creativeAssetIds` instead of previous split reference asset arrays.
- Creative asset creation now accepts explicit asset kinds, infers media type
  from MIME/URL data, and can store image, video, audio, or generic file media.

#### SW-0602: Add persona model

Status: `Done`

Deliverables:

- Store persona name, type, description, identity prompt, visual constraints,
  source images, generated images, voice refs, and usage notes.

Acceptance criteria:

- Personas can be selected by workflow nodes.

Implementation notes:

- Added a first-class `personas` table and account API for reusable creative
  identities, separate from the media files stored as `creativeAssets`.
- Personas store name, type, description, identity prompt, visual constraints,
  source asset ids, generated asset ids, voice asset ids, usage notes, and
  metadata.
- Persona mutations validate that attached creative assets belong to the same
  user and brand, and voice references must be audio or voice creative assets.
- Workflow persona input bindings now resolve persona profile data plus attached
  source/generated/voice assets instead of treating personas as creative asset
  rows.
- Media nodes can now select `personaIds` and expose the persona's attached
  creative assets downstream with persona metadata included on each item.

#### SW-0603: Build Personas UI

Status: `Done`

Deliverables:

- List personas.
- Create/edit persona.
- Upload source images.
- View generated images.

Acceptance criteria:

- User can create fictional AI personas, transformation identities, and mascots.

Implementation notes:

- Added a Personas nav tab and page for brand-scoped persona management.
- The page supports persona list selection, new persona creation, editing the
  identity profile, visual constraints, usage notes, and persona type.
- Existing creative assets can be attached as source, generated, or voice
  references, and new files can be uploaded into creative assets and attached in
  the same flow.
- Generated assets are shown as a reusable look set for the selected persona.
- Workflow media node config now renders a persona picker for `personaIds`
  instead of requiring raw JSON edits.

#### SW-0604: Add persona generation workflow template

Status: `Done`

Deliverables:

- Template for creating consistent persona image sets.

Acceptance criteria:

- Generated assets attached to personas can be reused in content workflows.

Implementation notes:

- Added a reusable workflow template module and a `Persona image set` template.
- The Workflows page can now create a workflow from this template instead of
  showing a disabled template action.
- The template creates a canvas with Runner, Persona References, Persona Prompt
  Agent, Image Generation, Export, and an operator note.
- The template is designed for selecting personas in the Media node, generating
  a consistent image set, exporting outputs to the media library, and attaching
  approved images back to personas as generated assets.
- Updated the workflow executor so upstream source nodes such as Media execute
  when they feed a runner-reachable branch, even if they are not directly
  downstream of the Runner node.

### Phase 7: Templates And Create Migration

Goal: make the product approachable without form-only workflow builders.

#### SW-0701: Add workflow template registry

Status: `Done`

Deliverables:

- Store templates as graph definitions with placeholders.
- Initial templates: AI UGC ad, before/after transformation, slideshow
  carousel, app demo video, talking avatar, hook/b-roll/voiceover short.

Acceptance criteria:

- User can clone a template into a workflow canvas.

Implementation notes:

- Replaced the one-off template list with a typed workflow template registry
  that stores metadata, category, purpose, output type, publishing defaults,
  required input placeholders, and graph definitions.
- Added initial registry templates for AI UGC ad, before/after transformation,
  slideshow carousel, app demo video, talking avatar, hook/b-roll/voiceover
  short, plus the existing Persona image set template.
- Template creation now clones graph definitions from the registry into an
  editable workflow canvas.
- Expanded the frontend `ContentFormat` type and blank-workflow format selector
  to match the backend content format vocabulary.

#### SW-0702: Add template picker

Status: `Done`

Deliverables:

- Add new workflow flow from template.
- Show template purpose, required inputs, and output type.

Acceptance criteria:

- Template opens as editable canvas.

Implementation notes:

- Replaced the inline template buttons with a dedicated Template Picker panel
  on the Workflows page.
- Added category filtering, template selection, purpose text, output type,
  content format, node count, and required input details.
- Template creation now uses the selected template detail view and opens the
  cloned workflow in the canvas.

#### SW-0703: Convert Create into prompt-to-workflow draft

Status: `Done`

Deliverables:

- Change Create from independent generator to front door for generating a
  workflow draft or quick-run workflow.

Acceptance criteria:

- Create uses workflow engine.
- Existing one-off slideshow path is either migrated or wrapped.

Implementation notes:

- Replaced the Create page's independent one-off slideshow request flow with a
  prompt-to-workflow draft creator.
- Create now selects brand/account, template, optional workflow name, and a
  content idea, then creates a workflow from the selected template and opens the
  workflow canvas.
- Template graph creation can now hydrate placeholder prompt values from the
  Create content idea before cloning the graph.
- Removed the old Create-only slideshow form, request list, plan panel,
  reference picker, preview panel, create hook, and editable create preview
  export from the frontend.

#### SW-0704: Add "turn run into workflow" behavior

Status: `Done`

Deliverables:

- Let a successful quick run become a saved workflow.

Acceptance criteria:

- User can move from one-off success to reusable automation.

Implementation notes:

- Completed workflow runs can now be saved as new inactive workflow drafts from
  the Runs page.
- Run-to-workflow cloning copies the source workflow graph, approval policy,
  publishing provider/platform settings, schedule shape, and model defaults, but
  disables auto-publish on the clone so the draft is safe to tune before it is
  activated.
- The new draft opens directly in the workflow canvas after creation.

### Phase 8: MCP Integration Surface

Goal: let external AI agents create, edit, run, and inspect workflows.

#### SW-0801: Define MCP auth and access model

Status: `Done`

Deliverables:

- Decide how MCP authenticates against Content Engine.
- Decide whether it uses user API keys, Clerk tokens, or server-side app tokens.

Acceptance criteria:

- MCP can be used as a real external integration surface.
- Security model is documented before tools mutate data.

Implementation notes:

- Added `docs/mcp-auth-access-model.md` with the chosen credential model,
  identity mapping, scopes, access classes, authorization checks, audit
  requirements, local development behavior, and implementation implications.
- Decided that v1 MCP should use user-owned API keys, with Clerk/OAuth bearer
  tokens later for clients that support delegated HTTP auth.
- Rejected server-side app tokens for user-facing MCP because they bypass the
  user boundary unless every tool recreates identity scoping manually.

#### SW-0802: Add MCP resources

Status: `Done`

Deliverables:

- Expose workflow schema, node catalog, templates, prompt recipes, model catalog,
  brand summaries, persona summaries, and creative asset summaries as resources.

Acceptance criteria:

- An AI agent can inspect enough context to build workflows correctly.

Implementation notes:

- Added `convex/mcp/resources.ts` with MCP-shaped `list` and `read` queries.
- Exposed static resources for architecture guidance, workflow graph schema,
  node catalog, built-in templates, and agent prompt recipes.
- Exposed authenticated user-scoped resources for active provider model catalog,
  brand summaries, persona summaries, and creative asset summaries.
- Added `docs/mcp-resources.md` to document the resource URIs, MIME types, and
  expected agent usage.

#### SW-0803: Add workflow MCP tools

Status: `Done`

Deliverables:

- List/create/update workflows.
- Add/update/delete nodes.
- Connect/disconnect edges.
- Run workflow.

Acceptance criteria:

- Codex/Claude can create a valid workflow programmatically.

Implementation notes:

- Added `convex/mcp/workflows.ts` with user-scoped workflow list/get,
  create-blank, create-from-template, metadata update, graph update, node/edge
  editing, graph validation, and run-start handlers.
- Added `convex/workflows/runCreation.ts` so the existing manual run mutation and
  MCP workflow run handler share the same queued-run creation path.
- Updated `convex/workflows/runs.ts` to use the shared run creation helper.
- Added `docs/mcp-workflow-tools.md` to document the workflow MCP tool contract,
  safety rules, validation behavior, and future scope mapping.

#### SW-0804: Add run/artifact MCP tools

Status: `Not Started`

Deliverables:

- Inspect run status.
- Inspect node outputs.
- List final artifacts.
- Approve/revise/export/publish where allowed.

Acceptance criteria:

- External agents can operate workflow debugging loops.

#### SW-0805: Add prompt engineering knowledge base resources

Status: `Not Started`

Deliverables:

- Add resources for AI UGC prompting, transformation content prompting, slideshow
  prompting, video prompting, and node selection heuristics.

Acceptance criteria:

- Workflow-building agents can reuse product expertise without hardcoding it in
  every prompt.

### Phase 9: Scheduling, Publishing, And Feedback

Goal: let workflows run repeatedly and improve from performance.

#### SW-0901: Add schedule runner

Status: `Not Started`

Deliverables:

- Support interval, daily, weekly, and run count per scheduled execution.
- Store next run time.
- Add cron execution.

Acceptance criteria:

- Scheduled workflows run without manual clicks.

#### SW-0902: Add publishing provider decision implementation

Status: `Not Started`

Deliverables:

- Based on SW-0306, route publishing through Postiz and/or Post Bridge, not
  BulkAPIs.

Acceptance criteria:

- TikTok-first publishing path is clear.
- X/Twitter path is clear through the selected publishing provider.

#### SW-0903: Add platform-aware post compiler presets

Status: `Not Started`

Deliverables:

- Add presets for TikTok, Instagram, YouTube Shorts, X, LinkedIn, and future
  platforms.

Acceptance criteria:

- Workflow can create platform-specific post packages without changing upstream
  creative nodes.

#### SW-0904: Add metrics ingestion into workflow history

Status: `Not Started`

Deliverables:

- Link published post metrics to workflow, run, post package, and brand.

Acceptance criteria:

- Analytics can compare workflow performance.

#### SW-0905: Add performance feedback resources

Status: `Not Started`

Deliverables:

- Summarize winning hooks, formats, personas, topics, and posting patterns.

Acceptance criteria:

- Future workflow runs and MCP agents can use historical performance.

## Suggested First Execution Sequence

1. SW-0003: fix current TypeScript issues.
2. SW-0101: define workflow graph types.
3. SW-0102: graph validation helpers.
4. SW-0103: schema support for graph JSON.
5. SW-0105: node catalog registry.
6. SW-0201: React Flow canvas shell.
7. SW-0202: workflow list entry point.
8. SW-0203 through SW-0206: basic canvas editing and execution panel.
9. SW-0301 through SW-0305: BulkAPIs provider and schema-driven settings.
10. SW-0401 through SW-0405: graph runner.

This sequence keeps the first technical milestone focused: a user can create a
canvas workflow, add nodes, connect them, save the graph, and run a simple
provider-backed generation flow.

## Execution Protocol For Future Tickets

Before implementing any ticket, Codex should provide:

- Ticket ID and goal.
- Files likely to change.
- Data model/API changes.
- UI behavior changes.
- Verification plan.
- Risks or open decisions.

After the user confirms or adjusts the plan, Codex should implement only that
ticket, run verification, and summarize the result.
