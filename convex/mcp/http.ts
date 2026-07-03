import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type McpSession = {
  keyId: string;
  userId: string;
  scopes: string[];
};

const MCP_PROTOCOL_VERSION = "2025-06-18";

const TOOL_DEFINITIONS = [
  {
    name: "workflows.list",
    description: "List workflow summaries for the authenticated Content Engine user.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "workflows.get",
    description: "Read one workflow, including its canvas graph.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
  },
  {
    name: "workflows.validateGraph",
    description: "Validate a proposed workflow graph without saving it.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["graph"],
      properties: {
        graph: { type: "object" },
      },
    },
  },
  {
    name: "workflows.createBlank",
    description: "Create an inactive blank workflow draft with a runner and export node.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        socialAccountId: { type: "string" },
        publishingProvider: { type: "string" },
        defaultPlatforms: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "workflows.addNode",
    description: "Add one node to a workflow canvas graph and validate the draft graph.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workflowId", "node"],
      properties: {
        workflowId: { type: "string" },
        node: { type: "object" },
      },
    },
  },
  {
    name: "workflows.updateNode",
    description: "Patch one workflow node's label, position, provider, model, config, input bindings, or retention.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workflowId", "nodeId"],
      properties: {
        workflowId: { type: "string" },
        nodeId: { type: "string" },
        label: { type: "string" },
        position: { type: "object" },
        provider: { type: ["string", "null"] },
        model: { type: ["string", "null"] },
        config: { type: "object" },
        inputBindings: { type: ["object", "null"] },
        retention: { type: ["object", "null"] },
      },
    },
  },
  {
    name: "workflows.deleteNode",
    description: "Delete one workflow node and remove its incident edges.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workflowId", "nodeId"],
      properties: {
        workflowId: { type: "string" },
        nodeId: { type: "string" },
      },
    },
  },
  {
    name: "workflows.connectNodes",
    description: "Connect two existing workflow node ports and validate the draft graph.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workflowId", "sourceNodeId", "sourcePort", "targetNodeId", "targetPort"],
      properties: {
        workflowId: { type: "string" },
        edgeId: { type: "string" },
        sourceNodeId: { type: "string" },
        sourcePort: { type: "string" },
        targetNodeId: { type: "string" },
        targetPort: { type: "string" },
      },
    },
  },
  {
    name: "workflows.disconnectEdge",
    description: "Remove one workflow graph edge by id and validate the draft graph.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workflowId", "edgeId"],
      properties: {
        workflowId: { type: "string" },
        edgeId: { type: "string" },
      },
    },
  },
  {
    name: "workflows.replaceEdge",
    description: "Replace one workflow graph edge and validate the draft graph.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workflowId", "edgeId", "edge"],
      properties: {
        workflowId: { type: "string" },
        edgeId: { type: "string" },
        edge: { type: "object" },
      },
    },
  },
  {
    name: "workflows.updateMetadata",
    description: "Update workflow metadata, trigger, schedule, approval, or publishing policy.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        socialAccountId: { type: ["string", "null"] },
        trigger: { type: "string" },
        scheduleConfig: { type: "object" },
        approvalPolicy: { type: "object" },
        publishingPolicy: { type: "object" },
      },
    },
  },
  {
    name: "workflows.updateGraph",
    description: "Replace the workflow canvas graph after validation.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "graph"],
      properties: {
        id: { type: "string" },
        graph: { type: "object" },
      },
    },
  },
  {
    name: "workflows.runWorkflow",
    description: "Validate and start a workflow run.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workflowId"],
      properties: {
        workflowId: { type: "string" },
      },
    },
  },
  {
    name: "runs.list",
    description: "List workflow runs, optionally filtered by workflow or status.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        workflowId: { type: "string" },
        status: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "runs.inspect",
    description: "Inspect a workflow run, node states, events, artifacts, and distribution plans.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["runId"],
      properties: {
        runId: { type: "string" },
      },
    },
  },
  {
    name: "runs.inspectNodeOutput",
    description: "Inspect one run node state and the artifacts referenced by its output refs.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["runId", "nodeId"],
      properties: {
        runId: { type: "string" },
        nodeId: { type: "string" },
      },
    },
  },
  {
    name: "artifacts.listRunArtifacts",
    description: "List artifacts produced by a workflow run.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["runId"],
      properties: {
        runId: { type: "string" },
        finalOnly: { type: "boolean" },
      },
    },
  },
];

function jsonHeaders(extraHeaders: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    ...extraHeaders,
  };
}

function jsonResponse(value: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: jsonHeaders(extraHeaders),
  });
}

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
}

function objectParams(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

function toolArguments(params: unknown): Record<string, unknown> {
  const record = objectParams(params);
  return objectParams(record.arguments);
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function allowedOrigins() {
  return [
    ...(process.env.CE_MCP_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    process.env.CONVEX_SITE_URL,
  ].filter((origin): origin is string => Boolean(origin));
}

function assertAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const allowed = allowedOrigins();
  if (allowed.length > 0 && !allowed.includes(origin)) {
    throw new Error("Origin is not allowed for MCP requests");
  }
}

function assertScope(session: McpSession, scope: string) {
  if (!session.scopes.includes(scope)) {
    throw new Error(`MCP API key is missing required scope: ${scope}`);
  }
}

function assertScopes(session: McpSession, scopes: string[]) {
  for (const scope of scopes) {
    assertScope(session, scope);
  }
}

async function authenticate(ctx: ActionCtx, request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Error("Missing bearer token");

  const keyHash = await sha256Hex(token);
  const session = await ctx.runQuery(internal.mcp.apiKeyRecords.resolve, { keyHash });
  if (!session) throw new Error("Invalid or revoked MCP API key");

  await ctx.runMutation(internal.mcp.apiKeyRecords.recordUse, { keyId: session.keyId });
  return session;
}

function textToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text",
        text: `${JSON.stringify(value, null, 2)}\n`,
      },
    ],
  };
}

async function callTool(
  ctx: ActionCtx,
  session: McpSession,
  name: string,
  args: Record<string, unknown>
) {
  const toolArgs = args as any;
  switch (name) {
    case "workflows.list":
      assertScope(session, "workflows:read");
      return await ctx.runQuery(internal.mcp.workflows.listForMcp, {
        userId: session.userId,
      });
    case "workflows.get":
      assertScope(session, "workflows:read");
      return await ctx.runQuery(internal.mcp.workflows.getForMcp, {
        userId: session.userId,
        id: toolArgs.id,
      });
    case "workflows.validateGraph":
      assertScope(session, "workflows:read");
      return await ctx.runQuery(internal.mcp.workflows.validateGraphForMcp, {
        graph: toolArgs.graph,
      });
    case "workflows.createBlank":
      assertScopes(session, ["workflows:read", "workflows:write"]);
      return await ctx.runMutation(internal.mcp.workflows.createBlankForMcp, {
        userId: session.userId,
        socialAccountId: toolArgs.socialAccountId,
        name: toolArgs.name,
        description: toolArgs.description,
        publishingProvider: toolArgs.publishingProvider,
        defaultPlatforms: toolArgs.defaultPlatforms,
      });
    case "workflows.addNode":
      assertScopes(session, ["workflows:read", "workflows:write"]);
      return await ctx.runMutation(internal.mcp.workflows.addNodeForMcp, {
        userId: session.userId,
        workflowId: toolArgs.workflowId,
        node: toolArgs.node,
      });
    case "workflows.updateNode":
      assertScopes(session, ["workflows:read", "workflows:write"]);
      return await ctx.runMutation(internal.mcp.workflows.updateNodeForMcp, {
        userId: session.userId,
        workflowId: toolArgs.workflowId,
        nodeId: toolArgs.nodeId,
        label: toolArgs.label,
        position: toolArgs.position,
        provider: toolArgs.provider,
        model: toolArgs.model,
        config: toolArgs.config,
        inputBindings: toolArgs.inputBindings,
        retention: toolArgs.retention,
      });
    case "workflows.deleteNode":
      assertScopes(session, ["workflows:read", "workflows:write"]);
      return await ctx.runMutation(internal.mcp.workflows.deleteNodeForMcp, {
        userId: session.userId,
        workflowId: toolArgs.workflowId,
        nodeId: toolArgs.nodeId,
      });
    case "workflows.connectNodes":
      assertScopes(session, ["workflows:read", "workflows:write"]);
      return await ctx.runMutation(internal.mcp.workflows.connectNodesForMcp, {
        userId: session.userId,
        workflowId: toolArgs.workflowId,
        edgeId: toolArgs.edgeId,
        sourceNodeId: toolArgs.sourceNodeId,
        sourcePort: toolArgs.sourcePort,
        targetNodeId: toolArgs.targetNodeId,
        targetPort: toolArgs.targetPort,
      });
    case "workflows.disconnectEdge":
      assertScopes(session, ["workflows:read", "workflows:write"]);
      return await ctx.runMutation(internal.mcp.workflows.disconnectEdgeForMcp, {
        userId: session.userId,
        workflowId: toolArgs.workflowId,
        edgeId: toolArgs.edgeId,
      });
    case "workflows.replaceEdge":
      assertScopes(session, ["workflows:read", "workflows:write"]);
      return await ctx.runMutation(internal.mcp.workflows.replaceEdgeForMcp, {
        userId: session.userId,
        workflowId: toolArgs.workflowId,
        edgeId: toolArgs.edgeId,
        edge: toolArgs.edge,
      });
    case "workflows.updateMetadata":
      assertScopes(session, ["workflows:read", "workflows:write"]);
      return await ctx.runMutation(internal.mcp.workflows.updateMetadataForMcp, {
        userId: session.userId,
        id: toolArgs.id,
        name: toolArgs.name,
        description: toolArgs.description,
        socialAccountId: toolArgs.socialAccountId,
        trigger: toolArgs.trigger,
        scheduleConfig: toolArgs.scheduleConfig,
        approvalPolicy: toolArgs.approvalPolicy,
        publishingPolicy: toolArgs.publishingPolicy,
      });
    case "workflows.updateGraph":
      assertScopes(session, ["workflows:read", "workflows:write"]);
      return await ctx.runMutation(internal.mcp.workflows.updateGraphForMcp, {
        userId: session.userId,
        id: toolArgs.id,
        graph: toolArgs.graph,
      });
    case "workflows.runWorkflow":
      assertScopes(session, ["workflows:read", "runs:write"]);
      return await ctx.runMutation(internal.mcp.workflows.runWorkflowForMcp, {
        userId: session.userId,
        workflowId: toolArgs.workflowId,
      });
    case "runs.list":
      assertScope(session, "runs:read");
      return await ctx.runQuery(internal.mcp.runArtifacts.listRunsForMcp, {
        userId: session.userId,
        workflowId: toolArgs.workflowId,
        status: toolArgs.status,
        limit: toolArgs.limit,
      });
    case "runs.inspect":
      assertScope(session, "runs:read");
      return await ctx.runQuery(internal.mcp.runArtifacts.inspectRunForMcp, {
        userId: session.userId,
        runId: toolArgs.runId,
      });
    case "runs.inspectNodeOutput":
      assertScopes(session, ["runs:read", "artifacts:read"]);
      return await ctx.runQuery(internal.mcp.runArtifacts.inspectNodeOutputForMcp, {
        userId: session.userId,
        runId: toolArgs.runId,
        nodeId: toolArgs.nodeId,
      });
    case "artifacts.listRunArtifacts":
      assertScopes(session, ["runs:read", "artifacts:read"]);
      return await ctx.runQuery(internal.mcp.runArtifacts.listRunArtifactsForMcp, {
        userId: session.userId,
        runId: toolArgs.runId,
        finalOnly: toolArgs.finalOnly,
      });
    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}

async function handleMcpRequest(
  ctx: ActionCtx,
  session: McpSession,
  message: JsonRpcRequest
) {
  if (message.jsonrpc !== "2.0" || !message.method) {
    return jsonRpcError(message.id, -32600, "Invalid JSON-RPC request");
  }

  switch (message.method) {
    case "initialize":
      return jsonRpcResult(message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          resources: {},
          tools: {},
        },
        serverInfo: {
          name: "content-engine",
          version: "0.1.0",
        },
      });
    case "notifications/initialized":
      return null;
    case "resources/list":
      assertScope(session, "resources:read");
      return jsonRpcResult(message.id, {
        resources: await ctx.runQuery(internal.mcp.resources.listForMcp, {
          userId: session.userId,
        }),
      });
    case "resources/read": {
      assertScope(session, "resources:read");
      const params = objectParams(message.params);
      const uri = typeof params.uri === "string" ? params.uri : "";
      return jsonRpcResult(
        message.id,
        await ctx.runQuery(internal.mcp.resources.readForMcp, {
          userId: session.userId,
          uri,
        })
      );
    }
    case "tools/list":
      return jsonRpcResult(message.id, { tools: TOOL_DEFINITIONS });
    case "tools/call": {
      const params = objectParams(message.params);
      const name = typeof params.name === "string" ? params.name : "";
      const result = await callTool(ctx, session, name, toolArguments(message.params));
      return jsonRpcResult(message.id, textToolResult(result));
    }
    default:
      return jsonRpcError(message.id, -32601, `Unsupported MCP method: ${message.method}`);
  }
}

export const mcpHttp = httpAction(async (ctx, request) => {
  try {
    assertAllowedOrigin(request);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
    }

    if (request.method === "GET") {
      return jsonResponse({ error: "SSE streams are not enabled for this MCP endpoint." }, 405);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const session = await authenticate(ctx, request);
    const message = (await request.json()) as JsonRpcRequest;
    const result = await handleMcpRequest(ctx, session, message);

    if (!result || message.id === undefined) {
      return new Response(null, { status: 202 });
    }

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP request failed";
    return jsonResponse(jsonRpcError(null, -32000, message), 400);
  }
});
