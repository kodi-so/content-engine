import type { Id } from "../../_generated/dataModel";
import {
  CreateToolNotFoundError,
  CreateToolUnavailableError,
  type CreateToolDefinition,
  type CreateToolExecutionContext,
  type CreateToolExecutionResult,
  type CreateToolName,
  type CreateToolPlannerDescriptor,
  type CreateToolSchema,
} from "./types";

type EchoToolInput = {
  message?: string;
  values?: Record<string, unknown>;
};

type EchoToolOutput = {
  message: string;
  values: Record<string, unknown>;
  executedAt: number;
};

type NoopToolOutput = {
  ok: true;
  message: string;
  executedAt: number;
};

function echoInputFromUnknown(input: unknown): EchoToolInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  const values = record.values && typeof record.values === "object" && !Array.isArray(record.values)
    ? record.values as Record<string, unknown>
    : undefined;

  return {
    message: typeof record.message === "string" ? record.message : undefined,
    values,
  };
}

const emptySchema = (description: string): CreateToolSchema => ({
  kind: "placeholder",
  description,
});

const fieldsSchema = (
  description: string,
  fields: Record<string, string>
): CreateToolSchema => ({
  kind: "placeholder",
  description,
  fields,
});

const noArtifacts = {
  emitsArtifacts: false,
} as const;

const defaultConfirmation = {
  required: false,
  risk: "none",
} as const;

const noCheckpoint = {
  behavior: "none",
} as const;

function agentRuntimeTool(
  definition: Omit<CreateToolDefinition, "availability" | "executionMode" | "confirmation" | "checkpoint"> &
    Partial<Pick<CreateToolDefinition, "confirmation" | "checkpoint">>
): CreateToolDefinition {
  return {
    availability: "available",
    executionMode: "agent_runtime",
    confirmation: definition.confirmation ?? {
      required: false,
      risk: "medium",
      reason: "This tool is executed by the Create agent runtime and may spend provider or render resources.",
    },
    checkpoint: definition.checkpoint ?? {
      behavior: "after",
      defaultInDebugMode: true,
      label: definition.label,
      description: "Review this step before continuing in Debug Mode.",
    },
    ...definition,
  };
}

const toolDefinitions = [
  {
    name: "create.noop",
    label: "Check Tool Runtime",
    description: "No-op tool used to verify Create agent tool execution plumbing.",
    category: "test",
    availability: "available",
    executionMode: "direct",
    inputSchema: emptySchema("No input is required."),
    outputSchema: fieldsSchema("Runtime check result.", {
      ok: "Boolean success marker.",
      message: "Human-readable execution summary.",
      executedAt: "Unix timestamp in milliseconds.",
    }),
    confirmation: defaultConfirmation,
    checkpoint: noCheckpoint,
    artifactBehavior: noArtifacts,
    handler: async (context): Promise<NoopToolOutput> => {
      const executedAt = (context.now ?? Date.now)();
      return {
        ok: true,
        message: "Create tool registry is reachable.",
        executedAt,
      };
    },
  },
  {
    name: "create.echo",
    label: "Echo Test Input",
    description: "Echoes structured input for planner and executor tests.",
    category: "test",
    availability: "available",
    executionMode: "direct",
    inputSchema: fieldsSchema("Arbitrary test payload.", {
      message: "Optional message to echo.",
      values: "Optional structured values to echo.",
    }),
    outputSchema: fieldsSchema("Echoed payload.", {
      message: "Echoed message.",
      values: "Echoed structured values.",
      executedAt: "Unix timestamp in milliseconds.",
    }),
    confirmation: defaultConfirmation,
    checkpoint: noCheckpoint,
    artifactBehavior: noArtifacts,
    handler: async (context, input): Promise<EchoToolOutput> => {
      const echoInput = echoInputFromUnknown(input);
      const executedAt = (context.now ?? Date.now)();
      return {
        message: echoInput.message ?? "Echo from Create tool registry.",
        values: echoInput.values ?? {},
        executedAt,
      };
    },
  },
  agentRuntimeTool({
    name: "analyze.source",
    label: "Analyze Source",
    description: "Analyze an uploaded file, media asset, or URL for reusable creative context.",
    category: "analysis",
    inputSchema: fieldsSchema("Source to analyze.", {
      sourceType: "One of url, file, artifact, or library_asset.",
      source: "URL or internal source identifier.",
      instructions: "Optional analysis guidance from the user or planner.",
    }),
    outputSchema: fieldsSchema("Structured source analysis.", {
      summary: "Human-readable analysis summary.",
      observations: "Important visual, audio, textual, or strategic findings.",
      artifactIds: "Optional emitted analysis artifact ids.",
    }),
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["file"],
      intermediate: true,
    },
  }),
  agentRuntimeTool({
    name: "references.list",
    label: "Find References",
    description: "List reusable library assets, personas, and artifacts for planner context.",
    category: "references",
    inputSchema: fieldsSchema("Reference search filters.", {
      query: "Optional semantic or text filter.",
      mediaTypes: "Optional media type filters.",
      limit: "Maximum number of references to return.",
    }),
    outputSchema: fieldsSchema("Selectable reference results.", {
      references: "Reference descriptors with labels, ids, entity types, and media metadata.",
    }),
    confirmation: defaultConfirmation,
    checkpoint: noCheckpoint,
    artifactBehavior: noArtifacts,
  }),
  agentRuntimeTool({
    name: "text.generate",
    label: "Write Text",
    description: "Generate scripts, captions, outlines, shot lists, or other text artifacts from the conversation brief.",
    category: "generation",
    inputSchema: fieldsSchema("Text generation request.", {
      prompt: "Text writing request.",
      systemPrompt: "Optional writing instructions or role.",
      kind: "Optional output kind such as script, caption, outline, shot_list, or text_draft.",
      provider: "Optional provider override.",
      model: "Optional model override.",
      maxTokens: "Optional output token limit.",
      temperature: "Optional creativity setting.",
    }),
    outputSchema: fieldsSchema("Generated text artifact.", {
      artifactId: "Created text artifact id.",
      text: "Generated text.",
      costUsd: "Provider cost estimate when available.",
    }),
    checkpoint: {
      behavior: "after",
      defaultInDebugMode: true,
      label: "Review text",
      description: "Show generated scripts, captions, or outlines before downstream production steps.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["file"],
      intermediate: true,
    },
  }),
  agentRuntimeTool({
    name: "media.generateImage",
    label: "Create Images",
    description: "Generate one or more image artifacts from a prompt and optional references.",
    category: "generation",
    inputSchema: fieldsSchema("Image generation request.", {
      prompt: "Production prompt for the image model.",
      aspectRatio: "Optional output aspect ratio.",
      count: "Number of images to create.",
      references: "Optional reference image descriptors.",
      provider: "Optional provider override.",
      model: "Optional model override.",
    }),
    outputSchema: fieldsSchema("Generated image artifacts.", {
      artifactIds: "Created image artifact ids.",
      assets: "Storage URLs and titles for generated images.",
      costUsd: "Provider cost estimate when available.",
    }),
    checkpoint: {
      behavior: "after",
      defaultInDebugMode: true,
      label: "Review images",
      description: "Show generated images before downstream production steps.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["image"],
      intermediate: true,
    },
  }),
  agentRuntimeTool({
    name: "media.generateVideo",
    label: "Create Video",
    description: "Generate a video artifact from a prompt and optional image or video references.",
    category: "generation",
    inputSchema: fieldsSchema("Video generation request.", {
      prompt: "Production prompt for the video model.",
      aspectRatio: "Optional output aspect ratio.",
      durationSeconds: "Optional target duration.",
      references: "Optional image or video references.",
      priorImageOutputIndex: "Optional zero-based index of the prior ready image output to use as the image-to-video source.",
      provider: "Optional provider override.",
      model: "Optional model override.",
    }),
    outputSchema: fieldsSchema("Generated video artifact.", {
      artifactId: "Created video artifact id.",
      storageUrl: "Stored video URL.",
      title: "Generated artifact title.",
      costUsd: "Provider cost estimate when available.",
    }),
    checkpoint: {
      behavior: "after",
      defaultInDebugMode: true,
      label: "Review video",
      description: "Show generated video before assembly, save, or export.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["video"],
      intermediate: true,
    },
  }),
  agentRuntimeTool({
    name: "media.renderVideo",
    label: "AI Video Render",
    description: "Render or edit a video from a prompt plus optional image, video, or audio references using the provider-backed AI video renderer.",
    category: "generation",
    inputSchema: fieldsSchema("AI video render request.", {
      prompt: "Production or edit prompt for the video renderer.",
      mediaAssets: "Optional image, video, or audio reference assets.",
      references: "Optional library, persona, or artifact references.",
      systemPrompt: "Optional higher-level render instructions.",
      knowledgeBase: "Optional source analysis, brand, or creative context.",
      aspectRatio: "Optional output aspect ratio.",
      width: "Optional output width in pixels.",
      height: "Optional output height in pixels.",
      fps: "Optional output frames per second.",
      maxDurationSeconds: "Optional maximum output duration.",
      provider: "Optional provider override.",
      model: "Optional model override.",
    }),
    outputSchema: fieldsSchema("Rendered video artifact.", {
      artifactId: "Created video artifact id.",
      storageUrl: "Stored video URL.",
      jobId: "Provider render job id.",
      costUsd: "Provider cost estimate when available.",
    }),
    checkpoint: {
      behavior: "after",
      defaultInDebugMode: true,
      label: "Review AI render",
      description: "Show the AI-rendered video before assembly, save, or export.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["video"],
      intermediate: true,
    },
  }),
  agentRuntimeTool({
    name: "media.generateAudio",
    label: "Create Audio",
    description: "Generate voiceover, music, or sound audio from text and optional references.",
    category: "generation",
    inputSchema: fieldsSchema("Audio generation request.", {
      text: "Text, script, or sound direction.",
      mode: "Optional audio generation mode.",
      references: "Optional voice or audio references.",
      provider: "Optional provider override.",
      model: "Optional model override.",
    }),
    outputSchema: fieldsSchema("Generated audio artifact.", {
      artifactId: "Created audio artifact id.",
      storageUrl: "Stored audio URL.",
      title: "Generated artifact title.",
      costUsd: "Provider cost estimate when available.",
    }),
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["audio"],
      intermediate: true,
    },
  }),
  agentRuntimeTool({
    name: "media.lipsync",
    label: "Lip Sync Video",
    description: "Generate a lip-synced video from a source image or video plus spoken audio.",
    category: "generation",
    inputSchema: fieldsSchema("Lip sync generation request.", {
      prompt: "Production direction for the lip-synced performance.",
      resolution: "Optional provider resolution or quality setting.",
      references: "Source image/video and audio references.",
      provider: "Optional provider override.",
      model: "Optional model override.",
    }),
    outputSchema: fieldsSchema("Generated lip-synced video artifact.", {
      artifactId: "Created video artifact id.",
      storageUrl: "Stored video URL.",
      title: "Generated artifact title.",
      costUsd: "Provider cost estimate when available.",
    }),
    checkpoint: {
      behavior: "after",
      defaultInDebugMode: true,
      label: "Review lip sync",
      description: "Show the lip-synced video before assembly, save, or export.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["video"],
      intermediate: true,
    },
  }),
  agentRuntimeTool({
    name: "slideshow.render",
    label: "Render Slideshow",
    description: "Render a native slideshow plan into preview and publishable slideshow artifacts.",
    category: "slideshow",
    inputSchema: fieldsSchema("Slideshow render request.", {
      plan: "Canonical slideshow plan or plan artifact id.",
      aspectRatio: "Optional output aspect ratio.",
      references: "Optional image references for slide backgrounds.",
    }),
    outputSchema: fieldsSchema("Rendered slideshow artifacts.", {
      artifactIds: "Rendered slideshow or slide artifact ids.",
      previewUrls: "Preview image URLs for rendered slides.",
    }),
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["slideshow", "image"],
      intermediate: false,
    },
  }),
  agentRuntimeTool({
    name: "studio.compose",
    label: "Compose In Studio",
    description: "Create or update a Studio composition from generated image/video clips, audio tracks, and timed text overlays.",
    category: "studio",
    inputSchema: fieldsSchema("Studio composition request.", {
      timeline: "Composition timeline instructions or structured clip/text overlay records.",
      artifactIds: "Source media artifact ids.",
      aspectRatio: "Optional composition aspect ratio.",
      textOverlays: "Optional timed text overlays or captions to place on the video.",
    }),
    outputSchema: fieldsSchema("Studio project result.", {
      projectId: "Created or updated Studio project id.",
      artifactIds: "Optional emitted project artifact ids.",
      audioTrackCount: "Number of audio tracks added to the Studio project.",
      imageClipCount: "Number of static image clips added to the Studio project.",
      textOverlayCount: "Number of timed text overlays added to the Studio project.",
    }),
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["video", "file"],
      intermediate: true,
    },
  }),
  agentRuntimeTool({
    name: "studio.render",
    label: "Render Studio Video",
    description: "Create a Studio render request for the server render worker. If the worker is not configured, this reports that automatic chat rendering is unavailable instead of producing a final video.",
    category: "studio",
    inputSchema: fieldsSchema("Studio render request.", {
      projectId: "Studio project id.",
      renderSettings: "Optional render dimensions, fps, and quality settings.",
    }),
    outputSchema: fieldsSchema("Rendered video result.", {
      studioRenderRequestId: "Durable render request id.",
      outputArtifactId: "Rendered video artifact id after Studio export completes.",
      status: "Render request status.",
    }),
    checkpoint: {
      behavior: "before",
      defaultInDebugMode: true,
      label: "Request Studio render",
      description: "Create a render request and open Studio when browser export is needed.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["video"],
      intermediate: false,
    },
  }),
  agentRuntimeTool({
    name: "artifact.save",
    label: "Save To Library",
    description: "Save final or reusable artifacts into the library after review.",
    category: "library",
    inputSchema: fieldsSchema("Library save request.", {
      artifactIds: "Artifact ids to save.",
      title: "Optional saved asset title.",
      notes: "Optional library notes.",
    }),
    outputSchema: fieldsSchema("Saved library assets.", {
      libraryAssetIds: "Created or updated library asset ids.",
    }),
    confirmation: {
      required: false,
      risk: "low",
      reason: "Saving is reversible and keeps outputs internal.",
    },
    checkpoint: {
      behavior: "before",
      defaultInDebugMode: false,
      label: "Save output",
      description: "Confirm the final output is ready to keep.",
    },
    artifactBehavior: noArtifacts,
  }),
  agentRuntimeTool({
    name: "publishing.prepare",
    label: "Prepare Publishing Draft",
    description: "Create a manual draft distribution plan from reviewed ready media.",
    category: "publishing",
    inputSchema: fieldsSchema("Publishing draft request.", {
      artifactIds: "Ready media artifact ids to attach to the draft plan.",
      instructions: "Optional caption, destination, or scheduling guidance.",
    }),
    outputSchema: fieldsSchema("Distribution draft result.", {
      distributionPlanId: "Created draft distribution plan id.",
      artifactIds: "Media artifacts attached to the plan.",
    }),
    confirmation: {
      required: true,
      risk: "low",
      reason: "Preparing a draft stays internal, but publishing should remain explicit.",
    },
    checkpoint: {
      behavior: "before",
      defaultInDebugMode: true,
      label: "Prepare publish draft",
      description: "Review ready media before creating a publishing draft.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["post"],
      intermediate: false,
    },
  }),
  agentRuntimeTool({
    name: "workflow.createDraft",
    label: "Save As Workflow",
    description: "Convert a successful Create conversation tool history into an editable workflow draft when possible.",
    category: "workflow",
    inputSchema: fieldsSchema("Workflow draft request.", {
      createThreadId: "Create conversation id to convert.",
      name: "Optional workflow draft name.",
    }),
    outputSchema: fieldsSchema("Workflow draft result.", {
      workflowId: "Created workflow draft id.",
      convertedToolCount: "Number of Create tool calls represented in the draft.",
      unsupportedToolNames: "Tools preserved as comments because no reliable workflow node exists yet.",
    }),
    confirmation: {
      required: false,
      risk: "low",
      reason: "Workflow drafts are inactive until the user edits and enables them.",
    },
    checkpoint: {
      behavior: "before",
      defaultInDebugMode: false,
      label: "Save workflow draft",
      description: "Create an inactive editable workflow draft from this conversation.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["file"],
      intermediate: false,
    },
  }),
  agentRuntimeTool({
    name: "artifact.export",
    label: "Export Output",
    description: "Prepare final reviewed artifacts for download, handoff, or publishing.",
    category: "export",
    inputSchema: fieldsSchema("Export request.", {
      artifactIds: "Artifact ids to export.",
      destination: "Download, handoff, or publishing destination.",
      format: "Optional requested export format.",
    }),
    outputSchema: fieldsSchema("Export result.", {
      exportUrl: "Download or destination URL when available.",
      artifactIds: "Any new export artifact ids.",
    }),
    confirmation: {
      required: true,
      risk: "medium",
      reason: "Exports can move reviewed content outside the draft conversation.",
    },
    checkpoint: {
      behavior: "before",
      defaultInDebugMode: true,
      label: "Export output",
      description: "Review the final output before export.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["file", "post"],
      intermediate: false,
    },
  }),
] satisfies CreateToolDefinition[];

const registry = new Map<CreateToolName, CreateToolDefinition>(
  toolDefinitions.map((tool) => [tool.name, tool])
);

export function listCreateTools(): CreateToolDefinition[] {
  return [...toolDefinitions];
}

export function listCreateToolsForPlanner(): CreateToolPlannerDescriptor[] {
  return toolDefinitions.map(({ handler: _handler, ...descriptor }) => descriptor);
}

export function getCreateTool(name: CreateToolName): CreateToolDefinition | undefined {
  return registry.get(name);
}

export async function executeCreateTool<Output = unknown>(
  name: CreateToolName,
  input: unknown,
  context: CreateToolExecutionContext
): Promise<CreateToolExecutionResult<Output>> {
  const tool = getCreateTool(name);
  if (!tool) throw new CreateToolNotFoundError(name);
  if (tool.availability !== "available") {
    throw new CreateToolUnavailableError(name, "is not available yet");
  }
  if (tool.executionMode !== "direct" || !tool.handler) {
    throw new CreateToolUnavailableError(name, "is executed by the Create agent runtime");
  }

  const output = await tool.handler(context, input);
  const outputRecord = output && typeof output === "object"
    ? output as Record<string, unknown>
    : {};
  const artifactIds = Array.isArray(outputRecord.artifactIds)
    ? outputRecord.artifactIds as Id<"artifacts">[]
    : typeof outputRecord.artifactId === "string"
      ? [outputRecord.artifactId as Id<"artifacts">]
      : [];
  const costUsd = typeof outputRecord.costUsd === "number"
    ? outputRecord.costUsd
    : undefined;

  return {
    toolName: tool.name,
    label: tool.label,
    output: output as Output,
    artifactIds,
    costUsd,
    completedAt: (context.now ?? Date.now)(),
  };
}
