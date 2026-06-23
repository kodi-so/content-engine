import { useMutation, useQuery } from "convex/react";
import {
  Check,
  PanelLeft,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SelectableLibraryAsset } from "../../components/library/ReferenceAssetField";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { AgentCreateMessageList } from "./AgentCreateMessageList";
import { AgentCreatePrompt } from "./AgentCreatePrompt";
import { CheckpointPrompt } from "./CheckpointPrompt";
import type {
  AgentCreateCheckpoint,
  AgentCreateArtifact,
  AgentCreateCheckpointMode,
  AgentCreateMentionMediaType,
  AgentCreateMentionOption,
  AgentCreateMessage,
  AgentCreateSelectedMention,
  AgentCreateToolProgressStep,
} from "./agentCreateTypes";
import {
  buildAgentCreateOutputArtifacts,
} from "./agentCreateOutputArtifacts";
import {
  pendingAnalysisStatus,
  pendingContentStatus,
  pendingStudioRenderStatus,
  toolProgressStepsForCall,
  type AgentCreateDefaultProviders,
  type AgentCreateToolCallRecord,
  type AsyncToolState,
} from "./agentCreateToolProgress";
import { agentCreateClassNames } from "./agentCreateUi";

type CreateThreadId = Id<"createThreads">;
type CreateCheckpointId = Id<"createCheckpoints">;
type ArtifactId = Id<"artifacts">;
type PersonaId = Id<"personas">;
type VideoProjectId = Id<"videoProjects">;

type PendingAgentTurn = {
  localMessageId: string;
  serverMessageId?: string;
  threadId?: CreateThreadId;
  content: string;
  createdAt: number;
  referenceMentions?: AgentCreateSelectedMention[];
};

const sourceLabels: Record<SelectableLibraryAsset["source"], string> = {
  create: "Create",
  creative_asset: "Library asset",
  workflow_export: "Workflow export",
};

function mediaTypeFromAsset(asset: SelectableLibraryAsset): AgentCreateMentionMediaType {
  if (asset.mediaKind === "image" || asset.mediaKind === "video" || asset.mediaKind === "audio") {
    return asset.mediaKind;
  }

  return "file";
}

function mentionOptionFromAsset(asset: SelectableLibraryAsset): AgentCreateMentionOption {
  return {
    id: asset.sourceId,
    label: asset.title,
    entityType: asset.source === "creative_asset" ? "creative_asset" : "artifact",
    description: asset.prompt,
    mediaType: mediaTypeFromAsset(asset),
    sourceLabel: sourceLabels[asset.source],
    thumbnailUrl: asset.mediaKind === "image" || asset.mediaKind === "video"
      ? asset.storageUrl
      : undefined,
  };
}

function mentionOptionFromPersona(persona: {
  _id: PersonaId;
  description?: string;
  identityPrompt?: string;
  name: string;
  personaType: string;
  usageNotes?: string;
  visualConstraints?: string[];
}): AgentCreateMentionOption {
  return {
    id: persona._id,
    label: persona.name,
    entityType: "persona",
    description:
      persona.description ||
      persona.usageNotes ||
      persona.identityPrompt ||
      persona.visualConstraints?.join(", "),
    sourceLabel: "Persona",
  };
}

function uniqueMentions(mentions: AgentCreateSelectedMention[]) {
  const seen = new Set<string>();

  return mentions.filter((mention) => {
    const key = `${mention.entityType}:${mention.entityId}:${mention.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function videoProjectIdFromStudioArtifact(artifact?: AgentCreateArtifact): VideoProjectId | undefined {
  if (!artifact?.id.startsWith("studio:")) return undefined;
  return artifact.id.slice("studio:".length) as VideoProjectId;
}

function studioProjectUrl(projectId: VideoProjectId, renderRequestId?: string, autoRender = false) {
  const params = new URLSearchParams({ projectId: String(projectId) });
  if (renderRequestId) params.set("renderRequestId", renderRequestId);
  if (autoRender) params.set("autoRender", "1");
  return `/studio?${params.toString()}`;
}

function studioArtifactUrl(artifactId: ArtifactId) {
  const params = new URLSearchParams({ artifactId: String(artifactId) });
  return `/studio?${params.toString()}`;
}

function isDirectArtifactId(artifact: AgentCreateArtifact) {
  return (
    !artifact.id.includes(":") &&
    artifact.kind !== "document" &&
    artifact.kind !== "slideshow" &&
    artifact.status === "ready"
  );
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function outputId(output: unknown, key: string) {
  const value = recordFromUnknown(output)[key];
  return typeof value === "string" ? value : undefined;
}

function uniqueArtifacts(artifacts: AgentCreateArtifact[]) {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    if (seen.has(artifact.id)) return false;
    seen.add(artifact.id);
    return true;
  });
}

function latestUserMessageIndex(messages: AgentCreateMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return index;
  }
  return -1;
}

function pendingTurnMessageIndex(
  messages: AgentCreateMessage[],
  pendingTurn: PendingAgentTurn | null
) {
  if (!pendingTurn) return -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.id === pendingTurn.localMessageId) return index;
    if (pendingTurn.serverMessageId && message.id === pendingTurn.serverMessageId) return index;
    if (
      message.role === "user" &&
      message.content === pendingTurn.content &&
      typeof message.createdAt === "number" &&
      message.createdAt >= pendingTurn.createdAt - 5000
    ) {
      return index;
    }
  }

  return -1;
}

function isTransientQueuedMessage(message: {
  content: string;
  kind?: string;
}) {
  if (message.kind !== "tool_result") return false;
  return /^Queued .+ as a preview request\./.test(message.content) ||
    /^Queued slideshow rendering as a preview request\./.test(message.content);
}

function isRoutineProgressMessage(message: {
  content: string;
  kind?: string;
}) {
  if (message.kind !== "status" && message.kind !== "tool_result") return false;
  return (
    /^Finished .+\. Continuing to the next step\.$/.test(message.content) ||
    /^Finished .+\.$/.test(message.content) ||
    /^Waiting for .+ before .+\.$/.test(message.content) ||
    /^Started .+\.$/.test(message.content) ||
    /^Created a Studio project with /.test(message.content) ||
    /^Studio render is queued on the server render worker\./.test(message.content)
  );
}

function shouldAttachToolArtifactsToChat(toolName: string) {
  return (
    toolName === "artifact.export" ||
    toolName === "publishing.prepare" ||
    toolName === "workflow.createDraft"
  );
}

export function AgentCreateSurface() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = useMemo(
    () => activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {},
    [activeWorkspaceId]
  );
  const threads = useQuery(api.create.threads.list, workspaceArgs);
  const selectableLibraryAssets = useQuery(api.library.assets.listSelectable, workspaceArgs);
  const personas = useQuery(api.accounts.personas.list, workspaceArgs);
  const createThread = useMutation(api.create.threads.create);
  const deleteThread = useMutation(api.create.threads.remove);
  const renameThread = useMutation(api.create.threads.rename);
  const approveCheckpoint = useMutation(api.create.agent.approveCheckpoint);
  const continueThread = useMutation(api.create.agent.continueThread);
  const exportThreadOutputs = useMutation(api.create.agent.exportThreadOutputs);
  const saveThreadOutputs = useMutation(api.create.agent.saveThreadOutputs);
  const stopThread = useMutation(api.create.agent.stopThread);
  const submitAgentMessage = useMutation(api.create.agent.submit);
  const updateCheckpoint = useMutation(api.create.threads.updateCheckpoint);

  const [activeThreadId, setActiveThreadId] = useState<CreateThreadId | null>(null);
  const [checkpointMode, setCheckpointMode] = useState<AgentCreateCheckpointMode>("debug");
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [confirmingDeleteThreadId, setConfirmingDeleteThreadId] = useState<CreateThreadId | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<CreateThreadId | null>(null);
  const [editingThreadTitle, setEditingThreadTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<AgentCreateSelectedMention[]>([]);
  const [checkpointRevisionNotes, setCheckpointRevisionNotes] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [deletingThreadId, setDeletingThreadId] = useState<CreateThreadId | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<CreateThreadId | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [pendingAgentTurn, setPendingAgentTurn] = useState<PendingAgentTurn | null>(null);
  const [pendingCheckpointId, setPendingCheckpointId] = useState<CreateCheckpointId | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const activeThread = useMemo(
    () => threads?.find((thread) => thread._id === activeThreadId) ?? null,
    [activeThreadId, threads]
  );
  const messages = useQuery(
    api.create.threads.listMessages,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );
  const toolCalls = useQuery(
    api.create.threads.listToolCalls,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );
  const checkpoints = useQuery(
    api.create.threads.listCheckpoints,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );
  const threadOutputs = useQuery(
    api.create.agent.listThreadOutputs,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );

  const resolvedModelByContentRequestId = useMemo(() => {
    const mapped = new Map<string, string>();
    for (const entry of threadOutputs?.contentRequests ?? []) {
      const artifactModel = entry.artifacts.find((artifact) =>
        typeof artifact.model === "string" && artifact.model.trim()
      )?.model;
      const generation = recordFromUnknown(
        (entry.request as { generation?: unknown }).generation
      );
      const requestModel = typeof generation.model === "string" && generation.model.trim()
        ? generation.model.trim()
        : undefined;
      const model = artifactModel?.trim() || requestModel;
      if (model) mapped.set(String(entry.request._id), model);
    }
    return mapped;
  }, [threadOutputs]);

  const asyncStateLookup = useMemo(() => {
    const contentRequests = new Map<string, AsyncToolState>();
    const analysisJobs = new Map<string, AsyncToolState>();
    const studioRenderRequests = new Map<string, AsyncToolState>();

    for (const entry of threadOutputs?.contentRequests ?? []) {
      const status = pendingContentStatus(entry.request.status);
      if (!status) continue;
      contentRequests.set(String(entry.request._id), {
        status,
        completedAt: entry.request.completedAt,
        errorMessage: status === "failed"
          ? entry.request.errorMessage ?? "Generation request failed"
          : undefined,
      });
    }
    for (const job of threadOutputs?.analysisJobs ?? []) {
      const status = pendingAnalysisStatus(job.status);
      if (!status) continue;
      analysisJobs.set(String(job._id), {
        status,
        completedAt: job.completedAt,
        errorMessage: status === "failed"
          ? job.errorMessage ?? "Source analysis failed"
          : undefined,
      });
    }
    for (const request of threadOutputs?.studioRenderRequests ?? []) {
      const status = pendingStudioRenderStatus(request.status);
      if (!status) continue;
      studioRenderRequests.set(String(request._id), {
        status,
        completedAt: request.completedAt,
        errorMessage: status === "failed" || status === "canceled"
          ? request.errorMessage ?? "Studio render request failed"
          : request.errorMessage,
      });
    }

    return { analysisJobs, contentRequests, studioRenderRequests };
  }, [threadOutputs]);
  const defaultProviders = useMemo<AgentCreateDefaultProviders>(
    () => ({
      image: activeWorkspace?.aiGenerationSettings?.imageProvider ?? "fal",
      video: activeWorkspace?.aiGenerationSettings?.videoProvider ?? "fal",
      audio: activeWorkspace?.aiGenerationSettings?.audioProvider ?? "fal",
      lipsync: activeWorkspace?.aiGenerationSettings?.lipsyncProvider ?? "fal",
    }),
    [activeWorkspace?.aiGenerationSettings]
  );

  useEffect(() => {
    if (activeThreadId || !threads?.length) return;
    setActiveThreadId(threads[0]._id);
  }, [activeThreadId, threads]);

  useEffect(() => {
    if (!activeThread) return;
    setCheckpointMode(activeThread.checkpointMode);
  }, [activeThread]);

  useEffect(() => {
    if (chatMenuOpen) return;
    setConfirmingDeleteThreadId(null);
    setEditingThreadId(null);
    setEditingThreadTitle("");
  }, [chatMenuOpen]);

  const mentionOptions = useMemo(
    () => [
      ...(selectableLibraryAssets ?? []).map(mentionOptionFromAsset),
      ...(personas ?? []).map(mentionOptionFromPersona),
    ],
    [personas, selectableLibraryAssets]
  );

  const outputArtifacts = useMemo<AgentCreateArtifact[]>(
    () => buildAgentCreateOutputArtifacts(threadOutputs),
    [threadOutputs]
  );
  const artifactById = useMemo(
    () => new Map(outputArtifacts.map((artifact) => [artifact.id, artifact])),
    [outputArtifacts]
  );
  const artifactIdsByContentRequestId = useMemo(() => {
    const mapped = new Map<string, string[]>();
    for (const entry of threadOutputs?.contentRequests ?? []) {
      const artifactIds = [
        ...entry.artifacts.map((artifact) => String(artifact._id)),
        ...entry.slideshows.map((slideshow) => String(slideshow._id)),
      ];
      mapped.set(
        String(entry.request._id),
        artifactIds.length ? artifactIds : [`request:${entry.request._id}`]
      );
    }
    return mapped;
  }, [threadOutputs]);
  const artifactsByToolCallId = useMemo(() => {
    const mapped = new Map<string, AgentCreateArtifact[]>();

    for (const toolCall of toolCalls ?? []) {
      const artifacts: AgentCreateArtifact[] = [];
      for (const artifactId of toolCall.artifactIds ?? []) {
        const artifact = artifactById.get(String(artifactId));
        if (artifact) artifacts.push(artifact);
      }

      const contentRequestId = outputId(toolCall.output, "contentRequestId");
      if (contentRequestId) {
        artifacts.push(
          ...(artifactIdsByContentRequestId.get(contentRequestId) ?? [])
            .flatMap((artifactId) => artifactById.get(artifactId) ?? [])
        );
      }

      const analysisJobId = outputId(toolCall.output, "analysisJobId");
      const analysisArtifact = analysisJobId
        ? artifactById.get(`analysis:${analysisJobId}`)
        : undefined;
      if (analysisArtifact) artifacts.push(analysisArtifact);

      const projectId = outputId(toolCall.output, "projectId");
      const studioArtifact = projectId ? artifactById.get(`studio:${projectId}`) : undefined;
      if (studioArtifact) artifacts.push(studioArtifact);

      const studioRenderRequestId = outputId(toolCall.output, "studioRenderRequestId");
      const studioRenderArtifact = studioRenderRequestId
        ? artifactById.get(`studio-render:${studioRenderRequestId}`)
        : undefined;
      if (studioRenderArtifact) artifacts.push(studioRenderArtifact);

      const outputArtifactId = outputId(toolCall.output, "outputArtifactId");
      const outputArtifact = outputArtifactId ? artifactById.get(outputArtifactId) : undefined;
      if (outputArtifact) artifacts.push(outputArtifact);

      const distributionPlanId = outputId(toolCall.output, "distributionPlanId");
      const distributionArtifact = distributionPlanId
        ? artifactById.get(`distribution:${distributionPlanId}`)
        : undefined;
      if (distributionArtifact) artifacts.push(distributionArtifact);

      if (artifacts.length) mapped.set(String(toolCall._id), uniqueArtifacts(artifacts));
    }

    return mapped;
  }, [artifactById, artifactIdsByContentRequestId, toolCalls]);
  const progressSteps = useMemo<AgentCreateToolProgressStep[]>(
    () =>
      (toolCalls ?? []).flatMap((toolCall) => {
        const contentRequestId = outputId(toolCall.output, "contentRequestId");
        const asyncState =
          asyncStateLookup.contentRequests.get(contentRequestId ?? "") ??
          asyncStateLookup.analysisJobs.get(outputId(toolCall.output, "analysisJobId") ?? "") ??
          asyncStateLookup.studioRenderRequests.get(
            outputId(toolCall.output, "studioRenderRequestId") ?? ""
          );
        const resolvedModel = contentRequestId
          ? resolvedModelByContentRequestId.get(contentRequestId)
          : undefined;

        return toolProgressStepsForCall({
          asyncState,
          defaultProviders,
          resolvedModel,
          toolCall: toolCall as AgentCreateToolCallRecord,
        }).map((step) =>
          step.id === String(toolCall._id)
            ? { ...step, artifacts: artifactsByToolCallId.get(String(toolCall._id)) }
            : step
        );
      }),
    [artifactsByToolCallId, asyncStateLookup, defaultProviders, resolvedModelByContentRequestId, toolCalls]
  );
  const artifactsByMessageId = useMemo(() => {
    const mapped = new Map<string, AgentCreateArtifact[]>();
    const addArtifacts = (messageId: string | undefined, artifacts: AgentCreateArtifact[]) => {
      if (!messageId || !artifacts.length) return;
      mapped.set(messageId, uniqueArtifacts([...(mapped.get(messageId) ?? []), ...artifacts]));
    };

    for (const toolCall of toolCalls ?? []) {
      if (!shouldAttachToolArtifactsToChat(toolCall.toolName)) continue;
      addArtifacts(toolCall.messageId, artifactsByToolCallId.get(String(toolCall._id)) ?? []);
    }

    return mapped;
  }, [artifactsByToolCallId, toolCalls]);
  const toolStepsByMessageId = useMemo(() => {
    const mapped = new Map<string, AgentCreateToolProgressStep[]>();
    for (const toolCall of toolCalls ?? []) {
      if (!toolCall.messageId) continue;
      const messageId = String(toolCall.messageId);
      const contentRequestId = outputId(toolCall.output, "contentRequestId");
      const asyncState =
        asyncStateLookup.contentRequests.get(contentRequestId ?? "") ??
        asyncStateLookup.analysisJobs.get(outputId(toolCall.output, "analysisJobId") ?? "") ??
        asyncStateLookup.studioRenderRequests.get(
          outputId(toolCall.output, "studioRenderRequestId") ?? ""
        );
      const resolvedModel = contentRequestId
        ? resolvedModelByContentRequestId.get(contentRequestId)
        : undefined;

        mapped.set(messageId, [
          ...(mapped.get(messageId) ?? []),
          ...toolProgressStepsForCall({
            asyncState,
            defaultProviders,
            resolvedModel,
            toolCall: toolCall as AgentCreateToolCallRecord,
          }).map((step) =>
          step.id === String(toolCall._id)
            ? { ...step, artifacts: artifactsByToolCallId.get(String(toolCall._id)) }
            : step
        ),
      ]);
    }
    return mapped;
  }, [artifactsByToolCallId, asyncStateLookup, defaultProviders, resolvedModelByContentRequestId, toolCalls]);
  const renderedMessages = useMemo<AgentCreateMessage[]>(
    () =>
      (messages ?? [])
        .filter((message) => !isTransientQueuedMessage(message) && !isRoutineProgressMessage(message))
        .map((message) => {
          const explicitArtifacts = (message.artifactIds ?? [])
            .flatMap((artifactId) => artifactById.get(String(artifactId)) ?? []);
          const toolArtifacts = artifactsByMessageId.get(String(message._id)) ?? [];
          return {
            id: message._id,
            role: message.role,
            content: message.content,
            kind: message.kind,
            createdAt: message.createdAt,
            referenceMentions: message.referenceMentions,
            artifacts: uniqueArtifacts([...explicitArtifacts, ...toolArtifacts]),
            toolSteps: toolStepsByMessageId.get(String(message._id)),
          };
        }),
    [artifactById, artifactsByMessageId, messages, toolStepsByMessageId]
  );
  const visibleMessages = useMemo<AgentCreateMessage[]>(() => {
    if (!pendingAgentTurn) return renderedMessages;
    if (pendingTurnMessageIndex(renderedMessages, pendingAgentTurn) >= 0) {
      return renderedMessages;
    }

    return [
      ...renderedMessages,
      {
        id: pendingAgentTurn.localMessageId,
        role: "user",
        content: pendingAgentTurn.content,
        kind: "chat",
        createdAt: pendingAgentTurn.createdAt,
        referenceMentions: pendingAgentTurn.referenceMentions,
      },
    ];
  }, [pendingAgentTurn, renderedMessages]);
  const openCheckpoints = useMemo<AgentCreateCheckpoint[]>(
    () =>
      (checkpoints ?? [])
        .filter((checkpoint) => checkpoint.status === "open")
        .map((checkpoint) => ({
          id: checkpoint._id,
          status: checkpoint.status,
          label: checkpoint.label,
          message: checkpoint.message,
          artifacts: checkpoint.artifactIds
            ?.flatMap((artifactId) => artifactById.get(String(artifactId)) ?? []),
        })),
    [artifactById, checkpoints]
  );

  const hasQueuedTools = progressSteps.some((step) => step.status === "queued");
  const hasUnreadyOutputs = outputArtifacts.some((artifact) =>
    artifact.status === "generating" ||
    artifact.status === "failed"
  );
  const latestUserIndex = latestUserMessageIndex(visibleMessages);
  const pendingTurnIndex = pendingTurnMessageIndex(visibleMessages, pendingAgentTurn);
  const hasAgentMessageAfterPendingTurn = pendingTurnIndex >= 0 &&
    visibleMessages.slice(pendingTurnIndex + 1).some((message) => message.role !== "user");
  const showThinkingPlaceholder = Boolean(
    pendingAgentTurn &&
      latestUserIndex >= 0 &&
      pendingTurnIndex >= 0 &&
      !hasAgentMessageAfterPendingTurn
  );
  const activeProgressStep = progressSteps.find((step) => step.status === "running") ??
    progressSteps.find((step) => step.status === "queued");
  const activeWorkingArtifact = outputArtifacts.find((artifact) =>
    artifact.status === "generating"
  );
  const showActivity = Boolean(
    isSubmitting ||
      activeThread?.status === "planning" ||
      activeThread?.status === "running" ||
      activeProgressStep?.status === "running" ||
      activeWorkingArtifact
  ) && !openCheckpoints.length;
  const workingMessageId = useMemo(
    () => {
      if (showThinkingPlaceholder) return undefined;
      if (!showActivity) return undefined;
      const activeToolCall = activeProgressStep
        ? toolCalls?.find((toolCall) => toolCall._id === activeProgressStep.id)
        : undefined;
      if (activeToolCall?.messageId) return String(activeToolCall.messageId);
      const fallbackMessageId = [...(messages ?? [])].reverse().find((message) => message.role !== "user")?._id;
      return fallbackMessageId ? String(fallbackMessageId) : undefined;
    },
    [activeProgressStep, messages, showActivity, showThinkingPlaceholder, toolCalls]
  );
  const handleMentionSelect = (mention: AgentCreateSelectedMention) => {
    setSelectedMentions((current) => uniqueMentions([...current, mention]));
  };

  useEffect(() => {
    if (!pendingAgentTurn) return;
    if (!hasAgentMessageAfterPendingTurn) return;
    setPendingAgentTurn(null);
  }, [hasAgentMessageAfterPendingTurn, pendingAgentTurn]);

  const handlePromptChange = (nextPrompt: string) => {
    setPrompt(nextPrompt);
    setSelectedMentions((current) =>
      current.filter((mention) => nextPrompt.includes(mention.token))
    );
  };

  const removeMention = (mentionToRemove: AgentCreateSelectedMention) => {
    setSelectedMentions((current) =>
      current.filter((mention) =>
        !(
          mention.entityType === mentionToRemove.entityType &&
          mention.entityId === mentionToRemove.entityId &&
          mention.token === mentionToRemove.token
        )
      )
    );
  };

  const submitMessage = async () => {
    const content = prompt.trim();
    if (!content || isSubmitting) return;
    const activeMentions = selectedMentions.filter((mention) => content.includes(mention.token));
    const now = Date.now();
    const localMessageId = `pending:${now}`;

    setIsSubmitting(true);
    setStatusMessage("");
    setPendingAgentTurn({
      localMessageId,
      ...(activeThreadId ? { threadId: activeThreadId } : {}),
      content,
      createdAt: now,
      referenceMentions: activeMentions,
    });
    setPrompt("");
    setSelectedMentions([]);
    try {
      const result = await submitAgentMessage({
        ...(activeThreadId ? { threadId: activeThreadId } : workspaceArgs),
        checkpointMode,
        content,
        referenceMentions: activeMentions,
      });
      setPendingAgentTurn((current) =>
        current?.localMessageId === localMessageId
          ? {
              ...current,
              threadId: result.threadId,
              serverMessageId: String(result.userMessageId),
            }
          : current
      );
      setActiveThreadId(result.threadId);
    } catch (error) {
      setPendingAgentTurn((current) =>
        current?.localMessageId === localMessageId ? null : current
      );
      setPrompt(content);
      setSelectedMentions(activeMentions);
      setStatusMessage(error instanceof Error ? error.message : "Unable to send message");
    } finally {
      setIsSubmitting(false);
    }
  };

  const stopActiveThread = async () => {
    if (!activeThreadId || isStopping) return;

    setIsStopping(true);
    setStatusMessage("");
    try {
      await stopThread({ threadId: activeThreadId });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to stop generation");
    } finally {
      setIsStopping(false);
    }
  };

  const startEmptyThread = async () => {
    setStatusMessage("");
    setPrompt("");
    setSelectedMentions([]);
    setPendingAgentTurn(null);
    setConfirmingDeleteThreadId(null);
    setEditingThreadId(null);
    setEditingThreadTitle("");
    const threadId = await createThread({
      ...workspaceArgs,
      checkpointMode,
      title: "New Chat",
    });
    setActiveThreadId(threadId);
  };

  const startRenamingThread = (threadId: CreateThreadId, title: string | undefined) => {
    setConfirmingDeleteThreadId(null);
    setEditingThreadId(threadId);
    setEditingThreadTitle(title ?? "New Chat");
    setStatusMessage("");
  };

  const cancelRenamingThread = () => {
    setEditingThreadId(null);
    setEditingThreadTitle("");
  };

  const submitThreadRename = async () => {
    if (!editingThreadId || renamingThreadId) return;

    setRenamingThreadId(editingThreadId);
    setStatusMessage("");
    try {
      await renameThread({
        threadId: editingThreadId,
        title: editingThreadTitle,
      });
      cancelRenamingThread();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to rename chat");
    } finally {
      setRenamingThreadId(null);
    }
  };

  const startDeletingThread = (threadId: CreateThreadId) => {
    setConfirmingDeleteThreadId(threadId);
    setEditingThreadId(null);
    setEditingThreadTitle("");
    setStatusMessage("");
  };

  const cancelDeletingThread = () => {
    setConfirmingDeleteThreadId(null);
  };

  const submitThreadDelete = async (threadId: CreateThreadId) => {
    if (deletingThreadId) return;

    const nextThreadId = threads?.find((thread) => thread._id !== threadId)?._id ?? null;
    const wasActiveThread = activeThreadId === threadId;
    setDeletingThreadId(threadId);
    setStatusMessage("");
    if (wasActiveThread) {
      setActiveThreadId(nextThreadId);
    }
    try {
      await deleteThread({ threadId });
      setConfirmingDeleteThreadId(null);
    } catch (error) {
      if (wasActiveThread && threads?.some((thread) => thread._id === threadId)) {
        setActiveThreadId(threadId);
      }
      setStatusMessage(error instanceof Error ? error.message : "Unable to delete chat");
    } finally {
      setDeletingThreadId(null);
    }
  };

  const setCheckpointStatus = async (
    checkpoint: AgentCreateCheckpoint,
    status: "approved" | "rejected" | "revised",
    response?: string
  ) => {
    setPendingCheckpointId(checkpoint.id as CreateCheckpointId);
    setStatusMessage("");
    try {
      if (status === "approved") {
        await approveCheckpoint({
          checkpointId: checkpoint.id as CreateCheckpointId,
          response,
        });
      } else {
        await updateCheckpoint({
          id: checkpoint.id as CreateCheckpointId,
          status,
          response,
        });
        if (status === "revised" && response?.trim() && activeThreadId) {
          await submitAgentMessage({
            threadId: activeThreadId,
            checkpointMode,
            content: `Revise from checkpoint "${checkpoint.label}": ${response.trim()}`,
          });
        }
      }
      setCheckpointRevisionNotes((current) => {
        const next = { ...current };
        delete next[checkpoint.id];
        return next;
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to update checkpoint");
    } finally {
      setPendingCheckpointId(null);
    }
  };

  const continueQueuedTools = async () => {
    if (!activeThreadId || isContinuing) return;

    setIsContinuing(true);
    setStatusMessage("");
    try {
      await continueThread({ threadId: activeThreadId });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to continue");
    } finally {
      setIsContinuing(false);
    }
  };

  useEffect(() => {
    if (!activeThreadId) return;
    if (checkpointMode !== "auto") return;
    if (threadOutputs === undefined) return;
    if (!hasQueuedTools || hasUnreadyOutputs || openCheckpoints.length) return;
    if (isContinuing || isSubmitting || isStopping) return;

    void continueQueuedTools();
  }, [
    activeThreadId,
    checkpointMode,
    hasQueuedTools,
    hasUnreadyOutputs,
    isContinuing,
    isSubmitting,
    isStopping,
    openCheckpoints.length,
    threadOutputs,
  ]);

  const openArtifact = (artifact: AgentCreateArtifact) => {
    if (!artifact.url) return;
    window.open(artifact.url, "_blank", "noopener,noreferrer");
  };

  const openArtifactInStudio = (artifact: AgentCreateArtifact) => {
    const projectId = videoProjectIdFromStudioArtifact(artifact);
    if (projectId) {
      window.open(studioProjectUrl(projectId), "_blank", "noopener,noreferrer");
      return;
    }
    if (isDirectArtifactId(artifact) && (artifact.kind === "image" || artifact.kind === "video")) {
      window.open(studioArtifactUrl(artifact.id as ArtifactId), "_blank", "noopener,noreferrer");
    }
  };

  const saveArtifactToLibrary = async (artifact: AgentCreateArtifact) => {
    if (!activeThreadId || !isDirectArtifactId(artifact)) return;

    setStatusMessage("");
    try {
      await saveThreadOutputs({
        threadId: activeThreadId,
        artifactIds: [artifact.id as ArtifactId],
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to save artifact");
    }
  };

  const exportArtifact = async (artifact: AgentCreateArtifact) => {
    if (!activeThreadId || !isDirectArtifactId(artifact)) {
      openArtifact(artifact);
      return;
    }

    setStatusMessage("");
    try {
      const result = await exportThreadOutputs({
        threadId: activeThreadId,
        artifactIds: [artifact.id as ArtifactId],
      });
      const exportUrl = result.exportUrls[0]?.storageUrl ?? artifact.url;
      if (exportUrl) window.open(exportUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to export artifact");
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-4rem)] min-w-0">
      <button
        aria-expanded={chatMenuOpen}
        aria-label={chatMenuOpen ? "Close chats" : "Open chats"}
        className="fixed left-[calc(13.5rem+var(--space-2))] top-[var(--space-2)] z-[60] grid size-10 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-lg)] transition hover:bg-[var(--color-page-quiet)] max-[900px]:left-[var(--space-2)]"
        onClick={() => setChatMenuOpen((open) => !open)}
        type="button"
      >
        <PanelLeft size={17} />
      </button>

      {chatMenuOpen ? (
        <button
          aria-label="Close chats"
          className="fixed bottom-0 left-[13.5rem] right-0 top-0 z-40 cursor-default bg-[oklch(12%_0.025_232_/_0.16)] backdrop-blur-[1px] max-[900px]:left-0"
          onClick={() => setChatMenuOpen(false)}
          type="button"
        />
      ) : null}

      {chatMenuOpen ? (
        <aside
          aria-label="Chats"
          className="fixed bottom-0 left-[13.5rem] top-0 z-50 grid w-[min(21rem,calc(100vw-13.5rem))] grid-rows-[auto_minmax(0,1fr)] border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] max-[900px]:left-0 max-[900px]:w-[min(21rem,100vw)]"
        >
          <div className="flex min-h-14 min-w-0 items-center justify-between gap-[var(--space-2)] border-b border-[var(--color-border)] py-[var(--space-2)] pl-14 pr-[var(--space-3)]">
            <div className="min-w-0">
              <h2 className="m-0 text-[0.9rem] font-[840] text-[var(--color-ink)]">Chats</h2>
            </div>
            <button
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-2 text-[0.76rem] font-[760] text-[var(--color-primary)] transition hover:bg-[var(--color-primary-soft)]"
              disabled={isSubmitting}
              onClick={() => {
                void startEmptyThread();
                setChatMenuOpen(false);
              }}
              type="button"
            >
              <Plus size={14} />
              New Chat
            </button>
          </div>

          <div className="min-h-0 overflow-auto px-[var(--space-2)] py-[var(--space-2)]">
            {threads?.length ? (
              <div className="grid min-w-0 gap-1">
                {threads.map((thread) => {
                  const active = thread._id === activeThreadId;
                  const isConfirmingDelete = confirmingDeleteThreadId === thread._id;
                  const isDeleting = deletingThreadId === thread._id;
                  const isEditing = editingThreadId === thread._id;
                  const isRenaming = renamingThreadId === thread._id;

                  if (isConfirmingDelete) {
                    return (
                      <div
                        className="grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-[0.55rem] bg-[var(--color-danger-soft)] px-2"
                        key={thread._id}
                      >
                        <span className="min-w-0 truncate text-[0.8rem] font-[760] text-[var(--color-danger)]">
                          Delete this chat?
                        </span>
                        <button
                          className="inline-flex min-h-8 items-center rounded-full px-2 text-[0.76rem] font-[780] text-[var(--color-danger)] transition hover:bg-[oklch(100%_0_0_/_0.5)] disabled:cursor-not-allowed disabled:opacity-55"
                          disabled={isDeleting}
                          onClick={() => {
                            void submitThreadDelete(thread._id);
                          }}
                          type="button"
                        >
                          Delete
                        </button>
                        <button
                          aria-label="Cancel delete"
                          className="grid size-8 place-items-center rounded-full text-[var(--color-ink-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-55"
                          disabled={isDeleting}
                          onClick={cancelDeletingThread}
                          type="button"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    );
                  }

                  if (isEditing) {
                    return (
                      <form
                        className="grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-[0.55rem] bg-[var(--color-page-quiet)] px-1"
                        key={thread._id}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitThreadRename();
                        }}
                      >
                        <input
                          aria-label="Chat name"
                          autoFocus
                          className="min-h-9 min-w-0 rounded-[0.45rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[0.82rem] font-[720] text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
                          disabled={isRenaming}
                          onChange={(event) => setEditingThreadTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") cancelRenamingThread();
                          }}
                          value={editingThreadTitle}
                        />
                        <button
                          aria-label="Save chat name"
                          className="grid size-8 place-items-center rounded-full text-[var(--color-primary)] transition hover:bg-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:opacity-55"
                          disabled={isRenaming}
                          type="submit"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          aria-label="Cancel rename"
                          className="grid size-8 place-items-center rounded-full text-[var(--color-ink-muted)] transition hover:bg-[var(--color-page)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-55"
                          disabled={isRenaming}
                          onClick={cancelRenamingThread}
                          type="button"
                        >
                          <X size={15} />
                        </button>
                      </form>
                    );
                  }

                  return (
                    <div
                      className={agentCreateClassNames(
                        "grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center rounded-[0.55rem] transition",
                        active
                          ? "bg-[var(--color-primary-soft)] text-[var(--color-ink)]"
                          : "text-[var(--color-ink-soft)] hover:bg-[var(--color-page-quiet)] hover:text-[var(--color-ink)]"
                      )}
                      key={thread._id}
                    >
                      <button
                        className="min-h-11 min-w-0 truncate px-[var(--space-3)] text-left text-[0.82rem] font-[720]"
                        onClick={() => {
                          setActiveThreadId(thread._id);
                          setChatMenuOpen(false);
                        }}
                        type="button"
                      >
                        {thread.title ?? "New Chat"}
                      </button>
                      <button
                        aria-label="Rename chat"
                        className="grid size-8 place-items-center rounded-full text-[var(--color-ink-muted)] opacity-80 transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
                        onClick={() => startRenamingThread(thread._id, thread.title)}
                        type="button"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        aria-label="Delete chat"
                        className="mr-1 grid size-8 place-items-center rounded-full text-[var(--color-ink-muted)] opacity-80 transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                        onClick={() => startDeletingThread(thread._id)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="m-0 px-[var(--space-3)] py-[var(--space-4)] text-[0.82rem] text-[var(--color-ink-muted)]">
                No chats yet.
              </p>
            )}
          </div>
        </aside>
      ) : null}

      <section
        className={agentCreateClassNames(
          "mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-[54rem] grid-rows-[1fr_auto] transition duration-200",
          chatMenuOpen ? "pointer-events-none select-none opacity-70" : ""
        )}
      >
        <div className="grid min-w-0 content-start gap-[var(--space-6)] pb-[13rem] pt-[var(--space-4)]">
          <AgentCreateMessageList
            emptyLabel={`Start a new Create chat in ${activeWorkspace?.name ?? "this workspace"}.`}
            isLoading={Boolean(activeThreadId) && messages === undefined}
            messages={visibleMessages}
            onArtifactDownload={(artifact) => {
              void exportArtifact(artifact);
            }}
            onArtifactOpen={openArtifact}
            onArtifactOpenStudio={openArtifactInStudio}
            onArtifactSave={(artifact) => {
              void saveArtifactToLibrary(artifact);
            }}
            showThinkingPlaceholder={showThinkingPlaceholder}
            threadKey={activeThreadId}
            workingMessageId={workingMessageId}
          />
          {hasQueuedTools && !openCheckpoints.length && !hasUnreadyOutputs ? (
            <button
              className="secondary-button justify-self-start"
              disabled={isContinuing}
              onClick={() => {
                void continueQueuedTools();
              }}
              type="button"
            >
              Continue
            </button>
          ) : null}
          {openCheckpoints.map((checkpoint) => (
            <CheckpointPrompt
              checkpoint={checkpoint}
              disabled={Boolean(pendingCheckpointId)}
              isPending={pendingCheckpointId === checkpoint.id}
              key={checkpoint.id}
              onApprove={(selectedCheckpoint) => {
                void setCheckpointStatus(selectedCheckpoint, "approved");
              }}
              onReject={(selectedCheckpoint) => {
                void setCheckpointStatus(selectedCheckpoint, "rejected");
              }}
              onRevise={(selectedCheckpoint, instructions) => {
                void setCheckpointStatus(selectedCheckpoint, "revised", instructions);
              }}
              onRevisionChange={(value) => {
                setCheckpointRevisionNotes((current) => ({
                  ...current,
                  [checkpoint.id]: value,
                }));
              }}
              revisionValue={checkpointRevisionNotes[checkpoint.id] ?? ""}
            />
          ))}
        </div>

        <div className="fixed bottom-0 left-[13.5rem] right-0 z-30 bg-[linear-gradient(to_top,var(--color-page)_84%,var(--color-page)_68%,oklch(97%_0.02_230_/_0))] px-[clamp(1.25rem,2.5vw,2.75rem)] pb-[calc(env(safe-area-inset-bottom)+var(--space-2))] pt-[var(--space-8)] max-[900px]:left-0 max-[900px]:px-[var(--space-4)] max-[560px]:px-[var(--space-3)]">
          <div className="mx-auto grid w-full max-w-[54rem] gap-[var(--space-2)]">
            <AgentCreatePrompt
              checkpointMode={checkpointMode}
              disabled={isSubmitting}
              isSubmitting={isSubmitting}
              isStopping={isStopping}
              isWorking={Boolean(activeThreadId && showActivity)}
              mentionOptions={mentionOptions}
              onChange={handlePromptChange}
              onCheckpointModeChange={setCheckpointMode}
              onMentionRemove={removeMention}
              onMentionSelect={(selection) => handleMentionSelect(selection.mention)}
              onStop={() => {
                void stopActiveThread();
              }}
              onSubmit={() => {
                void submitMessage();
              }}
              selectedMentions={selectedMentions}
              submitLabel="Send"
              value={prompt}
            />
            {statusMessage ? (
              <p className="m-0 rounded-full bg-[var(--color-danger-soft)] px-[var(--space-3)] py-1 text-[0.78rem] text-[var(--color-danger)] shadow-[var(--shadow-sm)]">
                {statusMessage}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </section>
  );
}
