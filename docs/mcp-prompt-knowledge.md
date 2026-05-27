# MCP Prompt Knowledge Resources

Content Engine exposes prompt-engineering and workflow-building knowledge through
`convex/mcp/resources.ts`. These resources give external agents reusable creative
judgment before they create or edit workflows.

The goal is not to hardcode one app's marketing strategy. The goal is to teach
agents the platform's content-production taste: how to preserve identity, choose
nodes, split work into debuggable steps, and avoid generic prompts.

## Resources

| URI | Purpose |
| --- | --- |
| `content-engine://knowledge/prompting/ai-ugc` | Persona-led UGC ad and organic UGC prompting guidance. |
| `content-engine://knowledge/prompting/transformation` | Before/after identity preservation, credible progress, and transformation workflow guidance. |
| `content-engine://knowledge/prompting/slideshow` | Native slideshow planning, slide sequence, copy density, and renderer guidance. |
| `content-engine://knowledge/prompting/video` | Short-form video prompting, clip generation, audio, lipsync, and AI Video Editor guidance. |
| `content-engine://knowledge/node-selection` | Heuristics for choosing nodes, ports, and graph shapes. |

## Expected Agent Usage

An external workflow-building agent should read these resources after the graph
schema, node catalog, and user summaries. The recommended order is:

1. Read `content-engine://architecture/guide`.
2. Read `content-engine://workflows/graph-schema`.
3. Read `content-engine://workflows/node-catalog`.
4. Read the relevant prompt knowledge resources for the requested content type.
5. Read brand, persona, creative asset, and model catalog resources.
6. Create or edit the workflow graph with node and edge tools.

## Design Notes

- Prompt resources are JSON, not prose-only docs, so agents can consume them as
  data.
- Each guide includes preferred workflow shapes, prompt principles, and common
  mistakes.
- Node selection guidance is intentionally product-level. It should help an
  agent decide when to use AI Agent, LLM, media, generation, AI Video Editor,
  post compiler, export, or auto post nodes.
- The resources are static and safe to expose to any authenticated MCP client.
  They do not contain user data or provider secrets.
