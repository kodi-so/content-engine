import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

type McpResource = {
  description: string;
  mimeType: "application/json" | "text/markdown";
  name: string;
  title: string;
  uri: string;
};

const RESOURCES: McpResource[] = [
  {
    uri: "content-engine://automation-guide",
    name: "automation-guide",
    title: "Automation Guide",
    description: "Current guidance for creating prompt-driven publishing automations.",
    mimeType: "text/markdown",
  },
  {
    uri: "content-engine://create-model-options",
    name: "create-model-options",
    title: "Create Model Options",
    description: "Model-option behavior for image and video generation.",
    mimeType: "application/json",
  },
];

function textResource(resource: McpResource, text: string) {
  return {
    contents: [
      {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text,
      },
    ],
  };
}

function jsonResource(resource: McpResource, value: unknown) {
  return textResource(resource, JSON.stringify(value, null, 2));
}

function automationGuide() {
  return [
    "# Content Engine Automations",
    "",
    "Automations are saved creative briefs with schedule, approval, budget, platform, and generation defaults.",
    "",
    "- Create automations from the Create agent using automation.create.",
    "- New automations start inactive until the user enables them.",
    "- Scheduled runs create normal Create threads with automation context attached.",
    "- Generation should use roster model options instead of provider-specific UI concepts.",
  ].join("\n");
}

function createModelOptions() {
  return {
    image: {
      resolution: "Resolved from explicit request, workspace default, then model default.",
      webSearch: "Available on supported Nano Banana models.",
      quality: "Available on GPT Image 2.",
    },
    video: {
      resolution: "Available on supported Veo and PixVerse models.",
    },
  };
}

export const listForMcp = internalQuery({
  args: { userId: v.string() },
  handler: async (_ctx, _args) => {
    return RESOURCES;
  },
});

export const readForMcp = internalQuery({
  args: { userId: v.string(), uri: v.string() },
  handler: async (_ctx, args) => {
    const resource = RESOURCES.find((candidate) => candidate.uri === args.uri);
    if (!resource) throw new Error("Unknown MCP resource");

    switch (resource.uri) {
      case "content-engine://automation-guide":
        return textResource(resource, automationGuide());
      case "content-engine://create-model-options":
        return jsonResource(resource, createModelOptions());
      default:
        throw new Error("Unknown MCP resource");
    }
  },
});
