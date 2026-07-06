import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditableTextOverlayBlock } from "../../components/composition/EditableTextOverlayBlock";
import {
  cssAspectRatio,
  dimensionsForAspectRatio,
} from "../../lib/composition/aspectRatios";
import type { TextOverlayBlock } from "../../lib/composition/textOverlays";
import {
  activeTextOverlaysAtTime,
  audioTrackEndTime,
  clampTimelineTime,
  clipAtTimelineTime,
  clipDuration,
  compositionTimelineDuration,
  formatTimelineTime,
  mediaKindForClip,
  normalizedAudioTrim,
  normalizedClipTrim,
  type CompositionCaptions,
  type TimedTextOverlay,
  type VideoComposerAudioTrack,
  type VideoComposerClip,
} from "./videoComposerModel";
import { CaptionsLayer } from "./remotion/CaptionsLayer";
import { platformSafeInsets } from "../../../convex/lib/overlayLayoutDesigner";
import type { CompositionAspectRatio } from "../../lib/composition/aspectRatios";

// Dashed outline of the platform-safe region (outside it, TikTok/Reels UI
// chrome covers the video). Render-only guide; never exported.
function SafeAreaGuide({
  aspectRatio,
  dimensions,
}: {
  aspectRatio: string;
  dimensions: { width: number; height: number };
}) {
  const insets = platformSafeInsets(aspectRatio);
  return (
    <div
      style={{
        position: "absolute",
        left: (insets.left / 100) * dimensions.width,
        top: (insets.top / 100) * dimensions.height,
        width: dimensions.width * (1 - (insets.left + insets.right) / 100),
        height: dimensions.height * (1 - (insets.top + insets.bottom) / 100),
        border: "2px dashed rgba(255, 255, 255, 0.65)",
        borderRadius: 8,
        boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.25)",
        pointerEvents: "none",
      }}
    />
  );
}

export function VideoComposerPreview({
  audioTracks,
  aspectRatio,
  captions,
  clips,
  isPlaying,
  onPlayheadChange,
  onPlayingChange,
  playheadSeconds,
  selectedTextId,
  showSafeArea,
  onChangeText,
  onSelectText,
  textOverlays,
}: {
  audioTracks: VideoComposerAudioTrack[];
  aspectRatio: CompositionAspectRatio;
  captions?: CompositionCaptions;
  clips: VideoComposerClip[];
  isPlaying: boolean;
  onChangeText?: (textId: string, patch: Partial<TextOverlayBlock>) => void;
  onPlayheadChange: (timeSeconds: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onSelectText?: (textId: string) => void;
  playheadSeconds: number;
  selectedTextId?: string;
  showSafeArea?: boolean;
  textOverlays: TimedTextOverlay[];
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const activeClipIdRef = useRef("");
  const [stageScale, setStageScale] = useState(1);
  const dimensions = dimensionsForAspectRatio(aspectRatio);
  const totalDuration = compositionTimelineDuration(clips, audioTracks);
  const timelineFrame = clipAtTimelineTime(clips, clampTimelineTime(clips, playheadSeconds));
  const activeClip = timelineFrame?.clip;
  const activeClipTrim = activeClip ? normalizedClipTrim(activeClip) : undefined;
  const sourceTime = activeClip && activeClipTrim
    ? activeClipTrim.startSeconds + (timelineFrame?.localSeconds ?? 0)
    : 0;
  const activeOverlays = useMemo(
    () => activeTextOverlaysAtTime(textOverlays, playheadSeconds, totalDuration),
    [playheadSeconds, textOverlays, totalDuration]
  );
  const togglePlayback = () => {
    if (clips.length === 0) return;
    if (!isPlaying && playheadSeconds >= totalDuration) onPlayheadChange(0);
    onPlayingChange(!isPlaying);
  };

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const updateScale = () => {
      const width = element.getBoundingClientRect().width;
      if (width > 0) setStageScale(width / dimensions.width);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, [dimensions.width]);

  useEffect(() => {
    if (!activeClip) return;
    if (mediaKindForClip(activeClip) === "image") return;
    const video = videoRefs.current.get(activeClip.id);
    if (!video) return;
    const clipChanged = activeClipIdRef.current !== activeClip.id;
    for (const [clipId, clipVideo] of videoRefs.current) {
      if (clipId !== activeClip.id) clipVideo.pause();
    }
    if (clipChanged) {
      activeClipIdRef.current = activeClip.id;
      const seekAndPlay = () => {
        video.currentTime = sourceTime;
        if (isPlaying) {
          void video.play().catch(() => onPlayingChange(false));
        }
      };
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        seekAndPlay();
      } else {
        video.addEventListener("loadedmetadata", seekAndPlay, { once: true });
        return () => video.removeEventListener("loadedmetadata", seekAndPlay);
      }
      return;
    }

    if (!isPlaying && Math.abs(video.currentTime - sourceTime) > 0.05) {
      video.currentTime = sourceTime;
    }
    if (isPlaying) {
      void video.play().catch(() => onPlayingChange(false));
    } else {
      video.pause();
    }
  }, [activeClip, isPlaying, onPlayingChange, sourceTime]);

  useEffect(() => {
    if (!activeClip || mediaKindForClip(activeClip) !== "image" || !isPlaying || !timelineFrame) return;
    let animationFrame = 0;
    const startedAt = performance.now();
    const initialPlayheadSeconds = playheadSeconds;
    const tick = () => {
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      const nextTime = initialPlayheadSeconds + elapsedSeconds;
      const boundary = timelineFrame.clipStartSeconds + clipDuration(timelineFrame.clip);
      if (nextTime >= boundary) {
        if (boundary >= totalDuration) {
          onPlayingChange(false);
          onPlayheadChange(totalDuration);
        } else {
          onPlayheadChange(boundary);
        }
        return;
      }
      onPlayheadChange(nextTime);
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    activeClip,
    isPlaying,
    onPlayheadChange,
    onPlayingChange,
    playheadSeconds,
    timelineFrame,
    totalDuration,
  ]);

  useEffect(() => {
    for (const track of audioTracks) {
      const audio = audioRefs.current.get(track.id);
      if (!audio) continue;
      const durationSeconds = track.durationSeconds ?? audio.duration;
      const trackEnd = audioTrackEndTime({ ...track, durationSeconds });
      const trim = normalizedAudioTrim({ ...track, durationSeconds });
      const isActive = isPlaying &&
        playheadSeconds >= track.startSeconds &&
        playheadSeconds <= trackEnd;

      if (!isActive) {
        audio.pause();
        continue;
      }

      const sourceTime = trim.startSeconds + (playheadSeconds - track.startSeconds);
      audio.volume = Math.max(0, Math.min(1, track.volume ?? 1));
      if (Number.isFinite(sourceTime) && Math.abs(audio.currentTime - sourceTime) > 0.12) {
        audio.currentTime = Math.max(trim.startSeconds, Math.min(trim.endSeconds, sourceTime));
      }
      void audio.play().catch(() => onPlayingChange(false));
    }
  }, [audioTracks, isPlaying, onPlayingChange, playheadSeconds]);

  return (
    <div className="grid min-w-0 gap-3">
      <div
        className="relative mx-auto grid h-[min(66vh,36rem)] min-h-[20rem] max-h-full max-w-full cursor-pointer justify-self-center overflow-hidden rounded-[var(--radius-sm)] bg-[#111513] shadow-[0_18px_42px_rgba(15,23,42,0.16)]"
        onClick={togglePlayback}
        ref={frameRef}
        style={{ aspectRatio: cssAspectRatio(dimensions) }}
      >
        {clips.length > 0 ? (
          clips.map((clip) => {
            const className = [
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-75",
              activeClip?.id === clip.id ? "opacity-100" : "opacity-0",
            ].join(" ");
            if (mediaKindForClip(clip) === "image") {
              return (
                <img
                  alt={clip.title}
                  className={className}
                  crossOrigin="anonymous"
                  key={clip.id}
                  src={clip.storageUrl}
                />
              );
            }

            return (
              <video
                className={className}
                crossOrigin="anonymous"
                key={clip.id}
                muted={false}
                onEnded={() => {
                  if (activeClip?.id !== clip.id) return;
                  const nextTime = timelineFrame
                    ? timelineFrame.clipStartSeconds + clipDuration(timelineFrame.clip)
                    : clampTimelineTime(clips, playheadSeconds + 0.05);
                  if (nextTime >= totalDuration) {
                    onPlayingChange(false);
                    onPlayheadChange(totalDuration);
                    return;
                  }
                  onPlayheadChange(nextTime);
                }}
                onTimeUpdate={(event) => {
                  if (activeClip?.id !== clip.id || !activeClipTrim || !timelineFrame) return;
                  const localSeconds = Math.max(
                    0,
                    event.currentTarget.currentTime - activeClipTrim.startSeconds
                  );
                  const nextTime = timelineFrame.clipStartSeconds + localSeconds;
                  if (event.currentTarget.currentTime >= activeClipTrim.endSeconds) {
                    const boundary = timelineFrame.clipStartSeconds +
                      (activeClipTrim.endSeconds - activeClipTrim.startSeconds);
                    if (boundary >= totalDuration) {
                      onPlayingChange(false);
                      onPlayheadChange(totalDuration);
                    } else {
                      onPlayheadChange(boundary);
                    }
                    return;
                  }
                  onPlayheadChange(clampTimelineTime(clips, nextTime));
                }}
                playsInline
                preload="auto"
                ref={(node) => {
                  if (node) {
                    videoRefs.current.set(clip.id, node);
                  } else {
                    videoRefs.current.delete(clip.id);
                  }
                }}
                src={clip.storageUrl}
              />
            );
          })
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-[0.92rem] font-[680] text-white/70">
            Add media to start composing.
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-black/10" />
        <div
          className="pointer-events-none absolute left-0 top-0"
          data-text-overlay-stage
          style={{
            height: dimensions.height,
            transform: `scale(${stageScale})`,
            transformOrigin: "left top",
            width: dimensions.width,
          }}
        >
          {activeOverlays.map((block, index) => (
            <EditableTextOverlayBlock
              block={block}
              dimensions={dimensions}
              index={index}
              isEditable={Boolean(onChangeText && onSelectText)}
              isSelected={block.id === selectedTextId}
              key={block.id ?? index}
              onChangeBlock={onChangeText}
              onSelectBlock={onSelectText}
              stageScale={stageScale}
            />
          ))}
          {captions ? (
            <CaptionsLayer
              aspectRatio={aspectRatio}
              captions={captions}
              dimensions={dimensions}
              timeSeconds={playheadSeconds}
            />
          ) : null}
          {showSafeArea ? <SafeAreaGuide aspectRatio={aspectRatio} dimensions={dimensions} /> : null}
        </div>
        {activeClip && !isPlaying ? (
          <button
            aria-label="Play stitched preview"
            className="absolute left-1/2 top-1/2 z-10 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 pl-1 text-[#111513] shadow-[0_18px_48px_rgba(0,0,0,0.28)] transition hover:scale-[1.03] hover:bg-white"
            onClick={(event) => {
              event.stopPropagation();
              togglePlayback();
            }}
            type="button"
          >
            <Play fill="currentColor" size={28} />
          </button>
        ) : null}
        {audioTracks.map((track) => (
          <audio
            crossOrigin="anonymous"
            key={track.id}
            preload="auto"
            ref={(node) => {
              if (node) {
                audioRefs.current.set(track.id, node);
              } else {
                audioRefs.current.delete(track.id);
              }
            }}
            src={track.storageUrl}
          />
        ))}
      </div>
      <div className="mx-auto grid w-full max-w-[34rem] gap-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className="text-[0.78rem] font-[760] tabular-nums text-[var(--color-primary)]">
            {formatTimelineTime(playheadSeconds, 2)}
          </span>
          <button
            aria-label={isPlaying ? "Pause stitched preview" : "Play stitched preview"}
            className="grid size-11 place-items-center rounded-full bg-[var(--color-ink)] pl-0.5 text-[var(--color-surface)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={clips.length === 0}
            onClick={togglePlayback}
            type="button"
          >
            {isPlaying ? <Pause size={18} /> : <Play fill="currentColor" size={19} />}
          </button>
          <span className="justify-self-end text-[0.78rem] font-[760] tabular-nums text-[var(--color-ink-muted)]">
            {formatTimelineTime(totalDuration, 2)}
          </span>
        </div>
        <input
          aria-label="Timeline playhead"
          className="h-1 w-full accent-[var(--color-primary)]"
          disabled={clips.length === 0}
          max={Math.max(totalDuration, 0.1)}
          min={0}
          onChange={(event) => {
            onPlayingChange(false);
            onPlayheadChange(Number(event.target.value));
          }}
          step={0.01}
          type="range"
          value={Math.min(playheadSeconds, Math.max(totalDuration, 0.1))}
        />
      </div>
      <p className="m-0 text-center text-[0.76rem] font-[650] text-[var(--color-ink-muted)]">
        {timelineFrame ? `Clip ${timelineFrame.clipIndex + 1} of ${clips.length}` : "Add clips to preview the edit"}
      </p>
    </div>
  );
}
