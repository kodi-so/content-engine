import { useUser } from "@clerk/clerk-react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BriefcaseBusiness,
  Check,
  Copy,
  KeyRound,
  Plus,
  Shield,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Field, Page, Panel, Select } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";

const DEFAULT_MCP_KEY_NAME = "Codex";

type SettingsTab = "workspace" | "team" | "admin" | "account" | "mcp";
type WorkspaceRole = "admin" | "member" | "viewer";

const settingsTabs: Array<{
  id: SettingsTab;
  label: string;
  icon: typeof BriefcaseBusiness;
}> = [
  { id: "workspace", label: "Workspace", icon: BriefcaseBusiness },
  { id: "team", label: "Team", icon: UsersRound },
  { id: "admin", label: "Admin", icon: Shield },
  { id: "account", label: "Account", icon: Check },
  { id: "mcp", label: "MCP Access", icon: KeyRound },
];

const settingsStackClass = "grid min-w-0 gap-[var(--space-4)]";
const settingsInfoCardClass =
  "grid gap-[var(--space-1)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-[var(--space-4)]";
const settingsEyebrowClass =
  "text-[0.74rem] font-[750] uppercase leading-[1.15] tracking-[0.06em] text-[var(--color-ink-muted)]";
const settingsBodyClass = "m-0 text-[0.9rem] leading-[1.5] text-[var(--color-ink-muted)]";

function workspaceKindLabel(workspaceType?: "personal" | "team") {
  return workspaceType === "team" ? "Team workspace" : "Personal workspace";
}

function roleLabel(role?: string) {
  if (!role) return "Member";
  return role[0].toUpperCase() + role.slice(1);
}

function settingsTabClass(isActive: boolean) {
  return [
    "grid min-h-[2.45rem] cursor-pointer grid-cols-[1.1rem_minmax(0,1fr)] items-center gap-[var(--space-2)]",
    "rounded-[var(--radius-md)] border-0 bg-transparent px-[var(--space-3)] text-left text-[0.88rem]",
    "font-[650] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-tinted)] hover:text-[var(--color-ink)]",
    isActive
      ? "bg-[var(--color-surface-tinted)] text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-border)]"
      : "",
  ].filter(Boolean).join(" ");
}

export function SettingsPage() {
  const { user } = useUser();
  const {
    activeMembership,
    activeWorkspace,
    activeWorkspaceId,
    isWorkspaceAdmin,
    setActiveWorkspaceId,
    workspaces,
  } = useWorkspace();
  const members = useQuery(
    api.workspaces.workspaces.listMembers,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip"
  );
  const apiKeys = useQuery(api.mcp.apiKeys.list);
  const createTeam = useMutation(api.workspaces.workspaces.createTeam);
  const updateWorkspace = useMutation(api.workspaces.workspaces.update);
  const addMemberByEmail = useMutation(api.workspaces.workspaces.upsertMemberByEmail);
  const setMemberRole = useMutation(api.workspaces.workspaces.setMemberRole);
  const removeMember = useMutation(api.workspaces.workspaces.removeMember);
  const createMcpKey = useAction(api.mcp.apiKeys.create);
  const revokeMcpKey = useMutation(api.mcp.apiKeys.revoke);
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");
  const [workspaceName, setWorkspaceName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("member");
  const [keyName, setKeyName] = useState(DEFAULT_MCP_KEY_NAME);
  const [generatedKey, setGeneratedKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const mcpEndpoint = useMemo(() => {
    const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
    return siteUrl ? `${siteUrl.replace(/\/$/, "")}/mcp` : "/mcp";
  }, []);

  const sortedWorkspaces = useMemo(
    () =>
      [...(workspaces ?? [])].sort((first, second) => {
        if (first.workspace.workspaceType !== second.workspace.workspaceType) {
          return first.workspace.workspaceType === "personal" ? -1 : 1;
        }
        return first.workspace.name.localeCompare(second.workspace.name);
      }),
    [workspaces]
  );

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setStatusMessage("Copied");
  };

  const saveWorkspaceName = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    const name = workspaceName.trim();
    if (!name) return;

    setStatusMessage("Saving workspace");
    try {
      await updateWorkspace({ id: activeWorkspaceId, name });
      setWorkspaceName("");
      setStatusMessage("Workspace updated");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Workspace update failed");
    }
  };

  const createTeamWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    const name = teamName.trim();
    if (!name) return;

    setStatusMessage("Creating team workspace");
    try {
      const workspaceId = await createTeam({ name });
      setActiveWorkspaceId(workspaceId);
      setTeamName("");
      setStatusMessage("Team workspace created");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Team creation failed");
    }
  };

  const inviteMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeWorkspaceId || !inviteEmail.trim()) return;

    setStatusMessage("Adding member");
    try {
      await addMemberByEmail({
        workspaceId: activeWorkspaceId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail("");
      setInviteRole("member");
      setStatusMessage("Member added");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Member add failed");
    }
  };

  const changeMemberRole = async (userId: string, role: string) => {
    if (!activeWorkspaceId) return;
    setStatusMessage("Updating member role");
    try {
      await setMemberRole({
        workspaceId: activeWorkspaceId,
        userId,
        role: role as WorkspaceRole,
      });
      setStatusMessage("Member role updated");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Role update failed");
    }
  };

  const removeWorkspaceMember = async (userId: string, name: string) => {
    if (!activeWorkspaceId) return;
    if (!window.confirm(`Remove ${name} from this workspace?`)) return;

    setStatusMessage("Removing member");
    try {
      await removeMember({ workspaceId: activeWorkspaceId, userId });
      setStatusMessage("Member removed");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Member removal failed");
    }
  };

  const handleCreateKey = async () => {
    if (!keyName.trim()) return;

    setStatusMessage("Creating MCP key");
    const result = await createMcpKey({ name: keyName.trim() });
    setGeneratedKey(result.key);
    setKeyName(DEFAULT_MCP_KEY_NAME);
    setStatusMessage("MCP key created");
  };

  return (
    <Page
      title="Settings"
      description="Manage workspace context, team access, account details, and external agent keys."
    >
      <div className="grid items-start gap-[var(--space-5)] lg:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]">
        <aside
          className="grid gap-[var(--space-1)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-2)] shadow-[var(--shadow-sm)] max-[900px]:grid-cols-2 lg:sticky lg:top-[var(--space-4)] max-[560px]:grid-cols-1"
          aria-label="Settings sections"
        >
          {settingsTabs.map((tab) => (
            <button
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={settingsTabClass(activeTab === tab.id)}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </aside>

        <div className={settingsStackClass}>
          <section className="grid gap-[var(--space-3)] md:grid-cols-3">
            <div className={settingsInfoCardClass}>
              <span className={settingsEyebrowClass}>
                {workspaceKindLabel(activeWorkspace?.workspaceType)}
              </span>
              <strong className="min-w-0 [overflow-wrap:anywhere] text-[1rem] font-[720] capitalize leading-[1.25] text-[var(--color-ink)]">
                {activeWorkspace?.name ?? "Loading workspace"}
              </strong>
            </div>
            <div className={settingsInfoCardClass}>
              <span className={settingsEyebrowClass}>Your role</span>
              <strong className="min-w-0 [overflow-wrap:anywhere] text-[1rem] font-[720] capitalize leading-[1.25] text-[var(--color-ink)]">
                {roleLabel(activeMembership?.role)}
              </strong>
            </div>
            <div className={settingsInfoCardClass}>
              <span className={settingsEyebrowClass}>Members</span>
              <strong className="min-w-0 [overflow-wrap:anywhere] text-[1rem] font-[720] capitalize leading-[1.25] text-[var(--color-ink)]">
                {members?.filter((row) => row.membership.status === "active").length ?? 0}
              </strong>
            </div>
          </section>

          {statusMessage ? (
            <p className="m-0 w-fit max-w-full rounded-full border border-[var(--color-border)] bg-[var(--color-primary-soft)] px-[var(--space-3)] py-[var(--space-2)] text-[0.82rem] font-[650] text-[var(--color-primary-strong)]">
              {statusMessage}
            </p>
          ) : null}

          {activeTab === "workspace" ? (
            <div className={settingsStackClass}>
              <Panel title="Current Workspace">
                <div className="grid items-start gap-[var(--space-4)] md:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
                  <Select
                    label="Active workspace"
                    value={activeWorkspaceId ?? ""}
                    onChange={(value) => setActiveWorkspaceId(value as Id<"workspaces">)}
                  >
                    {sortedWorkspaces.map(({ membership, workspace }) => (
                      <option key={workspace._id} value={workspace._id}>
                        {workspace.name} · {workspace.workspaceType} · {membership.role}
                      </option>
                    ))}
                  </Select>
                  <div className={settingsInfoCardClass}>
                    <span className={settingsEyebrowClass}>Workspace boundary</span>
                    <p className={settingsBodyClass}>
                      Brands, workflows, generated assets, publishing plans, and metrics are scoped
                      to the selected workspace.
                    </p>
                  </div>
                </div>
              </Panel>

              <form className="panel form-grid" onSubmit={saveWorkspaceName}>
                <h2>Workspace Settings</h2>
                <Field
                  label="Workspace name"
                  value={workspaceName}
                  onChange={setWorkspaceName}
                  placeholder={activeWorkspace?.name ?? "Workspace name"}
                />
                <button className="primary-button" disabled={!isWorkspaceAdmin} type="submit">
                  Save workspace
                </button>
                {!isWorkspaceAdmin ? (
                  <p className="muted">Only owners and admins can change workspace settings.</p>
                ) : null}
              </form>

              <form className="panel form-grid" onSubmit={createTeamWorkspace}>
                <h2>Create Team Workspace</h2>
                <Field
                  label="Team name"
                  value={teamName}
                  onChange={setTeamName}
                  placeholder="Acme Growth Team"
                />
                <button className="secondary-button" type="submit">
                  <Plus size={16} />
                  Create team
                </button>
              </form>
            </div>
          ) : null}

          {activeTab === "team" ? (
            <div className={settingsStackClass}>
              <form className="panel form-grid" onSubmit={inviteMember}>
                <h2>Team Members</h2>
                <Field
                  label="Member email"
                  value={inviteEmail}
                  onChange={setInviteEmail}
                  placeholder="teammate@example.com"
                />
                <Select
                  label="Role"
                  value={inviteRole}
                  onChange={(value) => setInviteRole(value as WorkspaceRole)}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </Select>
                <button
                  className="primary-button"
                  disabled={!isWorkspaceAdmin || activeWorkspace?.workspaceType !== "team"}
                  type="submit"
                >
                  <UserPlus size={16} />
                  Add member
                </button>
                {activeWorkspace?.workspaceType !== "team" ? (
                  <p className="muted">Create or switch to a team workspace before adding members.</p>
                ) : null}
                {!isWorkspaceAdmin ? (
                  <p className="muted">Only owners and admins can manage team members.</p>
                ) : null}
              </form>

              <Panel title="Member Directory">
                <div className="entity-list compact-list">
                  {!members ? <p className="muted">Loading members...</p> : null}
                  {members?.map(({ membership, user: memberUser }) => {
                    const memberName = memberUser?.name || memberUser?.email || membership.userId;
                    const isOwner = membership.role === "owner";
                    const isSelf = membership.userId === user?.id;
                    return (
                      <article
                        className="entity-row grid-cols-[minmax(0,1fr)_minmax(13rem,auto)] max-[560px]:grid-cols-1"
                        key={membership._id}
                      >
                        <div>
                          <strong>{memberName}</strong>
                          <p>
                            {memberUser?.email ?? membership.userId} · {membership.status}
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-[var(--space-2)] max-[560px]:grid max-[560px]:justify-stretch">
                          <select
                            aria-label={`Role for ${memberName}`}
                            className="min-h-[2.15rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-2)] text-[0.82rem] text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!isWorkspaceAdmin || isOwner}
                            value={membership.role}
                            onChange={(event) =>
                              void changeMemberRole(membership.userId, event.target.value)
                            }
                          >
                            {isOwner ? <option value="owner">Owner</option> : null}
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            aria-label={`Remove ${memberName}`}
                            className="icon-button danger disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!isWorkspaceAdmin || isOwner || isSelf}
                            onClick={() => void removeWorkspaceMember(membership.userId, memberName)}
                            type="button"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </Panel>
            </div>
          ) : null}

          {activeTab === "admin" ? (
            <div className={settingsStackClass}>
              <Panel title="Admin">
                <div className="grid gap-[var(--space-3)]">
                  <div className={settingsInfoCardClass}>
                    <strong>Clerk Organizations</strong>
                    <p className={settingsBodyClass}>
                      Convex workspaces are the source of truth. Clerk Organizations can be linked
                      later through the workspace's Clerk organization id when we want hosted invites
                      or org switching.
                    </p>
                  </div>
                  <div className={settingsInfoCardClass}>
                    <strong>Access model</strong>
                    <p className={settingsBodyClass}>
                      New records are written to the active workspace. Older personal records still
                      open for their original owner until we run a backfill.
                    </p>
                  </div>
                  <div className={settingsInfoCardClass}>
                    <strong>Roles</strong>
                    <p className={settingsBodyClass}>
                      Owners and admins manage workspace settings. Members can create and operate.
                      Viewers are intended for read-only review surfaces.
                    </p>
                  </div>
                </div>
              </Panel>
            </div>
          ) : null}

          {activeTab === "account" ? (
            <div className={settingsStackClass}>
              <Panel title="User Settings">
                <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-[var(--space-4)]">
                  <div className="avatar h-[3rem] w-[3rem]">
                    {user?.imageUrl ? (
                      <img src={user.imageUrl} alt={user.fullName || "User"} />
                    ) : (
                      <span>{user?.fullName?.[0] || "U"}</span>
                    )}
                  </div>
                  <div>
                    <strong>{user?.fullName || "User"}</strong>
                    <p className={settingsBodyClass}>{user?.primaryEmailAddress?.emailAddress}</p>
                    <p className="muted">Profile details are managed by Clerk at sign-in.</p>
                  </div>
                </div>
              </Panel>
            </div>
          ) : null}

          {activeTab === "mcp" ? (
            <div className={settingsStackClass}>
              <Panel title="MCP Access" className="w-[min(100%,62rem)]">
                <div className="grid items-end gap-[var(--space-3)] lg:grid-cols-[minmax(20rem,1fr)_minmax(12rem,16rem)_auto]">
                  <label className="field col-span-full">
                    <span>MCP endpoint</span>
                    <div className="inline-field">
                      <input readOnly value={mcpEndpoint} />
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => void handleCopy(mcpEndpoint)}
                        title="Copy endpoint"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </label>
                  <Field
                    label="Key name"
                    value={keyName}
                    onChange={setKeyName}
                    placeholder="Codex"
                  />
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void handleCreateKey()}
                  >
                    <KeyRound size={16} />
                    Create MCP key
                  </button>
                  {generatedKey ? (
                    <label className="field col-span-full">
                      <span>New key</span>
                      <div className="inline-field">
                        <input readOnly value={generatedKey} />
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => void handleCopy(generatedKey)}
                          title="Copy key"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </label>
                  ) : null}
                </div>
                <div className="entity-list compact-list">
                  {!apiKeys ? <p className="muted">Loading MCP keys...</p> : null}
                  {apiKeys?.length === 0 ? <p className="muted">No MCP keys yet.</p> : null}
                  {apiKeys?.map((key) => (
                    <article className="entity-row" key={key.id}>
                      <div>
                        <strong>{key.name}</strong>
                        <p>{key.keyPrefix} · {key.revokedAt ? "Revoked" : "Active"}</p>
                      </div>
                      {!key.revokedAt ? (
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => void revokeMcpKey({ id: key.id as Id<"mcpApiKeys"> })}
                          title="Revoke key"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              </Panel>
            </div>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
