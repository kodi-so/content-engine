import {
  WORKFLOW_GRAPH_SCHEMA_VERSION,
  type WorkflowGraph,
} from "./workflowGraph";

export type WorkflowTemplateId = "persona_image_set";

export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  name: string;
  description: string;
  contentFormat: "static_image";
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "persona_image_set",
    name: "Persona image set",
    description: "Generate reusable image variations for a selected persona.",
    contentFormat: "static_image",
  },
];

export function createPersonaImageSetWorkflowGraph(): WorkflowGraph {
  return {
    schemaVersion: WORKFLOW_GRAPH_SCHEMA_VERSION,
    nodes: [
      {
        id: "runner",
        type: "runner",
        label: "Runner",
        position: { x: 80, y: 270 },
        config: {
          trigger: "manual",
          scheduleType: "interval",
          intervalHours: 24,
          timezone: "America/Chicago",
          runsPerExecution: 1,
          retryCount: 0,
          timeoutSeconds: 1200,
          failureBehavior: "stop_workflow",
        },
      },
      {
        id: "persona_media",
        type: "media",
        label: "Persona References",
        position: { x: 360, y: 90 },
        config: {
          artifactIds: [],
          creativeAssetIds: [],
          personaIds: [],
          uploadedMedia: [],
        },
        retention: { mode: "keep", exposeInLibrary: false },
      },
      {
        id: "persona_prompt_agent",
        type: "ai_agent",
        label: "Persona Prompt Agent",
        position: { x: 360, y: 270 },
        provider: "bulkapis",
        config: {
          agentMode: "image_prompting",
          request:
            "Write one production-ready image prompt for a reusable generated persona reference. Preserve the selected persona identity and create a natural everyday UGC-style image. Vary the setting, outfit, pose, phone camera, lighting direction, and small environmental imperfections. Output the full prompt only.",
          tone: "natural",
          platform: "tiktok",
          aspectRatio: "9:16",
          lockedDetails:
            "Use the selected persona references and identity prompt. Keep face, age, skin tone, hair, body type, and recognizable identity consistent.",
          avoid: [
            "stock photo look",
            "beauty lighting",
            "flawless skin",
            "watermarks",
            "text overlays",
            "complex hand gestures",
          ],
        },
        retention: { mode: "discard" },
      },
      {
        id: "generate_persona_images",
        type: "image_generation",
        label: "Generate Persona Images",
        position: { x: 680, y: 270 },
        provider: "bulkapis",
        config: {
          prompt: "",
          aspectRatio: "9:16",
          count: 4,
        },
        retention: { mode: "keep", exposeInLibrary: true },
      },
      {
        id: "export_generated_set",
        type: "export",
        label: "Export Generated Set",
        position: { x: 1000, y: 270 },
        config: {
          destination: "media_library",
          folder: "personas/generated",
          fileName: "persona-image-set",
          optimizeFor: "tiktok",
        },
        retention: { mode: "keep", exposeInLibrary: true },
      },
      {
        id: "operator_note",
        type: "comment",
        label: "Operator Note",
        position: { x: 360, y: 520 },
        config: {
          text:
            "Select one or more personas in the Persona References node, tune the prompt agent, run the workflow, then attach approved outputs to the persona as generated assets in Persona Studio.",
        },
      },
    ],
    edges: [
      {
        id: "runner-to-prompt-agent",
        sourceNodeId: "runner",
        sourcePort: "run",
        targetNodeId: "persona_prompt_agent",
        targetPort: "context",
      },
      {
        id: "persona-media-to-prompt-agent",
        sourceNodeId: "persona_media",
        sourcePort: "media",
        targetNodeId: "persona_prompt_agent",
        targetPort: "media",
      },
      {
        id: "persona-media-to-image-reference",
        sourceNodeId: "persona_media",
        sourcePort: "image",
        targetNodeId: "generate_persona_images",
        targetPort: "reference_image",
      },
      {
        id: "prompt-agent-to-image-generation",
        sourceNodeId: "persona_prompt_agent",
        sourcePort: "prompt",
        targetNodeId: "generate_persona_images",
        targetPort: "prompt",
      },
      {
        id: "image-generation-to-export",
        sourceNodeId: "generate_persona_images",
        sourcePort: "image",
        targetNodeId: "export_generated_set",
        targetPort: "input",
      },
    ],
    canvas: {
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
    runSettings: {
      mode: "test",
      artifactRetention: "keep_all",
    },
  };
}

export function createWorkflowGraphFromTemplate(
  templateId: WorkflowTemplateId
): WorkflowGraph {
  if (templateId === "persona_image_set") {
    return createPersonaImageSetWorkflowGraph();
  }

  throw new Error(`Unknown workflow template: ${String(templateId)}`);
}
