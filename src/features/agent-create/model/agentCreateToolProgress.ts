import type {
  AgentCreateToolProgressStep,
  AgentCreateToolStatus,
} from "./agentCreateTypes";

export type AsyncToolState = {
  completedAt?: number;
  errorMessage?: string;
  status: AgentCreateToolStatus;
};

export type AgentCreateToolCallRecord = {
  _id: string;
  artifactIds?: unknown[];
  completedAt?: number;
  costUsd?: number;
  createdAt?: number;
  errorMessage?: string;
  input?: unknown;
  label: string;
  output?: unknown;
  startedAt?: number;
  status: AgentCreateToolStatus;
  toolName: string;
};

type MediaGenerationMode = "image" | "video" | "audio" | "lipsync";
type ModelProviderName = "bulkapis" | "gemini" | "fal" | "openrouter" | "manual";
export type AgentCreateDefaultProviders = Partial<Record<MediaGenerationMode, ModelProviderName>>;

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function outputId(output: unknown, key: string) {
  const value = recordFromUnknown(output)[key];
  return typeof value === "string" ? value : undefined;
}

function defaultModelForProviderMode(
  provider: string | undefined,
  mode: string | undefined,
  usesReferences: boolean
) {
  if (provider === "fal" && mode === "image") {
    return usesReferences
      ? "fal-ai/gemini-3.1-flash-image-preview/edit"
      : "fal-ai/gemini-3.1-flash-image-preview";
  }
  if (provider === "fal" && mode === "video") {
    return usesReferences
      ? "fal-ai/kling-video/v3/pro/image-to-video"
      : "fal-ai/kling-video/v3/pro/text-to-video";
  }
  if (provider === "bulkapis" && mode === "image") return "nano-banana-2";
  if (provider === "gemini" && mode === "image") return "gemini-3-pro-image-preview";
  return undefined;
}

function mediaModeForToolName(toolName: string): MediaGenerationMode | undefined {
  if (toolName === "media.generateImage") return "image";
  if (toolName === "media.generateVideo") return "video";
  if (toolName === "media.generateAudio") return "audio";
  if (toolName === "media.lipsync") return "lipsync";
  return undefined;
}

function modelDisplayLabel(provider: string | undefined, model: string | undefined) {
  if (model?.trim()) {
    const cleanModel = model.trim();
    return cleanModel.includes("/") || !provider ? cleanModel : `${provider} / ${cleanModel}`;
  }
  return provider;
}

function toolStepDetail(args: {
  defaultProviders?: AgentCreateDefaultProviders;
  inputValue: unknown;
  outputValue: unknown;
  resolvedModel?: string;
  toolName: string;
}) {
  const {
    defaultProviders,
    inputValue,
    outputValue,
    resolvedModel,
    toolName,
  } = args;
  const input = recordFromUnknown(inputValue);
  const output = recordFromUnknown(outputValue);
  const toolMode = mediaModeForToolName(toolName);
  const provider = typeof input.provider === "string"
    ? input.provider
    : outputId(output, "provider") ?? (toolMode ? defaultProviders?.[toolMode] : undefined);
  const outputMode = outputId(output, "mode") ?? toolMode ??
    (typeof input.inferredOutputType === "string" ? input.inferredOutputType : undefined);
  const referenceCount = typeof output.referenceCount === "number" ? output.referenceCount : 0;
  const usesReferences = referenceCount > 0 || input.usePriorImageOutputs === true;
  const model = resolvedModel ??
    outputId(output, "effectiveModel") ??
    (typeof input.model === "string" ? input.model : outputId(output, "model")) ??
    defaultModelForProviderMode(provider, outputMode, usesReferences);
  const prompt = typeof input.prompt === "string"
    ? input.prompt
    : typeof input.brief === "string"
      ? input.brief
      : typeof input.text === "string"
        ? input.text
        : undefined;
  const modelLabel = modelDisplayLabel(provider, model);
  const promptLabel = prompt?.trim().replace(/\s+/g, " ");
  if (modelLabel && promptLabel) return `${modelLabel} - ${promptLabel}`;
  return modelLabel || promptLabel || toolName;
}

export function pendingContentStatus(status: string): AgentCreateToolStatus | undefined {
  if (status === "queued" || status === "planning" || status === "generating") return "running";
  if (status === "discarded") return "canceled";
  if (status === "failed") return "failed";
  return undefined;
}

export function pendingAnalysisStatus(status: string): AgentCreateToolStatus | undefined {
  if (status === "queued" || status === "running") return "running";
  if (status === "failed") return "failed";
  return undefined;
}

export function pendingStudioRenderStatus(status: string): AgentCreateToolStatus | undefined {
  if (status === "queued" || status === "rendering") return "running";
  if (status === "blocked") return "blocked";
  if (status === "failed") return "failed";
  if (status === "canceled") return "canceled";
  return undefined;
}

export function toolProgressStepsForCall(args: {
  asyncState?: AsyncToolState;
  defaultProviders?: AgentCreateDefaultProviders;
  resolvedModel?: string;
  toolCall: AgentCreateToolCallRecord;
}) {
  const { asyncState, defaultProviders, resolvedModel, toolCall } = args;
  const status = asyncState?.status ?? toolCall.status;
  const errorMessage = asyncState?.errorMessage ?? toolCall.errorMessage;
  const steps: AgentCreateToolProgressStep[] = [];

  steps.push({
    id: toolCall._id,
    label: toolCall.label,
    status,
    detail: toolStepDetail({
      defaultProviders,
      inputValue: toolCall.input,
      outputValue: toolCall.output,
      resolvedModel,
      toolName: toolCall.toolName,
    }),
    artifactIds: toolCall.artifactIds?.map(String),
    costLabel: typeof toolCall.costUsd === "number" ? `$${toolCall.costUsd.toFixed(2)}` : undefined,
    errorMessage,
    createdAt: toolCall.createdAt,
    startedAt: toolCall.startedAt,
    completedAt: asyncState?.completedAt ?? (status === toolCall.status ? toolCall.completedAt : undefined),
  });

  return steps;
}
