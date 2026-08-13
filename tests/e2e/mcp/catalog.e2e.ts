import assert from "node:assert/strict";
import {
  listCreateToolsForMcp,
  listCreateToolsForPlanner,
} from "../../../convex/create/tools";
import {
  CONTENT_ENGINE_APP_MIME_TYPE,
  CONTENT_ENGINE_APP_URI,
  contentEngineAppResource,
} from "../../../convex/mcp/appResource";
import { pkceChallenge } from "../../../convex/mcp/oauthCrypto";
import {
  listMcpToolDefinitions,
  mcpToolPolicy,
  splitCommandArguments,
} from "../../../convex/mcp/toolCatalog";

const nativeTools = listCreateToolsForPlanner();
const mcpTools = listCreateToolsForMcp();
assert.deepEqual(
  mcpTools.map((tool) => tool.name).sort(),
  nativeTools.map((tool) => tool.name).sort(),
  "Every native Agent command must be exposed to MCP"
);

const definitions = listMcpToolDefinitions();
const definitionByName = new Map(definitions.map((tool) => [tool.name, tool]));
for (const tool of nativeTools) {
  const definition = definitionByName.get(tool.name);
  assert.ok(definition, `Missing MCP definition for ${tool.name}`);
  assert.ok(mcpToolPolicy(tool.name), `Missing MCP scope policy for ${tool.name}`);
  assert.ok(
    "_context" in (definition.inputSchema.properties ?? {}),
    `${tool.name} must accept durable run context`
  );
}

assert.deepEqual(
  mcpToolPolicy("account.post.publish")?.requiredScopes,
  ["publishing:publish"]
);
assert.deepEqual(
  mcpToolPolicy("publishing.prepare")?.requiredScopes,
  ["publishing:plan"]
);
assert.equal(
  (definitionByName.get("command.render") as { _meta?: { ui?: { resourceUri?: string } } })
    ?._meta?.ui?.resourceUri,
  CONTENT_ENGINE_APP_URI
);

assert.deepEqual(
  splitCommandArguments({
    prompt: "Make a launch video",
    _context: { threadId: "thread-123" },
  }),
  {
    input: { prompt: "Make a launch video" },
    threadId: "thread-123",
  }
);

const resource = contentEngineAppResource();
assert.equal(resource.contents[0].mimeType, CONTENT_ENGINE_APP_MIME_TYPE);
assert.match(resource.contents[0].text, /ui\/notifications\/tool-result/);
assert.match(resource.contents[0].text, /command\.status/);
assert.match(resource.contents[0].text, /slide-controls/);

assert.equal(
  await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
  "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  "PKCE must follow RFC 7636 S256"
);

console.log(`MCP catalog verified: ${nativeTools.length} shared Content Engine commands.`);
