import { ChevronDown, Copy, FileText, KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import contentEngineAgentSkill from "../../../skills/content-engine-agent/SKILL.md?raw";
import { LoadingState } from "../../components/ui";
import {
  DEFAULT_MCP_KEY_NAME,
  SettingRow,
  formatSettingsDate,
  settingsInputClass,
} from "./settingsPrimitives";
import type { McpApiKeySummary, McpOauthConnectionSummary } from "./settingsTypes";

const agentSkillLineCount = contentEngineAgentSkill.split("\n").length;

export function AgentAccessSettingsSection({
  apiKeys,
  generatedKey,
  keyName,
  mcpEndpoint,
  oauthConnections,
  onChangeKeyName,
  onCopy,
  onCreateKey,
  onRevokeKey,
  onRevokeOauthConnection,
}: {
  apiKeys: McpApiKeySummary[] | undefined;
  generatedKey: string;
  keyName: string;
  mcpEndpoint: string;
  oauthConnections: McpOauthConnectionSummary[] | undefined;
  onChangeKeyName: (value: string) => void;
  onCopy: (value: string) => void;
  onCreateKey: (event: FormEvent) => void;
  onRevokeKey: (id: Id<"mcpApiKeys">) => void;
  onRevokeOauthConnection: (id: Id<"mcpOauthTokens">) => void;
}) {
  const [isSkillOpen, setIsSkillOpen] = useState(false);

  return (
    <section>
      <header className="mb-[var(--space-2)]">
        <h2 className="text-[1.3rem] font-[820] leading-[1.2] text-[var(--color-ink)]">
          Agent connections
        </h2>
        <p className="mt-[0.35rem] max-w-[42rem] text-[0.92rem] leading-[1.55] text-[var(--color-muted)]">
          Use every Content Engine Agent command from Codex, Claude, ChatGPT, or another MCP client.
        </p>
      </header>

      <SettingRow
        label="Connect with OAuth"
        note="Add this Streamable HTTP URL to an OAuth-capable MCP client. Content Engine will open a secure workspace authorization screen."
      >
        <div className="grid max-w-[44rem] gap-[var(--space-3)] sm:grid-cols-[minmax(0,1fr)_2.85rem]">
          <input className={settingsInputClass} readOnly value={mcpEndpoint} />
          <button
            aria-label="Copy MCP endpoint"
            className="icon-button min-h-[2.85rem]"
            type="button"
            onClick={() => onCopy(mcpEndpoint)}
          >
            <Copy size={16} />
          </button>
        </div>
      </SettingRow>

      <SettingRow
        label="Agent skill"
        note="Give another agent the same workflow guidance for research, generation, durable runs, account management, and publishing safety."
      >
        <div className="max-w-[44rem] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-3)]">
            <div className="flex min-w-0 items-center gap-[var(--space-3)]">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] text-[var(--color-muted)]">
                <FileText size={17} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[0.92rem] font-[740] text-[var(--color-ink)]">
                  Content Engine Agent
                </div>
                <div className="mt-[0.15rem] text-[0.78rem] text-[var(--color-muted)]">
                  SKILL.md · {agentSkillLineCount} lines
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-[var(--space-2)]">
              <button
                className="secondary-button min-h-9 px-[var(--space-3)] py-[0.45rem] text-[0.8rem]"
                type="button"
                onClick={() => onCopy(contentEngineAgentSkill)}
              >
                <Copy size={14} />
                Copy skill
              </button>
              <button
                aria-controls="content-engine-agent-skill"
                aria-expanded={isSkillOpen}
                className="secondary-button min-h-9 px-[var(--space-3)] py-[0.45rem] text-[0.8rem]"
                type="button"
                onClick={() => setIsSkillOpen((open) => !open)}
              >
                {isSkillOpen ? "Hide" : "View"}
                <ChevronDown
                  className={`transition-transform ${isSkillOpen ? "rotate-180" : ""}`}
                  size={14}
                />
              </button>
            </div>
          </div>
          {isSkillOpen ? (
            <div className="border-t border-[var(--color-border)]" id="content-engine-agent-skill">
              <div className="flex items-center justify-between bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)] text-[0.74rem] font-[720] text-[var(--color-muted)]">
                <span>skills/content-engine-agent/SKILL.md</span>
                <span>Markdown</span>
              </div>
              <pre className="m-0 max-h-[30rem] overflow-auto whitespace-pre-wrap break-words px-[var(--space-3)] py-[var(--space-3)] text-[0.78rem] leading-[1.65] text-[var(--color-ink)]">
                <code>{contentEngineAgentSkill}</code>
              </pre>
            </div>
          ) : null}
        </div>
      </SettingRow>

      <SettingRow label="OAuth connections" note="Revoke agents that should no longer have workspace access.">
        <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
          {oauthConnections === undefined ? (
            <LoadingState
              className="border-0 bg-transparent"
              compact
              detail="Checking active OAuth connections."
              title="Loading connections"
            />
          ) : oauthConnections.length === 0 ? (
            <div className="px-[var(--space-3)] py-[var(--space-4)] text-[0.9rem] text-[var(--color-muted)]">
              No active OAuth connections.
            </div>
          ) : (
            oauthConnections.map((connection) => (
              <div
                className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-3)] first:border-t-0 md:grid-cols-[minmax(0,1fr)_8rem_2.75rem] md:items-center"
                key={connection.id}
              >
                <div className="min-w-0">
                  <div className="truncate text-[0.94rem] font-[720] text-[var(--color-ink)]">
                    {connection.clientName}
                  </div>
                  <div className="truncate text-[0.8rem] text-[var(--color-muted)]">
                    {connection.scopes.length} scopes / Connected {formatSettingsDate(connection.createdAt)}
                  </div>
                </div>
                <span className="text-[0.83rem] font-[650] text-[var(--color-muted)]">
                  {connection.lastUsedAt ? `Used ${formatSettingsDate(connection.lastUsedAt)}` : "Not used"}
                </span>
                <button
                  aria-label={`Revoke ${connection.clientName}`}
                  className="icon-button justify-self-start md:justify-self-end"
                  type="button"
                  onClick={() => onRevokeOauthConnection(connection.id as Id<"mcpOauthTokens">)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </SettingRow>

      <SettingRow
        label="Create API key"
        note="For direct clients such as local Codex. Keys are bound to the active workspace, include every Agent capability, and are shown once."
      >
        <form
          className="grid max-w-[35rem] gap-[var(--space-3)] sm:grid-cols-[minmax(0,22rem)_11rem]"
          onSubmit={onCreateKey}
        >
          <input
            className={settingsInputClass}
            placeholder={DEFAULT_MCP_KEY_NAME}
            value={keyName}
            onChange={(event) => onChangeKeyName(event.target.value)}
          />
          <button className="primary-button" type="submit">
            <KeyRound size={16} />
            Create
          </button>
        </form>
        {generatedKey ? (
          <div className="mt-[var(--space-3)] grid max-w-[44rem] gap-[var(--space-2)] rounded-[var(--radius-sm)] bg-[oklch(95%_0.025_185)] p-[var(--space-3)]">
            <div className="text-[0.78rem] font-[780] uppercase tracking-[0.06em] text-[var(--color-accent-strong)]">
              New key
            </div>
            <div className="grid gap-[var(--space-2)] sm:grid-cols-[minmax(0,1fr)_2.5rem]">
              <code className="min-w-0 overflow-x-auto whitespace-nowrap rounded-[var(--radius-sm)] bg-[oklch(100%_0_0_/_0.62)] px-[var(--space-2)] py-[var(--space-2)] text-[0.8rem] text-[var(--color-ink)]">
                {generatedKey}
              </code>
              <button
                aria-label="Copy generated key"
                className="icon-button"
                type="button"
                onClick={() => onCopy(generatedKey)}
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </SettingRow>

      <SettingRow
        label="Embedded results"
        note="Clients that support MCP Apps can display generated images, video, audio, run progress, and Content Engine deep links directly in the conversation."
      >
        <p className="max-w-[42rem] text-[0.9rem] leading-[1.6] text-[var(--color-ink)]">
          Long-running media commands return a durable run immediately. The agent can inspect it with
          {" "}<code className="text-[0.82rem]">command.status</code> or open the live media workspace with
          {" "}<code className="text-[0.82rem]">command.render</code>.
        </p>
      </SettingRow>

      <SettingRow label="Keys" note="Revoke keys you no longer use.">
        <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
          {apiKeys === undefined ? (
            <LoadingState
              className="border-0 bg-transparent"
              compact
              detail="Checking active agent access keys."
              title="Loading keys"
            />
          ) : apiKeys.length === 0 ? (
            <div className="px-[var(--space-3)] py-[var(--space-4)] text-[0.9rem] text-[var(--color-muted)]">
              No keys created yet.
            </div>
          ) : (
            apiKeys.map((key) => (
              <div
                className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-3)] first:border-t-0 md:grid-cols-[minmax(0,1fr)_8rem_2.75rem] md:items-center"
                key={key.id}
              >
                <div className="min-w-0">
                  <div className="truncate text-[0.94rem] font-[720] text-[var(--color-ink)]">
                    {key.name}
                  </div>
                  <div className="truncate text-[0.8rem] text-[var(--color-muted)]">
                    {key.keyPrefix} / {key.scopes.length} scopes / Created {formatSettingsDate(key.createdAt)}
                  </div>
                </div>
                <span className="text-[0.83rem] font-[650] text-[var(--color-muted)]">
                  {key.revokedAt ? "Revoked" : "Active"}
                </span>
                <button
                  aria-label={`Revoke ${key.name}`}
                  className="icon-button justify-self-start md:justify-self-end"
                  disabled={Boolean(key.revokedAt)}
                  type="button"
                  onClick={() => onRevokeKey(key.id as Id<"mcpApiKeys">)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </SettingRow>
    </section>
  );
}
