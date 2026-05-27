# MCP Workflow Tools

Content Engine exposes workflow-authoring MCP tool handlers through
`convex/mcp/workflows.ts`. These functions are Convex queries/mutations today;
the future MCP server should wrap them as MCP tools after API-key auth and scope
checks are added.

The tools operate on the canonical workflow model used by the web app. They do
not create an MCP-only workflow representation.

## Safety Rules

- Every tool requires an authenticated user context.
- Every workflow read/write is scoped to the authenticated user.
- Brand and social account ownership are checked when creating or updating
  workflow metadata.
- Workflow creation can omit `brandId`; the backend creates or reuses the
  authenticated user's neutral `Workspace` brand as implementation context.
- Graph-writing tools validate the graph before saving.
- Graph edits never trigger provider calls, artifact creation, publishing, or
  credit spend.
- `runWorkflow` is the only workflow tool in this set that starts execution.
- New workflows are created inactive and with `autoPublish: false`.

## Queries

| Function | Purpose |
| --- | --- |
| `mcp.workflows.list` | List workflow summaries for the authenticated user. |
| `mcp.workflows.get` | Read one full workflow, including graph, when owned by the authenticated user. |
| `mcp.workflows.validateGraph` | Validate a proposed workflow graph without saving it. |

## Mutations

| Function | Purpose |
| --- | --- |
| `mcp.workflows.createBlank` | Create a minimal valid workflow containing a runner and export node. |
| `mcp.workflows.updateMetadata` | Update workflow metadata, policies, trigger, schedule, or social account. |
| `mcp.workflows.updateGraph` | Replace the entire graph after validation. |
| `mcp.workflows.addNode` | Add one node and validate the resulting graph. |
| `mcp.workflows.updateNode` | Patch one node and validate the resulting graph. |
| `mcp.workflows.deleteNode` | Delete one node, remove its incident edges, and validate the resulting graph. |
| `mcp.workflows.connectNodes` | Add one edge between existing node ports and validate the resulting graph. |
| `mcp.workflows.disconnectEdge` | Remove one edge and validate the resulting graph. |
| `mcp.workflows.replaceEdge` | Replace one edge and validate the resulting graph. |
| `mcp.workflows.runWorkflow` | Validate the current graph, create a queued workflow run, node states, and run-created event, then schedule the runner. |

## Graph Validation

The tool layer uses `src/lib/workflowGraphValidation.ts`, which currently
enforces:

- Supported schema version.
- Unique node ids.
- Supported node types.
- Node labels and finite positions.
- Unique edge ids.
- Existing edge endpoints.
- Valid source and target ports.
- No self-edges.
- Exactly one runner node.
- At least one terminal node.
- No cycles.

Agents should call `validateGraph` before `updateGraph` when generating larger
graph changes. The mutation tools also validate before saving so invalid graphs
cannot be persisted through this MCP surface.

## Scope Mapping

These functions currently rely on the authenticated Convex user. When MCP API
keys are implemented, the MCP server should map scopes this way:

| Function class | Required scopes |
| --- | --- |
| `list`, `get`, `validateGraph` | `workflows:read` |
| create/update graph/node/edge/metadata tools | `workflows:read`, `workflows:write` |
| `runWorkflow` | `workflows:read`, `runs:write` |

Publishing remains separate. These workflow tools may configure publishing
policy data, but they do not publish externally.
