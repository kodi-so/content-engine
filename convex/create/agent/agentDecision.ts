import type { Doc } from "../../_generated/dataModel";
import type { ModelMessage } from "../../providers/model";
import {
  explicitSlideshowRenderingMode,
  toolDescriptorMap,
  type CreateReferenceMention,
  type InferredOutputType,
} from "../planning";
import type { CreateToolName } from "../tools";

export type CreatePlannedToolCall = {
  input?: Record<string, unknown>;
  planStep?: string;
  prompt?: string;
  toolName: CreateToolName;
};

export type CreateDecisionIntent = {
  brief: string;
  kind: "create";
  outputType: Exclude<InferredOutputType, "unknown">;
  planSteps: string[];
  productionPlan?: Record<string, unknown>;
  summary: string;
  toolCalls: CreatePlannedToolCall[];
};

export type CreateMessageForModel = Doc<"createMessages"> & {
  generatedTextContext?: string;
};

export type AgentDecision =
  | {
      kind: "chat";
      response: string;
    }
  | {
      kind: "clarify";
      response: string;
    }
  | CreateDecisionIntent;

const outputTypes = ["image", "video", "audio", "slideshow", "analysis", "text"] as const;
const MAX_AGENT_TOOL_CALLS_PER_DECISION = 20;
const MAX_AGENT_PLAN_STEPS = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createProductionPlanningPolicy() {
  return [
    "Before selecting tools for a create request, make a concise production plan. Think in terms of: final artifact, source/reference roles, atomic assets, shots/clips/scenes, assembly, render/export.",
    "Return that plan as productionPlan in the JSON. Keep it brief and structured; do not include hidden reasoning, full scripts, long prose, or duplicated prompt text.",
    "You are allowed to work iteratively. After any tool result appears in the conversation, decide the next best action from that actual result. If the request is already satisfied, choose kind=\"chat\" and summarize completion instead of calling another tool.",
    "Keep planSteps short and keep each tool prompt focused on what that one tool needs. If detailed scripts, dialogue, shot lists, captions, or narration are useful before media planning, call text.generate for that artifact instead of expanding those details inside the planner JSON.",
    "If downstream media prompts depend on unknown output from an earlier tool, return only the dependency tool call(s) for now. Do not invent dependent media calls in the same response; use the tool result from conversation context to decide the next tool calls.",
    "When the user supplies a URL and asks to understand, study, analyze, use as inspiration, or adapt it, call analyze.source first. Treat its reference brief as the primary source context for later answers and generation.",
    "If the user already supplied enough concrete beats or states for the media output, you may plan the full media route immediately without a preliminary text.generate step.",
    "Map each semantic production unit to the smallest appropriate tool call. Image tools create individual images/assets. Video tools create one coherent shot or clip. Studio tools sequence, stitch, overlay, transition, and render multi-part videos.",
    "If the user asks for multiple distinct assets, scenes, options, states, products, moments, or story beats, create separate toolCalls with distinct prompts instead of one call with count or one broad prompt.",
    "If multiple references represent different states or moments in the final output, do not pass them all as generic references to a single generation. Use them as separate source units, generate separate clips/assets as needed, then assemble.",
    "If a final video requires the same generated person, character, product, room, or object across multiple states/moments and the user has not supplied concrete visual references for those states, first create image reference stills for each state/moment. Then animate those stills with image-to-video clips.",
    "Do not use text-to-video as the first production step for newly imagined continuity-sensitive subjects. Use text-to-video only for standalone shots where identity/object continuity across generated outputs does not matter, or when the user explicitly asks for prompt-only video.",
    "Use one video generation call only when the desired output is one coherent shot, a deliberate blend/morph/interpolation, or the user explicitly asks for a single model-generated transition.",
    "Video generation prompts should describe the action, motion, performance, camera movement, and atmosphere of that exact shot or clip. They should not summarize the whole final edited video.",
    "Each tool call prompt must be written from the perspective of the tool receiving it. Include only the information that tool can act on directly through its prompt and inputs.",
    "For slideshow requests, always use exactly one slideshow.render tool call. Do not decompose slideshow creation into separate media.generateImage calls for individual slides. The native slideshow pipeline plans slides, generates slide visuals, creates editable text blocks when appropriate, and assembles the slideshow artifact.",
    "For slideshow.render, default to editable text overlays. Set input.requestedRenderingMode=\"full_graphic_generation\" only when the user asks for fully designed/finished graphic slides, poster-style slides, text baked into the artwork, or similar. Otherwise use input.requestedRenderingMode=\"background_plus_overlay\".",
    "When a tool call receives a reference image, write the prompt as grounded instructions for that provided image: identify the requested change, and state what identity, composition, setting, lighting, camera quality, style, or other continuity details should be preserved.",
    "For example, prefer prompts shaped like \"Edit the provided product photo to show the item in a new color while preserving the camera angle and lighting\" or \"Animate the provided character image so the character turns and waves\" over prompts that depend on unstated conversation history.",
    "For multi-state continuity, use prior image outputs deliberately: create the first state image, create later state images with input.usePriorImageOutputs=true when identity continuity matters, then create video clips with input.priorImageOutputIndex pointing at the exact still for that clip.",
    "For multi-clip final videos, call studio.compose after generating or selecting the clips. If the user asks to create a finished video rather than only a Studio draft, call studio.render after studio.compose.",
    "When the user asks to edit text on an existing generated slideshow, Studio video project, or current media artifact, use mediaOverlay.updateText with concrete overlay add/update/remove/replace operations. Do not regenerate the whole media artifact unless the user asks for new visuals or a full remake.",
    "When a generated clip should use one specific prior image, set input.priorImageOutputIndex to the zero-based prior image index for that clip. Use input.usePriorImageOutputs=true only when all prior images should act as continuity/style references.",
    "For image-to-video, default to Kling through fal unless the user explicitly asks for another video model. Use model=\"fal-ai/kling-video/v3/pro/image-to-video\" when animating image references and model=\"fal-ai/kling-video/v3/pro/text-to-video\" for prompt-only video.",
    "When the requested artifact includes text, decide semantically where that text belongs: use Studio composition for video overlays/captions/lower thirds, slideshow tools for slide text, and image generation only when the artifact itself is a text-bearing graphic such as a poster, flyer, infographic, meme, title card, thumbnail, ad graphic, packaging, or specifically requested visible words.",
    "Do not add text, labels, captions, or UI-like annotations to ordinary photo/image assets or video clips unless the user's requested artifact calls for rendered text.",
  ];
}

export function createAgentSystemPrompt() {
  const tools = [...toolDescriptorMap().values()].map((tool) => ({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    category: tool.category,
    emitsArtifacts: tool.artifactBehavior.emitsArtifacts,
    inputFields: tool.inputSchema.kind === "placeholder" ? tool.inputSchema.fields : undefined,
  }));

  return [
    "You are the Create agent inside Content Engine.",
    "You are a natural conversational chatbot with access to creation tools. Respond like a helpful creative collaborator, not like a rigid form or workflow router.",
    "Understand the user's intent semantically from the whole conversation.",
    "If the user is just greeting you, brainstorming, asking a question, or clarifying an idea, choose kind=\"chat\" and answer normally.",
    "If the user wants to create, analyze, edit, compose, render, save, export, publish, or convert something into a workflow, choose kind=\"create\" and select the necessary tools.",
    "If the user appears to want creation but the desired output or source is genuinely ambiguous, choose kind=\"clarify\" and ask one concise question.",
    "Do not ask for platform unless the user makes that relevant.",
    "In Debug Mode the runtime may pause for checkpointable tools before spending generation or render resources. For slideshow.render, the native slideshow pipeline plans the slides and image prompts first, then pauses for review before generating slide images.",
    "For create decisions, write planSteps as plain-English user-visible actions. Do not expose internal tool labels. Example: \"Create an image of an apple.\"",
    "For create decisions, toolCalls is required. It is an ordered list of exact tool invocations you want the runtime to make.",
    ...createProductionPlanningPolicy(),
    "You may call the same tool multiple times.",
    "If a later image/video must preserve the identity, setting, pose, or style of an earlier generated image, set input.usePriorImageOutputs=true on that later toolCall and write the prompt as an edit/continuity instruction that uses the prior image as reference.",
    "Only use count > 1 when the user wants variations/options of the same prompt, not separate semantic outputs.",
    "Available tools:",
    JSON.stringify(tools),
    "Return only JSON with this shape:",
    JSON.stringify({
      kind: "chat | clarify | create",
      response: "Natural message to show the user. For create, summarize what you will do in one sentence.",
      outputType: "image | video | audio | slideshow | analysis | text; required only for create",
      toolCalls: [
        {
          tool: "tool.name value; required for create",
          prompt: "Specific prompt or instructions for this exact tool call",
          planStep: "Plain-English user-visible step for this exact call",
          input: "Optional object with tool-specific fields like aspectRatio, durationSeconds, count, provider, model, or usePriorImageOutputs",
        },
      ],
      planSteps: ["Plain-English user-visible steps; required only for create"],
      productionPlan: {
        finalArtifact: "The final thing the user wants.",
        sourceRoles: ["How provided or prior references should be used."],
        units: ["Atomic assets, shots, clips, scenes, or sections to produce."],
        assembly: "How generated units should be combined, if needed.",
        render: "Whether a finished render/export is needed.",
      },
      brief: "Concise effective brief/instructions for the selected tools; required only for create",
    }),
  ].join("\n");
}

export function messageForModel(message: CreateMessageForModel): ModelMessage {
  const references = message.referenceMentions?.length
    ? [
        "",
        "Referenced assets in this message:",
        ...message.referenceMentions.map((reference: CreateReferenceMention) =>
          `- ${reference.token}: ${reference.label} (${reference.entityType}:${reference.entityId}${reference.mediaType ? `, ${reference.mediaType}` : ""}${reference.storageUrl ? `, url: ${reference.storageUrl}` : ""}${reference.instruction ? `, instruction: ${reference.instruction}` : ""})`
        ),
      ].join("\n")
    : "";
  const generatedText = message.generatedTextContext
    ? [
        "",
        "Generated text artifact attached to this message:",
        message.generatedTextContext,
      ].join("\n")
    : "";

  return {
    role: message.role === "user" ? "user" : "assistant",
    content: `${message.content}${references}${generatedText}`,
  };
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (isRecord(parsed)) return parsed;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (isRecord(parsed)) return parsed;
    }
  }

  throw new Error("Create agent returned an invalid decision.");
}

function stringFromDecision(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function outputTypeFromDecision(value: unknown): Exclude<InferredOutputType, "unknown"> | null {
  if (typeof value !== "string") return null;
  return outputTypes.includes(value as (typeof outputTypes)[number])
    ? value as Exclude<InferredOutputType, "unknown">
    : null;
}

function inputFromDecision(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function productionPlanFromDecision(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function toolCallToolNameFromDecision(value: unknown): CreateToolName | null {
  if (typeof value !== "string") return null;
  const descriptors = toolDescriptorMap();
  return descriptors.has(value as CreateToolName) ? value as CreateToolName : null;
}

function toolCallsFromDecision(
  value: unknown,
  fallbackBrief: string
): CreatePlannedToolCall[] {
  if (!Array.isArray(value)) return [];

  const calls: CreatePlannedToolCall[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const toolName = toolCallToolNameFromDecision(item.tool ?? item.toolName ?? item.name);
    if (!toolName) continue;

    const prompt = stringFromDecision(item.prompt ?? item.instructions ?? item.brief);
    const planStep = stringFromDecision(item.planStep ?? item.step ?? item.label);
    calls.push({
      toolName,
      ...(prompt ? { prompt } : {}),
      ...(planStep ? { planStep } : {}),
      ...(inputFromDecision(item.input ?? item.arguments) ? { input: inputFromDecision(item.input ?? item.arguments) } : {}),
    });
  }

  return calls.slice(0, MAX_AGENT_TOOL_CALLS_PER_DECISION).map((call) => ({
    ...call,
    prompt: call.prompt || fallbackBrief,
  }));
}

function nativeSlideshowToolCalls(
  brief: string,
  requestedToolCalls: CreatePlannedToolCall[]
): CreatePlannedToolCall[] {
  const preferredCall = requestedToolCalls.find((toolCall) => toolCall.toolName === "slideshow.render") ??
    requestedToolCalls[0];
  const prompt = preferredCall?.toolName === "slideshow.render" && preferredCall.prompt?.trim()
    ? preferredCall.prompt.trim()
    : brief;
  const input = preferredCall?.input ?? {};
  const requestedRenderingMode =
    explicitSlideshowRenderingMode(input.requestedRenderingMode) ??
    explicitSlideshowRenderingMode(input.renderingMode) ??
    explicitSlideshowRenderingMode(input.slideshowStyle) ??
    "background_plus_overlay";

  return [{
    toolName: "slideshow.render",
    prompt,
    planStep: preferredCall?.planStep || "Create the slideshow.",
    input: {
      ...input,
      brief,
      plan: prompt,
      requestedRenderingMode,
    },
  }];
}

function toolCallsForOutputType(
  outputType: Exclude<InferredOutputType, "unknown"> | null,
  brief: string,
  requestedToolCalls: CreatePlannedToolCall[]
) {
  if (outputType !== "slideshow") return requestedToolCalls;
  if (requestedToolCalls.some((toolCall) => toolCall.toolName === "mediaOverlay.updateText")) {
    return requestedToolCalls;
  }
  return nativeSlideshowToolCalls(brief, requestedToolCalls);
}

function planStepsFromDecision(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_AGENT_PLAN_STEPS);
}

export function normalizeAgentDecision(text: string): AgentDecision {
  const parsed = parseJsonObject(text);
  const kind = stringFromDecision(parsed.kind).toLowerCase();
  const response = stringFromDecision(parsed.response);

  if (kind === "chat") {
    return {
      kind: "chat",
      response: response || "I am here. What would you like to make or think through?",
    };
  }

  if (kind === "clarify") {
    return {
      kind: "clarify",
      response: response || "What output should I create: video, slideshow, image, audio, analysis, or text?",
    };
  }

  if (kind === "create") {
    const outputType = outputTypeFromDecision(parsed.outputType);
    const brief = stringFromDecision(parsed.brief);
    const requestedToolCalls = toolCallsFromDecision(parsed.toolCalls, brief);
    const toolCalls = toolCallsForOutputType(outputType, brief, requestedToolCalls);
    const planSteps = planStepsFromDecision(parsed.planSteps);
    const productionPlan = productionPlanFromDecision(parsed.productionPlan);
    if (!outputType || !toolCalls.length || !brief) {
      return {
        kind: "clarify",
        response:
          "I can help create that, but I need a valid tool plan before I start.",
      };
    }

    return {
      brief,
      kind: "create",
      outputType,
      planSteps,
      ...(productionPlan ? { productionPlan } : {}),
      summary: response || `I will treat this as a ${outputType} request and choose the right creation tools.`,
      toolCalls,
    };
  }

  return {
    kind: "chat",
    response: response || "I am here. What would you like to make or think through?",
  };
}

export function planMessageForCreateDecision(intent: CreateDecisionIntent) {
  const descriptors = toolDescriptorMap();
  const steps = intent.planSteps.length
    ? intent.planSteps
    : intent.toolCalls.map((toolCall) => {
        if (toolCall.planStep) return toolCall.planStep;
        const tool = descriptors.get(toolCall.toolName);
        return toolCall.prompt || tool?.label || toolCall.toolName;
      });
  const formattedSteps = steps.length === 1
    ? steps
    : steps.map((step, index) => `${index + 1}. ${step}`);
  if (steps.length <= 1) {
    return intent.summary;
  }

  return [
    intent.summary,
    "Plan:",
    ...formattedSteps,
  ].join("\n");
}
