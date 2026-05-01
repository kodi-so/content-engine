# Content Engine Re-Architecture Plan

## Purpose

Content Engine is being reset from a TikTok slideshow scheduler into an agentic content operations platform. The product should let a user connect or create social accounts, define each account's brand and content strategy, configure repeatable workflows, and let an agent generate, schedule, publish, and learn from performance with minimal manual work.

The current repo should be aggressively simplified around the new architecture. There is no production data to migrate and no legacy compatibility requirement, so old tables, old posting flows, old automation code, and old generation helpers should be removed instead of preserved.

## Product Vision

The target product is a platform where each social account can run like a small autonomous media operation.

A user should be able to:

- Connect social accounts through a hosted publishing provider.
- Define a brand, niche, voice, visual identity, reference assets, and content constraints for each account.
- Create repeatable content workflows for different formats such as slideshows, hook/demo videos, AI UGC, talking-avatar clips, educational posts, memes, carousels, and future formats.
- Let an agent execute those workflows using external tools, model providers, asset sources, publishing APIs, and analytics.
- Review and approve content where desired, or let trusted workflows publish automatically.
- Track every run, artifact, tool call, error, cost, post, and performance result.
- Feed performance data back into future topic selection, hooks, styles, and posting strategy.

## Core Architectural Shift

The current app owns too much platform-specific social infrastructure. Direct TikTok OAuth, posting, scheduling, and analytics should move behind provider adapters.

Content Engine should own:

- Agent orchestration.
- Workflow definitions.
- Brand memory.
- Content strategy.
- Prompt and tool pipelines.
- Generated artifacts.
- Human review states.
- Provider routing.
- Run logs and observability.
- Performance feedback loops.

Hosted providers should own:

- Social account OAuth.
- Platform-specific publish APIs.
- Scheduling queues.
- Platform API changes.
- Some platform analytics.
- Media upload quirks.

## Recommended Provider Strategy

### Publishing Provider

Postiz should be the first publishing provider to integrate. It has a documented public API, upload support, post creation, analytics endpoints, OAuth/API key auth options, CLI tooling, and MCP positioning. It appears closer to the "agent can publish through tools" direction than maintaining direct TikTok support ourselves.

Post Bridge should remain a secondary candidate. Its public API access exists, but the docs are thinner and appear tied to a paid API add-on. We should evaluate it after Postiz if Postiz has missing platform support or limits.

ReelFarm should be treated as both competitive research and an optional specialized provider. Its API is very close to the slideshow automation product we are building toward, but depending on it as the core would create strategic dependency on a close competitor.

### Model Provider

The platform should use a model-router abstraction rather than hard-coding one model vendor.

Recommended first providers:

- fal.ai for image, video, audio, lipsync, avatar, and fast-moving creative media APIs.
- OpenRouter for LLM routing, model fallback, and access to many text/reasoning models through a consistent interface.

Google Gemini can remain available as one model provider, but only behind the shared provider interface. The code should not assume Gemini is the only generation engine, and Gemini-specific helper flows should not remain the architectural center.

### Design and Slideshow Tooling

Slideshows can remain the first native content format, but they should be rebuilt as workflow-driven artifacts using the new provider abstractions instead of preserving old slideshow-specific implementation just because it already exists.

Canva MCP and Canva Connect APIs are worth exploring for template-based brand workflows and human-editable creative assets, but they should not replace the native slideshow engine at the start. Canva is best treated as an optional tool inside workflows.

## Target Domain Model

The new data model should be flexible enough to support many content types and repeatable workflows.

### Brands

Brands represent the strategic identity behind one or more social accounts.

Expected fields:

- Name.
- Description.
- Niche.
- Audience.
- Voice and tone.
- Visual style.
- Offers or products.
- Do/don't constraints.
- Reference image IDs.
- Example posts.
- Performance notes.

### Social Accounts

Social accounts represent connected channels managed through a provider.

Expected fields:

- User ID.
- Brand ID.
- Provider name, such as `postiz`, `post_bridge`, `reel_farm`, or `direct`.
- Provider account/integration ID.
- Platform, such as TikTok, Instagram, YouTube, X, LinkedIn, or Facebook.
- Username/display name/avatar.
- Connection status.
- Capabilities discovered from provider.
- Metadata returned by provider.

### Content Formats

Content formats define the kind of artifact produced.

Initial examples:

- Slideshow.
- Hook/demo video.
- AI UGC video.
- Talking avatar.
- Short-form educational video.
- Static image post.
- Thread.
- Multi-platform caption set.

Each format should define:

- Input schema.
- Output artifact schema.
- Required tools.
- Renderer or assembler.
- Supported platforms.
- Review requirements.

### Workflows

Workflows are repeatable pipelines that an agent can execute.

Expected fields:

- Brand ID.
- Social account ID.
- Name.
- Description.
- Content format.
- Workflow version.
- Trigger type, such as manual, schedule, event, or metric-based.
- Schedule config.
- Strategy config.
- Tool/provider config.
- Approval policy.
- Publishing policy.
- Active/inactive state.

Workflow definitions should be versioned so old runs remain explainable after a workflow changes.

### Workflow Runs

Workflow runs are durable executions of a workflow.

Expected fields:

- Workflow ID.
- Workflow version.
- Status.
- Trigger source.
- Started/completed timestamps.
- Current step.
- Generated topic/hook/caption.
- Tool calls.
- Artifacts.
- Provider publish IDs.
- Costs.
- Errors.
- Review state.
- Metrics snapshot.

### Artifacts

Artifacts are generated objects created during workflow runs.

Initial artifact types:

- Prompt.
- Text draft.
- Caption.
- Image.
- Slide spec.
- Rendered slide image.
- Video clip.
- Final video.
- Thumbnail.
- Publish payload.

Artifacts should store enough metadata to reproduce or debug the output:

- Type.
- Storage URL or structured JSON.
- Provider/model used.
- Prompt/input parameters.
- Parent artifact IDs.
- Workflow run ID.
- Review status.

### Distribution Plans

Distribution plans describe where and how content should be posted.

Expected fields:

- Target accounts.
- Platform-specific caption variants.
- Schedule time.
- Provider payload.
- Approval state.
- Publish status.
- External post IDs.

### Metrics

Metrics should be imported from the publishing provider or platform analytics APIs and linked back to the published artifact/workflow run.

Expected fields:

- External post ID.
- Account ID.
- Workflow run ID.
- Views.
- Likes.
- Comments.
- Shares.
- Saves.
- Follower deltas where available.
- Posted time.
- Last synced time.

## Agent Architecture

The agent should become the primary operator of the system.

Responsibilities:

- Understand brand/account context.
- Select topics or use queued topics.
- Generate hooks, outlines, scripts, captions, and creative briefs.
- Choose tools/models based on workflow config.
- Produce artifacts.
- Validate outputs against brand and platform constraints.
- Request approval when required.
- Publish or schedule through provider adapters.
- Observe performance and write learnings back to brand/workflow memory.

The first implementation can be deterministic and step-based. A more dynamic planner can come later.

Recommended first approach:

- Store workflow definitions as structured steps.
- Implement a server-side runner that executes each step.
- Keep agent decisions logged as structured run events.
- Use model calls for creative steps, not for every control-flow decision.
- Add human approval states before full autopilot.

## Reset Strategy

There is no production data to preserve, so this is a clean product reset inside the existing repository rather than a compatibility migration. The implementation should remove old direct TikTok, old scheduling, old automation, and product-centric assumptions as soon as the new architecture replaces them.

### Phase 1: Planning and Provider Research

Document the target architecture, provider assumptions, and implementation tickets. Validate Postiz, Post Bridge, ReelFarm, fal.ai, OpenRouter, and Canva integration paths.

### Phase 2: Data Model Foundation

Replace the old domain model with the new brands, provider-backed accounts, workflows, workflow versions, workflow runs, run events, artifacts, distribution plans, and metrics model.

### Phase 3: Provider Abstractions

Create publishing-provider and model-provider interfaces. Implement Postiz as the first publishing provider. Implement model routing with Gemini preserved and fal.ai/OpenRouter added behind adapters.

### Phase 4: Workflow Runner

Build durable workflow definitions, workflow runs, run events, and artifact tracking. New workflows replace the old automation model.

### Phase 5: Slideshow as First Workflow Format

Implement slideshow generation inside the new content-format/workflow system, and save outputs as artifacts linked to workflow runs.

### Phase 6: Publishing and Scheduling

Replace direct TikTok scheduling/posting with provider-backed distribution plans. Do not keep direct TikTok code in the active codebase.

### Phase 7: Agent UI and Review

Shift the UI from CRUD pages toward an operations console: brands, accounts, workflows, run history, artifact review, approvals, and performance.

### Phase 8: More Content Formats

Add hook/demo videos, AI UGC, talking avatars, and other formats as pluggable workflows.

### Phase 9: Feedback Loop

Use post performance to improve future topics, hooks, visual styles, posting cadence, and account strategy.

## Keep, Rewrite, or Remove

### Keep

- Clerk + Convex app foundation.
- Existing slideshow generation logic.
- Reference image library.
- Product/brand-like concept, migrated into `brands`.
- Automation run concept, migrated into `workflowRuns`.
- Generated content library, migrated into artifacts.
- Analytics dashboard ideas.

### Rewrite

- Direct TikTok account model.
- Direct TikTok posting/scheduling flow.
- Automation schema.
- Content schema.
- Navigation and UI mental model.
- Model invocation layer.

### Removed From Active Architecture

- Raw TikTok OAuth flow.
- Direct TikTok posting implementation.
- Old scheduled post model.
- Old automation model.
- Old product/content tables.
- Playground UI routes that do not map to workflows.

## Open Product Questions

These do not block the first implementation pass, but they should be answered before full autopilot:

- Should every workflow require approval at first, or can some publish automatically immediately?
- Is the first target user only you, or should multi-tenant/team behavior be designed now?
- Should we support account creation workflows, or only connection of existing social accounts at first?
- Which content format comes after slideshows: hook/demo videos, AI UGC, or talking-avatar videos?
- How much editing should happen inside Content Engine versus external tools like Canva?
- Should the agent be allowed to spend money on model calls without explicit per-run approval?

## External Research Links

- Postiz API overview: https://docs.postiz.com/public-api/introduction
- Postiz create post: https://docs.postiz.com/public-api/posts/create
- Postiz upload file: https://docs.postiz.com/public-api/uploads/upload-file
- Postiz CLI/MCP: https://docs.postiz.com/cli/introduction
- Post Bridge API overview: https://support.post-bridge.com/api/post-bridge-api-overview-access-and-pricing
- ReelFarm API docs: https://reel.farm/api-docs#overview
- fal.ai model APIs: https://docs.fal.ai/model-apis
- fal.ai video generation: https://fal.ai/docs/model-api-reference/video-generation-api/overview
- OpenRouter docs: https://openrouter.ai/docs/api/reference/overview/
- Canva MCP docs: https://www.canva.dev/docs/mcp/
- Canva Connect Autofill: https://www.canva.dev/docs/connect/api-reference/autofills/
- Canva Connect Export: https://www.canva.dev/docs/connect/api-reference/exports/
