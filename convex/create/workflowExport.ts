import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isRecord } from "./referenceResolution";

type NodeInputBinding =
  | {
      type: "literal";
      value: unknown;
    }
  | {
      type: "node_output";
      sourceNodeId: string;
      sourcePort: string;
      outputKey?: string;
    }
  | {
      type: "artifact";
      artifactId: string;
    }
  | {
      type: "media_asset";
      assetId: string;
    };

type WorkflowNode = {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  provider?: string;
  model?: string;
  config: Record<string, unknown>;
  inputBindings?: Record<string, NodeInputBinding>;
  retention?: Record<string, unknown>;
};

type WorkflowEdge = {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};

function slug(value: string) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "step";
}

function briefFromInput(input: unknown) {
  if (!isRecord(input)) return "";
  const brief = typeof input.brief === "string" ? input.brief.trim() : "";
  if (brief) return brief;
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query) return query;
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (prompt) return prompt;
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text) return text;
  const instructions = typeof input.instructions === "string" ? input.instructions.trim() : "";
  if (instructions) return instructions;
  const source = typeof input.source === "string" ? input.source.trim() : "";
  return source;
}

function referencesFromToolOutput(output: unknown) {
  if (!isRecord(output) || !Array.isArray(output.references)) {
    return { artifactIds: [] as string[], creativeAssetIds: [] as string[] };
  }

  const artifactIds: string[] = [];
  const creativeAssetIds: string[] = [];
  for (const reference of output.references) {
    if (!isRecord(reference)) continue;
    const source = typeof reference.source === "string" ? reference.source : "";
    const sourceId = typeof reference.sourceId === "string" ? reference.sourceId : "";
    const creativeAssetId = typeof reference.creativeAssetId === "string"
      ? reference.creativeAssetId
      : source === "creative_asset"
        ? sourceId
        : "";
    if (creativeAssetId) {
      creativeAssetIds.push(creativeAssetId);
    } else if (sourceId) {
      artifactIds.push(sourceId);
    }
  }

  return {
    artifactIds: [...new Set(artifactIds)],
    creativeAssetIds: [...new Set(creativeAssetIds)],
  };
}

function nodePosition(index: number) {
  return {
    x: 80 + index * 300,
    y: index % 2 === 0 ? 180 : 340,
  };
}

function addNode(nodes: WorkflowNode[], node: Omit<WorkflowNode, "position">) {
  nodes.push({
    ...node,
    position: nodePosition(nodes.length),
  });
}

function outputPortForNode(type: string) {
  if (type === "image_generation") return "image";
  if (type === "llm") return "text";
  if (type === "video_generation") return "video";
  if (type === "ai_video_editor") return "video";
  if (type === "audio_generation") return "audio";
  if (type === "lipsync") return "video";
  if (type === "native_slideshow_planner") return "slide_spec";
  if (type === "native_slideshow_renderer") return "slideshow";
  if (type === "post_compiler") return "post_package";
  if (type === "runner") return "run";
  return "artifact";
}

function inputPortForNode(type: string) {
  if (type === "image_generation") return "prompt";
  if (type === "video_generation") return "prompt";
  if (type === "ai_video_editor") return "media";
  if (type === "audio_generation") return "text";
  if (type === "lipsync") return "audio";
  if (type === "native_slideshow_planner") return "prompt";
  if (type === "native_slideshow_renderer") return "slide_spec";
  if (type === "post_compiler") return "media";
  if (type === "export") return "input";
  return "input";
}

function connect(edges: WorkflowEdge[], source: WorkflowNode, target: WorkflowNode) {
  if (source.type === "comment" || target.type === "comment" || target.type === "media") return;
  edges.push({
    id: `${source.id}-to-${target.id}`,
    sourceNodeId: source.id,
    sourcePort: outputPortForNode(source.type),
    targetNodeId: target.id,
    targetPort: inputPortForNode(target.type),
  });
}

function nodeForToolCall(toolCall: Doc<"createToolCalls">, index: number): WorkflowNode[] {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const brief = briefFromInput(input);
  const baseId = `${slug(toolCall.toolName)}-${index + 1}`;

  if (toolCall.toolName === "references.list") {
    const references = referencesFromToolOutput(toolCall.output);
    return [{
      id: baseId,
      type: "media",
      label: "Reusable References",
      position: nodePosition(index + 1),
      config: {
        artifactIds: references.artifactIds,
        creativeAssetIds: references.creativeAssetIds,
        uploadedMedia: [],
        sourceQuery: brief,
      },
      retention: { mode: "keep", exposeInLibrary: false },
    }];
  }

  if (toolCall.toolName === "analyze.source") {
    return [{
      id: baseId,
      type: "ai_agent",
      label: "Analyze Source",
      position: nodePosition(index + 1),
      provider: "bulkapis",
      config: {
        agentMode: "analysis",
        requestFromInputNode: false,
        request: brief,
        tone: "analytical",
        platform: "tiktok",
      },
      retention: { mode: "discard" },
    }];
  }

  if (toolCall.toolName === "text.generate") {
    return [{
      id: baseId,
      type: "llm",
      label: "Write Text",
      position: nodePosition(index + 1),
      provider: typeof input.provider === "string" ? input.provider : "openrouter",
      model: typeof input.model === "string" ? input.model : undefined,
      config: {
        promptFromInputNode: false,
        prompt: brief,
        systemPrompt: typeof input.systemPrompt === "string" ? input.systemPrompt : undefined,
        responseFormat: "text",
        temperature: typeof input.temperature === "number" ? input.temperature : undefined,
        maxTokens: typeof input.maxTokens === "number" ? input.maxTokens : undefined,
      },
      retention: { mode: "keep_on_failure" },
    }];
  }

  if (toolCall.toolName === "media.generateImage") {
    return [{
      id: baseId,
      type: "image_generation",
      label: "Create Images",
      position: nodePosition(index + 1),
      provider: "bulkapis",
      config: {
        generationOperation: "image_text_to_image",
        promptFromInputNode: false,
        prompt: brief,
        imageFromInputNode: false,
        localReferenceImages: [],
        aspectRatio: "4:5",
        count: 1,
      },
      retention: { mode: "keep_on_failure" },
    }];
  }

  if (toolCall.toolName === "media.generateVideo") {
    return [{
      id: baseId,
      type: "video_generation",
      label: "Create Video",
      position: nodePosition(index + 1),
      provider: "bulkapis",
      config: {
        generationOperation: "video_image_to_video",
        promptFromInputNode: false,
        prompt: brief,
        imageFromInputNode: false,
        startEndFrameMode: false,
        localReferenceImages: [],
        localStartFrameImages: [],
        localEndFrameImages: [],
        localReferenceVideos: [],
        aspectRatio: "9:16",
        durationSeconds: 5,
      },
      retention: { mode: "keep_on_failure" },
    }];
  }

  if (toolCall.toolName === "media.renderVideo") {
    return [{
      id: baseId,
      type: "ai_video_editor",
      label: "AI Video Render",
      position: nodePosition(index + 1),
      provider: typeof input.provider === "string" ? input.provider : "bulkapis",
      model: typeof input.model === "string" ? input.model : undefined,
      config: {
        promptFromInputNode: false,
        prompt: brief,
        mediaFromInputNode: false,
        uploadedMedia: [],
        aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : "4:5",
        renderMode: "video_render",
        maxDurationSeconds: typeof input.maxDurationSeconds === "number"
          ? input.maxDurationSeconds
          : typeof input.durationSeconds === "number"
            ? input.durationSeconds
            : undefined,
        width: typeof input.width === "number" ? input.width : undefined,
        height: typeof input.height === "number" ? input.height : undefined,
        fps: typeof input.fps === "number" ? input.fps : undefined,
      },
      retention: { mode: "keep_on_failure" },
    }];
  }

  if (toolCall.toolName === "media.generateAudio") {
    return [{
      id: baseId,
      type: "audio_generation",
      label: "Create Audio",
      position: nodePosition(index + 1),
      provider: "bulkapis",
      config: {
        generationOperation: "audio_text_to_speech",
        textFromInputNode: false,
        text: brief,
        voiceFromInputNode: false,
        localReferenceAudios: [],
        mode: "tts",
      },
      retention: { mode: "keep_on_failure" },
    }];
  }

  if (toolCall.toolName === "media.lipsync") {
    return [{
      id: baseId,
      type: "lipsync",
      label: "Lip Sync Video",
      position: nodePosition(index + 1),
      provider: "bulkapis",
      config: {
        generationOperation: "lipsync_audio_to_video",
        imageFromInputNode: false,
        audioFromInputNode: false,
        localReferenceImages: [],
        localReferenceVideos: [],
        localReferenceAudios: [],
        resolution: typeof input.resolution === "string" ? input.resolution : undefined,
      },
      retention: { mode: "keep_on_failure" },
    }];
  }

  if (toolCall.toolName === "slideshow.render") {
    return [
      {
        id: `${baseId}-planner`,
        type: "native_slideshow_planner",
        label: "Plan Slideshow",
        position: nodePosition(index + 1),
        provider: "bulkapis",
        config: {
          generationOperation: "video_render_assembly",
          promptFromInputNode: false,
          prompt: brief,
          slideCount: 5,
          aspectRatio: "4:5",
        },
        retention: { mode: "discard" },
      },
      {
        id: `${baseId}-renderer`,
        type: "native_slideshow_renderer",
        label: "Render Slideshow",
        position: nodePosition(index + 2),
        config: {
          renderMode: "native",
          aspectRatio: "4:5",
        },
        retention: { mode: "keep_on_failure" },
      },
    ];
  }

  if (toolCall.toolName === "artifact.save") {
    return [{
      id: baseId,
      type: "export",
      label: "Save To Library",
      position: nodePosition(index + 1),
      config: { destination: "media_library" },
      retention: { mode: "keep", exposeInLibrary: true },
    }];
  }

  if (toolCall.toolName === "artifact.export") {
    return [{
      id: baseId,
      type: "export",
      label: "Export Output",
      position: nodePosition(index + 1),
      config: {
        destination: "download",
        artifactIds: isRecord(toolCall.input) && Array.isArray(toolCall.input.artifactIds)
          ? toolCall.input.artifactIds
          : [],
      },
      retention: { mode: "keep", exposeInLibrary: false },
    }];
  }

  if (toolCall.toolName === "publishing.prepare") {
    return [{
      id: baseId,
      type: "post_compiler",
      label: "Prepare Publishing Draft",
      position: nodePosition(index + 1),
      config: {
        postType: "video",
        platformPreset: "tiktok_vertical_video",
        optimizeForPlatforms: ["tiktok"],
        captionFromInputNode: false,
        caption: "Prepared from Create Agent workflow draft.",
      },
      retention: { mode: "keep", exposeInLibrary: true },
    }];
  }

  return [{
    id: baseId,
    type: "comment",
    label: toolCall.label,
    position: nodePosition(index + 1),
    config: {
      text: `${toolCall.label} was used in the Create conversation but does not yet have a reliable repeatable workflow node. Tool: ${toolCall.toolName}`,
      toolName: toolCall.toolName,
      input: toolCall.input,
    },
  }];
}

export function buildWorkflowGraphForCreateToolCalls(toolCalls: Doc<"createToolCalls">[]) {
  const succeededToolCalls = toolCalls.filter((toolCall) => toolCall.status === "succeeded");
  const nodes: WorkflowNode[] = [{
    id: "runner",
    type: "runner",
    label: "Runner",
    position: { x: 80, y: 180 },
    config: {
      trigger: "manual",
      scheduleType: "interval",
      intervalHours: 24,
      scheduleDayOfWeek: 1,
      scheduleHour: 9,
      scheduleMinute: 0,
      timezone: "America/Chicago",
      runsPerExecution: 1,
      retryCount: 0,
      timeoutSeconds: 900,
      failureBehavior: "stop_workflow",
    },
  }];
  const edges: WorkflowEdge[] = [];

  for (const [index, toolCall] of succeededToolCalls.entries()) {
    for (const node of nodeForToolCall(toolCall, index)) {
      addNode(nodes, {
        id: node.id,
        type: node.type,
        label: node.label,
        provider: node.provider,
        model: node.model,
        config: node.config,
        inputBindings: node.inputBindings,
        retention: node.retention,
      });
    }
  }

  if (!nodes.some((node) => node.type === "export")) {
    addNode(nodes, {
      id: "export",
      type: "export",
      label: "Export",
      config: { destination: "media_library" },
      retention: { mode: "keep", exposeInLibrary: true },
    });
  }

  let previousConnectable = nodes[0];
  for (const node of nodes.slice(1)) {
    connect(edges, previousConnectable, node);
    if (node.type !== "comment" && node.type !== "media") {
      previousConnectable = node;
    }
  }

  return {
    schemaVersion: 1 as const,
    nodes,
    edges,
    canvas: {
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

export async function createWorkflowDraftFromThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  args: { name?: string }
) {
  const toolCalls = (await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect())
    .filter((toolCall) => toolCall.status === "succeeded");

  if (!toolCalls.length) {
    throw new Error("Create conversation has no completed tool steps to convert into a workflow.");
  }

  const unsupportedToolNames = [
    ...new Set(
      toolCalls.flatMap((toolCall) =>
        toolCall.toolName === "studio.compose" || toolCall.toolName === "studio.render"
          ? [toolCall.toolName]
          : []
      )
    ),
  ];
  const now = Date.now();
  const workflowId = await ctx.db.insert("workflows", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    name: args.name?.trim() || `${thread.title?.trim() || "Create conversation"} workflow`,
    description: [
      `Draft converted from Create conversation ${String(thread._id)}.`,
      unsupportedToolNames.length
        ? `Some Create steps were added as comments because they are not repeatable workflow nodes yet: ${unsupportedToolNames.join(", ")}.`
        : undefined,
    ].filter(Boolean).join(" "),
    trigger: "manual",
    approvalPolicy: { mode: "always" },
    publishingPolicy: {
      provider: "manual",
      autoPublish: false,
      defaultPlatforms: ["tiktok"],
    },
    graph: buildWorkflowGraphForCreateToolCalls(toolCalls),
    isActive: false,
    createdAt: now,
    updatedAt: now,
  });

  return {
    workflowId,
    convertedToolCount: toolCalls.length,
    unsupportedToolNames,
  };
}
