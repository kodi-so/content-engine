import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { WorkflowFlowNode } from "../../lib/workflow/workflowCanvasGraph";
import type { WorkflowProviderName } from "../../lib/workflow/workflowGraph";
import type { WorkflowNodeCatalogEntry } from "../../lib/workflow/workflowNodeCatalog";
import {
  imageModelUiContractFromModel,
  modelCategoryForNodeType,
  providerModelCapabilityTags,
  providerModelSourceLabel,
  recommendationMapForNodeType,
} from "../../lib/workflow/workflowModelCatalog";
import { configFieldsForNode } from "../../lib/workflow/workflowConfigFields";

const BULKAPIS_IMAGE_MODEL_FALLBACKS = [
  { modelId: "nano-banana-2", displayName: "Nano Banana 2" },
  { modelId: "nano-banana-pro", displayName: "Nano Banana Pro" },
  { modelId: "nano-banana-edit", displayName: "Nano Banana Edit" },
  { modelId: "seedream-4.5", displayName: "Seedream 4.5" },
  { modelId: "gpt-image-2", displayName: "GPT Image 2" },
  { modelId: "gpt-image-2-edit", displayName: "GPT Image 2 Edit" },
  { modelId: "gpt-image-1.5", displayName: "GPT Image 1.5" },
  { modelId: "flux-2-pro", displayName: "Flux-2 Pro" },
];

type ProviderCatalogName = Exclude<WorkflowProviderName, "postiz" | "post_bridge">;

function isProviderCatalogName(value?: WorkflowProviderName): value is ProviderCatalogName {
  return value === "bulkapis" || value === "gemini" || value === "fal" || value === "openrouter" || value === "manual";
}

type UseWorkflowNodeModelControlsArgs = {
  selectedNode: WorkflowFlowNode | null;
  selectedNodeDefinition: WorkflowNodeCatalogEntry | null;
};

export function useWorkflowNodeModelControls({
  selectedNode,
  selectedNodeDefinition,
}: UseWorkflowNodeModelControlsArgs) {
  const selectedNodeModelCategory = selectedNode
    ? modelCategoryForNodeType(selectedNode.data.type)
    : undefined;
  const showProviderControl = Boolean(
    selectedNodeDefinition &&
      selectedNodeDefinition.providerRequirement !== "none" &&
      !selectedNodeModelCategory &&
      selectedNode?.data.type !== "auto_post"
  );
  const showModelControl = Boolean(selectedNodeModelCategory);
  const selectedProviderCatalogName = selectedNodeModelCategory
    ? "bulkapis"
    : isProviderCatalogName(selectedNode?.data.provider)
      ? selectedNode.data.provider
      : undefined;
  const selectedProviderModels = useQuery(
    api.providers.modelCatalog.list,
    selectedProviderCatalogName
      ? {
          provider: selectedProviderCatalogName,
          ...(selectedNodeModelCategory ? { category: selectedNodeModelCategory } : {}),
        }
      : "skip"
  );
  const selectedModelOptions = useMemo(() => {
    if (selectedNode?.data.type === "image_generation" && !selectedProviderModels?.length) {
      return BULKAPIS_IMAGE_MODEL_FALLBACKS;
    }

    return (selectedProviderModels ?? []).map((model) => ({
      modelId: model.modelId,
      displayName: model.displayName,
    }));
  }, [selectedNode?.data.type, selectedProviderModels]);
  const selectedProviderModel = useMemo(
    () =>
      selectedProviderModels?.find(
        (model) => model.modelId === selectedNode?.data.model
      ) ?? null,
    [selectedNode?.data.model, selectedProviderModels]
  );
  const selectedModelPickerOptions = useMemo(() => {
    const options = selectedModelOptions.map((model) => {
      const modelDoc = selectedProviderModels?.find(
        (providerModel) => providerModel.modelId === model.modelId
      );
      const recommendation = selectedNode
        ? recommendationMapForNodeType(selectedNode.data.type)?.[model.modelId]
        : undefined;

      return {
        value: model.modelId,
        label: model.displayName,
        description: recommendation?.note ?? modelDoc?.description,
        meta: providerModelSourceLabel(modelDoc),
        recommendationTag: recommendation?.tag,
        tags: providerModelCapabilityTags(modelDoc, selectedNode?.data.type),
        rank: recommendation?.rank ?? 1000,
      };
    }).sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.label.localeCompare(b.label);
    });

    if (
      selectedNode?.data.model &&
      !options.some((option) => option.value === selectedNode.data.model)
    ) {
      options.unshift({
        value: selectedNode.data.model,
        label: selectedNode.data.model,
        description: "This model is saved on the node but is not in the current catalog.",
        meta: undefined,
        recommendationTag: undefined,
        tags: ["Saved model"],
        rank: 0,
      });
    }

    return options;
  }, [selectedModelOptions, selectedNode, selectedProviderModels]);
  const selectedImageModelUiContract = useMemo(
    () =>
      selectedNode?.data.type === "image_generation"
        ? imageModelUiContractFromModel(selectedProviderModel)
        : null,
    [selectedNode?.data.type, selectedProviderModel]
  );
  const selectedConfigFields = useMemo(
    () =>
      selectedNode
        ? configFieldsForNode(
            selectedNode.data.type,
            selectedNode.data.config,
            selectedProviderModel,
            selectedImageModelUiContract
          )
        : [],
    [selectedImageModelUiContract, selectedNode, selectedProviderModel]
  );

  return {
    selectedConfigFields,
    selectedImageModelUiContract,
    selectedModelOptions,
    selectedModelPickerOptions,
    selectedProviderCatalogName,
    selectedProviderModel,
    selectedProviderModels,
    showModelControl,
    showProviderControl,
  };
}
