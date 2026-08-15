---
name: debug-create-runs
description: Diagnose Content Engine Create pipeline incidents by retrieving and interpreting durable Convex execution traces. Use when a Create run is failed, stuck, unexpectedly expensive, used the wrong model or provider, produced the wrong result, or when a user supplies a Create URL, thread ID, run ID, provider job ID, or asks what the agent, models, tools, or providers did behind the scenes.
---

# Debug Create Runs

Use the append-only Create trace to reconstruct observable execution. Establish evidence before proposing a fix; do not infer hidden model reasoning.

## Workflow

1. Confirm the target environment: development by default, production only when the user identifies a production run or URL.
2. Resolve the `threadId` from the Create URL, user report, MCP result, or durable record. Never guess an ID.
3. From the repository root, retrieve the bundle:

   ```bash
   skills/debug-create-runs/scripts/inspect-create-trace.sh '<thread-id-or-Create-URL>'
   ```

   Add `--prod` as the second argument for production. If the script is unavailable, run:

   ```bash
   npx convex run create/observability/trace:getForDebug '{"threadId":"THREAD_ID"}'
   ```

4. Start with `thread`, `usageSummary`, and terminal failures in `events`. Then follow `operationId` and `parentOperationId` from the user turn through agent, model, tool, content request, provider, and artifact events.
5. Reconcile events with the durable source arrays: `messages`, `toolCalls`, `contentRequests`, `usageEvents`, `checkpoints`, and `artifacts`. Treat those records as the final state and events as the chronological explanation.
6. Identify the first causal divergence, not merely the last downstream failure. Separate application orchestration errors from model output, provider, polling, rendering, dependency, authentication, or publishing failures.
7. Report the evidence, root cause, impact, and smallest safe next action. Do not retry, mutate records, deploy, or publish unless the user separately authorizes it.

Read [references/trace-guide.md](references/trace-guide.md) for the bundle schema, failure signatures, and cost-analysis rules.

## Reading Order

- Filter mentally or with `jq` to the relevant `decisionRunId` when a thread contains multiple user turns.
- Find the earliest event with `status: "failed"`; inspect its preceding sibling events under the same `operationId`.
- For agent behavior, compare `agent.context.built`, each `model.call.*` attempt, `agent.decision.repair`, and `agent.decision.completed`.
- For tools, compare the queued input and estimate with start, dependency IDs, terminal output, artifacts, and error.
- For media, follow `content_request.*` into `provider.submitted`, each `provider.poll`, and the terminal provider or artifact event.
- For cost, use `usageSummary` as the total. Use individual trace costs only as evidence; the same reported cost can appear on submission and completion events and must not be summed twice.

## Investigation Discipline

- Treat a missing `events` array on an old thread as pre-observability history, not proof that nothing ran. Inspect the durable arrays.
- Treat a provider submission without a completion as incomplete or interrupted until polling and content-request state establish otherwise.
- Distinguish requested model, effective model, and provider-reported model. State which one differed.
- Quote exact errors and IDs, but avoid reproducing full prompts or user content unless needed to establish the cause.
- Event details redact common credentials, binary data, and signed URL queries and are size-bounded. Durable source records in the bundle may still contain user content or media URLs; handle them as sensitive debugging data.
- The trace records observable inputs and outputs, not private chain-of-thought.
- Internal trace access requires Convex deployment credentials. External Content Engine MCP agents should preserve the thread ID and use `command.status`; they must not claim they inspected internal traces without that access.

## Report Format

Return a compact incident report:

1. **Outcome:** failed, stuck, completed incorrectly, or cost anomaly.
2. **Root cause:** the first supported causal failure.
3. **Evidence:** timestamp/event, operation ID, model/provider/job ID, and exact error or state mismatch.
4. **Impact:** affected tools, requests, and artifacts; identify usable partial outputs.
5. **Cost:** expected, actual, outstanding estimate, and whether provider cost metadata was missing.
6. **Next action:** smallest safe fix or retry, clearly separating diagnosis from implementation.
