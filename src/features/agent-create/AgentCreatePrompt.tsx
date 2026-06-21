import {
  AtSign,
  Bug,
  Image,
  Mic,
  Paperclip,
  Send,
  Square,
  UserRound,
  Video,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  AgentCreateCheckpointMode,
  AgentCreateMentionMediaType,
  AgentCreateMentionOption,
  AgentCreateSelectedMention,
} from "./agentCreateTypes";
import {
  agentCreateClassNames,
  formatAgentCreateEntityType,
  mentionTokenForLabel,
} from "./agentCreateUi";

type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

type MentionSelection = {
  mention: AgentCreateSelectedMention;
  option: AgentCreateMentionOption;
  range: {
    end: number;
    start: number;
  };
};

const mentionMediaIcons: Record<AgentCreateMentionMediaType, typeof Image> = {
  audio: Mic,
  file: Paperclip,
  image: Image,
  video: Video,
};

function mentionAtCursor(value: string, selectionStart: number): ActiveMention | null {
  const beforeCursor = value.slice(0, selectionStart);
  const match = beforeCursor.match(/(^|[\s([{])@([a-zA-Z0-9_-]*)$/);
  if (!match) return null;

  return {
    start: selectionStart - match[2].length - 1,
    end: selectionStart,
    query: match[2].toLowerCase(),
  };
}

function optionMatchesQuery(option: AgentCreateMentionOption, query: string) {
  if (!query) return true;

  return [
    option.label,
    option.description,
    option.sourceLabel,
    option.mediaType,
    formatAgentCreateEntityType(option.entityType),
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(query));
}

function uniqueMentionOptions(options: AgentCreateMentionOption[]) {
  const seen = new Set<string>();

  return options.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

export function AgentCreatePrompt({
  className,
  checkpointMode = "debug",
  disabled = false,
  isSubmitting = false,
  isStopping = false,
  isWorking = false,
  mentionOptions = [],
  onChange,
  onCheckpointModeChange,
  onMentionRemove,
  onMentionSelect,
  onStop,
  onSubmit,
  placeholder = "Describe what you want to create",
  selectedMentions = [],
  submitLabel = "Send",
  value,
}: {
  className?: string;
  checkpointMode?: AgentCreateCheckpointMode;
  disabled?: boolean;
  isSubmitting?: boolean;
  isStopping?: boolean;
  isWorking?: boolean;
  mentionOptions?: AgentCreateMentionOption[];
  onChange: (value: string) => void;
  onCheckpointModeChange?: (mode: AgentCreateCheckpointMode) => void;
  onMentionRemove?: (mention: AgentCreateSelectedMention) => void;
  onMentionSelect?: (selection: MentionSelection) => void;
  onStop?: () => void;
  onSubmit?: () => void;
  placeholder?: string;
  selectedMentions?: AgentCreateSelectedMention[];
  submitLabel?: string;
  value: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const availableOptions = useMemo(() => uniqueMentionOptions(mentionOptions), [mentionOptions]);
  const filteredOptions = useMemo(
    () =>
      activeMention
        ? availableOptions.filter((option) => optionMatchesQuery(option, activeMention.query))
        : [],
    [activeMention, availableOptions]
  );
  const showMentionMenu = Boolean(activeMention && filteredOptions.length);
  const canStop = isWorking && !isStopping && Boolean(onStop);
  const canSubmit = Boolean(value.trim()) && !disabled && !isSubmitting && !isWorking;
  const debugMode = checkpointMode === "debug";

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeMention?.query, filteredOptions.length]);

  const refreshMention = (textarea: HTMLTextAreaElement) => {
    setActiveMention(mentionAtCursor(textarea.value, textarea.selectionStart));
  };

  const insertMention = (option: AgentCreateMentionOption) => {
    if (!activeMention || option.disabled) return;

    const token = option.token ?? mentionTokenForLabel(option.label);
    const nextCharacter = value.slice(activeMention.end, activeMention.end + 1);
    const needsSpace = nextCharacter && !/\s/.test(nextCharacter);
    const nextValue =
      value.slice(0, activeMention.start) +
      token +
      (needsSpace ? " " : "") +
      value.slice(activeMention.end);
    const nextCursor = activeMention.start + token.length + (needsSpace ? 1 : 0);
    const mention: AgentCreateSelectedMention = {
      token,
      label: option.label,
      entityType: option.entityType,
      entityId: option.id,
      mediaType: option.mediaType,
    };

    onChange(nextValue);
    onMentionSelect?.({
      mention,
      option,
      range: {
        start: activeMention.start,
        end: activeMention.end,
      },
    });
    setActiveMention(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    onSubmit?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % filteredOptions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index === 0 ? filteredOptions.length - 1 : index - 1));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(filteredOptions[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveMention(null);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
    refreshMention(event.currentTarget);
  };

  return (
    <form
      className={agentCreateClassNames(
        "grid min-w-0 gap-[var(--space-2)] rounded-[1.15rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-2)] shadow-[var(--shadow-lg)]",
        className
      )}
      onSubmit={handleSubmit}
    >
      <label className="grid min-w-0 gap-[var(--space-1)]">
        <span className="sr-only">{placeholder}</span>
        <div className="relative min-w-0">
          <textarea
            className="max-h-[15rem] min-h-[3.35rem] w-full resize-none overflow-y-auto rounded-[0.9rem] border-0 bg-[var(--color-page-quiet)] px-[var(--space-3)] py-[var(--space-2)] pr-[3.25rem] text-[0.92rem] leading-[1.45] text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-ink-muted)] focus:bg-[var(--color-page)] focus:shadow-[0_0_0_2px_oklch(57%_0.14_166_/_0.16)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            onBlur={() => window.setTimeout(() => setActiveMention(null), 120)}
            onChange={(event) => {
              onChange(event.target.value);
              refreshMention(event.target);
            }}
            onClick={(event) => refreshMention(event.currentTarget)}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            placeholder={placeholder}
            ref={textareaRef}
            value={value}
          />
          {showMentionMenu ? (
            <div
              className="absolute bottom-[calc(100%+0.55rem)] left-2 z-30 grid max-h-72 w-[min(30rem,calc(100%-1rem))] overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-1)] shadow-[var(--shadow-lg)]"
              role="listbox"
            >
              {filteredOptions.map((option, index) => {
                const Icon = option.mediaType ? mentionMediaIcons[option.mediaType] : UserRound;
                const active = index === activeIndex;

                return (
                  <button
                    aria-selected={active}
                    className={agentCreateClassNames(
                      "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-[var(--space-2)] rounded-[var(--radius-xs)] px-[var(--space-2)] py-[var(--space-2)] text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                      active ? "bg-[var(--color-primary-soft)]" : "hover:bg-[var(--color-page-quiet)]"
                    )}
                    disabled={option.disabled}
                    key={option.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertMention(option);
                    }}
                    role="option"
                    type="button"
                  >
                    {option.thumbnailUrl ? (
                      <img
                        alt=""
                        className="size-9 rounded-[var(--radius-xs)] object-cover"
                        src={option.thumbnailUrl}
                      />
                    ) : (
                      <span className="grid size-9 place-items-center rounded-[var(--radius-xs)] border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-primary)]">
                        <Icon size={16} />
                      </span>
                    )}
                    <span className="grid min-w-0 gap-[0.08rem]">
                      <span className="truncate text-[0.84rem] font-[780] text-[var(--color-ink)]">
                        {option.label}
                      </span>
                      <span className="truncate text-[0.72rem] text-[var(--color-ink-muted)]">
                        {option.sourceLabel ?? formatAgentCreateEntityType(option.entityType)}
                        {option.description ? ` - ${option.description}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </label>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-[var(--space-2)] px-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[var(--space-2)]">
          <button
            aria-pressed={debugMode}
            className={agentCreateClassNames(
              "inline-flex min-h-8 shrink-0 items-center gap-[0.4rem] rounded-full border px-[var(--space-2)] text-[0.73rem] font-[760] transition",
              debugMode
                ? "border-[oklch(72%_0.14_156_/_0.45)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                : "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            )}
            disabled={disabled || isSubmitting}
            onClick={() => onCheckpointModeChange?.(debugMode ? "auto" : "debug")}
            title={debugMode ? "Debug Mode pauses at checkpoints" : "Auto mode runs through to the result"}
            type="button"
          >
            <Bug size={13} />
            Debug
            <span
              className={agentCreateClassNames(
                "relative h-[1rem] w-[1.85rem] overflow-hidden rounded-full transition",
                debugMode ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
              )}
              aria-hidden="true"
            >
              <span
                className={agentCreateClassNames(
                  "absolute left-[0.125rem] top-[0.125rem] size-3 rounded-full bg-white transition-transform",
                  debugMode ? "translate-x-[0.85rem]" : "translate-x-0"
                )}
              />
            </span>
          </button>
          <span className="inline-flex items-center gap-[0.35rem] text-[0.73rem] font-[690] text-[var(--color-ink-muted)]">
            <AtSign size={14} />
            References
          </span>
          {selectedMentions.length ? (
            selectedMentions.map((mention) => (
              <span
                className="inline-flex min-h-8 max-w-full items-center gap-[0.35rem] rounded-full border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-2)] text-[0.76rem] font-[720] text-[var(--color-ink)]"
                key={`${mention.entityType}:${mention.entityId}:${mention.token}`}
              >
                <span className="max-w-[13rem] truncate">{mention.token}</span>
                {onMentionRemove ? (
                  <button
                    aria-label={`Remove ${mention.label}`}
                    className="grid size-5 place-items-center rounded-full text-[var(--color-ink-muted)] transition hover:bg-[var(--color-page-quiet)] hover:text-[var(--color-danger)]"
                    onClick={() => onMentionRemove(mention)}
                    type="button"
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </span>
            ))
          ) : (
            <span className="text-[0.73rem] text-[var(--color-ink-muted)]">
              Type @ for library assets, personas, or prior outputs.
            </span>
          )}
        </div>

        {isWorking ? (
          <button
            aria-label={isStopping ? "Stopping" : "Stop generation"}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-ink)] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canStop}
            onClick={onStop}
            title="Stop generation"
            type="button"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            aria-label={isSubmitting ? "Sending" : submitLabel}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSubmit}
            type="submit"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </form>
  );
}
