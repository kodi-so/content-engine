import { useClerk, useUser } from "@clerk/clerk-react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BriefcaseBusiness,
  Copy,
  KeyRound,
  Mail,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CustomSelect } from "../components/CustomSelect";
import { Page } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";

const DEFAULT_MCP_KEY_NAME = "Codex";

type SettingsTab = "profile" | "general" | "members" | "access";
type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
type InviteRole = Exclude<WorkspaceRole, "owner">;

const settingsTabs: Array<{
  id: SettingsTab;
  label: string;
  icon: typeof BriefcaseBusiness;
}> = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "general", label: "General", icon: BriefcaseBusiness },
  { id: "members", label: "Members", icon: UsersRound },
  { id: "access", label: "Agent access", icon: KeyRound },
];

const inviteRoleOptions: Array<{ value: InviteRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

const memberRoleOptions: Array<{ value: WorkspaceRole; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

const inputClass =
  "min-h-[2.85rem] w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] text-[0.95rem] font-[520] text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_oklch(57%_0.14_166_/_0.13)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)]";

function formatDate(timestamp?: number) {
  if (!timestamp) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function SettingsTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof BriefcaseBusiness;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "inline-flex min-h-[2.65rem] items-center gap-[var(--space-2)] border-b-2 px-[var(--space-2)] text-[0.9rem] font-[720] transition",
        active
          ? "border-[var(--color-ink)] text-[var(--color-ink)]"
          : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]",
      ].join(" ")}
      type="button"
      onClick={onClick}
    >
      <Icon size={16} strokeWidth={1.9} />
      {label}
    </button>
  );
}

function SettingRow({
  children,
  label,
  note,
}: {
  children: React.ReactNode;
  label: string;
  note: string;
}) {
  return (
    <div className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] py-[var(--space-4)] md:grid-cols-[13.5rem_minmax(0,1fr)] md:items-start">
      <div>
        <div className="text-[0.86rem] font-[780] leading-[1.25] text-[var(--color-ink)]">{label}</div>
        <p className="mt-[0.3rem] text-[0.8rem] leading-[1.45] text-[var(--color-muted)]">{note}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { openUserProfile } = useClerk();
  const { user } = useUser();
  const {
    activeMembership,
    activeWorkspace,
    activeWorkspaceId,
    isWorkspaceAdmin,
  } = useWorkspace();
  const members = useQuery(
    api.workspaces.workspaces.listMembers,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip"
  );
  const apiKeys = useQuery(api.mcp.apiKeys.list);
  const updateWorkspace = useMutation(api.workspaces.workspaces.update);
  const addMemberByEmail = useMutation(api.workspaces.workspaces.upsertMemberByEmail);
  const setMemberRole = useMutation(api.workspaces.workspaces.setMemberRole);
  const removeMember = useMutation(api.workspaces.workspaces.removeMember);
  const createMcpKey = useAction(api.mcp.apiKeys.create);
  const revokeMcpKey = useMutation(api.mcp.apiKeys.revoke);

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");
  const [keyName, setKeyName] = useState(DEFAULT_MCP_KEY_NAME);
  const [generatedKey, setGeneratedKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const mcpEndpoint = useMemo(() => {
    const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
    return siteUrl ? `${siteUrl.replace(/\/$/, "")}/mcp` : "/mcp";
  }, []);

  const memberRows = members ?? [];
  const memberCountLabel =
    members === undefined
      ? "Loading members"
      : `${memberRows.length} member${memberRows.length === 1 ? "" : "s"}`;
  const currentWorkspaceName = activeWorkspace?.name ?? "Workspace";
  const canInviteMembers = isWorkspaceAdmin;
  const canTransferOwnership = activeMembership?.role === "owner";

  useEffect(() => {
    if (!statusMessage) return;

    const timeoutId = window.setTimeout(() => setStatusMessage(""), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setStatusMessage("Copied to clipboard.");
  };

  const saveWorkspaceName = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    const name = workspaceName.trim();
    if (!name) return;
    setStatusMessage("Saving workspace...");
    try {
      await updateWorkspace({ id: activeWorkspaceId, name });
      setWorkspaceName("");
      setStatusMessage("Workspace name updated.");
    } catch (error) {
      setStatusMessage(errorMessage(error, "Workspace update failed."));
    }
  };

  const inviteMember = async (event: FormEvent) => {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!activeWorkspaceId || !email || !canInviteMembers) return;
    setStatusMessage("Updating member access...");
    try {
      await addMemberByEmail({
        workspaceId: activeWorkspaceId,
        email,
        role: inviteRole,
      });
      setInviteEmail("");
      setInviteRole("member");
      setStatusMessage("Member access updated.");
    } catch (error) {
      setStatusMessage(errorMessage(error, "Member update failed."));
    }
  };

  const changeMemberRole = async (userId: string, role: string, name: string) => {
    if (!activeWorkspaceId) return;
    if (
      role === "owner" &&
      !window.confirm(`Transfer ownership of this workspace to ${name}? You will become an admin.`)
    ) {
      return;
    }
    setStatusMessage("Updating member role...");
    try {
      await setMemberRole({
        workspaceId: activeWorkspaceId,
        userId,
        role: role as WorkspaceRole,
      });
      setStatusMessage("Member role updated.");
    } catch (error) {
      setStatusMessage(errorMessage(error, "Role update failed."));
    }
  };

  const removeWorkspaceMember = async (userId: string, name: string) => {
    if (!activeWorkspaceId) return;
    if (!window.confirm(`Remove ${name} from this workspace?`)) return;
    setStatusMessage("Removing member...");
    try {
      await removeMember({ workspaceId: activeWorkspaceId, userId });
      setStatusMessage("Member removed.");
    } catch (error) {
      setStatusMessage(errorMessage(error, "Member removal failed."));
    }
  };

  const handleCreateKey = async (event: FormEvent) => {
    event.preventDefault();
    const name = keyName.trim();
    if (!name) return;
    setStatusMessage("Creating agent key...");
    try {
      const result = await createMcpKey({ name });
      setGeneratedKey(result.key);
      setKeyName(DEFAULT_MCP_KEY_NAME);
      setStatusMessage("Agent key created. Copy it now, because it will not be shown again.");
    } catch (error) {
      setStatusMessage(errorMessage(error, "Agent key creation failed."));
    }
  };

  return (
    <Page
      title="Settings"
      description="Manage your profile and workspace configuration."
    >
      <div className="max-w-[56rem]">
        <div className="mb-[var(--space-6)]">
          <div className="flex flex-wrap gap-[var(--space-4)] border-b border-[var(--color-border)]">
            {settingsTabs.map((tab) => (
              <SettingsTabButton
                active={activeTab === tab.id}
                icon={tab.icon}
                key={tab.id}
                label={tab.label}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>

          {statusMessage ? (
            <p className="mt-[var(--space-4)] text-[0.84rem] font-[680] text-[var(--color-accent-strong)]">
              {statusMessage}
            </p>
          ) : null}
        </div>

        {activeTab === "profile" ? (
          <section>
            <header className="mb-[var(--space-2)]">
              <h2 className="text-[1.3rem] font-[820] leading-[1.2] text-[var(--color-ink)]">
                Profile
              </h2>
              <p className="mt-[0.35rem] max-w-[42rem] text-[0.92rem] leading-[1.55] text-[var(--color-muted)]">
                Manage your personal profile.
              </p>
            </header>

            <div className="border-t border-[var(--color-border)] py-[var(--space-4)]">
              <div className="flex max-w-[35rem] flex-wrap items-center gap-[var(--space-3)]">
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[oklch(92%_0.07_145)] text-[1rem] font-[820] uppercase text-[oklch(18%_0.04_210)]">
                  {user?.imageUrl ? (
                    <img
                      alt={user.fullName ?? "User"}
                      className="size-full object-cover"
                      src={user.imageUrl}
                    />
                  ) : (
                    <span>{user?.fullName?.[0] ?? "U"}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[1rem] font-[780] text-[var(--color-ink)]">
                    {user?.fullName ?? "User"}
                  </div>
                  <div className="mt-[0.2rem] inline-flex max-w-full items-center gap-[var(--space-1)] text-[0.84rem] text-[var(--color-muted)]">
                    <Mail size={14} />
                    <span className="truncate">
                      {user?.primaryEmailAddress?.emailAddress ?? "No email"}
                    </span>
                  </div>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => openUserProfile()}
                >
                  <UserRound size={16} />
                  Edit profile
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "general" ? (
          <section>
            <header className="mb-[var(--space-2)]">
              <h2 className="text-[1.3rem] font-[820] leading-[1.2] text-[var(--color-ink)]">
                General
              </h2>
              <p className="mt-[0.35rem] max-w-[42rem] text-[0.92rem] leading-[1.55] text-[var(--color-muted)]">
                Workspace settings for {currentWorkspaceName}.
              </p>
            </header>

            <SettingRow
              label="Workspace name"
              note="Use a short name people can recognize quickly."
            >
              <form
                className="grid max-w-[35rem] gap-[var(--space-3)] sm:grid-cols-[minmax(0,22rem)_11rem]"
                onSubmit={saveWorkspaceName}
              >
                <input
                  className={inputClass}
                  disabled={!isWorkspaceAdmin}
                  placeholder={activeWorkspace?.name ?? "Workspace name"}
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
                <button className="primary-button" disabled={!isWorkspaceAdmin} type="submit">
                  Save
                </button>
              </form>
            </SettingRow>
          </section>
        ) : null}

        {activeTab === "members" ? (
          <section>
            <header className="mb-[var(--space-2)]">
              <h2 className="text-[1.3rem] font-[820] leading-[1.2] text-[var(--color-ink)]">
                Members
              </h2>
              <p className="mt-[0.35rem] max-w-[42rem] text-[0.92rem] leading-[1.55] text-[var(--color-muted)]">
                {memberCountLabel} in {currentWorkspaceName}.
              </p>
            </header>

            <SettingRow
              label="Invite member"
              note="Add someone who has already signed in once."
            >
              <form
                className="grid max-w-[44rem] gap-[var(--space-3)] lg:grid-cols-[minmax(0,1fr)_10rem_11rem]"
                onSubmit={inviteMember}
              >
                <input
                  className={inputClass}
                  disabled={!canInviteMembers}
                  placeholder="teammate@company.com"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
                <CustomSelect
                  disabled={!canInviteMembers}
                  onChange={(nextRole) => setInviteRole(nextRole as InviteRole)}
                  options={inviteRoleOptions}
                  placeholder="Role"
                  triggerClassName="min-h-[2.85rem] bg-[var(--color-surface)] text-[0.95rem] font-[520]"
                  value={inviteRole}
                />
                <button className="primary-button" disabled={!canInviteMembers} type="submit">
                  <UserPlus size={16} />
                  Invite
                </button>
              </form>
            </SettingRow>

            <SettingRow label="Members" note="Roles apply only inside this workspace.">
              <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                <div className="grid grid-cols-[minmax(0,1fr)_9rem_2.75rem] gap-[var(--space-3)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)] text-[0.72rem] font-[780] uppercase tracking-[0.06em] text-[var(--color-muted)] max-md:hidden">
                  <span>Person</span>
                  <span>Role</span>
                  <span />
                </div>

                {members === undefined ? (
                  <div className="px-[var(--space-3)] py-[var(--space-4)] text-[0.9rem] text-[var(--color-muted)]">
                    Loading members...
                  </div>
                ) : memberRows.length === 0 ? (
                  <div className="px-[var(--space-3)] py-[var(--space-4)] text-[0.9rem] text-[var(--color-muted)]">
                    No members yet.
                  </div>
                ) : (
                  memberRows.map((row) => {
                    const { membership } = row;
                    const displayName = row.user?.name ?? row.user?.email ?? membership.userId;
                    const isSelf = membership.userId === user?.id;
                    const isOwner = membership.role === "owner";
                    const canEditRole = isWorkspaceAdmin && !isSelf && !isOwner;
                    const canRemoveMember = isWorkspaceAdmin && !isSelf && !isOwner;

                    return (
                      <div
                        className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-3)] first:border-t-0 md:grid-cols-[minmax(0,1fr)_9rem_2.75rem] md:items-center"
                        key={membership._id}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[0.94rem] font-[720] text-[var(--color-ink)]">
                            {displayName}
                          </div>
                          <div className="truncate text-[0.8rem] text-[var(--color-muted)]">
                            {row.user?.email ?? membership.userId}
                          </div>
                        </div>
                        {canEditRole ? (
                          <CustomSelect
                            onChange={(nextRole) =>
                              changeMemberRole(
                                membership.userId,
                                nextRole,
                                displayName
                              )
                            }
                            options={
                              canTransferOwnership
                                ? memberRoleOptions
                                : memberRoleOptions.filter((option) => option.value !== "owner")
                            }
                            placeholder="Role"
                            triggerClassName="min-h-[2.4rem] bg-[var(--color-surface)] px-[var(--space-2)] py-[0.35rem] text-[0.84rem] font-[620]"
                            value={membership.role}
                          />
                        ) : (
                          <span className="inline-flex min-h-[2.4rem] items-center text-[0.84rem] font-[720] capitalize text-[var(--color-ink)]">
                            {membership.role}
                          </span>
                        )}
                        {canRemoveMember ? (
                          <button
                            aria-label={`Remove ${displayName}`}
                            className="icon-button justify-self-start md:justify-self-end"
                            type="button"
                            onClick={() => removeWorkspaceMember(membership.userId, displayName)}
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </SettingRow>
          </section>
        ) : null}

        {activeTab === "access" ? (
          <section>
            <header className="mb-[var(--space-2)]">
              <h2 className="text-[1.3rem] font-[820] leading-[1.2] text-[var(--color-ink)]">
                Agent access
              </h2>
              <p className="mt-[0.35rem] max-w-[42rem] text-[0.92rem] leading-[1.55] text-[var(--color-muted)]">
                Connect external agents and revoke keys you no longer use.
              </p>
            </header>

            <SettingRow label="Endpoint" note="Use this URL when configuring an MCP client.">
              <div className="grid max-w-[44rem] gap-[var(--space-3)] sm:grid-cols-[minmax(0,1fr)_2.85rem]">
                <input className={inputClass} readOnly value={mcpEndpoint} />
                <button
                  aria-label="Copy MCP endpoint"
                  className="icon-button min-h-[2.85rem]"
                  type="button"
                  onClick={() => handleCopy(mcpEndpoint)}
                >
                  <Copy size={16} />
                </button>
              </div>
            </SettingRow>

            <SettingRow
              label="Create key"
              note="New keys are shown once. Store the key before leaving this page."
            >
              <form
                className="grid max-w-[35rem] gap-[var(--space-3)] sm:grid-cols-[minmax(0,22rem)_11rem]"
                onSubmit={handleCreateKey}
              >
                <input
                  className={inputClass}
                  placeholder={DEFAULT_MCP_KEY_NAME}
                  value={keyName}
                  onChange={(event) => setKeyName(event.target.value)}
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
                      onClick={() => handleCopy(generatedKey)}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              ) : null}
            </SettingRow>

            <SettingRow label="Keys" note="Revoke keys you no longer use.">
              <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                {apiKeys === undefined ? (
                  <div className="px-[var(--space-3)] py-[var(--space-4)] text-[0.9rem] text-[var(--color-muted)]">
                    Loading keys...
                  </div>
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
                          {key.keyPrefix} / Created {formatDate(key.createdAt)}
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
                        onClick={() => revokeMcpKey({ id: key.id as Id<"mcpApiKeys"> })}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </SettingRow>
          </section>
        ) : null}
      </div>
    </Page>
  );
}
