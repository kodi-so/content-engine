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
import type { ReactNode } from "react";
import { AssetMentionChip } from "../../features/assets/AssetMentionChip";
import type { AssetPreviewItem } from "../../features/assets/assetTypes";
import { mentionAtCursor, type ActiveMention } from "./MentionAutocomplete";

export type RichMentionToken = {
  asset: AssetPreviewItem;
  meta?: string;
  token: string;
};

export type ActiveEditorMention = {
  mention: ActiveMention;
  nodeKey: string;
  range: {
    end: number;
    start: number;
  };
};

type SerializedAssetMentionNode = Spread<
  {
    asset: AssetPreviewItem;
    meta?: string;
    token: string;
  },
  SerializedLexicalNode
>;

export class AssetMentionNode extends DecoratorNode<ReactNode> {
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

export function richMentionTokenSignature(tokens: RichMentionToken[]) {
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

export function hydrateEditorValue(value: string, tokens: RichMentionToken[]) {
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

export function serializedEditorText() {
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

export function collapsedSelectionTextOffset() {
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

export function restoreSelectionTextOffset(targetOffset: number | null) {
  if (targetOffset !== null) {
    selectTextOffset(targetOffset);
  }
}

export function activeMentionFromEditorSelection(triggerChars: string[]): ActiveEditorMention | null {
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

export function replaceTextRangeWithMention({
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

export function insertMentionTokensAtOffset(tokens: RichMentionToken[], targetOffset: number | null) {
  if (!tokens.length) return false;

  restoreSelectionTextOffset(targetOffset);

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

export function moveSelectionAcrossMention(direction: "left" | "right") {
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
