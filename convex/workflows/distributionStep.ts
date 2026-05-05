import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  artifactIdsForRefs,
  createArtifact,
  getConfig,
  getStringConfig,
  reviewStatusForWorkflow,
  type StepOutputs,
  type WorkflowExecutionContext,
  type WorkflowStep,
} from "./execution";

export async function executeDistributionPlanStep(
  ctx: ActionCtx,
  context: WorkflowExecutionContext,
  step: WorkflowStep,
  outputs: StepOutputs
): Promise<Id<"artifacts">[]> {
  const config = getConfig(step);
  const artifactIds = artifactIdsForRefs(outputs, step.inputRefs);
  const socialAccountIds = context.run.socialAccountId ? [context.run.socialAccountId] : [];
  const scheduledFor = typeof config.scheduledFor === "number" ? config.scheduledFor : undefined;
  const timezone = getStringConfig(config, "timezone");

  const planId = await ctx.runMutation(internal.publishing.distributionPlans.createFromRunner, {
    userId: context.run.userId,
    brandId: context.run.brandId,
    workflowId: context.workflow._id,
    workflowRunId: context.run._id,
    artifactIds,
    socialAccountIds,
    provider: context.workflow.publishingPolicy.provider,
    status: context.workflow.approvalPolicy.mode === "never" ? "draft" : "waiting_for_approval",
    scheduledFor,
    timezone,
    providerPayload: {
      stepId: step.id,
      autoPublish: context.workflow.publishingPolicy.autoPublish,
      defaultPlatforms: context.workflow.publishingPolicy.defaultPlatforms,
    },
  });

  const artifactId = await createArtifact(ctx, context, step, {
    type: "publish_payload",
    title: step.name,
    data: {
      distributionPlanId: planId,
      artifactIds,
      socialAccountIds,
    },
    parentArtifactIds: artifactIds,
    reviewStatus: reviewStatusForWorkflow(context),
  });

  return [artifactId];
}
