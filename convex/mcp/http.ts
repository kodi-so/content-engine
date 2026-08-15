import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import {
  contentEngineAppResource,
  CONTENT_ENGINE_APP_MIME_TYPE,
  CONTENT_ENGINE_APP_URI,
  isContentEngineAppResourceUri,
} from "./appResource";
import { mcpResourceForRequest } from "./oauthHttp";
import { sha256Hex } from "./oauthCrypto";
import {
  listMcpToolDefinitions,
  MCP_SERVER_INSTRUCTIONS,
  mcpToolPolicy,
  splitCommandArguments,
} from "./toolCatalog";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type McpSession = {
  userId: string;
  workspaceId?: Id<"workspaces">;
  scopes: string[];
};

const resolveOauthToken = makeFunctionReference<
  "query",
  { accessTokenHash: string; resource: string },
  {
    tokenId: Id<"mcpOauthTokens">;
    userId: string;
    workspaceId?: Id<"workspaces">;
    scopes: string[];
  } | null
>("mcp/oauthRecords:resolveAccessToken");
const recordOauthTokenUse = makeFunctionReference<
  "mutation",
  { tokenId: Id<"mcpOauthTokens"> },
  null
>("mcp/oauthRecords:recordTokenUse");
const invokeCommand = makeFunctionReference<
  "mutation",
  {
    userId: string;
    workspaceId?: Id<"workspaces">;
    threadId?: Id<"createThreads">;
    toolName: string;
    input: unknown;
  },
  { threadId: Id<"createThreads">; toolCallId: Id<"createToolCalls">; execution: unknown }
>("mcp/commands:invoke");
const commandSnapshot = makeFunctionReference<
  "query",
  {
    userId: string;
    workspaceId?: Id<"workspaces">;
    threadId: Id<"createThreads">;
    appUrl?: string;
  },
  Record<string, unknown>
>("mcp/commands:snapshot");

const MCP_PROTOCOL_VERSION = "2025-06-18";

class McpHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

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
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function objectParams(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
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
    throw new McpHttpError("Origin is not allowed for MCP requests", 403);
  }
}

function assertScopes(session: McpSession, required: string[]) {
  const missing = required.filter((scope) => !session.scopes.includes(scope));
  if (missing.length) {
    throw new McpHttpError(`MCP credential is missing required scope: ${missing.join(", ")}`, 403);
  }
}

function assertAnyScope(session: McpSession, allowed: string[]) {
  if (!allowed.some((scope) => session.scopes.includes(scope))) {
    throw new McpHttpError(`MCP credential needs one of these scopes: ${allowed.join(", ")}`, 403);
  }
}

async function authenticate(ctx: ActionCtx, request: Request): Promise<McpSession> {
  const token = bearerToken(request);
  if (!token) throw new McpHttpError("Missing bearer token", 401);
  const tokenHash = await sha256Hex(token);
  if (token.startsWith("ce_mcp_")) {
    const key = await ctx.runQuery(internal.mcp.apiKeyRecords.resolve, { keyHash: tokenHash });
    if (!key) throw new McpHttpError("Invalid or revoked MCP API key", 401);
    await ctx.runMutation(internal.mcp.apiKeyRecords.recordUse, { keyId: key.keyId });
    return {
      userId: key.userId,
      workspaceId: key.workspaceId,
      scopes: key.scopes,
    };
  }

  const oauth = await ctx.runQuery(resolveOauthToken, {
    accessTokenHash: tokenHash,
    resource: mcpResourceForRequest(request),
  });
  if (!oauth) throw new McpHttpError("Invalid or expired OAuth access token", 401);
  await ctx.runMutation(recordOauthTokenUse, { tokenId: oauth.tokenId });
  return {
    userId: oauth.userId,
    workspaceId: oauth.workspaceId,
    scopes: oauth.scopes,
  };
}

function appUrl() {
  return process.env.CONTENT_ENGINE_APP_URL?.trim().replace(/\/$/, "");
}

function summaryForSnapshot(snapshot: Record<string, unknown>) {
  const run = objectParams(snapshot.run);
  const artifacts = Array.isArray(snapshot.artifacts) ? snapshot.artifacts : [];
  return [
    `Content Engine run ${String(run.id ?? "")}: ${String(run.state ?? "unknown")}.`,
    `${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}.`,
    run.state === "running" ? "Use command.status to inspect progress or command.render to show the live media workspace." : "",
  ].filter(Boolean).join(" ");
}

function artifactResourceLinks(snapshot: Record<string, unknown>) {
  const artifacts = Array.isArray(snapshot.artifacts) ? snapshot.artifacts : [];
  return artifacts.slice(0, 12).flatMap((value, index) => {
    const artifact = objectParams(value);
    if (typeof artifact.url !== "string") return [];
    try {
      const url = new URL(artifact.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") return [];
      const data = objectParams(artifact.data);
      return [{
        type: "resource_link",
        uri: url.toString(),
        name: typeof artifact.title === "string" ? artifact.title : `content-engine-artifact-${index + 1}`,
        title: typeof artifact.title === "string" ? artifact.title : "Content Engine artifact",
        description: `Generated ${String(artifact.type ?? "media")} from Content Engine.`,
        mimeType: typeof data.mimeType === "string" ? data.mimeType : undefined,
      }];
    } catch {
      return [];
    }
  });
}

function structuredToolResult(snapshot: Record<string, unknown>) {
  return {
    content: [
      { type: "text", text: summaryForSnapshot(snapshot) },
      ...artifactResourceLinks(snapshot),
    ],
    structuredContent: snapshot,
  };
}

async function readSnapshot(
  ctx: ActionCtx,
  session: McpSession,
  threadIdValue: unknown
) {
  if (typeof threadIdValue !== "string" || !threadIdValue) {
    throw new Error("threadId is required");
  }
  return await ctx.runQuery(commandSnapshot, {
    userId: session.userId,
    workspaceId: session.workspaceId,
    threadId: threadIdValue as Id<"createThreads">,
    appUrl: appUrl(),
  });
}

async function callTool(
  ctx: ActionCtx,
  session: McpSession,
  name: string,
  args: Record<string, unknown>
) {
  const policy = mcpToolPolicy(name);
  if (!policy) throw new Error(`Unknown MCP tool: ${name}`);
  assertScopes(session, policy.requiredScopes);

  if (policy.kind === "status" || policy.kind === "render") {
    return structuredToolResult(await readSnapshot(ctx, session, args.threadId));
  }

  const { input, threadId } = splitCommandArguments(args);
  const invoked = await ctx.runMutation(invokeCommand, {
    userId: session.userId,
    workspaceId: session.workspaceId,
    threadId: threadId as Id<"createThreads"> | undefined,
    toolName: name,
    input,
  });
  const snapshot = await readSnapshot(ctx, session, invoked.threadId);
  return structuredToolResult(snapshot);
}

async function handleMcpRequest(
  ctx: ActionCtx,
  session: McpSession,
  message: JsonRpcRequest
) {
  if (message.jsonrpc !== "2.0" || !message.method) {
    return jsonRpcError(message.id, -32600, "Invalid JSON-RPC request");
  }
  try {
    switch (message.method) {
      case "initialize":
        return jsonRpcResult(message.id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { resources: { listChanged: false }, tools: { listChanged: false } },
          serverInfo: { name: "content-engine", version: "1.0.0" },
          instructions: MCP_SERVER_INSTRUCTIONS,
        });
      case "notifications/initialized":
        return null;
      case "ping":
        return jsonRpcResult(message.id, {});
      case "resources/list": {
        assertScopes(session, ["resources:read"]);
        const resources = await ctx.runQuery(internal.mcp.resources.listForMcp, { userId: session.userId });
        return jsonRpcResult(message.id, {
          resources: [
            ...resources,
            {
              uri: CONTENT_ENGINE_APP_URI,
              name: "content-engine-run",
              title: "Content Engine Run",
              description: "Interactive media workspace for a Content Engine command run.",
              mimeType: CONTENT_ENGINE_APP_MIME_TYPE,
            },
          ],
        });
      }
      case "resources/read": {
        const params = objectParams(message.params);
        const uri = typeof params.uri === "string" ? params.uri : "";
        const isAppResource = isContentEngineAppResourceUri(uri);
        if (isAppResource) {
          assertAnyScope(session, ["resources:read", "content:read"]);
        } else {
          assertScopes(session, ["resources:read"]);
        }
        if (isAppResource && uri !== CONTENT_ENGINE_APP_URI) {
          throw new Error(
            `Unknown Content Engine app resource: ${uri}. Reconnect Content Engine to refresh the MCP tool catalog.`
          );
        }
        const resource = uri === CONTENT_ENGINE_APP_URI
          ? contentEngineAppResource()
          : await ctx.runQuery(internal.mcp.resources.readForMcp, { userId: session.userId, uri });
        return jsonRpcResult(message.id, resource);
      }
      case "tools/list":
        return jsonRpcResult(message.id, { tools: listMcpToolDefinitions() });
      case "tools/call": {
        const params = objectParams(message.params);
        const name = typeof params.name === "string" ? params.name : "";
        const args = objectParams(params.arguments);
        return jsonRpcResult(message.id, await callTool(ctx, session, name, args));
      }
      default:
        return jsonRpcError(message.id, -32601, `Unsupported MCP method: ${message.method}`);
    }
  } catch (error) {
    return jsonRpcError(
      message.id,
      error instanceof McpHttpError && error.status === 403 ? -32003 : -32000,
      error instanceof Error ? error.message : "MCP request failed"
    );
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
      return jsonResponse({ error: "This MCP endpoint uses Streamable HTTP POST requests." }, 405);
    }
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const session = await authenticate(ctx, request);
    const payload = await request.json() as JsonRpcRequest | JsonRpcRequest[];
    const messages = Array.isArray(payload) ? payload : [payload];
    const responses = await Promise.all(messages.map((message) => handleMcpRequest(ctx, session, message)));
    const concrete = responses.filter((response) => response !== null);
    if (!concrete.length) return new Response(null, { status: 202 });
    return jsonResponse(Array.isArray(payload) ? concrete : concrete[0]);
  } catch (error) {
    const status = error instanceof McpHttpError ? error.status : 400;
    const message = error instanceof Error ? error.message : "MCP request failed";
    const headers: Record<string, string> = status === 401
      ? { "WWW-Authenticate": `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource", request.url)}"` }
      : {};
    return jsonResponse(jsonRpcError(null, -32000, message), status, headers);
  }
});
