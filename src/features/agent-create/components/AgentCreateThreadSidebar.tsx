import {
  Check,
  PanelLeft,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { agentCreateClassNames } from "../model/agentCreateUi";

type CreateThreadId = Id<"createThreads">;

type AgentCreateThreadSummary = {
  _id: CreateThreadId;
  title?: string;
};

type AgentCreateThreadSidebarProps = {
  activeThreadId: CreateThreadId | null;
  chatMenuOpen: boolean;
  confirmingDeleteThreadId: CreateThreadId | null;
  deletingThreadId: CreateThreadId | null;
  editingThreadId: CreateThreadId | null;
  editingThreadTitle: string;
  isSubmitting: boolean;
  renamingThreadId: CreateThreadId | null;
  threads?: AgentCreateThreadSummary[];
  onCancelDelete: () => void;
  onCancelRename: () => void;
  onDeleteThread: (threadId: CreateThreadId) => void;
  onEditingThreadTitleChange: (title: string) => void;
  onNewThread: () => void;
  onRenameThread: () => void;
  onSelectThread: (threadId: CreateThreadId) => void;
  onStartDelete: (threadId: CreateThreadId) => void;
  onStartRename: (threadId: CreateThreadId, title: string | undefined) => void;
  onToggleOpen: (open: boolean) => void;
};

export function AgentCreateThreadSidebar({
  activeThreadId,
  chatMenuOpen,
  confirmingDeleteThreadId,
  deletingThreadId,
  editingThreadId,
  editingThreadTitle,
  isSubmitting,
  renamingThreadId,
  threads,
  onCancelDelete,
  onCancelRename,
  onDeleteThread,
  onEditingThreadTitleChange,
  onNewThread,
  onRenameThread,
  onSelectThread,
  onStartDelete,
  onStartRename,
  onToggleOpen,
}: AgentCreateThreadSidebarProps) {
  return (
    <>
      <button
        aria-expanded={chatMenuOpen}
        aria-label={chatMenuOpen ? "Close chats" : "Open chats"}
        className="fixed left-[calc(13.5rem+var(--space-2))] top-[var(--space-2)] z-[60] grid size-10 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-lg)] transition hover:bg-[var(--color-page-quiet)] max-[900px]:left-[var(--space-2)]"
        onClick={() => onToggleOpen(!chatMenuOpen)}
        type="button"
      >
        <PanelLeft size={17} />
      </button>

      {chatMenuOpen ? (
        <button
          aria-label="Close chats"
          className="fixed bottom-0 left-[13.5rem] right-0 top-0 z-40 cursor-default bg-[oklch(12%_0.025_232_/_0.16)] backdrop-blur-[1px] max-[900px]:left-0"
          onClick={() => onToggleOpen(false)}
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
                onNewThread();
                onToggleOpen(false);
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
                {threads.map((thread) => (
                  <AgentCreateThreadSidebarItem
                    active={thread._id === activeThreadId}
                    editingTitle={editingThreadTitle}
                    isConfirmingDelete={confirmingDeleteThreadId === thread._id}
                    isDeleting={deletingThreadId === thread._id}
                    isEditing={editingThreadId === thread._id}
                    isRenaming={renamingThreadId === thread._id}
                    key={thread._id}
                    onCancelDelete={onCancelDelete}
                    onCancelRename={onCancelRename}
                    onDelete={() => onDeleteThread(thread._id)}
                    onEditingTitleChange={onEditingThreadTitleChange}
                    onRename={onRenameThread}
                    onSelect={() => {
                      onSelectThread(thread._id);
                      onToggleOpen(false);
                    }}
                    onStartDelete={() => onStartDelete(thread._id)}
                    onStartRename={() => onStartRename(thread._id, thread.title)}
                    thread={thread}
                  />
                ))}
              </div>
            ) : (
              <p className="m-0 px-[var(--space-3)] py-[var(--space-4)] text-[0.82rem] text-[var(--color-ink-muted)]">
                No chats yet.
              </p>
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}

function AgentCreateThreadSidebarItem({
  active,
  editingTitle,
  isConfirmingDelete,
  isDeleting,
  isEditing,
  isRenaming,
  thread,
  onCancelDelete,
  onCancelRename,
  onDelete,
  onEditingTitleChange,
  onRename,
  onSelect,
  onStartDelete,
  onStartRename,
}: {
  active: boolean;
  editingTitle: string;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
  isEditing: boolean;
  isRenaming: boolean;
  thread: AgentCreateThreadSummary;
  onCancelDelete: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onEditingTitleChange: (title: string) => void;
  onRename: () => void;
  onSelect: () => void;
  onStartDelete: () => void;
  onStartRename: () => void;
}) {
  if (isConfirmingDelete) {
    return (
      <div className="grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-[0.55rem] bg-[var(--color-danger-soft)] px-2">
        <span className="min-w-0 truncate text-[0.8rem] font-[760] text-[var(--color-danger)]">
          Delete this chat?
        </span>
        <button
          className="inline-flex min-h-8 items-center rounded-full px-2 text-[0.76rem] font-[780] text-[var(--color-danger)] transition hover:bg-[oklch(100%_0_0_/_0.5)] disabled:cursor-not-allowed disabled:opacity-55"
          disabled={isDeleting}
          onClick={onDelete}
          type="button"
        >
          Delete
        </button>
        <button
          aria-label="Cancel delete"
          className="grid size-8 place-items-center rounded-full text-[var(--color-ink-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-55"
          disabled={isDeleting}
          onClick={onCancelDelete}
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
        onSubmit={(event) => {
          event.preventDefault();
          onRename();
        }}
      >
        <input
          aria-label="Chat name"
          autoFocus
          className="min-h-9 min-w-0 rounded-[0.45rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[0.82rem] font-[720] text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
          disabled={isRenaming}
          onChange={(event) => onEditingTitleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancelRename();
          }}
          value={editingTitle}
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
          onClick={onCancelRename}
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
    >
      <button
        className="min-h-11 min-w-0 truncate px-[var(--space-3)] text-left text-[0.82rem] font-[720]"
        onClick={onSelect}
        type="button"
      >
        {thread.title ?? "New Chat"}
      </button>
      <button
        aria-label="Rename chat"
        className="grid size-8 place-items-center rounded-full text-[var(--color-ink-muted)] opacity-80 transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
        onClick={onStartRename}
        type="button"
      >
        <Pencil size={14} />
      </button>
      <button
        aria-label="Delete chat"
        className="mr-1 grid size-8 place-items-center rounded-full text-[var(--color-ink-muted)] opacity-80 transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
        onClick={onStartDelete}
        type="button"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
