import type { Doc, Id } from "../../_generated/dataModel";
import { artifactDurationSeconds, artifactMimeType, isRecord } from "../references/referenceResolution";
import {
  optionalText,
} from "../../lib/mediaTextOverlays";
import {
  designTimedOverlayBlocks,
  type OverlayDesignBlockIntent,
} from "../../lib/overlayLayoutDesigner";

type StudioVideoArtifact = Pick<
  Doc<"artifacts">,
  "_id" | "storageUrl" | "title" | "data"
>;

type StudioImageArtifact = Pick<
  Doc<"artifacts">,
  "_id" | "storageUrl" | "title" | "data"
>;

type StudioAudioArtifact = Pick<
  Doc<"artifacts">,
  "_id" | "storageUrl" | "title" | "data"
>;

function textFromOverlayRecord(record: Record<string, unknown>) {
  const text = optionalText(record.text) ??
    optionalText(record.caption) ??
    optionalText(record.title) ??
    optionalText(record.label);
  if (text) return text;

  if (Array.isArray(record.items)) {
    const items = record.items
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
    if (items.length) return items.join("\n");
  }

  return undefined;
}

function overlayRecordsFromInput(input: Record<string, unknown>) {
  const candidates = [
    input.textOverlays,
    input.overlays,
    input.captions,
    input.timeline,
  ];
  return candidates.flatMap((candidate): Record<string, unknown>[] => {
    if (!Array.isArray(candidate)) return [];
    return candidate.filter(isRecord);
  });
}

function quotedOverlayTextsFromInput(input: Record<string, unknown>) {
  const source = optionalText(input.timeline) ?? optionalText(input.brief) ?? "";
  if (!/\b(text|caption|overlay|title|headline|label|subtitle|onscreen|on-screen)\b/i.test(source)) {
    return [];
  }

  return [...source.matchAll(/["']([^"']{2,120})["']/g)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 6);
}

function overlayTextItems(input: Record<string, unknown>) {
  const fromRecords = overlayRecordsFromInput(input).flatMap((record) => {
    const text = textFromOverlayRecord(record);
    return text ? [{ record, text }] : [];
  });
  if (fromRecords.length) return fromRecords;

  return quotedOverlayTextsFromInput(input).map((text) => ({ record: {}, text }));
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function overlayIntentFromItem(
  item: { record: Record<string, unknown>; text: string },
  index: number
): OverlayDesignBlockIntent {
  const record = item.record;
  return {
    id: optionalText(record.id) ?? `create-agent-text-${index + 1}`,
    role:
      record.role === "eyebrow" ||
      record.role === "headline" ||
      record.role === "body" ||
      record.role === "bullet_list" ||
      record.role === "cta"
        ? record.role
        : index === 0 ? "headline" : "body",
    text: item.text,
    emphasis:
      record.emphasis === "primary" ||
      record.emphasis === "secondary" ||
      record.emphasis === "muted"
        ? record.emphasis
        : index === 0 ? "primary" : "secondary",
    zone:
      record.zone === "top" || record.zone === "center" || record.zone === "bottom"
        ? record.zone
        : undefined,
    align:
      record.align === "left" || record.align === "center" || record.align === "right"
        ? record.align
        : undefined,
    x: finiteNumber(record.x),
    y: finiteNumber(record.y),
    width: finiteNumber(record.width),
    height: finiteNumber(record.height),
    fontSize: finiteNumber(record.fontSize),
    startSeconds: finiteNumber(record.startSeconds) ?? finiteNumber(record.start),
    endSeconds: finiteNumber(record.endSeconds) ?? finiteNumber(record.end),
    clipIndex: finiteNumber(record.clipIndex),
  };
}

export function buildStudioTextOverlaysFromInput(
  input: Record<string, unknown>,
  totalDurationSeconds: number,
  options: { aspectRatio?: string; clipBoundariesSeconds?: number[] } = {}
) {
  const items = overlayTextItems(input).slice(0, 6);
  if (!items.length) return [];
  const safeDuration = Math.max(0.5, totalDurationSeconds);
  return designTimedOverlayBlocks({
    medium: "video",
    aspectRatio: options.aspectRatio ?? "9:16",
    blocks: items.map(overlayIntentFromItem),
    totalDurationSeconds: safeDuration,
    clipBoundariesSeconds: options.clipBoundariesSeconds,
  });
}

function artifactIdSetFromInput(input: Record<string, unknown>) {
  if (!Array.isArray(input.artifactIds)) return null;
  const ids = input.artifactIds
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  return ids.length ? new Set(ids) : null;
}

export function selectCreateAgentStudioVisualArtifacts(args: {
  imageArtifacts?: StudioImageArtifact[];
  input: Record<string, unknown>;
  videoArtifacts: StudioVideoArtifact[];
}) {
  const explicitArtifactIds = artifactIdSetFromInput(args.input);
  if (explicitArtifactIds) {
    return {
      imageArtifacts: (args.imageArtifacts ?? []).filter((artifact) =>
        explicitArtifactIds.has(String(artifact._id))
      ),
      videoArtifacts: args.videoArtifacts.filter((artifact) =>
        explicitArtifactIds.has(String(artifact._id))
      ),
    };
  }

  if (args.videoArtifacts.length) {
    return {
      imageArtifacts: [],
      videoArtifacts: args.videoArtifacts,
    };
  }

  return {
    imageArtifacts: args.imageArtifacts ?? [],
    videoArtifacts: args.videoArtifacts,
  };
}

export function buildCreateAgentStudioDraft(args: {
  audioArtifacts?: StudioAudioArtifact[];
  aspectRatio?: unknown;
  imageArtifacts?: StudioImageArtifact[];
  input: Record<string, unknown>;
  videoArtifacts: StudioVideoArtifact[];
}) {
  const selectedVisualArtifacts = selectCreateAgentStudioVisualArtifacts({
    imageArtifacts: args.imageArtifacts,
    input: args.input,
    videoArtifacts: args.videoArtifacts,
  });
  const visualArtifacts = [
    ...selectedVisualArtifacts.videoArtifacts.map((artifact) => ({ artifact, mediaKind: "video" as const })),
    ...selectedVisualArtifacts.imageArtifacts.map((artifact) => ({ artifact, mediaKind: "image" as const })),
  ];
  const totalDurationSeconds = selectedVisualArtifacts.videoArtifacts.reduce(
    (total, artifact) => total + (artifactDurationSeconds(artifact as Doc<"artifacts">) || 4),
    0
  ) + selectedVisualArtifacts.imageArtifacts.length * 4;
  const aspectRatio = args.aspectRatio === "4:5" ||
    args.aspectRatio === "1:1" ||
    args.aspectRatio === "16:9"
    ? args.aspectRatio
    : "9:16";
  const clips = visualArtifacts.map(({ artifact, mediaKind }, index) => ({
    id: `create-agent-${String(artifact._id)}-${index}`,
    sourceId: String(artifact._id),
    title: artifact.title ?? `Clip ${index + 1}`,
    storageUrl: artifact.storageUrl,
    mediaKind,
    mimeType: artifactMimeType(artifact as Doc<"artifacts">),
    artifactId: artifact._id as Id<"artifacts">,
    durationSeconds: artifactDurationSeconds(artifact as Doc<"artifacts">) ??
      (mediaKind === "image" ? 4 : undefined),
    trimEndSeconds: mediaKind === "image"
      ? artifactDurationSeconds(artifact as Doc<"artifacts">) ?? 4
      : undefined,
    trimStartSeconds: 0,
  }));
  let elapsed = 0;
  const clipBoundariesSeconds = clips.map((clip) => {
    elapsed += clip.durationSeconds ?? 4;
    return elapsed;
  });

  return {
    aspectRatio,
    audioTracks: (args.audioArtifacts ?? []).map((artifact, index) => ({
      id: `create-agent-audio-${String(artifact._id)}-${index}`,
      sourceId: String(artifact._id),
      title: artifact.title ?? `Audio ${index + 1}`,
      storageUrl: artifact.storageUrl,
      mimeType: artifactMimeType(artifact as Doc<"artifacts">),
      artifactId: artifact._id as Id<"artifacts">,
      startSeconds: 0,
      durationSeconds: artifactDurationSeconds(artifact as Doc<"artifacts">),
      trimStartSeconds: 0,
      volume: 1,
    })),
    clips,
    textOverlays: buildStudioTextOverlaysFromInput(args.input, totalDurationSeconds, {
      aspectRatio,
      clipBoundariesSeconds,
    }),
  };
}
