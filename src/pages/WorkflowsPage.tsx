import { useMutation, useQuery } from "convex/react";
import {
  Check,
  Copy,
  Pencil,
  Plus,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LoadingSignal, LoadingState, Page, Select } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { createStarterWorkflowGraph } from "../lib/workflow/workflowGraph";
import { DEFAULT_PUBLISHING_PROVIDER } from "../lib/publishingRouting";
import type { WorkflowId } from "../types";

type WorkflowStatusFilter = "all" | "active" | "paused";
type WorkflowScheduleFilter = "all" | "manual" | "scheduled";
type WorkflowCreateDraft = {
  isOpen: boolean;
  name: string;
};

function formatDate(value?: number) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSchedule(workflow: {
  trigger: string;
  nextRunAt?: number;
}) {
  if (workflow.nextRunAt) return `Next ${formatDate(workflow.nextRunAt)}`;
  if (workflow.trigger === "schedule") return "Scheduled";
  return "Manual";
}

function isWorkingActionStatus(message: string) {
  return /^(Creating|Renaming|Duplicating|Deleting)/.test(message);
}

export function WorkflowsPage() {
  const navigate = useNavigate();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const accounts = useQuery(api.accounts.socialAccounts.list, workspaceArgs);
  const workflows = useQuery(api.workflows.definitions.list, workspaceArgs);
  const createWorkflow = useMutation(api.workflows.definitions.create);
  const updateWorkflowMetadata = useMutation(api.workflows.definitions.updateMetadata);
  const duplicateWorkflow = useMutation(api.workflows.definitions.duplicate);
  const deleteWorkflow = useMutation(api.workflows.definitions.remove);
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>("all");
  const [scheduleFilter, setScheduleFilter] = useState<WorkflowScheduleFilter>("all");
  const [actionStatus, setActionStatus] = useState("");
  const [renamingWorkflowId, setRenamingWorkflowId] = useState<WorkflowId | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [createDraft, setCreateDraft] = useState<WorkflowCreateDraft>({
    isOpen: false,
    name: "",
  });

  const accountsById = useMemo(
    () => new Map((accounts ?? []).map((account) => [String(account._id), account.username])),
    [accounts]
  );
  const filteredWorkflows = useMemo(() => {
    if (!workflows) return undefined;

    return workflows.filter((workflow) => {
      if (statusFilter === "active" && !workflow.isActive) return false;
      if (statusFilter === "paused" && workflow.isActive) return false;
      if (scheduleFilter === "manual" && workflow.trigger !== "manual") return false;
      if (
        scheduleFilter === "scheduled" &&
        workflow.trigger !== "schedule" &&
        !workflow.nextRunAt
      ) {
        return false;
      }

      return true;
    });
  }, [scheduleFilter, statusFilter, workflows]);

  const openCreateWorkflowModal = () => {
    setCreateDraft({
      isOpen: true,
      name: "",
    });
  };

  const closeCreateWorkflowModal = () => {
    setCreateDraft({
      isOpen: false,
      name: "",
    });
  };

  const createWorkflowFromDraft = async (event: FormEvent) => {
    event.preventDefault();

    const name = createDraft.name.trim();
    if (!name) return;

    setActionStatus("Creating workflow");
    try {
      const workflowId = await createWorkflow({
        ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
        name,
        trigger: "manual",
        approvalPolicy: { mode: "always" },
        publishingPolicy: {
          provider: DEFAULT_PUBLISHING_PROVIDER,
          autoPublish: false,
          defaultPlatforms: ["tiktok"],
        },
        graph: createStarterWorkflowGraph(),
      });
      closeCreateWorkflowModal();
      setActionStatus("");
      navigate(`/workflows/${workflowId}`);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Workflow creation failed");
    }
  };

  const saveRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renamingWorkflowId) return;

    const name = renameValue.trim();
    if (!name) return;

    setActionStatus("Renaming workflow");
    try {
      await updateWorkflowMetadata({
        id: renamingWorkflowId,
        name,
      });
      setRenamingWorkflowId(null);
      setRenameValue("");
      setActionStatus("");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Rename failed");
    }
  };

  const duplicateExistingWorkflow = async (workflowId: WorkflowId) => {
    setActionStatus("Duplicating workflow");
    try {
      await duplicateWorkflow({ id: workflowId });
      setActionStatus("");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Duplicate failed");
    }
  };

  const removeWorkflow = async (workflowId: WorkflowId, workflowName: string) => {
    if (!window.confirm(`Delete "${workflowName}"?`)) return;

    setActionStatus("Deleting workflow");
    try {
      await deleteWorkflow({ id: workflowId });
      setActionStatus("");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <Page
      title="Workflows"
      description={`Saved canvases for ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <section className="workflow-index-panel">
        <div className="workflow-index-toolbar">
          <div>
            <h2>Workflow List</h2>
            <p>
              {filteredWorkflows ? (
                `${filteredWorkflows.length} shown`
              ) : (
                <LoadingSignal label="Loading workflows" showLabel size="sm" />
              )}
            </p>
          </div>
          <div className="workflow-index-actions">
            <button className="primary-button" onClick={() => openCreateWorkflowModal()} type="button">
              <Plus size={16} />
              New workflow
            </button>
          </div>
        </div>

        <div className="workflow-index-filters">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as WorkflowStatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </Select>
          <Select
            label="Schedule"
            value={scheduleFilter}
            onChange={(value) => setScheduleFilter(value as WorkflowScheduleFilter)}
          >
            <option value="all">All schedules</option>
            <option value="manual">Manual</option>
            <option value="scheduled">Scheduled</option>
          </Select>
        </div>

        {actionStatus && (
          <p className="workflow-index-status inline-flex items-center gap-[var(--space-2)]">
            {isWorkingActionStatus(actionStatus) ? (
              <LoadingSignal label={actionStatus} size="sm" />
            ) : null}
            {actionStatus}
          </p>
        )}

        {createDraft.isOpen ? (
          <div
            aria-labelledby="workflow-create-title"
            aria-modal="true"
            className="workflow-modal-backdrop"
            role="dialog"
          >
            <form className="workflow-create-modal" onSubmit={createWorkflowFromDraft}>
              <div className="workflow-create-modal-header">
                <div>
                  <h3 id="workflow-create-title">Create Workflow</h3>
                  <p>Name it now. You can tune the canvas after it opens.</p>
                </div>
                <button
                  aria-label="Close create workflow dialog"
                  className="icon-button"
                  onClick={closeCreateWorkflowModal}
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>

              <label className="field">
                <span>Workflow name</span>
                <input
                  autoFocus
                  placeholder="Daily TikTok slideshow"
                  value={createDraft.name}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="workflow-create-modal-actions">
                <button className="secondary-button" onClick={closeCreateWorkflowModal} type="button">
                  Cancel
                </button>
                <button className="primary-button" disabled={!createDraft.name.trim()} type="submit">
                  <Plus size={16} />
                  Create workflow
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="workflow-table" role="table" aria-label="Workflows">
          <div className="workflow-table-header" role="row">
            <span>Name</span>
            <span>Account</span>
            <span>Schedule</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {!filteredWorkflows && (
            <div className="workflow-table-empty">
              <LoadingState
                className="border-0 bg-transparent"
                compact
                detail="Fetching saved canvases for this workspace."
                title="Loading workflows"
              />
            </div>
          )}
          {filteredWorkflows?.length === 0 ? (
            <div className="workflow-table-empty">
              <Workflow size={22} />
              <strong>No workflows yet</strong>
              <span>Create a blank canvas and compose it with nodes.</span>
              <button className="primary-button" onClick={() => openCreateWorkflowModal()} type="button">
                <Plus size={16} />
                New workflow
              </button>
            </div>
          ) : null}

          {filteredWorkflows?.map((workflow) => {
            const workflowId = workflow._id as WorkflowId;
            const isRenaming = renamingWorkflowId === workflowId;
            const accountName = workflow.socialAccountId
              ? accountsById.get(String(workflow.socialAccountId))
              : undefined;

            return (
              <div className="workflow-table-row" key={workflow._id} role="row">
                <div className="workflow-table-name-cell">
                  {isRenaming ? (
                    <form className="workflow-rename-form" onSubmit={saveRename}>
                      <input
                        aria-label="Workflow name"
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                      />
                      <button aria-label="Save name" className="icon-button" type="submit">
                        <Check size={15} />
                      </button>
                      <button
                        aria-label="Cancel rename"
                        className="icon-button"
                        onClick={() => {
                          setRenamingWorkflowId(null);
                          setRenameValue("");
                        }}
                        type="button"
                      >
                        <X size={15} />
                      </button>
                    </form>
                  ) : (
                    <Link className="workflow-row-title" to={`/workflows/${workflow._id}`}>
                      <strong>{workflow.name}</strong>
                    </Link>
                  )}
                </div>
                <span>{accountName ?? "No account"}</span>
                <span>{formatSchedule(workflow)}</span>
                <span>
                  <mark className={workflow.isActive ? "workflow-status-active" : "workflow-status-paused"}>
                    {workflow.isActive ? "Active" : "Paused"}
                  </mark>
                </span>
                <div className="workflow-row-actions">
                  <Link className="icon-button" title="Open canvas" to={`/workflows/${workflow._id}`}>
                    <Workflow size={15} />
                  </Link>
                  <button
                    aria-label={`Rename ${workflow.name}`}
                    className="icon-button"
                    onClick={() => {
                      setRenamingWorkflowId(workflowId);
                      setRenameValue(workflow.name);
                    }}
                    title="Rename"
                    type="button"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label={`Duplicate ${workflow.name}`}
                    className="icon-button"
                    onClick={() => void duplicateExistingWorkflow(workflowId)}
                    title="Duplicate"
                    type="button"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    aria-label={`Delete ${workflow.name}`}
                    className="icon-button workflow-delete-button"
                    onClick={() => void removeWorkflow(workflowId, workflow.name)}
                    title="Delete"
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </Page>
  );
}
