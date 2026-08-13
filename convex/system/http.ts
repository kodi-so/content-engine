import { httpRouter } from "convex/server";
import { renderProgressHttp } from "../create/studioRenderRequests";
import { mcpHttp } from "../mcp/http";
import {
  authorizationServerMetadataHttp,
  authorizeHttp,
  protectedResourceMetadataHttp,
  registerClientHttp,
  tokenHttp,
} from "../mcp/oauthHttp";

const http = httpRouter();

// Provider webhooks will live here once Postiz and Post Bridge adapters need
// inbound status or account updates.
http.route({
  path: "/mcp",
  method: "POST",
  handler: mcpHttp,
});

http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "GET",
  handler: protectedResourceMetadataHttp,
});

http.route({
  path: "/.well-known/oauth-protected-resource/mcp",
  method: "GET",
  handler: protectedResourceMetadataHttp,
});

http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "GET",
  handler: authorizationServerMetadataHttp,
});

http.route({ path: "/oauth/register", method: "POST", handler: registerClientHttp });
http.route({ path: "/oauth/authorize", method: "GET", handler: authorizeHttp });
http.route({ path: "/oauth/token", method: "POST", handler: tokenHttp });

http.route({
  path: "/mcp",
  method: "GET",
  handler: mcpHttp,
});

http.route({
  path: "/mcp",
  method: "OPTIONS",
  handler: mcpHttp,
});

http.route({
  path: "/studio-render/progress",
  method: "POST",
  handler: renderProgressHttp,
});

export default http;
