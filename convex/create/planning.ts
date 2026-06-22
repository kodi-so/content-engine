import type { Doc } from "../_generated/dataModel";
import { listCreateToolsForPlanner } from "./tools";
import type { CreateToolName, CreateToolPlannerDescriptor } from "./tools";

export type InferredOutputType = "image" | "video" | "audio" | "slideshow" | "analysis" | "text" | "unknown";

export type CreateReferenceMention = {
  token: string;
  label: string;
  entityType: "creative_asset" | "persona" | "artifact" | "analysis";
  entityId: string;
  mediaType?: "image" | "video" | "audio" | "file";
  instruction?: string;
};

export type PlannedToolInputArgs = {
  content: string;
  outputType: Exclude<InferredOutputType, "unknown">;
  referenceMentions?: CreateReferenceMention[];
  toolName: CreateToolName;
};

export const urlPattern = /\bhttps?:\/\/[^\s)]+/i;

const creationFollowUpPattern = /\b(go ahead|proceed|start|run it|do it|create it|make it|generate it|render it|render this|render that|compose it|compose this|compose that|stitch it|stitch this|stitch that|assemble it|assemble this|assemble that|build it|create that|make that|generate that|render that|build that|revise it|revise that|revise this|change it|change that|change this|redo it|redo that|redo this|edit it|edit that|edit this|edit the current one|save it|save this|save that|save as workflow|turn this into a workflow|make this a workflow|export it|export this|export that|download it|download this|publish it|publish this|looks good)\b/i;

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

function isBeforeAfterTransformation(content: string) {
  return /\b(before\s+and\s+after|before\/after|transformation|six\s+months\s+later|after\s+\d+\s+months?|fitness\s+journey)\b/i.test(content);
}

function inferredReferenceImageCount(content: string, outputType: Exclude<InferredOutputType, "unknown">) {
  const explicitCount = inferredImageCount(content);
  if (explicitCount) return explicitCount;
  if (outputType === "video" && isBeforeAfterTransformation(content)) return 2;
  return undefined;
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

function isVariationRequest(content: string) {
  return /\b(options?|variations?|alternatives?|versions?|takes?|choices?)\b/i.test(content);
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

  if (firstReference && firstReference.entityType !== "persona") {
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

function imagePromptForTool(content: string, outputType: Exclude<InferredOutputType, "unknown">) {
  if (outputType === "video" || outputType === "slideshow") {
    if (isBeforeAfterTransformation(content)) {
      return [
        "Create safe vertical reference stills for a before-and-after fitness journey video.",
        "Use the same fully clothed adult woman in both moments, photographed respectfully in athletic or casual workout clothing.",
        "Image 1 should show the early fitness journey moment; image 2 should show the later progress moment, stronger and more confident.",
        "Each output image must be a separate standalone photo of one moment only.",
        "Do not create a side-by-side before/after comparison, split screen, diptych, collage, infographic, captions, labels, or text overlays inside any image.",
        "Keep the result non-sexual, non-medical, body-positive, realistic, and suitable for TikTok/Reels. Do not create a video or audio.",
        `Original video brief: ${content}`,
      ].join(" ");
    }

    return [
      "Create production-ready visual reference stills for a short social video.",
      "Focus on the key characters, setting, and visual style that downstream video tools can use as references.",
      "Do not create a video, audio, captions, text overlays, collage, or infographic.",
      `Original video brief: ${content}`,
    ].join(" ");
  }

  if (isBeforeAfterTransformation(content) && (inferredImageCount(content) ?? 0) > 1) {
    return [
      "Create multiple separate standalone photos for a before-and-after fitness transformation.",
      "Image 1 must show only the before moment: a fully clothed adult woman at the start of her fitness journey in the requested setting.",
      "Image 2 must show only the after moment: the same woman later, stronger and more confident, in the same requested setting and style.",
      "Do not combine before and after into a single image. Do not create a side-by-side comparison, split screen, diptych, collage, labels, captions, month/day text, or text overlays inside any image.",
      "Preserve visual continuity across the images while keeping each image as its own normal photo.",
      `Original image brief: ${content}`,
    ].join(" ");
  }

  return content;
}

function videoPromptForTool(content: string) {
  if (isBeforeAfterTransformation(content)) {
    return [
      content,
      "Keep the subject fully clothed, respectful, non-sexual, body-positive, and focused on confidence and fitness progress rather than body shaming or medical claims.",
      "Use any available generated reference stills for visual consistency.",
    ].join(" ");
  }

  return content;
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
    const count = inferredReferenceImageCount(args.content, args.outputType);
    return {
      ...baseInput,
      prompt: imagePromptForTool(args.content, args.outputType),
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
      prompt: videoPromptForTool(args.content),
      ...(durationSeconds ? { durationSeconds } : {}),
    };
  }

  if (args.toolName === "media.renderVideo") {
    const durationSeconds = inferredDurationSeconds(args.content);
    return {
      ...baseInput,
      prompt: videoPromptForTool(args.content),
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

    const imageToolCallCount = args.siblingToolNames.filter((name) => name === "media.generateImage").length;
    const callText = [args.planStep, args.prompt].filter(Boolean).join(" ");
    if (imageToolCallCount > 1 && count && count > 1 && !isVariationRequest(callText)) {
      delete input.count;
    }
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

function isLowInformationCreationFollowUp(content: string) {
  const normalized = content.trim();
  if (!normalized) return false;
  if (creationFollowUpPattern.test(normalized)) return true;

  return (
    normalized.length <= 80 &&
    /\b(yes|yep|yeah|ok|okay|sure)\b/i.test(normalized) &&
    /\b(video|slideshow|slide show|image|images|audio|voiceover|reel|tiktok|tik tok)\b/i.test(normalized)
  );
}

function isUsefulPriorBriefMessage(message: Doc<"createMessages">) {
  const content = message.content.trim();
  if (message.role !== "user" || !content) return false;
  if (isLowInformationCreationFollowUp(content)) return false;
  return content.length > 12 || urlPattern.test(content);
}

function referenceMentionKey(reference: CreateReferenceMention) {
  return `${reference.entityType}:${reference.entityId}:${reference.token}`;
}

function mergeReferenceMentions(
  previousMessages: Doc<"createMessages">[],
  currentMentions?: CreateReferenceMention[]
) {
  const merged = new Map<string, CreateReferenceMention>();
  for (const message of previousMessages) {
    for (const reference of message.referenceMentions ?? []) {
      merged.set(referenceMentionKey(reference), reference);
    }
  }
  for (const reference of currentMentions ?? []) {
    merged.set(referenceMentionKey(reference), reference);
  }

  return [...merged.values()];
}

export function buildEffectiveBrief(args: {
  content: string;
  currentMentions?: CreateReferenceMention[];
  previousMessages: Doc<"createMessages">[];
  thread: Doc<"createThreads">;
}) {
  const isClarificationReply =
    args.thread.status === "clarifying" &&
    args.content.trim().length <= 120;
  const shouldUseContext =
    isClarificationReply || isLowInformationCreationFollowUp(args.content);

  if (!shouldUseContext) {
    return {
      content: args.content,
      forceCreation: false,
      referenceMentions: args.currentMentions,
      usedConversationContext: false,
    };
  }

  const priorBriefs = args.previousMessages
    .filter(isUsefulPriorBriefMessage)
    .map((message) => message.content.trim())
    .slice(-4);

  if (!priorBriefs.length) {
    return {
      content: args.content,
      forceCreation: false,
      referenceMentions: args.currentMentions,
      usedConversationContext: false,
    };
  }

  return {
    content: `${priorBriefs.join("\n")}\n\nLatest instruction: ${args.content}`,
    forceCreation: true,
    referenceMentions: mergeReferenceMentions(args.previousMessages, args.currentMentions),
    usedConversationContext: true,
  };
}
