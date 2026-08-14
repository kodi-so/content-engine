# Create pipeline observability

Every new Create turn writes an append-only execution trace to `createRunEvents`.
The trace is correlated by `createThreadId`, with stable operation IDs for the turn,
agent decision, model attempts, tool calls, content requests, provider jobs, and
artifacts.

## What is recorded

- The user turn, assembled agent context, selected prompt modules, exact model
  messages, structured response, repair attempts, and errors.
- Model/provider name, effective model ID, token usage when reported, reported
  cost, timing, and attempt number.
- Tool input, dependencies, estimate, start, result, artifacts, and failure.
- Content-request status transitions and the effective media-generation options.
- Provider submission, external job ID, every polling attempt, terminal result,
  and stored artifact IDs.
- The existing messages, tool calls, content requests, checkpoints, usage events,
  artifacts, and calculated usage summary alongside the append-only events.

Trace event detail payloads mechanically redact secrets, credentials, base64/binary fields,
and signed URL query parameters. Large values are bounded before insertion. The
trace records observable inputs and outputs; it does not attempt to record hidden
model reasoning.

## Inspecting a trace

The thread ID is the `threadId` value in the Create page URL. Against the local or
configured development deployment:

```bash
npx convex run create/observability/trace:getForDebug '{"threadId":"THREAD_ID"}'
```

Against production:

```bash
npx convex run create/observability/trace:getForDebug '{"threadId":"THREAD_ID"}' --prod
```

`getForDebug` is an internal Convex query, so it is callable by an operator with
deployment access but not by website clients. Authenticated product surfaces can
use the ownership-checked public query `api.create.observability.trace.get`.

The result is a single debugging bundle. `events` is chronological;
`usageSummary` provides expected/actual cost totals; the other arrays provide the
durable source records when a trace event needs more context.

## Retention

Events currently follow the application's normal database retention (no automatic
deletion). If volume warrants it, add a scheduled archive policy after measuring
real event size and count; keep recent traces queryable in Convex and export older
traces to object storage or a log warehouse.
