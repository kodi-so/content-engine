# MCP Auth And Access Model

This document defines the security model for Content Engine's MCP integration.
MCP is a real external integration surface for agents like Codex and Claude Code,
not a local-only helper. It must use the same user-scoped domain model as the web
app before tools are allowed to mutate workflows, runs, artifacts, or publishing
plans.

Reference baseline:

- MCP authorization for HTTP transports is bearer-token based and follows OAuth
  2.1 style protected-resource semantics:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- MCP stdio transports should retrieve credentials from the environment. That is
  acceptable for local development, but it is not the production product model.

## Decision

Content Engine should support two MCP auth modes:

1. User API keys for the first production MCP surface.
2. Clerk/OAuth bearer tokens later, when browser-based MCP clients need a
   delegated user consent flow.

Server-side app tokens should not be used for user-facing MCP access. They are
reserved for trusted backend jobs and internal automation because they collapse
the user boundary unless every tool re-implements identity scoping manually.

## Identity Model

Every MCP request resolves to a single Content Engine user.

- The MCP server validates the presented credential before handling any resource
  or tool request.
- The validated credential resolves to `userId`, matching the existing Convex
  `identity.subject` ownership model.
- All MCP data access is scoped by that `userId`.
- MCP tools should call shared domain functions or Convex mutations that accept
  an explicit authenticated user context. They should not bypass ownership
  checks by calling broad internal functions directly.

The app currently uses Clerk with Convex auth in the browser. MCP API keys are
the external-agent equivalent of that authenticated user session.

## Credential Types

### User API Keys

User API keys are the v1 MCP credential.

Expected behavior:

- Generated from an app settings screen.
- Stored hashed server-side; the plaintext key is shown only once.
- Sent by MCP clients as `Authorization: Bearer ce_mcp_...`.
- Scoped to one user.
- Named by the user, e.g. `Claude Desktop`, `Codex`, or `CI content runner`.
- Revocable without deleting workflows or runs.
- Carries scopes and optional restrictions.
- Records `createdAt`, `lastUsedAt`, `revokedAt`, and a short key prefix for UI.

Recommended initial scopes:

- `resources:read`
- `workflows:read`
- `workflows:write`
- `runs:read`
- `runs:write`
- `artifacts:read`
- `artifacts:write`
- `publishing:plan`
- `publishing:publish`
- `settings:read`

Default generated keys should start conservative:

- Read resources.
- Read/write workflows.
- Read/write runs.
- Read artifacts.
- Plan publishing.
- Do not publish by default.

`publishing:publish` should require an explicit user opt-in because it can post
externally.

### Clerk/OAuth Bearer Tokens

Clerk/OAuth bearer tokens are the future delegated auth path for MCP clients that
support HTTP authorization flows.

Expected behavior:

- MCP server acts as a protected resource server.
- Tokens are audience-bound to the Content Engine MCP server.
- Requests include `Authorization: Bearer <access-token>`.
- The server rejects tokens that are missing, expired, not issued for this MCP
  server, or not tied to a Content Engine user.
- The server returns proper `401` and `403` responses for MCP clients.

This should be added after API-key MCP is working, because API keys are simpler
for local agent setup and easier to revoke while the product surface is still
evolving.

### Server-Side App Tokens

Server-side app tokens are not a user-facing MCP credential.

Allowed use:

- Scheduled backend jobs.
- Internal workers.
- Deployment health checks.
- Future trusted service-to-service integrations.

Disallowed use:

- A desktop MCP client acting on behalf of a user.
- External agents creating workflows or posting content for a user.
- Any tool that depends on user-owned brands, personas, assets, workflows, runs,
  artifacts, or social accounts without first resolving a user.

## Access Classes

MCP capabilities should be grouped by risk.

### Read-Only Resources

Examples:

- Product architecture guide.
- Workflow graph schema.
- Node catalog.
- Built-in workflow templates.
- Prompt recipes.
- Cached provider model catalog.
- Brand summaries.
- Persona summaries.
- Creative asset summaries.

Required scopes:

- `resources:read`
- Optional domain read scopes for user-owned summaries.

Rules:

- Safe for most keys.
- Never expose provider secrets.
- Summaries should include enough context for an agent to build workflows without
  dumping unnecessary private metadata.

### Workflow Authoring

Examples:

- Create workflow from template.
- Create blank workflow.
- Update workflow metadata.
- Update graph.
- Add/update/delete nodes.
- Connect/disconnect nodes.

Required scopes:

- `workflows:read`
- `workflows:write`

Rules:

- Validate graph shape before saving.
- Enforce one runner node and no cycles.
- Keep workflow inactive unless the tool explicitly activates it and the key has
  a future `workflows:activate` scope.
- Store changes directly on the workflow. Do not add historical workflow version
  snapshots unless a later product requirement needs them.

### Run And Debug

Examples:

- Run workflow.
- List runs.
- Inspect run status.
- Inspect node states and events.
- Inspect retained artifacts.

Required scopes:

- `runs:read`
- `runs:write` for starting runs.
- `artifacts:read` for artifact inspection.

Rules:

- Starting a run must be explicit. Reading or editing a graph must never trigger
  execution.
- Scheduled workflows remain governed by workflow settings, not by an MCP client
  staying connected.
- Failed runs should expose enough status, node state, and error text for agents
  to propose fixes.

### Publishing

Examples:

- Create distribution plan.
- Update caption/platform metadata.
- Queue or publish through Postiz/Post Bridge.

Required scopes:

- `publishing:plan` for distribution planning.
- `publishing:publish` for any external post.

Rules:

- Publishing is the highest-risk MCP action.
- `publishing:publish` must be opt-in per key.
- A workflow's own approval and publishing policy still applies.
- If a workflow requires approval, MCP can prepare the post but cannot bypass the
  approval state unless a future explicit approval scope is added.
- BulkAPIs is not the near-term publishing provider. MCP publishing should use
  the existing publishing abstraction backed by Postiz/Post Bridge.

## Authorization Checks

Every MCP request must enforce:

- Authenticated credential.
- Non-revoked key or valid bearer token.
- User ownership on every requested entity.
- Required scope for the resource or tool.
- Entity-level consistency, such as workflow brand matching account brand.
- Provider secret isolation.

MCP tools must not expose:

- `BULKAPIS_API_KEY`
- Postiz/Post Bridge credentials
- Clerk secrets
- Convex deployment credentials
- Raw social OAuth tokens
- Environment variables

## Auditing

MCP mutations should create an audit trail before broad external access ships.

Minimum audit fields:

- `userId`
- credential/key id
- client name when available
- tool name
- target entity type and id
- status: success or failure
- error class/message for failures
- timestamp

Run creation already creates durable workflow run state. MCP audit logs should
cover mutations that happen before a run exists, such as workflow graph edits.

## Local Development

Local MCP can support stdio with an environment-provided user API key:

```text
CONTENT_ENGINE_MCP_API_KEY=ce_mcp_...
CONTENT_ENGINE_MCP_URL=http://localhost:...
```

This is only a credential transport convenience. The local MCP server should
still validate the key and resolve the user exactly like the remote server.

## Implementation Implications

Upcoming implementation tickets should add:

- An `mcpApiKeys` table with hashed keys, user ownership, scopes, key prefix,
  name, timestamps, and revocation fields.
- A server-side key mint/revoke/list API for the app settings UI.
- A shared MCP auth helper that returns `{ userId, scopes, keyId }`.
- A shared scope assertion helper.
- MCP resources and tools that accept authenticated user context instead of
  trusting caller-provided user ids.
- Audit logging for MCP mutations.

Do not implement MCP tools with a global server token and do not create a
separate MCP-only workflow model. MCP should operate on the same workflows,
graphs, runs, artifacts, personas, creative assets, and publishing policies that
the web app uses.
