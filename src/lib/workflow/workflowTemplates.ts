import type { WorkflowGraph } from "./workflowGraph";
import { WORKFLOW_TEMPLATES } from "./workflowTemplateCatalog";
import type { WorkflowTemplate, WorkflowTemplateDraftInput, WorkflowTemplateId } from "./workflowTemplateTypes";

export { WORKFLOW_TEMPLATES } from "./workflowTemplateCatalog";
export type {
  WorkflowTemplate,
  WorkflowTemplateCategory,
  WorkflowTemplateDraftInput,
  WorkflowTemplateId,
  WorkflowTemplatePlaceholder,
  WorkflowTemplatePlaceholderKind,
} from "./workflowTemplateTypes";

export function getWorkflowTemplate(templateId: WorkflowTemplateId): WorkflowTemplate {
  const template = WORKFLOW_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error(`Unknown workflow template: ${String(templateId)}`);
  return template;
}

export function listWorkflowTemplates(): WorkflowTemplate[] {
  return [...WORKFLOW_TEMPLATES];
}

function requestPlaceholderValues(creativeRequest: string): Record<string, string> {
  return {
    APP_FEATURE: creativeRequest,
    CAPTION: creativeRequest,
    CREATIVE_REQUEST: creativeRequest,
    CTA: "Try it today",
    FILE_NAME: "workflow-draft",
    OUTPUT_FOLDER: "workflow-drafts",
    POST_NAME: creativeRequest,
    PRODUCT_CONTEXT: creativeRequest,
    SLIDESHOW_TOPIC: creativeRequest,
    TOPIC: creativeRequest,
    TRANSFORMATION_CONTEXT: creativeRequest,
  };
}

function hydrateTemplateValue(value: unknown, placeholders: Record<string, string>): unknown {
  if (typeof value === "string") {
    return Object.entries(placeholders).reduce(
      (currentValue, [key, replacement]) =>
        currentValue.split(`{{${key}}}`).join(replacement),
      value
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => hydrateTemplateValue(item, placeholders));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        hydrateTemplateValue(nestedValue, placeholders),
      ])
    );
  }

  return value;
}

function attachCreativeRequest(graph: WorkflowGraph, creativeRequest?: string): WorkflowGraph {
  const request = creativeRequest?.trim();
  if (!request) return graph;

  const placeholders = requestPlaceholderValues(request);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const config = hydrateTemplateValue(node.config, placeholders) as Record<string, unknown>;
      const prompt = typeof config.prompt === "string" ? config.prompt.trim() : "";
      const requestText = typeof config.request === "string" ? config.request.trim() : "";

      return {
        ...node,
        config: {
          ...config,
          ...(prompt ? { prompt } : node.type === "native_slideshow_planner" ? { prompt: request } : {}),
          ...(requestText ? { request: `${requestText}\n\nCreative request:\n${request}` } : {}),
        },
      };
    }),
  };
}

export function createWorkflowGraphFromTemplate(
  templateId: WorkflowTemplateId,
  draft?: WorkflowTemplateDraftInput
): WorkflowGraph {
  return attachCreativeRequest(
    structuredClone(getWorkflowTemplate(templateId).graph),
    draft?.creativeRequest
  );
}
