# Create trace guide

## Bundle fields

- `thread`: current durable thread status, active `decisionRunId`, error, final artifacts, and total cost.
- `usageSummary`: canonical expected/actual/outstanding cost summary. Prefer this over manually summing events.
- `events`: chronological append-only observations, capped at 1,000 per bundle.
- `messages`: user, agent, plan, status, clarification, and tool-result messages.
- `toolCalls`: durable tool input, dependencies, status, estimate, output, artifacts, timing, and error.
- `contentRequests`: durable image, video, audio, lipsync, or slideshow requests and generation settings.
- `usageEvents`: raw estimates, provider submissions, charges, and failures.
- `checkpoints`: approvals, debug pauses, and user decisions that can intentionally stop progress.
- `artifacts`: generated outputs associated with the thread or its content requests.

Use `decisionRunId` to distinguish turns, `operationId` to group a lifecycle, and `parentOperationId` to move up the causal chain.

## Event families

- `run.turn.*`: user-turn lifecycle.
- `agent.context.built`: effective brief and context assembled for planning.
- `agent.decision.*`: planning lifecycle and structured-output repair.
- `model.call.*`: exact observable request/response attempt, model, tokens, cost, timing, or error.
- `tool.*`: command queued, started, completed, failed, or retried.
- `content_request.*`: durable media workflow queued, started, completed, or failed.
- `provider.*`: external submission, provider job ID, polling, completion, or failure.
- `artifact.created`: output successfully stored.

## Common signatures

### Agent could not plan

- `model.call.failed` before `agent.decision.completed`: inspect provider/model error.
- First attempt failed, then `agent.decision.repair`, then success: malformed structured output recovered automatically.
- `agent.context.built` contains stale or missing durable context: trace back to messages, tool results, and the selected `decisionRunId`.

### Tool never started

- `tool.queued` without `tool.started`: inspect `dependsOnToolCallIds`, failed dependencies, checkpoint state, available parallel slots, and thread status.
- Open checkpoint plus waiting thread: intentional approval/debug pause, not a worker outage.

### Tool started but never finished

- Durable tool status `running`: inspect the async service or action responsible for that tool.
- Tool status `succeeded` with a queued `contentRequestId`: tool orchestration completed; continue into the content-request and provider lifecycle.

### Provider job stuck

- `provider.submitted` plus repeated queued/running polls and no terminal event: external job remains pending or polling stopped.
- Retryable polling errors: distinguish intermittent polling transport failures from a provider-declared failed job.
- Provider succeeded but no `artifact.created`: inspect asset download, storage, or artifact persistence after generation.

### Wrong output

- Compare the user message, `agent.context.built`, model input, structured decision, tool input, effective content-request options, and provider input in order.
- Identify the first layer where intent diverged. Avoid blaming the final provider when the wrong brief or model was selected earlier.

### Cost anomaly

- Use `usageSummary.totalCostUsd`, `actualCostUsd`, and `outstandingEstimatedCostUsd`.
- Compare tool/content-request estimates with the provider-reported model, options, duration, count, and references.
- Do not sum `actualCostUsd` across trace events: submission, model completion, agent completion, and provider completion can repeat the same reported charge.
- Missing actual cost means the provider omitted billing metadata or the charge event was not recorded; it does not prove the operation was free.

### Empty event history

- Historical threads created before `createRunEvents` instrumentation can have no events.
- Use messages, tool calls, content requests, usage events, and artifacts to reconstruct the available history.
