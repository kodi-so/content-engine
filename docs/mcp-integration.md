# MCP Integration

Content Engine exposes an MCP-compatible HTTP surface for external agents. The
MCP server lives in `convex/mcp/http.ts` and wraps Convex resources and workflow
tools with user-scoped API-key auth.

## Auth Model

MCP access uses user-owned API keys created from Settings.

- Plaintext keys are shown once.
- Server stores a SHA-256 hash, key prefix, scopes, timestamps, and revocation
  state in `mcpApiKeys`.
- Clients send `Authorization: Bearer <key>`.
- Requests resolve to one user id.
- Every tool/resource read or mutation is scoped to that user.
- Revoked keys cannot authenticate.
- `lastUsedAt` is updated on authenticated calls.

Relevant files:

- `convex/mcp/apiKeys.ts`
- `convex/mcp/apiKeyRecords.ts`
- `convex/mcp/http.ts`
- `src/features/settings/AgentAccessSettingsSection.tsx`

Optional CORS/origin controls use `CE_MCP_ALLOWED_ORIGINS` and `CONVEX_SITE_URL`.

## Resources

Read-only resources are implemented in `convex/mcp/resources.ts`. Resource URIs
use the `content-engine://` scheme and are meant to be read through MCP, not
fetched directly.

Static resources include:

- `content-engine://architecture/guide`
- `content-engine://workflows/graph-schema`
- `content-engine://workflows/node-catalog`
- `content-engine://prompts/agent-recipes`
- `content-engine://knowledge/prompting/ai-ugc`
- `content-engine://knowledge/prompting/transformation`
- `content-engine://knowledge/prompting/slideshow`
- `content-engine://knowledge/prompting/video`
- `content-engine://knowledge/node-selection`

User-scoped resources include:

- `content-engine://providers/model-catalog`
- `content-engine://accounts/creative-assets`

Resources should never expose provider secrets, OAuth tokens, environment
variables, or internal service credentials.

## Tools

Workflow authoring tools are backed by `convex/mcp/workflows.ts`:

- `workflows.list`
- `workflows.get`
- `workflows.validateGraph`
- `workflows.createBlank`
- `workflows.addNode`
- `workflows.updateNode`
- `workflows.deleteNode`
- `workflows.connectNodes`
- `workflows.disconnectEdge`
- `workflows.replaceEdge`
- `workflows.updateMetadata`
- `workflows.updateGraph`
- `workflows.runWorkflow`

Run and artifact tools are backed by `convex/mcp/runArtifacts.ts`:

- `runs.list`
- `runs.inspect`
- `runs.inspectNodeOutput`
- `artifacts.listRunArtifacts`

Graph-writing tools validate before saving. Creating/editing workflow drafts
must not trigger provider calls or artifact creation. `workflows.runWorkflow` is
the command that starts execution.

## Scope Mapping

Current scope expectations:

| Capability | Required scopes |
| --- | --- |
| Read workflows | `workflows:read` |
| Create/edit workflows | `workflows:read`, `workflows:write` |
| Start workflow runs | `workflows:read`, `runs:write` |
| Inspect runs | `runs:read` |
| Inspect artifacts | `runs:read`, `artifacts:read` |
| Review/update artifacts | `artifacts:read`, `artifacts:write` |
| Create distribution plans | `artifacts:read`, `publishing:plan` |
| Publish/schedule | `artifacts:read`, `publishing:plan`, `publishing:publish` |

## Recommended Agent Flow

1. Read architecture, graph schema, and node catalog resources.
2. Read relevant prompt knowledge resources for the requested content type.
3. Read user-scoped creative asset and model catalog resources.
4. Create or edit workflow graph nodes and edges.
5. Validate the graph.
6. Run only when the user explicitly wants execution.
7. Inspect run output and artifacts before publishing or scheduling.

MCP should stay a first-class integration surface, not a separate workflow model.
