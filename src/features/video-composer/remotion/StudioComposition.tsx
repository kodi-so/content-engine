import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  activeTextOverlaysAtTime,
  audioTrackDuration,
  audioTrackRole,
  clipDuration,
  compositionTimelineDuration,
  DEFAULT_DUCK_VOLUME,
  mediaKindForClip,
  normalizedAudioTrim,
  normalizedClipTrim,
  type ClipKenBurns,
  type ClipTransition,
  type TimedTextOverlay,
  type VideoComposerAudioTrack,
  type VideoCompositionDraft,
} from "../videoComposerModel";
import { dimensionsForAspectRatio } from "../../../lib/composition/aspectRatios";
import {
  TEXT_OVERLAY_FONT_FAMILY,
  textOverlayBlockFrame,
  textOverlayFontSize,
  textOverlayFontWeight,
  textOverlayShadow,
  textOverlayText,
} from "../../../lib/composition/textOverlays";
import { CaptionsLayer } from "./CaptionsLayer";

export const STUDIO_REMOTION_COMPOSITION_ID = "StudioComposition";
export const STUDIO_REMOTION_DEFAULT_FPS = 30;

export type StudioCompositionProps = {
  draft: VideoCompositionDraft;
  fps?: number;
};

export function studioCompositionDimensions(draft: Pick<VideoCompositionDraft, "aspectRatio">) {
  return dimensionsForAspectRatio(draft.aspectRatio);
}

export function studioCompositionDurationInFrames(
  draft: Pick<VideoCompositionDraft, "clips" | "audioTracks">,
  fps = STUDIO_REMOTION_DEFAULT_FPS
) {
  return Math.max(1, Math.ceil(compositionTimelineDuration(draft.clips, draft.audioTracks) * fps));
}

function frameFromSeconds(seconds: number | undefined, fps: number) {
  return Math.max(0, Math.round((seconds ?? 0) * fps));
}

function renderTextOverlay(
  overlay: TimedTextOverlay,
  dimensions: { width: number; height: number },
  index: number
) {
  const text = textOverlayText(overlay);
  if (!text) return null;
  const frame = textOverlayBlockFrame(overlay, dimensions);
  const fontSize = textOverlayFontSize(overlay, index);
  const fontWeight = textOverlayFontWeight(overlay, index);
  const backgroundOpacity = overlay.backgroundOpacity ?? 1;

  return (
    <div
      key={overlay.id ?? `text-${index}`}
      style={{
        position: "absolute",
        left: frame.x,
        top: frame.y,
        width: frame.width,
        minHeight: frame.minHeight,
        alignItems: "center",
        color: overlay.color ?? "#FFFFFF",
        display: "flex",
        fontFamily: TEXT_OVERLAY_FONT_FAMILY,
        fontSize,
        fontWeight,
        justifyContent:
          overlay.align === "left"
            ? "flex-start"
            : overlay.align === "right"
              ? "flex-end"
              : "center",
        lineHeight: 1.08,
        textAlign: overlay.align ?? "center",
        textShadow: textOverlayShadow(overlay),
        whiteSpace: "pre-wrap",
      }}
    >
      <span
        style={{
          background:
            overlay.backgroundStyle === "solid"
              ? overlay.backgroundColor ?? "#FFFFFF"
              : "transparent",
          borderRadius: fontSize * 0.36,
          boxDecorationBreak: "clone",
          opacity: overlay.backgroundStyle === "solid" ? backgroundOpacity : 1,
          padding:
            overlay.backgroundStyle === "solid"
              ? `${fontSize * 0.08}px ${fontSize * 0.18}px`
              : 0,
        }}
      >
        {text}
      </span>
    </div>
  );
}

function kenBurnsTransform(
  kenBurns: ClipKenBurns,
  progress: number
): string {
  const scaleDelta = kenBurns.intensity === "medium" ? 0.12 : 0.05;
  const panDelta = kenBurns.intensity === "medium" ? 6 : 3;
  if (kenBurns.direction === "zoom_in") {
    return `scale(${1 + scaleDelta * progress})`;
  }
  if (kenBurns.direction === "zoom_out") {
    return `scale(${1 + scaleDelta * (1 - progress)})`;
  }
  // Pans keep a slight zoom so the translated image still covers the frame.
  const pan = panDelta * (progress - 0.5);
  const direction = kenBurns.direction === "pan_left" ? -1 : 1;
  return `scale(${1 + scaleDelta}) translateX(${direction * pan}%)`;
}

function StudioClipSequence({
  clip,
  from,
  fps,
  incomingTransition,
}: {
  clip: VideoCompositionDraft["clips"][number];
  from: number;
  fps: number;
  incomingTransition?: ClipTransition;
}) {
  const clipFrames = Math.max(1, frameFromSeconds(clipDuration(clip), fps));
  // Crossfade/whip extend this clip's tail so it stays visible under the next
  // clip's entrance animation; a video source past its end holds its last frame.
  const outgoingTransition = clip.transitionToNext;
  const extendFrames =
    outgoingTransition && (outgoingTransition.type === "crossfade" || outgoingTransition.type === "whip")
      ? frameFromSeconds(outgoingTransition.durationSeconds, fps)
      : 0;
  const trim = normalizedClipTrim(clip);

  return (
    <Sequence from={from} durationInFrames={clipFrames + extendFrames}>
      <ClipEntrance fps={fps} transition={incomingTransition}>
        <AbsoluteFill style={{ backgroundColor: "#000000", overflow: "hidden" }}>
          {mediaKindForClip(clip) === "image" ? (
            <KenBurnsImage clip={clip} clipFrames={clipFrames} />
          ) : (
            <OffthreadVideo
              src={clip.storageUrl}
              startFrom={frameFromSeconds(trim.startSeconds, fps)}
              endAt={frameFromSeconds(trim.endSeconds, fps)}
              style={{
                height: "100%",
                objectFit: "cover",
                width: "100%",
              }}
            />
          )}
        </AbsoluteFill>
      </ClipEntrance>
    </Sequence>
  );
}

function KenBurnsImage({
  clip,
  clipFrames,
}: {
  clip: VideoCompositionDraft["clips"][number];
  clipFrames: number;
}) {
  const frame = useCurrentFrame();
  const progress = Math.min(1, Math.max(0, clipFrames <= 1 ? 0 : frame / clipFrames));
  return (
    <Img
      src={clip.storageUrl}
      style={{
        height: "100%",
        objectFit: "cover",
        width: "100%",
        transform: clip.kenBurns ? kenBurnsTransform(clip.kenBurns, progress) : undefined,
      }}
    />
  );
}

// Entrance animation on the incoming clip for crossfade/whip transitions.
// Frame 0 here is the clip boundary; the previous clip is extended beneath.
function ClipEntrance({
  children,
  fps,
  transition,
}: {
  children: ReactNode;
  fps: number;
  transition?: ClipTransition;
}) {
  const frame = useCurrentFrame();
  if (!transition || (transition.type !== "crossfade" && transition.type !== "whip")) {
    return <>{children}</>;
  }
  const transitionFrames = Math.max(1, frameFromSeconds(transition.durationSeconds, fps));
  const progress = Math.min(1, frame / transitionFrames);
  if (transition.type === "crossfade") {
    return <AbsoluteFill style={{ opacity: progress }}>{children}</AbsoluteFill>;
  }
  const eased = 1 - (1 - progress) ** 3;
  return (
    <AbsoluteFill
      style={{
        transform: `translateX(${(1 - eased) * 100}%)`,
        filter: progress < 1 ? `blur(${(1 - eased) * 14}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

// Dip transitions render as a full-frame color flash centered on the boundary,
// leaving clip timing untouched.
function DipOverlay({
  boundarySeconds,
  color,
  durationSeconds,
  timeSeconds,
}: {
  boundarySeconds: number;
  color: string;
  durationSeconds: number;
  timeSeconds: number;
}) {
  const half = durationSeconds / 2;
  const opacity = interpolate(
    timeSeconds,
    [boundarySeconds - half, boundarySeconds, boundarySeconds + half],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  if (opacity <= 0.01) return null;
  return <AbsoluteFill style={{ backgroundColor: color, opacity, pointerEvents: "none" }} />;
}

type SpeechInterval = { start: number; end: number };

function voiceoverIntervals(audioTracks: VideoComposerAudioTrack[]): SpeechInterval[] {
  return audioTracks
    .filter((track) => audioTrackRole(track) === "voiceover")
    .map((track) => ({
      start: Math.max(0, track.startSeconds),
      end: Math.max(0, track.startSeconds) + audioTrackDuration(track),
    }))
    .filter((interval) => interval.end > interval.start);
}

const DUCK_RAMP_SECONDS = 0.3;

function duckedVolumeAt(
  timeSeconds: number,
  baseVolume: number,
  duckVolume: number,
  intervals: SpeechInterval[]
) {
  let factor = 1;
  for (const interval of intervals) {
    if (timeSeconds < interval.start - DUCK_RAMP_SECONDS || timeSeconds > interval.end + DUCK_RAMP_SECONDS) {
      continue;
    }
    let intervalFactor = 1;
    if (timeSeconds < interval.start) {
      intervalFactor = 1 - (1 - duckVolume) * ((timeSeconds - (interval.start - DUCK_RAMP_SECONDS)) / DUCK_RAMP_SECONDS);
    } else if (timeSeconds > interval.end) {
      intervalFactor = duckVolume + (1 - duckVolume) * ((timeSeconds - interval.end) / DUCK_RAMP_SECONDS);
    } else {
      intervalFactor = duckVolume;
    }
    factor = Math.min(factor, intervalFactor);
  }
  return Math.max(0, Math.min(1, baseVolume * factor));
}

function StudioAudioTrack({
  fps,
  speechIntervals,
  track,
}: {
  fps: number;
  speechIntervals: SpeechInterval[];
  track: VideoComposerAudioTrack;
}) {
  const trim = normalizedAudioTrim(track);
  const durationInFrames = Math.max(1, frameFromSeconds(audioTrackDuration(track), fps));
  const baseVolume = Math.max(0, Math.min(1, track.volume ?? 1));
  const shouldDuck =
    audioTrackRole(track) !== "voiceover" &&
    track.ducking?.enabled === true &&
    speechIntervals.length > 0;
  const duckVolume = track.ducking?.duckVolume ?? DEFAULT_DUCK_VOLUME;

  return (
    <Sequence from={frameFromSeconds(track.startSeconds, fps)} durationInFrames={durationInFrames}>
      <Audio
        src={track.storageUrl}
        startFrom={frameFromSeconds(trim.startSeconds, fps)}
        endAt={frameFromSeconds(trim.endSeconds, fps)}
        volume={
          shouldDuck
            ? (frameInSequence) =>
                duckedVolumeAt(
                  Math.max(0, track.startSeconds) + frameInSequence / fps,
                  baseVolume,
                  duckVolume,
                  speechIntervals
                )
            : baseVolume
        }
      />
    </Sequence>
  );
}

export function StudioComposition({ draft }: StudioCompositionProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const timeSeconds = frame / fps;
  const totalDurationSeconds = compositionTimelineDuration(draft.clips, draft.audioTracks);
  const visibleTextOverlays = activeTextOverlaysAtTime(
    draft.textOverlays,
    timeSeconds,
    totalDurationSeconds
  );
  const speechIntervals = voiceoverIntervals(draft.audioTracks ?? []);

  let clipCursor = 0;
  const clipSequences: ReactNode[] = [];
  const dipOverlays: ReactNode[] = [];
  draft.clips.forEach((clip, index) => {
    const from = clipCursor;
    const previousClip = index > 0 ? draft.clips[index - 1] : undefined;
    clipSequences.push(
      <StudioClipSequence
        key={clip.id}
        clip={clip}
        fps={fps}
        from={from}
        incomingTransition={previousClip?.transitionToNext}
      />
    );
    clipCursor += frameFromSeconds(clipDuration(clip), fps);
    const transition = clip.transitionToNext;
    if (
      transition &&
      (transition.type === "dip_to_black" || transition.type === "dip_to_white") &&
      index < draft.clips.length - 1
    ) {
      dipOverlays.push(
        <DipOverlay
          key={`dip-${clip.id}`}
          boundarySeconds={clipCursor / fps}
          color={transition.type === "dip_to_black" ? "#000000" : "#FFFFFF"}
          durationSeconds={transition.durationSeconds}
          timeSeconds={timeSeconds}
        />
      );
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {clipSequences}
      {(draft.audioTracks ?? []).map((track) => (
        <StudioAudioTrack
          key={track.id}
          fps={fps}
          speechIntervals={speechIntervals}
          track={track}
        />
      ))}
      {dipOverlays}
      {draft.captions ? (
        <CaptionsLayer
          aspectRatio={draft.aspectRatio}
          captions={draft.captions}
          dimensions={{ width, height }}
          timeSeconds={timeSeconds}
        />
      ) : null}
      {visibleTextOverlays.map((overlay, index) =>
        renderTextOverlay(overlay, { width, height }, index)
      )}
    </AbsoluteFill>
  );
}
