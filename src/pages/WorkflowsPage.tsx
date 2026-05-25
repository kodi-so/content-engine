import { useMutation, useQuery } from "convex/react";
import {
  Check,
  Copy,
  LayoutTemplate,
  Pencil,
  Plus,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Page, Select } from "../components/ui";
import { createStarterWorkflowGraph } from "../lib/workflowGraph";
import {
  createWorkflowGraphFromTemplate,
  getWorkflowTemplate,
  listWorkflowTemplates,
  type WorkflowTemplateCategory,
  type WorkflowTemplateId,
} from "../lib/workflowTemplates";
import { DEFAULT_PUBLISHING_PROVIDER } from "../lib/publishingRouting";
import type { BrandId, WorkflowId } from "../types";

type WorkflowStatusFilter = "all" | "active" | "paused";
type WorkflowScheduleFilter = "all" | "manual" | "scheduled";
type WorkflowTemplateCategoryFilter = "all" | WorkflowTemplateCategory;

const templateCategoryLabels: Record<WorkflowTemplateCategoryFilter, string> = {
  all: "All",
  app_demo: "App demo",
  persona: "Persona",
  slideshow: "Slideshow",
  transformation: "Transformation",
  ugc: "UGC",
  video: "Video",
};

function formatTemplateValue(value: string) {
  return value.replace(/_/g, " ");
}

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

function workflowOutputSummary(workflow: {
  graph: {
    nodes: Array<{
      type: string;
      label: string;
      config: Record<string, unknown>;
    }>;
  };
}) {
  const compiler = workflow.graph.nodes.find((node) => node.type === "post_compiler");
  const compilerPostType = compiler?.config.postType;
  if (typeof compilerPostType === "string" && compilerPostType.trim()) {
    return formatTemplateValue(compilerPostType);
  }

  const terminal = workflow.graph.nodes.find((node) =>
    node.type === "auto_post" || node.type === "export"
  );
  if (terminal) return terminal.label;

  return `${workflow.graph.nodes.length} nodes`;
}

export function WorkflowsPage() {
  const navigate = useNavigate();
  const brands = useQuery(api.accounts.brands.list);
  const accounts = useQuery(api.accounts.socialAccounts.list);
  const workflows = useQuery(api.workflows.definitions.list);
  const createWorkflow = useMutation(api.workflows.definitions.create);
  const updateWorkflowMetadata = useMutation(api.workflows.definitions.updateMetadata);
  const duplicateWorkflow = useMutation(api.workflows.definitions.duplicate);
  const deleteWorkflow = useMutation(api.workflows.definitions.remove);
  const [brandFilter, setBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>("all");
  const [scheduleFilter, setScheduleFilter] = useState<WorkflowScheduleFilter>("all");
  const [actionStatus, setActionStatus] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateCategoryFilter, setTemplateCategoryFilter] =
    useState<WorkflowTemplateCategoryFilter>("all");
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<WorkflowTemplateId>("persona_image_set");
  const [renamingWorkflowId, setRenamingWorkflowId] = useState<WorkflowId | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const workflowTemplates = useMemo(() => listWorkflowTemplates(), []);
  const brandsById = useMemo(
    () => new Map((brands ?? []).map((brand) => [String(brand._id), brand.name])),
    [brands]
  );
  const accountsById = useMemo(
    () => new Map((accounts ?? []).map((account) => [String(account._id), account.username])),
    [accounts]
  );
  const templateCategories = useMemo(
    () => [
      "all",
      ...Array.from(new Set(workflowTemplates.map((template) => template.category))).sort(),
    ] as WorkflowTemplateCategoryFilter[],
    [workflowTemplates]
  );
  const filteredTemplates = useMemo(
    () =>
      workflowTemplates.filter(
        (template) =>
          templateCategoryFilter === "all" || template.category === templateCategoryFilter
      ),
    [templateCategoryFilter, workflowTemplates]
  );
  const selectedTemplate = useMemo(
    () =>
      filteredTemplates.find((template) => template.id === selectedTemplateId) ??
      filteredTemplates[0] ??
      workflowTemplates[0],
    [filteredTemplates, selectedTemplateId, workflowTemplates]
  );
  const targetBrandId = useMemo(
    () => (brandFilter !== "all" ? (brandFilter as BrandId) : undefined),
    [brandFilter]
  );
  const filteredWorkflows = useMemo(() => {
    if (!workflows) return undefined;

    return workflows.filter((workflow) => {
      if (brandFilter !== "all" && workflow.brandId !== brandFilter) return false;
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
  }, [brandFilter, scheduleFilter, statusFilter, workflows]);

  const createBlankWorkflow = async () => {
    setActionStatus("Creating workflow");
    try {
      const workflowId = await createWorkflow({
        ...(targetBrandId ? { brandId: targetBrandId as BrandId } : {}),
        name: "Untitled workflow",
        trigger: "manual",
        approvalPolicy: { mode: "always" },
        publishingPolicy: {
          provider: DEFAULT_PUBLISHING_PROVIDER,
          autoPublish: false,
          defaultPlatforms: ["tiktok"],
        },
        graph: createStarterWorkflowGraph(),
      });
      setActionStatus("");
      navigate(`/workflows/${workflowId}`);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Workflow creation failed");
    }
  };

  const createFromTemplate = async (templateId: WorkflowTemplateId) => {
    const template = getWorkflowTemplate(templateId);

    setActionStatus(`Creating ${template.name}`);
    try {
      const workflowId = await createWorkflow({
        ...(targetBrandId ? { brandId: targetBrandId as BrandId } : {}),
        name: template.name,
        description: template.description,
        trigger: "manual",
        approvalPolicy: { mode: "always" },
        publishingPolicy: {
          provider: template.defaultPublishingProvider,
          autoPublish: false,
          defaultPlatforms: ["tiktok"],
        },
        graph: createWorkflowGraphFromTemplate(template.id),
      });
      setActionStatus("");
      navigate(`/workflows/${workflowId}`);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Template creation failed");
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
    <Page title="Workflows" description="Saved canvases for repeatable content automation.">
      <section className="workflow-index-panel">
        <div className="workflow-index-toolbar">
          <div>
            <h2>Workflow List</h2>
            <p>{filteredWorkflows ? `${filteredWorkflows.length} shown` : "Loading workflows"}</p>
          </div>
          <div className="workflow-index-actions">
            <button
              className="secondary-button"
              onClick={() => setShowTemplates((current) => !current)}
              type="button"
            >
              <LayoutTemplate size={16} />
              Templates
            </button>
            <button className="primary-button" onClick={() => void createBlankWorkflow()} type="button">
              <Plus size={16} />
              New workflow
            </button>
          </div>
        </div>

        <div className="workflow-index-filters">
          <Select label="Brand" value={brandFilter} onChange={setBrandFilter}>
            <option value="all">All brands</option>
            {brands?.map((brand) => (
              <option key={brand._id} value={brand._id}>
                {brand.name}
              </option>
            ))}
          </Select>
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

        {actionStatus && <p className="workflow-index-status">{actionStatus}</p>}

        {showTemplates && selectedTemplate ? (
          <section className="workflow-template-panel" aria-label="Workflow templates">
            <div className="workflow-template-tabs" role="tablist" aria-label="Template categories">
              {templateCategories.map((category) => (
                <button
                  className={
                    templateCategoryFilter === category
                      ? "workflow-template-tab workflow-template-tab-active"
                      : "workflow-template-tab"
                  }
                  key={category}
                  type="button"
                  onClick={() => setTemplateCategoryFilter(category)}
                >
                  {templateCategoryLabels[category]}
                </button>
              ))}
            </div>
            <div className="workflow-template-list">
              {filteredTemplates.map((template) => (
                <button
                  className={
                    template.id === selectedTemplate.id
                      ? "workflow-template-row workflow-template-row-active"
                      : "workflow-template-row"
                  }
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <span>{formatTemplateValue(template.category)}</span>
                  <strong>{template.name}</strong>
                  <small>{formatTemplateValue(template.outputType)}</small>
                </button>
              ))}
            </div>
            <div className="workflow-template-detail">
              <span className="entity-eyebrow">{formatTemplateValue(selectedTemplate.category)}</span>
              <h3>{selectedTemplate.name}</h3>
              <p>{selectedTemplate.purpose}</p>
              <div className="workflow-template-meta">
                <span>{formatTemplateValue(selectedTemplate.outputType)}</span>
                <span>{selectedTemplate.graph.nodes.length} nodes</span>
                <span>{selectedTemplate.requiredInputs.length} inputs</span>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => void createFromTemplate(selectedTemplate.id)}
              >
                <LayoutTemplate size={16} />
                Create from template
              </button>
            </div>
          </section>
        ) : null}

        <div className="workflow-table" role="table" aria-label="Workflows">
          <div className="workflow-table-header" role="row">
            <span>Name</span>
            <span>Output</span>
            <span>Brand</span>
            <span>Schedule</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {!filteredWorkflows && <div className="workflow-table-empty">Loading workflows...</div>}
          {filteredWorkflows?.length === 0 ? (
            <div className="workflow-table-empty">
              <Workflow size={22} />
              <strong>No workflows yet</strong>
              <span>Create a blank canvas or start from a template.</span>
              <button className="primary-button" onClick={() => void createBlankWorkflow()} type="button">
                <Plus size={16} />
                New workflow
              </button>
            </div>
          ) : null}

          {filteredWorkflows?.map((workflow) => {
            const workflowId = workflow._id as WorkflowId;
            const isRenaming = renamingWorkflowId === workflowId;
            const brandName = brandsById.get(String(workflow.brandId)) ?? "Workspace";
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
                      <span>
                        {workflow.description ||
                          `${workflow.graph.nodes.length} nodes, ${workflow.graph.edges.length} edges`}
                      </span>
                    </Link>
                  )}
                </div>
                <span>{workflowOutputSummary(workflow)}</span>
                <span>{accountName ? `${brandName} / ${accountName}` : brandName}</span>
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
