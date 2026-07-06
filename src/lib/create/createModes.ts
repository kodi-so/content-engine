export type ProviderModelCategory = "chat" | "image" | "video" | "video_render" | "audio" | "lipsync" | "unknown";
export type CreateNodeType = "image_generation" | "video_generation" | "audio_generation" | "native_slideshow_planner";

export type CreateMode = "image" | "video" | "audio" | "slideshow";

export type CreateModeDefinition = {
  id: CreateMode;
  label: string;
  description: string;
  promptLabel: string;
  promptPlaceholder: string;
  modelCategory?: ProviderModelCategory;
  defaultModel?: string;
};

export const CREATE_MODE_DEFINITIONS: CreateModeDefinition[] = [
  {
    id: "image",
    label: "Image",
    description: "Generate a saved image or reference asset.",
    promptLabel: "Image prompt",
    promptPlaceholder: "A vertical studio portrait of a confident fitness creator, natural light, clean background...",
    modelCategory: "image",
  },
  {
    id: "video",
    label: "Video",
    description: "Generate a short video from a prompt and optional image references.",
    promptLabel: "Video prompt",
    promptPlaceholder: "A 5 second vertical TikTok-style clip with subtle handheld motion and clean framing...",
    modelCategory: "video",
  },
  {
    id: "audio",
    label: "Audio",
    description: "Generate voice, music, or sound effects.",
    promptLabel: "Text or sound prompt",
    promptPlaceholder: "A warm, energetic voiceover saying: here is what changed in five months...",
    modelCategory: "audio",
  },
  {
    id: "slideshow",
    label: "Slideshow",
    description: "Plan and render an editable native slideshow.",
    promptLabel: "Slideshow topic",
    promptPlaceholder: "Create a 6-slide TikTok slideshow about why most fitness transformations fail after week two...",
  },
];

export function getCreateModeDefinition(mode: CreateMode) {
  return CREATE_MODE_DEFINITIONS.find((definition) => definition.id === mode) ??
    CREATE_MODE_DEFINITIONS[0];
}

export function createNodeTypeForMode(
  mode: CreateMode
): CreateNodeType | undefined {
  switch (mode) {
    case "image":
      return "image_generation";
    case "video":
      return "video_generation";
    case "audio":
      return "audio_generation";
    case "slideshow":
      return "native_slideshow_planner";
  }
}
