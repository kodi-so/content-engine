import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { AssetPreviewItem } from "../../features/assets/assetTypes";
import {
  activeMentionFromEditorSelection,
  AssetMentionNode,
  collapsedSelectionTextOffset,
  hydrateEditorValue,
  insertMentionTokensAtOffset,
  moveSelectionAcrossMention,
  replaceTextRangeWithMention,
  restoreSelectionTextOffset,
  richMentionTokenSignature,
  serializedEditorText,
  type ActiveEditorMention,
  type RichMentionToken,
} from "./richMentionEditorModel";
import {
  MentionAutocompleteMenu,
  type ActiveMention,
  type MentionAutocompleteSelection,
} from "./MentionAutocomplete";

export type { RichMentionToken } from "./richMentionEditorModel";

type RichMentionTextareaProps<Option> = {
  assetForOption: (option: Option) => AssetPreviewItem;
  className?: string;
  disabled?: boolean;
  emptyHint?: ReactNode;
  getReplacement: (option: Option, activeMention: ActiveMention) => string;
  menuClassName?: string;
  metaForOption?: (option: Option) => string | undefined;
  onChange: (value: string) => void;
  onPasteFiles?: (files: File[]) => Promise<RichMentionToken[]> | RichMentionToken[];
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

const controlKeys = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]);
const defaultMenuClassName =
  "absolute left-3 top-[calc(100%-0.5rem)] z-30 grid max-h-56 w-[min(24rem,calc(100%-1.5rem))] overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-lg)]";

function EditableStatePlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => editor.setEditable(!disabled), [disabled, editor]);
  return null;
}

function SyncExternalValuePlugin({
  lastSerializedRef,
  tokens,
  value,
}: {
  lastSerializedRef: React.MutableRefObject<string>;
  tokens: RichMentionToken[];
  value: string;
}) {
  const [editor] = useLexicalComposerContext();
  const tokenSignature = useMemo(() => richMentionTokenSignature(tokens), [tokens]);
  const lastTokenSignatureRef = useRef(tokenSignature);

  useEffect(() => {
    if (
      value === lastSerializedRef.current &&
      tokenSignature === lastTokenSignatureRef.current
    ) {
      return;
    }

    lastSerializedRef.current = value;
    lastTokenSignatureRef.current = tokenSignature;
    editor.update(() => {
      const selectionOffset = collapsedSelectionTextOffset();
      hydrateEditorValue(value, tokens);
      restoreSelectionTextOffset(selectionOffset);
    });
  }, [editor, lastSerializedRef, tokenSignature, tokens, value]);

  return null;
}

function RichMentionEditorInner<Option>({
  assetForOption,
  className = "",
  disabled = false,
  emptyHint,
  getReplacement,
  menuClassName = defaultMenuClassName,
  metaForOption,
  onChange,
  onPasteFiles,
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
  const [editor] = useLexicalComposerContext();
  const lastSerializedRef = useRef(value);
  const [activeMention, setActiveMention] = useState<ActiveEditorMention | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredOptions = useMemo(
    () =>
      activeMention
        ? options.filter((option) => optionMatchesQuery(option, activeMention.mention.query))
        : [],
    [activeMention, optionMatchesQuery, options]
  );
  const showMenu = Boolean(activeMention && filteredOptions.length);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeMention?.mention.query, filteredOptions.length]);

  const refreshMention = () => {
    editor.getEditorState().read(() => {
      setActiveMention(activeMentionFromEditorSelection(triggerChars));
    });
  };

  const closeMention = () => setActiveMention(null);

  const insertOption = (option: Option) => {
    if (!activeMention) return;

    const replacement = getReplacement(option, activeMention.mention);
    const asset = assetForOption(option);
    const meta = metaForOption?.(option);
    let nextSerializedValue = value;

    editor.update(() => {
      replaceTextRangeWithMention({
        activeMention,
        asset,
        meta,
        replacement,
      });
      nextSerializedValue = serializedEditorText();
      lastSerializedRef.current = nextSerializedValue;
    });

    onChange(nextSerializedValue);
    onSelect?.({
      option,
      replacement,
      trigger: activeMention.mention.trigger,
      range: activeMention.range,
    });
    closeMention();
    editor.focus();
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!onPasteFiles || disabled) return;

    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/") ||
        file.type.startsWith("video/") ||
        file.type.startsWith("audio/")
    );
    if (!files.length) return;

    event.preventDefault();
    event.stopPropagation();
    closeMention();

    let selectionOffset: number | null = null;
    editor.getEditorState().read(() => {
      selectionOffset = collapsedSelectionTextOffset();
    });

    void Promise.resolve(onPasteFiles(files)).then((mentionTokens) => {
      if (!mentionTokens.length) return;

      let nextSerializedValue = value;
      let inserted = false;
      editor.update(() => {
        inserted = insertMentionTokensAtOffset(mentionTokens, selectionOffset);
        if (!inserted) return;
        nextSerializedValue = serializedEditorText();
        lastSerializedRef.current = nextSerializedValue;
      });

      if (!inserted) return;
      onChange(nextSerializedValue);
      editor.focus();
    }).catch(() => undefined);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !event.shiftKey) {
      let movedAcrossMention = false;
      editor.update(() => {
        movedAcrossMention = moveSelectionAcrossMention(
          event.key === "ArrowLeft" ? "left" : "right"
        );
      });

      if (movedAcrossMention) {
        event.preventDefault();
        event.stopPropagation();
        closeMention();
        return;
      }
    }

    if (showMenu) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((index) => (index + 1) % filteredOptions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((index) => (index === 0 ? filteredOptions.length - 1 : index - 1));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        insertOption(filteredOptions[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMention();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey && onSubmitShortcut) {
      event.preventDefault();
      event.stopPropagation();
      onSubmitShortcut();
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (controlKeys.has(event.key)) return;
    refreshMention();
  };

  return (
    <div className="relative min-w-0">
      <PlainTextPlugin
        ErrorBoundary={LexicalErrorBoundary}
        contentEditable={
          <ContentEditable
            aria-label={placeholder}
            className={className}
            onBlur={() => window.setTimeout(closeMention, 120)}
            onClick={refreshMention}
            onFocus={refreshMention}
            onKeyDownCapture={handleKeyDown}
            onKeyUp={handleKeyUp}
            onPaste={handlePaste}
            spellCheck={false}
          />
        }
        placeholder={
          placeholder ? (
            <span className="pointer-events-none absolute left-[var(--space-3)] top-[var(--space-2)] text-[0.92rem] leading-[1.45] text-[var(--color-ink-muted)]">
              {placeholder}
            </span>
          ) : null
        }
      />
      <HistoryPlugin />
      <EditableStatePlugin disabled={disabled} />
      <SyncExternalValuePlugin
        lastSerializedRef={lastSerializedRef}
        tokens={tokens}
        value={value}
      />
      <OnChangePlugin
        onChange={(editorState) => {
          editorState.read(() => {
            const serialized = serializedEditorText();
            if (serialized === lastSerializedRef.current) return;

            lastSerializedRef.current = serialized;
            onChange(serialized);
            setActiveMention(activeMentionFromEditorSelection(triggerChars));
          });
        }}
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

export function RichMentionTextarea<Option>(props: RichMentionTextareaProps<Option>) {
  const initialValueRef = useRef(props.value);
  const initialTokensRef = useRef(props.tokens ?? []);
  const initialConfig = useMemo(
    () => ({
      editorState: () => hydrateEditorValue(initialValueRef.current, initialTokensRef.current),
      namespace: "RichMentionTextarea",
      nodes: [AssetMentionNode],
      onError(error: Error) {
        throw error;
      },
      theme: {
        paragraph: "m-0",
      },
    }),
    []
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichMentionEditorInner {...props} />
    </LexicalComposer>
  );
}
