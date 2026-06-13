# Content Engine Docs

This directory is intentionally small. Keep docs that describe current system
behavior, durable architecture decisions, or a concrete future implementation
plan. Delete stale planning snapshots once the implementation has moved on.

## Current Docs

- [Platform Architecture](./platform-architecture.md): current product surfaces,
  data ownership boundaries, provider routing, scheduling, and environment
  variables.
- [MCP Integration](./mcp-integration.md): current MCP auth, resources, tools,
  scopes, and agent usage.
- [Social Media Resolver Plan](./social-media-resolver-plan.md): future Railway
  resolver plan for TikTok, Instagram, and Facebook URL ingestion in Analyze.

## Maintenance Rule

When changing product architecture or backend boundaries, update the relevant
doc in the same change. If a doc becomes a historical task tracker or a snapshot
of old plans, remove it or fold the still-useful parts into one of the current
docs above.
