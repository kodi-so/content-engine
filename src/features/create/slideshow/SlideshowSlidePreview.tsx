import { useEffect, useRef, useState } from "react";
import { EditableTextOverlayBlock } from "../../../components/composition/EditableTextOverlayBlock";
import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SlideshowTextBlock,
} from "../../../types";
import { normalizedTextBlocks } from "./slideshowEditorModel";
import {
  slideshowCssAspectRatio,
  slideshowDimensionsForSpec,
} from "../../../lib/slideshowRendering";

export type SlidePreviewMode = "stage" | "thumb";

export function SlidePreview({
  mode,
  onChangeBlock,
  onSelectBlock,
  selectedBlockId,
  slide,
  spec,
  textBlocks,
}: {
  mode: SlidePreviewMode;
  onChangeBlock?: (blockId: string, patch: Partial<SlideshowTextBlock>) => void;
  onSelectBlock?: (blockId: string) => void;
  selectedBlockId?: string;
  slide: CanonicalSlideshowSlide;
  spec: CanonicalSlideshowSpec;
  textBlocks?: SlideshowTextBlock[];
}) {
  const isFullGraphic =
    spec.renderingMode === "full_graphic_generation" ||
    slide.renderingMode === "full_graphic_generation";
  const dimensions = slideshowDimensionsForSpec(spec, slide);
  const blocks = textBlocks ?? normalizedTextBlocks(slide, spec);
  const [stageScale, setStageScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const isEditable = mode === "stage" && Boolean(onChangeBlock && onSelectBlock);

  useEffect(() => {
    if (mode !== "stage") return;
    const element = containerRef.current;
    if (!element) return;
    const updateScale = () => {
      const width = element.getBoundingClientRect().width;
      if (width > 0) setStageScale(width / dimensions.width);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, [dimensions.width, mode]);

  return (
    <div
      data-slide-preview
      ref={containerRef}
      className={[
        "relative w-full overflow-hidden bg-[#111513]",
        mode === "stage"
          ? "aspect-[9/16] rounded-[var(--radius-sm)] shadow-[0_18px_42px_rgba(15,23,42,0.16)]"
          : "aspect-square rounded-[0.45rem]",
      ].join(" ")}
      style={mode === "stage" ? { aspectRatio: slideshowCssAspectRatio(dimensions) } : undefined}
    >
      <div
        data-text-overlay-stage
        className="absolute left-0 top-0 overflow-hidden"
        style={
          mode === "stage"
            ? {
                width: dimensions.width,
                height: dimensions.height,
                transform: `scale(${stageScale})`,
                transformOrigin: "left top",
              }
            : { width: "100%", height: "100%" }
        }
      >
        {slide.backgroundImageUrl ? (
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            src={slide.backgroundImageUrl}
          />
        ) : null}
        {!isFullGraphic ? <div className="absolute inset-0 bg-black/30" /> : null}
        {!isFullGraphic && mode === "stage"
          ? blocks.map((block, index) => (
            <EditableTextOverlayBlock
              block={block}
              dimensions={dimensions}
              index={index}
              isEditable={isEditable}
              isSelected={(block.id ?? "text") === selectedBlockId}
              key={block.id ?? "text"}
              onChangeBlock={onChangeBlock}
              onSelectBlock={onSelectBlock}
              stageScale={stageScale}
            />
          ))
        : null}
      </div>
      {mode === "thumb" ? (
        <div className="absolute left-1 top-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[0.55rem] font-[760] text-white">
          {slide.index}
        </div>
      ) : null}
    </div>
  );
}
