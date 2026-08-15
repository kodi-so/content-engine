import { ArrowUpRight, FileText, Trash2, X } from "lucide-react";
import type { LibraryTextDraft } from "./libraryTypes";

function draftTypeLabel(type: LibraryTextDraft["type"]) {
  return type.replace(/_/g, " ");
}

function reviewStatusLabel(status: LibraryTextDraft["reviewStatus"]) {
  if (status === "pending") return "Pending review";
  if (status === "needs_revision") return "Needs revision";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Draft";
}

function createdAtLabel(value: number) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function LibraryTextDraftRow({
  draft,
  isDeleting,
  onDelete,
  onOpen,
}: {
  draft: LibraryTextDraft;
  isDeleting: boolean;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="group flex min-w-0 items-start gap-[var(--space-3)] px-[var(--space-2)] py-[var(--space-3)] transition-colors hover:bg-[var(--color-page-quiet)]">
      <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-page-quiet)] text-[var(--color-ink-soft)]">
        <FileText size={17} />
      </div>
      <button
        className="grid min-w-0 flex-1 gap-1 border-0 bg-transparent p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        onClick={onOpen}
        type="button"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-[var(--space-2)] gap-y-1">
          <span className="truncate text-[0.92rem] font-[760] text-[var(--color-ink)]">
            {draft.title}
          </span>
          <span className="text-[0.68rem] font-[760] uppercase tracking-[0.08em] text-[var(--color-primary-strong)]">
            {reviewStatusLabel(draft.reviewStatus)}
          </span>
        </span>
        <span className="overflow-hidden text-[0.8rem] leading-relaxed text-[var(--color-ink-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {draft.text}
        </span>
        <span className="text-[0.72rem] text-[var(--color-ink-muted)]">
          {draftTypeLabel(draft.type)} · {createdAtLabel(draft.createdAt)}
          {draft.model ? ` · ${draft.model}` : ""}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <button
          aria-label={`Review ${draft.title}`}
          className="icon-button"
          onClick={onOpen}
          title="Review draft"
          type="button"
        >
          <ArrowUpRight size={16} />
        </button>
        <button
          aria-label={`Delete ${draft.title}`}
          className="icon-button text-[var(--color-danger)]"
          disabled={isDeleting}
          onClick={onDelete}
          title="Delete draft"
          type="button"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

export function LibraryTextDraftModal({
  draft,
  onClose,
}: {
  draft: LibraryTextDraft;
  onClose: () => void;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-[var(--space-4)]"
      role="dialog"
    >
      <section className="grid max-h-[min(92vh,54rem)] w-[min(100%,48rem)] grid-rows-[auto_1fr_auto] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]">
        <header className="flex items-start justify-between gap-[var(--space-4)] border-b border-[var(--color-border)] px-[var(--space-4)] py-[var(--space-3)]">
          <div className="grid min-w-0 gap-1">
            <p className="entity-eyebrow m-0">{draftTypeLabel(draft.type)}</p>
            <h2 className="m-0 text-[1.15rem] font-[780] leading-tight text-[var(--color-ink)]">
              {draft.title}
            </h2>
            <p className="m-0 text-[0.76rem] text-[var(--color-ink-muted)]">
              {reviewStatusLabel(draft.reviewStatus)} · {createdAtLabel(draft.createdAt)}
              {draft.provider ? ` · ${draft.provider}` : ""}
              {draft.model ? ` · ${draft.model}` : ""}
            </p>
          </div>
          <button aria-label="Close draft" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>

        <div className="overflow-auto px-[var(--space-4)] py-[var(--space-4)]">
          <div className="whitespace-pre-wrap break-words text-[0.92rem] leading-[1.7] text-[var(--color-ink)]">
            {draft.text}
          </div>
          {draft.prompt ? (
            <details className="mt-[var(--space-5)] border-t border-[var(--color-border)] pt-[var(--space-3)] text-[0.78rem] text-[var(--color-ink-muted)]">
              <summary className="cursor-pointer font-[720] text-[var(--color-ink-soft)]">
                Generation prompt
              </summary>
              <p className="m-0 mt-[var(--space-2)] whitespace-pre-wrap leading-relaxed">
                {draft.prompt}
              </p>
            </details>
          ) : null}
        </div>

        <footer className="flex justify-end border-t border-[var(--color-border)] px-[var(--space-4)] py-[var(--space-3)]">
          <button className="primary-button" onClick={onClose} type="button">
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
