import { generationOperationForConfig } from "../generation/generationOperations";
import { getWorkflowAgentPreset, workflowAgentPresetIds } from "./workflowAgentPresets";
import {
  creatorAspectRatioOptions,
  formatConfigLabel,
  isAdvancedConfigField,
  schemaFieldTypeFromValue,
  type ConfigField,
} from "./workflowConfigFieldBasics";
import type { WorkflowNodeType } from "./workflowGraph";
import type { ImageModelUiContract, ProviderModelDoc } from "./workflowModelCatalog";
import { postCompilerPresetIds } from "./postCompilerPresets";

const creatorMediaConfigFieldKeysByNodeType: Partial<Record<WorkflowNodeType, Set<string>>> = {
  image_generation: new Set([
    "promptFromInputNode",
    "prompt",
    "imageFromInputNode",
    "localReferenceImages",
    "aspectRatio",
    "count",
  ]),
  video_generation: new Set([
    "promptFromInputNode",
    "prompt",
    "imageFromInputNode",
    "localReferenceImages",
    "startEndFrameMode",
    "localStartFrameImages",
    "localEndFrameImages",
    "localReferenceVideos",
    "aspectRatio",
    "durationSeconds",
  ]),
  audio_generation: new Set([
    "mode",
    "textFromInputNode",
    "text",
    "voiceFromInputNode",
    "localReferenceAudios",
    "voice",
  ]),
};

const hiddenImageGenerationConfigKeys = new Set([
  "generationOperation",
  "audio_url",
  "audio_urls",
  "audioUrl",
  "end_frame",
  "end_frame_url",
  "first_frame_url",
  "image_input",
  "input_url",
  "image_url",
  "image_urls",
  "input_urls",
  "max_tokens",
  "messages",
  "reference_image",
  "reference_image_url",
  "reference_image_urls",
  "referenceImageUrl",
  "reference_video",
  "reference_video_url",
  "reference_video_urls",
  "referenceVideoUrl",
  "resolution",
  "seed",
  "song_url",
  "last_frame_url",
  "start_frame",
  "start_frame_url",
  "tail_image_url",
  "upscale_factor",
  "video_url",
  "video_urls",
  "videoUrl",
  "webhook_url",
  "webhookUrl",
]);

const fieldOrderByType: Partial<Record<WorkflowNodeType, string[]>> = {
  image_generation: ["imageFromInputNode", "localReferenceImages", "promptFromInputNode", "prompt", "aspectRatio", "count"],
  video_generation: [
    "imageFromInputNode",
    "startEndFrameMode",
    "localReferenceImages",
    "localStartFrameImages",
    "localEndFrameImages",
    "localReferenceVideos",
    "promptFromInputNode",
    "prompt",
    "aspectRatio",
    "durationSeconds",
  ],
  audio_generation: ["mode", "textFromInputNode", "text", "voiceFromInputNode", "localReferenceAudios", "voice"],
  lipsync: ["imageFromInputNode", "localReferenceImages", "localReferenceVideos", "audioFromInputNode", "localReferenceAudios", "resolution", "turboMode"],
  ai_video_editor: ["mediaFromInputNode", "uploadedMedia", "promptFromInputNode", "prompt", "renderMode", "systemPrompt", "knowledgeBase", "aspectRatio", "maxDurationSeconds"],
  ai_agent: ["agentMode", "requestFromInputNode", "request", "tone", "platform", "temperature", "maxTokens"],
  llm: ["systemPrompt", "promptFromInputNode", "prompt", "responseFormat", "temperature", "maxTokens"],
  native_slideshow_planner: ["promptFromInputNode", "prompt", "slideCount", "aspectRatio", "platform", "tone"],
  post_compiler: ["postType", "platformPreset", "captionFromInputNode", "caption", "name", "optimizeForPlatforms"],
  auto_post: ["publishIntent", "socialAccountIds", "captionFromInputNode", "caption", "scheduledAt", "timezone"],
};

export function friendlyConfigFieldKeysForNode(
  type: WorkflowNodeType,
  config: Record<string, unknown>
): string[] {
  switch (type) {
    case "runner":
      return ["trigger", "scheduleType", "intervalHours", "timezone", "runsPerExecution", "retryCount", "timeoutSeconds", "failureBehavior"];
    case "comment":
      return ["text"];
    case "media":
      return ["uploadedMedia"];
    case "llm":
      return ["systemPrompt", "promptFromInputNode", "prompt", "responseFormat", "temperature", "maxTokens"];
    case "ai_agent":
      return getWorkflowAgentPreset(config.agentMode).configKeys;
    case "image_generation":
      return ["promptFromInputNode", "prompt", "imageFromInputNode", "localReferenceImages", "aspectRatio", "count"];
    case "video_generation":
      return [
        "promptFromInputNode",
        "prompt",
        "imageFromInputNode",
        "localReferenceImages",
        "startEndFrameMode",
        "localStartFrameImages",
        "localEndFrameImages",
        "localReferenceVideos",
        "aspectRatio",
        "durationSeconds",
        "resolution",
      ];
    case "audio_generation":
      return ["mode", "textFromInputNode", "text", "voiceFromInputNode", "localReferenceAudios", "voice", "temperature", "cfgScale", "removeSilence"];
    case "lipsync":
      return ["imageFromInputNode", "localReferenceImages", "localReferenceVideos", "audioFromInputNode", "localReferenceAudios", "resolution", "turboMode"];
    case "native_slideshow_planner":
      return ["promptFromInputNode", "prompt", "slideCount", "aspectRatio", "platform", "tone"];
    case "native_slideshow_renderer":
      return ["renderMode", "aspectRatio", "resolution"];
    case "ai_video_editor":
      return ["renderMode", "promptFromInputNode", "prompt", "mediaFromInputNode", "uploadedMedia", "systemPrompt", "knowledgeBase", "aspectRatio", "maxDurationSeconds"];
    case "post_compiler":
      return ["postType", "platformPreset", "captionFromInputNode", "caption", "name", "optimizeForPlatforms"];
    case "export":
      return ["destination", "folder", "fileName", "optimizeFor"];
    case "auto_post":
      return ["publishIntent", "socialAccountIds", "captionFromInputNode", "caption", "scheduledAt", "timezone"];
  }
}

export function friendlyConfigFieldForKey(key: string, config: Record<string, unknown>): ConfigField {
  const currentValue = config[key];
  const inferredType = schemaFieldTypeFromValue(currentValue);
  const defaultField: ConfigField = {
    key,
    label: formatConfigLabel(key),
    type: inferredType,
    required: false,
    advanced: isAdvancedConfigField(key, inferredType),
  };

  switch (key) {
    case "agentMode":
      return { ...defaultField, type: "enum", enumValues: workflowAgentPresetIds() };
    case "aspectRatio":
      return {
        ...defaultField,
        required: true,
        type: "enum",
        enumValues: creatorAspectRatioOptions,
      };
    case "autoPublish":
    case "audioFromInputNode":
    case "captionFromInputNode":
    case "imageFromInputNode":
    case "mediaFromInputNode":
    case "promptFromInputNode":
    case "removeSilence":
    case "requestFromInputNode":
    case "startEndFrameMode":
    case "textFromInputNode":
    case "turboMode":
    case "voiceFromInputNode":
      return {
        ...defaultField,
        label: key === "promptFromInputNode"
          ? "Prompt from input node"
          : key === "imageFromInputNode"
            ? "Image from input node"
            : key === "audioFromInputNode"
              ? "Audio from input node"
              : key === "captionFromInputNode"
                ? "Caption from input node"
                : key === "mediaFromInputNode"
                  ? "Media from input node"
                  : key === "requestFromInputNode"
                    ? "Request from input node"
                    : key === "textFromInputNode"
                      ? "Text from input node"
                      : key === "startEndFrameMode"
                        ? "Start/end frame mode"
                      : key === "voiceFromInputNode"
                        ? "Voice from input node"
                        : defaultField.label,
        type: "boolean",
      };
    case "count":
      return { ...defaultField, label: "Number of images", type: "number" };
    case "publishIntent":
      return {
        ...defaultField,
        label: "Publish intent",
        required: true,
        type: "enum",
        enumValues: ["draft", "publish", "schedule", "distribution_plan"],
        description:
          "Choose whether this node sends a provider draft, publishes now, schedules, or only creates a Content Engine plan.",
      };
    case "socialAccountIds":
      return {
        ...defaultField,
        label: "Accounts",
        type: "json",
        description: "Choose the connected social accounts that should receive this post.",
      };
    case "durationSeconds":
      return { ...defaultField, label: "Duration", type: "number" };
    case "intervalHours":
    case "maxDurationSeconds":
    case "maxTokens":
    case "retryCount":
    case "runsPerExecution":
    case "scheduleDayOfWeek":
    case "scheduleHour":
    case "scheduleMinute":
    case "scriptLengthSeconds":
    case "seed":
    case "slideCount":
    case "temperature":
    case "timeoutSeconds":
    case "cfgScale":
    case "fps":
    case "height":
    case "width":
      return { ...defaultField, type: "number" };
    case "failureBehavior":
      return { ...defaultField, type: "enum", enumValues: ["stop_workflow", "continue_dependents", "skip_dependents"] };
    case "destination":
      return { ...defaultField, type: "enum", enumValues: ["media_library", "download", "google_drive"] };
    case "mode":
      return { ...defaultField, type: "enum", enumValues: ["tts", "sound_effect", "music"] };
    case "postType":
      return { ...defaultField, type: "enum", enumValues: ["video", "slideshow", "carousel", "single_image", "thread"] };
    case "platformPreset":
      return { ...defaultField, type: "enum", enumValues: postCompilerPresetIds() };
    case "renderMode":
      return { ...defaultField, type: "enum", enumValues: ["video_render", "music_edit", "native"] };
    case "responseFormat":
      return { ...defaultField, type: "enum", enumValues: ["text", "json"] };
    case "scheduleType":
      return { ...defaultField, type: "enum", enumValues: ["interval", "daily", "weekly"] };
    case "trigger":
      return { ...defaultField, type: "enum", enumValues: ["manual", "schedule", "event"] };
    case "assetIds":
    case "artifactIds":
    case "creativeAssetIds":
    case "knowledgeBase":
    case "localEndFrameImages":
    case "localReferenceAudios":
    case "localReferenceImages":
    case "localReferenceVideos":
    case "localStartFrameImages":
    case "lockedDetails":
    case "avoid":
    case "platforms":
    case "uploadedMedia":
      return {
        ...defaultField,
        label: key === "localReferenceImages"
          ? "Reference images"
          : key === "localStartFrameImages"
            ? "Start frame"
            : key === "localEndFrameImages"
              ? "End frame"
              : key === "localReferenceVideos"
                ? "Reference videos"
                : key === "localReferenceAudios"
                  ? "Reference audio"
                  : key === "uploadedMedia"
                    ? "Reference files"
                    : defaultField.label,
        type: "json",
        advanced: ![
          "localEndFrameImages",
          "localReferenceImages",
          "localReferenceVideos",
          "localReferenceAudios",
          "localStartFrameImages",
          "uploadedMedia",
        ].includes(key),
      };
    default:
      return defaultField;
  }
}

export function normalizeConfigField(field: ConfigField): ConfigField {
  if (field.key === "aspectRatio") {
    return {
      ...field,
      advanced: false,
      required: true,
      type: "enum",
      enumValues: creatorAspectRatioOptions,
    };
  }

  return field;
}

function imageConfigFieldHiddenByContract(
  key: string,
  imageContract?: ImageModelUiContract | null
): boolean {
  if ((key === "prompt" || key === "promptFromInputNode") && imageContract?.prompt.visible === false) return true;
  if (key === "promptFromInputNode" && imageContract?.prompt.canComeFromInput === false) return true;
  if (key === "prompt" && imageContract?.prompt.canBeConfiguredLocally === false) return true;
  if ((key === "localReferenceImages" || key === "imageFromInputNode") && imageContract?.images.visible === false) return true;
  if (key === "imageFromInputNode" && imageContract?.images.canComeFromInput === false) return true;
  if (key === "localReferenceImages" && imageContract?.images.canBeUploadedLocally === false) return true;
  return false;
}

export function configFieldHiddenForNode(
  type: WorkflowNodeType,
  key: string,
  config: Record<string, unknown>,
  selectedModel: ProviderModelDoc | null,
  imageContract?: ImageModelUiContract | null
): boolean {
  const operation = generationOperationForConfig(type, config);
  if (hiddenImageGenerationConfigKeys.has(key)) return true;
  const creatorMediaFieldKeys = creatorMediaConfigFieldKeysByNodeType[type];
  if (creatorMediaFieldKeys && !creatorMediaFieldKeys.has(key)) return true;
  if (
    type === "media" &&
    ["artifactIds", "creativeAssetIds", "referenceInstructions"].includes(key)
  ) {
    return true;
  }
  if (type === "image_generation" && imageConfigFieldHiddenByContract(key, imageContract)) return true;
  if (type === "image_generation") {
    if (
      operation?.id === "image_text_to_image" &&
      ["imageFromInputNode", "localReferenceImages"].includes(key)
    ) {
      return true;
    }
  }
  if (type === "video_generation") {
    if (operation?.id === "video_text_to_video") {
      if (
        [
          "imageFromInputNode",
          "startEndFrameMode",
          "localReferenceImages",
          "localStartFrameImages",
          "localEndFrameImages",
          "localReferenceVideos",
        ].includes(key)
      ) {
        return true;
      }
    }
    if (operation?.id === "video_image_to_video") {
      if (
        [
          "startEndFrameMode",
          "localStartFrameImages",
          "localEndFrameImages",
          "localReferenceVideos",
        ].includes(key)
      ) {
        return true;
      }
    }
    if (operation?.id === "video_reference_to_video") {
      if (
        [
          "imageFromInputNode",
          "startEndFrameMode",
          "localStartFrameImages",
          "localEndFrameImages",
        ].includes(key)
      ) {
        return true;
      }
    }
    if (operation?.id === "video_start_end_frame") {
      if (["imageFromInputNode", "localReferenceImages", "localReferenceVideos"].includes(key)) {
        return true;
      }
    }
  }
  if (type === "audio_generation") {
    if (
      operation?.id !== "audio_voice_clone" &&
      ["voiceFromInputNode", "localReferenceAudios", "voice"].includes(key)
    ) {
      return true;
    }
  }
  if (!selectedModel) return false;
  if (type === "video_generation" && key === "resolution") return true;
  if (type === "lipsync" && ["resolution", "turboMode"].includes(key)) return true;
  if (type === "ai_video_editor" && ["aspectRatio", "maxDurationSeconds", "renderMode"].includes(key)) return true;
  if (type === "audio_generation" && ["cfgScale", "temperature"].includes(key)) return true;
  return false;
}

export function sortConfigFieldsForNode(type: WorkflowNodeType, fields: ConfigField[]): ConfigField[] {
  return [...fields].sort((a, b) => {
    const fieldOrder = fieldOrderByType[type];
    if (fieldOrder) {
      const aIndex = fieldOrder.indexOf(a.key);
      const bIndex = fieldOrder.indexOf(b.key);
      if (aIndex !== bIndex) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
          (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }
    }

    if (a.advanced !== b.advanced) return a.advanced ? 1 : -1;
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}
