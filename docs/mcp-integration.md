# Content Engine MCP

Content Engine exposes the same durable command system to its native Agent and
external MCP clients. The MCP layer does not reimplement creation or publishing:
it discovers commands from `convex/create/tools/registry.ts`, enqueues them through
`convex/create/commands/runtime.ts`, and executes them through the same runtime as
the Content Engine Agent.

This means a newly registered native Agent command is automatically eligible for
MCP when its registry audience includes `mcp`.

## Endpoint

The Streamable HTTP endpoint is:

```text
https://<your-convex-site>/mcp
```

The server implements MCP protocol version `2025-06-18`, including tool and
resource listing, structured tool results, server instructions, batch JSON-RPC,
and an MCP App resource.

## Authentication

Two authentication paths are supported.

### OAuth 2.1

OAuth-capable clients only need the MCP endpoint. Content Engine publishes:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server`
- `/oauth/register` for dynamic client registration
- `/oauth/authorize` for authorization code consent
- `/oauth/token` for authorization code and refresh grants

Authorization uses PKCE with S256. The consent screen is authenticated by Clerk
and binds the resulting access and refresh tokens to one Content Engine workspace.
Access tokens expire after one hour; refresh tokens rotate and expire after 30
days.

Set `CONTENT_ENGINE_APP_URL` on the Convex deployment to the public Content Engine
web URL so `/oauth/authorize` can redirect to the consent page.

### API keys

Settings → Agent connections can create a workspace-bound key. Plaintext keys are
shown once and only their SHA-256 hashes are stored. Send the key as:

```http
Authorization: Bearer ce_mcp_...
```

A local Codex configuration can use the key without creating a separate model API
integration:

```toml
[mcp_servers.content_engine]
url = "https://<your-convex-site>/mcp"
bearer_token_env_var = "CONTENT_ENGINE_MCP_TOKEN"
```

The Codex or Claude subscription supplies the conversational agent experience.
Provider calls initiated inside Content Engine—image generation, video generation,
rendering, analysis, and publishing services—still use Content Engine's configured
provider accounts and costs.

## Command model

Every MCP creation tool accepts its normal registered JSON Schema plus an optional
context:

```json
{
  "prompt": "Create a vertical product demo",
  "_context": {
    "threadId": "existing Content Engine run id"
  }
}
```

Omit `_context` to start a hidden MCP run. Reuse the returned `threadId` to chain
commands that should see prior analysis or generated artifacts. MCP runs use
`createThreads` and `createToolCalls`, but do not clutter the native Agent sidebar.

Long-running commands return a current snapshot immediately. Two control tools are
always available:

- `command.status` returns current commands, outputs, artifacts, renders, errors,
  costs, and Content Engine links.
- `command.render` returns the same structured snapshot and attaches the embedded
  Content Engine MCP App.

The server's instructions tell the host agent to poll `command.status` for durable
jobs and use `command.render` when a media result should be visible in the chat.
The `content-engine://models` resource provides the same current model roster the
native UI uses, while `references.list` provides searchable access to the user's
Content Engine library.

## Embedded MCP App

`ui://content-engine/run/v1.html` is served as
`text/html;profile=mcp-app`. It renders a calm media workspace with:

- live run state and automatic polling;
- image, video, and audio playback;
- artifact switching;
- structured fallback output for non-media commands;
- direct media and Content Engine deep links.

The app remains optional. Every command and status result is useful as text,
standard media `resource_link` blocks, and `structuredContent` in clients that do
not support MCP Apps.

## Scopes

| Scope | Access |
| --- | --- |
| `resources:read` | Guides and embedded app resources |
| `content:read` | Trends, analysis, references, runs, and generated output |
| `content:write` | Generation, editing, Studio, rendering, saving, and export |
| `accounts:read` | Connected account context and post queues |
| `accounts:write` | Playbooks, Autopilot, references, and post decisions |
| `publishing:plan` | Prepare publishing payloads without sending them |
| `publishing:publish` | Publish to connected external accounts |

Tool scope and safety annotations are derived in `convex/mcp/scopes.ts`. Publishing
tools are open-world, high-impact capabilities and require the dedicated publish
scope.

## Deployment configuration

- `CONTENT_ENGINE_APP_URL`: public Content Engine web app used by OAuth consent and
  deep links.
- `CE_MCP_ALLOWED_ORIGINS`: optional comma-separated browser origins allowed to call
  the MCP endpoint.
- `CONVEX_SITE_URL`: included as an allowed same-origin MCP caller when present.

Relevant implementation files:

- `convex/create/commands/runtime.ts`
- `convex/create/tools/registry.ts`
- `convex/mcp/commands.ts`
- `convex/mcp/http.ts`
- `convex/mcp/oauthHttp.ts`
- `convex/mcp/oauthRecords.ts`
- `convex/mcp/appResource.ts`
- `src/pages/OAuthAuthorizePage.tsx`
