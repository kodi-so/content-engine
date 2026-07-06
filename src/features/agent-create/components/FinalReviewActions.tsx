import {
  Clapperboard,
  Download,
  Library,
  MessageSquareText,
  Radio,
  Repeat,
  WandSparkles,
} from "lucide-react";
import { LoadingSignal } from "../../../components/ui";
import type { AgentCreateFinalReviewAction } from "../model/agentCreateTypes";

export function FinalReviewActions({
  artifactCount = 1,
  disabled = false,
  isPending = false,
  onExport,
  onOpenStudio,
  onPublish,
  onRequestRender,
  onRevise,
  onRevisionChange,
  onSave,
  onTurnIntoAutomation,
  pendingAction,
  revisionValue = "",
}: {
  artifactCount?: number;
  disabled?: boolean;
  isPending?: boolean;
  onExport?: () => void;
  onOpenStudio?: () => void;
  onPublish?: () => void;
  onRequestRender?: () => void;
  onRevise?: (instructions: string) => void;
  onRevisionChange?: (value: string) => void;
  onSave?: () => void;
  onTurnIntoAutomation?: () => void;
  pendingAction?: AgentCreateFinalReviewAction;
  revisionValue?: string;
}) {
  const canRevise = Boolean(onRevise && revisionValue.trim());

  return (
    <section className="grid min-w-0 gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]">
      <div className="grid min-w-0 gap-[var(--space-1)]">
        <div className="entity-eyebrow">Final review</div>
        <h3 className="m-0 text-[1rem] font-[820] text-[var(--color-ink)]">
          {artifactCount === 1 ? "Output is ready" : `${artifactCount} outputs are ready`}
        </h3>
        <p className="m-0 text-[0.84rem] leading-[1.45] text-[var(--color-ink-muted)]">
          Review the result before saving, exporting, or preparing it for distribution.
        </p>
      </div>

      {onRevise ? (
        <label className="grid min-w-0 gap-[var(--space-2)]">
          <span className="text-[0.74rem] font-[780] text-[var(--color-ink-soft)]">
            Revision instructions
          </span>
          <textarea
            className="min-h-[5.5rem] w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-3)] py-[var(--space-2)] text-[0.88rem] leading-[1.45] text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_oklch(57%_0.14_166_/_0.13)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled || isPending}
            onChange={(event) => onRevisionChange?.(event.target.value)}
            placeholder="Describe what should change."
            value={revisionValue}
          />
        </label>
      ) : null}

      <div className="flex flex-wrap gap-[var(--space-2)]">
        {onSave ? (
          <button
            className="primary-button"
            disabled={disabled || isPending}
            onClick={onSave}
            type="button"
          >
            {pendingAction === "save" ? <LoadingSignal label="Saving" size="sm" /> : <Library size={16} />}
            Save to Library
          </button>
        ) : null}
        {onRevise ? (
          <button
            className="secondary-button"
            disabled={disabled || isPending || !canRevise}
            onClick={() => onRevise(revisionValue.trim())}
            type="button"
          >
            {pendingAction === "revise" ? (
              <LoadingSignal label="Revising" size="sm" />
            ) : (
              <MessageSquareText size={16} />
            )}
            Revise
          </button>
        ) : null}
        {onOpenStudio ? (
          <button
            className="secondary-button"
            disabled={disabled || isPending}
            onClick={onOpenStudio}
            type="button"
          >
            <WandSparkles size={16} />
            Open in Studio
          </button>
        ) : null}
        {onExport ? (
          <button
            className="secondary-button"
            disabled={disabled || isPending}
            onClick={onExport}
            type="button"
          >
            {pendingAction === "export" ? <LoadingSignal label="Exporting" size="sm" /> : <Download size={16} />}
            Export
          </button>
        ) : null}
        {onRequestRender ? (
          <button
            className="secondary-button"
            disabled={disabled || isPending}
            onClick={onRequestRender}
            type="button"
          >
            {pendingAction === "request_render" ? (
              <LoadingSignal label="Requesting" size="sm" />
            ) : (
              <Clapperboard size={16} />
            )}
            Request Render
          </button>
        ) : null}
        {onPublish ? (
          <button
            className="secondary-button"
            disabled={disabled || isPending}
            onClick={onPublish}
            type="button"
          >
            <Radio size={16} />
            Publish Later
          </button>
        ) : null}
        {onTurnIntoAutomation ? (
          <button
            className="secondary-button"
            disabled={disabled || isPending}
            onClick={onTurnIntoAutomation}
            type="button"
          >
            {pendingAction === "turn_into_automation" ? (
              <LoadingSignal label="Starting" size="sm" />
            ) : (
              <Repeat size={16} />
            )}
            Turn into automation
          </button>
        ) : null}
      </div>
    </section>
  );
}
