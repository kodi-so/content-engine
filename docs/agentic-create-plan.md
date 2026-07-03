# Agentic Create Plan

This document defines the product and technical plan for turning Create into a
conversation with creation tools. It is intentionally written before
implementation so product behavior, data boundaries, and ticket scope are clear.

## Product Decision

The primary Create experience should become an agentic surface where the user
starts with one plain-language brief:

> Describe what you want to create

The current Create Studio modes are still useful, but they should become a
secondary manual-tools surface instead of the main entry point. The main user
promise is:

> Describe the content you want, attach any references inline, and Content
> Engine will talk through the idea, call creation tools when needed, show
> progress, and render outputs back in the conversation.

The agentic Create surface should not require the user to pick platform,
model, workflow shape, or provider up front. Those can remain available later as
advanced controls or agent decisions.

## User Moment

The user arrives with an idea, not an implementation plan. They may know the
format they want, such as "create a slideshow" or "make an AI fruit drama
video", but they should not need to understand which internal tool generates
images, which tool renders slideshows, or which page stores outputs.

The interface should reduce the initial decision to one action:

1. Describe the desired output.
2. Optionally mention reusable references with `@`.
3. Let the agent decide whether to answer, clarify, or call tools.

## Scope Principles

- Do not lean on templates first.
- Do not build a fruit-drama-specific or transformation-specific flow.
- Make every existing platform capability available to the agent through typed
  tools over time.
- Reuse existing providers, artifacts, storage, library references, analysis,
  slideshow, video composition, workflow, and publishing primitives.
- Keep workflows as a repeatable/exportable model, not the required runtime for
  every agentic Create conversation.

## Navigation And IA

Preferred IA:

- `Create`: agentic creation surface.
- Manual tools: current one-off Create Studio modes. This can be a tab or
  secondary section inside Create at first.
- `Workflows`: repeatable, scheduled, visual automation pipelines.
- `Studio`: direct video editing/composition workspace.
- `Library`: saved reusable inputs and outputs.
- `Analyze`: source analysis, eventually callable by the Create agent.

The left nav should not add another top-level "Experiment" or "Agent" item for
this. The primary creation path should own the existing Create label.

## Prompt And Reference Mentions

The prompt box label is:

```text
Describe what you want to create
```

The prompt should support inline `@` mentions. Typing `@` opens an inline
dropdown of available references. Initial selectable references should include:

- creative assets from the library
- reusable media
- saved generated artifacts that are eligible as references

Later, this can include analyzed sources, prior Create conversations, or
workflow outputs.

Mention insertion should store structured reference metadata, not only plain
text. The visible prompt can contain a readable token, but the run should retain
the selected entity type and id.

Example structured mention:

```ts
type CreateReferenceMention = {
  token: string;
  label: string;
  entityType: "creative_asset" | "artifact" | "analysis";
  entityId: string;
  mediaType?: "image" | "video" | "audio" | "file";
  instruction?: string;
};
```

## Output Type Inference

Output type should be inferred from the user's message and conversation context.
The agent should proceed when it has high confidence. Examples:

- "Create a slideshow..." -> slideshow
- "Create an AI fruit drama video..." -> video
- "Make a set of product images..." -> image set
- "Generate a voiceover..." -> audio

If confidence is low, the agent should ask a clarifying question before calling
generation tools or spending credits.

Clarification example:

```text
Do you want this as a video, slideshow, or image set?
```

The clarification should feel conversational. It should not expose internal
workflow node or provider concepts.

## Autonomy And Checkpoints

The checkpoint setting should be user-visible but quiet. It can be a compact
toggle near the prompt or in small settings for the Create conversation.

There should be two modes:

- `debug`: pause after meaningful creation steps, such as plan, reference
  images, generated clips, audio, or assembly. This should be the default while
  the product is being debugged and tuned.
- `auto`: continue through the tool plan and show the final product at the end.

The final product should always be shown in the conversation before any
destructive or external action. Saving to the library is acceptable as a normal
final review action; publishing or scheduling should remain explicit.

Example user prompt:

```text
Create an AI fruit drama video about a banana husband and strawberry wife
winning the lottery. Show me the character images before making the video.
```

Expected behavior:

1. Agent plans the production.
2. Agent creates character/reference images.
3. Agent pauses for user confirmation.
4. User approves or requests edits.
5. Agent continues to clips, audio, assembly, and final review.

## Runtime Model

Agentic Create conversations should not be forced into saved workflow graphs by
default.

Preferred model:

- The primary durable object is a conversation thread.
- The agent has access to a typed internal tool registry.
- On each user message, the agent decides whether to answer normally, ask a
  clarifying question, call one tool, or call multiple tools.
- Each tool call is recorded durably as part of the conversation.
- Tool outputs create normal artifacts where appropriate.
- Tool outputs are rendered back into the conversation.
- Final outputs can be saved or exported.
- A successful multi-step conversation can optionally be converted into an
  editable workflow draft.

Why not require workflow graphs for everything:

- Agentic creation needs dynamic branching, retries, clarifying questions, and
  conditional checkpoints inside a normal chat flow.
- Workflow graphs are excellent for repeatable and scheduled pipelines, but can
  be restrictive as the only runtime model.
- The agent should be able to call tools directly and reason over their outputs.
- Workflow export should remain available when a user wants repeatability.

The implementation should still reuse workflow-adjacent primitives where they
are already strong:

- provider adapters
- generation handlers
- artifacts
- storage
- library reference resolution
- run events
- output refs
- publishing abstractions
- model catalog metadata

## Create Conversation Concept

The product model is a persistent Create conversation: like chatting with a
coding agent, but the agent has image, video, audio, analysis, slideshow, studio,
library, and publishing tools.

The user should not need to press a separate "Create Run" button. They can talk
through an idea, refine it, and then say something like "go ahead and create
this." The agent decides whether to respond in text, ask a question, or call
tools.

A plain text transcript alone is not enough because the system must track:

- async provider jobs
- tool calls and tool results
- generated artifacts
- intermediate reusable assets
- failures and retries
- checkpoint decisions
- current status
- cost metadata
- final saved/exported outputs

These details should live under the conversation. They are implementation
records, not separate product concepts.

Suggested minimal data model:

```ts
type CreateThreadStatus =
  | "idle"
  | "clarifying"
  | "planning"
  | "waiting_for_user"
  | "running"
  | "ready"
  | "failed"
  | "canceled"
  | "saved";

type CreateThread = {
  userId: string;
  workspaceId?: Id<"workspaces">;
  title?: string;
  status: CreateThreadStatus;
  checkpointMode: "debug" | "auto";
  lastInferredOutputType?: "image" | "video" | "audio" | "slideshow" | "post" | "unknown";
  finalArtifactIds?: Id<"artifacts">[];
  costUsd?: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
};
```

Suggested supporting records:

```ts
type CreateMessage = {
  createThreadId: Id<"createThreads">;
  role: "user" | "agent" | "system";
  content: string;
  kind?: "chat" | "clarification" | "plan" | "status" | "tool_result" | "final_review";
  referenceMentions?: CreateReferenceMention[];
  artifactIds?: Id<"artifacts">[];
  createdAt: number;
};

type CreateToolCall = {
  createThreadId: Id<"createThreads">;
  messageId?: Id<"createMessages">;
  toolName: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  label: string;
  input?: unknown;
  output?: unknown;
  artifactIds?: Id<"artifacts">[];
  costUsd?: number;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type CreateCheckpoint = {
  createThreadId: Id<"createThreads">;
  status: "open" | "approved" | "rejected" | "revised";
  label: string;
  message: string;
  artifactIds?: Id<"artifacts">[];
  response?: string;
  createdAt: number;
  updatedAt: number;
};
```

These names are not final. The important boundary is that one Create
conversation has many messages, many optional tool calls, and optional
checkpoints. A singular image generation is one tool call in the thread. A
complex video may be many tool calls in the same thread.

## Tool Registry

Create should use a typed internal tool registry rather than ad hoc direct calls.

Each tool should define:

- stable name
- user-facing label
- description
- input schema
- output schema
- execution mode: direct test handler, agent runtime, or planned
- handler
- artifact behavior
- approximate cost/risk metadata, when available
- whether it can run without user confirmation

Suggested tool definition shape:

```ts
type AgentToolDefinition<Input, Output> = {
  name: string;
  label: string;
  description: string;
  executionMode: "direct" | "agent_runtime" | "planned";
  inputSchema: unknown;
  outputSchema?: unknown;
  requiresConfirmation?: boolean;
  handler: (ctx: AgentToolContext, input: Input) => Promise<Output>;
};
```

The tool registry should be available to the planner and executor. The UI should
show user-friendly step labels rather than raw tool names.

## Initial Tool Coverage

The agent should eventually be able to access every meaningful action in the
platform. Initial wrappers should prioritize already implemented capabilities:

- list/select library references
- resolve referenced creative assets/artifacts
- analyze URL or uploaded media
- generate text or structured plans
- generate images
- edit images
- generate videos
- generate audio/voice
- generate lip-sync video
- render or stitch video
- plan native slideshow
- render native slideshow
- save/export final artifact to library
- create distribution plan
- optionally create workflow draft from a successful run

The first implementation can wrap a smaller subset, but the registry design
should not assume only one content path.

## Agent Planning

The planner should read:

- the relevant user message and recent conversation context
- structured `@` references
- tool registry descriptions
- relevant model/provider capabilities
- existing prompt/tool guidance where applicable

It should output:

- inferred output type
- confidence
- whether clarification is required
- whether it should answer directly or call tools
- human-readable plan steps, when tools are needed
- executable tool plan, when tools are needed
- checkpoint recommendations, when debug mode or user wording calls for review

If clarification is required, the thread status becomes `clarifying` and no
generation tools are called.

The planner should avoid backend jargon in user-facing messages. It can use
technical tool names internally.

## Progress Timeline

The UI should clearly communicate what is happening at each step.

The conversation should include a compact production timeline whenever tools are
running. It should show:

- current step
- completed steps
- running tool call
- intermediate previews
- error states
- retry/revise actions
- checkpoint prompts
- final output

User-facing labels should sound like production work:

- Writing the plan
- Finding references
- Creating character images
- Generating scene clips
- Creating voiceover
- Assembling final video
- Rendering slideshow
- Saving final output

Technical details can be collapsible for debugging.

## Final Review

When a run is ready, the final review should support:

- save to library
- revise with instructions
- open in Studio, when the output is video-compatible
- export/download
- publish or schedule later through distribution plans
- save as reusable workflow, when possible

Studio actions should also be agent-callable. If the requested output needs
stitching clips, rendering text, trimming, or assembling audio and video, the
agent should use a video composition/render tool rather than making the user do
that manually.

## Workflow Relationship

Workflows remain important, but they are not the default runtime for one-off
agentic Create.

Recommended relationship:

- Create conversation: dynamic chat plus tool use.
- Workflow: repeatable visual pipeline.
- Workflow export: optional conversion from a successful multi-step
  conversation when the user wants to repeat the process.

Later, an agent can also create or edit workflows directly. That should use the
existing workflow graph contract and MCP/tooling concepts.

## Bite-Sized Tickets

### Ticket 1: Product Spec And Data Contract

- Finalize names: Create Thread vs Create Conversation.
- Finalize thread statuses, message types, tool-call states, and checkpoint
  states.
- Decide which existing artifact lifecycle and review statuses apply.
- Document first-pass tool categories and user-facing labels.

Acceptance criteria:

- A single agreed spec exists.
- No UI or runtime changes are required for this ticket.

### Ticket 2: Add Durable Create Thread Schema

- Add Convex tables for create threads, messages, tool calls, and checkpoints.
- Add indexes by workspace, user, status, and thread.
- Add basic validators and TypeScript types.

Acceptance criteria:

- Schema compiles.
- Basic create/list/get mutations and queries work.
- Existing Create, Workflow, Library, and Analyze behavior is unchanged.

### Ticket 3: Create Thread Backend Primitives

- Add mutations/actions for creating or resuming a Create conversation.
- Add message append APIs.
- Add tool-call lifecycle helpers.
- Add checkpoint create/respond APIs.
- Add final artifact linking.

Acceptance criteria:

- A thread can be created, messaged, updated, and completed without agent
  planning.
- Tool-call and checkpoint records can be listed for the thread.

### Ticket 4: Tool Registry Foundation

- Define internal tool registry types.
- Implement no-op/test tool for end-to-end plumbing.
- Implement tool-call execution wrapper that records lifecycle and errors.
- Add a registry listing helper for planner context.

Acceptance criteria:

- A tool can be invoked through the registry and writes a tool-call record.
- Failed tools write useful errors.

### Ticket 5: Wrap Reference Tools

- Add tools for listing/selecting usable library references.
- Add tools for resolving creative assets and artifacts into model
  reference payloads.

Acceptance criteria:

- Agent runtime can access the same reference materials the Create UI exposes.
- Tool outputs are structured enough for downstream generation tools.

### Ticket 6: Wrap Generation Tools

- Add tools for image, video, audio, lip sync, slideshow planning/rendering, and
  video rendering where existing handlers make this practical.
- Reuse provider adapters and artifact creation logic.
- Avoid duplicating provider-specific request code.

Acceptance criteria:

- Tools can create artifacts with correct workspace/user ownership.
- Tool calls link emitted artifact ids.

### Ticket 7: Planner And Clarification Action

- Implement the first planner action.
- Planner receives brief, references, and tool catalog.
- Planner returns inferred output type, confidence, user-facing plan, executable
  plan, and clarification question if needed.

Acceptance criteria:

- Obvious prompts proceed to planning.
- Ambiguous prompts create an agent clarification message and do not spend
  generation credits.

### Ticket 8: Agent Executor

- Execute planner-produced tool plans.
- Support sequential execution first.
- Support checkpoint pauses.
- Support resume after checkpoint response.
- Aggregate costs and final artifacts.

Acceptance criteria:

- A conversation can move from user request to ready output using registered
  tools.
- User checkpoint response can continue or revise the plan.

### Ticket 9: `@` Reference Mention Input

- Build inline mention behavior in the Create prompt.
- Reuse existing library selectable data where possible.
- Store selected mentions as structured references.
- Render mentions clearly in the prompt input.

Acceptance criteria:

- Typing `@` opens a reference picker.
- Selecting an item inserts a mention and attaches the underlying id.
- Submitted messages include structured references.

### Ticket 10: New Agentic Create UI

- Replace the primary `/create` screen with the agentic brief experience.
- Move current Create Studio into Manual Tools.
- Show conversation, production timeline, intermediate outputs, checkpoints, and
  final review.

Acceptance criteria:

- Existing manual generation remains reachable.
- New Create flow can start or resume a Create conversation.
- Tool progress is visible without opening Workflows.

### Ticket 11: Final Review Actions

- Save final outputs to library.
- Revise with instructions.
- Open eligible videos in Studio.
- Create distribution plan.
- Export/download where possible.

Acceptance criteria:

- Final artifact actions use existing library, studio, and publishing
  primitives.

### Ticket 12: Optional Workflow Export

- Add "Save as workflow" for eligible successful conversations.
- Convert tool-call history into an editable workflow draft where possible.
- Make non-convertible tool calls explicit in the export result.

Acceptance criteria:

- User can turn a successful production pattern into a workflow draft.
- One-off conversations are not forced into workflows.

### Ticket 13: QA And Hardening

- Test happy paths across image, video, audio, slideshow, and mixed-media
  conversations.
- Test ambiguous prompt clarification.
- Test checkpoint pause/resume.
- Test failed provider job recovery.
- Test reference mentions.
- Run build validation.

Acceptance criteria:

- `npm run build` passes.
- Core thread states are recoverable after refresh.
- Intermediate and final artifacts remain attached to the conversation.

## Resolved Product Decisions

- The user-visible checkpoint label should be `Debug Mode`.
- The user-visible action for starting a fresh conversation should be `New Chat`.
- Intermediate artifacts should always be displayed in the chat when they are
  created.
- Intermediate artifacts should stay organized under the conversation rather
  than automatically appearing as top-level saved library assets.
- The Library should eventually provide a navigable way to inspect conversation
  outputs and intermediate assets without mixing every draft into the main saved
  asset grid.
- Analyze should be callable in the first tool set.

The Analyze capability is important to the core promise. A target workflow is:

```text
User pastes a TikTok link and says:
"I want to recreate this video, but instead of X, Y, Z, do A, B, C."

Agent:
1. analyzes the source link,
2. extracts structure, pacing, scenes, transcript, and visual cues,
3. adapts the concept to the user's requested changes,
4. calls generation/editing tools,
5. renders the new result back in chat.
```

## Video Assembly Primitive

There are multiple assembly-related surfaces in the current platform:

- `Studio`: a user-facing video composition editor.
- `ai_video_editor`: a workflow/tool node that calls a provider-backed video
  render/edit capability, but this should not be treated as the primary agent
  assembly path because it is not currently reliable enough.
- Native slideshow renderer: turns slideshow specs into editable slideshow
  output.
- Client-side Studio rendering helpers for exporting a manually composed draft.

For the agent, the first primary stitching/render path should be the in-house
Studio/composition toolchain and the native slideshow renderer. The agent should
be able to create and manipulate the same kind of structured Studio project a
human edits manually: clips, ordering, trims, text overlays, audio, aspect
ratio, and render/export settings.

If the current Studio tool surface is not enough for an agent to assemble the
requested output, we should extend the in-house Studio tools rather than default
to the provider-backed `ai_video_editor` node.

Current Studio audit notes:

- Studio projects are stored as `videoProjects` with a frontend-defined
  `VideoCompositionDraft`.
- The draft can currently represent ordered video clips, static image clips,
  separate audio tracks, and timed text overlays.
- The Create agent can now populate timed text overlays when the Studio compose
  tool receives structured overlay/caption inputs or quoted text-overlay
  instructions.
- The Create agent can now attach ready generated audio artifacts as Studio
  audio tracks; the Studio browser preview and export path can play/mix those
  tracks into the composed video.
- Transitions, per-clip transforms, z-order, and backend render job state are
  not yet first-class in the draft model.
- Current rendering/export uses browser APIs such as canvas, MediaRecorder,
  AudioContext, and HTML media elements.
- Agent-accessible Studio assembly needs typed draft validation, backend media
  metadata resolution, and backend rendering.
- The Create agent can now record a durable Studio render request from a Studio
  project draft. Studio render tool calls stay blocked/action-required while the
  request is waiting for Studio export, then are promoted to succeeded when the
  exported artifact is attached. The current completion path opens the in-house
  Studio browser renderer with that request attached; Create can pass
  `autoRender=1` so the Studio page starts the browser export after the project
  loads. The exported artifact marks the Create render request complete.
- Updated render decision: the production path should be a server-side Remotion
  render engine running as a Railway companion service, not Playwright driving
  the Studio UI. Remotion should consume the same `VideoCompositionDraft` that
  Studio edits, render an MP4 from clips/images/audio/text overlays, upload the
  output, and mark the existing `studioRenderRequests` record complete.
- Studio UI and the Create agent should call the same render request flow. From
  the user's perspective the export/review experience should stay the same; the
  implementation changes from local browser `MediaRecorder` export to a queued
  backend render job with progress/status.

### Remotion Render Worker Slice

Target architecture:

```text
Studio UI or Create agent
  -> create/update studioRenderRequest
  -> Convex calls Railway studio-render-worker
  -> Remotion renders VideoCompositionDraft to MP4
  -> worker uploads output or returns/upload-completes through Convex
  -> Convex creates/links artifact and marks render request completed
  -> Create chat and Studio show the final video
```

Implementation tickets:

1. Add a shared composition package/module that renders `VideoCompositionDraft`
   with Remotion and can be imported by both the app preview path and the worker
   without duplicating timeline math.
2. Add `services/studio-render-worker/` as a Railway-ready Node service with
   Remotion renderer dependencies, health endpoint, authenticated render
   endpoint, temp-file handling, and clear failure responses.
3. Extend `studioRenderRequests` from manual blocked export to queued/running/
   completed server render state while preserving the current browser export as
   a fallback until Railway is deployed.
4. Update Studio export and Create `studio.render` so both request the backend
   render engine and display the same progress/failure/final artifact state.

## Recommended First Implementation Slice

Start with the durable conversation spine and tool-call recording before
replacing the Create UI.

Suggested first build sequence:

1. Add Create conversation/thread schema and backend primitives.
2. Add tool registry foundation.
3. Wrap reference and simple generation tools.
4. Add planner clarification behavior.
5. Build the new UI against the real conversation model.

This keeps the work incremental and avoids coupling the new UI to incomplete
agent runtime behavior.

## Implementation Progress

Status legend: `planned`, `in progress`, `landed`, `blocked`.

| Workstream | Status | Notes |
| --- | --- | --- |
| Create conversation schema and backend primitives | landed | Added validators, Convex tables, authenticated thread/message/checkpoint/tool-call primitives under `convex/create/threads.ts`, and generated Convex API bindings. |
| Agent tool registry foundation | landed | Added internal registry/types under `convex/create/tools/` with test tools, planner metadata helpers, execution-mode metadata, available agent-runtime production tools, and planned metadata for remaining gaps. |
| Agentic Create chat UI components | landed | Added local types and presentational components under `src/features/agent-create/` for prompt mentions, Debug Mode, New Chat, messages, tool progress, artifacts, checkpoints, and final review. Finished analysis, generation, slideshow, Studio, render, publishing, and explicit message artifacts can now render inline on the owning chat message. The chat surface has been simplified toward a Codex-style room: compact right-aligned user bubbles, plain left-aligned agent responses, inline media-first artifacts, clamped failure details, animated inline activity states for thinking/creating media, fast client-side typewriter reveal for newly arriving agent text, and a sticky compact composer with a bottom mask so scrolled content disappears behind it. |
| Create page integration | landed | `/create` is now the focused agent conversation surface with no Agent/Manual tab switch, no side status/progress panel, no recent workflow drafts section, a tiny expandable chat switcher in the top-left of the page, and a sticky compact composer at the bottom. The previous one-off Create Studio/manual generation tools live on the separate `/tools` page and remain available from the main navigation. |
| Planner and clarification behavior | landed | Added the Create turn handler and extracted pure planning/context helpers into `convex/create/planning.ts`. It persists user turns, infers chat vs clarification vs creation, writes a readable plan, records queued planned tool calls, and opens a debug checkpoint by default before resource-spending steps. Follow-up creation commands such as "go ahead" can now reuse recent conversation context and prior `@` references as the effective brief; Analyze-only prompts such as "analyze this URL" or "analyze @reference" now plan `analyze.source` without forcing a generated media output type. Planned tool calls now carry typed inferred inputs for obvious user-specified controls such as aspect ratio, image count, video duration, audio mode, provider/model override, lipsync resolution, publishing instructions, export destination, and reference-backed analysis sources. Video plans now adapt image-generation prompts into safe visual reference still requests instead of passing the full video brief directly to the image model; before/after fitness transformation prompts infer two reference images and include fully clothed, non-sexual, body-positive constraints. |
| Studio assembly audit | landed | Confirmed Studio draft/export conventions and identified the missing agent-render path: typed draft validation, media metadata resolution, and a server-side Remotion render engine rather than Playwright/browser automation. |
| Remotion render worker | landed | Added Remotion dependencies, a shared `VideoCompositionDraft` Remotion composition under `src/features/video-composer/remotion/`, and a Railway-ready `services/studio-render-worker/` HTTP service/Dockerfile that can render the Studio composition to MP4. The Docker image pre-downloads Remotion's headless shell browser at build time, the service warms/verifies it on startup, local `/health` and minimal MP4 render smoke tests pass, and worker auth/progress/response contracts are covered by `tests/e2e/create/agent/studio-render-worker.e2e.mjs`. Convex queues `studioRenderRequests`, calls the configured worker, accepts authenticated progress callbacks, stores the returned MP4 as an artifact, completes/fails the same render request, and falls back to the existing browser export flow when `STUDIO_RENDER_WORKER_URL` is not configured. Studio's Export button saves the latest draft, queues the backend render when available, navigates onto the render request for status updates, and uses browser export only for fallback/manual completion. Studio UI/Create output cards show queued/rendering worker jobs with progress percentages and without linking to browser auto-render unless the request is blocked/manual. Production Railway service is live at `https://studio-render-worker-production-897a.up.railway.app`, production Convex env vars are configured, Convex functions are deployed, and a deployed `/render` smoke test returned HTTP 200 with an MP4 response. |
| Real tool wrappers | in progress | `references.list` lists reusable library assets through the same selectable asset helper as the prompt dropdown, renders discovered references in chat, and feeds those references into downstream generation/slideshow requests; `analyze.source` dispatches existing analysis jobs for URLs, Create artifacts, creative/library assets, workflow-export media items, and stored file URLs, while downstream generation/slideshow requests wait for completed source analysis before using the extracted hook, structure, visual style, scene breakdown, audio cues, reusable pattern, shot list, script template, and transcript as prompt context; `text.generate` now calls the existing text provider stack for scripts, captions, outlines, shot lists, and text drafts, emits durable text artifacts, and renders them inline in chat; `media.generateImage/video/audio` queue normal preview content requests with selected `@` media references and now pass through provider, model, aspect ratio, image count, video duration, and audio mode settings when the planner supplies them; `media.renderVideo` now wraps the provider-backed AI video render/edit primitive, can consume selected references plus prior generated image/video/audio artifacts, emits a durable video artifact in chat, and exports to the repeatable `ai_video_editor` workflow node for explicit AI render/edit requests; `media.lipsync` queues a real provider-backed lip-sync request using existing image/video and audio references, renders its video output in chat, and exports as a repeatable workflow lipsync node; downstream video/slideshow/lipsync/render steps can reuse prior ready generated media as references; revision requests reuse prior ready media as references where possible; `slideshow.render` queues the existing slideshow planning/render path with creative-asset references; `studio.compose` creates a real Studio draft from ready image/video artifacts, attaches ready generated audio artifacts as Studio audio tracks, supports static image clips with default timing, can add timed text overlays from structured caption inputs or quoted text-overlay instructions, and can be called by follow-ups like "compose it"; `studio.render` records a durable render request from a Studio draft, queues the Remotion worker when configured, and falls back to the browser exporter when worker env vars are absent; `artifact.save` saves ready previews to the library; `artifact.export` records reviewed exportable artifact URLs as an agent tool result; and `publishing.prepare` creates a manual draft distribution plan from ready media from either final review or a chat follow-up such as "publish it." Chat output rendering resolves reference results, analysis jobs, content requests, artifacts, direct text artifacts, direct AI render artifacts, slideshows, Studio projects, Studio render requests, completed Studio render artifacts, and publishing drafts. |
| Debug step execution | landed | Approving a checkpoint starts executable queued tools, and the chat shows a compact `Continue` control when additional queued steps remain without an open checkpoint and without pending/failed outputs. The backend runner now pauses if prior source analysis or preview generation is still pending, Debug Mode creates artifact-backed review checkpoints when newly generated previews are ready, and a new user turn supersedes open checkpoints plus cancels stale queued downstream steps. |
| Auto mode continuation | in progress | Auto mode now resumes queued downstream tools from the Create UI after async outputs resolve, as long as there are no open checkpoints and no visible pending/failed outputs. Backend wakeups now also run the Create executor when content requests, source analysis jobs, or Studio render requests finish, so async provider completion can create Debug Mode checkpoints, reconcile failures, or continue Auto Mode without requiring the Create page to stay open. Debug Mode remains manually checkpointed. |
| Tool failure handling | landed | Tool execution failures are now persisted to the relevant Create tool call, surfaced as chat status messages, and mark the thread failed instead of escaping only as mutation errors. Async provider failures from queued analysis, generation, or Studio render jobs are reconciled back onto the Create tool call before downstream tools run; failed timeline steps can be retried, and retry clears stale async output before rerunning the tool from the Create conversation. |
| Final review actions | in progress | Ready outputs now show a final review panel with Save to Library, Revise, Export, Open in Studio, Request Render, Publish Later, and Save as Workflow when applicable. Save and Publish Later now target the reviewed media artifact ids visible in final review instead of every ready output in the conversation; Revise posts a new revision request into the same Create conversation; Export records an `artifact.export` tool call before opening ready direct media for handoff; direct ready image/video artifacts can open in Studio as a new edit project, while Studio compositions can request a render that queues the Remotion worker when configured and retains the current browser export path as fallback; Save as Workflow converts the Create tool history into an inactive editable workflow draft from either the final-review button or a chat follow-up such as "save as workflow." |
| Optional workflow export | in progress | Create conversations can now be saved as workflow drafts via `workflow.createDraft`. Generation, provider-backed AI render/edit, reference, slideshow, publishing, save, and export steps become editable workflow nodes; queued, canceled, and failed debug branches are excluded; Studio compose/render steps are preserved as comments until reliable repeatable Studio workflow nodes exist. |
| Agent Create tests | landed | Added `tests/e2e/create/agent/planning.e2e.ts`, `tests/e2e/create/agent/workflow-export.e2e.ts`, and `tests/e2e/create/agent/studio-composition.e2e.ts`, wired into `npm run test:e2e`, to cover follow-up creation commands, pronoun revisions, save/export/publish/workflow-only follow-ups, Studio compose/render follow-ups, brainstorming chat, clarification replies, URL recreation planning through source analysis, Analyze-only URL/reference planning, standalone text-generation planning, provider-backed AI render planning/input extraction, typed tool input extraction, workflow export filtering of canceled/queued tool calls, AI render workflow export, lipsync workflow export, and Studio draft text/audio/static-image clip construction. |
