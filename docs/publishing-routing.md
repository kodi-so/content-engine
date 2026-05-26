# Publishing Routing

Content Engine does not use BulkAPIs for social posting in the current platform
plan. BulkAPIs remains the default AI and media-generation provider.

Publishing routes through the publishing provider abstraction:

| Provider | Status | Platforms | Use |
| --- | --- | --- | --- |
| Postiz | Ready | TikTok, Instagram, YouTube, X, LinkedIn | Default publishing provider for new workflows, templates, and draft post creation. |
| Post Bridge | Reserved | TikTok, Instagram, YouTube, X, LinkedIn | Registered as a provider placeholder, but unsupported operations fail until the adapter is implemented. |
| Manual export | Ready | TikTok, Instagram, YouTube, X, LinkedIn | Local/manual publishing records for export-only workflows and testing. |

## Decisions

- TikTok-first publishing uses Postiz by default.
- X/Twitter publishing also uses Postiz by default.
- Post Bridge remains a future provider behind the same abstraction.
- Manual remains available, but it is not the default for new publishing
  workflows.
- BulkAPIs social APIs may be revisited later for X-specific automation or
  research workflows, but not for posting.

## Implementation Notes

- The shared frontend route registry lives in `src/lib/publishingRouting.ts`.
- Backend adapters register through `convex/providers/publishing.ts`.
- `convex/providers/postiz.ts` is the ready provider adapter.
- `convex/providers/postBridge.ts` is a reserved provider adapter that returns
  explicit unsupported-operation errors.
- Auto Post and Distribution Plans publish through the same provider
  abstraction. Workflow code should never call BulkAPIs posting APIs directly.
