import type { PointerEvent } from "react";
import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SlideshowTextBlock,
} from "../../types";
import {
  blockText,
  hexToRgba,
  normalizedTextBlocks,
  textShadow,
} from "./slideshowEditorModel";

export type SlidePreviewMode = "stage" | "thumb";
type ResizeHandle =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

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
  const blocks = textBlocks ?? normalizedTextBlocks(slide);
  const scale = mode === "stage" ? 0.31 : 0.12;

  return (
    <div
      data-slide-preview
      className={[
        "relative w-full overflow-hidden bg-[#111513]",
        mode === "stage"
          ? "aspect-[9/16] rounded-[var(--radius-sm)] shadow-[0_18px_42px_rgba(15,23,42,0.16)]"
          : "aspect-square rounded-[0.45rem]",
      ].join(" ")}
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
        ? blocks.map((block) => {
            const blockId = block.id ?? "text";
            const isSelected = blockId === selectedBlockId;
            const backgroundOpacity = block.backgroundOpacity ?? 1;
            const fontSize = Math.max(mode === "stage" ? 11 : 6, (block.fontSize ?? 72) * scale);
            const blockContent = (
              <>
                <span
                  className="block whitespace-pre-wrap break-words rounded-[0.45rem] px-[0.18em] py-[0.08em] font-[850] leading-[1.08] [overflow-wrap:anywhere]"
                  style={{
                    backgroundColor:
                      block.backgroundStyle === "solid"
                        ? hexToRgba(block.backgroundColor ?? "#FFFFFF", backgroundOpacity)
                        : "transparent",
                    color: block.color ?? "#FFFFFF",
                    fontSize,
                    fontWeight: block.fontWeight ?? 850,
                    textShadow: textShadow(block),
                  }}
                >
                  {blockText(block)}
                </span>
                {isSelected && mode === "stage" ? (
                  <>
                    <span
                      className="absolute -left-1 -top-1 size-2.5 cursor-nwse-resize rounded-sm border border-white bg-[#2F7BFF]"
                      onPointerDown={(event) => startTextTransform(event, "top-left")}
                    />
                    <span
                      className="absolute left-1/2 -top-1 size-2.5 -translate-x-1/2 cursor-ns-resize rounded-sm border border-white bg-[#2F7BFF]"
                      onPointerDown={(event) => startTextTransform(event, "top")}
                    />
                    <span
                      className="absolute -right-1 -top-1 size-2.5 cursor-nesw-resize rounded-sm border border-white bg-[#2F7BFF]"
                      onPointerDown={(event) => startTextTransform(event, "top-right")}
                    />
                    <span
                      className="absolute -right-1 top-1/2 size-2.5 -translate-y-1/2 cursor-ew-resize rounded-sm border border-white bg-[#2F7BFF]"
                      onPointerDown={(event) => startTextTransform(event, "right")}
                    />
                    <span
                      className="absolute -bottom-1 -right-1 size-2.5 cursor-nwse-resize rounded-sm border border-white bg-[#2F7BFF]"
                      onPointerDown={(event) => startTextTransform(event, "bottom-right")}
                    />
                    <span
                      className="absolute left-1/2 -bottom-1 size-2.5 -translate-x-1/2 cursor-ns-resize rounded-sm border border-white bg-[#2F7BFF]"
                      onPointerDown={(event) => startTextTransform(event, "bottom")}
                    />
                    <span
                      className="absolute -bottom-1 -left-1 size-2.5 cursor-nesw-resize rounded-sm border border-white bg-[#2F7BFF]"
                      onPointerDown={(event) => startTextTransform(event, "bottom-left")}
                    />
                    <span
                      className="absolute -left-1 top-1/2 size-2.5 -translate-y-1/2 cursor-ew-resize rounded-sm border border-white bg-[#2F7BFF]"
                      onPointerDown={(event) => startTextTransform(event, "left")}
                    />
                  </>
                ) : null}
              </>
            );
            const blockClassName = [
              "absolute h-auto border bg-transparent p-0 text-left transition",
              mode === "stage"
                ? "cursor-pointer hover:border-[#2F7BFF]"
                : "pointer-events-none",
              isSelected && mode === "stage"
                ? "border-[#2F7BFF] ring-2 ring-[#2F7BFF]/35"
                : "border-transparent",
            ].join(" ");
            const blockStyle = {
              left: `${block.x ?? 10}%`,
              top: `${block.y ?? 42}%`,
              width: `${block.width ?? 80}%`,
              minHeight: `${block.height ?? 10}%`,
              textAlign: block.align ?? "center",
            } as const;
            function startTextTransform(
              event: PointerEvent<HTMLElement>,
              resizeHandle?: ResizeHandle
            ) {
              event.preventDefault();
              event.stopPropagation();
              onSelectBlock?.(blockId);
              const slideElement = event.currentTarget.closest("[data-slide-preview]");
              if (!(slideElement instanceof HTMLElement)) return;
              const rect = slideElement.getBoundingClientRect();
              const startClientX = event.clientX;
              const startClientY = event.clientY;
              const startX = block.x ?? 10;
              const startY = block.y ?? 42;
              const startWidth = block.width ?? 80;
              const startHeight = block.height ?? 10;
              const clamp = (value: number, min: number, max: number) =>
                Math.min(max, Math.max(min, value));
              const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
                const deltaX = ((moveEvent.clientX - startClientX) / rect.width) * 100;
                const deltaY = ((moveEvent.clientY - startClientY) / rect.height) * 100;
                if (resizeHandle) {
                  let x = startX;
                  let y = startY;
                  let width = startWidth;
                  let height = startHeight;

                  if (resizeHandle.includes("right")) {
                    width = clamp(startWidth + deltaX, 12, 100 - startX);
                  }
                  if (resizeHandle.includes("left")) {
                    x = clamp(startX + deltaX, 0, startX + startWidth - 12);
                    width = clamp(startWidth + (startX - x), 12, 100 - x);
                  }
                  if (resizeHandle.includes("bottom")) {
                    height = clamp(startHeight + deltaY, 4, 100 - startY);
                  }
                  if (resizeHandle.includes("top")) {
                    y = clamp(startY + deltaY, 0, startY + startHeight - 4);
                    height = clamp(startHeight + (startY - y), 4, 100 - y);
                  }

                  onChangeBlock?.(blockId, { x, y, width, height });
                  return;
                }

                onChangeBlock?.(blockId, {
                  x: clamp(startX + deltaX, 0, 100 - startWidth),
                  y: clamp(startY + deltaY, 0, 100 - startHeight),
                });
              };
              const onPointerUp = () => {
                window.removeEventListener("pointermove", onPointerMove);
                window.removeEventListener("pointerup", onPointerUp);
              };
              window.addEventListener("pointermove", onPointerMove);
              window.addEventListener("pointerup", onPointerUp, { once: true });
            }

            return mode === "stage" ? (
              <button
                aria-label={`Edit text block ${blockId}`}
                className={blockClassName}
                key={blockId}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectBlock?.(blockId);
                }}
                onPointerDown={(event) => startTextTransform(event)}
                style={blockStyle}
                type="button"
              >
                {blockContent}
              </button>
            ) : (
              <div className={blockClassName} key={blockId} style={blockStyle}>
                {blockContent}
              </div>
            );
          })
        : null}
      {mode === "thumb" ? (
        <div className="absolute left-1 top-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[0.55rem] font-[760] text-white">
          {slide.index}
        </div>
      ) : null}
    </div>
  );
}
