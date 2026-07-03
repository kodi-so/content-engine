import {
  providerInputFromCreateConfig,
} from "../../lib/create/createGenerationConfig";
import type { GenerationOperationId } from "../../lib/generation/generationOperations";
import {
  referenceAssetsFromConfig,
} from "./createPageHelpers";

type CreateGenerationSubmitMode = "image" | "video" | "audio" | "slideshow";

export function createGenerationReferenceInputs(
  submitGenerationConfig: Record<string, unknown>,
  generationOperationId: GenerationOperationId | undefined
) {
  const referenceImages = referenceAssetsFromConfig(
    submitGenerationConfig,
    "localReferenceImages",
    "image"
  );
  const startFrameImages = referenceAssetsFromConfig(
    submitGenerationConfig,
    "localStartFrameImages",
    "image"
  );
  const endFrameImages = referenceAssetsFromConfig(
    submitGenerationConfig,
    "localEndFrameImages",
    "image"
  );
  const referenceVideos = referenceAssetsFromConfig(
    submitGenerationConfig,
    "localReferenceVideos",
    "video"
  );
  const voiceReferenceAudios = referenceAssetsFromConfig(
    submitGenerationConfig,
    "localReferenceAudios",
    "audio"
  );

  return {
    audioReferenceAudios:
      generationOperationId === "audio_voice_clone" ? voiceReferenceAudios : [],
    imageReferenceImages:
      generationOperationId === "image_text_to_image" ? [] : referenceImages,
    videoReferenceImages:
      generationOperationId === "video_start_end_frame"
        ? [...startFrameImages, ...endFrameImages]
        : generationOperationId === "video_image_to_video" ||
            generationOperationId === "video_reference_to_video"
          ? referenceImages
          : [],
    videoReferenceVideos:
      generationOperationId === "video_reference_to_video" ? referenceVideos : [],
    startFrameImages,
    endFrameImages,
  };
}

export function providerInputForGenerationSubmit(args: {
  generationOperationId: GenerationOperationId | undefined;
  mode: CreateGenerationSubmitMode;
  submitGenerationConfig: Record<string, unknown>;
  visibleGenerationConfig: Record<string, unknown>;
}) {
  const {
    generationOperationId,
    mode,
    submitGenerationConfig,
    visibleGenerationConfig,
  } = args;
  const { endFrameImages, startFrameImages } = createGenerationReferenceInputs(
    submitGenerationConfig,
    generationOperationId
  );
  const providerInput = mode === "image"
    ? providerInputFromCreateConfig(visibleGenerationConfig, [
        "prompt",
        "aspectRatio",
        "count",
        "localReferenceImages",
        "generationOperation",
      ])
    : mode === "video"
      ? providerInputFromCreateConfig(visibleGenerationConfig, [
          "prompt",
          "aspectRatio",
          "durationSeconds",
          "localReferenceImages",
          "localStartFrameImages",
          "localEndFrameImages",
          "localReferenceVideos",
          "startEndFrameMode",
          "generationOperation",
        ])
      : mode === "audio"
        ? providerInputFromCreateConfig(visibleGenerationConfig, [
            "text",
            "prompt",
            "mode",
            "localReferenceAudios",
            "generationOperation",
          ])
        : {};

  if (mode !== "video") return providerInput;

  const startFrameUrl = startFrameImages[0]?.url;
  const endFrameUrl = endFrameImages[0]?.url;
  if (submitGenerationConfig.startEndFrameMode === true && startFrameUrl) {
    providerInput.start_frame_url = startFrameUrl;
    providerInput.start_image_url = startFrameUrl;
    providerInput.first_frame_url = startFrameUrl;
  }
  if (submitGenerationConfig.startEndFrameMode === true && endFrameUrl) {
    providerInput.end_frame_url = endFrameUrl;
    providerInput.end_image_url = endFrameUrl;
    providerInput.last_frame_url = endFrameUrl;
    providerInput.tail_image_url = endFrameUrl;
  }

  return providerInput;
}
