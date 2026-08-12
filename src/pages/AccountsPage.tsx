import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Field, LoadingState, Page, Select } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { AccountsTable } from "../features/accounts/AccountsTable";
import { ManagedAccountInspector } from "../features/accounts/ManagedAccountInspector";
import {
  ACCOUNT_CREATION_PLATFORMS,
  PLATFORM_LABELS,
  aggregateMetricsByAccount,
  platformLabel,
  type AccountCredentials,
  type SocialAccount,
} from "../features/accounts/accountDisplay";
import {
  DEFAULT_PUBLISHING_PROVIDER,
  publishingRouteForProvider,
} from "../lib/publishingRouting";
import type { Platform, PublishingProvider } from "../types";

type SyncStatus = {
  tone: "info" | "success" | "error";
  message: string;
};

function syncErrorMessage(error: unknown, providerLabel: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("POSTBRIDGE_API_KEY")) {
    return "PostBridge needs a valid API key before account sync can run. Add or refresh POSTBRIDGE_API_KEY in Convex, then try again.";
  }
  if (message.includes("PostBridge rejected")) return message;
  return message || `${providerLabel} account sync failed.`;
}

function AccountAvatar({ account }: { account: SocialAccount }) {
  return account.avatarUrl ? (
    <img alt="" className="size-9 shrink-0 rounded-full border border-[var(--color-border)] object-cover" src={account.avatarUrl} />
  ) : (
    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-faint)]"><Bot size={15} /></span>
  );
}

export function AccountsPage() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const accounts = useQuery(api.accounts.socialAccounts.list, workspaceArgs);
  const postMetrics = useQuery(api.publishing.metrics.list, workspaceArgs);
  const requestedAccountId = searchParams.get("accountId") as Id<"socialAccounts"> | null;
  const selectedAccountId = requestedAccountId && accounts?.some((account) => account._id === requestedAccountId)
    ? requestedAccountId
    : accounts?.[0]?._id;
  const accountDetail = useQuery(
    api.accounts.managedAccounts.get,
    selectedAccountId ? { id: selectedAccountId } : "skip"
  );
  const upsertAccount = useMutation(api.accounts.socialAccounts.upsertManual);
  const updateAccountCredentials = useMutation(api.accounts.socialAccounts.updateCredentials);
  const deleteAccount = useMutation(api.accounts.socialAccounts.remove);
  const syncProviderAccounts = useAction(api.accounts.socialAccounts.syncProviderAccounts);
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [revealedAccountIds, setRevealedAccountIds] = useState<Set<string>>(() => new Set());
  const [actionStatus, setActionStatus] = useState("");
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const accountMetricsById = useMemo(() => aggregateMetricsByAccount(postMetrics), [postMetrics]);
  const sortedAccounts = useMemo(() => {
    if (!accounts) return undefined;
    return [...accounts].sort((left, right) => {
      const statusSort = Number(left.status !== "connected") - Number(right.status !== "connected");
      if (statusSort !== 0) return statusSort;
      return left.username.localeCompare(right.username);
    });
  }, [accounts]);
  const selectedAccount = sortedAccounts?.find((account) => account._id === selectedAccountId);

  useEffect(() => {
    if (requestedAccountId || !accounts?.[0]) return;
    setSearchParams({ accountId: String(accounts[0]._id) }, { replace: true });
  }, [accounts, requestedAccountId, setSearchParams]);

  const selectAccount = (id: Id<"socialAccounts">) => {
    setSearchParams({ accountId: String(id) });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim()) return;
    const id = await upsertAccount({
      ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
      provider: "manual",
      platform,
      externalAccountId: `manual:${platform}:${username.trim()}`,
      username: username.trim(),
      status: "disconnected",
      capabilities: ["publish", "schedule", "analytics"],
      metadata: { credentials: { email: email.trim(), password } },
    });
    setUsername("");
    setEmail("");
    setPassword("");
    setSearchParams({ accountId: String(id) });
  };

  const handleSync = async (providerToSync: PublishingProvider = DEFAULT_PUBLISHING_PROVIDER) => {
    if (providerToSync === "manual") return;
    const route = publishingRouteForProvider(providerToSync);
    setSyncStatus({ tone: "info", message: `Syncing ${route.label} accounts…` });
    try {
      const result = await syncProviderAccounts({
        provider: providerToSync,
        ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
      });
      setSyncStatus({
        tone: "success",
        message: result.linked > 0
          ? `Synced ${result.synced} ${route.label} accounts and linked ${result.linked} existing account${result.linked === 1 ? "" : "s"}.`
          : `Synced ${result.synced} ${route.label} accounts.`,
      });
    } catch (error) {
      setSyncStatus({ tone: "error", message: syncErrorMessage(error, route.label) });
    }
  };

  const toggleAccountReveal = (accountId: string) => {
    setRevealedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const linkAccountWithPostBridge = async (account: SocialAccount) => {
    setActionStatus(`Looking for ${account.username} in PostBridge`);
    await handleSync(DEFAULT_PUBLISHING_PROVIDER);
    setActionStatus("");
  };

  const removeAccount = async (account: SocialAccount) => {
    const confirmed = window.confirm(`Delete ${account.username} and its account-management history from this workspace?`);
    if (!confirmed) return;
    setActionStatus(`Deleting ${account.username}`);
    try {
      await deleteAccount({ id: account._id });
      const remaining = sortedAccounts?.find((candidate) => candidate._id !== account._id);
      setSearchParams(remaining ? { accountId: String(remaining._id) } : {});
      setActionStatus("");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Account delete failed.");
    }
  };

  const saveAccountCredentials = async (account: SocialAccount, credentials: Required<AccountCredentials>) => {
    setActionStatus(`Saving credentials for ${account.username}`);
    try {
      await updateAccountCredentials({ id: account._id, email: credentials.email, password: credentials.password });
      setActionStatus(`Saved credentials for ${account.username}`);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Credential save failed.");
    }
  };

  const connectionPanel = selectedAccount ? (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h3 className="m-0 text-[0.96rem] font-[780] text-[var(--color-ink)]">Connection and credentials</h3>
        <p className="m-0 text-[0.8rem] leading-relaxed text-[var(--color-ink-muted)]">Provider linkage is how the account publishes. It is kept separate from the creative context the Agent uses.</p>
      </div>
      {postMetrics ? (
        <AccountsTable
          accountMetricsById={accountMetricsById}
          accounts={[selectedAccount]}
          onDeleteAccount={(account) => void removeAccount(account)}
          onLinkAccount={(account) => void linkAccountWithPostBridge(account)}
          onRefreshProvider={(account) => void handleSync(account.provider)}
          onSaveCredentials={saveAccountCredentials}
          onToggleReveal={toggleAccountReveal}
          revealedAccountIds={revealedAccountIds}
        />
      ) : <LoadingState title="Loading connection" compact />}
      {actionStatus ? <div className="text-[0.78rem] font-[650] text-[var(--color-ink-muted)]">{actionStatus}</div> : null}
    </div>
  ) : null;

  return (
    <Page
      title="Accounts"
      description={`Give each social account a point of view, a memory, and an Agent that can manage it for ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <section className="grid min-h-[38rem] overflow-hidden border-y border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="grid content-start border-b border-[var(--color-border)] bg-[var(--color-page)] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-3">
            <div>
              <div className="text-[0.72rem] font-[780] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">Managed accounts</div>
              <div className="text-[0.76rem] text-[var(--color-ink-muted)]">{sortedAccounts?.length ?? 0} total</div>
            </div>
            <button aria-label="Add or sync an account" className="inline-grid size-8 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-[var(--color-border-strong)]" onClick={() => setConnectionsOpen((value) => !value)} title="Add or sync account" type="button"><Plus size={15} /></button>
          </div>
          {!sortedAccounts ? (
            <div className="p-4"><LoadingState title="Loading accounts" compact /></div>
          ) : sortedAccounts.length === 0 ? (
            <div className="grid gap-3 px-4 py-8 text-center"><Sparkles className="mx-auto text-[var(--color-ink-faint)]" size={20} /><p className="m-0 text-[0.8rem] leading-relaxed text-[var(--color-ink-muted)]">Connect an account to give its Agent a home.</p><button className="secondary-button justify-center" onClick={() => setConnectionsOpen(true)} type="button"><Plus size={14} />Add account</button></div>
          ) : (
            <nav aria-label="Social accounts" className="grid py-1">
              {sortedAccounts.map((account) => {
                const selected = account._id === selectedAccountId;
                return (
                  <button className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-0 border-l-2 px-3 py-2.5 text-left transition ${selected ? "border-l-[var(--color-accent)] bg-[var(--color-surface)]" : "border-l-transparent bg-transparent hover:bg-[var(--color-surface)]"}`} key={account._id} onClick={() => selectAccount(account._id)} type="button">
                    <AccountAvatar account={account} />
                    <span className="grid min-w-0 gap-0.5"><strong className="truncate text-[0.81rem] font-[750] text-[var(--color-ink)]">@{account.username.replace(/^@/, "")}</strong><span className="truncate text-[0.68rem] text-[var(--color-ink-faint)]">{platformLabel(account.platform)}</span></span>
                    <span className={`size-2 rounded-full ${account.autopilotStatus === "active" ? "bg-emerald-500" : account.status === "connected" ? "bg-sky-400" : "bg-[var(--color-border-strong)]"}`} title={account.autopilotStatus === "active" ? "Autopilot active" : account.status} />
                  </button>
                );
              })}
            </nav>
          )}
          <button className="mt-1 flex items-center gap-2 border-0 border-t border-[var(--color-border)] bg-transparent px-4 py-3 text-left text-[0.74rem] font-[700] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" onClick={() => setConnectionsOpen((value) => !value)} type="button"><Settings2 size={14} />Account connections<ChevronDown className={`ml-auto transition ${connectionsOpen ? "rotate-180" : ""}`} size={14} /></button>
        </aside>

        <div className="min-w-0">
          {accountDetail && selectedAccount ? (
            <ManagedAccountInspector connectionPanel={connectionPanel} detail={accountDetail} />
          ) : selectedAccount ? (
            <div className="p-8"><LoadingState title="Loading account context" /></div>
          ) : (
            <div className="grid min-h-[34rem] place-items-center px-6 text-center"><div className="grid max-w-sm gap-3"><Bot className="mx-auto text-[var(--color-ink-faint)]" size={28} /><h2 className="m-0 text-[1rem] text-[var(--color-ink)]">Your account Agent starts here</h2><p className="m-0 text-[0.84rem] leading-relaxed text-[var(--color-ink-muted)]">Add or sync a social account, then define what it is about and how often its Agent should create.</p></div></div>
          )}
        </div>
      </section>

      {connectionsOpen ? (
        <section className="mt-4 grid gap-4 border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="m-0 text-[0.94rem] font-[780] text-[var(--color-ink)]">Add or sync an account</h2><p className="m-0 mt-1 text-[0.76rem] text-[var(--color-ink-muted)]">Existing provider links and saved login details are preserved.</p></div><button className="secondary-button" onClick={() => void handleSync(DEFAULT_PUBLISHING_PROVIDER)} type="button"><RefreshCw size={14} />Sync PostBridge</button></div>
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[0.7fr_1fr_1fr_1fr_auto] xl:items-end" onSubmit={handleSubmit}>
            <Select label="Platform" onChange={(value) => setPlatform(value as Platform)} value={platform}>{ACCOUNT_CREATION_PLATFORMS.map((accountPlatform) => <option key={accountPlatform} value={accountPlatform}>{PLATFORM_LABELS[accountPlatform]}</option>)}</Select>
            <Field label="Username" onChange={setUsername} placeholder="Account handle" value={username} />
            <Field label="Email" onChange={setEmail} placeholder="Optional login email" value={email} />
            <label className="field"><span>Password</span><input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} placeholder="Optional password" type="password" value={password} /></label>
            <button className="primary-button whitespace-nowrap" disabled={!username.trim()} type="submit"><Plus size={15} />Add account</button>
          </form>
          {syncStatus ? (
            <div className={`flex max-w-3xl items-start gap-2 rounded-md border px-3 py-2 text-[0.8rem] ${syncStatus.tone === "error" ? "border-amber-300 bg-amber-50 text-amber-950" : syncStatus.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-muted)]"}`} role={syncStatus.tone === "error" ? "alert" : "status"}>
              {syncStatus.tone === "error" ? <AlertCircle size={15} /> : syncStatus.tone === "success" ? <CheckCircle2 size={15} /> : <RefreshCw size={15} />}<span>{syncStatus.message}</span>
            </div>
          ) : null}
        </section>
      ) : null}
    </Page>
  );
}
