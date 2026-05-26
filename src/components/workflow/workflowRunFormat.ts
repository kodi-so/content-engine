import type { Doc } from "../../../convex/_generated/dataModel";

export type WorkflowRunDoc = Doc<"workflowRuns">;

export function formatTimestamp(value?: number): string {
  if (!value) return "Not started";
  return new Date(value).toLocaleString();
}

export function formatDuration(run: WorkflowRunDoc): string {
  const start = run.startedAt ?? run.createdAt;
  const end = run.completedAt ?? Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}
