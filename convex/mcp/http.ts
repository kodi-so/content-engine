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

const TOOL_DEFINITIONS: unknown[] = [];

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
  void ctx;
  void session;
  void args;
  throw new Error(`Unknown MCP tool: ${name}`);
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
