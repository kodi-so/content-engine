import type { Doc } from "../../_generated/dataModel";
import type { ModelMessage } from "../../providers/model";
import {
  explicitSlideshowRenderingMode,
  toolDescriptorMap,
  type CreateReferenceMention,
  type InferredOutputType,
} from "../planning";
import type { CreateToolName } from "../tools";
import { validateToolCallInput } from "../tools/validateToolInput";
import {
  ALL_AGENT_PROMPT_MODULES,
  buildAgentSystemPrompt,
  type AgentPromptModuleName,
} from "./agentPromptModules";

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

export class AgentDecisionParseError extends Error {
  readonly modelText: string;

  constructor(message: string, modelText: string) {
    super(message);
    this.name = "AgentDecisionParseError";
    this.modelText = modelText;
  }
}

export class AgentDecisionValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Create agent decision failed validation: ${errors.join("; ")}`);
    this.name = "AgentDecisionValidationError";
    this.errors = errors;
  }
}

const outputTypes = ["image", "video", "audio", "slideshow", "analysis", "text"] as const;
const MAX_AGENT_TOOL_CALLS_PER_DECISION = 20;
const MAX_AGENT_PLAN_STEPS = 12;

export const AGENT_DECISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "response",
    "outputType",
    "toolCalls",
    "planSteps",
    "productionPlan",
    "brief",
  ],
  properties: {
    kind: {
      type: "string",
      enum: ["chat", "clarify", "create"],
    },
    response: {
      type: "string",
    },
    outputType: {
      type: ["string", "null"],
      enum: ["image", "video", "audio", "slideshow", "analysis", "text", null],
    },
    toolCalls: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tool", "prompt", "planStep", "input"],
        properties: {
          tool: {
            type: "string",
          },
          prompt: {
            type: "string",
          },
          planStep: {
            type: ["string", "null"],
          },
          input: {
            type: ["string", "null"],
            description:
              "JSON-encoded object for this tool's input fields, or null when no input is needed. Example: \"{\\\"aspectRatio\\\":\\\"9:16\\\"}\".",
          },
        },
      },
    },
    planSteps: {
      type: ["array", "null"],
      items: {
        type: "string",
      },
    },
    productionPlan: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["finalArtifact", "sourceRoles", "units", "assembly", "render"],
      properties: {
        finalArtifact: {
          type: "string",
        },
        sourceRoles: {
          type: "array",
          items: {
            type: "string",
          },
        },
        units: {
          type: "array",
          items: {
            type: "string",
          },
        },
        assembly: {
          type: "string",
        },
        render: {
          type: "string",
        },
      },
    },
    brief: {
      type: ["string", "null"],
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function createAgentSystemPrompt(modules: AgentPromptModuleName[] = ALL_AGENT_PROMPT_MODULES) {
  return buildAgentSystemPrompt({ modules });
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
  } catch (error) {
    throw new AgentDecisionParseError(
      error instanceof Error
        ? `Create agent returned invalid JSON: ${error.message}`
        : "Create agent returned invalid JSON.",
      text
    );
  }

  throw new AgentDecisionParseError("Create agent decision must be a JSON object.", text);
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

function compactDecisionInputValue(value: unknown): unknown | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const compacted = value
      .map(compactDecisionInputValue)
      .filter((item): item is unknown => item !== undefined);
    return compacted.length ? compacted : undefined;
  }
  if (isRecord(value)) {
    const compacted = Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        const compactedValue = compactDecisionInputValue(entry);
        return compactedValue === undefined ? [] : [[key, compactedValue]];
      })
    );
    return Object.keys(compacted).length ? compacted : undefined;
  }
  return value;
}

function inputFromDecision(value: unknown): Record<string, unknown> | undefined {
  const source = typeof value === "string"
    ? (() => {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        try {
          return JSON.parse(trimmed);
        } catch (error) {
          throw new AgentDecisionValidationError([
            `Tool input must be a JSON-encoded object string: ${error instanceof Error ? error.message : "invalid JSON"}`,
          ]);
        }
      })()
    : value;
  if (!isRecord(source)) return undefined;
  const compacted = compactDecisionInputValue(source);
  return isRecord(compacted) ? compacted : undefined;
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
    const rawToolName = item.tool ?? item.toolName ?? item.name;
    const toolName = toolCallToolNameFromDecision(rawToolName);
    if (!toolName) {
      throw new AgentDecisionValidationError([
        `Unknown tool name: ${typeof rawToolName === "string" ? rawToolName : String(rawToolName)}`,
      ]);
    }

    const prompt = stringFromDecision(item.prompt ?? item.instructions ?? item.brief);
    const planStep = stringFromDecision(item.planStep ?? item.step ?? item.label);
    const input = inputFromDecision(item.input ?? item.arguments);
    calls.push({
      toolName,
      ...(prompt ? { prompt } : {}),
      ...(planStep ? { planStep } : {}),
      ...(input ? { input } : {}),
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
  const slideshowInput = {
    ...(typeof input.aspectRatio === "string" ? { aspectRatio: input.aspectRatio } : {}),
    ...(Array.isArray(input.references) ? { references: input.references } : {}),
    ...(isRecord(input.providerInput) ? { providerInput: input.providerInput } : {}),
  };

  return [{
    toolName: "slideshow.render",
    prompt,
    planStep: preferredCall?.planStep || "Create the slideshow.",
    input: {
      ...slideshowInput,
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
    const validationErrors = toolCalls.flatMap((toolCall) =>
      validateToolCallInput(toolCall.toolName, toolCall.input ?? {})
    );
    if (validationErrors.length) {
      throw new AgentDecisionValidationError(validationErrors);
    }
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

  throw new AgentDecisionParseError(`Create agent returned unknown decision kind: ${kind || "(missing)"}.`, text);
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
