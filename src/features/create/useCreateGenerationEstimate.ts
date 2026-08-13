import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { ModelProviderName } from "../../../convex/providers/model";
import { createGenerationReferenceInputs } from "./createSubmitPayload";
import { numberConfigValue } from "./createPageHelpers";
import { isCreateGenerationMode } from "../../lib/create/createGenerationConfig";
import type { CreateMode } from "../../lib/create/createModes";
import {
  falModelIdForRosterModel,
  type RosterModel,
} from "../../lib/generation/modelRoster";
import type { GenerationOperationId } from "../../lib/generation/generationOperations";

export function useCreateGenerationEstimate(args: {
  currentPrompt: string;
  generationConfig: Record<string, unknown>;
  generationOperationId?: GenerationOperationId;
  mode: CreateMode;
  provider: ModelProviderName;
  selectedModel: string;
  selectedRosterModel: RosterModel | null;
}) {
  const references = createGenerationReferenceInputs(
    args.generationConfig,
    args.generationOperationId
  );
  const referenceImageCount =
    references.imageReferenceImages.length + references.videoReferenceImages.length;
  const modelId = args.selectedRosterModel
    ? falModelIdForRosterModel(args.selectedRosterModel, { referenceImageCount }) ?? args.selectedModel
    : args.selectedModel;
  const options = args.generationConfig.options &&
    typeof args.generationConfig.options === "object" &&
    !Array.isArray(args.generationConfig.options)
      ? args.generationConfig.options as Record<string, string | boolean>
      : undefined;

  return useQuery(
    api.usage.estimates.generation,
    isCreateGenerationMode(args.mode) && args.selectedModel
      ? {
          provider: args.provider,
          mode: args.mode,
          modelId,
          count: numberConfigValue(args.generationConfig.count) ?? undefined,
          durationSeconds: numberConfigValue(args.generationConfig.durationSeconds),
          nativeAudio: args.generationConfig.nativeAudio === true,
          options,
          referenceCount:
            referenceImageCount +
            references.videoReferenceVideos.length +
            references.audioReferenceAudios.length,
          referenceVideoCount: references.videoReferenceVideos.length,
          textLength: args.mode === "audio" ? args.currentPrompt.length : undefined,
        }
      : "skip"
  );
}
