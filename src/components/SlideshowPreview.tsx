import {
  ChevronLeft,
  ChevronRight,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SlideshowDoc,
  SlideshowTextBlock,
} from "../types";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const statusPillClass =
  "w-fit max-w-full rounded-full bg-[var(--color-primary-soft)] px-[0.58rem] py-[0.32rem] text-[0.72rem] font-bold leading-[1.1] text-[var(--color-primary-strong)] [overflow-wrap:anywhere]";

const bundleCardClass =
  "grid min-w-0 gap-[var(--space-4)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[linear-gradient(180deg,var(--color-surface-raised)_0%,var(--color-surface)_100%)] p-[var(--space-5)] shadow-[var(--shadow-sm)]";

const bundleHeaderClass =
  "flex flex-col items-stretch justify-between gap-[var(--space-3)] min-[901px]:flex-row min-[901px]:items-start";

const bundleActionsClass =
  "flex flex-col items-start justify-between gap-[var(--space-3)] min-[901px]:items-end";

const bundleTitleClass =
  "m-0 text-[1.35rem] font-[680] leading-[1.15] text-[var(--color-ink)] [overflow-wrap:anywhere]";

const bundleSubtitleClass =
  "m-0 text-[0.9rem] leading-[1.45] text-[var(--color-ink-muted)]";

const navButtonClass =
  "grid size-10 cursor-pointer place-items-center rounded-full border border-[var(--color-border)] bg-[oklch(100%_0.002_232_/_0.88)] text-[var(--color-ink)] transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-[180ms] ease-[var(--ease-out)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)] hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-35 disabled:transform-none max-[900px]:hidden";

const phoneFrameClass =
  "relative grid aspect-[9/16] max-h-[38.75rem] min-h-[26.25rem] overflow-hidden rounded-[1.75rem] border-8 border-[var(--color-ink)] bg-[var(--color-ink)] shadow-[var(--shadow-md)] touch-pan-y max-[900px]:min-h-[22rem]";

const thumbnailRowClass =
  "w-full overflow-x-auto px-0.5 pb-[var(--space-2)] pt-0.5 [scroll-snap-type:x_mandatory]";

const thumbnailInnerClass = "mx-auto flex w-max gap-[var(--space-2)]";

const thumbnailButtonClass =
  "grid size-[3.625rem] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-[var(--radius-md)] border-2 bg-[var(--color-page-quiet)] p-0 text-[var(--color-ink-muted)] [scroll-snap-align:start] transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-[180ms] ease-[var(--ease-out)]";

const currentSlideClass =
  "grid gap-[var(--space-3)] border-t border-[var(--color-border)] pt-[var(--space-4)]";

function centerItemInScrollContainer({
  behavior,
  container,
  item,
  targetRatio = 0.5,
}: {
  behavior: ScrollBehavior;
  container: HTMLElement;
  item: HTMLElement;
  targetRatio?: number;
}) {
  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const itemCenter =
    itemRect.left - containerRect.left + container.scrollLeft + itemRect.width / 2;
  const targetLeft = itemCenter - container.clientWidth * targetRatio;
  const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);

  container.scrollTo({
    left: Math.min(Math.max(0, targetLeft), maxLeft),
    behavior,
  });
}

export function getSlideshowSpec(slideshow: SlideshowDoc): CanonicalSlideshowSpec {
  return slideshow.spec && typeof slideshow.spec === "object"
    ? slideshow.spec as CanonicalSlideshowSpec
    : { renderingMode: "background_plus_overlay", slides: [] };
}

export function getActiveSlides(slideshow: SlideshowDoc): CanonicalSlideshowSlide[] {
  return [...(getSlideshowSpec(slideshow).slides ?? [])]
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

function slideTitle(slide: CanonicalSlideshowSlide) {
  if (slide.renderingMode === "full_graphic_generation" && slide.visibleText) {
    return slide.visibleText;
  }
  const headline = slide.textBlocks?.find((block) =>
    block.role === "headline" || block.role === "cta"
  );
  return headline?.text || slide.purpose || `Slide ${slide.index}`;
}

function blockText(block: SlideshowTextBlock) {
  if (block.text?.trim()) return block.text.trim();
  return block.items?.filter(Boolean).join("\n") ?? "";
}

function textBlockId(block: SlideshowTextBlock, index: number) {
  return block.id || `text-${index}`;
}

function normalizedTextBlock(block: SlideshowTextBlock, index: number): SlideshowTextBlock {
  const text = blockText(block) || "Add text here";
  const isPrimary = index === 0;
  const role = isPrimary ? "headline" : "body";

  return {
    ...block,
    id: textBlockId(block, index),
    role,
    text,
    items: [],
    emphasis: isPrimary ? "primary" : "secondary",
    x: typeof block.x === "number" ? block.x : 10,
    y: typeof block.y === "number" ? block.y : isPrimary ? 42 : 56,
    width: typeof block.width === "number" ? block.width : 80,
    align: block.align ?? "center",
    fontSize: typeof block.fontSize === "number" ? block.fontSize : isPrimary ? 72 : 46,
    fontWeight: typeof block.fontWeight === "number" ? block.fontWeight : isPrimary ? 800 : 700,
    color: block.color ?? "#FFFFFF",
    strokeColor: block.strokeColor ?? "#000000",
    strokeWidth: typeof block.strokeWidth === "number" ? block.strokeWidth : 16,
    backgroundStyle: block.backgroundStyle ?? "none",
    backgroundColor: block.backgroundColor ?? "#FFFFFF",
    backgroundOpacity: block.backgroundStyle === "solid" ? block.backgroundOpacity ?? 1 : 0,
  };
}

function normalizedTextBlocks(slide: CanonicalSlideshowSlide): SlideshowTextBlock[] {
  const source = slide.textBlocks?.length
    ? slide.textBlocks
    : [{ role: "headline" as const, text: slide.visibleText || slide.purpose || "Add text here", items: [], emphasis: "primary" as const }];
  return source.map(normalizedTextBlock).filter((block) => blockText(block));
}

function textBlockCss(block: SlideshowTextBlock, thumbnail: boolean): CSSProperties {
  const fontSize = Math.max(20, block.fontSize ?? 72);
  const strokeWidth = Math.max(0, block.strokeWidth ?? 0);
  const scale = thumbnail ? 0.55 : 1;

  return {
    left: `${block.x ?? 10}%`,
    top: `${block.y ?? 42}%`,
    width: `${block.width ?? 80}%`,
    color: block.color ?? "#FFFFFF",
    fontSize: `${(fontSize * scale / 1080) * 100}cqw`,
    fontWeight: block.fontWeight ?? 800,
    textAlign: block.align ?? "center",
    WebkitTextStrokeColor: block.strokeColor ?? "#000000",
    WebkitTextStrokeWidth: `${(strokeWidth * scale / 1080) * 100}cqw`,
  };
}

function textBlockInlineCss(block: SlideshowTextBlock): CSSProperties {
  const backgroundIsSolid = block.backgroundStyle === "solid";

  return {
    backgroundColor: backgroundIsSolid
      ? `${block.backgroundColor ?? "#FFFFFF"}${Math.round((block.backgroundOpacity ?? 1) * 255).toString(16).padStart(2, "0")}`
      : "transparent",
    borderRadius: backgroundIsSolid ? "1.35cqw" : undefined,
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };
}

function contrastOverlayClass(contrast: NonNullable<CanonicalSlideshowSlide["layout"]>["contrast"]) {
  if (contrast === "shadow") return "bg-[oklch(0%_0_0_/_0.16)]";
  if (contrast === "solid_scrim") return "bg-[oklch(0%_0_0_/_0.48)]";
  return "bg-[linear-gradient(180deg,oklch(0%_0_0_/_0.54),transparent_30%,transparent_60%,oklch(0%_0_0_/_0.64)),oklch(0%_0_0_/_0.14)]";
}

function LiveSlideFrame({
  slide,
  index,
  total,
  renderingMode,
  thumbnail = false,
  editable = false,
  selectedBlockId,
  onSelectBlock,
  onChangeBlockText,
  onPatchBlock,
  onBeginTextEdit,
}: {
  slide: CanonicalSlideshowSlide;
  index: number;
  total: number;
  renderingMode?: CanonicalSlideshowSpec["renderingMode"];
  thumbnail?: boolean;
  editable?: boolean;
  selectedBlockId?: string;
  onSelectBlock?: (blockId: string) => void;
  onChangeBlockText?: (blockId: string, text: string) => void;
  onPatchBlock?: (blockId: string, patch: Partial<SlideshowTextBlock>) => void;
  onBeginTextEdit?: (blockId: string) => void;
}) {
  const slideRenderingMode = slide.renderingMode ?? renderingMode;
  const blocks = slideRenderingMode === "background_plus_overlay"
    ? normalizedTextBlocks(slide)
    : [];
  const contrast = slide.layout?.contrast ?? "gradient_scrim";
  const isFullGraphic = slideRenderingMode === "full_graphic_generation";
  const dragRef = useRef<{
    blockId: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    rect: DOMRect;
  } | null>(null);

  const startDrag = (
    event: PointerEvent<HTMLDivElement>,
    block: SlideshowTextBlock,
    blockId: string
  ) => {
    if (!editable || !onPatchBlock) return;
    if ((event.target as HTMLElement).isContentEditable) return;
    const frame = event.currentTarget.closest("[data-slide-frame]");
    const rect = frame?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      blockId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: block.x ?? 10,
      originY: block.y ?? 42,
      rect,
    };
    onSelectBlock?.(blockId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !onPatchBlock) return;
    const deltaX = ((event.clientX - drag.startX) / drag.rect.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / drag.rect.height) * 100;
    onPatchBlock(drag.blockId, {
      x: Math.min(Math.max(drag.originX + deltaX, 0), 96),
      y: Math.min(Math.max(drag.originY + deltaY, 0), 96),
    });
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };

  return (
    <div data-slide-frame className="relative h-full w-full overflow-hidden bg-[oklch(13%_0.028_220)] [container-type:inline-size]">
      {slide.backgroundImageUrl ? (
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={slide.backgroundImageUrl}
          alt=""
        />
      ) : (
        <div className="absolute inset-0 h-full w-full bg-[linear-gradient(145deg,oklch(79%_0.15_92_/_0.18),transparent_42%),linear-gradient(160deg,oklch(20%_0.035_220)_0%,oklch(9%_0.02_220)_100%)] object-cover" />
      )}
      {!thumbnail && !isFullGraphic && contrast !== "none" && (
        <div className={cx("absolute inset-0", contrastOverlayClass(contrast))} />
      )}
      {!isFullGraphic && (
        <>
          {blocks.map((block, blockIndex) => {
            const blockId = textBlockId(block, blockIndex);
            const selected = editable && selectedBlockId === blockId;
            return (
              <div
                className={cx(
                  "absolute z-10 whitespace-pre-line font-extrabold leading-[1.08] [overflow-wrap:anywhere] [paint-order:stroke_fill]",
                  "text-[length:inherit] [-webkit-text-stroke-color:inherit] [-webkit-text-stroke-width:inherit]",
                  editable && "cursor-move outline outline-1 outline-offset-1 outline-white/55",
                  !editable && onBeginTextEdit && "cursor-text",
                  selected && "outline-2 outline-[var(--color-primary)]"
                )}
                key={blockId}
                style={textBlockCss(block, thumbnail)}
                onPointerDown={(event) => startDrag(event, block, blockId)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClick={(event) => {
                  if (!editable) {
                    if (!onBeginTextEdit) return;
                    event.stopPropagation();
                    onBeginTextEdit?.(blockId);
                    return;
                  }
                  event.stopPropagation();
                  onSelectBlock?.(blockId);
                }}
              >
                {selected && (
                  <div
                    className="absolute -left-2 -top-2 size-4 rounded-full border-2 border-white bg-[var(--color-primary)] shadow-[var(--shadow-sm)]"
                    onPointerDown={(event) => startDrag(event, block, blockId)}
                  />
                )}
                {editable && !thumbnail ? (
                  <div
                    className="inline min-h-[1.3em] cursor-text px-[1.65cqw] py-[0.62cqw] outline-none [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
                    contentEditable
                    style={textBlockInlineCss(block)}
                    suppressContentEditableWarning
                    onInput={(event) => onChangeBlockText?.(blockId, event.currentTarget.innerText)}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {block.text}
                  </div>
                ) : (
                  <span
                    className="inline px-[1.65cqw] py-[0.62cqw] [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
                    style={textBlockInlineCss(block)}
                  >
                    {blockText(block)}
                  </span>
                )}
              </div>
            );
          })}
        </>
      )}
      {!thumbnail && (
        <div className={cx("absolute bottom-[var(--space-3)] right-[var(--space-3)] bg-[oklch(100%_0.002_232_/_0.92)]", statusPillClass)}>
          {index + 1}/{total}
        </div>
      )}
    </div>
  );
}

export function SavedSlideshowCard({
  slideshow,
  createDraftPost,
  removeSlideshow,
}: {
  slideshow: SlideshowDoc;
  createDraftPost?: (slideshow: SlideshowDoc) => Promise<void>;
  removeSlideshow: (slideshow: SlideshowDoc) => Promise<void>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const thumbnailTrackRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasCenteredThumbnailOnce = useRef(false);
  const spec = getSlideshowSpec(slideshow);
  const slides = getActiveSlides(slideshow);
  const activeSlide = slides[Math.min(activeIndex, Math.max(slides.length - 1, 0))];

  useEffect(() => {
    const track = thumbnailTrackRef.current;
    const thumbnail = thumbnailRefs.current[activeIndex];
    if (!track || !thumbnail) return;

    centerItemInScrollContainer({
      behavior: hasCenteredThumbnailOnce.current ? "smooth" : "auto",
      container: track,
      item: thumbnail,
    });
    hasCenteredThumbnailOnce.current = true;
  }, [activeIndex, slides.length]);

  if (!activeSlide) return null;

  const moveSlide = (direction: -1 | 1) => {
    setActiveIndex((current) => Math.min(Math.max(current + direction, 0), slides.length - 1));
  };

  const handleTouchEnd = (clientX: number) => {
    if (touchStart === null) return;
    const delta = touchStart - clientX;
    if (Math.abs(delta) > 40) moveSlide(delta > 0 ? 1 : -1);
    setTouchStart(null);
  };

  return (
    <article className={bundleCardClass}>
      <div className={bundleHeaderClass}>
        <div>
          <div className="entity-eyebrow">Slideshow</div>
          <h3 className={bundleTitleClass}>{slideshow.title}</h3>
          <p className={bundleSubtitleClass}>{slides.length} slides · {new Date(slideshow.updatedAt).toLocaleString()}</p>
        </div>
        <div className={bundleActionsClass}>
          <span className={statusPillClass}>{slideshow.status}</span>
          {createDraftPost && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void createDraftPost(slideshow)}
            >
              <Send size={16} />
              Create draft post
            </button>
          )}
          <button
            className="danger-button"
            type="button"
            onClick={() => void removeSlideshow(slideshow)}
          >
            <Trash2 size={16} />
            Delete slideshow
          </button>
        </div>
      </div>

      <div className="grid items-center justify-center gap-[var(--space-4)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[linear-gradient(90deg,oklch(18%_0.035_220_/_0.06),transparent_16%,transparent_84%,oklch(18%_0.035_220_/_0.06)),var(--color-page-quiet)] p-[var(--space-5)] min-[901px]:grid-cols-[2.75rem_minmax(15rem,24rem)_2.75rem] max-[900px]:grid-cols-1">
        <button
          className={navButtonClass}
          type="button"
          disabled={activeIndex === 0}
          onClick={() => moveSlide(-1)}
          aria-label="Previous slide"
        >
          <ChevronLeft size={22} />
        </button>
        <div
          className={phoneFrameClass}
          onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
          onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
        >
          <LiveSlideFrame slide={activeSlide} index={activeIndex} total={slides.length} renderingMode={spec.renderingMode} />
        </div>
        <button
          className={navButtonClass}
          type="button"
          disabled={activeIndex === slides.length - 1}
          onClick={() => moveSlide(1)}
          aria-label="Next slide"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className={thumbnailRowClass} ref={thumbnailTrackRef} aria-label="Slides">
        <div className={thumbnailInnerClass}>
          {slides.map((slide, index) => (
            <button
              className={cx(
                thumbnailButtonClass,
                index === activeIndex
                  ? "border-[var(--color-primary)] shadow-[var(--focus-ring)]"
                  : "border-transparent"
              )}
              key={slide.slideId}
              ref={(node) => {
                thumbnailRefs.current[index] = node;
              }}
              type="button"
              onClick={() => setActiveIndex(index)}
            >
              <LiveSlideFrame slide={slide} index={index} total={slides.length} renderingMode={spec.renderingMode} thumbnail />
            </button>
          ))}
        </div>
      </div>

      <div className={currentSlideClass}>
        <div className="artifact-copy">
          <div className="entity-eyebrow">Slide {activeSlide.index}</div>
          <h3>{slideTitle(activeSlide)}</h3>
          <p>{activeSlide.purpose || "Readable TikTok carousel slide."}</p>
        </div>
      </div>
    </article>
  );
}
