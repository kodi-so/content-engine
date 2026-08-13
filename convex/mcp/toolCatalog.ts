import {
  listCreateToolsForMcp,
  type CreateToolPlannerDescriptor,
  type CreateToolSchema,
} from "../create/tools";
import { CONTENT_ENGINE_APP_URI } from "./appResource";
import { annotationsForTool, requiredScopesForTool, type McpScope } from "./scopes";

export const MCP_SERVER_INSTRUCTIONS = [
  "Content Engine creates, analyzes, edits, renders, saves, exports, and publishes social media content.",
  "Every creation tool returns a durable run. Reuse _context.threadId to chain later commands to prior outputs.",
  "Read content-engine://models when choosing an explicit generation model, and call references.list to search the user's Content Engine library.",
  "Video, slideshow, analysis, and generation commands can continue asynchronously; call command.status to inspect them.",
  "Call command.render when the user should see or play generated media inside the host client.",
  "Publishing tools act on external social accounts and should only be called after the user clearly asks to publish.",
].join(" ");

const contextSchema = {
  type: "object",
  description: "Optional durable Content Engine run context.",
  additionalProperties: false,
  properties: {
    threadId: {
      type: "string",
      description: "Existing Content Engine run id. Reuse it to let this command access prior outputs.",
    },
  },
};

function mcpInputSchema(schema: CreateToolSchema) {
  if (schema.kind === "placeholder") {
    return {
      type: "object",
      description: schema.description,
      additionalProperties: true,
      properties: { _context: contextSchema },
    };
  }
  const source = schema.schema;
  const properties = source.properties && typeof source.properties === "object"
    ? source.properties as Record<string, unknown>
    : {};
  return {
    ...source,
    type: "object",
    properties: { ...properties, _context: contextSchema },
  };
}

const runOutputSchema = {
  type: "object",
  description: "Durable Content Engine run snapshot.",
  additionalProperties: true,
  required: ["run", "commands", "artifacts"],
  properties: {
    run: {
      type: "object",
      additionalProperties: true,
      required: ["id", "state"],
      properties: {
        id: { type: "string" },
        state: { type: "string" },
        pollAfterMs: { type: "number" },
      },
    },
    commands: { type: "array", items: { type: "object", additionalProperties: true } },
    artifacts: { type: "array", items: { type: "object", additionalProperties: true } },
  },
};

export type McpToolPolicy = {
  kind: "command" | "status" | "render";
  requiredScopes: McpScope[];
  tool?: CreateToolPlannerDescriptor;
};

const commandTools = listCreateToolsForMcp();
const policies = new Map<string, McpToolPolicy>(
  commandTools.map((tool) => [
    tool.name,
    { kind: "command", requiredScopes: requiredScopesForTool(tool), tool },
  ])
);
policies.set("command.status", { kind: "status", requiredScopes: ["content:read"] });
policies.set("command.render", { kind: "render", requiredScopes: ["content:read"] });

export function mcpToolPolicy(name: string) {
  return policies.get(name);
}

export function listMcpToolDefinitions() {
  return [
    ...commandTools.map((tool) => ({
      name: tool.name,
      title: tool.label,
      description: `${tool.description} Returns a durable Content Engine run snapshot.`,
      inputSchema: mcpInputSchema(tool.inputSchema),
      outputSchema: runOutputSchema,
      annotations: annotationsForTool(tool),
    })),
    {
      name: "command.status",
      title: "Inspect Content Engine Run",
      description: "Inspect the latest state, command outputs, artifacts, renders, and links for a durable Content Engine run.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["threadId"],
        properties: {
          threadId: { type: "string", description: "Content Engine run id returned by another tool." },
        },
      },
      outputSchema: runOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "command.render",
      title: "Render Content Engine Run",
      description: "Render a Content Engine run as an interactive embedded media workspace. Use this after generation when the user should see, play, or open the result.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["threadId"],
        properties: {
          threadId: { type: "string", description: "Content Engine run id returned by another tool." },
        },
      },
      outputSchema: runOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: CONTENT_ENGINE_APP_URI },
        "openai/outputTemplate": CONTENT_ENGINE_APP_URI,
        "openai/toolInvocation/invoking": "Opening Content Engine…",
        "openai/toolInvocation/invoked": "Content Engine is ready.",
      },
    },
  ];
}

export function splitCommandArguments(args: Record<string, unknown>) {
  const context = args._context && typeof args._context === "object" && !Array.isArray(args._context)
    ? args._context as Record<string, unknown>
    : {};
  const input = Object.fromEntries(Object.entries(args).filter(([key]) => key !== "_context"));
  return {
    input,
    threadId: typeof context.threadId === "string" ? context.threadId : undefined,
  };
}
