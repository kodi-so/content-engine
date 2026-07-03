import type { RequestedRenderingMode } from "../content/planningPrompts";
import { listCreateToolsForPlanner } from "./tools";
import type { CreateToolName, CreateToolPlannerDescriptor } from "./tools";

export type InferredOutputType = "image" | "video" | "audio" | "slideshow" | "analysis" | "text" | "unknown";

export type CreateReferenceMention = {
  token: string;
  label: string;
  entityType: "creative_asset" | "artifact" | "analysis" | "uploaded_reference";
  entityId: string;
  mediaType?: "image" | "video" | "audio" | "file";
  mimeType?: string;
  storageUrl?: string;
  instruction?: string;
};

export type PlannedToolInputArgs = {
  content: string;
  outputType: Exclude<InferredOutputType, "unknown">;
  referenceMentions?: CreateReferenceMention[];
  toolName: CreateToolName;
};

export const urlPattern = /\bhttps?:\/\/[^\s)]+/i;

const numberWords = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
]);

function parsedNumber(value: string | undefined) {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return numberWords.get(value.toLowerCase());
}

function inferredAspectRatio(content: string) {
  if (/\b(9:16|vertical|portrait|reel|short|shorts|tiktok|tik tok)\b/i.test(content)) return "9:16";
  if (/\b(16:9|landscape|youtube|wide|widescreen)\b/i.test(content)) return "16:9";
  if (/\b(4:5|feed post|instagram feed)\b/i.test(content)) return "4:5";
  if (/\b(1:1|square)\b/i.test(content)) return "1:1";
  return undefined;
}

function inferredImageCount(content: string) {
  const match = content.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(?:reference|product|character|vertical|horizontal|square|portrait|landscape|different|distinct|unique|new)){0,5}\s+(?:images?|photos?|pictures?|options?|variations?)\b/i
  );
  const count = parsedNumber(match?.[1]);
  return count && count > 0 ? Math.min(4, Math.floor(count)) : undefined;
}

function inferredDurationSeconds(content: string) {
  const match = content.match(/\b(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i);
  const duration = parsedNumber(match?.[1]);
  return duration && duration > 0 ? duration : undefined;
}

function finitePositiveNumberFromInput(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function inferredAudioMode(content: string) {
  if (/\b(voiceover|voice over|narration|narrator|spoken|dialogue|dialog)\b/i.test(content)) {
    return "voiceover";
  }
  if (/\b(music|song|soundtrack|beat|instrumental)\b/i.test(content)) return "music";
  if (/\b(sound effects?|sfx|ambient|ambience)\b/i.test(content)) return "sound_effects";
  return undefined;
}

function inferredProvider(content: string) {
  const match = content.match(/\b(?:provider|using|use)\s+(fal|gemini|bulkapis|openrouter|manual)\b/i);
  return match?.[1]?.toLowerCase();
}

function inferredModel(content: string) {
  const match = content.match(/\bmodel\s+([a-z0-9][a-z0-9._:/-]{1,80})\b/i);
  return match?.[1];
}

function inferredResolution(content: string) {
  const match = content.match(/\b(720p|1080p|1440p|2160p|4k)\b/i);
  return match?.[1]?.toLowerCase();
}

function inferredTextKind(content: string) {
  if (/\b(script|screenplay|dialogue|dialog)\b/i.test(content)) return "script";
  if (/\b(caption|captions|post copy|social copy)\b/i.test(content)) return "caption";
  if (/\b(shot list|shots)\b/i.test(content)) return "shot_list";
  if (/\b(scene list|storyline|story line|outline|treatment)\b/i.test(content)) return "outline";
  return "text_draft";
}

export function explicitSlideshowRenderingMode(value: unknown): RequestedRenderingMode | undefined {
  if (value === "background_plus_overlay" || value === "editable_text" || value === "editable") {
    return "background_plus_overlay";
  }
  if (value === "full_graphic_generation" || value === "designed_slides" || value === "designed") {
    return "full_graphic_generation";
  }
  return undefined;
}

function analyzeSourceInput(args: PlannedToolInputArgs) {
  const sourceUrl = firstUrl(args.content);
  const firstReference = args.referenceMentions?.[0];
  if (sourceUrl) {
    return {
      sourceType: "url",
      source: sourceUrl,
      instructions: args.content,
      inferredOutputType: args.outputType,
    };
  }

  if (firstReference) {
    if (firstReference.entityType === "uploaded_reference") {
      return {
        sourceType: "url",
        source: firstReference.storageUrl ?? firstReference.entityId,
        instructions: args.content,
        inferredOutputType: args.outputType,
      };
    }

    return {
      sourceType: firstReference.entityType === "artifact" ? "artifact" : "library_asset",
      source: firstReference.entityId,
      instructions: args.content,
      inferredOutputType: args.outputType,
    };
  }

  return {
    brief: args.content,
    inferredOutputType: args.outputType,
    referenceMentions: args.referenceMentions ?? [],
  };
}

function referenceMediaTypesForOutput(outputType: Exclude<InferredOutputType, "unknown">) {
  if (outputType === "image") return ["image"];
  if (outputType === "video" || outputType === "slideshow") return ["image", "video"];
  if (outputType === "audio") return ["audio"];
  return undefined;
}

function baseCreationInput(args: PlannedToolInputArgs) {
  const aspectRatio = inferredAspectRatio(args.content);
  const provider = inferredProvider(args.content);
  const model = inferredModel(args.content);
  return {
    brief: args.content,
    inferredOutputType: args.outputType,
    referenceMentions: args.referenceMentions ?? [],
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}

export function buildPlannedToolInput(args: PlannedToolInputArgs): Record<string, unknown> {
  if (args.toolName === "analyze.source") return analyzeSourceInput(args);

  if (args.toolName === "references.list") {
    return {
      query: args.content,
      mediaTypes: referenceMediaTypesForOutput(args.outputType),
      limit: 8,
      inferredOutputType: args.outputType,
    };
  }

  const baseInput = baseCreationInput(args);

  if (args.toolName === "media.generateImage") {
    const count = inferredImageCount(args.content);
    return {
      ...baseInput,
      prompt: args.content,
      ...(count ? { count } : {}),
    };
  }

  if (args.toolName === "text.generate") {
    return {
      ...baseInput,
      prompt: args.content,
      kind: inferredTextKind(args.content),
    };
  }

  if (args.toolName === "media.generateVideo") {
    const durationSeconds = inferredDurationSeconds(args.content);
    return {
      ...baseInput,
      prompt: args.content,
      ...(durationSeconds ? { durationSeconds } : {}),
    };
  }

  if (args.toolName === "media.renderVideo") {
    const durationSeconds = inferredDurationSeconds(args.content);
    return {
      ...baseInput,
      prompt: args.content,
      ...(durationSeconds ? { maxDurationSeconds: durationSeconds } : {}),
    };
  }

  if (args.toolName === "media.generateAudio") {
    const mode = inferredAudioMode(args.content);
    return {
      ...baseInput,
      text: args.content,
      ...(mode ? { mode } : {}),
    };
  }

  if (args.toolName === "media.lipsync") {
    const resolution = inferredResolution(args.content);
    return {
      ...baseInput,
      prompt: args.content,
      ...(resolution ? { resolution } : {}),
    };
  }

  if (args.toolName === "slideshow.render") {
    return {
      ...baseInput,
      plan: args.content,
      requestedRenderingMode: "background_plus_overlay",
    };
  }

  if (args.toolName === "studio.compose") {
    return {
      ...baseInput,
      timeline: args.content,
    };
  }

  if (args.toolName === "publishing.prepare") {
    return {
      ...baseInput,
      instructions: args.content,
    };
  }

  if (args.toolName === "artifact.export") {
    return {
      ...baseInput,
      destination: "download",
    };
  }

  return baseInput;
}

export function normalizePlannedToolInputForToolCall(args: {
  input: Record<string, unknown>;
  planStep?: string;
  prompt?: string;
  siblingToolNames: CreateToolName[];
  toolName: CreateToolName;
}): Record<string, unknown> {
  const input = { ...args.input };

  if (args.toolName === "media.generateImage") {
    const count = finitePositiveNumberFromInput(input.count);
    if (input.count !== undefined && !count) {
      delete input.count;
    }

    void args.planStep;
    void args.prompt;
    void args.siblingToolNames;
  }

  return input;
}

export function firstUrl(content: string) {
  return content.match(urlPattern)?.[0];
}

export function threadTitleFromMessage(message: string) {
  const cleanMessage = message.trim().replace(/\s+/g, " ");
  if (!cleanMessage) return "New Chat";
  return cleanMessage.length > 54 ? `${cleanMessage.slice(0, 54)}...` : cleanMessage;
}

export function toolDescriptorMap() {
  return new Map<CreateToolName, CreateToolPlannerDescriptor>(
    listCreateToolsForPlanner().map((tool) => [tool.name, tool])
  );
}

export function buildEffectiveBrief(args: {
  content: string;
  currentMentions?: CreateReferenceMention[];
}) {
  return {
    content: args.content,
    referenceMentions: args.currentMentions,
  };
}
