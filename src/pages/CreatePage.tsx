import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Sparkles, Workflow } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Field, Page, Panel, Select, TextArea } from "../components/ui";
import { DEFAULT_PUBLISHING_PROVIDER } from "../lib/publishingRouting";
import { createStarterWorkflowGraph } from "../lib/workflow/workflowGraph";
import type { BrandId, SocialAccountId } from "../types";

function draftName(prompt: string) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!cleanPrompt) return "Untitled workflow";
  return cleanPrompt.length > 54 ? `${cleanPrompt.slice(0, 54)}...` : cleanPrompt;
}

export function CreatePage() {
  const navigate = useNavigate();
  const brands = useQuery(api.accounts.brands.list);
  const accounts = useQuery(api.accounts.socialAccounts.list);
  const workflows = useQuery(api.workflows.definitions.list);
  const createWorkflow = useMutation(api.workflows.definitions.create);
  const [brandId, setBrandId] = useState("");
  const [socialAccountId, setSocialAccountId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  const selectedBrandId = brandId || "";
  const brandAccounts = useMemo(
    () =>
      accounts?.filter((account) => !selectedBrandId || account.brandId === selectedBrandId) ??
      [],
    [accounts, selectedBrandId]
  );
  const recentDrafts = useMemo(
    () =>
      workflows
        ?.filter((workflow) => workflow.description?.startsWith("Prompt draft:"))
        .slice(0, 4) ?? [],
    [workflows]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const targetBrandId = selectedBrandId;
    const creativeRequest = prompt.trim();
    if (!creativeRequest) return;

    setStatus("Creating workflow draft");
    try {
      const workflowId = await createWorkflow({
        brandId: targetBrandId ? (targetBrandId as BrandId) : undefined,
        socialAccountId: socialAccountId ? (socialAccountId as SocialAccountId) : undefined,
        name: name.trim() || draftName(creativeRequest),
        description: `Prompt draft: ${creativeRequest}`,
        trigger: "manual",
        approvalPolicy: { mode: "always" },
        publishingPolicy: {
          provider: DEFAULT_PUBLISHING_PROVIDER,
          autoPublish: false,
          defaultPlatforms: ["tiktok"],
        },
        graph: createStarterWorkflowGraph(),
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
            placeholder="Untitled workflow"
          />
        </div>

        <div className="grid min-w-0 gap-[var(--space-4)]">
          <section className="grid min-w-0 content-start gap-[var(--space-4)]">
            <div className="grid gap-[var(--space-2)]">
              <h3 className="m-0 text-[1.35rem] font-[720] leading-[1.1]">
                Blank Canvas Draft
              </h3>
              <p className="muted">
                Capture the intent here, then compose the exact workflow on the canvas with nodes.
              </p>
            </div>
            <TextArea
              label="Content idea"
              value={prompt}
              onChange={setPrompt}
              placeholder="Create a TikTok carousel explaining why most calorie trackers fail after week two, and position my app as the simpler daily check-in."
              rows={8}
            />
            <button
              className="primary-button justify-self-start"
              disabled={!prompt.trim()}
              type="submit"
            >
              <Sparkles size={16} />
              Create workflow draft
              <ArrowRight size={16} />
            </button>
            {status && <p className="muted">{status}</p>}
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
                  <Workflow size={15} />
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
