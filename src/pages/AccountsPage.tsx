import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { Field, LoadingState, Page, Select } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { AccountsTable } from "../features/accounts/AccountsTable";
import {
  ACCOUNT_CREATION_PLATFORMS,
  PLATFORM_LABELS,
  aggregateMetricsByAccount,
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

  if (message.includes("PostBridge rejected")) {
    return message;
  }

  return message || `${providerLabel} account sync failed.`;
}

export function AccountsPage() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const accounts = useQuery(api.accounts.socialAccounts.list, workspaceArgs);
  const postMetrics = useQuery(api.publishing.metrics.list, workspaceArgs);
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
  const accountMetricsById = useMemo(() => aggregateMetricsByAccount(postMetrics), [postMetrics]);
  const sortedAccounts = useMemo(() => {
    if (!accounts) return undefined;

    return [...accounts].sort((left, right) => {
      const statusSort = Number(left.status !== "connected") - Number(right.status !== "connected");
      if (statusSort !== 0) return statusSort;
      return left.username.localeCompare(right.username);
    });
  }, [accounts]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim()) return;

    await upsertAccount({
      ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
      provider: "manual",
      platform,
      externalAccountId: `manual:${platform}:${username.trim()}`,
      username: username.trim(),
      status: "disconnected",
      capabilities: ["publish", "schedule", "analytics"],
      metadata: {
        credentials: {
          email: email.trim(),
          password,
        },
      },
    });
    setUsername("");
    setEmail("");
    setPassword("");
  };

  const handleSync = async (providerToSync: PublishingProvider = DEFAULT_PUBLISHING_PROVIDER) => {
    if (providerToSync === "manual") return;

    const route = publishingRouteForProvider(providerToSync);
    setSyncStatus({ tone: "info", message: `Syncing ${route.label} accounts...` });
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
      setSyncStatus({
        tone: "error",
        message: syncErrorMessage(error, route.label),
      });
    }
  };

  const toggleAccountReveal = (accountId: string) => {
    setRevealedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const linkAccountWithPostBridge = async (account: SocialAccount) => {
    setActionStatus(`Looking for ${account.username} in PostBridge`);
    await handleSync(DEFAULT_PUBLISHING_PROVIDER);
    setActionStatus("");
  };

  const removeAccount = async (account: SocialAccount) => {
    const confirmed = window.confirm(`Delete ${account.username} from this workspace?`);
    if (!confirmed) return;

    setActionStatus(`Deleting ${account.username}`);
    try {
      await deleteAccount({ id: account._id });
      setActionStatus("");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Account delete failed.");
    }
  };

  const saveAccountCredentials = async (
    account: SocialAccount,
    credentials: Required<AccountCredentials>
  ) => {
    setActionStatus(`Saving credentials for ${account.username}`);
    try {
      await updateAccountCredentials({
        id: account._id,
        email: credentials.email,
        password: credentials.password,
      });
      setActionStatus(`Saved credentials for ${account.username}`);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Credential save failed.");
    }
  };

  return (
    <Page
      title="Accounts"
      description={`Linked social accounts, login details, and publishing activity for ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <section className="grid gap-[var(--space-3)] border-y border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)] py-[var(--space-4)] shadow-[var(--shadow-sm)]">
        <form className="grid gap-[var(--space-3)]" onSubmit={handleSubmit}>
          <div className="grid gap-[var(--space-3)] md:grid-cols-2 xl:grid-cols-[minmax(11rem,0.7fr)_minmax(15rem,1fr)_minmax(16rem,1.05fr)_minmax(16rem,1.05fr)] xl:items-end">
            <Select
              label="Platform"
              value={platform}
              onChange={(value) => setPlatform(value as Platform)}
            >
              {ACCOUNT_CREATION_PLATFORMS.map((accountPlatform) => (
                <option key={accountPlatform} value={accountPlatform}>
                  {PLATFORM_LABELS[accountPlatform]}
                </option>
              ))}
            </Select>
            <Field label="Username" value={username} onChange={setUsername} placeholder="Account handle" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="name@email.com" />
            <label className="field">
              <span>Password</span>
              <input
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                value={password}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-[var(--space-2)] xl:justify-end">
            <button className="primary-button min-w-[7rem] whitespace-nowrap" disabled={!username.trim()} type="submit">
              <Plus size={16} />
              Add
            </button>
            <button
              className="secondary-button whitespace-nowrap"
              type="button"
              onClick={() => void handleSync(DEFAULT_PUBLISHING_PROVIDER)}
            >
              <RefreshCw size={16} />
              Sync PostBridge
            </button>
          </div>
        </form>
        {syncStatus ? (
          <div
            className={[
              "flex max-w-[42rem] items-start gap-2 rounded-md border px-3 py-2 text-[0.86rem] leading-relaxed",
              syncStatus.tone === "error"
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : syncStatus.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-muted)]",
            ].join(" ")}
            role={syncStatus.tone === "error" ? "alert" : "status"}
          >
            {syncStatus.tone === "error" ? (
              <AlertCircle className="mt-0.5 shrink-0" size={16} />
            ) : syncStatus.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
            ) : (
              <RefreshCw className="mt-0.5 shrink-0" size={16} />
            )}
            <span>{syncStatus.message}</span>
          </div>
        ) : null}
        {actionStatus ? (
          <div className="text-[0.8rem] font-[650] text-[var(--color-ink-muted)]" role="status">
            {actionStatus}
          </div>
        ) : null}
      </section>

      <section className="grid min-w-0 gap-[var(--space-3)]">
        <div className="flex flex-wrap items-end justify-between gap-[var(--space-3)]">
          <div>
            <h2 className="m-0 text-[1rem] font-[760] tracking-normal text-[var(--color-ink)]">
              Account list
            </h2>
          </div>
        </div>
        {!sortedAccounts || !postMetrics ? (
          <LoadingState title="Loading accounts" compact />
        ) : sortedAccounts.length === 0 ? (
          <div className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)] py-[var(--space-6)] text-[0.9rem] text-[var(--color-ink-muted)]">
            No accounts connected yet. Add one above, or sync a publishing provider.
          </div>
        ) : (
          <AccountsTable
            accountMetricsById={accountMetricsById}
            accounts={sortedAccounts}
            onDeleteAccount={(account) => void removeAccount(account)}
            onLinkAccount={(account) => void linkAccountWithPostBridge(account)}
            onRefreshProvider={(account) => void handleSync(account.provider)}
            onSaveCredentials={saveAccountCredentials}
            onToggleReveal={toggleAccountReveal}
            revealedAccountIds={revealedAccountIds}
          />
        )}
      </section>
    </Page>
  );
}
