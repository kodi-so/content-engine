import type { ConfigField } from "./createConfigFields";
import {
  localReferenceFilesFromConfig,
} from "./createConfigFields";
import {
  defaultDurationForFalVideoModel,
  falVideoDurationConstraintForModel,
} from "../generation/videoDurationConstraints";
import type { CreateMode } from "./createModes";
import type { RosterModel } from "../generation/modelRoster";

export type CreateGenerationMode = Extract<CreateMode, "image" | "video" | "audio">;

export type CreateGenerationFieldGroups = {
  promptFields: ConfigField[];
  referenceFields: ConfigField[];
  coreFields: ConfigField[];
};

const promptFieldKeys = new Set(["prompt", "text"]);
const referenceFieldKeys = new Set([
  "localEndFrameImages",
  "localReferenceImages",
  "localReferenceVideos",
  "localReferenceAudios",
  "localStartFrameImages",
  "startEndFrameMode",
]);
const coreFieldKeys = new Set([
  "aspectRatio",
  "count",
  "durationSeconds",
  "mode",
  "voice",
]);

export function isCreateGenerationMode(mode: CreateMode): mode is CreateGenerationMode {
  return mode === "image" || mode === "video" || mode === "audio";
}

export function defaultCreateGenerationConfig(mode: CreateMode): Record<string, unknown> {
  switch (mode) {
    case "image":
      return {
        generationOperation: "image_text_to_image",
        prompt: "",
        aspectRatio: "4:5",
        count: 1,
        localReferenceImages: [],
      };
    case "video":
      return {
        generationOperation: "video_image_to_video",
        prompt: "",
        aspectRatio: "9:16",
        durationSeconds: 5,
        startEndFrameMode: false,
        localStartFrameImages: [],
        localEndFrameImages: [],
        localReferenceImages: [],
        localReferenceVideos: [],
      };
    case "audio":
      return {
        generationOperation: "audio_text_to_speech",
        mode: "tts",
        text: "",
        localReferenceAudios: [],
      };
    case "slideshow":
      return {};
  }
}

export function createGenerationPromptValue(
  mode: CreateMode,
  config: Record<string, unknown>
): string {
  const value = mode === "audio" ? config.text ?? config.prompt : config.prompt;
  return typeof value === "string" ? value.trim() : "";
}

export function createGenerationFields(args: {
  config: Record<string, unknown>;
  mode: CreateGenerationMode;
  selectedModel: RosterModel | null;
}): ConfigField[] {
  switch (args.mode) {
    case "image":
      return [
        {
          key: "prompt",
          label: "Prompt",
          type: "textarea",
          required: true,
        },
        {
          key: "localReferenceImages",
          label: "Reference images",
          type: "json",
          description: "Optional images to edit, blend, or use as style references.",
        },
        {
          key: "aspectRatio",
          label: "Aspect ratio",
          type: "enum",
          enumValues: ["9:16", "4:5", "1:1", "16:9"],
          defaultValue: "4:5",
        },
        {
          key: "count",
          label: "Count",
          type: "number",
          defaultValue: 1,
        },
      ];
    case "video":
      return [
        {
          key: "prompt",
          label: "Prompt",
          type: "textarea",
          required: true,
        },
        {
          key: "localReferenceImages",
          label: "Reference images",
          type: "json",
          description: "Optional source images or visual references.",
        },
        {
          key: "localReferenceVideos",
          label: "Reference videos",
          type: "json",
          description: "Optional motion references for supported models.",
        },
        {
          key: "startEndFrameMode",
          label: "Use start and end frames",
          type: "boolean",
          description: "Provide the first and last frame for models that support interpolation.",
          defaultValue: false,
        },
        {
          key: "localStartFrameImages",
          label: "Start frame",
          type: "json",
        },
        {
          key: "localEndFrameImages",
          label: "End frame",
          type: "json",
        },
        {
          key: "aspectRatio",
          label: "Aspect ratio",
          type: "enum",
          enumValues: ["9:16", "4:5", "1:1", "16:9"],
          defaultValue: "9:16",
        },
        createVideoDurationField({
          key: "durationSeconds",
          label: "Duration",
          type: "number",
          defaultValue: 5,
        }, args.selectedModel),
      ];
    case "audio":
      return [
        {
          key: "text",
          label: "Text or sound prompt",
          type: "textarea",
          required: true,
        },
        {
          key: "localReferenceAudios",
          label: "Voice references",
          type: "json",
          description: "Optional audio references for voice cloning.",
        },
        {
          key: "mode",
          label: "Audio mode",
          type: "enum",
          enumValues: ["tts", "voice_clone", "sfx", "music"],
          defaultValue: "tts",
        },
      ];
  }
}

function createVideoDurationField(
  field: ConfigField,
  selectedModel: RosterModel | null
): ConfigField {
  if (!selectedModel) {
    return {
      ...field,
      disabled: true,
      description: "Choose a model to see its supported durations.",
    };
  }

  const modelId = selectedModel.imageToVideoModelId ??
    selectedModel.textToVideoModelId ??
    selectedModel.referenceToVideoModelId ??
    selectedModel.falModelId;
  if (!modelId?.startsWith("fal-ai/")) return field;

  const constraint = falVideoDurationConstraintForModel(modelId);
  if (!constraint) return field;

  if (constraint.kind === "enum") {
    return {
      ...field,
      type: "enum",
      enumValues: constraint.values.map(String),
      defaultValue: field.defaultValue ?? constraint.defaultValue,
      description: `Supported durations: ${constraint.values.join(", ")} seconds.`,
    };
  }

  if (constraint.kind === "integerRange") {
    return {
      ...field,
      description: `Choose a whole number from ${constraint.min}-${constraint.max} seconds.`,
      defaultValue: field.defaultValue ?? constraint.defaultValue,
    };
  }

  return {
    ...field,
    description: `This model maps duration to frame count at ${constraint.fps} fps.`,
    defaultValue: field.defaultValue ?? defaultDurationForFalVideoModel(modelId),
  };
}

export function groupCreateGenerationFields(
  fields: ConfigField[]
): CreateGenerationFieldGroups {
  const groups: CreateGenerationFieldGroups = {
    promptFields: [],
    referenceFields: [],
    coreFields: [],
  };

  for (const field of fields) {
    if (promptFieldKeys.has(field.key)) {
      groups.promptFields.push(field);
    } else if (referenceFieldKeys.has(field.key)) {
      groups.referenceFields.push(field);
    } else if (coreFieldKeys.has(field.key)) {
      groups.coreFields.push(field);
    }
  }

  return groups;
}

export function createGenerationRequiredFieldsSatisfied(args: {
  config: Record<string, unknown>;
  fields: ConfigField[];
}): boolean {
  const requiredFields = args.fields.filter((field) => field.required);
  if (!requiredFields.length) return true;

  return requiredFields.every((field) => {
    if (referenceFieldKeys.has(field.key)) {
      const kind = field.key === "localReferenceAudios"
        ? "audio"
        : field.key === "localReferenceVideos"
          ? "video"
          : "image";
      return localReferenceFilesFromConfig(args.config, field.key, kind).length > 0;
    }

    const value = args.config[field.key];
    if (typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null;
  });
}

export function providerInputFromCreateConfig(
  config: Record<string, unknown>,
  excludedKeys: string[]
): Record<string, unknown> {
  const excluded = new Set(excludedKeys);
  const providerInput: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (
      excluded.has(key) ||
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      continue;
    }
    providerInput[key] = value;
  }

  return providerInput;
}
