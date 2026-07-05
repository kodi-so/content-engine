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

function finitePositiveNumberFromInput(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
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

function baseEnrichedInput(args: PlannedToolInputArgs) {
  return {
    brief: args.content,
    inferredOutputType: args.outputType,
    referenceMentions: args.referenceMentions ?? [],
  };
}

export function enrichPlannedToolInput(args: PlannedToolInputArgs): Record<string, unknown> {
  if (args.toolName === "analyze.source") {
    return {
      instructions: args.content,
      inferredOutputType: args.outputType,
      referenceMentions: args.referenceMentions ?? [],
    };
  }

  return baseEnrichedInput(args);
}

export function hasExplicitPriorOutputSelection(input?: Record<string, unknown>) {
  if (!input) return false;
  return Array.isArray(input.priorImageOutputIndexes) ||
    typeof input.priorImageOutputIndex === "number" ||
    input.usePriorImageOutputs === true ||
    input.usePriorVideoOutputs === true ||
    input.usePriorAudioOutputs === true;
}

export function referenceMentionsForPlannedToolInput(args: {
  currentReferenceMentions?: CreateReferenceMention[];
  plannedInput?: Record<string, unknown>;
  threadReferenceMentions?: CreateReferenceMention[];
}) {
  return hasExplicitPriorOutputSelection(args.plannedInput)
    ? args.currentReferenceMentions ?? []
    : args.threadReferenceMentions ?? [];
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
