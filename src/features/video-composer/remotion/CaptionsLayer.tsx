import { platformSafeInsets } from "../../../../convex/lib/overlayLayoutDesigner";
import { TEXT_OVERLAY_FONT_FAMILY } from "../../../lib/composition/textOverlays";
import type {
  CaptionSegment,
  CompositionCaptions,
} from "../videoComposerModel";

const KARAOKE_ACCENT = "#FFD400";

function activeSegment(captions: CompositionCaptions, timeSeconds: number): CaptionSegment | null {
  return (
    captions.segments.find(
      (segment) => timeSeconds >= segment.startSeconds && timeSeconds <= segment.endSeconds
    ) ?? null
  );
}

function segmentContent(
  segment: CaptionSegment,
  stylePreset: CompositionCaptions["stylePreset"],
  timeSeconds: number
) {
  if (stylePreset !== "karaoke_highlight" || !segment.words?.length) {
    return segment.text;
  }
  return segment.words.map((word, index) => {
    const active = timeSeconds >= word.startSeconds && timeSeconds <= word.endSeconds;
    return (
      <span key={`${word.text}-${index}`} style={{ color: active ? KARAOKE_ACCENT : undefined }}>
        {index > 0 ? " " : ""}
        {word.text}
      </span>
    );
  });
}

export function CaptionsLayer({
  aspectRatio,
  captions,
  dimensions,
  timeSeconds,
}: {
  aspectRatio: string;
  captions: CompositionCaptions;
  dimensions: { width: number; height: number };
  timeSeconds: number;
}) {
  const segment = activeSegment(captions, timeSeconds);
  if (!segment) return null;

  const insets = platformSafeInsets(aspectRatio);
  const fontSize = Math.round(dimensions.height * 0.032);
  const boxed = captions.stylePreset === "boxed_lines";
  const left = (insets.left / 100) * dimensions.width;
  const width = dimensions.width * (1 - (insets.left + insets.right) / 100);

  const positionStyle = captions.zone === "center"
    ? {
        top: dimensions.height * ((insets.top + (100 - insets.top - insets.bottom) / 2) / 100),
        transform: "translateY(-50%)",
      }
    : {
        // Anchor the caption block so it ends at the top edge of the bottom
        // platform-safe inset (caption + action UI zone).
        bottom: (insets.bottom / 100) * dimensions.height + fontSize * 0.5,
      };

  return (
    <div
      style={{
        position: "absolute",
        left,
        width,
        display: "flex",
        justifyContent: "center",
        textAlign: "center",
        ...positionStyle,
      }}
    >
      <span
        style={{
          background: boxed ? "rgba(0, 0, 0, 0.72)" : "transparent",
          borderRadius: boxed ? fontSize * 0.3 : 0,
          boxDecorationBreak: "clone",
          color: "#FFFFFF",
          fontFamily: TEXT_OVERLAY_FONT_FAMILY,
          fontSize,
          fontWeight: 800,
          lineHeight: 1.25,
          padding: boxed ? `${fontSize * 0.18}px ${fontSize * 0.42}px` : 0,
          textShadow: boxed
            ? "none"
            : "0 0 6px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)",
          whiteSpace: "pre-wrap",
        }}
      >
        {segmentContent(segment, captions.stylePreset, timeSeconds)}
      </span>
    </div>
  );
}
