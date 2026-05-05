import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { ArtifactType } from "../content/formatContracts";
import type { ModelProviderName } from "../providers/model";

export type WorkflowStep = Doc<"workflowVersions">["steps"][number];

export type WorkflowExecutionContext = {
  run: Doc<"workflowRuns">;
  workflow: Doc<"workflows">;
  version: Doc<"workflowVersions">;
  brand: Doc<"brands">;
  socialAccount: Doc<"socialAccounts"> | null;
};

export type StepOutputs = Record<string, Id<"artifacts">[]>;

export async function getRunExecutionContext(
  ctx: ActionCtx,
  runId: Id<"workflowRuns">
): Promise<WorkflowExecutionContext | null> {
  return await ctx.runQuery(internal.workflows.runs.getExecutionContext, { runId });
}

export function getConfig(step: WorkflowStep): Record<string, unknown> {
  return step.config && typeof step.config === "object"
    ? (step.config as Record<string, unknown>)
    : {};
}

export function getStringConfig(
  config: Record<string, unknown>,
  key: string
): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function getModelProviderName(
  value: unknown,
  fallback: ModelProviderName
): ModelProviderName {
  return value === "gemini" ||
    value === "fal" ||
    value === "openrouter" ||
    value === "manual"
    ? value
    : fallback;
}

export function getArtifactType(value: unknown, fallback: ArtifactType): ArtifactType {
  const artifactTypes: ArtifactType[] = [
    "prompt",
    "text_draft",
    "caption",
    "script",
    "scene_spec",
    "shot_list",
    "image",
    "image_prompt",
    "slide_spec",
    "rendered_slide",
    "rendered_asset",
    "video",
    "thumbnail",
    "publish_payload",
  ];

  return typeof value === "string" && artifactTypes.includes(value as ArtifactType)
    ? (value as ArtifactType)
    : fallback;
}

export function buildDefaultPrompt(
  context: WorkflowExecutionContext,
  step: WorkflowStep
): string {
  return [
    `Create ${context.workflow.contentFormat} content for ${context.brand.name}.`,
    context.brand.audience ? `Audience: ${context.brand.audience}` : undefined,
    context.brand.voice ? `Voice: ${context.brand.voice}` : undefined,
    context.brand.visualStyle ? `Visual style: ${context.brand.visualStyle}` : undefined,
    context.workflow.description ? `Workflow: ${context.workflow.description}` : undefined,
    `Step: ${step.name}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function artifactIdsForRefs(
  outputs: StepOutputs,
  refs?: string[]
): Id<"artifacts">[] {
  if (!refs || refs.length === 0) {
    return Object.values(outputs).flat();
  }

  return refs.flatMap((ref) => outputs[ref] ?? []);
}

export function reviewStatusForWorkflow(
  context: WorkflowExecutionContext
): "not_required" | "pending" {
  return context.workflow.approvalPolicy.mode === "never" ? "not_required" : "pending";
}

export async function recordEvent(
  ctx: ActionCtx,
  context: WorkflowExecutionContext,
  step: WorkflowStep | null,
  type:
    | "step_started"
    | "step_completed"
    | "model_call"
    | "artifact_created"
    | "approval_requested"
    | "publish_requested"
    | "error",
  message: string,
  data?: unknown
) {
  await ctx.runMutation(internal.workflows.runs.recordEvent, {
    userId: context.run.userId,
    workflowRunId: context.run._id,
    workflowId: context.workflow._id,
    type,
    stepId: step?.id,
    message,
    data,
  });
}

export async function createArtifact(
  ctx: ActionCtx,
  context: WorkflowExecutionContext,
  step: WorkflowStep,
  args: {
    type: ArtifactType;
    title: string;
    data?: unknown;
    storageUrl?: string;
    provider?: ModelProviderName;
    model?: string;
    prompt?: string;
    parentArtifactIds?: Id<"artifacts">[];
    reviewStatus?: "not_required" | "pending";
  }
): Promise<Id<"artifacts">> {
  const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
    userId: context.run.userId,
    brandId: context.run.brandId,
    workflowId: context.workflow._id,
    workflowRunId: context.run._id,
    parentArtifactIds: args.parentArtifactIds,
    type: args.type,
    title: args.title,
    storageUrl: args.storageUrl,
    data: args.data,
    provider: args.provider,
    model: args.model,
    prompt: args.prompt,
    reviewStatus: args.reviewStatus ?? "not_required",
  });

  await recordEvent(ctx, context, step, "artifact_created", `Created ${args.type}.`, {
    artifactId,
    outputRef: step.outputRef,
  });

  return artifactId;
}

export async function getArtifactsForRefs(
  ctx: ActionCtx,
  outputs: StepOutputs,
  refs: string[] | undefined,
  type?: ArtifactType
): Promise<Doc<"artifacts">[]> {
  const artifactIds = artifactIdsForRefs(outputs, refs);
  const artifacts = await Promise.all(
    artifactIds.map((artifactId) =>
      ctx.runQuery(internal.artifacts.records.getForRunner, { artifactId })
    )
  );

  return artifacts.filter(
    (artifact): artifact is Doc<"artifacts"> =>
      Boolean(artifact && (!type || artifact.type === type))
  );
}
