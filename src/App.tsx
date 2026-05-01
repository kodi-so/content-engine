import { SignInButton, SignOutButton, useAuth, useUser } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import {
  BarChart3,
  Boxes,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  GalleryHorizontalEnd,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  Play,
  Plus,
  Radio,
  Settings,
} from "lucide-react";
import { FormEvent, ReactNode, useMemo, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

type BrandId = Id<"brands">;
type SocialAccountId = Id<"socialAccounts">;
type WorkflowId = Id<"workflows">;
type PublishingProvider = "postiz" | "post_bridge" | "reel_farm" | "manual";
type Platform = "tiktok" | "instagram" | "youtube" | "x" | "linkedin";
type ContentFormat = "slideshow" | "hook_demo_video" | "ai_ugc_video";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/brands", label: "Brands", icon: Building2 },
  { to: "/accounts", label: "Accounts", icon: Link2 },
  { to: "/workflows", label: "Workflows", icon: Bot },
  { to: "/runs", label: "Runs", icon: Radio },
  { to: "/library", label: "Library", icon: GalleryHorizontalEnd },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

function AppContent() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <SignInScreen />;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="workspace">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Sidebar() {
  const { user } = useUser();

  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <BrainCircuit size={22} />
        <span>Content Engine</span>
      </div>

      <nav className="nav-list">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="user-panel">
        <div className="user-meta">
          <div className="avatar">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt={user.fullName || "User"} />
            ) : (
              <span>{user?.fullName?.[0] || "U"}</span>
            )}
          </div>
          <div>
            <div className="user-name">{user?.fullName || "User"}</div>
            <div className="user-email">{user?.primaryEmailAddress?.emailAddress}</div>
          </div>
        </div>
        <SignOutButton signOutOptions={{ redirectUrl: "/" }}>
          <button className="quiet-button" type="button">
            <LogOut size={16} />
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}

function Dashboard() {
  const brands = useQuery(api.brands.list);
  const accounts = useQuery(api.socialAccounts.list);
  const workflows = useQuery(api.workflows.list);
  const runs = useQuery(api.workflowRuns.list, {});
  const artifacts = useQuery(api.artifacts.list, {});

  const runningRuns = runs?.filter((run) => run.status === "running").length ?? 0;
  const approvalRuns =
    runs?.filter((run) => run.status === "waiting_for_approval").length ?? 0;

  return (
    <Page title="Operations Dashboard" description="The control room for autonomous content workflows.">
      <div className="metric-grid">
        <Metric label="Brands" value={brands?.length ?? 0} />
        <Metric label="Social Accounts" value={accounts?.length ?? 0} />
        <Metric label="Workflows" value={workflows?.length ?? 0} />
        <Metric label="Artifacts" value={artifacts?.length ?? 0} />
      </div>

      <div className="two-column">
        <Panel title="Run Health">
          <div className="status-row">
            <span>Running now</span>
            <strong>{runningRuns}</strong>
          </div>
          <div className="status-row">
            <span>Waiting for approval</span>
            <strong>{approvalRuns}</strong>
          </div>
          <div className="status-row">
            <span>Total runs</span>
            <strong>{runs?.length ?? 0}</strong>
          </div>
        </Panel>

        <Panel title="Architecture Baseline">
          <ChecklistItem done label="Provider-backed social accounts" />
          <ChecklistItem done label="Workflow definitions and versions" />
          <ChecklistItem done label="Run events and artifacts" />
          <ChecklistItem done label="Distribution plans and metrics" />
        </Panel>
      </div>
    </Page>
  );
}

function BrandsPage() {
  const brands = useQuery(api.brands.list);
  const createBrand = useMutation(api.brands.create);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [voice, setVoice] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    await createBrand({
      name: name.trim(),
      niche: niche.trim() || undefined,
      voice: voice.trim() || undefined,
    });
    setName("");
    setNiche("");
    setVoice("");
  };

  return (
    <Page title="Brands" description="Define the memory and strategy that each account runs on.">
      <FormPanel title="Create Brand" onSubmit={handleSubmit}>
        <Field label="Name" value={name} onChange={setName} placeholder="Habit Lab" />
        <Field label="Niche" value={niche} onChange={setNiche} placeholder="Self-improvement for busy founders" />
        <Field label="Voice" value={voice} onChange={setVoice} placeholder="Clear, practical, slightly contrarian" />
        <button className="primary-button" type="submit">
          <Plus size={16} />
          Create brand
        </button>
      </FormPanel>

      <EntityGrid
        empty="No brands yet."
        items={brands?.map((brand) => ({
          id: brand._id,
          title: brand.name,
          eyebrow: brand.niche || "No niche set",
          body: brand.voice || brand.description || "Brand strategy is ready to be filled in.",
          meta: brand.isActive ? "Active" : "Inactive",
        }))}
      />
    </Page>
  );
}

function AccountsPage() {
  const brands = useQuery(api.brands.list);
  const accounts = useQuery(api.socialAccounts.list);
  const upsertAccount = useMutation(api.socialAccounts.upsertManual);
  const [brandId, setBrandId] = useState("");
  const [provider, setProvider] = useState<PublishingProvider>("postiz");
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [username, setUsername] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim()) return;

    await upsertAccount({
      brandId: brandId ? (brandId as BrandId) : undefined,
      provider,
      platform,
      externalAccountId: `${provider}:${platform}:${username.trim()}`,
      username: username.trim(),
      capabilities: ["publish", "schedule", "analytics"],
    });
    setUsername("");
  };

  return (
    <Page title="Social Accounts" description="Provider-backed accounts replace direct platform OAuth.">
      <FormPanel title="Add Provider Account" onSubmit={handleSubmit}>
        <Select label="Brand" value={brandId} onChange={setBrandId}>
          <option value="">Unassigned</option>
          {brands?.map((brand) => (
            <option key={brand._id} value={brand._id}>
              {brand.name}
            </option>
          ))}
        </Select>
        <Select
          label="Provider"
          value={provider}
          onChange={(value) => setProvider(value as PublishingProvider)}
        >
          <option value="postiz">Postiz</option>
          <option value="post_bridge">Post Bridge</option>
          <option value="reel_farm">ReelFarm</option>
          <option value="manual">Manual</option>
        </Select>
        <Select
          label="Platform"
          value={platform}
          onChange={(value) => setPlatform(value as Platform)}
        >
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="x">X</option>
          <option value="linkedin">LinkedIn</option>
        </Select>
        <Field label="Username" value={username} onChange={setUsername} placeholder="@account" />
        <button className="primary-button" type="submit">
          <Plus size={16} />
          Add account
        </button>
      </FormPanel>

      <EntityGrid
        empty="No social accounts connected yet."
        items={accounts?.map((account) => ({
          id: account._id,
          title: account.username,
          eyebrow: `${account.platform} via ${account.provider}`,
          body: account.capabilities?.join(", ") || "Capabilities will sync from the provider.",
          meta: account.status,
        }))}
      />
    </Page>
  );
}

function WorkflowsPage() {
  const brands = useQuery(api.brands.list);
  const accounts = useQuery(api.socialAccounts.list);
  const workflows = useQuery(api.workflows.list);
  const createWorkflow = useMutation(api.workflows.create);
  const [brandId, setBrandId] = useState("");
  const [socialAccountId, setSocialAccountId] = useState("");
  const [name, setName] = useState("");
  const [contentFormat, setContentFormat] = useState<ContentFormat>("slideshow");

  const brandAccounts = useMemo(
    () =>
      accounts?.filter((account) => !brandId || account.brandId === brandId) ?? [],
    [accounts, brandId]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!brandId || !name.trim()) return;

    await createWorkflow({
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
      steps: [
        {
          id: "generate-outline",
          name: "Generate outline",
          type: "generate_text",
          outputRef: "outline",
        },
        {
          id: "create-distribution-plan",
          name: "Create distribution plan",
          type: "create_distribution_plan",
          inputRefs: ["outline"],
        },
      ],
    });
    setName("");
  };

  return (
    <Page title="Workflows" description="Repeatable agent pipelines for each brand/account.">
      <FormPanel title="Create Workflow" onSubmit={handleSubmit}>
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
          Create workflow
        </button>
      </FormPanel>

      <EntityGrid
        empty="No workflows yet."
        items={workflows?.map((workflow) => ({
          id: workflow._id,
          title: workflow.name,
          eyebrow: workflow.contentFormat,
          body: workflow.description || `${workflow.trigger} trigger with ${workflow.publishingPolicy.provider} publishing`,
          meta: workflow.isActive ? "Active" : "Paused",
        }))}
      />
    </Page>
  );
}

function RunsPage() {
  const workflows = useQuery(api.workflows.list);
  const runs = useQuery(api.workflowRuns.list, {});
  const createManualRun = useMutation(api.workflowRuns.createManualRun);

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

      <EntityGrid
        empty="No workflow runs yet."
        items={runs?.map((run) => ({
          id: run._id,
          title: run.generatedTopic || "Untitled run",
          eyebrow: run.status,
          body: run.summary || run.errorMessage || "Queued for the workflow runner.",
          meta: new Date(run.createdAt).toLocaleString(),
        }))}
      />
    </Page>
  );
}

function LibraryPage() {
  const artifacts = useQuery(api.artifacts.list, {});

  return (
    <Page title="Artifact Library" description="Generated prompts, captions, images, slides, videos, and publish payloads.">
      <EntityGrid
        empty="No artifacts yet."
        items={artifacts?.map((artifact) => ({
          id: artifact._id,
          title: artifact.title || artifact.type,
          eyebrow: artifact.type,
          body: artifact.prompt || "Artifact metadata will appear here as workflows run.",
          meta: artifact.reviewStatus,
        }))}
      />
    </Page>
  );
}

function AnalyticsPage() {
  const metrics = useQuery(api.metrics.list, {});

  return (
    <Page title="Analytics" description="Performance data will feed future workflow decisions.">
      <div className="metric-grid">
        <Metric label="Metric Snapshots" value={metrics?.length ?? 0} />
        <Metric
          label="Total Views"
          value={metrics?.reduce((sum, item) => sum + (item.metrics.views ?? 0), 0) ?? 0}
        />
        <Metric
          label="Total Likes"
          value={metrics?.reduce((sum, item) => sum + (item.metrics.likes ?? 0), 0) ?? 0}
        />
      </div>
    </Page>
  );
}

function SettingsPage() {
  return (
    <Page title="Settings" description="Provider configuration will move here as adapters come online.">
      <div className="two-column">
        <Panel title="Publishing Providers">
          <ChecklistItem done label="Postiz selected as first adapter" />
          <ChecklistItem label="Post Bridge spike pending" />
          <ChecklistItem label="ReelFarm optional provider pending" />
        </Panel>
        <Panel title="Model Providers">
          <ChecklistItem done label="Gemini remains available through adapter" />
          <ChecklistItem label="fal.ai adapter pending" />
          <ChecklistItem label="OpenRouter adapter pending" />
        </Panel>
      </div>
    </Page>
  );
}

function Page({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="page-header">
        <p className="eyebrow">Agentic content operations</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function FormPanel({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <form className="panel form-grid" onSubmit={onSubmit}>
      <h2>{title}</h2>
      {children}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

function ChecklistItem({ done = false, label }: { done?: boolean; label: string }) {
  return (
    <div className="check-item">
      <CheckCircle2 size={16} className={done ? "done" : ""} />
      <span>{label}</span>
    </div>
  );
}

function EntityGrid({
  empty,
  items,
}: {
  empty: string;
  items:
    | Array<{
        id: string;
        title: string;
        eyebrow: string;
        body: string;
        meta: string;
      }>
    | undefined;
}) {
  if (!items) {
    return <div className="empty-state">Loading...</div>;
  }

  if (items.length === 0) {
    return <div className="empty-state">{empty}</div>;
  }

  return (
    <div className="entity-grid">
      {items.map((item) => (
        <article className="entity-card" key={item.id}>
          <div className="entity-eyebrow">{item.eyebrow}</div>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <span>{item.meta}</span>
        </article>
      ))}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="center-screen">
      <Boxes size={28} />
      <p>Loading Content Engine...</p>
    </div>
  );
}

function SignInScreen() {
  return (
    <div className="signin-screen">
      <div className="signin-copy">
        <KeyRound size={32} />
        <h1>Content Engine</h1>
        <p>Sign in to run the agentic content operations console.</p>
        <SignInButton mode="modal">
          <button className="primary-button" type="button">
            Sign in
          </button>
        </SignInButton>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
