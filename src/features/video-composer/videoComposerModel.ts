import type { Id } from "../../../convex/_generated/dataModel";
import type { LibraryOutput } from "../library/libraryTypes";
import {
  createTextOverlayBlock,
  withAutoTextOverlayBlockHeight,
  type TextOverlayBlock,
} from "../../lib/composition/textOverlays";
import type { CompositionAspectRatio } from "../../lib/composition/aspectRatios";
import { dimensionsForAspectRatio } from "../../lib/composition/aspectRatios";

export type VideoComposerClip = {
  id: string;
  title: string;
  storageUrl: string;
  mimeType?: string;
  artifactId?: Id<"artifacts">;
  creativeAssetId?: Id<"creativeAssets">;
  durationSeconds?: number;
  trimStartSeconds: number;
  trimEndSeconds?: number;
};

export type TimedTextOverlay = TextOverlayBlock & {
  startSeconds: number;
  endSeconds?: number;
};

export type VideoCompositionDraft = {
  aspectRatio: CompositionAspectRatio;
  clips: VideoComposerClip[];
  textOverlays: TimedTextOverlay[];
};

export function clipFromLibraryOutput(output: LibraryOutput): VideoComposerClip {
  return {
    id: output.id,
    title: output.title,
    storageUrl: output.storageUrl,
    mimeType: output.mimeType,
    artifactId: output.artifactId,
    creativeAssetId: output.creativeAssetId,
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
        text: index === 0 ? "Tap into the final edit" : "Add context here",
        y: index === 0 ? 12 : 72,
      },
      dimensions,
      index
    ),
    startSeconds: 0,
  };
}

export function clipDuration(clip: VideoComposerClip) {
  if (!clip.durationSeconds || !Number.isFinite(clip.durationSeconds)) return 0;
  const end = clip.trimEndSeconds ?? clip.durationSeconds;
  return Math.max(0, end - clip.trimStartSeconds);
}

export function compositionDuration(clips: VideoComposerClip[]) {
  return clips.reduce((total, clip) => total + clipDuration(clip), 0);
}

export function clipStartTime(clips: VideoComposerClip[], clipId: string) {
  let cursor = 0;
  for (const clip of clips) {
    if (clip.id === clipId) return cursor;
    cursor += clipDuration(clip);
  }
  return 0;
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

export function formatTimelineTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}
