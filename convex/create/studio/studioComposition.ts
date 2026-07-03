import type { Doc, Id } from "../../_generated/dataModel";
import { artifactDurationSeconds, artifactMimeType, isRecord } from "../references/referenceResolution";
import {
  clampNumber,
  finiteNumber,
  normalizeMediaTextOverlayBlock,
  optionalText,
  type TimedMediaTextOverlayBlock,
} from "../../lib/mediaTextOverlays";

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

function defaultOverlayFrame(index: number, total: number) {
  if (total <= 1) return { y: 72, height: 12 };
  if (index === 0) return { y: 12, height: 12 };
  if (index === total - 1) return { y: 76, height: 12 };
  return { y: 44, height: 12 };
}

function buildTextOverlay(args: {
  index: number;
  record: Record<string, unknown>;
  text: string;
  total: number;
  totalDurationSeconds: number;
}): TimedMediaTextOverlayBlock {
  const segmentDuration = args.total > 0
    ? args.totalDurationSeconds / args.total
    : args.totalDurationSeconds;
  const defaultStart = segmentDuration * args.index;
  const defaultEnd = args.index === args.total - 1
    ? args.totalDurationSeconds
    : segmentDuration * (args.index + 1);
  const startSeconds = clampNumber(
    args.record.startSeconds ?? args.record.start,
    defaultStart,
    0,
    args.totalDurationSeconds
  );
  const endCandidate = finiteNumber(args.record.endSeconds) ?? finiteNumber(args.record.end) ?? defaultEnd;
  const endSeconds = clampNumber(endCandidate, defaultEnd, startSeconds + 0.1, args.totalDurationSeconds);
  const frame = defaultOverlayFrame(args.index, args.total);
  const emphasis = args.index === 0 ? "primary" : "secondary";
  const block = normalizeMediaTextOverlayBlock(
    {
      ...args.record,
      id: optionalText(args.record.id) ?? `create-agent-text-${args.index + 1}`,
      role: args.index === 0 ? "headline" : "body",
      text: args.text,
      items: [],
      emphasis,
      x: finiteNumber(args.record.x) ?? 8,
      y: finiteNumber(args.record.y) ?? frame.y,
      width: finiteNumber(args.record.width) ?? 84,
      height: finiteNumber(args.record.height) ?? frame.height,
      fontSize: finiteNumber(args.record.fontSize) ?? (emphasis === "primary" ? 68 : 46),
      fontWeight: finiteNumber(args.record.fontWeight) ?? (emphasis === "primary" ? 850 : 760),
      strokeWidth: finiteNumber(args.record.strokeWidth) ?? (emphasis === "primary" ? 8 : 5),
    },
    args.index,
    { defaultIdPrefix: "create-agent-text" }
  );
  if (!block) {
    throw new Error("Text overlay is missing text");
  }
  return {
    ...block,
    startSeconds,
    endSeconds,
  };
}

export function buildStudioTextOverlaysFromInput(
  input: Record<string, unknown>,
  totalDurationSeconds: number
) {
  const items = overlayTextItems(input).slice(0, 6);
  if (!items.length) return [];
  const safeDuration = Math.max(0.5, totalDurationSeconds);
  return items.map((item, index) =>
    buildTextOverlay({
      index,
      record: item.record,
      text: item.text,
      total: items.length,
      totalDurationSeconds: safeDuration,
    })
  );
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
    clips: visualArtifacts.map(({ artifact, mediaKind }, index) => ({
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
    })),
    textOverlays: buildStudioTextOverlaysFromInput(args.input, totalDurationSeconds),
  };
}
