import { useMutation, useQuery } from "convex/react";
import { LayoutTemplate, Plus, Workflow } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Field, FormPanel, Page, Panel, Select } from "../components/ui";
import { createStarterWorkflowGraph } from "../lib/workflowGraph";
import {
  createWorkflowGraphFromTemplate,
  getWorkflowTemplate,
  listWorkflowTemplates,
  type WorkflowTemplateCategory,
  type WorkflowTemplateId,
} from "../lib/workflowTemplates";
import type { BrandId, ContentFormat, SocialAccountId } from "../types";

type WorkflowStatusFilter = "all" | "active" | "paused";
type WorkflowScheduleFilter = "all" | "manual" | "scheduled";
type WorkflowFormatFilter = "all" | ContentFormat;
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
  const [templateCategoryFilter, setTemplateCategoryFilter] =
    useState<WorkflowTemplateCategoryFilter>("all");
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<WorkflowTemplateId>("persona_image_set");
  const workflowTemplates = useMemo(() => listWorkflowTemplates(), []);
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

    const template = getWorkflowTemplate(templateId);

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
          provider: template.defaultPublishingProvider,
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

  const handleCreateSelectedTemplate = async () => {
    if (!selectedTemplate) return;
    await handleCreateFromTemplate(selectedTemplate.id);
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
          <option value="talking_avatar">Talking avatar</option>
          <option value="short_educational_video">Short educational video</option>
          <option value="static_image">Static image</option>
          <option value="thread">Thread</option>
          <option value="caption_set">Caption set</option>
        </Select>
        <Field label="Name" value={name} onChange={setName} placeholder="Daily slideshow test" />
        <button className="primary-button" type="submit">
          <Plus size={16} />
          New blank workflow
        </button>
        {createStatus && <p className="muted">{createStatus}</p>}
      </FormPanel>

      <Panel title="Template Picker">
        <div className="section-toolbar">
          <p className="muted">
            Choose a starter workflow, then open it as an editable canvas.
          </p>
          <span className="entity-eyebrow">{workflowTemplates.length} templates</span>
        </div>
        <div className="button-row" role="tablist" aria-label="Template categories">
          {templateCategories.map((category) => (
            <button
              className={
                templateCategoryFilter === category
                  ? "secondary-button !border-[var(--color-primary)] !bg-[var(--color-primary-soft)] !text-[var(--color-primary-strong)]"
                  : "secondary-button"
              }
              key={category}
              type="button"
              onClick={() => setTemplateCategoryFilter(category)}
            >
              {templateCategoryLabels[category]}
            </button>
          ))}
        </div>
        <div className="grid min-w-0 gap-[var(--space-4)] xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-[var(--space-2)]">
            {filteredTemplates.map((template) => {
              const selected = template.id === selectedTemplate?.id;
              return (
                <button
                  className={[
                    "grid min-w-0 gap-[var(--space-1)] rounded-[var(--radius-md)] border p-[var(--space-3)] text-left transition",
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:border-[var(--color-border-strong)]",
                  ].join(" ")}
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <span className="entity-eyebrow">{formatTemplateValue(template.category)}</span>
                  <strong className="min-w-0 [overflow-wrap:anywhere]">{template.name}</strong>
                  <span className="muted text-[0.78rem] leading-[1.25]">
                    {template.description}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedTemplate && (
            <section className="grid min-w-0 content-start gap-[var(--space-4)] border-t border-[var(--color-border)] pt-[var(--space-4)] xl:border-l xl:border-t-0 xl:pl-[var(--space-4)] xl:pt-0">
              <div className="grid gap-[var(--space-2)]">
                <span className="entity-eyebrow">{formatTemplateValue(selectedTemplate.category)}</span>
                <h3 className="m-0 text-[1.35rem] font-[720] leading-[1.1]">
                  {selectedTemplate.name}
                </h3>
                <p className="muted">{selectedTemplate.purpose}</p>
              </div>
              <div className="flex flex-wrap gap-[var(--space-2)]">
                <span className="rounded-full bg-[var(--color-primary-soft)] px-[var(--space-3)] py-[var(--space-1)] text-[0.76rem] font-[700] text-[var(--color-primary-strong)]">
                  {formatTemplateValue(selectedTemplate.outputType)}
                </span>
                <span className="rounded-full bg-[var(--color-accent-soft)] px-[var(--space-3)] py-[var(--space-1)] text-[0.76rem] font-[700] text-[var(--color-ink-soft)]">
                  {formatTemplateValue(selectedTemplate.contentFormat)}
                </span>
                <span className="rounded-full bg-[var(--color-surface-tinted)] px-[var(--space-3)] py-[var(--space-1)] text-[0.76rem] font-[700] text-[var(--color-ink-soft)]">
                  {selectedTemplate.graph.nodes.length} nodes
                </span>
              </div>
              <div className="grid gap-[var(--space-3)]">
                <h4 className="m-0 text-[0.95rem] font-[680]">Required inputs</h4>
                <div className="grid gap-[var(--space-2)]">
                  {selectedTemplate.requiredInputs.map((input) => (
                    <div
                      className="grid gap-[var(--space-1)] border-t border-[var(--color-border)] pt-[var(--space-2)]"
                      key={input.key}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
                        <strong className="text-[0.9rem]">{input.label}</strong>
                        <span className="entity-eyebrow">{formatTemplateValue(input.kind)}</span>
                        {!input.required && <span className="muted text-[0.76rem]">Optional</span>}
                      </div>
                      <p className="muted text-[0.82rem]">{input.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <button
                className="primary-button justify-self-start"
                disabled={!brandId}
                type="button"
                onClick={() => void handleCreateSelectedTemplate()}
              >
                <LayoutTemplate size={16} />
                Create from template
              </button>
              {!brandId && (
                <p className="muted">Select a brand above before creating a template workflow.</p>
              )}
            </section>
          )}
        </div>
      </Panel>

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
