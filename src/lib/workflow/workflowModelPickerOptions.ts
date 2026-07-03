import type { WorkflowSelectOption } from "../../components/workflow/WorkflowSelect";
import {
  canonicalModelOptionId,
  generationOperationById,
  isDuplicateProviderRoute,
  modelMatchesGenerationOperation,
  recommendationForGenerationOperation,
  type GenerationOperationId,
} from "../generation/generationOperations";
import type { WorkflowNodeType, WorkflowProviderName } from "./workflowGraph";
import type { ProviderModelDoc } from "./workflowModelCatalog";
import {
  providerModelCapabilityTags,
  providerModelSourceLabel,
  recommendationForNodeType,
} from "./workflowModelCatalog";

export const BULKAPIS_IMAGE_MODEL_FALLBACKS = [
  { modelId: "nano-banana-2", displayName: "Nano Banana 2" },
  { modelId: "nano-banana-pro", displayName: "Nano Banana Pro" },
  { modelId: "seedream-4.5", displayName: "Seedream 4.5" },
  { modelId: "gpt-image-2", displayName: "GPT Image 2" },
  { modelId: "gpt-image-1.5", displayName: "GPT Image 1.5" },
  { modelId: "flux-2-pro", displayName: "Flux-2 Pro" },
];

const MODEL_FALLBACKS_BY_PROVIDER_AND_NODE: Partial<
  Record<
    WorkflowProviderName,
    Partial<Record<WorkflowNodeType, WorkflowModelOptionSource[]>>
  >
> = {
  bulkapis: {
    image_generation: BULKAPIS_IMAGE_MODEL_FALLBACKS,
    video_generation: [
      { modelId: "kling-2.5-turbo", displayName: "Kling 2.5 Turbo Pro" },
      { modelId: "kling-3-0", displayName: "Kling 3.0" },
      { modelId: "seedance-1-5-pro", displayName: "Seedance 1.5 Pro" },
    ],
    audio_generation: [
      { modelId: "elevenlabs-v3", displayName: "ElevenLabs v3" },
      { modelId: "elevenlabs-turbo-2-5", displayName: "ElevenLabs Turbo 2.5" },
    ],
  },
  fal: {
    image_generation: [
      {
        modelId: "fal-ai/nano-banana-pro",
        displayName: "Nano Banana Pro",
        tags: ["Text to image", "Reference editing"],
      },
      {
        modelId: "fal-ai/nano-banana-2",
        displayName: "Nano Banana 2",
        tags: ["Text to image", "Reference editing"],
      },
      {
        modelId: "fal-ai/gemini-3.1-flash-image-preview",
        displayName: "Gemini 3.1 Flash Image",
        tags: ["Text to image", "Reference editing"],
      },
      {
        modelId: "fal-ai/gemini-3-pro-image-preview",
        displayName: "Gemini 3 Pro Image",
        tags: ["Text to image", "Reference editing"],
      },
    ],
    video_generation: [
      { modelId: "fal-ai/ltx-video", displayName: "LTX Video" },
      {
        modelId: "fal-ai/bytedance/seedance-2.0/reference-to-video",
        displayName: "Seedance 2.0 Reference to Video",
      },
    ],
    audio_generation: [
      { modelId: "fal-ai/xai/tts/v1", displayName: "xAI TTS v1" },
      {
        modelId: "fal-ai/bytedance/seed-speech/tts/v2",
        displayName: "Seed Speech TTS v2",
      },
    ],
    lipsync: [
      {
        modelId: "fal-ai/bytedance/seedance-2.0/reference-to-video",
        displayName: "Seedance 2.0 Reference to Video",
      },
      {
        modelId: "fal-ai/bytedance/seedance-2.0/fast/reference-to-video",
        displayName: "Seedance 2.0 Fast Reference to Video",
      },
    ],
  },
  gemini: {
    image_generation: [
      { modelId: "gemini-3-pro-image-preview", displayName: "Gemini 3 Pro Image" },
    ],
  },
};

export type WorkflowModelOptionSource = {
  modelId: string;
  displayName: string;
  description?: string;
  tags?: string[];
};

function isFalImageEditRoute(args: {
  modelId: string;
  nodeType?: WorkflowNodeType;
  providerName?: WorkflowProviderName;
}) {
  return args.providerName === "fal" &&
    args.nodeType === "image_generation" &&
    args.modelId.endsWith("/edit");
}

function baseModelIdForFalImageRoute(modelId: string) {
  return modelId.endsWith("/edit") ? modelId.slice(0, -"/edit".length) : modelId;
}

function friendlyDisplayNameForFalImageRoute(displayName: string) {
  return displayName
    .replace(/\s+Edit$/i, "")
    .replace(/\s+\[image[-\s]?editing\]$/i, "")
    .trim();
}

function falImageModelOptionSources(args: {
  providerModels: ProviderModelDoc[];
  nodeType?: WorkflowNodeType;
  providerName?: WorkflowProviderName;
}): WorkflowModelOptionSource[] {
  const catalogModelIds = new Set(args.providerModels.map((model) => model.modelId));
  const editBaseModelIds = new Set(
    args.providerModels.flatMap((model) =>
      isFalImageEditRoute({
        modelId: model.modelId,
        nodeType: args.nodeType,
        providerName: args.providerName,
      })
        ? [baseModelIdForFalImageRoute(model.modelId)]
        : []
    )
  );
  const optionsByModelId = new Map<string, WorkflowModelOptionSource>();

  for (const model of args.providerModels) {
    const isEditRoute = isFalImageEditRoute({
      modelId: model.modelId,
      nodeType: args.nodeType,
      providerName: args.providerName,
    });
    const modelId = baseModelIdForFalImageRoute(model.modelId);
    const existing = optionsByModelId.get(modelId);
    const tags = isEditRoute || editBaseModelIds.has(modelId)
      ? ["Reference editing"]
      : undefined;

    if (isEditRoute && catalogModelIds.has(modelId)) continue;
    if (existing) {
      optionsByModelId.set(modelId, {
        ...existing,
        tags: [...new Set([...(existing.tags ?? []), ...(tags ?? [])])],
      });
      continue;
    }

    optionsByModelId.set(modelId, {
      modelId,
      displayName: isEditRoute
        ? friendlyDisplayNameForFalImageRoute(model.displayName)
        : model.displayName,
      description: isEditRoute
        ? "Creates images and edits from references. Reference uploads automatically use the editing route."
        : undefined,
      tags,
    });
  }

  return [...optionsByModelId.values()];
}

export function modelOptionSourcesForNode(args: {
  operationId?: GenerationOperationId;
  nodeType?: WorkflowNodeType;
  providerName?: WorkflowProviderName;
  providerModels?: ProviderModelDoc[];
}): WorkflowModelOptionSource[] {
  const operation = generationOperationById(args.operationId);
  const dedupedProviderModels = args.providerModels?.filter(
    (model) => !isDuplicateProviderRoute(model.modelId)
  );
  const operationProviderModels = dedupedProviderModels?.filter((model) =>
    !isDuplicateProviderRoute(model.modelId) &&
      modelMatchesGenerationOperation({
        model,
        operation,
        providerName: args.providerName,
      })
  );
  const providerModels = operationProviderModels?.length
    ? operationProviderModels
    : dedupedProviderModels;

  if (
    args.providerName === "fal" &&
    args.nodeType === "image_generation" &&
    providerModels?.length
  ) {
    return falImageModelOptionSources({
      providerModels,
      nodeType: args.nodeType,
      providerName: args.providerName,
    });
  }

  if (args.nodeType && args.providerName && !providerModels?.length) {
    const providerFallbacks =
      MODEL_FALLBACKS_BY_PROVIDER_AND_NODE[args.providerName]?.[args.nodeType];
    if (providerFallbacks?.length) return providerFallbacks;
  }

  const optionsByModelId = new Map<string, WorkflowModelOptionSource>();
  for (const model of providerModels ?? []) {
    const modelId = canonicalModelOptionId(model.modelId);
    if (optionsByModelId.has(modelId)) continue;
    optionsByModelId.set(modelId, {
      modelId,
      displayName: model.displayName,
    });
  }
  return [...optionsByModelId.values()];
}

export function richModelPickerOptions(args: {
  modelOptions: WorkflowModelOptionSource[];
  nodeType?: WorkflowNodeType;
  operationId?: GenerationOperationId;
  providerModels?: ProviderModelDoc[];
  selectedModel?: string;
}): WorkflowSelectOption[] {
  const operation = generationOperationById(args.operationId);
  const options = args.modelOptions.map((model) => {
    const modelDoc = args.providerModels?.find(
      (providerModel) => canonicalModelOptionId(providerModel.modelId) === model.modelId
    );
    const operationRecommendation = recommendationForGenerationOperation(
      operation,
      model.modelId
    );
    const recommendation = operationRecommendation ?? (args.nodeType
      ? recommendationForNodeType(args.nodeType, model.modelId)
      : undefined);

    return {
      value: model.modelId,
      label: model.displayName,
      description: recommendation?.note ?? model.description ?? modelDoc?.description,
      meta: providerModelSourceLabel(modelDoc),
      recommendationTag: recommendation?.tag,
      tags: [...new Set([
        ...(model.tags ?? []),
        ...providerModelCapabilityTags(modelDoc, args.nodeType),
      ])],
      rank: recommendation?.rank ?? 1000,
    };
  }).sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.label.localeCompare(b.label);
  });

  if (
    args.selectedModel &&
    !options.some((option) => option.value === args.selectedModel)
  ) {
    options.unshift({
      value: args.selectedModel,
      label: args.selectedModel,
      description: "This model is saved but is not in the current catalog.",
      meta: undefined,
      recommendationTag: undefined,
      tags: ["Saved model"],
      rank: 0,
    });
  }

  return options;
}
