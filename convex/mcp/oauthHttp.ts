import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import { pkceChallenge, randomToken, sha256Hex } from "./oauthCrypto";
import { ALL_MCP_SCOPES, MCP_SCOPES } from "./scopes";

const getClient = makeFunctionReference<
  "query",
  { clientId: string },
  { clientId: string; redirectUris: string[]; clientName?: string } | null
>("mcp/oauthRecords:getClient");
const registerClient = makeFunctionReference<
  "mutation",
  { clientId: string; clientName?: string; redirectUris: string[] },
  string
>("mcp/oauthRecords:registerClient");
const createAuthorizationRequest = makeFunctionReference<
  "mutation",
  {
    clientId: string;
    redirectUri: string;
    state?: string;
    scopes: string[];
    codeChallenge: string;
    resource: string;
  },
  Id<"mcpOauthAuthorizationRequests">
>("mcp/oauthRecords:createAuthorizationRequest");
const exchangeCode = makeFunctionReference<
  "mutation",
  {
    codeHash: string;
    codeChallenge: string;
    clientId: string;
    redirectUri: string;
    resource: string;
    accessTokenHash: string;
    refreshTokenHash: string;
    accessExpiresAt: number;
    refreshExpiresAt: number;
  },
  { scopes: string[] }
>("mcp/oauthRecords:exchangeAuthorizationCode");
const rotateRefreshToken = makeFunctionReference<
  "mutation",
  {
    refreshTokenHash: string;
    clientId: string;
    resource: string;
    accessTokenHash: string;
    nextRefreshTokenHash: string;
    accessExpiresAt: number;
    refreshExpiresAt: number;
  },
  { scopes: string[] }
>("mcp/oauthRecords:rotateRefreshToken");

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function originForRequest(request: Request) {
  return new URL(request.url).origin;
}

export function mcpResourceForRequest(request: Request) {
  return `${originForRequest(request)}/mcp`;
}

function appUrl() {
  const value = process.env.CONTENT_ENGINE_APP_URL?.trim();
  if (!value) throw new Error("CONTENT_ENGINE_APP_URL is not configured");
  return value.replace(/\/$/, "");
}

function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status);
}

function validRedirectUri(value: string) {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function validPkceValue(value: string) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

function requestedScopes(value: string | null) {
  const requested = value?.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
  const scopes = requested?.length ? [...new Set(requested)] : ALL_MCP_SCOPES;
  const supported = new Set<string>(ALL_MCP_SCOPES);
  const unsupported = scopes.filter((scope) => !supported.has(scope));
  if (unsupported.length) throw new Error(`Unsupported scope: ${unsupported.join(", ")}`);
  return scopes;
}

export const protectedResourceMetadataHttp = httpAction(async (_ctx, request) => {
  const resource = mcpResourceForRequest(request);
  return json({
    resource,
    authorization_servers: [originForRequest(request)],
    scopes_supported: ALL_MCP_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Content Engine",
  });
});

export const authorizationServerMetadataHttp = httpAction(async (_ctx, request) => {
  const origin = originForRequest(request);
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ALL_MCP_SCOPES,
    scope_descriptions: MCP_SCOPES,
  });
});

export const registerClientHttp = httpAction(async (ctx, request) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string")
      : [];
    if (!redirectUris.length || redirectUris.some((uri) => !validRedirectUri(uri))) {
      return oauthError("invalid_client_metadata", "At least one HTTPS or localhost redirect URI is required");
    }
    const clientId = randomToken("ce_client_");
    const clientName = typeof body.client_name === "string" ? body.client_name.trim().slice(0, 120) : undefined;
    await ctx.runMutation(registerClient, { clientId, clientName, redirectUris });
    return json({
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }, 201);
  } catch (error) {
    return oauthError("invalid_client_metadata", error instanceof Error ? error.message : "Client registration failed");
  }
});

export const authorizeHttp = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const responseType = url.searchParams.get("response_type");
    const codeChallenge = url.searchParams.get("code_challenge") ?? "";
    const codeChallengeMethod = url.searchParams.get("code_challenge_method");
    const resource = url.searchParams.get("resource") || mcpResourceForRequest(request);
    if (responseType !== "code") return oauthError("unsupported_response_type", "Only authorization code is supported");
    if (!validPkceValue(codeChallenge) || codeChallengeMethod !== "S256") {
      return oauthError("invalid_request", "PKCE with S256 is required");
    }
    if (resource !== mcpResourceForRequest(request)) {
      return oauthError("invalid_target", "The requested resource does not match this MCP server");
    }
    const client = await ctx.runQuery(getClient, { clientId });
    if (!client || !client.redirectUris.includes(redirectUri)) {
      return oauthError("invalid_request", "Unknown client or redirect URI");
    }
    const requestId = await ctx.runMutation(createAuthorizationRequest, {
      clientId,
      redirectUri,
      state: url.searchParams.get("state") ?? undefined,
      scopes: requestedScopes(url.searchParams.get("scope")),
      codeChallenge,
      resource,
    });
    return Response.redirect(`${appUrl()}/oauth/authorize?requestId=${requestId}`, 302);
  } catch (error) {
    return oauthError("invalid_request", error instanceof Error ? error.message : "Authorization failed");
  }
});

export const tokenHttp = httpAction(async (ctx, request) => {
  try {
    const form = new URLSearchParams(await request.text());
    const grantType = form.get("grant_type");
    const clientId = form.get("client_id") ?? "";
    const resource = form.get("resource") || mcpResourceForRequest(request);
    if (resource !== mcpResourceForRequest(request)) {
      return oauthError("invalid_target", "The requested resource does not match this MCP server");
    }

    const accessToken = randomToken("ce_access_");
    const refreshToken = randomToken("ce_refresh_");
    const now = Date.now();
    const tokenArgs = {
      accessTokenHash: await sha256Hex(accessToken),
      accessExpiresAt: now + ACCESS_TOKEN_TTL_SECONDS * 1000,
      refreshExpiresAt: now + REFRESH_TOKEN_TTL_SECONDS * 1000,
    };
    let result: { scopes: string[] };
    if (grantType === "authorization_code") {
      const code = form.get("code") ?? "";
      const verifier = form.get("code_verifier") ?? "";
      const redirectUri = form.get("redirect_uri") ?? "";
      if (!code || !validPkceValue(verifier) || !clientId || !redirectUri) {
        return oauthError("invalid_request", "code, code_verifier, client_id, and redirect_uri are required");
      }
      result = await ctx.runMutation(exchangeCode, {
        codeHash: await sha256Hex(code),
        codeChallenge: await pkceChallenge(verifier),
        clientId,
        redirectUri,
        resource,
        ...tokenArgs,
        refreshTokenHash: await sha256Hex(refreshToken),
      });
    } else if (grantType === "refresh_token") {
      const currentRefreshToken = form.get("refresh_token") ?? "";
      if (!currentRefreshToken || !clientId) {
        return oauthError("invalid_request", "refresh_token and client_id are required");
      }
      result = await ctx.runMutation(rotateRefreshToken, {
        refreshTokenHash: await sha256Hex(currentRefreshToken),
        clientId,
        resource,
        ...tokenArgs,
        nextRefreshTokenHash: await sha256Hex(refreshToken),
      });
    } else {
      return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token");
    }

    return json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: result.scopes.join(" "),
    });
  } catch (error) {
    return oauthError("invalid_grant", error instanceof Error ? error.message : "Token exchange failed");
  }
});
