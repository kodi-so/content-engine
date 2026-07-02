import { Check, MessageSquareText, X } from "lucide-react";
import { LoadingSignal } from "../../components/ui";
import { AgentCreateArtifactGrid } from "./AgentCreateArtifactCard";
import type { AgentCreateCheckpoint } from "./agentCreateTypes";

type SlideshowPromptReviewItem = {
  slideIndex: number;
  prompt: string;
  textBlocks: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function slideshowPromptReviewItems(data: unknown): SlideshowPromptReviewItem[] {
  if (!isRecord(data) || data.kind !== "slideshow_prompt_review" || !Array.isArray(data.prompts)) {
    return [];
  }

  return data.prompts.flatMap((item) => {
    if (!isRecord(item) || typeof item.prompt !== "string") return [];
    return [{
      slideIndex: typeof item.slideIndex === "number" ? item.slideIndex : 0,
      prompt: item.prompt,
      textBlocks: Array.isArray(item.textBlocks)
        ? item.textBlocks.filter((text): text is string => typeof text === "string" && Boolean(text.trim()))
        : [],
    }];
  });
}

export function CheckpointPrompt({
  checkpoint,
  disabled = false,
  isPending = false,
  onApprove,
  onReject,
  onRevise,
  onRevisionChange,
  revisionValue = "",
}: {
  checkpoint: AgentCreateCheckpoint;
  disabled?: boolean;
  isPending?: boolean;
  onApprove: (checkpoint: AgentCreateCheckpoint) => void;
  onReject?: (checkpoint: AgentCreateCheckpoint) => void;
  onRevise?: (checkpoint: AgentCreateCheckpoint, instructions: string) => void;
  onRevisionChange?: (value: string) => void;
  revisionValue?: string;
}) {
  const canRevise = Boolean(onRevise && revisionValue.trim());
  const slideshowPrompts = slideshowPromptReviewItems(checkpoint.data);

  return (
    <section className="grid min-w-0 gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[oklch(70%_0.105_155_/_0.45)] bg-[oklch(97%_0.025_155)] p-[var(--space-4)]">
      <div className="grid min-w-0 gap-[var(--space-1)]">
        <div className="entity-eyebrow">Checkpoint</div>
        <h3 className="m-0 text-[1rem] font-[820] text-[var(--color-ink)]">
          {checkpoint.label}
        </h3>
        <p className="m-0 text-[0.86rem] leading-[1.5] text-[var(--color-ink-muted)]">
          {checkpoint.message}
        </p>
      </div>

      {checkpoint.artifacts?.length ? (
        <AgentCreateArtifactGrid artifacts={checkpoint.artifacts} />
      ) : null}

      {slideshowPrompts.length ? (
        <div className="grid min-w-0 gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[oklch(78%_0.08_155_/_0.48)] bg-white/70 p-[var(--space-3)]">
          <div className="text-[0.74rem] font-[820] uppercase tracking-[0.04em] text-[var(--color-ink-soft)]">
            Image prompts
          </div>
          <div className="grid min-w-0 gap-[var(--space-2)]">
            {slideshowPrompts.map((item, index) => (
              <div
                className="flex min-w-0 gap-3 border-b border-[var(--color-border-subtle)] pb-[var(--space-3)] last:border-b-0 last:pb-0"
                key={`${item.slideIndex || index}:${item.prompt.slice(0, 32)}`}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[oklch(90%_0.06_155)] text-[0.72rem] font-[820] text-[var(--color-ink)]">
                  {item.slideIndex || index + 1}
                </span>
                <div className="grid min-w-0 gap-2">
                  {item.textBlocks.length ? (
                    <div className="grid min-w-0 gap-1">
                      <div className="text-[0.68rem] font-[820] uppercase tracking-[0.04em] text-[var(--color-ink-soft)]">
                        Text overlays
                      </div>
                      <div className="grid min-w-0 gap-1">
                        {item.textBlocks.map((text, textIndex) => (
                          <p
                            className="m-0 whitespace-pre-wrap rounded-[var(--radius-xs)] bg-[oklch(98%_0.01_155)] px-2 py-1.5 text-[0.82rem] font-[680] leading-[1.35] text-[var(--color-ink)]"
                            key={`${item.slideIndex || index}:text:${textIndex}`}
                          >
                            {text}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid min-w-0 gap-1">
                    <div className="text-[0.68rem] font-[820] uppercase tracking-[0.04em] text-[var(--color-ink-soft)]">
                      Image prompt
                    </div>
                    <p className="m-0 whitespace-pre-wrap text-[0.82rem] leading-[1.45] text-[var(--color-ink-muted)]">
                      {item.prompt}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {onRevise ? (
        <label className="grid min-w-0 gap-[var(--space-2)]">
          <span className="text-[0.74rem] font-[780] text-[var(--color-ink-soft)]">
            Revision notes
          </span>
          <textarea
            className="min-h-[5.5rem] w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-[0.88rem] leading-[1.45] text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_oklch(57%_0.14_166_/_0.13)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled || isPending}
            onChange={(event) => onRevisionChange?.(event.target.value)}
            placeholder="Ask for changes before the agent continues."
            value={revisionValue}
          />
        </label>
      ) : null}

      <div className="flex flex-wrap gap-[var(--space-2)]">
        <button
          className="primary-button"
          disabled={disabled || isPending}
          onClick={() => onApprove(checkpoint)}
          type="button"
        >
          {isPending ? <LoadingSignal label="Approving" size="sm" /> : <Check size={16} />}
          Approve
        </button>
        {onRevise ? (
          <button
            className="secondary-button"
            disabled={disabled || isPending || !canRevise}
            onClick={() => onRevise(checkpoint, revisionValue.trim())}
            type="button"
          >
            <MessageSquareText size={16} />
            Revise
          </button>
        ) : null}
        {onReject ? (
          <button
            className="secondary-button text-[var(--color-danger)]"
            disabled={disabled || isPending}
            onClick={() => onReject(checkpoint)}
            type="button"
          >
            <X size={16} />
            Stop
          </button>
        ) : null}
      </div>
    </section>
  );
}
