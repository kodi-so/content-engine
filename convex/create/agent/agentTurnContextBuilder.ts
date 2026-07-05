import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { compactLogValue } from "./agentDiagnostics";
import { toolDescriptorMap } from "../planning";
import type { CreateToolName } from "../tools";
import { isRecord } from "../references/referenceResolution";
import { readyArtifactsForThreadToolOutputs } from "../execution/threadToolOutputs";
import { contentRequestIdFromToolOutput } from "../execution/toolExecutionShared";

export type TurnContextMessage = Doc<"createMessages"> & {
  generatedImageUrls?: string[];
  generatedTextContext?: string;
};

export type TurnContextSections = {
  artifactLedger: string;
  contextBlock: string;
  droppedMessages: TurnContextMessage[];
  recentMessages: TurnContextMessage[];
};

function contextCharBudget() {
  const parsed = Number.parseInt(process.env.CONTENT_ENGINE_AGENT_CONTEXT_CHARS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 48_000;
}

function messageContextLength(message: TurnContextMessage) {
  return message.content.length + (message.generatedTextContext?.length ?? 0);
}

export function fitRecentMessagesToBudget(
  messages: TurnContextMessage[],
  budget = contextCharBudget()
) {
  const included: TurnContextMessage[] = [];
  const dropped: TurnContextMessage[] = [];
  let used = 0;

  for (const message of [...messages].reverse()) {
    const length = messageContextLength(message);
    if (included.length && used + length > budget) {
      dropped.push(message);
      continue;
    }
    included.push(message);
    used += length;
  }

  return {
    droppedMessages: dropped.reverse(),
    recentMessages: included.reverse(),
  };
}

function artifactCaption(artifact: Doc<"artifacts">) {
  const data = isRecord(artifact.data) ? artifact.data : {};
  const caption = typeof data.caption === "string" ? data.caption.trim() : "";
  return caption || artifact.title || "Untitled artifact";
}

function artifactStatus(artifact: Doc<"artifacts">) {
  return artifact.lifecycle === "saved" ? "saved" : "ready";
}

function artifactType(artifact: Doc<"artifacts">) {
  const data = isRecord(artifact.data) ? artifact.data : {};
  const kind = typeof data.kind === "string" ? data.kind : "";
  if (artifact.type === "rendered_asset" && kind) return kind;
  return artifact.type;
}

type TurnToolProgressEntry = {
  label: string;
  producedImageIndexes?: number[];
  status: string;
};

export function formatTurnToolProgressSection(entries: TurnToolProgressEntry[]) {
  if (!entries.length) {
    return [
      "Tool calls for the current request:",
      "No tool calls have been planned yet.",
    ].join("\n");
  }

  const completedCount = entries.filter((entry) => entry.status === "succeeded").length;
  const lines = entries.map((entry, index) => {
    const producedImages = entry.producedImageIndexes?.length
      ? ` (produced ${entry.producedImageIndexes.map((imageIndex) => `Image #${imageIndex}`).join(", ")})`
      : "";
    return `${index + 1}. ${entry.label} - ${entry.status}${producedImages}`;
  });
  const summary = completedCount === entries.length
    ? "All planned tool calls for this request have completed."
    : `${completedCount} of ${entries.length} planned tool call${entries.length === 1 ? "" : "s"} completed.`;

  return [
    "Tool calls for the current request:",
    ...lines,
    summary,
  ].join("\n");
}

export async function buildTurnContextSections(
  ctx: Pick<QueryCtx, "db">,
  args: {
    effectiveBrief: string;
    messages: Doc<"createMessages">[];
    thread: Doc<"createThreads">;
    toolCalls: Doc<"createToolCalls">[];
    userMessage: Doc<"createMessages">;
  }
): Promise<TurnContextSections> {
  const sortedMessages = [...args.messages].sort((a, b) => a.createdAt - b.createdAt);
  const nonStatusMessages = sortedMessages.filter((message) => message.kind !== "status");
  const currentTurnPlan = nonStatusMessages.find((message) =>
    message.role === "agent" &&
    message.kind === "plan" &&
    message.createdAt >= args.userMessage.createdAt
  );

  const messageArtifactIds = [
    ...new Set(nonStatusMessages.flatMap((message) => message.artifactIds ?? [])),
  ];
  const artifacts = await Promise.all(messageArtifactIds.map((artifactId) => ctx.db.get(artifactId)));
  const generatedTextByArtifactId = new Map<string, string>();
  for (const artifact of artifacts) {
    if (!artifact) continue;
    const data = isRecord(artifact.data) ? artifact.data : {};
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (text) generatedTextByArtifactId.set(String(artifact._id), text);
  }

  const imageArtifacts = await readyArtifactsForThreadToolOutputs(
    ctx,
    args.thread,
    undefined,
    "image"
  );
  const generatedImageUrlByArtifactId = new Map<string, string>();
  for (const artifact of [...artifacts, ...imageArtifacts]) {
    if (!artifact?.storageUrl) continue;
    if (artifactType(artifact) !== "image") continue;
    generatedImageUrlByArtifactId.set(String(artifact._id), artifact.storageUrl);
  }

  const messagesWithText = nonStatusMessages.map((message) => {
    const generatedTextContext = (message.artifactIds ?? [])
      .map((artifactId) => generatedTextByArtifactId.get(String(artifactId)))
      .filter((text): text is string => Boolean(text))
      .map((text) => compactLogValue(text, 6000))
      .filter((text): text is string => Boolean(text))
      .join("\n\n");
    const generatedImageUrls = (message.artifactIds ?? [])
      .map((artifactId) => generatedImageUrlByArtifactId.get(String(artifactId)))
      .filter((url): url is string => Boolean(url));
    return generatedTextContext || generatedImageUrls.length
      ? {
          ...message,
          ...(generatedImageUrls.length ? { generatedImageUrls } : {}),
          ...(generatedTextContext ? { generatedTextContext } : {}),
        }
      : message;
  });

  const { droppedMessages, recentMessages } = fitRecentMessagesToBudget(messagesWithText);
  const artifactToolLabels = new Map<string, string>();
  const descriptors = toolDescriptorMap();
  for (const toolCall of args.toolCalls) {
    const label = descriptors.get(toolCall.toolName as CreateToolName)?.label ?? toolCall.label;
    for (const artifactId of toolCall.artifactIds ?? []) {
      artifactToolLabels.set(String(artifactId), label);
    }
  }

  const imageArtifactIds = new Set(imageArtifacts.map((artifact) => String(artifact._id)));
  const directArtifactIds = [
    ...new Set(args.toolCalls.flatMap((toolCall) => toolCall.artifactIds ?? [])),
  ].filter((artifactId) => !imageArtifactIds.has(String(artifactId)));
  const directArtifacts = (await Promise.all(directArtifactIds.map((artifactId) => ctx.db.get(artifactId))))
    .filter((artifact): artifact is Doc<"artifacts"> => Boolean(artifact));
  const imageLedgerLines = imageArtifacts.map((artifact, index) => {
    const label = artifactToolLabels.get(String(artifact._id)) ?? "unknown";
    return `Image #${index} [${artifactType(artifact)}] ${artifactCaption(artifact)} (tool: ${label}, status: ${artifactStatus(artifact)})`;
  });
  const otherLedgerLines = directArtifacts.map((artifact, index) => {
    const label = artifactToolLabels.get(String(artifact._id)) ?? "unknown";
    return `Artifact ${index + 1} [${artifactType(artifact)}] ${artifactCaption(artifact)} (tool: ${label}, status: ${artifactStatus(artifact)})`;
  });
  const ledgerLines = [...imageLedgerLines, ...otherLedgerLines];
  const imageArtifactIndexById = new Map(
    imageArtifacts.map((artifact, index) => [String(artifact._id), index])
  );
  const imageIndexesByContentRequestId = new Map<string, number[]>();
  for (const [index, artifact] of imageArtifacts.entries()) {
    if (!artifact.contentRequestId) continue;
    const key = String(artifact.contentRequestId);
    imageIndexesByContentRequestId.set(key, [
      ...(imageIndexesByContentRequestId.get(key) ?? []),
      index,
    ]);
  }
  const currentTurnToolCalls = args.toolCalls
    .filter((toolCall) => toolCall.createdAt >= args.userMessage.createdAt)
    .sort((a, b) => a.createdAt - b.createdAt);
  const turnToolProgress = formatTurnToolProgressSection(
    currentTurnToolCalls.map((toolCall) => {
      const artifactImageIndexes = (toolCall.artifactIds ?? []).flatMap((artifactId) => {
        const imageIndex = imageArtifactIndexById.get(String(artifactId));
        return imageIndex === undefined ? [] : [imageIndex];
      });
      const contentRequestId = contentRequestIdFromToolOutput(toolCall.output);
      const requestImageIndexes = contentRequestId
        ? imageIndexesByContentRequestId.get(String(contentRequestId)) ?? []
        : [];
      return {
        label: descriptors.get(toolCall.toolName as CreateToolName)?.label ?? toolCall.label,
        producedImageIndexes: [...new Set([...artifactImageIndexes, ...requestImageIndexes])],
        status: toolCall.status,
      };
    })
  );
  const artifactLedger = ledgerLines.length
    ? [
        "Generated artifact ledger:",
        "Only Image # numbers correspond to priorImageOutputIndex / priorImageOutputIndexes.",
        ...ledgerLines,
      ].join("\n")
    : [
        "Generated artifact ledger:",
        "No generated artifacts yet.",
        "Only Image # numbers correspond to priorImageOutputIndex / priorImageOutputIndexes.",
      ].join("\n");

  const contextBlock = [
    "Current request and plan:",
    `User request: ${args.userMessage.content}`,
    `Effective brief: ${args.effectiveBrief}`,
    currentTurnPlan ? `Current plan: ${currentTurnPlan.content}` : "Current plan: none yet.",
    "",
    turnToolProgress,
    "",
    artifactLedger,
  ].join("\n");

  return {
    artifactLedger,
    contextBlock,
    droppedMessages,
    recentMessages,
  };
}
