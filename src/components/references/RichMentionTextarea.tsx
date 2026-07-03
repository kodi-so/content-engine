import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AssetMentionChip } from "../../features/assets/AssetMentionChip";
import type { AssetPreviewItem } from "../../features/assets/assetTypes";
import {
  MentionAutocompleteMenu,
  mentionAtCursor,
  type ActiveMention,
  type MentionAutocompleteSelection,
} from "./MentionAutocomplete";

type RichMentionToken = {
  asset: AssetPreviewItem;
  meta?: string;
  token: string;
};

type DisplayMention = RichMentionToken & {
  displayIndex: number;
  externalEnd: number;
  externalStart: number;
};

type RichMentionTextareaProps<Option> = {
  className?: string;
  disabled?: boolean;
  emptyHint?: ReactNode;
  getReplacement: (option: Option, activeMention: ActiveMention) => string;
  menuClassName?: string;
  onChange: (value: string) => void;
  onSelect?: (selection: MentionAutocompleteSelection<Option>) => void;
  onSubmitShortcut?: () => void;
  optionKey: (option: Option) => string;
  optionMatchesQuery: (option: Option, query: string) => boolean;
  options: Option[];
  placeholder?: string;
  renderOption: (args: {
    active: boolean;
    index: number;
    option: Option;
    select: () => void;
  }) => ReactNode;
  showEmptyHint?: boolean;
  tokens?: RichMentionToken[];
  triggerChars?: string[];
  value: string;
};

const ATOMIC_MENTION_CHARACTER = "\uFFFC";
const controlKeys = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]);

function buildDisplayModel(value: string, tokens: RichMentionToken[]) {
  const tokenMap = new Map(
    tokens
      .filter((token) => token.token)
      .map((token) => [token.token, token])
  );
  const sortedTokens = Array.from(tokenMap.keys()).sort((a, b) => b.length - a.length);
  const mentionsByDisplayIndex = new Map<number, DisplayMention>();
  let displayValue = "";
  let externalCursor = 0;

  while (externalCursor < value.length) {
    const matchingToken = sortedTokens.find((token) => value.startsWith(token, externalCursor));

    if (matchingToken) {
      const token = tokenMap.get(matchingToken);
      if (token) {
        mentionsByDisplayIndex.set(displayValue.length, {
          ...token,
          displayIndex: displayValue.length,
          externalStart: externalCursor,
          externalEnd: externalCursor + matchingToken.length,
        });
        displayValue += ATOMIC_MENTION_CHARACTER;
        externalCursor += matchingToken.length;
        continue;
      }
    }

    displayValue += value[externalCursor];
    externalCursor += 1;
  }

  const displayToExternalOffset = (displayOffset: number) => {
    let externalOffset = 0;

    for (let displayIndex = 0; displayIndex < displayOffset; displayIndex += 1) {
      const mention = mentionsByDisplayIndex.get(displayIndex);
      externalOffset += mention ? mention.token.length : 1;
    }

    return externalOffset;
  };

  const expandDisplayValue = (nextDisplayValue: string) => {
    let nextValue = "";

    for (let displayIndex = 0; displayIndex < nextDisplayValue.length; displayIndex += 1) {
      const character = nextDisplayValue[displayIndex];

      if (character === ATOMIC_MENTION_CHARACTER) {
        const mention = mentionsByDisplayIndex.get(displayIndex);
        if (mention) nextValue += mention.token;
      } else {
        nextValue += character;
      }
    }

    return nextValue;
  };

  return {
    displayToExternalOffset,
    displayValue,
    expandDisplayValue,
    mentionsByDisplayIndex,
  };
}

function renderDisplaySegments(
  displayValue: string,
  mentionsByDisplayIndex: Map<number, DisplayMention>
) {
  const segments: Array<
    | { key: string; text: string; type: "text" }
    | { key: string; token: DisplayMention; type: "mention" }
  > = [];
  let textBuffer = "";
  let textStart = 0;

  const flushText = (nextIndex: number) => {
    if (!textBuffer) return;
    segments.push({
      key: `text-${textStart}`,
      text: textBuffer,
      type: "text",
    });
    textBuffer = "";
    textStart = nextIndex;
  };

  for (let index = 0; index < displayValue.length; index += 1) {
    const mention = mentionsByDisplayIndex.get(index);

    if (mention) {
      flushText(index);
      segments.push({
        key: `mention-${index}-${mention.token}`,
        token: mention,
        type: "mention",
      });
      textStart = index + 1;
      continue;
    }

    if (!textBuffer) textStart = index;
    textBuffer += displayValue[index];
  }

  flushText(displayValue.length);
  return segments;
}

export function RichMentionTextarea<Option>({
  className = "",
  disabled = false,
  emptyHint,
  getReplacement,
  menuClassName = "absolute left-3 top-[calc(100%-0.5rem)] z-30 grid max-h-56 w-[min(24rem,calc(100%-1.5rem))] overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-lg)]",
  onChange,
  onSelect,
  onSubmitShortcut,
  optionKey,
  optionMatchesQuery,
  options,
  placeholder,
  renderOption,
  showEmptyHint = false,
  tokens = [],
  triggerChars = ["@"],
  value,
}: RichMentionTextareaProps<Option>) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<number | null>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const displayModel = useMemo(() => buildDisplayModel(value, tokens), [tokens, value]);
  const displaySegments = useMemo(
    () =>
      renderDisplaySegments(
        displayModel.displayValue,
        displayModel.mentionsByDisplayIndex
      ),
    [displayModel]
  );
  const filteredOptions = useMemo(
    () =>
      activeMention
        ? options.filter((option) => optionMatchesQuery(option, activeMention.query))
        : [],
    [activeMention, optionMatchesQuery, options]
  );
  const showMenu = Boolean(activeMention && filteredOptions.length);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeMention?.query, filteredOptions.length]);

  useEffect(() => {
    const pendingSelection = pendingSelectionRef.current;
    if (pendingSelection === null || !textareaRef.current) return;

    textareaRef.current.setSelectionRange(pendingSelection, pendingSelection);
    pendingSelectionRef.current = null;
  }, [displayModel.displayValue]);

  const closeMention = () => setActiveMention(null);

  const refreshMention = (textarea: HTMLTextAreaElement) => {
    setActiveMention(
      mentionAtCursor(displayModel.displayValue, textarea.selectionStart, triggerChars)
    );
  };

  const syncScroll = () => {
    const textarea = textareaRef.current;
    const backdrop = backdropRef.current;
    if (!textarea || !backdrop) return;

    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  };

  const insertOption = (option: Option) => {
    if (!activeMention) return;

    const replacement = getReplacement(option, activeMention);
    const externalStart = displayModel.displayToExternalOffset(activeMention.start);
    const externalEnd = displayModel.displayToExternalOffset(activeMention.end);
    const nextCharacter = displayModel.displayValue.slice(activeMention.end, activeMention.end + 1);
    const needsSpace = nextCharacter && !/\s/.test(nextCharacter);
    const nextValue =
      value.slice(0, externalStart) +
      replacement +
      (needsSpace ? " " : "") +
      value.slice(externalEnd);
    const nextDisplayCursor = activeMention.start + 1 + (needsSpace ? 1 : 0);

    pendingSelectionRef.current = nextDisplayCursor;
    onChange(nextValue);
    onSelect?.({
      option,
      replacement,
      trigger: activeMention.trigger,
      range: {
        start: externalStart,
        end: externalEnd,
      },
    });
    closeMention();

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextDisplayCursor, nextDisplayCursor);
    });
  };

  const handleChange = (nextDisplayValue: string) => {
    onChange(displayModel.expandDisplayValue(nextDisplayValue));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMenu) {
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
        insertOption(filteredOptions[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeMention();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey && onSubmitShortcut) {
      event.preventDefault();
      onSubmitShortcut();
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (controlKeys.has(event.key)) return;
    refreshMention(event.currentTarget);
  };

  return (
    <div className="relative min-w-0">
      <div
        aria-hidden="true"
        className={`${className} pointer-events-none absolute inset-0 overflow-hidden text-[var(--color-ink)]`}
        ref={backdropRef}
      >
        {displaySegments.length ? (
          displaySegments.map((segment) =>
            segment.type === "text" ? (
              <span key={segment.key}>{segment.text}</span>
            ) : (
              <AssetMentionChip
                asset={segment.token.asset}
                key={segment.key}
                meta={segment.token.meta}
                size="inline"
              />
            )
          )
        ) : placeholder && !focused ? (
          <span className="text-[var(--color-ink-muted)]">{placeholder}</span>
        ) : null}
      </div>
      <textarea
        aria-label={placeholder}
        className={`${className} relative z-10 caret-[var(--color-ink)]`}
        disabled={disabled}
        onBlur={() => {
          setFocused(false);
          window.setTimeout(closeMention, 120);
        }}
        onChange={(event) => {
          handleChange(event.target.value);
          setActiveMention(
            mentionAtCursor(event.target.value, event.target.selectionStart, triggerChars)
          );
        }}
        onClick={(event) => refreshMention(event.currentTarget)}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onScroll={syncScroll}
        ref={textareaRef}
        spellCheck={false}
        style={{
          backgroundColor: "transparent",
          color: "transparent",
        }}
        value={displayModel.displayValue}
      />
      {showMenu ? (
        <MentionAutocompleteMenu
          activeIndex={activeIndex}
          className={menuClassName}
          optionKey={optionKey}
          options={filteredOptions}
          renderOption={({ active, index, option }) =>
            renderOption({
              active,
              index,
              option,
              select: () => insertOption(option),
            })
          }
        />
      ) : showEmptyHint && activeMention && !filteredOptions.length ? (
        <div className="absolute left-3 top-[calc(100%-0.5rem)] z-30 w-[min(24rem,calc(100%-1.5rem))] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-[0.78rem] font-[690] leading-snug text-[var(--color-ink-muted)] shadow-[var(--shadow-lg)]">
          {emptyHint}
        </div>
      ) : null}
    </div>
  );
}
