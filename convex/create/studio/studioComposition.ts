import type { Doc, Id } from "../../_generated/dataModel";
import { artifactDurationSeconds, artifactMimeType, isRecord } from "../references/referenceResolution";
import {
  optionalText,
} from "../../lib/mediaTextOverlays";
import {
  designTimedOverlayBlocks,
  type OverlayDesignBlockIntent,
} from "../../lib/overlayLayoutDesigner";
import { estimateCaptionSegments } from "../../lib/captionTiming";
import {
  normalizeAudioDucking,
  normalizeClipKenBurns,
  normalizeClipTransition,
  type AudioTrackRole,
  type CaptionStylePreset,
  type CompositionCaptions,
} from "../../../src/features/video-composer/videoComposerModel";

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
  "_id" | "storageUrl" | "title" | "data" | "prompt"
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

// Per-clip planner settings (trims, transition, Ken Burns) arrive as
// input.clips records addressed by artifactId, or by position when no id.
function clipInputRecords(input: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(input.clips) ? input.clips.filter(isRecord) : [];
}

function clipInputForArtifact(
  records: Record<string, unknown>[],
  artifactId: string,
  index: number
): Record<string, unknown> {
  return records.find((record) => optionalText(record.artifactId) === artifactId) ??
    (records[index] && !optionalText(records[index].artifactId) ? records[index] : {});
}

function audioInputRecords(input: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [input.audio, input.audioTracks];
  return candidates.flatMap((candidate) =>
    Array.isArray(candidate) ? candidate.filter(isRecord) : []
  );
}

function audioRoleFromRecord(record: Record<string, unknown>): AudioTrackRole | undefined {
  return record.role === "voiceover" || record.role === "music" || record.role === "sfx"
    ? record.role
    : undefined;
}

function autoCaptionsRequest(input: Record<string, unknown>): Record<string, unknown> | null {
  const value = input.autoCaptions;
  if (value === true || value === "auto") return {};
  if (isRecord(value)) return value;
  return null;
}

function captionStylePresetFromRecord(record: Record<string, unknown>): CaptionStylePreset {
  return record.stylePreset === "karaoke_highlight" || record.stylePreset === "boxed_lines"
    ? record.stylePreset
    : "clean_bold";
}

export function buildAutoCaptionsForVoiceover(args: {
  request: Record<string, unknown>;
  script: string;
  voiceoverDurationSeconds?: number;
}): CompositionCaptions | null {
  const segments = estimateCaptionSegments(args.script, args.voiceoverDurationSeconds);
  if (!segments.length) return null;
  return {
    segments,
    stylePreset: captionStylePresetFromRecord(args.request),
    zone: args.request.zone === "center" ? "center" : "bottom",
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
  const aspectRatio = args.aspectRatio === "4:5" ||
    args.aspectRatio === "1:1" ||
    args.aspectRatio === "16:9"
    ? args.aspectRatio
    : "9:16";
  const clipRecords = clipInputRecords(args.input);
  const clips = visualArtifacts.map(({ artifact, mediaKind }, index) => {
    const record = clipInputForArtifact(clipRecords, String(artifact._id), index);
    const sourceDuration = artifactDurationSeconds(artifact as Doc<"artifacts">);
    const requestedDuration = finiteNumber(record.durationSeconds);
    const durationSeconds = mediaKind === "image"
      ? requestedDuration ?? sourceDuration ?? 4
      : sourceDuration;
    const trimStart = Math.max(0, finiteNumber(record.trimStartSeconds) ?? 0);
    const requestedTrimEnd = finiteNumber(record.trimEndSeconds);
    const trimEndSeconds = mediaKind === "image"
      ? durationSeconds
      : requestedTrimEnd !== undefined && requestedTrimEnd > trimStart
        ? Math.min(requestedTrimEnd, durationSeconds ?? requestedTrimEnd)
        : undefined;
    const clipShape = {
      mediaKind,
      mimeType: artifactMimeType(artifact as Doc<"artifacts">),
      storageUrl: artifact.storageUrl ?? "",
    };
    // Image clips animate by default: static full-frame stills read as broken
    // in short-form video. The planner passes kenBurns: null to force static.
    const kenBurns = record.kenBurns === null
      ? undefined
      : normalizeClipKenBurns(clipShape, record.kenBurns) ??
        (mediaKind === "image"
          ? { direction: "zoom_in" as const, intensity: "subtle" as const }
          : undefined);
    return {
      id: `create-agent-${String(artifact._id)}-${index}`,
      sourceId: String(artifact._id),
      title: artifact.title ?? `Clip ${index + 1}`,
      storageUrl: artifact.storageUrl,
      mediaKind,
      mimeType: artifactMimeType(artifact as Doc<"artifacts">),
      artifactId: artifact._id as Id<"artifacts">,
      durationSeconds,
      trimEndSeconds,
      trimStartSeconds: trimStart,
      transitionToNext: normalizeClipTransition(record.transitionToNext ?? record.transition),
      kenBurns,
    };
  });
  const clipVisibleDuration = (clip: (typeof clips)[number]) => {
    const duration = clip.durationSeconds ?? 4;
    const end = clip.trimEndSeconds !== undefined ? Math.min(clip.trimEndSeconds, duration) : duration;
    return Math.max(0, end - Math.min(clip.trimStartSeconds, end));
  };
  let elapsed = 0;
  const clipBoundariesSeconds = clips.map((clip) => {
    elapsed += clipVisibleDuration(clip);
    return elapsed;
  });
  const totalDurationSeconds = elapsed;

  const audioRecords = audioInputRecords(args.input);
  const audioArtifacts = args.audioArtifacts ?? [];
  const audioTracks = audioArtifacts.map((artifact, index) => {
    const record = clipInputForArtifact(audioRecords, String(artifact._id), index);
    return {
      id: `create-agent-audio-${String(artifact._id)}-${index}`,
      sourceId: String(artifact._id),
      title: artifact.title ?? `Audio ${index + 1}`,
      storageUrl: artifact.storageUrl,
      mimeType: artifactMimeType(artifact as Doc<"artifacts">),
      artifactId: artifact._id as Id<"artifacts">,
      startSeconds: Math.max(0, finiteNumber(record.startSeconds) ?? 0),
      durationSeconds: artifactDurationSeconds(artifact as Doc<"artifacts">),
      trimStartSeconds: 0,
      volume: Math.min(1, Math.max(0, finiteNumber(record.volume) ?? 1)),
      role: audioRoleFromRecord(record) ?? "voiceover",
      ducking: normalizeAudioDucking(record.ducking) ??
        (audioRoleFromRecord(record) === "music"
          ? { enabled: true, duckVolume: 0.25 }
          : undefined),
    };
  });

  const captionsRequest = autoCaptionsRequest(args.input);
  let captions: CompositionCaptions | undefined;
  if (captionsRequest) {
    const voiceoverTrack = audioTracks.find((track) => track.role === "voiceover");
    const voiceoverArtifact = voiceoverTrack
      ? audioArtifacts.find((artifact) => String(artifact._id) === voiceoverTrack.sourceId)
      : undefined;
    const script = voiceoverArtifact?.prompt?.trim();
    if (script) {
      captions = buildAutoCaptionsForVoiceover({
        request: captionsRequest,
        script,
        voiceoverDurationSeconds: voiceoverTrack?.durationSeconds ?? totalDurationSeconds,
      }) ?? undefined;
    }
  }

  return {
    aspectRatio,
    audioTracks,
    clips,
    textOverlays: buildStudioTextOverlaysFromInput(args.input, totalDurationSeconds, {
      aspectRatio,
      clipBoundariesSeconds,
    }),
    ...(captions ? { captions } : {}),
  };
}
