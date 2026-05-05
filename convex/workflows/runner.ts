import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { executeDistributionPlanStep } from "./distributionStep";
import {
  getRunExecutionContext,
  recordEvent,
  type StepOutputs,
} from "./execution";
import {
  executeModelStep,
  executeResolveModelJobStep,
} from "./modelSteps";
import {
  executeImagePromptStep,
  executeRenderSlideshowStep,
} from "./slideshowSteps";

export const executeRun = internalAction({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const context = await getRunExecutionContext(ctx, args.runId);
    if (!context) {
      throw new Error("Workflow run context not found");
    }

    const outputs: StepOutputs = {};
    let totalCostUsd = 0;

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "running",
    });

    try {
      for (const step of context.version.steps) {
        await ctx.runMutation(internal.workflows.runs.transitionRun, {
          runId: context.run._id,
          status: "running",
          currentStepId: step.id,
          costUsd: totalCostUsd,
        });
        await recordEvent(ctx, context, step, "step_started", `Started ${step.name}.`);

        let artifactIds: Id<"artifacts">[] = [];
        let costUsd = 0;

        if (
          step.type === "generate_text" ||
          step.type === "generate_structured" ||
          step.type === "create_caption" ||
          step.type === "generate_image" ||
          step.type === "generate_video"
        ) {
          const result = await executeModelStep(ctx, context, step, outputs);
          artifactIds = result.artifactIds;
          costUsd = result.costUsd;
        } else if (step.type === "create_distribution_plan") {
          artifactIds = await executeDistributionPlanStep(ctx, context, step, outputs);
        } else if (step.type === "create_image_prompts") {
          artifactIds = await executeImagePromptStep(ctx, context, step, outputs);
        } else if (step.type === "resolve_model_job") {
          artifactIds = await executeResolveModelJobStep(ctx, context, step, outputs);
        } else if (step.type === "render_slideshow") {
          artifactIds = await executeRenderSlideshowStep(ctx, context, step, outputs);
        } else if (step.type === "request_approval") {
          await recordEvent(ctx, context, step, "approval_requested", "Workflow is waiting for approval.");
          await ctx.runMutation(internal.workflows.runs.transitionRun, {
            runId: context.run._id,
            status: "waiting_for_approval",
            currentStepId: step.id,
            costUsd: totalCostUsd,
          });
          return;
        } else {
          throw new Error(`Unsupported workflow step type: ${step.type}`);
        }

        totalCostUsd += costUsd;
        if (step.outputRef) {
          outputs[step.outputRef] = artifactIds;
        }

        await recordEvent(ctx, context, step, "step_completed", `Completed ${step.name}.`, {
          artifactIds,
          costUsd,
        });
      }

      await ctx.runMutation(internal.workflows.runs.transitionRun, {
        runId: context.run._id,
        status: "completed",
        summary: `Completed ${context.version.steps.length} workflow steps.`,
        costUsd: totalCostUsd,
        completedAt: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow runner failed.";
      await recordEvent(ctx, context, null, "error", message);
      await ctx.runMutation(internal.workflows.runs.transitionRun, {
        runId: context.run._id,
        status: "failed",
        costUsd: totalCostUsd,
        errorMessage: message,
        completedAt: Date.now(),
      });
    }
  },
});
