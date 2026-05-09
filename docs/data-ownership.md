# Data Ownership

This note defines the durable source-of-truth boundaries for generated content,
editing, publishing, and analytics.

## Core Tables

`contentRequests` stores one-off creation job input and status. It owns the user
prompt, selected references, requested format/mode, current job status, errors,
cost summary, and a pointer to the initial generated plan artifact. New request
rows should not use `plan` as the durable creative source of truth; that field is
kept only for older/debug records.

`workflowRuns` stores repeatable automation execution state. It owns the run
status, current step, cost, errors, generated topic/hook summary, and event log
through `workflowRunEvents`.

`artifacts` stores immutable generated outputs and provenance. It owns generated
plans, prompts, captions, images, videos, rendered publish assets, provider/model
metadata, storage URLs, and parent artifact links.

`slideshows` stores mutable slideshow editor state. It owns the current editable
slide order, deleted/active slide status, text blocks, image prompts after user
edits, source image artifact links, layout choices, and preview/export settings.

`distributionPlans` stores publishing intent. It owns target social accounts,
schedule, caption override, provider, provider payload, external post IDs, and
publish status. Plans should reference publish-ready artifacts, such as
`rendered_asset` or `video`, rather than treating slideshow editor state as a
publishing primitive.

`postMetrics` stores analytics snapshots imported from publishing providers or
platform APIs and links them back to distribution plans, accounts, workflow runs,
and posts where possible.

## Pipeline Boundary

The intended flow is:

```text
content request or workflow run
-> immutable generated artifacts
-> optional mutable format editor, such as slideshows
-> immutable publish-ready artifacts
-> distribution plan
-> metrics snapshots
```

This keeps generation, editing, publishing, and learning separate enough that new
content formats and publishing providers can plug into the same downstream path.
