# Platform Architecture

This document captures the current Content Engine product and backend boundaries.
It replaces the older rearchitecture plans and task trackers.

## Product Surfaces

The main app navigation is:

- Dashboard: workspace overview.
- Create: one-off content generation for images, videos, audio, lipsync, video
  rendering, and slideshow/carousel style outputs.
- Analyze: reference source analysis from upload, YouTube URL, direct media URL,
  and future social URL resolver support.
- Brands: brand strategy context.
- Personas: reusable AI people, mascots, customer avatars, source media, and
  voice references.
- Accounts: social/publishing account records.
- Workflows: canvas-native automation graphs.
- Library: saved assets, artifacts, slideshow outputs, and publishing actions.
- Analytics: metrics summaries.
- Settings: provider defaults, video analysis provider, and MCP API keys.

## Durable Data Boundaries

Core Convex tables own these responsibilities:

- `workspaces` and `workspaceMembers`: workspace ownership, membership, and
  workspace-level provider defaults.
- `brands`: brand strategy, audience, voice, offer, and constraints.
- `creativeAssets`: reusable uploaded or generated reference media.
- `personas`: reusable identities linked to creative assets.
- `providerConnections`: publishing provider account/workspace links.
- `providerModels`: cached provider model catalog snapshots and schema metadata.
- `contentRequests`: one-off Create jobs and their generation status.
- `videoAnalysisJobs` and `videoAnalysisQuestions`: Analyze jobs, source
  metadata, results, and follow-up Q&A.
- `workflows`: canvas graph definitions and workflow metadata.
- `workflowRuns`, node states, and run events: execution state and debug history.
- `artifacts`: immutable generated outputs, provenance, storage URLs, and parent
  links.
- `slideshows`: mutable slideshow editor state.
- `distributionPlans`: publish/schedule intent for publish-ready artifacts.
- `postMetrics`: imported analytics snapshots.
- `mcpApiKeys`: user-owned MCP API keys, hashes, scopes, and usage timestamps.

The intended content pipeline is:

```text
Create request or workflow run
-> generated artifacts
-> optional editor state, such as slideshows
-> publish-ready artifact or post package
-> distribution plan
-> provider status and metrics
```

## Workflow Model

Workflows are canvas-native graphs. Persisted workflow data is domain JSON, not
raw React Flow state. Graph edits must not call providers, create artifacts, or
spend credits. Execution starts only from an explicit run, a schedule, or an
external MCP/API command.

The graph validator enforces supported schema version, unique node and edge ids,
valid ports, no self-edges, exactly one runner, at least one terminal node, and
no cycles.

Scheduled execution is driven by the Runner node. Active scheduled workflows are
checked by `convex/system/crons.ts`, which calls
`internal.workflows.scheduling.runDueWorkflows` every five minutes.

## Provider Routing

Generation providers are behind the model provider abstraction. Current provider
families include Gemini, fal, OpenRouter, and BulkAPIs. Workspace settings choose
defaults for image, video, audio, lipsync, and video analysis modes; exact models
are selected by the relevant Create or workflow node UI.

Publishing uses the publishing provider abstraction:

| Provider | Status | Use |
| --- | --- | --- |
| `post_bridge` | Ready | Default live publishing, scheduling, and provider-draft route. |
| `postiz` | Ready | Alternative publishing/scheduling provider behind the abstraction. |
| `manual` | Ready | Manual/export/testing provider. |

BulkAPIs is a generation/media provider, not the current publishing route.
Workflow publishing nodes and Library distribution plans should call the
publishing abstraction instead of provider-specific APIs directly.

## Environment Variables

Browser-visible variables:

- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`

Convex/server variables:

- Auth/access: `CLERK_JWT_ISSUER_DOMAIN`, `BETA_ACCESS_EMAILS`
- MCP: `CE_MCP_ALLOWED_ORIGINS`, `CONVEX_SITE_URL`
- Gemini: `GEMINI_API_KEY`
- OpenRouter: `OPENROUTER_API_KEY`, optional `OPENROUTER_BASE_URL`,
  `OPENROUTER_DRY_RUN`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME`
- fal: `FAL_API_KEY`, optional `FAL_QUEUE_BASE_URL`, `FAL_DRY_RUN`
- PostBridge: `POSTBRIDGE_API_KEY`, optional `POSTBRIDGE_BASE_URL`,
  `POSTBRIDGE_DRY_RUN`
- Postiz: `POSTIZ_API_KEY`, optional `POSTIZ_BASE_URL`, `POSTIZ_DRY_RUN`
- Analyze resolver: `MEDIA_RESOLVER_URL`, `MEDIA_RESOLVER_API_KEY`
- Media storage (Cloudflare R2): `R2_TOKEN`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, and `R2_PUBLIC_URL` (the
  bucket's public base URL — custom domain or `r2.dev` — used to build the
  permanent media URLs persisted on artifacts)
- Create defaults: `CONTENT_ENGINE_TEXT_MODEL`,
  `CONTENT_ENGINE_IMAGE_PROMPT_TEXT_MODEL`, `CONTENT_ENGINE_IMAGE_PROVIDER`,
  `CONTENT_ENGINE_REFERENCE_IMAGE_PROVIDER`, `CONTENT_ENGINE_IMAGE_MODEL`,
  `CONTENT_ENGINE_FULL_GRAPHIC_IMAGE_MODEL`, `CONTENT_ENGINE_IMAGE_SIZE`,
  `CONTENT_ENGINE_IMAGE_RESOLUTION`
- Reference assets: `CONTENT_ENGINE_REFERENCE_ASSET_PROVIDER`,
  `CONTENT_ENGINE_REFERENCE_ASSET_MODEL`

Do not add provider secrets with a `VITE_` prefix. Vite exposes those values to
the browser.

## Analyze Social URL Direction

YouTube can continue using Gemini's direct URL path. Direct video/audio file URLs
are downloaded by Convex and uploaded to Gemini. TikTok, Instagram, and Facebook
use the media resolver before Gemini. Deployment status and next steps are
tracked in [Social Media Resolver Plan](./social-media-resolver-plan.md).
