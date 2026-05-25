import { useMutation, useQuery } from "convex/react";
import { LayoutTemplate, Plus, Workflow } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Field, FormPanel, Page, Panel, Select } from "../components/ui";
import { createStarterWorkflowGraph } from "../lib/workflowGraph";
import {
  WORKFLOW_TEMPLATES,
  createWorkflowGraphFromTemplate,
  type WorkflowTemplateId,
} from "../lib/workflowTemplates";
import type { BrandId, ContentFormat, SocialAccountId } from "../types";

type WorkflowStatusFilter = "all" | "active" | "paused";
type WorkflowScheduleFilter = "all" | "manual" | "scheduled";
type WorkflowFormatFilter = "all" | ContentFormat;

export function WorkflowsPage() {
  const navigate = useNavigate();
  const brands = useQuery(api.accounts.brands.list);
  const accounts = useQuery(api.accounts.socialAccounts.list);
  const workflows = useQuery(api.workflows.definitions.list);
  const createWorkflow = useMutation(api.workflows.definitions.create);
  const [brandId, setBrandId] = useState("");
  const [socialAccountId, setSocialAccountId] = useState("");
  const [name, setName] = useState("");
  const [contentFormat, setContentFormat] = useState<ContentFormat>("slideshow");
  const [brandFilter, setBrandFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState<WorkflowFormatFilter>("all");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>("all");
  const [scheduleFilter, setScheduleFilter] = useState<WorkflowScheduleFilter>("all");
  const [createStatus, setCreateStatus] = useState("");

  const brandAccounts = useMemo(
    () =>
      accounts?.filter((account) => !brandId || account.brandId === brandId) ?? [],
    [accounts, brandId]
  );

  const filteredWorkflows = useMemo(() => {
    if (!workflows) return undefined;

    return workflows.filter((workflow) => {
      if (brandFilter !== "all" && workflow.brandId !== brandFilter) return false;
      if (formatFilter !== "all" && workflow.contentFormat !== formatFilter) return false;
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
  }, [brandFilter, formatFilter, scheduleFilter, statusFilter, workflows]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!brandId || !name.trim()) return;

    setCreateStatus("Creating blank workflow");
    try {
      const workflowId = await createWorkflow({
        brandId: brandId as BrandId,
        socialAccountId: socialAccountId ? (socialAccountId as SocialAccountId) : undefined,
        name: name.trim(),
        contentFormat,
        trigger: "manual",
        approvalPolicy: { mode: "always" },
        publishingPolicy: {
          provider: "postiz",
          autoPublish: false,
          defaultPlatforms: ["tiktok"],
        },
        graph: createStarterWorkflowGraph(),
      });
      setName("");
      setCreateStatus("");
      navigate(`/workflows/${workflowId}`);
    } catch (error) {
      setCreateStatus(error instanceof Error ? error.message : "Workflow creation failed");
    }
  };

  const handleCreateFromTemplate = async (templateId: WorkflowTemplateId) => {
    if (!brandId) {
      setCreateStatus("Select a brand before creating a template workflow.");
      return;
    }

    const template = WORKFLOW_TEMPLATES.find((candidate) => candidate.id === templateId);
    if (!template) return;

    setCreateStatus(`Creating ${template.name}`);
    try {
      const workflowId = await createWorkflow({
        brandId: brandId as BrandId,
        socialAccountId: socialAccountId ? (socialAccountId as SocialAccountId) : undefined,
        name: name.trim() || template.name,
        description: template.description,
        contentFormat: template.contentFormat,
        trigger: "manual",
        approvalPolicy: { mode: "always" },
        publishingPolicy: {
          provider: "manual",
          autoPublish: false,
          defaultPlatforms: ["tiktok"],
        },
        graph: createWorkflowGraphFromTemplate(template.id),
      });
      setName("");
      setCreateStatus("");
      navigate(`/workflows/${workflowId}`);
    } catch (error) {
      setCreateStatus(error instanceof Error ? error.message : "Template creation failed");
    }
  };

  return (
    <Page title="Workflows" description="Repeatable agent pipelines for each brand/account.">
      <FormPanel title="New Workflow" onSubmit={handleSubmit}>
        <Select label="Brand" value={brandId} onChange={setBrandId}>
          <option value="">Select brand</option>
          {brands?.map((brand) => (
            <option key={brand._id} value={brand._id}>
              {brand.name}
            </option>
          ))}
        </Select>
        <Select label="Account" value={socialAccountId} onChange={setSocialAccountId}>
          <option value="">No account yet</option>
          {brandAccounts.map((account) => (
            <option key={account._id} value={account._id}>
              {account.username}
            </option>
          ))}
        </Select>
        <Select
          label="Format"
          value={contentFormat}
          onChange={(value) => setContentFormat(value as ContentFormat)}
        >
          <option value="slideshow">Slideshow</option>
          <option value="hook_demo_video">Hook/demo video</option>
          <option value="ai_ugc_video">AI UGC video</option>
        </Select>
        <Field label="Name" value={name} onChange={setName} placeholder="Daily slideshow test" />
        <button className="primary-button" type="submit">
          <Plus size={16} />
          New blank workflow
        </button>
        {WORKFLOW_TEMPLATES.map((template) => (
          <button
            className="secondary-button"
            disabled={!brandId}
            key={template.id}
            type="button"
            onClick={() => void handleCreateFromTemplate(template.id)}
          >
            <LayoutTemplate size={16} />
            {template.name}
          </button>
        ))}
        {createStatus && <p className="muted">{createStatus}</p>}
      </FormPanel>

      <Panel title="Workflow List">
        <div className="filter-grid workflow-filter-grid">
          <Select label="Brand" value={brandFilter} onChange={setBrandFilter}>
            <option value="all">All brands</option>
            {brands?.map((brand) => (
              <option key={brand._id} value={brand._id}>
                {brand.name}
              </option>
            ))}
          </Select>
          <Select
            label="Format"
            value={formatFilter}
            onChange={(value) => setFormatFilter(value as WorkflowFormatFilter)}
          >
            <option value="all">All formats</option>
            <option value="slideshow">Slideshow</option>
            <option value="hook_demo_video">Hook/demo video</option>
            <option value="ai_ugc_video">AI UGC video</option>
            <option value="talking_avatar">Talking avatar</option>
            <option value="short_educational_video">Short educational video</option>
            <option value="static_image">Static image</option>
            <option value="thread">Thread</option>
            <option value="caption_set">Caption set</option>
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
          <p className="workflow-list-count">
            {filteredWorkflows ? `${filteredWorkflows.length} shown` : "Loading"}
          </p>
        </div>
      </Panel>

      {!filteredWorkflows && <div className="empty-state">Loading...</div>}
      {filteredWorkflows?.length === 0 && (
        <div className="empty-state">
          {workflows?.length === 0 ? "No workflows yet." : "No workflows match these filters."}
        </div>
      )}
      <div className="entity-grid">
        {filteredWorkflows?.map((workflow) => (
          <Link className="entity-card workflow-card-link" key={workflow._id} to={`/workflows/${workflow._id}`}>
            <div className="entity-eyebrow">{workflow.contentFormat}</div>
            <h3>{workflow.name}</h3>
            <p>
              {workflow.description ||
                `${workflow.trigger} trigger with ${workflow.publishingPolicy.provider} publishing`}
            </p>
            <span>{workflow.isActive ? "Active" : "Paused"}</span>
            <span className="workflow-card-action">
              <Workflow size={15} />
              Open canvas
            </span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
