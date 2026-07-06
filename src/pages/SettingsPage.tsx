import { useClerk, useUser } from "@clerk/clerk-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { LoadingSignal, Page } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { AgentAccessSettingsSection } from "../features/settings/AgentAccessSettingsSection";
import { AiProvidersSettingsSection } from "../features/settings/AiProvidersSettingsSection";
import { GeneralSettingsSection } from "../features/settings/GeneralSettingsSection";
import { MembersSettingsSection } from "../features/settings/MembersSettingsSection";
import { ProfileSettingsSection } from "../features/settings/ProfileSettingsSection";
import {
  DEFAULT_MCP_KEY_NAME,
  SettingsTabButton,
  isWorkingStatus,
  settingsErrorMessage,
  settingsTabs,
  type AiGenerationMode,
  type InviteRole,
  type SettingsTab,
  type WorkspaceRole,
} from "../features/settings/settingsPrimitives";
import type {
  McpApiKeySummary,
  WorkspaceMemberRow,
} from "../features/settings/settingsTypes";
import {
  resolveAiGenerationSettings,
  type AiGenerationProvider,
} from "../lib/providers/aiGenerationDefaults";
import type { RosterModelMode } from "../lib/generation/modelRoster";
import {
  rosterModelById,
  rosterOptionsForModel,
} from "../lib/generation/modelRoster";

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
  const [imageProvider, setImageProvider] = useState<AiGenerationProvider>("fal");
  const [imageModel, setImageModel] = useState("");
  const [imageResolution, setImageResolution] = useState("2K");
  const [videoProvider, setVideoProvider] = useState<AiGenerationProvider>("fal");
  const [videoModel, setVideoModel] = useState("");
  const [audioProvider, setAudioProvider] = useState<AiGenerationProvider>("fal");
  const [audioModel, setAudioModel] = useState("");
  const [lipsyncProvider, setLipsyncProvider] = useState<AiGenerationProvider>("fal");
  const [lipsyncModel, setLipsyncModel] = useState("");
  const [videoAnalysisProvider, setVideoAnalysisProvider] = useState<AiGenerationProvider>("gemini");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");
  const [keyName, setKeyName] = useState(DEFAULT_MCP_KEY_NAME);
  const [generatedKey, setGeneratedKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const mcpEndpoint = useMemo(() => {
    const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
    return siteUrl ? `${siteUrl.replace(/\/$/, "")}/mcp` : "/mcp";
  }, []);

  const memberRows = (members ?? []) as WorkspaceMemberRow[];
  const apiKeyRows = apiKeys as McpApiKeySummary[] | undefined;
  const providersByMode: Record<AiGenerationMode, AiGenerationProvider> = {
    image: imageProvider,
    video: videoProvider,
    audio: audioProvider,
    lipsync: lipsyncProvider,
    videoAnalysis: videoAnalysisProvider,
  };
  const modelsByMode: Record<RosterModelMode, string> = {
    image: imageModel,
    video: videoModel,
    audio: audioModel,
    lipsync: lipsyncModel,
  };
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

  useEffect(() => {
    const settings = resolveAiGenerationSettings(activeWorkspace?.aiGenerationSettings);
    setImageProvider(settings.imageProvider);
    setImageModel(settings.imageModel);
    setImageResolution(settings.imageResolution);
    setVideoProvider(settings.videoProvider);
    setVideoModel(settings.videoModel);
    setAudioProvider(settings.audioProvider);
    setAudioModel(settings.audioModel);
    setLipsyncProvider(settings.lipsyncProvider);
    setLipsyncModel(settings.lipsyncModel);
    setVideoAnalysisProvider(settings.videoAnalysisProvider);
  }, [activeWorkspace?._id, activeWorkspace?.aiGenerationSettings]);

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
      setStatusMessage(settingsErrorMessage(error, "Workspace update failed."));
    }
  };

  const changeGenerationProvider = (
    mode: AiGenerationMode,
    provider: AiGenerationProvider
  ) => {
    if (mode === "image") {
      setImageProvider(provider);
      return;
    }
    if (mode === "video") {
      setVideoProvider(provider);
      return;
    }
    if (mode === "audio") {
      setAudioProvider(provider);
      return;
    }
    if (mode === "videoAnalysis") {
      setVideoAnalysisProvider(provider);
      return;
    }

    setLipsyncProvider(provider);
  };

  const changeGenerationModel = (mode: RosterModelMode, modelId: string) => {
    if (mode === "image") {
      setImageModel(modelId);
      const resolutionOption = rosterModelById(modelId)
        ? rosterOptionsForModel(rosterModelById(modelId)!).resolution
        : undefined;
      if (
        resolutionOption?.kind === "enum" &&
        !resolutionOption.values.some((value) => value === imageResolution)
      ) {
        setImageResolution(resolutionOption.default);
      }
      return;
    }
    if (mode === "video") {
      setVideoModel(modelId);
      return;
    }
    if (mode === "audio") {
      setAudioModel(modelId);
      return;
    }

    setLipsyncModel(modelId);
  };

  const saveAiGenerationSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeWorkspaceId || !isWorkspaceAdmin) return;

    setStatusMessage("Saving AI providers...");
    try {
      await updateWorkspace({
        id: activeWorkspaceId,
        aiGenerationSettings: {
          imageProvider,
          imageModel,
          imageResolution,
          videoProvider,
          videoModel,
          audioProvider,
          audioModel,
          lipsyncProvider,
          lipsyncModel,
          videoAnalysisProvider,
        },
      });
      setStatusMessage("AI providers updated.");
    } catch (error) {
      setStatusMessage(settingsErrorMessage(error, "AI provider update failed."));
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
      setStatusMessage(settingsErrorMessage(error, "Member update failed."));
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
      setStatusMessage(settingsErrorMessage(error, "Role update failed."));
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
      setStatusMessage(settingsErrorMessage(error, "Member removal failed."));
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
      setStatusMessage(settingsErrorMessage(error, "Agent key creation failed."));
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
            <p className="mt-[var(--space-4)] inline-flex items-center gap-[var(--space-2)] text-[0.84rem] font-[680] text-[var(--color-accent-strong)]">
              {isWorkingStatus(statusMessage) ? (
                <LoadingSignal label={statusMessage} size="sm" />
              ) : null}
              {statusMessage}
            </p>
          ) : null}
        </div>

        {activeTab === "profile" ? (
          <ProfileSettingsSection
            user={user}
            onEditProfile={() => openUserProfile()}
          />
        ) : null}

        {activeTab === "general" ? (
          <GeneralSettingsSection
            currentWorkspaceName={currentWorkspaceName}
            isWorkspaceAdmin={isWorkspaceAdmin}
            workspace={activeWorkspace}
            workspaceName={workspaceName}
            onSaveWorkspaceName={saveWorkspaceName}
            onWorkspaceNameChange={setWorkspaceName}
          />
        ) : null}

        {activeTab === "ai" ? (
          <AiProvidersSettingsSection
                currentWorkspaceName={currentWorkspaceName}
                isWorkspaceAdmin={isWorkspaceAdmin}
                modelsByMode={modelsByMode}
                providersByMode={providersByMode}
                onChangeProvider={changeGenerationProvider}
                onChangeModel={changeGenerationModel}
                imageResolution={imageResolution}
                onChangeImageResolution={setImageResolution}
                onSave={saveAiGenerationSettings}
              />
        ) : null}

        {activeTab === "members" ? (
          <MembersSettingsSection
            canInviteMembers={canInviteMembers}
            canTransferOwnership={canTransferOwnership}
            currentUserId={user?.id}
            currentWorkspaceName={currentWorkspaceName}
            inviteEmail={inviteEmail}
            inviteRole={inviteRole}
            isWorkspaceAdmin={isWorkspaceAdmin}
            memberCountLabel={memberCountLabel}
            memberRows={memberRows}
            membersLoaded={members !== undefined}
            onChangeInviteEmail={setInviteEmail}
            onChangeInviteRole={setInviteRole}
            onChangeMemberRole={changeMemberRole}
            onInviteMember={inviteMember}
            onRemoveMember={removeWorkspaceMember}
          />
        ) : null}

        {activeTab === "access" ? (
          <AgentAccessSettingsSection
            apiKeys={apiKeyRows}
            generatedKey={generatedKey}
            keyName={keyName}
            mcpEndpoint={mcpEndpoint}
            onChangeKeyName={setKeyName}
            onCopy={(value) => void handleCopy(value)}
            onCreateKey={handleCreateKey}
            onRevokeKey={(id) => void revokeMcpKey({ id })}
          />
        ) : null}
      </div>
    </Page>
  );
}
