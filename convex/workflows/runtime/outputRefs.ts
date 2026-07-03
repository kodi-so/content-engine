import type { Id } from "../../_generated/dataModel";
import type { CanonicalSlideshowSpec } from "../../content/types";
import type { WorkflowAgentOutputKind } from "../agentPresets";
import { mediaNodeOutputPorts } from "./nodeRuntime";

export type MediaKindForRun = "image" | "video" | "audio" | "media";

export type MediaNodeItemForRun = {
  id: string;
  source: "artifact" | "creative_asset" | "uploaded";
  kind: MediaKindForRun;
  title?: string;
  storageUrl?: string;
  data?: unknown;
  metadata?: unknown;
};

export function slideSpecOutputRefsForNode(args: {
  nodeId: string;
  artifactId: Id<"artifacts">;
  plan: unknown;
}) {
  return [{
    nodeId: args.nodeId,
    port: "slide_spec",
    artifactIds: [args.artifactId],
    value: {
      kind: "slide_spec",
      artifactId: args.artifactId,
      plan: args.plan,
    },
  }];
}

export function nativeSlideshowOutputRefsForNode(args: {
  nodeId: string;
  artifactId: Id<"artifacts">;
  slideshowId: Id<"slideshows">;
  spec: CanonicalSlideshowSpec;
}) {
  return [{
    nodeId: args.nodeId,
    port: "slideshow",
    artifactIds: [args.artifactId],
    value: {
      kind: "slideshow",
      artifactId: args.artifactId,
      slideshowId: args.slideshowId,
      title: args.spec.title,
      slideCount: args.spec.slides.filter((slide) => slide.status !== "deleted").length,
      aspectRatio: args.spec.aspectRatio,
      dimensions: args.spec.dimensions,
      spec: args.spec,
    },
  }];
}

export function llmOutputRefsForNode(args: {
  nodeId: string;
  artifactId: Id<"artifacts">;
  text: string;
  responseFormat: "text" | "json";
  object?: unknown;
}) {
  const baseValue = {
    artifactId: args.artifactId,
    text: args.text,
    prompt: args.text,
    responseFormat: args.responseFormat,
    ...(args.object !== undefined ? { json: args.object } : {}),
  };

  return [
    {
      nodeId: args.nodeId,
      port: "text",
      artifactIds: [args.artifactId],
      value: baseValue,
    },
    ...(args.object !== undefined
      ? [{
          nodeId: args.nodeId,
          port: "json",
          artifactIds: [args.artifactId],
          value: {
            artifactId: args.artifactId,
            json: args.object,
            text: args.text,
            responseFormat: args.responseFormat,
          },
        }]
      : []),
    {
      nodeId: args.nodeId,
      port: "prompt",
      artifactIds: [args.artifactId],
      value: {
        artifactId: args.artifactId,
        prompt: args.text,
        text: args.text,
        responseFormat: args.responseFormat,
      },
    },
  ];
}

export function agentOutputRefsForNode(args: {
  nodeId: string;
  artifactId: Id<"artifacts">;
  text: string;
  object: unknown;
  outputKind: WorkflowAgentOutputKind;
}) {
  const commonValue = {
    artifactId: args.artifactId,
    outputKind: args.outputKind,
    text: args.text,
    [args.outputKind]: args.text,
    ...(args.outputKind === "prompt" ? { prompt: args.text } : {}),
    json: args.object,
  };
  return [
    {
      nodeId: args.nodeId,
      port: "text",
      artifactIds: [args.artifactId],
      value: commonValue,
    },
    {
      nodeId: args.nodeId,
      port: "json",
      artifactIds: [args.artifactId],
      value: {
        artifactId: args.artifactId,
        outputKind: args.outputKind,
        json: args.object,
        text: args.text,
      },
    },
    {
      nodeId: args.nodeId,
      port: args.outputKind,
      artifactIds: [args.artifactId],
      value: commonValue,
    },
  ];
}

function mediaArtifactIds(items: MediaNodeItemForRun[]) {
  return items
    .filter((item) => item.source === "artifact")
    .map((item) => item.id as Id<"artifacts">);
}

function mediaOutputRefForPort(
  nodeId: string,
  port: MediaKindForRun,
  items: MediaNodeItemForRun[]
) {
  const artifactIds = mediaArtifactIds(items);

  return {
    nodeId,
    port,
    ...(artifactIds.length ? { artifactIds } : {}),
    value: {
      kind: port,
      items,
      count: items.length,
    },
  };
}

export function imageOutputRefsForNode(
  nodeId: string,
  images: MediaNodeItemForRun[]
) {
  return [mediaOutputRefForPort(nodeId, "image", images)];
}

export function videoOutputRefsForNode(
  nodeId: string,
  videos: MediaNodeItemForRun[]
) {
  return [mediaOutputRefForPort(nodeId, "video", videos)];
}

export function audioOutputRefsForNode(
  nodeId: string,
  audios: MediaNodeItemForRun[]
) {
  return [mediaOutputRefForPort(nodeId, "audio", audios)];
}

export function mediaOutputRefsForNode(
  nodeId: string,
  items: MediaNodeItemForRun[]
) {
  return mediaNodeOutputPorts().flatMap((rawPort) => {
    const port = rawPort as MediaKindForRun;
    const matchingItems =
      port === "media"
        ? items
        : items.filter((item) => item.kind === port);
    if (!matchingItems.length) return [];
    return [mediaOutputRefForPort(nodeId, port, matchingItems)];
  });
}
