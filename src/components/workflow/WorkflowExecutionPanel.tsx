import { Activity, AlertCircle, Clock, Play, X } from "lucide-react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { WorkflowGraphValidationResult } from "../../lib/workflow/workflowGraphValidation";
import { formatDuration, formatStatus, formatTimestamp, type WorkflowRunDoc } from "./workflowRunFormat";

export type WorkflowExecutionPanelProps = {
  graphValidation: WorkflowGraphValidationResult | null;
  isCreatingRun: boolean;
  isDirty: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCreateRun: () => void;
  onSelectRun: (runId: Id<"workflowRuns">) => void;
  runActionStatus: string;
  selectedRun: WorkflowRunDoc | null;
  selectedRunArtifacts: Doc<"artifacts">[] | undefined;
  selectedRunEvents: Doc<"workflowRunEvents">[] | undefined;
  selectedRunNodeStates: Doc<"workflowRunNodeStates">[] | undefined;
  workflow: Doc<"workflows">;
  workflowRuns: WorkflowRunDoc[] | undefined;
};

export function WorkflowExecutionPanel({
  graphValidation,
  isCreatingRun,
  isDirty,
  isOpen,
  onClose,
  onCreateRun,
  onSelectRun,
  runActionStatus,
  selectedRun,
  selectedRunArtifacts,
  selectedRunEvents,
  selectedRunNodeStates,
  workflow,
  workflowRuns,
}: WorkflowExecutionPanelProps) {
  return (
    <section
      className={`workflow-execution-panel workflow-side-drawer${
        isOpen ? " workflow-side-drawer-open" : ""
      }`}
      aria-label="Workflow execution panel"
    >
      <div className="workflow-execution-header">
        <div>
          <h2>Execution</h2>
          <p>Runs use the saved graph only. Editing nodes or edges never starts execution.</p>
        </div>
        <div className="workflow-execution-header-actions">
          <button
            className="primary-button"
            disabled={isCreatingRun || isDirty || !graphValidation?.valid}
            onClick={onCreateRun}
            type="button"
          >
            <Play size={16} />
            {isCreatingRun ? "Queueing" : "Run workflow"}
          </button>
          <button
            aria-label="Close executions"
            className="workflow-drawer-close"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="workflow-execution-summary">
        <span>
          <Activity size={14} />
          {graphValidation?.valid ? "Graph valid" : "Graph needs attention"}
        </span>
        <span>
          <Clock size={14} />
          {workflow.trigger === "schedule" ? "Scheduled trigger" : "Manual trigger"}
        </span>
        <span>
          <AlertCircle size={14} />
          {workflow.isActive ? "Active" : "Paused"}
        </span>
        <span>{workflowRuns?.length ?? 0} runs</span>
      </div>

      {isDirty ? (
        <p className="workflow-execution-warning">Save graph changes before starting a run.</p>
      ) : null}
      {!graphValidation?.valid && graphValidation?.errors[0] ? (
        <p className="workflow-execution-warning">{graphValidation.errors[0].message}</p>
      ) : null}
      {runActionStatus ? <p className="workflow-execution-status">{runActionStatus}</p> : null}

      <div className="workflow-execution-grid">
        <div className="workflow-run-history">
          <div className="workflow-execution-section-heading">
            <h3>Recent Runs</h3>
            <span>{workflowRuns ? `${workflowRuns.length}` : "Loading"}</span>
          </div>
          {!workflowRuns ? (
            <p className="workflow-inspector-empty">Loading runs...</p>
          ) : workflowRuns.length ? (
            <div className="workflow-run-list">
              {workflowRuns.slice(0, 8).map((run) => (
                <button
                  className={`workflow-run-row${
                    selectedRun?._id === run._id ? " workflow-run-row-selected" : ""
                  }`}
                  key={run._id}
                  onClick={() => onSelectRun(run._id)}
                  type="button"
                >
                  <span className={`workflow-run-status workflow-run-status-${run.status}`}>
                    {formatStatus(run.status)}
                  </span>
                  <strong>{formatTimestamp(run.createdAt)}</strong>
                  <small>{run.summary || run.errorMessage || "Workflow run record"}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="workflow-inspector-empty">No runs for this workflow yet.</p>
          )}
        </div>

        <div className="workflow-run-detail">
          <div className="workflow-execution-section-heading">
            <h3>Selected Run</h3>
            <span>{selectedRun ? formatStatus(selectedRun.status) : "None"}</span>
          </div>

          {selectedRun ? (
            <>
              <div className="workflow-run-metrics">
                <span>
                  <strong>Started</strong>
                  {formatTimestamp(selectedRun.startedAt)}
                </span>
                <span>
                  <strong>Duration</strong>
                  {formatDuration(selectedRun)}
                </span>
                <span>
                  <strong>Cost</strong>
                  {selectedRun.costUsd ? `$${selectedRun.costUsd.toFixed(4)}` : "$0"}
                </span>
                <span>
                  <strong>Current node</strong>
                  {selectedRun.currentNodeId || selectedRun.errorNodeId || "None"}
                </span>
              </div>

              {selectedRun.errorMessage ? (
                <p className="workflow-execution-warning">{selectedRun.errorMessage}</p>
              ) : null}

              <div className="workflow-run-debug-grid">
                <div>
                  <div className="workflow-execution-section-heading">
                    <h3>Nodes</h3>
                    <span>{selectedRunNodeStates ? selectedRunNodeStates.length : "Loading"}</span>
                  </div>
                  {selectedRunNodeStates?.length ? (
                    <div className="workflow-run-node-state-list">
                      {selectedRunNodeStates.map((nodeState) => (
                        <div
                          className={`workflow-run-node-state workflow-run-node-state-${nodeState.status}`}
                          key={nodeState._id}
                        >
                          <span>{formatStatus(nodeState.status)}</span>
                          <strong>{nodeState.label}</strong>
                          <p>
                            {nodeState.errorMessage ||
                              (nodeState.blockedByNodeIds?.length
                                ? `Blocked by ${nodeState.blockedByNodeIds.join(", ")}`
                                : `${nodeState.dependencyNodeIds.length} dependencies`)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="workflow-inspector-empty">No node execution state recorded yet.</p>
                  )}
                </div>

                <div>
                  <div className="workflow-execution-section-heading">
                    <h3>Events</h3>
                    <span>{selectedRunEvents ? selectedRunEvents.length : "Loading"}</span>
                  </div>
                  {selectedRunEvents?.length ? (
                    <div className="workflow-run-event-list">
                      {selectedRunEvents.map((event) => (
                        <div className="workflow-run-event" key={event._id}>
                          <span>{formatStatus(event.type)}</span>
                          <strong>{event.nodeId || "Workflow"}</strong>
                          <p>{event.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="workflow-inspector-empty">No events recorded yet.</p>
                  )}
                </div>

                <div>
                  <div className="workflow-execution-section-heading">
                    <h3>Artifacts</h3>
                    <span>{selectedRunArtifacts ? selectedRunArtifacts.length : "Loading"}</span>
                  </div>
                  {selectedRunArtifacts?.length ? (
                    <div className="workflow-run-artifact-list">
                      {selectedRunArtifacts.map((artifact) => (
                        <div className="workflow-run-artifact" key={artifact._id}>
                          <span>{formatStatus(artifact.type)}</span>
                          <strong>{artifact.title || "Untitled artifact"}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="workflow-inspector-empty">No artifacts have been produced for this run yet.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="workflow-inspector-empty">Select or create a run to inspect it.</p>
          )}
        </div>
      </div>
    </section>
  );
}
