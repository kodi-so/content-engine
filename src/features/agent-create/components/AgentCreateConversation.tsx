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
  AgentCreateUsageItem,
  AgentCreateUsageSummary,
} from "../model/agentCreateTypes";
import { formatAgentCreateCost } from "../model/agentCreateToolProgress";

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
  checkpointUsageItems,
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
  checkpointUsageItems?: AgentCreateUsageItem[];
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
          usageItems={checkpointUsageItems}
        />
      ))}
    </div>
  );
}

export function AgentCreateComposerDock({
  checkpointMode,
  usageSummary,
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
  usageSummary?: AgentCreateUsageSummary | null;
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
        {usageSummary && usageSummary.totalCostUsd > 0 ? (
          <details className="group justify-self-start text-[0.74rem] text-[var(--color-ink-muted)]">
            <summary className="cursor-pointer list-none px-1 py-0.5 font-[720] marker:hidden">
              Usage · {usageSummary.actualCostUsd > 0
                ? `${formatAgentCreateCost(usageSummary.actualCostUsd)} spent`
                : "Nothing charged yet"}
              {usageSummary.outstandingEstimatedCostUsd > 0
                ? ` · ~${formatAgentCreateCost(usageSummary.totalCostUsd)} total`
                : ""}
            </summary>
            <div className="mt-1 grid max-h-44 min-w-[22rem] gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-2)] shadow-[var(--shadow-sm)] max-[560px]:min-w-[calc(100vw-2rem)]">
              {usageSummary.items.map((item) => {
                const displayedCost = item.actualCostUsd ?? item.estimatedCostUsd;
                if (displayedCost === undefined && item.outstandingEstimatedCostUsd <= 0) return null;
                return (
                  <div className="flex min-w-0 items-center justify-between gap-4 px-1 py-0.5" key={item.operationKey}>
                    <span className="min-w-0 truncate">{item.label} · {item.modelId}</span>
                    <span className="shrink-0 font-[720] text-[var(--color-ink)]">
                      {item.actualCostUsd !== undefined
                        ? formatAgentCreateCost(item.actualCostUsd)
                        : `~${formatAgentCreateCost(displayedCost ?? 0)}`}
                      {item.actualCostUsd !== undefined && item.outstandingEstimatedCostUsd > 0
                        ? ` + ~${formatAgentCreateCost(item.outstandingEstimatedCostUsd)}`
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
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
