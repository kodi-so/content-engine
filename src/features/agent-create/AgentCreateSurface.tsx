import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import {
  AgentCreateComposerDock,
  AgentCreateConversationBody,
} from "./components/AgentCreateConversation";
import { AgentCreateThreadSidebar } from "./components/AgentCreateThreadSidebar";
import type {
  AgentCreateArtifact,
  AgentCreateCheckpointMode,
  AgentCreateMessage,
  AgentCreateSelectedMention,
  AgentCreateToolProgressStep,
} from "./model/agentCreateTypes";
import { buildAgentCreateOutputArtifacts } from "./model/agentCreateOutputArtifacts";
import {
  type AgentCreateDefaultProviders,
} from "./model/agentCreateToolProgress";
import { agentCreateClassNames } from "./model/agentCreateUi";
import {
  backendReferenceMention,
  latestUserMessageIndex,
  mentionOptionFromAsset,
  mentionOptionFromReferenceMention,
  pendingTurnMessageIndex,
  uniqueMentions,
  type PendingAgentTurn,
} from "./model/agentCreateSurfaceModel";
import {
  artifactIdsByContentRequestId,
  artifactsByMessageId,
  artifactsByToolCallId,
  asyncStateLookupForThreadOutputs,
  openAgentCreateCheckpoints,
  progressStepsForToolCalls,
  renderedAgentCreateMessages,
  resolvedModelByContentRequestId as buildResolvedModelByContentRequestId,
  toolStepsByMessageId,
} from "./model/agentCreateSurfaceSelectors";
import { useAgentCreateArtifactActions } from "./hooks/useAgentCreateArtifactActions";
import { useAgentCreateCheckpointActions } from "./hooks/useAgentCreateCheckpointActions";
import { useAgentCreateMentionDrafts } from "./hooks/useAgentCreateMentionDrafts";

export function AgentCreateSurface() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = useMemo(() => activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}, [activeWorkspaceId]);
  const threads = useQuery(api.create.threads.list, workspaceArgs);
  const selectableLibraryAssets = useQuery(api.library.assets.listSelectable, workspaceArgs);
  const uploadReference = useAction(api.storage.files.uploadBase64ImageWithMetadata);
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

  const [activeThreadId, setActiveThreadId] = useState<Id<"createThreads"> | null>(null);
  const [checkpointMode, setCheckpointMode] = useState<AgentCreateCheckpointMode>("debug");
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [confirmingDeleteThreadId, setConfirmingDeleteThreadId] = useState<Id<"createThreads"> | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<Id<"createThreads"> | null>(null);
  const [editingThreadTitle, setEditingThreadTitle] = useState("");
  const [checkpointRevisionNotes, setCheckpointRevisionNotes] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [deletingThreadId, setDeletingThreadId] = useState<Id<"createThreads"> | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<Id<"createThreads"> | null>(null);
  const [pendingAgentTurn, setPendingAgentTurn] = useState<PendingAgentTurn | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const {
    clearComposer,
    handleMentionSelect,
    handlePastedReferenceFiles,
    handlePromptChange,
    prompt,
    restoreComposer,
    selectedMentions,
    uploadDraftMentionsForSubmit,
  } = useAgentCreateMentionDrafts({
    setStatusMessage,
    uploadReference,
  });
  const {
    continueQueuedTools,
    isContinuing,
    pendingCheckpointId,
    setCheckpointStatus,
  } = useAgentCreateCheckpointActions({
    activeThreadId,
    approveCheckpoint,
    checkpointMode,
    continueThread,
    setCheckpointRevisionNotes,
    setStatusMessage,
    submitAgentMessage,
    updateCheckpoint,
  });
  const {
    exportArtifact,
    openArtifact,
    openArtifactInStudio,
    saveArtifactToLibrary,
  } = useAgentCreateArtifactActions({
    activeThreadId,
    exportThreadOutputs,
    saveThreadOutputs,
    setStatusMessage,
  });

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

  const resolvedModelByContentRequestId = useMemo(
    () => buildResolvedModelByContentRequestId(threadOutputs),
    [threadOutputs]
  );
  const asyncStateLookup = useMemo(
    () => asyncStateLookupForThreadOutputs(threadOutputs),
    [threadOutputs]
  );
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

  const threadUploadedMentionOptions = useMemo(
    () =>
      uniqueMentions([
        ...((messages ?? []).flatMap((message) =>
          (message.referenceMentions ?? []).filter((mention) =>
            mention.entityType === "uploaded_reference"
          ) as AgentCreateSelectedMention[]
        )),
        ...(pendingAgentTurn?.referenceMentions ?? []).filter((mention) =>
          mention.entityType === "uploaded_reference"
        ),
      ]).map(mentionOptionFromReferenceMention),
    [messages, pendingAgentTurn?.referenceMentions]
  );
  const mentionOptions = useMemo(
    () => [
      ...threadUploadedMentionOptions,
      ...(selectableLibraryAssets ?? []).map(mentionOptionFromAsset),
    ],
    [selectableLibraryAssets, threadUploadedMentionOptions]
  );
  const mentionOptionById = useMemo(
    () => new Map(mentionOptions.map((option) => [option.id, option])),
    [mentionOptions]
  );

  const outputArtifacts = useMemo<AgentCreateArtifact[]>(
    () => buildAgentCreateOutputArtifacts(threadOutputs),
    [threadOutputs]
  );
  const artifactById = useMemo(
    () => new Map(outputArtifacts.map((artifact) => [artifact.id, artifact])),
    [outputArtifacts]
  );
  const contentRequestArtifactIds = useMemo(
    () => artifactIdsByContentRequestId(threadOutputs),
    [threadOutputs]
  );
  const artifactsByToolCall = useMemo(
    () => artifactsByToolCallId({
      artifactById,
      artifactIdsByContentRequestId: contentRequestArtifactIds,
      toolCalls,
    }),
    [artifactById, contentRequestArtifactIds, toolCalls]
  );
  const progressSteps = useMemo<AgentCreateToolProgressStep[]>(
    () => progressStepsForToolCalls({
      artifactsByToolCallId: artifactsByToolCall,
      asyncStateLookup,
      defaultProviders,
      resolvedModelByContentRequestId,
      toolCalls,
    }),
    [artifactsByToolCall, asyncStateLookup, defaultProviders, resolvedModelByContentRequestId, toolCalls]
  );
  const artifactsByMessage = useMemo(
    () => artifactsByMessageId({
      artifactsByToolCallId: artifactsByToolCall,
      toolCalls,
    }),
    [artifactsByToolCall, toolCalls]
  );
  const toolStepsByMessage = useMemo(
    () => toolStepsByMessageId({
      artifactsByToolCallId: artifactsByToolCall,
      asyncStateLookup,
      defaultProviders,
      resolvedModelByContentRequestId,
      toolCalls,
    }),
    [artifactsByToolCall, asyncStateLookup, defaultProviders, resolvedModelByContentRequestId, toolCalls]
  );
  const renderedMessages = useMemo<AgentCreateMessage[]>(
    () => renderedAgentCreateMessages({
      artifactById,
      artifactsByMessageId: artifactsByMessage,
      mentionOptionById,
      messages,
      toolStepsByMessageId: toolStepsByMessage,
    }),
    [artifactById, artifactsByMessage, mentionOptionById, messages, toolStepsByMessage]
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
  const openCheckpoints = useMemo(
    () => openAgentCreateCheckpoints({ artifactById, checkpoints }),
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
      activeProgressStep?.status === "queued" ||
      activeProgressStep?.status === "running" ||
      activeWorkingArtifact
  ) && !openCheckpoints.length;
  const activeThinkingStep = useMemo<AgentCreateToolProgressStep | undefined>(
    () => {
      const isPlanningWithoutTool =
        activeThread?.status === "planning" &&
        !activeProgressStep &&
        !activeWorkingArtifact;
      if (!showThinkingPlaceholder && !(showActivity && isPlanningWithoutTool)) {
        return undefined;
      }

      const startedAt = pendingAgentTurn?.createdAt ?? activeThread?.updatedAt;
      const isInitialTurn = Boolean(showThinkingPlaceholder);
      return {
        id: isInitialTurn ? "agent-thinking:initial" : "agent-thinking:next",
        label: isInitialTurn ? "Thinking through the request" : "Thinking through next steps",
        status: "running",
        detail: isInitialTurn
          ? "Deciding what tools and plan are needed."
          : "Using the latest messages and tool results to decide the next tool calls.",
        createdAt: startedAt,
        startedAt,
      };
    },
    [
      activeProgressStep,
      activeThread?.status,
      activeThread?.updatedAt,
      activeWorkingArtifact,
      pendingAgentTurn?.createdAt,
      showActivity,
      showThinkingPlaceholder,
    ]
  );
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
  useEffect(() => {
    if (!pendingAgentTurn) return;
    if (!hasAgentMessageAfterPendingTurn) return;
    setPendingAgentTurn(null);
  }, [hasAgentMessageAfterPendingTurn, pendingAgentTurn]);

  const submitMessage = async () => {
    const content = prompt.trim();
    if (!content || isSubmitting) return;
    const activeMentions = selectedMentions.filter((mention) => content.includes(mention.token));
    const now = Date.now();
    const localMessageId = `pending:${now}`;

    setIsSubmitting(true);
    setStatusMessage("");
    try {
      const uploadedMentions = await uploadDraftMentionsForSubmit(activeMentions);
      const submitMentions = uploadedMentions.map(backendReferenceMention);
      setPendingAgentTurn({
        localMessageId,
        ...(activeThreadId ? { threadId: activeThreadId } : {}),
        content,
        createdAt: now,
        referenceMentions: uploadedMentions,
      });
      clearComposer();
      setStatusMessage("");
      const result = await submitAgentMessage({
        ...(activeThreadId ? { threadId: activeThreadId } : workspaceArgs),
        checkpointMode,
        content,
        referenceMentions: submitMentions,
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
      restoreComposer(content, activeMentions);
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
    clearComposer();
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

  const startRenamingThread = (threadId: Id<"createThreads">, title: string | undefined) => {
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

  const startDeletingThread = (threadId: Id<"createThreads">) => {
    setConfirmingDeleteThreadId(threadId);
    setEditingThreadId(null);
    setEditingThreadTitle("");
    setStatusMessage("");
  };

  const cancelDeletingThread = () => {
    setConfirmingDeleteThreadId(null);
  };

  const submitThreadDelete = async (threadId: Id<"createThreads">) => {
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

  return (
    <section className="relative min-h-[calc(100vh-4rem)] min-w-0">
      <AgentCreateThreadSidebar
        activeThreadId={activeThreadId}
        chatMenuOpen={chatMenuOpen}
        confirmingDeleteThreadId={confirmingDeleteThreadId}
        deletingThreadId={deletingThreadId}
        editingThreadId={editingThreadId}
        editingThreadTitle={editingThreadTitle}
        isSubmitting={isSubmitting}
        onCancelDelete={cancelDeletingThread}
        onCancelRename={cancelRenamingThread}
        onDeleteThread={(threadId) => {
          void submitThreadDelete(threadId);
        }}
        onEditingThreadTitleChange={setEditingThreadTitle}
        onNewThread={() => {
          void startEmptyThread();
        }}
        onRenameThread={() => {
          void submitThreadRename();
        }}
        onSelectThread={setActiveThreadId}
        onStartDelete={startDeletingThread}
        onStartRename={startRenamingThread}
        onToggleOpen={setChatMenuOpen}
        renamingThreadId={renamingThreadId}
        threads={threads}
      />

      <section
        className={agentCreateClassNames(
          "mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-[54rem] grid-rows-[1fr_auto] transition duration-200",
          chatMenuOpen ? "pointer-events-none select-none opacity-70" : ""
        )}
      >
        <AgentCreateConversationBody
          activeThinkingStep={activeThinkingStep}
          activeThreadId={activeThreadId}
          emptyLabel={`Start a new Create chat in ${activeWorkspace?.name ?? "this workspace"}.`}
          hasQueuedTools={hasQueuedTools}
          hasUnreadyOutputs={hasUnreadyOutputs}
          isContinuing={isContinuing}
          isLoading={Boolean(activeThreadId) && messages === undefined}
          onArtifactDownload={(artifact) => {
            void exportArtifact(artifact);
          }}
          onArtifactOpen={openArtifact}
          onArtifactOpenStudio={openArtifactInStudio}
          onArtifactSave={(artifact) => {
            void saveArtifactToLibrary(artifact);
          }}
          onContinue={() => {
            void continueQueuedTools();
          }}
          onRevisionChange={(checkpointId, value) => {
            setCheckpointRevisionNotes((current) => ({
              ...current,
              [checkpointId]: value,
            }));
          }}
          onSetCheckpointStatus={(checkpoint, status, response) => {
            void setCheckpointStatus(checkpoint, status, response);
          }}
          openCheckpoints={openCheckpoints}
          pendingCheckpointId={pendingCheckpointId}
          revisionNotes={checkpointRevisionNotes}
          showActivity={showActivity}
          showThinkingPlaceholder={showThinkingPlaceholder}
          visibleMessages={visibleMessages}
          workingMessageId={workingMessageId}
        />

        <AgentCreateComposerDock
          checkpointMode={checkpointMode}
          isStopping={isStopping}
          isSubmitting={isSubmitting}
          isWorking={Boolean(activeThreadId && showActivity)}
          mentionOptions={mentionOptions}
          onChange={handlePromptChange}
          onCheckpointModeChange={setCheckpointMode}
          onMentionSelect={handleMentionSelect}
          onPasteFiles={handlePastedReferenceFiles}
          onStop={() => {
            void stopActiveThread();
          }}
          onSubmit={() => {
            void submitMessage();
          }}
          prompt={prompt}
          selectedMentions={selectedMentions}
          statusMessage={statusMessage}
        />
      </section>
    </section>
  );
}
