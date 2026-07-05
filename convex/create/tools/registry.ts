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

type JsonSchema = Record<string, unknown>;

const stringSchema = (description: string, values?: string[]): JsonSchema => ({
  type: "string",
  description,
  ...(values ? { enum: values } : {}),
});

const numberSchema = (description: string): JsonSchema => ({
  type: "number",
  description,
});

const booleanSchema = (description: string): JsonSchema => ({
  type: "boolean",
  description,
});

const stringArraySchema = (description: string): JsonSchema => ({
  type: "array",
  description,
  items: { type: "string" },
});

const numberArraySchema = (description: string): JsonSchema => ({
  type: "array",
  description,
  items: { type: "number" },
});

const objectArraySchema = (description: string): JsonSchema => ({
  type: "array",
  description,
  items: {
    type: "object",
    additionalProperties: true,
  },
});

const looseObjectSchema = (description: string): JsonSchema => ({
  type: "object",
  description,
  additionalProperties: true,
});

const jsonSchema = (
  description: string,
  properties: Record<string, JsonSchema>,
  required: string[] = []
): CreateToolSchema => ({
  kind: "json_schema",
  schema: {
    type: "object",
    description,
    additionalProperties: false,
    required,
    properties,
  },
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
    description: "Analyze an uploaded file, media asset, or URL for source-grounded creative understanding, including videos and social slideshows.",
    plannerGuidance: [
      "When the user supplies a URL and asks to understand, study, analyze, use as inspiration, or adapt it, call analyze.source first. Treat its reference brief as the primary source context for later answers and generation.",
      "source must be a public http(s) URL exactly as provided by the user, or the url: value shown for a referenced asset. Never pass entityType:entityId reference tokens as source.",
      "Answer conversational questions about attached images/media directly in chat. Use analyze.source only for deep creative analysis of external URLs/videos/slideshows or when the user explicitly asks for a full breakdown.",
    ],
    category: "analysis",
    inputSchema: jsonSchema("Source to analyze.", {
      sourceType: stringSchema("Source kind to analyze.", ["url", "file", "artifact", "library_asset"]),
      source: stringSchema("Public http(s) URL, stored file URL, artifact id, or library asset id to analyze. Do not pass entityType:entityId reference tokens."),
      instructions: stringSchema("Optional analysis guidance from the user or planner."),
    }),
    outputSchema: fieldsSchema("Structured source analysis.", {
      summary: "Human-readable analysis summary.",
      referenceBrief: "Compact reusable understanding for Agent context and follow-up questions.",
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
    description: "List reusable library assets and artifacts for planner context.",
    category: "references",
    inputSchema: jsonSchema("Reference search filters.", {
      query: stringSchema("Optional semantic or text filter."),
      mediaTypes: stringArraySchema("Optional media type filters such as image, video, audio, slideshow, or file."),
      limit: numberSchema("Maximum number of references to return."),
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
    inputSchema: jsonSchema("Text generation request.", {
      prompt: stringSchema("Text writing request."),
      systemPrompt: stringSchema("Optional writing instructions or role."),
      kind: stringSchema("Optional output kind such as script, caption, outline, shot_list, or text_draft."),
      provider: stringSchema("Optional provider override."),
      model: stringSchema("Optional model override."),
      maxTokens: numberSchema("Optional output token limit."),
      temperature: numberSchema("Optional creativity setting."),
    }),
    outputSchema: fieldsSchema("Generated text artifact.", {
      artifactId: "Created text artifact id.",
      text: "Generated text.",
      costUsd: "Provider cost estimate when available.",
    }),
    checkpoint: {
      behavior: "none",
      defaultInDebugMode: false,
      label: "Review text",
      description: "Generated scripts, captions, and outlines are shown in the work log without pausing the agent loop.",
    },
    artifactBehavior: {
      emitsArtifacts: true,
      artifactTypes: ["file"],
      intermediate: true,
    },
  }),
  agentRuntimeTool({
    name: "mediaOverlay.updateText",
    label: "Update Media Text",
    description: "Add, remove, replace, or update editable text overlays on the current slideshow or Studio video project. Use this for follow-up chat edits to slide text, video captions, titles, subtitles, lower thirds, CTA text, position, size, color, or style. The model should decide the intended edits from the conversation and pass concrete text overlay operations; the runtime only applies those operations to the existing media object.",
    plannerGuidance: [
      "When the user asks to edit text on an existing generated slideshow, Studio video project, or current media artifact, use mediaOverlay.updateText with concrete overlay add/update/remove/replace operations. Do not regenerate the whole media artifact unless the user asks for new visuals or a full remake.",
    ],
    category: "media",
    inputSchema: jsonSchema("Media text overlay edit request.", {
      targetKind: stringSchema("Optional target kind; use auto for the latest editable media in the thread.", ["slideshow", "video_project", "auto"]),
      targetId: stringSchema("Optional slideshow id or Studio video project id. Use when the user references a specific artifact."),
      slideId: stringSchema("Optional slideshow slide id to edit."),
      slideIndex: numberSchema("Optional 1-based slideshow slide number to edit."),
      replaceTextBlocks: objectArraySchema("Optional full replacement array of editable text overlay blocks for the target slide or video."),
      addTextBlocks: objectArraySchema("Optional text overlay blocks to add."),
      updateTextBlocks: objectArraySchema("Optional objects with id and patch fields for existing text overlays."),
      textBlockPatch: looseObjectSchema("Optional patch to apply to all text overlays on the target slide or video when specific text block ids are not needed."),
      adjustTextBlocks: looseObjectSchema("Optional relative adjustment for target text overlays. Use negative deltaY to move text upward, positive deltaY to move down, deltaX for horizontal movement, deltaFontSize or fontSizeMultiplier for size changes."),
      removeTextBlockIds: stringArraySchema("Optional text overlay ids to remove."),
      instruction: stringSchema("Short natural-language summary of the user's edit request."),
    }),
    outputSchema: fieldsSchema("Updated media text overlays.", {
      targetKind: "Updated media type.",
      targetId: "Updated slideshow or Studio video project id.",
      slideId: "Updated slide id when editing a slideshow.",
      textOverlayCount: "Number of editable text overlays after the update.",
    }),
    checkpoint: {
      behavior: "none",
      defaultInDebugMode: false,
      label: "Update text overlays",
      description: "Text overlay edits update the existing media object directly.",
    },
    artifactBehavior: {
      emitsArtifacts: false,
    },
  }),
  agentRuntimeTool({
    name: "media.generateImage",
    label: "Create Images",
    description: "Generate one or more image artifacts from a prompt and optional references.",
    plannerGuidance: [
      "When the requested artifact includes text, decide semantically where that text belongs: use Studio composition for video overlays/captions/lower thirds, slideshow tools for slide text, and image generation only when the artifact itself is a text-bearing graphic such as a poster, flyer, infographic, meme, title card, thumbnail, ad graphic, packaging, or specifically requested visible words.",
      "Do not add text, labels, captions, or UI-like annotations to ordinary photo/image assets or video clips unless the user's requested artifact calls for rendered text.",
    ],
    category: "generation",
    inputSchema: jsonSchema("Image generation request.", {
      prompt: stringSchema("Production prompt for the image model."),
      brief: stringSchema("Optional effective brief; defaults to prompt when omitted."),
      aspectRatio: stringSchema("Optional output aspect ratio. Common values include 1:1, 4:5, 9:16, and 16:9."),
      count: numberSchema("Number of image variations to create; use only for variations/options of the same prompt."),
      references: objectArraySchema("Optional reference image descriptors."),
      priorImageOutputIndexes: numberArraySchema("Zero-based indexes into Image # ledger entries; use to edit, revise, or vary specific prior generated images. The runtime attaches exactly these prior images in order."),
      priorImageOutputIndex: numberSchema("Zero-based index into Image # ledger entries; convenience field for editing, revising, or varying one specific prior generated image."),
      usePriorImageOutputs: booleanSchema("When true, use ALL prior generated images in this thread as continuity or style references. Prefer priorImageOutputIndexes when targeting specific images."),
      provider: stringSchema("Optional provider override."),
      model: stringSchema("Optional model override."),
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
    plannerGuidance: [
      "For image-to-video, default to Kling through fal unless the user explicitly asks for another video model. Use model=\"fal-ai/kling-video/v3/pro/image-to-video\" when animating image references and model=\"fal-ai/kling-video/v3/pro/text-to-video\" for prompt-only video.",
    ],
    category: "generation",
    inputSchema: jsonSchema("Video generation request.", {
      prompt: stringSchema("Production prompt for the video model."),
      brief: stringSchema("Optional effective brief; defaults to prompt when omitted."),
      aspectRatio: stringSchema("Optional output aspect ratio. Common values include 1:1, 4:5, 9:16, and 16:9."),
      durationSeconds: numberSchema("Optional target duration in seconds."),
      references: objectArraySchema("Optional image or video reference descriptors."),
      priorImageOutputIndexes: numberArraySchema("Zero-based indexes into Image # ledger entries; use when this call must animate or extend specific earlier images. The runtime attaches exactly these prior images in order."),
      priorImageOutputIndex: numberSchema("Zero-based index into Image # ledger entries; convenience field for animating or extending one specific prior image."),
      usePriorImageOutputs: booleanSchema("When true, use ALL prior generated images as continuity/style references. Prefer priorImageOutputIndexes when targeting specific images."),
      usePriorVideoOutputs: booleanSchema("When true, use ALL prior generated videos as continuity/style references."),
      provider: stringSchema("Optional provider override."),
      model: stringSchema("Optional model override."),
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
    inputSchema: jsonSchema("AI video render request.", {
      prompt: stringSchema("Production or edit prompt for the video renderer."),
      brief: stringSchema("Optional effective brief; defaults to prompt when omitted."),
      mediaAssets: objectArraySchema("Optional image, video, or audio reference assets."),
      references: objectArraySchema("Optional library or artifact references."),
      systemPrompt: stringSchema("Optional higher-level render instructions."),
      knowledgeBase: stringSchema("Optional source analysis or creative context."),
      aspectRatio: stringSchema("Optional output aspect ratio. Common values include 1:1, 4:5, 9:16, and 16:9."),
      width: numberSchema("Optional output width in pixels."),
      height: numberSchema("Optional output height in pixels."),
      fps: numberSchema("Optional output frames per second."),
      maxDurationSeconds: numberSchema("Optional maximum output duration."),
      durationSeconds: numberSchema("Optional target duration in seconds; used when maxDurationSeconds is omitted."),
      provider: stringSchema("Optional provider override."),
      model: stringSchema("Optional model override."),
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
    inputSchema: jsonSchema("Audio generation request.", {
      text: stringSchema("Text, script, or sound direction."),
      prompt: stringSchema("Optional audio prompt; use text for spoken/script content when possible."),
      brief: stringSchema("Optional effective brief; defaults to text or prompt when omitted."),
      mode: stringSchema("Optional audio generation mode such as voiceover, music, or sound_effect."),
      references: objectArraySchema("Optional voice or audio references."),
      usePriorAudioOutputs: booleanSchema("When true, use ALL prior generated audio artifacts as continuity/style references."),
      provider: stringSchema("Optional provider override."),
      model: stringSchema("Optional model override."),
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
    inputSchema: jsonSchema("Lip sync generation request.", {
      prompt: stringSchema("Production direction for the lip-synced performance."),
      brief: stringSchema("Optional effective brief; defaults to prompt when omitted."),
      resolution: stringSchema("Optional provider resolution or quality setting."),
      references: objectArraySchema("Source image/video and audio references."),
      provider: stringSchema("Optional provider override."),
      model: stringSchema("Optional model override."),
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
    plannerGuidance: [
      "For slideshow requests, always use exactly one slideshow.render tool call. Do not decompose slideshow creation into separate media.generateImage calls for individual slides. The native slideshow pipeline plans slides, generates slide visuals, creates editable text blocks when appropriate, and assembles the slideshow artifact.",
      "For slideshow.render, default to editable text overlays. Set input.requestedRenderingMode=\"full_graphic_generation\" only when the user asks for fully designed/finished graphic slides, poster-style slides, text baked into the artwork, or similar. Otherwise use input.requestedRenderingMode=\"background_plus_overlay\".",
    ],
    category: "slideshow",
    inputSchema: jsonSchema("Slideshow render request.", {
      brief: stringSchema("Concise effective brief for the full slideshow."),
      plan: stringSchema("Canonical slideshow plan, planning instructions, or plan artifact id."),
      aspectRatio: stringSchema("Optional output aspect ratio. Common values include 9:16, 4:5, and 1:1."),
      references: objectArraySchema("Optional image references for slide backgrounds."),
      providerInput: looseObjectSchema("Optional native slideshow provider input."),
      requestedRenderingMode: stringSchema("Slideshow style: background_plus_overlay for editable text, or full_graphic_generation for finished designed slides.", [
        "background_plus_overlay",
        "full_graphic_generation",
      ]),
      renderingMode: stringSchema("Alternate rendering mode key; prefer requestedRenderingMode.", [
        "background_plus_overlay",
        "full_graphic_generation",
      ]),
      slideshowStyle: stringSchema("Alternate slideshow style key; prefer requestedRenderingMode.", [
        "background_plus_overlay",
        "full_graphic_generation",
      ]),
    }),
    outputSchema: fieldsSchema("Rendered slideshow artifacts.", {
      artifactIds: "Rendered slideshow or slide artifact ids.",
      previewUrls: "Preview image URLs for rendered slides.",
    }),
    checkpoint: noCheckpoint,
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
    plannerGuidance: [
      "For multi-clip final videos, call studio.compose after generating or selecting the clips. If the user asks to create a finished video rather than only a Studio draft, call studio.render after studio.compose.",
    ],
    category: "studio",
    inputSchema: jsonSchema("Studio composition request.", {
      timeline: stringSchema("Composition timeline instructions or structured clip/text overlay records."),
      brief: stringSchema("Optional composition brief; used for quoted overlay text extraction."),
      artifactIds: stringArraySchema("Source media artifact ids."),
      aspectRatio: stringSchema("Optional composition aspect ratio. Common values include 1:1, 4:5, 9:16, and 16:9."),
      textOverlays: objectArraySchema("Optional timed text overlays or captions to place on the video."),
      overlays: objectArraySchema("Optional timed overlay records; prefer textOverlays."),
      captions: objectArraySchema("Optional caption records; prefer textOverlays."),
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
    inputSchema: jsonSchema("Studio render request.", {
      projectId: stringSchema("Studio project id. Omit to render the latest Studio project in the thread."),
      renderSettings: looseObjectSchema("Optional render dimensions, fps, quality, and format settings."),
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
    inputSchema: jsonSchema("Library save request.", {
      artifactIds: stringArraySchema("Artifact ids to save."),
      title: stringSchema("Optional saved asset title."),
      notes: stringSchema("Optional library notes."),
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
    inputSchema: jsonSchema("Publishing draft request.", {
      artifactIds: stringArraySchema("Ready media artifact ids to attach to the draft plan."),
      instructions: stringSchema("Optional caption, destination, or scheduling guidance."),
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
    inputSchema: jsonSchema("Workflow draft request.", {
      createThreadId: stringSchema("Create conversation id to convert. Usually omit so the runtime converts the current thread."),
      name: stringSchema("Optional workflow draft name."),
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
    inputSchema: jsonSchema("Export request.", {
      artifactIds: stringArraySchema("Artifact ids to export."),
      destination: stringSchema("Download, handoff, or publishing destination."),
      format: stringSchema("Optional requested export format."),
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
