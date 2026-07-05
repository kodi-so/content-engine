import { AgentCreateMessageList } from "./AgentCreateMessageList";
import { AgentCreatePrompt } from "./AgentCreatePrompt";
import { CheckpointPrompt } from "./CheckpointPrompt";
import type { RichMentionToken } from "../../../components/references/RichMentionTextarea";
import type {
  AgentCreateArtifact,
  AgentCreateCheckpoint,
  AgentCreateCheckpointMode,
  AgentCreateMentionOption,
  AgentCreateMessage,
  AgentCreateSelectedMention,
  AgentCreateToolProgressStep,
} from "../model/agentCreateTypes";

export function AgentCreateConversationBody({
  activeThinkingStep,
  activeThreadId,
  emptyLabel,
  hasQueuedTools,
  hasUnreadyOutputs,
  isContinuing,
  isLoading,
  openCheckpoints,
  pendingCheckpointId,
  revisionNotes,
  showActivity,
  showThinkingPlaceholder,
  visibleMessages,
  workingMessageId,
  onArtifactDownload,
  onArtifactOpen,
  onArtifactOpenStudio,
  onArtifactSave,
  onContinue,
  onRevisionChange,
  onSetCheckpointStatus,
}: {
  activeThinkingStep?: AgentCreateToolProgressStep;
  activeThreadId: string | null;
  emptyLabel: string;
  hasQueuedTools: boolean;
  hasUnreadyOutputs: boolean;
  isContinuing: boolean;
  isLoading: boolean;
  openCheckpoints: AgentCreateCheckpoint[];
  pendingCheckpointId: string | null;
  revisionNotes: Record<string, string>;
  showActivity: boolean;
  showThinkingPlaceholder: boolean;
  visibleMessages: AgentCreateMessage[];
  workingMessageId?: string;
  onArtifactDownload: (artifact: AgentCreateArtifact) => void;
  onArtifactOpen: (artifact: AgentCreateArtifact) => void;
  onArtifactOpenStudio: (artifact: AgentCreateArtifact) => void;
  onArtifactSave: (artifact: AgentCreateArtifact) => void;
  onContinue: () => void;
  onRevisionChange: (checkpointId: string, value: string) => void;
  onSetCheckpointStatus: (
    checkpoint: AgentCreateCheckpoint,
    status: "approved" | "rejected" | "revised",
    response?: string
  ) => void;
}) {
  return (
    <div className="grid min-w-0 content-start gap-[var(--space-6)] pb-[13rem] pt-[var(--space-4)]">
      <AgentCreateMessageList
        activeThinkingStep={activeThinkingStep}
        emptyLabel={emptyLabel}
        isLoading={isLoading}
        messages={visibleMessages}
        onArtifactDownload={onArtifactDownload}
        onArtifactOpen={onArtifactOpen}
        onArtifactOpenStudio={onArtifactOpenStudio}
        onArtifactSave={onArtifactSave}
        showThinkingPlaceholder={showThinkingPlaceholder}
        threadKey={activeThreadId}
        workingMessageId={workingMessageId}
      />
      {hasQueuedTools && !openCheckpoints.length && !hasUnreadyOutputs && !showActivity ? (
        <button
          className="secondary-button justify-self-start"
          disabled={isContinuing}
          onClick={onContinue}
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
          onApprove={(selectedCheckpoint) => onSetCheckpointStatus(selectedCheckpoint, "approved")}
          onReject={(selectedCheckpoint) => onSetCheckpointStatus(selectedCheckpoint, "rejected")}
          onRevise={(selectedCheckpoint, instructions) =>
            onSetCheckpointStatus(selectedCheckpoint, "revised", instructions)
          }
          onRevisionChange={(value) => onRevisionChange(checkpoint.id, value)}
          revisionValue={revisionNotes[checkpoint.id] ?? ""}
        />
      ))}
    </div>
  );
}

export function AgentCreateComposerDock({
  checkpointMode,
  costTotalLabel,
  isStopping,
  isSubmitting,
  isWorking,
  mentionOptions,
  prompt,
  selectedMentions,
  statusMessage,
  onChange,
  onCheckpointModeChange,
  onMentionSelect,
  onPasteFiles,
  onStop,
  onSubmit,
}: {
  checkpointMode: AgentCreateCheckpointMode;
  costTotalLabel?: string;
  isStopping: boolean;
  isSubmitting: boolean;
  isWorking: boolean;
  mentionOptions: AgentCreateMentionOption[];
  prompt: string;
  selectedMentions: AgentCreateSelectedMention[];
  statusMessage: string;
  onChange: (value: string) => void;
  onCheckpointModeChange: (mode: AgentCreateCheckpointMode) => void;
  onMentionSelect: (mention: AgentCreateSelectedMention) => void;
  onPasteFiles: (files: File[]) => Promise<RichMentionToken[]> | RichMentionToken[];
  onStop: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-[13.5rem] right-0 z-30 bg-[linear-gradient(to_top,var(--color-page)_84%,var(--color-page)_68%,oklch(97%_0.02_230_/_0))] px-[clamp(1.25rem,2.5vw,2.75rem)] pb-[calc(env(safe-area-inset-bottom)+var(--space-2))] pt-[var(--space-8)] max-[900px]:left-0 max-[900px]:px-[var(--space-4)] max-[560px]:px-[var(--space-3)]">
      <div className="mx-auto grid w-full max-w-[54rem] gap-[var(--space-2)]">
        {costTotalLabel ? (
          <p className="m-0 justify-self-start rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-1 text-[0.74rem] font-[740] text-[var(--color-ink-muted)] shadow-[var(--shadow-sm)]">
            Generation cost this thread: {costTotalLabel}
          </p>
        ) : null}
        <AgentCreatePrompt
          checkpointMode={checkpointMode}
          disabled={isSubmitting}
          isStopping={isStopping}
          isSubmitting={isSubmitting}
          isWorking={isWorking}
          mentionOptions={mentionOptions}
          onChange={onChange}
          onCheckpointModeChange={onCheckpointModeChange}
          onMentionSelect={(selection) => onMentionSelect(selection.mention)}
          onPasteFiles={onPasteFiles}
          onStop={onStop}
          onSubmit={onSubmit}
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
  );
}
