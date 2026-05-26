export type WorkflowAgentPresetId =
  | "analyze_input"
  | "script_writer"
  | "prompt_variation"
  | "image_prompting"
  | "video_prompting";

export type WorkflowAgentPreset = {
  id: WorkflowAgentPresetId;
  label: string;
  description: string;
  outputKind: "analysis" | "script" | "prompt";
  configKeys: string[];
};

const commonAgentConfigKeys = [
  "agentMode",
  "requestFromInputNode",
  "request",
  "tone",
  "platform",
  "temperature",
  "maxTokens",
  "seed",
];

export const WORKFLOW_AGENT_PRESETS: WorkflowAgentPreset[] = [
  {
    id: "analyze_input",
    label: "Analyze Input",
    description: "Summarizes source material, angles, constraints, and next-step recommendations.",
    outputKind: "analysis",
    configKeys: [...commonAgentConfigKeys, "analysisFocus"],
  },
  {
    id: "script_writer",
    label: "Script Writer",
    description: "Writes a short-form spoken script calibrated to a target duration.",
    outputKind: "script",
    configKeys: [...commonAgentConfigKeys, "scriptLengthSeconds", "hookStyle", "cta"],
  },
  {
    id: "prompt_variation",
    label: "Prompt Variation",
    description: "Creates one high-quality prompt variation for repeated workflow runs.",
    outputKind: "prompt",
    configKeys: [...commonAgentConfigKeys, "variationGoal", "lockedDetails", "avoid"],
  },
  {
    id: "image_prompting",
    label: "Image Prompting Agent",
    description: "Turns a content request and context into a production-ready image prompt.",
    outputKind: "prompt",
    configKeys: [...commonAgentConfigKeys, "aspectRatio", "referenceImageUrl", "lockedDetails", "avoid"],
  },
  {
    id: "video_prompting",
    label: "Video Prompting Agent",
    description: "Turns a content request and context into a production-ready video prompt.",
    outputKind: "prompt",
    configKeys: [
      ...commonAgentConfigKeys,
      "aspectRatio",
      "durationSeconds",
      "referenceVideoUrl",
      "motionStyle",
      "lockedDetails",
      "avoid",
    ],
  },
];

export function getWorkflowAgentPreset(
  id: unknown
): WorkflowAgentPreset {
  const preset = WORKFLOW_AGENT_PRESETS.find((candidate) => candidate.id === id);
  return preset ?? WORKFLOW_AGENT_PRESETS[2];
}

export function workflowAgentPresetIds(): WorkflowAgentPresetId[] {
  return WORKFLOW_AGENT_PRESETS.map((preset) => preset.id);
}
