import type { CreateToolPlannerDescriptor } from "../create/tools";

export const MCP_SCOPES = {
  "resources:read": "Read Content Engine guides and embedded app resources.",
  "content:read": "Inspect accounts, references, trends, analyses, runs, and generated content.",
  "content:write": "Create, edit, render, save, and export Content Engine media.",
  "accounts:read": "List connected social accounts, account context, and post queues.",
  "accounts:write": "Update account playbooks, automation, references, and post decisions.",
  "publishing:plan": "Prepare content for publishing without sending it to a social network.",
  "publishing:publish": "Publish content to connected external social accounts.",
} as const;

export type McpScope = keyof typeof MCP_SCOPES;

export const ALL_MCP_SCOPES = Object.keys(MCP_SCOPES) as McpScope[];

const accountReadTools = new Set([
  "account.list",
  "account.get",
  "account.posts.list",
]);

const publishTools = new Set([
  "account.post.approve",
  "account.post.publish",
]);

export function requiredScopesForTool(tool: CreateToolPlannerDescriptor): McpScope[] {
  if (publishTools.has(tool.name)) return ["publishing:publish"];
  if (tool.name === "publishing.prepare") return ["publishing:plan"];
  if (tool.category === "account") {
    return accountReadTools.has(tool.name) ? ["accounts:read"] : ["accounts:write"];
  }
  if (tool.category === "references") {
    return ["content:read"];
  }
  return ["content:write"];
}

export function annotationsForTool(tool: CreateToolPlannerDescriptor) {
  const readOnly = tool.category === "references" ||
    accountReadTools.has(tool.name);
  const openWorld = tool.category === "discovery" ||
    tool.category === "analysis" ||
    tool.category === "publishing" ||
    tool.category === "account";
  const destructive = tool.name === "account.reference.remove" ||
    tool.name === "account.post.reject" ||
    publishTools.has(tool.name);

  return {
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: readOnly,
    openWorldHint: openWorld,
  };
}
