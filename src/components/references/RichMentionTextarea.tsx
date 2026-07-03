import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  type TextNode,
} from "lexical";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
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

export type RichMentionToken = {
  asset: AssetPreviewItem;
  meta?: string;
  token: string;
};

type ActiveEditorMention = {
  mention: ActiveMention;
  nodeKey: string;
  range: {
    end: number;
    start: number;
  };
};

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

type SerializedAssetMentionNode = Spread<
  {
    asset: AssetPreviewItem;
    meta?: string;
    token: string;
  },
  SerializedLexicalNode
>;

const controlKeys = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]);
const defaultMenuClassName =
  "absolute left-3 top-[calc(100%-0.5rem)] z-30 grid max-h-56 w-[min(24rem,calc(100%-1.5rem))] overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-lg)]";

class AssetMentionNode extends DecoratorNode<ReactNode> {
  __asset: AssetPreviewItem;
  __meta?: string;
  __token: string;

  static getType() {
    return "asset-mention";
  }

  static clone(node: AssetMentionNode) {
    return new AssetMentionNode(node.__token, node.__asset, node.__meta, node.__key);
  }

  static importJSON(serializedNode: SerializedAssetMentionNode) {
    return $createAssetMentionNode({
      asset: serializedNode.asset,
      meta: serializedNode.meta,
      token: serializedNode.token,
    });
  }

  constructor(token: string, asset: AssetPreviewItem, meta?: string, key?: NodeKey) {
    super(key);
    this.__asset = asset;
    this.__meta = meta;
    this.__token = token;
  }

  createDOM() {
    const span = document.createElement("span");
    span.className = "inline-flex align-baseline";
    return span;
  }

  updateDOM() {
    return false;
  }

  decorate() {
    return (
      <AssetMentionChip
        asset={this.__asset}
        meta={this.__meta}
        size="inline"
      />
    );
  }

  exportJSON(): SerializedAssetMentionNode {
    return {
      ...super.exportJSON(),
      asset: this.__asset,
      meta: this.__meta,
      token: this.__token,
    };
  }

  getTextContent() {
    return this.__token;
  }

  isInline() {
    return true;
  }
}

function $createAssetMentionNode({
  asset,
  meta,
  token,
}: RichMentionToken) {
  return new AssetMentionNode(token, asset, meta);
}

function $isAssetMentionNode(node: LexicalNode | null | undefined): node is AssetMentionNode {
  return node instanceof AssetMentionNode;
}

function richMentionTokenSignature(tokens: RichMentionToken[]) {
  return tokens
    .map((token) => `${token.token}:${token.asset.id ?? ""}:${token.asset.title}`)
    .join("|");
}

function nodesForText(value: string, tokens: RichMentionToken[]) {
  const tokenMap = new Map(
    tokens
      .filter((token) => token.token)
      .map((token) => [token.token, token])
  );
  const sortedTokens = Array.from(tokenMap.keys()).sort((a, b) => b.length - a.length);
  const nodes: LexicalNode[] = [];
  let cursor = 0;
  let textBuffer = "";

  const flushText = () => {
    if (!textBuffer) return;
    nodes.push($createTextNode(textBuffer));
    textBuffer = "";
  };

  while (cursor < value.length) {
    const matchingToken = sortedTokens.find((token) => value.startsWith(token, cursor));
    const token = matchingToken ? tokenMap.get(matchingToken) : undefined;

    if (token) {
      flushText();
      nodes.push($createAssetMentionNode(token));
      cursor += token.token.length;
      continue;
    }

    textBuffer += value[cursor];
    cursor += 1;
  }

  flushText();
  return nodes;
}

function hydrateEditorValue(value: string, tokens: RichMentionToken[]) {
  const root = $getRoot();
  root.clear();

  const lines = value.split("\n");
  lines.forEach((line) => {
    const paragraph = $createParagraphNode();
    const nodes = nodesForText(line, tokens);

    if (nodes.length) {
      paragraph.append(...nodes);
    }
    root.append(paragraph);
  });
}

function serializedEditorText() {
  return $getRoot().getTextContent();
}

function textSizeForNode(node: LexicalNode) {
  return node.getTextContent().length;
}

function textOffsetForPoint(nodeKey: string, pointOffset: number) {
  let offset = 0;
  let found = false;

  const visit = (node: LexicalNode) => {
    if (found) return;

    if (node.getKey() === nodeKey) {
      if ($isTextNode(node)) {
        offset += pointOffset;
      } else if ($isElementNode(node)) {
        const children = node.getChildren().slice(0, pointOffset);
        offset += children.reduce((sum, child) => sum + textSizeForNode(child), 0);
      }
      found = true;
      return;
    }

    if ($isElementNode(node)) {
      node.getChildren().forEach(visit);
      return;
    }

    offset += textSizeForNode(node);
  };

  visit($getRoot());
  return offset;
}

function collapsedSelectionTextOffset() {
  const selection = $getSelection();

  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    return textOffsetForPoint(selection.anchor.getNode().getKey(), selection.anchor.offset);
  }

  if ($isNodeSelection(selection)) {
    const selectedNode = selection.getNodes()[0];
    const parent = selectedNode?.getParent();
    if (parent) {
      return textOffsetForPoint(parent.getKey(), selectedNode.getIndexWithinParent() + 1);
    }
  }

  return null;
}

function selectTextOffset(targetOffset: number) {
  const root = $getRoot();
  let remainingOffset = Math.max(0, targetOffset);

  const selectWithinNode = (node: LexicalNode): boolean => {
    if ($isTextNode(node)) {
      const textLength = node.getTextContent().length;
      if (remainingOffset <= textLength) {
        node.select(remainingOffset, remainingOffset);
        return true;
      }

      remainingOffset -= textLength;
      return false;
    }

    if ($isAssetMentionNode(node)) {
      const parent = node.getParent();
      if (!parent) return false;

      const textLength = node.getTextContent().length;
      if (remainingOffset <= textLength) {
        const index = node.getIndexWithinParent();
        parent.select(index + 1, index + 1);
        return true;
      }

      remainingOffset -= textLength;
      return false;
    }

    if (!$isElementNode(node)) return false;

    const children = node.getChildren();
    if (!children.length || remainingOffset === 0) {
      node.select(0, 0);
      return true;
    }

    for (const child of children) {
      if (selectWithinNode(child)) return true;
    }

    node.select(children.length, children.length);
    return true;
  };

  selectWithinNode(root);
}

function activeMentionFromEditorSelection(triggerChars: string[]): ActiveEditorMention | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;

  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  if (!$isTextNode(anchorNode)) return null;

  const text = anchorNode.getTextContent();
  const mention = mentionAtCursor(text, anchor.offset, triggerChars);
  if (!mention) return null;

  const globalCursor = textOffsetForPoint(anchorNode.getKey(), anchor.offset);

  return {
    mention,
    nodeKey: anchorNode.getKey(),
    range: {
      start: globalCursor - (mention.end - mention.start),
      end: globalCursor,
    },
  };
}

function replaceTextRangeWithMention({
  activeMention,
  asset,
  meta,
  replacement,
}: {
  activeMention: ActiveEditorMention;
  asset: AssetPreviewItem;
  meta?: string;
  replacement: string;
}) {
  const node = $getNodeByKey(activeMention.nodeKey);
  if (!$isTextNode(node)) return;

  const text = node.getTextContent();
  const before = text.slice(0, activeMention.mention.start);
  const after = text.slice(activeMention.mention.end);
  const needsSpace = Boolean(after && !/^\s/.test(after));
  const newNodes: LexicalNode[] = [];
  let selectionNode: TextNode | null = null;
  let selectionOffset = 0;

  if (before) newNodes.push($createTextNode(before));
  newNodes.push($createAssetMentionNode({ asset, meta, token: replacement }));

  if (needsSpace || !after) {
    const spacerNode = $createTextNode(" ");
    newNodes.push(spacerNode);
    selectionNode = spacerNode;
    selectionOffset = 1;
  }

  const afterNode = after ? $createTextNode(after) : null;
  if (afterNode) {
    newNodes.push(afterNode);
    if (!selectionNode) {
      selectionNode = afterNode;
      selectionOffset = 0;
    }
  }

  const firstNode = newNodes[0];
  node.replace(firstNode);
  let previousNode = firstNode;
  newNodes.slice(1).forEach((nextNode) => {
    previousNode.insertAfter(nextNode);
    previousNode = nextNode;
  });

  selectionNode?.select(selectionOffset, selectionOffset);
}

function insertMentionTokensAtOffset(tokens: RichMentionToken[], targetOffset: number | null) {
  if (!tokens.length) return false;

  if (targetOffset !== null) {
    selectTextOffset(targetOffset);
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;

  const nodes = tokens.flatMap((token): LexicalNode[] => [
    $createAssetMentionNode(token),
    $createTextNode(" "),
  ]);
  selection.insertNodes(nodes);

  const lastNode = nodes[nodes.length - 1];
  if ($isTextNode(lastNode)) {
    lastNode.select(1, 1);
  }

  return true;
}

function moveSelectionAcrossMention(direction: "left" | "right") {
  const selection = $getSelection();

  if ($isNodeSelection(selection)) {
    const mentionNode = selection.getNodes().find($isAssetMentionNode);
    if (!mentionNode) return false;

    if (direction === "left") {
      mentionNode.selectPrevious();
    } else {
      mentionNode.selectNext(0, 0);
    }
    return true;
  }

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();

  if ($isTextNode(anchorNode)) {
    const text = anchorNode.getTextContent();

    if (direction === "left") {
      const previousNode = anchorNode.getPreviousSibling();
      const isSpacerAfterMention = anchor.offset === 1 && text.startsWith(" ");
      if ($isAssetMentionNode(previousNode) && (anchor.offset === 0 || isSpacerAfterMention)) {
        previousNode.selectPrevious();
        return true;
      }
    }

    if (direction === "right") {
      const nextNode = anchorNode.getNextSibling();
      if ($isAssetMentionNode(nextNode) && anchor.offset === text.length) {
        nextNode.selectNext(0, 0);
        return true;
      }
    }

    return false;
  }

  if ($isElementNode(anchorNode)) {
    const children = anchorNode.getChildren();

    if (direction === "left") {
      const previousNode = children[anchor.offset - 1];
      if ($isAssetMentionNode(previousNode)) {
        previousNode.selectPrevious();
        return true;
      }
    }

    if (direction === "right") {
      const nextNode = children[anchor.offset];
      if ($isAssetMentionNode(nextNode)) {
        nextNode.selectNext(0, 0);
        return true;
      }
    }
  }

  return false;
}

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
      if (selectionOffset !== null) {
        selectTextOffset(selectionOffset);
      }
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
