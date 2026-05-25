# MCP Resources

Content Engine exposes read-only MCP-shaped resources through
`convex/mcp/resources.ts`. These resources are the context layer external agents
should read before creating, editing, running, or debugging workflows.

The resource contract follows the MCP resource model:

- Resources have stable URIs.
- Resource list entries include `uri`, `name`, `title`, `description`,
  `mimeType`, and annotations.
- Resource reads return text contents with the same URI and MIME type.
- Sensitive/user-owned resources require an authenticated user context.

Reference:
https://modelcontextprotocol.io/docs/concepts/resources

## URI Scheme

Content Engine uses a custom URI scheme:

```text
content-engine://...
```

These resources are served by the Content Engine MCP server. Clients should read
them through MCP rather than attempting to fetch the URI directly.

## Static Resources

Static resources are safe product and schema context. They still require an
authenticated request in the current Convex query so the future MCP server has a
single security posture.

| URI | MIME type | Purpose |
| --- | --- | --- |
| `content-engine://architecture/guide` | `text/markdown` | Product direction, workflow invariants, provider decisions, and recommended agent workflow-building loop. |
| `content-engine://workflows/graph-schema` | `application/json` | Graph schema version, node types, port data types, provider names, graph shape, and validation invariants. |
| `content-engine://workflows/node-catalog` | `application/json` | Node catalog entries with labels, descriptions, ports, provider requirements, defaults, retention, and output artifact types. |
| `content-engine://workflows/templates` | `application/json` | Built-in workflow templates with required inputs and starter graphs. |
| `content-engine://prompts/agent-recipes` | `application/json` | AI Agent presets plus guidance for writing reusable prompt/script/analysis nodes. |
| `content-engine://knowledge/prompting/ai-ugc` | `application/json` | Persona-led UGC ad and organic UGC prompting guidance. |
| `content-engine://knowledge/prompting/transformation` | `application/json` | Before/after identity preservation and transformation workflow guidance. |
| `content-engine://knowledge/prompting/slideshow` | `application/json` | Native slideshow planning, slide sequence, copy density, and renderer guidance. |
| `content-engine://knowledge/prompting/video` | `application/json` | Short-form video prompting, clip generation, audio, lipsync, and AI Video Editor guidance. |
| `content-engine://knowledge/node-selection` | `application/json` | Heuristics for choosing nodes, ports, and graph shapes. |

## User-Scoped Resources

User-scoped resources are summaries of authenticated user data. They intentionally
exclude provider secrets, OAuth tokens, environment variables, and internal
service credentials.

| URI | MIME type | Purpose |
| --- | --- | --- |
| `content-engine://providers/model-catalog` | `application/json` | Active provider model snapshots, capabilities, pricing metadata, and cached input/result schemas. |
| `content-engine://accounts/brands` | `application/json` | Brand strategy summaries, voice, audience, offer, constraints, example posts, and performance notes. |
| `content-engine://accounts/personas` | `application/json` | Persona identity profiles, visual constraints, usage notes, and attached asset ids. |
| `content-engine://accounts/creative-assets` | `application/json` | Reusable media references, kind, media type, storage URL, usage notes, and asset instructions. |

## Agent Usage

Recommended external-agent flow:

1. Read `content-engine://architecture/guide`.
2. Read graph schema and node catalog.
3. Read templates, agent recipes, and relevant prompt knowledge resources.
4. Read user-scoped brand, persona, creative asset, and model catalog resources.
5. Create or edit a workflow through MCP tools using ids from the resource
   summaries.
6. Run workflows only through explicit run tools.

Resources are not mutation surfaces. Workflow creation, graph edits, run starts,
artifact inspection, and publishing actions belong to MCP tools with explicit
scope checks.
