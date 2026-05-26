import { useMutation, useQuery } from "convex/react";
import { Copy, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Page, Panel } from "../components/ui";
import type { WorkflowId } from "../types";
import type { Id } from "../../convex/_generated/dataModel";

export function RunsPage() {
  const navigate = useNavigate();
  const workflows = useQuery(api.workflows.definitions.list);
  const runs = useQuery(api.workflows.runs.list, {});
  const createManualRun = useMutation(api.workflows.runs.createManualRun);
  const createWorkflowFromRun = useMutation(api.workflows.definitions.createFromRun);
  const deleteRun = useMutation(api.workflows.runs.remove);
  const [runStatus, setRunStatus] = useState("");
  const [draftingRunId, setDraftingRunId] = useState<Id<"workflowRuns"> | null>(null);

  const saveRunAsWorkflow = async (runId: Id<"workflowRuns">) => {
    setDraftingRunId(runId);
    setRunStatus("Creating workflow draft");
    try {
      const workflowId = await createWorkflowFromRun({ runId });
      setRunStatus("");
      navigate(`/workflows/${workflowId}`);
    } catch (error) {
      setRunStatus(error instanceof Error ? error.message : "Workflow draft creation failed");
    } finally {
      setDraftingRunId(null);
    }
  };

  const removeRun = async (runId: Id<"workflowRuns">) => {
    if (!window.confirm("Delete this run and its artifacts, events, plans, and metrics?")) {
      return;
    }

    setRunStatus("Deleting run");
    try {
      await deleteRun({ id: runId });
      setRunStatus("Run deleted");
    } catch (error) {
      setRunStatus(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <Page title="Runs" description="Every agent execution gets durable state, events, and artifacts.">
      <Panel title="Manual Trigger">
        <div className="button-row">
          {workflows?.map((workflow) => (
            <button
              className="secondary-button"
              key={workflow._id}
              type="button"
              onClick={() => void createManualRun({ workflowId: workflow._id as WorkflowId })}
            >
              <Play size={16} />
              {workflow.name}
            </button>
          ))}
          {workflows?.length === 0 && <p className="muted">Create a workflow before triggering runs.</p>}
        </div>
      </Panel>

      {runStatus && <p className="muted">{runStatus}</p>}
      {!runs && <div className="empty-state">Loading...</div>}
      {runs?.length === 0 && <div className="empty-state">No workflow runs yet.</div>}
      <div className="entity-grid">
        {runs?.map((run) => (
          <article className="entity-card" key={run._id}>
            <div className="entity-eyebrow">{run.status}</div>
            <h3>{run.generatedTopic || "Untitled run"}</h3>
            <p>{run.summary || run.errorMessage || "Queued for the workflow runner."}</p>
            <span>{new Date(run.createdAt).toLocaleString()}</span>
            <div className="button-row">
              {run.status === "completed" && (
                <button
                  className="secondary-button"
                  disabled={draftingRunId === run._id}
                  type="button"
                  onClick={() => void saveRunAsWorkflow(run._id)}
                >
                  <Copy size={16} />
                  {draftingRunId === run._id ? "Creating draft..." : "Save as workflow"}
                </button>
              )}
              <button
                className="danger-button"
                type="button"
                onClick={() => void removeRun(run._id)}
              >
                <Trash2 size={16} />
                Delete run
              </button>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}
