import type { ActionCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { workflowGraphValidator } from "../../validators";
import type { ResolvedInputsForRun } from "./inputValues";

export type WorkflowGraphForRun = typeof workflowGraphValidator.type;
export type WorkflowGraphNodeForRun = WorkflowGraphForRun["nodes"][number];
export type ArtifactDocForRun = Doc<"artifacts">;

export type WorkflowRunExecutionContext = {
  run: Doc<"workflowRuns">;
  workflow: Doc<"workflows">;
  socialAccount?: Doc<"socialAccounts"> | null;
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
