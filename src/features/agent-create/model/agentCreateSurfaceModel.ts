import type { Id } from "../../../../convex/_generated/dataModel";
import {
  assetSourceLongLabels,
  type SelectableLibraryAsset,
} from "../../assets/assetTypes";
import type {
  AgentCreateArtifact,
  AgentCreateMentionMediaType,
  AgentCreateMentionOption,
  AgentCreateMessage,
  AgentCreateSelectedMention,
} from "./agentCreateTypes";

type CreateThreadId = Id<"createThreads">;
type ArtifactId = Id<"artifacts">;
type VideoProjectId = Id<"videoProjects">;

export type PendingAgentTurn = {
  localMessageId: string;
  serverMessageId?: string;
  threadId?: CreateThreadId;
  content: string;
  createdAt: number;
  referenceMentions?: AgentCreateSelectedMention[];
};

export function mediaTypeFromAsset(asset: SelectableLibraryAsset): AgentCreateMentionMediaType {
  if (asset.mediaKind === "image" || asset.mediaKind === "video" || asset.mediaKind === "audio") {
    return asset.mediaKind;
  }

  return "file";
}

export function mediaTypeFromFile(file: File): AgentCreateMentionMediaType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

export function draftReferenceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `draft:${crypto.randomUUID()}`;
  }

  return `draft:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function revokeDraftMentionPreview(mention: AgentCreateSelectedMention) {
  if (mention.draftPreviewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(mention.draftPreviewUrl);
  }
}

export function mentionOptionFromAsset(asset: SelectableLibraryAsset): AgentCreateMentionOption {
  return {
    id: asset.sourceId,
    label: asset.title,
    entityType: asset.source === "creative_asset" ? "creative_asset" : "artifact",
    description: asset.prompt,
    mediaType: mediaTypeFromAsset(asset),
    mimeType: asset.mimeType,
    previewUrl: asset.storageUrl,
    sourceLabel: assetSourceLongLabels[asset.source],
    thumbnailUrl: asset.mediaKind === "image" ? asset.storageUrl : undefined,
  };
}

export function mentionOptionFromReferenceMention(
  mention: AgentCreateSelectedMention
): AgentCreateMentionOption {
  return {
    id: mention.entityId,
    label: mention.label,
    entityType: mention.entityType,
    description: mention.instruction,
    mediaType: mention.mediaType,
    mimeType: mention.mimeType,
    previewUrl: mention.previewUrl ?? mention.storageUrl,
    sourceLabel: mention.sourceLabel ?? "Thread reference",
    thumbnailUrl: mention.thumbnailUrl ?? mention.storageUrl,
    token: mention.token,
  };
}

export function uniqueMentions(mentions: AgentCreateSelectedMention[]) {
  const seen = new Set<string>();

  return mentions.filter((mention) => {
    const key = `${mention.entityType}:${mention.entityId}:${mention.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function backendReferenceMention(
  mention: AgentCreateSelectedMention
): AgentCreateSelectedMention {
  return {
    token: mention.token,
    label: mention.label,
    entityType: mention.entityType,
    entityId: mention.entityId,
    ...(mention.mediaType ? { mediaType: mention.mediaType } : {}),
    ...(mention.mimeType ? { mimeType: mention.mimeType } : {}),
    ...(mention.storageUrl ? { storageUrl: mention.storageUrl } : {}),
    ...(mention.instruction ? { instruction: mention.instruction } : {}),
  };
}

export function videoProjectIdFromStudioArtifact(
  artifact?: AgentCreateArtifact
): VideoProjectId | undefined {
  if (!artifact?.id.startsWith("studio:")) return undefined;
  return artifact.id.slice("studio:".length) as VideoProjectId;
}

export function studioProjectUrl(
  projectId: VideoProjectId,
  renderRequestId?: string,
  autoRender = false
) {
  const params = new URLSearchParams({ projectId: String(projectId) });
  if (renderRequestId) params.set("renderRequestId", renderRequestId);
  if (autoRender) params.set("autoRender", "1");
  return `/studio?${params.toString()}`;
}

export function studioArtifactUrl(artifactId: ArtifactId) {
  const params = new URLSearchParams({ artifactId: String(artifactId) });
  return `/studio?${params.toString()}`;
}

export function isDirectArtifactId(artifact: AgentCreateArtifact) {
  return (
    !artifact.id.includes(":") &&
    artifact.kind !== "document" &&
    artifact.kind !== "slideshow" &&
    artifact.status === "ready"
  );
}

export function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function outputId(output: unknown, key: string) {
  const value = recordFromUnknown(output)[key];
  return typeof value === "string" ? value : undefined;
}

export function uniqueArtifacts(artifacts: AgentCreateArtifact[]) {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    if (seen.has(artifact.id)) return false;
    seen.add(artifact.id);
    return true;
  });
}

export function latestUserMessageIndex(messages: AgentCreateMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return index;
  }
  return -1;
}

export function pendingTurnMessageIndex(
  messages: AgentCreateMessage[],
  pendingTurn: PendingAgentTurn | null
) {
  if (!pendingTurn) return -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.id === pendingTurn.localMessageId) return index;
    if (pendingTurn.serverMessageId && message.id === pendingTurn.serverMessageId) return index;
    if (
      message.role === "user" &&
      message.content === pendingTurn.content &&
      typeof message.createdAt === "number" &&
      message.createdAt >= pendingTurn.createdAt - 5000
    ) {
      return index;
    }
  }

  return -1;
}

function isAttentionStatusMessage(message: {
  content: string;
}) {
  return /\bfailed\b/i.test(message.content) ||
    /\bno ready\b/i.test(message.content) ||
    /\bnot exportable\b/i.test(message.content) ||
    /\bcould not\b/i.test(message.content) ||
    /\bthere is no\b/i.test(message.content) ||
    /\bpaused\b/i.test(message.content);
}

export function shouldRenderAgentCreateMessage(message: {
  content: string;
  kind?: string;
}) {
  if (message.kind === "tool_result") return false;
  if (message.kind === "status") return isAttentionStatusMessage(message);
  return true;
}

export function shouldAttachToolArtifactsToChat(toolName: string) {
  return (
    toolName === "analyze.source" ||
    toolName === "slideshow.render" ||
    toolName === "artifact.export" ||
    toolName === "publishing.prepare" ||
    toolName.startsWith("automation.")
  );
}
