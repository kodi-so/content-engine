---
name: content-engine-agent
description: Operate Content Engine through its authenticated MCP server to research social content, analyze sources, generate and edit text, images, video, audio, captions, slideshows, and Studio compositions, manage library references and social accounts, run Autopilot, and prepare or publish posts. Use whenever the user asks Codex or another agent to create, analyze, render, save, export, manage, schedule, or publish social content with Content Engine.
---

# Content Engine Agent

Use Content Engine as a durable content-production system. Let the MCP tool schemas and current tool descriptions supply exact parameters; use this skill to choose and sequence the tools correctly.

## Core Workflow

1. Confirm the `content-engine` MCP tools are available. If authentication is missing, ask the user to reconnect Content Engine instead of substituting local database edits or invented results.
2. Identify the intended outcome: research, source analysis, content creation, account management, or publishing.
3. Resolve real IDs before acting. Use `references.list`, `account.list`, `account.get`, or prior tool results; never invent account, reference, artifact, project, post, or run IDs.
4. Call the smallest tool that advances the request. Capture the returned run or thread ID.
5. Pass `_context.threadId` to later creation tools when they should use earlier analysis, scripts, references, or artifacts.
6. For queued or running work, call `command.status` until the run reaches a terminal state. Do not repeat the original generation call merely because it is still running.
7. After media generation, call `command.render` when the user should see, play, or open the result. If the host cannot render the MCP App, return the media and Content Engine links from the result.
8. Report what completed, what failed, which artifacts were produced, and any decision still needed from the user.

Use durable context like this:

```json
{
  "prompt": "Turn the approved script into a vertical product video",
  "_context": {
    "threadId": "<run id returned by the prior tool>"
  }
}
```

Omit `_context` for an unrelated new run.

## Research and References

- Use `social.discoverContent` for recent posts from a specific Instagram or TikTok profile.
- Use `social.researchTrends` for platform-wide, niche, format, keyword, or audience trend research.
- Use `analyze.source` for a specific URL, uploaded file, or media asset. Analyze no more sources than needed and never fabricate public URLs or metrics.
- Use `references.list` before selecting a library asset. Prefer the user's reusable identity, product, style, voice, logo, and negative references when they are relevant.
- For an account built around a recurring human character, use its active identity reference whenever that character appears. Treat the reference as an identity anchor, not as a fixed pose, outfit, location, or composition.
- Preserve identity while intentionally varying wardrobe, setting, pose, activity, expression, framing, crop, distance, and camera angle across outputs. Avoid near-duplicate staging unless the requested story needs visual continuity.
- Treat research as source material for an original concept. Do not copy another creator's identity, exact script, or creative execution.

## Creation

Choose only the stages the request needs. A common full workflow is:

`references.list` → `text.generate` → media generation → `studio.compose` or `slideshow.render` → render → `command.render` → `artifact.save` or `artifact.export`

- Use `text.generate` for scripts, captions, outlines, hooks, shot lists, and other text artifacts.
- Use `media.generateImage`, `media.generateVideo`, `media.renderVideo`, or `media.generateAudio` for provider-backed media.
- Use `media.lipsync` when spoken audio must drive a face in an image or video.
- Use `studio.compose` for timeline-based video assembled from clips, audio, overlays, transitions, and captions.
- Use `media.captions` and `mediaOverlay.updateText` for follow-up text changes on an existing project rather than regenerating the underlying media.
- Use `slideshow.render` for native social slideshows and `studio.render` for final Studio video output.
- Treat a successfully rendered slideshow preview as visible Library content. It should appear immediately with a Preview state; `artifact.save` promotes reviewed work to Saved but is not required for Library visibility and does not imply publishing.
- Present text-only drafts directly from the run's structured result. Do not claim that a generated text artifact is visible in the Content Engine Library unless the current product surface explicitly lists that artifact type.
- Use `artifact.save` for reusable approved outputs and `artifact.export` for download or handoff.
- Select an explicit model only when the user requests one or the choice materially affects the result. Read `content-engine://models` when the host exposes MCP resources.

## Accounts and Autopilot

Start account work with `account.list`, then inspect the selected account with `account.get`.

- Use `account.playbook.update` for durable human-authored strategy and creative direction.
- Use `account.reference.add` and `account.reference.remove` for persistent account identity, style, voice, logo, or negative guidance.
- Use `account.autopilot.update` to configure behavior and scheduling.
- Use `account.autopilot.setStatus` to activate, pause, or disable Autopilot.
- Use `account.runNow` only when the user wants the account Agent to create its next post now.
- Use `account.posts.list` to inspect drafts, approvals, failures, published posts, and metrics.

Preserve the distinction between a user's one-off request and durable account direction. Do not update the playbook or Autopilot settings unless the user asks for an ongoing change.

## Publishing Safety

Treat publishing as an external, high-impact action.

- Use `publishing.prepare` to attach reviewed media as a draft or approval-ready account post.
- Call `account.post.approve` or `account.post.publish` only when the user clearly asks to publish in the current conversation.
- Verify the exact account, artifact, caption, and post state before publishing.
- Use `account.post.reject` only for the specific pending post the user wants canceled.
- Do not interpret requests to create, render, save, export, schedule, or prepare as permission to publish.
- Return the final post status and external link when available. Never claim publication from a queued or failed result.

## Failure Handling

- Surface authentication and scope errors directly and explain which connection or permission is missing.
- Always preserve and report the durable thread ID for a failed or stuck run. Operators with deployment access can use it to retrieve the internal execution trace; external MCP agents must not claim that access unless an internal trace tool is actually available.
- Surface provider, render-worker, and publishing failures from the run snapshot; do not hide them behind a generic success message.
- Inspect per-command outputs and analysis records before summarizing a failed run. Earlier discovery metadata or partial outputs may remain valid even when a later command causes the durable run to enter a failed state.
- If `command.render` remains in its initial Connecting state while `command.status` returns a valid snapshot, treat it as an embedded-app delivery failure. Return the structured result inline and do not redirect a text-only draft to a Library deep link as a substitute.
- When diagnosing a renderer frozen in its initial state, validate the generated app HTML's embedded script rather than only inspecting the TypeScript template source. Escapes such as `\n` must survive any outer template literal, and a syntax error prevents the MCP Apps handshake from starting.
- Keep a hand-written MCP Apps bridge aligned with the current initialization contract: send `protocolVersion`, `appInfo`, and `appCapabilities` in `ui/initialize`, then send `ui/notifications/initialized` only after the host responds. Exercise this lifecycle with a host-message integration test.
- After versioning a `command.render` app-resource URI, expect already-open hosts to retain the prior `tools/list` metadata. If the server reports an unknown `ui://content-engine/run/*` resource while the current URI works, reconnect Content Engine or start a fresh host session to reload the catalog; do not add a legacy alias unless the product explicitly requires compatibility.
- If `analyze.source` cannot resolve a public TikTok video or extract slides from a TikTok photo post, do not infer unseen visual details from its caption, thumbnail, or attached sound. Preserve any successful discovery metadata, report the media-resolution limitation, and ask for an uploaded source or retry only when the failure is plausibly transient.
- Retry only when the failure is transient or the user requests it. Preserve the existing thread ID when the retry should retain prior context.
- If a tool returns partial artifacts, identify which outputs are usable before proposing the next step.

## Tool Families

The live MCP catalog is authoritative. Expect these families:

- Control: `command.status`, `command.render`
- Research: `references.list`, `social.discoverContent`, `social.researchTrends`, `analyze.source`
- Creation: `text.generate`, `media.*`, `mediaOverlay.updateText`, `slideshow.render`, `studio.*`
- Artifacts: `artifact.save`, `artifact.export`
- Accounts: `account.list`, `account.get`, `account.playbook.update`, `account.reference.*`, `account.autopilot.*`, `account.runNow`, `account.posts.list`
- Publishing: `publishing.prepare`, `account.post.approve`, `account.post.reject`, `account.post.publish`
