import { Activity, ArrowLeft, Clock, Play, Save } from "lucide-react";
import { Link } from "react-router-dom";
import type { Doc } from "../../../convex/_generated/dataModel";

type WorkflowCanvasHeaderProps = {
  canRun: boolean;
  canSave: boolean;
  edgeCount: number;
  isCreatingRun: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isUpdatingActiveState: boolean;
  nodeCount: number;
  onCreateManualRun: () => void;
  onSaveGraph: () => void;
  onToggleActive: () => void;
  onToggleExecutions: () => void;
  saveStatus: string;
  showExecutions: boolean;
  workflow: Doc<"workflows">;
};

export function WorkflowCanvasHeader({
  canRun,
  canSave,
  edgeCount,
  isCreatingRun,
  isDirty,
  isSaving,
  isUpdatingActiveState,
  nodeCount,
  onCreateManualRun,
  onSaveGraph,
  onToggleActive,
  onToggleExecutions,
  saveStatus,
  showExecutions,
  workflow,
}: WorkflowCanvasHeaderProps) {
  return (
    <header className="workflow-canvas-header">
      <div className="workflow-canvas-title">
        <Link className="workflow-back-link" to="/workflows">
          <ArrowLeft size={16} />
          Workflows
        </Link>
        <div>
          <h1>{workflow.name}</h1>
          <p>{workflow.description || "Workflow canvas"}</p>
        </div>
      </div>
      <div className="workflow-canvas-stats">
        <span>{nodeCount} nodes</span>
        <span>{edgeCount} edges</span>
        <span>{workflow.isActive ? "Active" : "Paused"}</span>
        {workflow.nextRunAt ? (
          <span>Next {new Date(workflow.nextRunAt).toLocaleString()}</span>
        ) : null}
      </div>
      <div className="workflow-canvas-actions">
        {saveStatus ? <span>{saveStatus}</span> : null}
        <button
          className={`secondary-button${showExecutions ? " workflow-toolbar-button-active" : ""}`}
          onClick={onToggleExecutions}
          type="button"
        >
          <Activity size={16} />
          Executions
        </button>
        <button
          className="secondary-button"
          disabled={isCreatingRun || isDirty || !canRun}
          onClick={onCreateManualRun}
          type="button"
        >
          <Play size={16} />
          {isCreatingRun ? "Queueing" : "Run once"}
        </button>
        <button
          className="secondary-button"
          disabled={isUpdatingActiveState}
          onClick={onToggleActive}
          type="button"
        >
          <Clock size={16} />
          {workflow.isActive ? "Pause" : "Activate"}
        </button>
        <button
          className="primary-button"
          disabled={!isDirty || isSaving || !canSave}
          onClick={onSaveGraph}
          type="button"
        >
          <Save size={16} />
          {isSaving ? "Saving" : "Save"}
        </button>
      </div>
    </header>
  );
}
