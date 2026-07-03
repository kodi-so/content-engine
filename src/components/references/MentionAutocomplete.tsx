import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

export type ActiveMention = {
  end: number;
  query: string;
  start: number;
  trigger: string;
};

export type MentionAutocompleteSelection<Option> = {
  option: Option;
  range: {
    end: number;
    start: number;
  };
  replacement: string;
  trigger: string;
};

type UseMentionAutocompleteArgs<Option> = {
  getReplacement: (option: Option, activeMention: ActiveMention) => string;
  onChange: (value: string) => void;
  onSelect?: (selection: MentionAutocompleteSelection<Option>) => void;
  optionMatchesQuery: (option: Option, query: string) => boolean;
  options: Option[];
  textareaRef: RefObject<HTMLTextAreaElement>;
  triggerChars?: string[];
  value: string;
};

const controlKeys = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]);

function escapeRegExpCharacter(value: string) {
  return value.replace(/[\\\]^]/g, "\\$&");
}

export function mentionAtCursor(
  value: string,
  selectionStart: number,
  triggerChars: string[] = ["@"]
): ActiveMention | null {
  const triggers = triggerChars
    .filter(Boolean)
    .map((trigger) => escapeRegExpCharacter(trigger[0]))
    .join("");
  if (!triggers) return null;

  const beforeCursor = value.slice(0, selectionStart);
  const match = beforeCursor.match(
    new RegExp(`(^|[\\s([{])([${triggers}])([a-zA-Z0-9_-]*)$`)
  );
  if (!match) return null;

  return {
    start: selectionStart - match[3].length - match[2].length,
    end: selectionStart,
    query: match[3].toLowerCase(),
    trigger: match[2],
  };
}

export function useMentionAutocomplete<Option>({
  getReplacement,
  onChange,
  onSelect,
  optionMatchesQuery,
  options,
  textareaRef,
  triggerChars = ["@"],
  value,
}: UseMentionAutocompleteArgs<Option>) {
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
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

  const closeMention = () => setActiveMention(null);

  const refreshMention = (textarea: HTMLTextAreaElement) => {
    setActiveMention(mentionAtCursor(textarea.value, textarea.selectionStart, triggerChars));
  };

  const insertOption = (option: Option) => {
    if (!activeMention) return;

    const replacement = getReplacement(option, activeMention);
    const nextCharacter = value.slice(activeMention.end, activeMention.end + 1);
    const needsSpace = nextCharacter && !/\s/.test(nextCharacter);
    const nextValue =
      value.slice(0, activeMention.start) +
      replacement +
      (needsSpace ? " " : "") +
      value.slice(activeMention.end);
    const nextCursor = activeMention.start + replacement.length + (needsSpace ? 1 : 0);

    onChange(nextValue);
    onSelect?.({
      option,
      replacement,
      trigger: activeMention.trigger,
      range: {
        start: activeMention.start,
        end: activeMention.end,
      },
    });
    closeMention();
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMenu) return false;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % filteredOptions.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index === 0 ? filteredOptions.length - 1 : index - 1));
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertOption(filteredOptions[activeIndex]);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMention();
      return true;
    }

    return false;
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (controlKeys.has(event.key)) return;
    refreshMention(event.currentTarget);
  };

  return {
    activeIndex,
    activeMention,
    closeMention,
    filteredOptions,
    handleKeyDown,
    handleKeyUp,
    insertOption,
    refreshMention,
    showMenu,
  };
}

export function MentionAutocompleteMenu<Option>({
  activeIndex,
  className,
  optionKey,
  options,
  renderOption,
}: {
  activeIndex: number;
  className: string;
  optionKey: (option: Option) => string;
  options: Option[];
  renderOption: (args: {
    active: boolean;
    index: number;
    option: Option;
  }) => ReactNode;
}) {
  return (
    <div className={className} role="listbox">
      {options.map((option, index) => (
        <Fragment key={optionKey(option)}>
          {renderOption({
            active: index === activeIndex,
            index,
            option,
          })}
        </Fragment>
      ))}
    </div>
  );
}
