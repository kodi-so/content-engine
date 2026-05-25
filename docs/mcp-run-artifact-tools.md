# MCP Run And Artifact Tools

Content Engine exposes run-debugging and artifact-operation handlers through
`convex/mcp/runArtifacts.ts`. These functions are Convex queries, mutations, and
actions today; the future MCP server should wrap them as MCP tools after API-key
auth and scope checks are added.

These tools are for the execution/debug loop after a workflow exists. Workflow
creation and graph editing live in `convex/mcp/workflows.ts`.

## Safety Rules

- Every tool requires an authenticated user context.
- Runs, node states, events, artifacts, and distribution plans are scoped to the
  authenticated user.
- Read tools can expose retained/debug artifacts for a run, but never provider
  secrets or environment variables.
- Artifact approval and revision use the existing artifact review mutations so
  distribution plan reconciliation stays centralized.
- Publishing uses the existing publishing action and therefore keeps current
  Postiz/Post Bridge/manual provider behavior.
- Publishing should require the future `publishing:publish` MCP API-key scope.

## Queries

| Function | Purpose |
| --- | --- |
| `mcp.runArtifacts.listRuns` | List recent runs, optionally filtered by workflow or status. |
| `mcp.runArtifacts.inspectRun` | Return run summary, workflow summary, node states, events, artifacts, and distribution plans. |
| `mcp.runArtifacts.inspectNodeOutput` | Return one node state plus artifacts referenced by its output refs. |
| `mcp.runArtifacts.listRunArtifacts` | List artifacts for a run, optionally final-only. |
| `mcp.runArtifacts.listDistributionPlans` | List distribution plans globally or for a specific run. |

## Mutations And Actions

| Function | Purpose |
| --- | --- |
| `mcp.runArtifacts.setArtifactReviewStatus` | Mark an artifact with a review status such as approved or needs_revision. |
| `mcp.runArtifacts.requestArtifactRevision` | Attach a revision request note to an artifact and reconcile related plans. |
| `mcp.runArtifacts.createDistributionPlan` | Create a distribution plan from run artifacts and target social accounts. |
| `mcp.runArtifacts.updateDistributionPlanStatus` | Update a plan status for manual/export-like workflow steps. |
| `mcp.runArtifacts.publishDistributionPlan` | Publish or schedule a distribution plan through the existing publishing provider action. |

## Agent Debugging Loop

Recommended external-agent flow:

1. Start a workflow through `mcp.workflows.runWorkflow`.
2. Poll `mcp.runArtifacts.inspectRun`.
3. Inspect failed or blocked node outputs through `inspectNodeOutput`.
4. Read run events to understand provider calls, artifact creation, approval
   waits, publish requests, and errors.
5. If the run created final artifacts, review them through `listRunArtifacts`.
6. Mark artifacts approved or request revision where appropriate.
7. Create or publish distribution plans only when the user explicitly wants that
   action and the MCP key has the required publishing scope.

## Scope Mapping

These functions currently rely on the authenticated Convex user. When MCP API
keys are implemented, the MCP server should map scopes this way:

| Function class | Required scopes |
| --- | --- |
| run and node inspection | `runs:read` |
| artifact listing/inspection | `runs:read`, `artifacts:read` |
| artifact approval/revision | `artifacts:read`, `artifacts:write` |
| distribution plan creation/status update | `artifacts:read`, `publishing:plan` |
| publish/schedule distribution plan | `artifacts:read`, `publishing:plan`, `publishing:publish` |
