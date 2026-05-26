import type { ActionCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import type { buildOverlayPlannerPrompt } from "../../content/planning";
import { workflowGraphValidator } from "../../validators";
import type { ResolvedInputsForRun } from "./inputValues";

export type WorkflowGraphForRun = typeof workflowGraphValidator.type;
export type WorkflowGraphNodeForRun = WorkflowGraphForRun["nodes"][number];
export type ArtifactDocForRun = Doc<"artifacts">;

export type WorkflowRunExecutionContext = {
  run: Doc<"workflowRuns">;
  workflow: Doc<"workflows">;
  brand: Parameters<typeof buildOverlayPlannerPrompt>[0]["brand"];
  socialAccount?: Parameters<typeof buildOverlayPlannerPrompt>[0]["socialAccount"] | null;
};

export type WorkflowNodeHandlerArgs = {
  ctx: ActionCtx;
  context: WorkflowRunExecutionContext;
  graph: WorkflowGraphForRun;
  node: WorkflowGraphNodeForRun;
  resolvedInputs: ResolvedInputsForRun;
};

export type WorkflowNodeHandlerResult = {
  costUsd: number;
  emittedArtifactIds?: Id<"artifacts">[];
  finalPackageArtifactIds?: Id<"artifacts">[];
};
