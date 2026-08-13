import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { ROSTER_MODELS } from "../../src/lib/generation/modelRoster";

type McpResource = {
  description: string;
  mimeType: "application/json" | "text/markdown";
  name: string;
  title: string;
  uri: string;
};

const RESOURCES: McpResource[] = [
  {
    uri: "content-engine://account-manager-guide",
    name: "account-manager-guide",
    title: "Account Manager Guide",
    description: "Guidance for managing social accounts with memory, posts, and Autopilot.",
    mimeType: "text/markdown",
  },
  {
    uri: "content-engine://create-model-options",
    name: "create-model-options",
    title: "Create Model Options",
    description: "Model-option behavior for image and video generation.",
    mimeType: "application/json",
  },
  {
    uri: "content-engine://models",
    name: "models",
    title: "Content Engine Models",
    description: "Current image, video, audio, and lipsync models available to Content Engine commands.",
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

function accountManagerGuide() {
  return [
    "# Content Engine Account Management",
    "",
    "Each social account is the durable unit managed by the Agent.",
    "",
    "- Account playbooks store durable human-authored direction.",
    "- Manual and scheduled posts share one account-owned history.",
    "- Autopilot wakes the account Agent on a schedule; it is not a named content recipe.",
    "- Account-scoped Agent threads receive the playbook, insights, and recent post context.",
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

function modelCatalog() {
  return ROSTER_MODELS.map((model) => ({
    id: model.id,
    label: model.label,
    mode: model.mode,
    strengths: model.strengths,
    isDefault: model.isDefault ?? false,
    aspectRatios: model.aspectRatios,
    durationConstraint: model.durationConstraint,
    nativeAudio: model.nativeAudio,
    multiShot: model.multiShot,
    maxReferenceImages: model.maxReferenceImages,
    pricing: model.pricing,
    options: model.options,
  }));
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
      case "content-engine://account-manager-guide":
        return textResource(resource, accountManagerGuide());
      case "content-engine://create-model-options":
        return jsonResource(resource, createModelOptions());
      case "content-engine://models":
        return jsonResource(resource, modelCatalog());
      default:
        throw new Error("Unknown MCP resource");
    }
  },
});
