import { Copy, Eye, EyeOff, Link2, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  EMPTY_METRICS,
  type AccountCredentials,
  credentialsForAccount,
  formatMetric,
  platformLabel,
  providerLabel,
  statusClassName,
  statusLabel,
  type AccountMetrics,
  type SocialAccount,
} from "./accountDisplay";

type AccountsTableProps = {
  accountMetricsById: Map<string, AccountMetrics>;
  accounts: SocialAccount[];
  onDeleteAccount: (account: SocialAccount) => void;
  onLinkAccount: (account: SocialAccount) => void;
  onRefreshProvider: (account: SocialAccount) => void;
  onSaveCredentials: (account: SocialAccount, credentials: Required<AccountCredentials>) => Promise<void>;
  onToggleReveal: (accountId: string) => void;
  revealedAccountIds: Set<string>;
};

function AccountAvatar({ account }: { account: SocialAccount }) {
  const [isVisible, setIsVisible] = useState(Boolean(account.avatarUrl));

  useEffect(() => {
    setIsVisible(Boolean(account.avatarUrl));
  }, [account.avatarUrl]);

  if (!account.avatarUrl || !isVisible) return null;

  return (
    <span
      aria-label={`${account.displayName || account.username} profile image`}
      className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-page)] shadow-[inset_0_1px_0_oklch(100%_0_0_/_0.82)]"
    >
      <img
        alt=""
        className="size-full object-cover"
        loading="lazy"
        onError={() => setIsVisible(false)}
        referrerPolicy="no-referrer"
        src={account.avatarUrl}
      />
    </span>
  );
}

type CredentialDraft = Required<AccountCredentials>;
type CopyFeedback = {
  message: string;
  visible: boolean;
};

function normalizeCredentials(credentials: AccountCredentials): CredentialDraft {
  return {
    email: credentials.email ?? "",
    password: credentials.password ?? "",
  };
}

function CredentialCell({
  autoComplete,
  inputType,
  isDirty,
  isSaving,
  label,
  onChange,
  onCopy,
  onSave,
  trailingAction,
  value,
}: {
  autoComplete: string;
  inputType: "email" | "password" | "text";
  isDirty: boolean;
  isSaving: boolean;
  label: string;
  onChange: (value: string) => void;
  onCopy: () => void;
  onSave: () => void;
  trailingAction?: ReactNode;
  value: string;
}) {
  const smallIconButtonClassName = "inline-grid size-7 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink-soft)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-45";
  const fieldClassName = "min-h-8 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-[0.72rem] leading-snug text-[var(--color-ink-soft)] outline-none transition placeholder:text-[var(--color-ink-faint)] hover:border-[var(--color-border)] hover:bg-[var(--color-page)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]";

  return (
    <div
      className={[
        "grid min-w-0 items-center gap-1",
        trailingAction
          ? "grid-cols-[minmax(0,1fr)_1.75rem_1.75rem_1.75rem]"
          : "grid-cols-[minmax(0,1fr)_1.75rem_1.75rem]",
      ].join(" ")}
    >
      {inputType === "password" ? (
        <input
          aria-label={label}
          autoComplete={autoComplete}
          className={fieldClassName}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Not saved"
          type="password"
          value={value}
        />
      ) : (
        <input
          aria-label={label}
          autoComplete={autoComplete}
          className={fieldClassName}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Not saved"
          type={inputType}
          value={value}
        />
      )}
      {trailingAction}
      <button
        aria-label={`Copy ${label.toLowerCase()}`}
        className={smallIconButtonClassName}
        disabled={!value}
        onClick={onCopy}
        title={`Copy ${label.toLowerCase()}`}
        type="button"
      >
        <Copy size={14} />
      </button>
      <button
        aria-label={`Save ${label.toLowerCase()}`}
        className={smallIconButtonClassName}
        disabled={!isDirty || isSaving}
        onClick={onSave}
        title={`Save ${label.toLowerCase()}`}
        type="button"
      >
        <Save size={14} />
      </button>
    </div>
  );
}

const compactIconButtonClassName = "inline-grid size-7 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink-soft)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-45";
const compactDangerIconButtonClassName = `${compactIconButtonClassName} hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]`;

export function AccountsTable({
  accountMetricsById,
  accounts,
  onDeleteAccount,
  onLinkAccount,
  onRefreshProvider,
  onSaveCredentials,
  onToggleReveal,
  revealedAccountIds,
}: AccountsTableProps) {
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, CredentialDraft>>({});
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [savingAccountIds, setSavingAccountIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCredentialDrafts((current) => {
      const next: Record<string, CredentialDraft> = {};
      for (const account of accounts) {
        const accountId = String(account._id);
        next[accountId] = current[accountId] ?? normalizeCredentials(credentialsForAccount(account));
      }
      return next;
    });
  }, [accounts]);

  useEffect(() => {
    if (!copyFeedback?.visible) return undefined;

    const fadeTimeout = window.setTimeout(() => {
      setCopyFeedback((current) =>
        current?.message === copyFeedback.message ? { ...current, visible: false } : current
      );
    }, 1500);
    const clearTimeoutId = window.setTimeout(() => {
      setCopyFeedback((current) =>
        current?.message === copyFeedback.message ? null : current
      );
    }, 2200);

    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(clearTimeoutId);
    };
  }, [copyFeedback?.message, copyFeedback?.visible]);

  const updateCredentialDraft = (
    accountId: string,
    field: keyof CredentialDraft,
    value: string
  ) => {
    setCredentialDrafts((current) => ({
      ...current,
      [accountId]: {
        ...(current[accountId] ?? { email: "", password: "" }),
        [field]: value,
      },
    }));
  };

  const copyCredential = async (value: string, label: "Email" | "Password") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback({ message: `${label} copied`, visible: true });
    } catch {
      setCopyFeedback({ message: "Copy failed", visible: true });
    }
  };

  const saveCredentials = async (account: SocialAccount, draft: CredentialDraft) => {
    const accountId = String(account._id);
    setSavingAccountIds((current) => new Set(current).add(accountId));
    try {
      await onSaveCredentials(account, draft);
    } finally {
      setSavingAccountIds((current) => {
        const next = new Set(current);
        next.delete(accountId);
        return next;
      });
    }
  };

  return (
    <div className="grid min-w-0 gap-2">
      <div className="min-w-0 overflow-hidden border-y border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
        <table className="w-full border-collapse text-left text-[0.8rem]">
          <thead className="bg-[var(--color-page)] text-[0.68rem] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            <tr>
              <th className="w-10 px-[var(--space-2)] py-[var(--space-2)] font-[760]">#</th>
              <th className="w-[13rem] px-[var(--space-2)] py-[var(--space-2)] font-[760]">Account</th>
              <th className="px-[var(--space-2)] py-[var(--space-2)] font-[760]">Email</th>
              <th className="px-[var(--space-2)] py-[var(--space-2)] font-[760]">Password</th>
              <th className="w-16 px-[var(--space-2)] py-[var(--space-2)] text-right font-[760]">Posts</th>
              <th className="w-24 px-[var(--space-2)] py-[var(--space-2)] text-right font-[760]">Impressions</th>
              <th className="w-16 px-[var(--space-2)] py-[var(--space-2)] text-right font-[760]">Clicks</th>
              <th className="w-24 px-[var(--space-2)] py-[var(--space-2)] font-[760]">Status</th>
              <th className="w-20 px-[var(--space-2)] py-[var(--space-2)] text-right font-[760]">Actions</th>
            </tr>
          </thead>
          <tbody>
          {accounts.map((account, index) => {
            const accountId = String(account._id);
            const metrics = accountMetricsById.get(accountId) ?? EMPTY_METRICS;
            const credentials = credentialsForAccount(account);
            const savedCredentials = normalizeCredentials(credentials);
            const credentialDraft = credentialDrafts[accountId] ?? savedCredentials;
            const isRevealed = revealedAccountIds.has(accountId);
            const canRevealPassword = Boolean(credentialDraft.password);
            const isSaving = savingAccountIds.has(accountId);
            const isCredentialDirty =
              credentialDraft.email !== savedCredentials.email ||
              credentialDraft.password !== savedCredentials.password;

            return (
              <tr
                className="border-t border-[var(--color-border)] transition hover:bg-[var(--color-page)]"
                key={account._id}
              >
                <td className="px-[var(--space-2)] py-[var(--space-2)] font-[700] text-[var(--color-ink-faint)]">
                  {index + 1}
                </td>
                <td className="w-[13rem] max-w-[13rem] px-[var(--space-2)] py-[var(--space-2)]">
                  <div className="flex min-w-0 items-center gap-[var(--space-2)]">
                    <AccountAvatar account={account} />
                    <div className="grid min-w-0 gap-[0.1rem]">
                      <strong className="min-w-0 truncate text-[0.86rem] font-[760] text-[var(--color-ink)]">
                        {account.username}
                      </strong>
                      <span className="text-[0.72rem] text-[var(--color-ink-muted)]">
                        {platformLabel(account.platform)} - {providerLabel(account)}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-[var(--space-2)] py-[var(--space-2)]">
                  <CredentialCell
                    autoComplete="email"
                    inputType="email"
                    isDirty={isCredentialDirty}
                    isSaving={isSaving}
                    label={`Email for ${account.username}`}
                    onChange={(value) => updateCredentialDraft(accountId, "email", value)}
                    onCopy={() => void copyCredential(credentialDraft.email, "Email")}
                    onSave={() => void saveCredentials(account, credentialDraft)}
                    value={credentialDraft.email}
                  />
                </td>
                <td className="px-[var(--space-2)] py-[var(--space-2)]">
                  <CredentialCell
                    autoComplete="new-password"
                    inputType={isRevealed ? "text" : "password"}
                    isDirty={isCredentialDirty}
                    isSaving={isSaving}
                    label={`Password for ${account.username}`}
                    onChange={(value) => updateCredentialDraft(accountId, "password", value)}
                    onCopy={() => void copyCredential(credentialDraft.password, "Password")}
                    onSave={() => void saveCredentials(account, credentialDraft)}
                    trailingAction={
                      <button
                        aria-label={`${isRevealed ? "Hide" : "Show"} password for ${account.username}`}
                        className={compactIconButtonClassName}
                        disabled={!canRevealPassword}
                        onClick={() => onToggleReveal(accountId)}
                        title={isRevealed ? "Hide password" : "Show password"}
                        type="button"
                      >
                        {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    }
                    value={credentialDraft.password}
                  />
                </td>
                <td className="whitespace-nowrap px-[var(--space-2)] py-[var(--space-2)] text-right font-[700] tabular-nums text-[var(--color-ink)]">
                  {formatMetric(metrics.posts)}
                </td>
                <td className="whitespace-nowrap px-[var(--space-2)] py-[var(--space-2)] text-right font-[700] tabular-nums text-[var(--color-ink)]">
                  {formatMetric(metrics.impressions)}
                </td>
                <td className="whitespace-nowrap px-[var(--space-2)] py-[var(--space-2)] text-right font-[700] tabular-nums text-[var(--color-ink)]">
                  {formatMetric(metrics.clicks)}
                </td>
                <td className="whitespace-nowrap px-[var(--space-2)] py-[var(--space-2)]">
                  <span className={["inline-flex min-h-[1.65rem] items-center rounded-full border px-[0.5rem] text-[0.7rem] font-[760]", statusClassName(account)].join(" ")}>
                    {statusLabel(account)}
                  </span>
                </td>
                <td className="px-[var(--space-2)] py-[var(--space-2)]">
                  <div className="flex justify-end gap-[var(--space-1)]">
                    {account.provider !== "manual" ? (
                      <button
                        aria-label={`Refresh ${account.username}`}
                        className={compactIconButtonClassName}
                        onClick={() => onRefreshProvider(account)}
                        title="Refresh provider"
                        type="button"
                      >
                        <RefreshCw size={15} />
                      </button>
                    ) : (
                      <button
                        aria-label={`Link ${account.username} with PostBridge`}
                        className={compactIconButtonClassName}
                        onClick={() => onLinkAccount(account)}
                        title="Link with PostBridge"
                        type="button"
                      >
                        <Link2 size={15} />
                      </button>
                    )}
                    <button
                      aria-label={`Delete ${account.username}`}
                      className={compactDangerIconButtonClassName}
                      onClick={() => onDeleteAccount(account)}
                      title="Delete"
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
      <div
        aria-live="polite"
        className={[
          "min-h-[1.25rem] px-[var(--space-2)] text-[0.78rem] font-[700] text-[var(--color-ink-muted)] transition-opacity duration-500",
          copyFeedback?.visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {copyFeedback?.message ?? ""}
      </div>
    </div>
  );
}
