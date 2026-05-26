import { useMutation, useQuery } from "convex/react";
import { ArrowRight, LayoutTemplate, Sparkles, Workflow } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Field, Page, Panel, Select, TextArea } from "../components/ui";
import {
  createWorkflowGraphFromTemplate,
  getWorkflowTemplate,
  listWorkflowTemplates,
  type WorkflowTemplateId,
} from "../lib/workflowTemplates";
import type { BrandId, SocialAccountId } from "../types";

function formatValue(value: string) {
  return value.replace(/_/g, " ");
}

function draftName(prompt: string, fallback: string) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!cleanPrompt) return fallback;
  return cleanPrompt.length > 54 ? `${cleanPrompt.slice(0, 54)}...` : cleanPrompt;
}

export function CreatePage() {
  const navigate = useNavigate();
  const brands = useQuery(api.accounts.brands.list);
  const accounts = useQuery(api.accounts.socialAccounts.list);
  const workflows = useQuery(api.workflows.definitions.list);
  const createWorkflow = useMutation(api.workflows.definitions.create);
  const templates = useMemo(() => listWorkflowTemplates(), []);
  const [brandId, setBrandId] = useState("");
  const [socialAccountId, setSocialAccountId] = useState("");
  const [templateId, setTemplateId] = useState<WorkflowTemplateId>("slideshow_carousel");
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  const selectedBrandId = brandId || brands?.[0]?._id || "";
  const selectedTemplate = getWorkflowTemplate(templateId);
  const brandAccounts = useMemo(
    () =>
      accounts?.filter((account) => !selectedBrandId || account.brandId === selectedBrandId) ??
      [],
    [accounts, selectedBrandId]
  );
  const recentDrafts = useMemo(
    () =>
      workflows
        ?.filter((workflow) => workflow.description?.startsWith("Create draft:"))
        .slice(0, 4) ?? [],
    [workflows]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const targetBrandId = selectedBrandId;
    const creativeRequest = prompt.trim();
    if (!targetBrandId || !creativeRequest) return;

    setStatus("Creating workflow draft");
    try {
      const workflowId = await createWorkflow({
        brandId: targetBrandId as BrandId,
        socialAccountId: socialAccountId ? (socialAccountId as SocialAccountId) : undefined,
        name: name.trim() || draftName(creativeRequest, selectedTemplate.name),
        description: `Create draft: ${selectedTemplate.name}`,
        trigger: "manual",
        approvalPolicy: { mode: "always" },
        publishingPolicy: {
          provider: selectedTemplate.defaultPublishingProvider,
          autoPublish: false,
          defaultPlatforms: ["tiktok"],
        },
        graph: createWorkflowGraphFromTemplate(selectedTemplate.id, {
          creativeRequest,
        }),
      });
      setPrompt("");
      setName("");
      setStatus("");
      navigate(`/workflows/${workflowId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Workflow draft creation failed");
    }
  };

  return (
    <Page
      title="Create"
      description="Turn a rough content idea into an editable workflow draft."
    >
      <form className="panel" onSubmit={handleSubmit}>
        <div className="section-toolbar">
          <div>
            <h2>Prompt To Workflow</h2>
            <p className="muted">
              Create prepares the workflow canvas. Runs still happen from the workflow itself.
            </p>
          </div>
          <Link className="secondary-button" to="/workflows">
            <Workflow size={16} />
            Workflows
          </Link>
        </div>

        <div className="grid min-w-0 gap-[var(--space-3)] lg:grid-cols-[minmax(12rem,18rem)_minmax(12rem,18rem)_minmax(14rem,1fr)]">
          <Select label="Brand" value={selectedBrandId} onChange={setBrandId}>
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
          <Field
            label="Workflow name"
            value={name}
            onChange={setName}
            placeholder={selectedTemplate.name}
          />
        </div>

        <div className="grid min-w-0 gap-[var(--space-4)] xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-[var(--space-2)]">
            {templates.map((template) => {
              const selected = template.id === selectedTemplate.id;
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
                  onClick={() => setTemplateId(template.id)}
                >
                  <span className="entity-eyebrow">{formatValue(template.category)}</span>
                  <strong>{template.name}</strong>
                  <span className="muted text-[0.78rem] leading-[1.25]">
                    {formatValue(template.outputType)} · {template.graph.nodes.length} nodes
                  </span>
                </button>
              );
            })}
          </div>

          <section className="grid min-w-0 content-start gap-[var(--space-4)]">
            <div className="grid gap-[var(--space-2)]">
              <span className="entity-eyebrow">{formatValue(selectedTemplate.outputType)}</span>
              <h3 className="m-0 text-[1.35rem] font-[720] leading-[1.1]">
                {selectedTemplate.name}
              </h3>
              <p className="muted">{selectedTemplate.purpose}</p>
            </div>
            <TextArea
              label="Content idea"
              value={prompt}
              onChange={setPrompt}
              placeholder="Create a TikTok carousel explaining why most calorie trackers fail after week two, and position my app as the simpler daily check-in."
              rows={8}
            />
            <div className="grid gap-[var(--space-3)]">
              <h4 className="m-0 text-[0.95rem] font-[680]">Draft setup</h4>
              <div className="grid gap-[var(--space-2)]">
                {selectedTemplate.requiredInputs.map((input) => (
                  <div
                    className="grid gap-[var(--space-1)] border-t border-[var(--color-border)] pt-[var(--space-2)]"
                    key={input.key}
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
                      <strong className="text-[0.9rem]">{input.label}</strong>
                      <span className="entity-eyebrow">{formatValue(input.kind)}</span>
                      {!input.required && <span className="muted text-[0.76rem]">Optional</span>}
                    </div>
                    <p className="muted text-[0.82rem]">{input.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <button
              className="primary-button justify-self-start"
              disabled={!selectedBrandId || !prompt.trim()}
              type="submit"
            >
              <Sparkles size={16} />
              Create workflow draft
              <ArrowRight size={16} />
            </button>
            {status && <p className="muted">{status}</p>}
            {brands?.length === 0 && (
              <p className="muted">Create a brand before drafting workflows.</p>
            )}
          </section>
        </div>
      </form>

      <Panel title="Recent Drafts">
        {recentDrafts.length === 0 ? (
          <div className="empty-state">No Create drafts yet.</div>
        ) : (
          <div className="entity-grid">
            {recentDrafts.map((workflow) => (
              <Link
                className="entity-card workflow-card-link"
                key={workflow._id}
                to={`/workflows/${workflow._id}`}
              >
                <div className="entity-eyebrow">{workflow.isActive ? "Active" : "Draft"}</div>
                <h3>{workflow.name}</h3>
                <p>{workflow.description}</p>
                <span>{workflow.isActive ? "Active" : "Draft"}</span>
                <span className="workflow-card-action">
                  <LayoutTemplate size={15} />
                  Open canvas
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </Page>
  );
}
