import type { Id } from "../../../convex/_generated/dataModel";
import type { LibraryOutput } from "../library/libraryTypes";
import {
  createTextOverlayBlock,
  withAutoTextOverlayBlockHeight,
  type TextOverlayBlock,
} from "../../lib/composition/textOverlays";
import type { CompositionAspectRatio } from "../../lib/composition/aspectRatios";
import { dimensionsForAspectRatio } from "../../lib/composition/aspectRatios";

export type ClipTransitionType = "cut" | "crossfade" | "dip_to_black" | "dip_to_white" | "whip";

export type ClipTransition = {
  type: ClipTransitionType;
  durationSeconds: number;
};

export type ClipKenBurnsDirection = "zoom_in" | "zoom_out" | "pan_left" | "pan_right";

export type ClipKenBurns = {
  direction: ClipKenBurnsDirection;
  intensity: "subtle" | "medium";
};

export type VideoComposerClip = {
  id: string;
  sourceId: string;
  title: string;
  storageUrl: string;
  mediaKind?: "image" | "video";
  mimeType?: string;
  artifactId?: Id<"artifacts">;
  creativeAssetId?: Id<"creativeAssets">;
  durationSeconds?: number;
  trimStartSeconds: number;
  trimEndSeconds?: number;
  transitionToNext?: ClipTransition;
  kenBurns?: ClipKenBurns;
};

export type AudioTrackRole = "voiceover" | "music" | "sfx";

export type AudioTrackDucking = {
  enabled: boolean;
  duckVolume: number;
};

export type VideoComposerAudioTrack = {
  id: string;
  sourceId: string;
  title: string;
  storageUrl: string;
  mimeType?: string;
  artifactId?: Id<"artifacts">;
  creativeAssetId?: Id<"creativeAssets">;
  startSeconds: number;
  durationSeconds?: number;
  trimStartSeconds: number;
  trimEndSeconds?: number;
  volume: number;
  role?: AudioTrackRole;
  ducking?: AudioTrackDucking;
};

export type TimedTextOverlay = TextOverlayBlock & {
  startSeconds: number;
  endSeconds?: number;
};

export type CaptionWord = {
  text: string;
  startSeconds: number;
  endSeconds: number;
};

export type CaptionSegment = {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  words?: CaptionWord[];
};

export type CaptionStylePreset = "clean_bold" | "karaoke_highlight" | "boxed_lines";

export type CompositionCaptions = {
  segments: CaptionSegment[];
  stylePreset: CaptionStylePreset;
  zone: "center" | "bottom";
};

export type VideoCompositionDraft = {
  aspectRatio: CompositionAspectRatio;
  audioTracks: VideoComposerAudioTrack[];
  clips: VideoComposerClip[];
  textOverlays: TimedTextOverlay[];
  captions?: CompositionCaptions;
};

export const CLIP_TRANSITION_TYPES: ClipTransitionType[] = [
  "cut",
  "crossfade",
  "dip_to_black",
  "dip_to_white",
  "whip",
];

export const MIN_TRANSITION_SECONDS = 0.2;
export const MAX_TRANSITION_SECONDS = 1.0;
export const DEFAULT_TRANSITION_SECONDS = 0.5;

// "cut" carries no timing so it normalizes to undefined (the absence of a transition).
export function normalizeClipTransition(value: unknown): ClipTransition | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : undefined;
  if (!type || type === "cut" || !CLIP_TRANSITION_TYPES.includes(type as ClipTransitionType)) {
    return undefined;
  }
  const requested = typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds)
    ? record.durationSeconds
    : DEFAULT_TRANSITION_SECONDS;
  return {
    type: type as ClipTransitionType,
    durationSeconds: type === "whip"
      ? 0.3
      : Math.min(MAX_TRANSITION_SECONDS, Math.max(MIN_TRANSITION_SECONDS, requested)),
  };
}

// Ken Burns only applies to still images; video clips ignore it.
export function normalizeClipKenBurns(
  clip: Pick<VideoComposerClip, "mediaKind" | "mimeType" | "storageUrl">,
  value: unknown
): ClipKenBurns | undefined {
  if (mediaKindForClip(clip) !== "image") return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const direction = record.direction;
  if (
    direction !== "zoom_in" &&
    direction !== "zoom_out" &&
    direction !== "pan_left" &&
    direction !== "pan_right"
  ) {
    return undefined;
  }
  return {
    direction,
    intensity: record.intensity === "medium" ? "medium" : "subtle",
  };
}

export const DEFAULT_DUCK_VOLUME = 0.25;

export function audioTrackRole(track: Pick<VideoComposerAudioTrack, "role">): AudioTrackRole {
  return track.role === "music" || track.role === "sfx" ? track.role : "voiceover";
}

export function normalizeAudioDucking(value: unknown): AudioTrackDucking | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.enabled !== true) return undefined;
  const duckVolume = typeof record.duckVolume === "number" && Number.isFinite(record.duckVolume)
    ? Math.min(1, Math.max(0, record.duckVolume))
    : DEFAULT_DUCK_VOLUME;
  return { enabled: true, duckVolume };
}

export function normalizeCaptionSegments(
  value: unknown,
  totalDurationSeconds: number
): CaptionSegment[] {
  if (!Array.isArray(value)) return [];
  const safeDuration = Math.max(0.5, totalDurationSeconds);
  return value
    .flatMap((item, index): CaptionSegment[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim().slice(0, 200) : "";
      if (!text) return [];
      const startSeconds = typeof record.startSeconds === "number" && Number.isFinite(record.startSeconds)
        ? Math.min(Math.max(0, record.startSeconds), safeDuration)
        : 0;
      const endCandidate = typeof record.endSeconds === "number" && Number.isFinite(record.endSeconds)
        ? record.endSeconds
        : startSeconds + 2;
      const endSeconds = Math.min(safeDuration, Math.max(startSeconds + 0.2, endCandidate));
      const words = Array.isArray(record.words)
        ? record.words.flatMap((word): CaptionWord[] => {
            if (!word || typeof word !== "object" || Array.isArray(word)) return [];
            const wordRecord = word as Record<string, unknown>;
            const wordText = typeof wordRecord.text === "string" ? wordRecord.text.trim() : "";
            const wordStart = typeof wordRecord.startSeconds === "number" ? wordRecord.startSeconds : NaN;
            const wordEnd = typeof wordRecord.endSeconds === "number" ? wordRecord.endSeconds : NaN;
            if (!wordText || !Number.isFinite(wordStart) || !Number.isFinite(wordEnd)) return [];
            return [{ text: wordText, startSeconds: wordStart, endSeconds: wordEnd }];
          })
        : undefined;
      return [{
        id: typeof record.id === "string" && record.id ? record.id.slice(0, 64) : `caption-${index + 1}`,
        text,
        startSeconds,
        endSeconds,
        ...(words?.length ? { words } : {}),
      }];
    })
    .slice(0, 200);
}

export function normalizeCompositionCaptions(
  value: unknown,
  totalDurationSeconds: number
): CompositionCaptions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const segments = normalizeCaptionSegments(record.segments, totalDurationSeconds);
  if (!segments.length) return undefined;
  const stylePreset: CaptionStylePreset =
    record.stylePreset === "karaoke_highlight" || record.stylePreset === "boxed_lines"
      ? record.stylePreset
      : "clean_bold";
  return {
    segments,
    stylePreset,
    zone: record.zone === "center" ? "center" : "bottom",
  };
}

export const DEFAULT_IMAGE_CLIP_DURATION_SECONDS = 4;

export function createEmptyVideoCompositionDraft(): VideoCompositionDraft {
  return {
    aspectRatio: "9:16",
    audioTracks: [],
    clips: [],
    textOverlays: [],
  };
}

export function mediaKindForClip(clip: Pick<VideoComposerClip, "mediaKind" | "mimeType" | "storageUrl">) {
  if (clip.mediaKind === "image" || clip.mediaKind === "video") return clip.mediaKind;
  if (clip.mimeType?.startsWith("image/")) return "image";
  if (clip.mimeType?.startsWith("video/")) return "video";
  if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(clip.storageUrl)) return "image";
  return "video";
}

export function clipFromLibraryOutput(output: LibraryOutput): VideoComposerClip {
  const mediaKind = output.mimeType?.startsWith("image/") || output.type === "image"
    ? "image"
    : "video";
  return {
    id: `${output.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    sourceId: output.id,
    title: output.title,
    storageUrl: output.storageUrl,
    mediaKind,
    mimeType: output.mimeType,
    artifactId: output.artifactId,
    creativeAssetId: output.creativeAssetId,
    durationSeconds: mediaKind === "image" ? DEFAULT_IMAGE_CLIP_DURATION_SECONDS : undefined,
    trimEndSeconds: mediaKind === "image" ? DEFAULT_IMAGE_CLIP_DURATION_SECONDS : undefined,
    trimStartSeconds: 0,
  };
}

export function createTimedTextOverlay(index: number): TimedTextOverlay {
  const dimensions = dimensionsForAspectRatio("9:16");
  const block = createTextOverlayBlock(index);
  return {
    ...withAutoTextOverlayBlockHeight(
      {
        ...block,
        id: `video-text-${Date.now()}-${index + 1}`,
        text: index === 0 ? "Default text" : "Add context here",
        y: index === 0 ? 12 : 72,
      },
      dimensions,
      index
    ),
    startSeconds: 0,
  };
}

export function clipDuration(clip: VideoComposerClip) {
  const fallbackDuration = mediaKindForClip(clip) === "image"
    ? DEFAULT_IMAGE_CLIP_DURATION_SECONDS
    : 0;
  if (!clip.durationSeconds || !Number.isFinite(clip.durationSeconds)) return fallbackDuration;
  const trim = normalizedClipTrim(clip);
  return Math.max(0, trim.endSeconds - trim.startSeconds);
}

export function audioTrackDuration(track: VideoComposerAudioTrack) {
  if (!track.durationSeconds || !Number.isFinite(track.durationSeconds)) return 0;
  const duration = Math.max(0, track.durationSeconds);
  const startSeconds = Math.min(
    Math.max(0, track.trimStartSeconds),
    Math.max(0, duration - 0.1)
  );
  const endSeconds = Math.min(
    duration,
    Math.max(startSeconds + 0.1, track.trimEndSeconds ?? duration)
  );
  return Math.max(0, endSeconds - startSeconds);
}

export function audioTrackEndTime(track: VideoComposerAudioTrack) {
  return Math.max(0, track.startSeconds) + audioTrackDuration(track);
}

export function compositionDuration(clips: VideoComposerClip[]) {
  return clips.reduce((total, clip) => total + clipDuration(clip), 0);
}

export function compositionTimelineDuration(
  clips: VideoComposerClip[],
  audioTracks: VideoComposerAudioTrack[] = []
) {
  return Math.max(
    compositionDuration(clips),
    ...audioTracks.map(audioTrackEndTime),
    0
  );
}

export function clipStartTime(clips: VideoComposerClip[], clipId: string) {
  let cursor = 0;
  for (const clip of clips) {
    if (clip.id === clipId) return cursor;
    cursor += clipDuration(clip);
  }
  return 0;
}

export function normalizedClipTrim(clip: VideoComposerClip) {
  const duration = Math.max(
    0,
    clip.durationSeconds ??
      (mediaKindForClip(clip) === "image" ? DEFAULT_IMAGE_CLIP_DURATION_SECONDS : 0)
  );
  const startSeconds = Math.min(
    Math.max(0, clip.trimStartSeconds),
    Math.max(0, duration - 0.1)
  );
  const endSeconds = Math.min(
    duration,
    Math.max(startSeconds + 0.1, clip.trimEndSeconds ?? duration)
  );
  return { startSeconds, endSeconds };
}

export function normalizedAudioTrim(track: VideoComposerAudioTrack) {
  const duration = Math.max(0, track.durationSeconds ?? 0);
  const startSeconds = Math.min(
    Math.max(0, track.trimStartSeconds),
    Math.max(0, duration - 0.1)
  );
  const endSeconds = Math.min(
    duration,
    Math.max(startSeconds + 0.1, track.trimEndSeconds ?? duration)
  );
  return { startSeconds, endSeconds };
}

export function clipAtTimelineTime(clips: VideoComposerClip[], timeSeconds: number) {
  const totalDuration = compositionDuration(clips);
  const clampedTime = Math.min(Math.max(timeSeconds, 0), totalDuration);
  let cursor = 0;
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    const duration = clipDuration(clip);
    const end = cursor + duration;
    const isLastClip = index === clips.length - 1;
    if (clampedTime < end || isLastClip) {
      return {
        clip,
        clipIndex: index,
        clipStartSeconds: cursor,
        localSeconds: Math.min(duration, Math.max(0, clampedTime - cursor)),
      };
    }
    cursor = end;
  }
  return null;
}

export function clampTimelineTime(clips: VideoComposerClip[], timeSeconds: number) {
  const duration = compositionDuration(clips);
  if (duration <= 0) return 0;
  return Math.min(duration, Math.max(0, timeSeconds));
}

export function activeTextOverlaysAtTime(
  overlays: TimedTextOverlay[],
  timeSeconds: number,
  fallbackDurationSeconds: number
) {
  return overlays.filter((overlay) => {
    const start = overlay.startSeconds ?? 0;
    const end = overlay.endSeconds ?? fallbackDurationSeconds;
    return timeSeconds >= start && timeSeconds <= end;
  });
}

export function formatTimelineTime(seconds: number, decimalPlaces = 0) {
  if (!Number.isFinite(seconds)) return decimalPlaces > 0 ? `0:00.${"0".repeat(decimalPlaces)}` : "0:00";
  if (decimalPlaces <= 0) {
    if (seconds <= 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }
  const scale = 10 ** decimalPlaces;
  const totalUnits = Math.max(0, Math.round(seconds * scale));
  const minutes = Math.floor(totalUnits / (60 * scale));
  const remainingUnits = totalUnits - minutes * 60 * scale;
  const wholeSeconds = Math.floor(remainingUnits / scale);
  const fractionalSeconds = remainingUnits % scale;
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${String(fractionalSeconds).padStart(decimalPlaces, "0")}`;
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}
