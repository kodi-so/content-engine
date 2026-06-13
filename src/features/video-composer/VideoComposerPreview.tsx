import { useEffect, useMemo, useRef, useState } from "react";
import {
  cssAspectRatio,
  dimensionsForAspectRatio,
} from "../../lib/composition/aspectRatios";
import {
  TEXT_OVERLAY_FONT_FAMILY,
  hexToRgba,
  textOverlayBlockFrame,
  textOverlayFontSize,
  textOverlayFontWeight,
  textOverlayShadow,
  textOverlayText,
} from "../../lib/composition/textOverlays";
import {
  activeTextOverlaysAtTime,
  clipStartTime,
  compositionDuration,
  type TimedTextOverlay,
  type VideoComposerClip,
} from "./videoComposerModel";
import type { CompositionAspectRatio } from "../../lib/composition/aspectRatios";

export function VideoComposerPreview({
  aspectRatio,
  clips,
  selectedClipId,
  textOverlays,
}: {
  aspectRatio: CompositionAspectRatio;
  clips: VideoComposerClip[];
  selectedClipId?: string;
  textOverlays: TimedTextOverlay[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? clips[0];
  const dimensions = dimensionsForAspectRatio(aspectRatio);
  const [previewTime, setPreviewTime] = useState(0);
  const totalDuration = compositionDuration(clips);
  const clipTimelineStart = selectedClip ? clipStartTime(clips, selectedClip.id) : 0;
  const activeOverlays = useMemo(
    () => activeTextOverlaysAtTime(textOverlays, clipTimelineStart + previewTime, totalDuration),
    [clipTimelineStart, previewTime, textOverlays, totalDuration]
  );

  useEffect(() => {
    setPreviewTime(0);
  }, [selectedClip?.id]);

  return (
    <div className="grid min-w-0 gap-3">
      <div
        className="relative mx-auto grid w-full max-w-[min(54vh,34rem)] overflow-hidden rounded-[var(--radius-sm)] bg-[#111513] shadow-[0_18px_42px_rgba(15,23,42,0.16)]"
        style={{ aspectRatio: cssAspectRatio(dimensions) }}
      >
        {selectedClip ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            controls
            crossOrigin="anonymous"
            onTimeUpdate={(event) => setPreviewTime(event.currentTarget.currentTime)}
            playsInline
            ref={videoRef}
            src={selectedClip.storageUrl}
          />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-[0.92rem] font-[680] text-white/70">
            Add a video clip to start composing.
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-black/10" />
        {activeOverlays.map((block, index) => {
          const frame = textOverlayBlockFrame(block, dimensions);
          const backgroundOpacity = block.backgroundOpacity ?? 1;
          return (
            <div
              className="pointer-events-none absolute"
              key={block.id ?? index}
              style={{
                left: `${(frame.x / dimensions.width) * 100}%`,
                minHeight: `${(frame.minHeight / dimensions.height) * 100}%`,
                textAlign: block.align ?? "center",
                top: `${(frame.y / dimensions.height) * 100}%`,
                width: `${(frame.width / dimensions.width) * 100}%`,
              }}
            >
              <span
                className="block whitespace-pre-wrap break-words rounded-[0.45rem] px-[0.18em] py-[0.08em] font-[850] leading-[1.08] [overflow-wrap:anywhere]"
                style={{
                  backgroundColor:
                    block.backgroundStyle === "solid"
                      ? hexToRgba(block.backgroundColor ?? "#FFFFFF", backgroundOpacity)
                      : "transparent",
                  color: block.color ?? "#FFFFFF",
                  fontFamily: TEXT_OVERLAY_FONT_FAMILY,
                  fontSize: `clamp(1rem, ${(textOverlayFontSize(block, index) / dimensions.width) * 100}vw, ${textOverlayFontSize(block, index)}px)`,
                  fontWeight: textOverlayFontWeight(block, index),
                  textShadow: textOverlayShadow(block),
                }}
              >
                {textOverlayText(block)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="m-0 text-center text-[0.78rem] text-[var(--color-ink-muted)]">
        Preview shows overlays at the selected clip’s timeline position.
      </p>
    </div>
  );
}
