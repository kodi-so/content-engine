export type WorkflowAgentPresetId =
  | "analyze_input"
  | "script_writer"
  | "prompt_variation"
  | "image_prompting"
  | "video_prompting";

export type WorkflowAgentOutputKind = "analysis" | "script" | "prompt";

export type WorkflowAgentPreset = {
  id: WorkflowAgentPresetId;
  label: string;
  outputKind: WorkflowAgentOutputKind;
  artifactType: "text_draft" | "script" | "prompt";
  systemPrompt: string;
};

export type WorkflowAgentPromptInput = {
  request?: string;
  contextText?: string;
  mediaText?: string;
  config: Record<string, unknown>;
};

export const WORKFLOW_AGENT_PRESETS: WorkflowAgentPreset[] = [
  {
    id: "analyze_input",
    label: "Analyze Input",
    outputKind: "analysis",
    artifactType: "text_draft",
    systemPrompt:
      "You are a senior content strategist. Analyze the supplied source material and return concise, practical guidance for an automated content workflow.",
  },
  {
    id: "script_writer",
    label: "Script Writer",
    outputKind: "script",
    artifactType: "script",
    systemPrompt:
      "You are a short-form social video script writer. Write natural spoken scripts with strong hooks, clear pacing, and platform-aware structure.",
  },
  {
    id: "prompt_variation",
    label: "Prompt Variation",
    outputKind: "prompt",
    artifactType: "prompt",
    systemPrompt:
      "You are a prompt variation engine. Produce one usable prompt variation that preserves locked creative constraints while varying the requested dimensions.",
  },
  {
    id: "image_prompting",
    label: "Image Prompting Agent",
    outputKind: "prompt",
    artifactType: "prompt",
    systemPrompt:
      "You are an image prompting agent for AI content production. Write specific, grounded image prompts with camera, subject, scene, lighting, and composition details.",
  },
  {
    id: "video_prompting",
    label: "Video Prompting Agent",
    outputKind: "prompt",
    artifactType: "prompt",
    systemPrompt:
      "You are a video prompting agent for AI content production. Write specific, cinematic video prompts with subject, scene, movement, timing, camera, and continuity details.",
  },
];

function valueText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return undefined;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

function configLine(
  config: Record<string, unknown>,
  key: string,
  label: string
): string | undefined {
  const text = valueText(config[key]);
  return text ? `${label}: ${text}` : undefined;
}

function basePromptSections(input: WorkflowAgentPromptInput): string[] {
  const config = input.config;
  return [
    input.request ? `Request:\n${input.request}` : undefined,
    input.contextText ? `Context:\n${input.contextText}` : undefined,
    input.mediaText ? `Media references:\n${input.mediaText}` : undefined,
    [
      configLine(config, "platform", "Platform"),
      configLine(config, "tone", "Tone"),
      configLine(config, "lockedDetails", "Locked details"),
      configLine(config, "avoid", "Avoid"),
    ].filter(Boolean).join("\n"),
  ].filter((section): section is string => Boolean(section?.trim()));
}

function presetSpecificSection(
  preset: WorkflowAgentPreset,
  config: Record<string, unknown>
): string | undefined {
  const lines =
    preset.id === "analyze_input"
      ? [configLine(config, "analysisFocus", "Analysis focus")]
      : preset.id === "script_writer"
        ? [
            configLine(config, "scriptLengthSeconds", "Script length seconds"),
            configLine(config, "hookStyle", "Hook style"),
            configLine(config, "cta", "Call to action"),
          ]
        : preset.id === "prompt_variation"
          ? [configLine(config, "variationGoal", "Variation goal")]
          : preset.id === "image_prompting"
            ? [
                configLine(config, "aspectRatio", "Aspect ratio"),
                configLine(config, "referenceImageUrl", "Reference image URL"),
              ]
            : [
                configLine(config, "aspectRatio", "Aspect ratio"),
                configLine(config, "durationSeconds", "Duration seconds"),
                configLine(config, "motionStyle", "Motion style"),
                configLine(config, "referenceVideoUrl", "Reference video URL"),
              ];

  const section = lines.filter(Boolean).join("\n");
  return section || undefined;
}

export function getWorkflowAgentPreset(id: unknown): WorkflowAgentPreset {
  const preset = WORKFLOW_AGENT_PRESETS.find((candidate) => candidate.id === id);
  return preset ?? WORKFLOW_AGENT_PRESETS[2];
}

export function buildWorkflowAgentPrompt(
  preset: WorkflowAgentPreset,
  input: WorkflowAgentPromptInput
): string {
  const presetSection = presetSpecificSection(preset, input.config);
  const sections = [
    ...basePromptSections(input),
    presetSection ? `Preset settings:\n${presetSection}` : undefined,
    `Return strict JSON with this shape:
{
  "outputKind": "${preset.outputKind}",
  "text": "The primary human-readable output.",
  "${preset.outputKind}": "The same primary output in the field matching outputKind.",
  "summary": "One sentence explaining what was produced.",
  "metadata": {}
}

Do not include markdown fences or explanatory text outside the JSON object.`,
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n\n");
}
