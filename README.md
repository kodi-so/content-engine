# Content Engine

Content Engine is a private-beta workspace for planning, generating, reviewing,
editing, and publishing social content with agentic workflows. The app combines
a React control surface with Convex-backed generation, analysis, workflow, MCP,
library, and publishing primitives.

## Product Surface

- **Create**: one-off generation for images, videos, audio, lipsync, rendered
  video, and slideshow/carousel outputs.
- **Analyze**: uploads, YouTube URLs, direct media URLs, and resolver-backed
  TikTok/Instagram/Facebook analysis.
- **Studio**: video composition and timeline editing.
- **Brands, Personas, Accounts**: reusable brand context, AI identities,
  creative assets, and publishing connections.
- **Workflows**: canvas-native automation graphs that run only when explicitly
  executed or scheduled.
- **Library**: saved generated artifacts, slideshow outputs, and publishing
  actions.
- **Settings**: provider defaults, video-analysis provider settings, members,
  profile, and MCP API keys.

## Stack

- React 18, Vite, TypeScript, React Router
- Tailwind-based styling through the existing app CSS entrypoint and shared
  components
- Convex for database, actions, HTTP endpoints, crons, and MCP surface
- Cloudflare R2 (via the `@convex-dev/r2` Convex component) for media storage and
  serving
- Clerk for authentication and private-beta access gating
- Generation providers behind Convex abstractions: Gemini, fal, OpenRouter, and
  BulkAPIs
- Publishing providers behind Convex abstractions: Postiz and manual/export
- Optional Railway-hosted media resolver service for social URL ingestion

## Getting Started

Use Node 20. Convex is configured for Node 20 in `convex.json`.

```sh
npm install
cp .env.example .env.local
npm run convex:dev
```

The first `npm run convex:dev` links the checkout to a Convex project and writes
the local deployment selector to `.env.local`. If you are joining an existing
team project, choose that project when prompted; Convex gives each developer
their own dev deployment by default.

Fill in the browser-visible variables in `.env.local` from your Convex and Clerk
dashboards:

```sh
VITE_CONVEX_URL=...
VITE_CONVEX_SITE_URL=...
VITE_CLERK_PUBLISHABLE_KEY=...
```

Set server-side secrets in your Convex dev deployment, not with a `VITE_`
prefix:

```sh
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://..."
npx convex env set BETA_ACCESS_EMAILS "you@example.com"
npx convex env set OPENROUTER_API_KEY "..."
npx convex env set FAL_API_KEY "..."
npx convex env set GEMINI_API_KEY "..."
npx convex env set BULKAPIS_API_KEY "..."
npx convex env set POSTIZ_API_KEY "..."
```

Media (images, video, audio) is stored in and served from Cloudflare R2 through
the [`@convex-dev/r2`](https://www.convex.dev/components/cloudflare-r2) component.
Create an R2 bucket plus an API token, then set the R2 secrets in your Convex
deployment:

```sh
npx convex env set R2_TOKEN "..."
npx convex env set R2_ACCESS_KEY_ID "..."
npx convex env set R2_SECRET_ACCESS_KEY "..."
npx convex env set R2_ENDPOINT "https://<account-id>.r2.cloudflarestorage.com"
npx convex env set R2_BUCKET "..."
# Public base URL for serving objects (custom domain or the bucket's r2.dev URL)
npx convex env set R2_PUBLIC_URL "https://media.your-domain.com"
```

Only set provider secrets you need for the workflows you are testing. See
[`docs/platform-architecture.md`](docs/platform-architecture.md) for the full
environment-variable list and provider routing notes.

### Teammate Development

Invite teammates to the GitHub repository and to the Convex team as Developers.
When they clone the repo and run `npm run convex:dev`, they should link to the
existing team project and use their own Convex dev deployment. Their data,
storage, and server-side environment variables are deployment-specific, so they
must set provider keys for their dev deployment or use Convex project defaults.

The Create chat agent uses OpenRouter for planning/text and fal.ai as the default
media provider, so local agent-based generation typically needs both
`OPENROUTER_API_KEY` and `FAL_API_KEY` in that teammate's Convex dev deployment.

## Local Development

Run Convex and Vite in separate terminals:

```sh
npm run convex:dev
npm run dev
```

The Vite app runs on the default Vite dev URL unless another port is selected.
Unauthenticated users see the landing page or sign-in flow; signed-in users must
also pass the Convex private-beta gate.

## Scripts

```sh
npm run dev            # Start the Vite dev server
npm run build          # Type-check and build the production frontend
npm run preview        # Preview the built frontend locally
npm run convex:dev     # Start Convex development
npm run convex:deploy  # Deploy Convex functions
```

There is not currently a dedicated lint or test script in `package.json`; use
`npm run build` as the baseline validation command.

## Media Resolver

`services/media-resolver/` contains a FastAPI service for resolving TikTok,
Instagram, and Facebook post URLs into downloadable media for Analyze. It is
designed for Railway and is optional unless you are testing social URL analysis.

See [`services/media-resolver/README.md`](services/media-resolver/README.md) and
[`docs/social-media-resolver-plan.md`](docs/social-media-resolver-plan.md) for
local tests, deployment notes, required secrets, and current rollout status.

## Documentation

- [`docs/platform-architecture.md`](docs/platform-architecture.md): current
  product surfaces, data boundaries, provider routing, scheduling, and env vars.
- [`docs/mcp-integration.md`](docs/mcp-integration.md): MCP auth, resources,
  tools, scopes, and recommended agent flow.
- [`docs/social-media-resolver-plan.md`](docs/social-media-resolver-plan.md):
  resolver architecture and deployment checklist.
- [`PRODUCT.md`](PRODUCT.md): product design context and UI direction.
- [`context.md`](context.md): historical handoff for slideshow-generation work.

## Repository Map

```text
src/                 React app, pages, shared components, feature modules
convex/              Convex schema, queries, mutations, actions, HTTP, crons
docs/                Durable architecture and integration documentation
services/            Companion services, currently the media resolver
public/              Static browser assets
dist/                Built frontend output
```

## Deployment

The frontend is configured for Vercel-style single-page app routing through
`vercel.json`. Convex functions deploy separately with `npm run convex:deploy`.
Keep browser-safe configuration in `VITE_*` variables and all provider/API
secrets in Convex environment variables.
