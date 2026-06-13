import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SlideshowTextBlock,
} from "../../types";
import { SlidePreview } from "./SlideshowSlidePreview";

function stageSlideFrameClass(isCurrent: boolean) {
  return [
    "shrink-0 border-0 bg-transparent p-0 text-left transition",
    isCurrent
      ? "w-[min(42vw,13.5rem)]"
      : "w-[min(26vw,10.5rem)] opacity-70 hover:opacity-95",
  ].join(" ");
}

export function SlideshowStage({
  actionBar,
  editTray,
  nextSlide,
  onChangeBlock,
  onCreateSlide,
  onReorderSlides,
  onSelectBlock,
  onSelectSlide,
  previousSlide,
  selectedBlockId,
  selectedSlide,
  slides,
  spec,
  stageSlides,
  textBlocksDraft,
}: {
  actionBar?: ReactNode;
  editTray?: ReactNode;
  nextSlide?: CanonicalSlideshowSlide;
  onChangeBlock: (blockId: string, patch: Partial<SlideshowTextBlock>) => void;
  onCreateSlide: () => void;
  onReorderSlides: (slideIds: string[]) => void;
  onSelectBlock: (blockId: string) => void;
  onSelectSlide: (slideId: string) => void;
  previousSlide?: CanonicalSlideshowSlide;
  selectedBlockId: string;
  selectedSlide: CanonicalSlideshowSlide;
  slides: CanonicalSlideshowSlide[];
  spec: CanonicalSlideshowSpec;
  stageSlides: CanonicalSlideshowSlide[];
  textBlocksDraft: SlideshowTextBlock[];
}) {
  const [draggedSlideId, setDraggedSlideId] = useState("");
  const [orderedSlideIds, setOrderedSlideIds] = useState(() =>
    slides.map((slide) => slide.slideId)
  );
  const orderedSlideIdsRef = useRef(orderedSlideIds);
  const didReorderDuringDragRef = useRef(false);
  const baseSlideIds = useMemo(
    () => slides.map((slide) => slide.slideId),
    [slides]
  );
  const displaySlides = useMemo(() => {
    const slidesById = new Map(slides.map((slide) => [slide.slideId, slide]));
    const ordered = orderedSlideIds
      .map((slideId) => slidesById.get(slideId))
      .filter((slide): slide is CanonicalSlideshowSlide => Boolean(slide));
    return ordered.length === slides.length ? ordered : slides;
  }, [orderedSlideIds, slides]);

  useEffect(() => {
    orderedSlideIdsRef.current = orderedSlideIds;
  }, [orderedSlideIds]);

  useEffect(() => {
    if (draggedSlideId) return;
    setOrderedSlideIds(baseSlideIds);
  }, [baseSlideIds, draggedSlideId]);

  const moveSlideRelativeToTarget = (
    slideIds: string[],
    slideId: string,
    targetSlideId: string,
    placement: "before" | "after"
  ) => {
    if (slideId === targetSlideId) return slideIds;
    const withoutDragged = slideIds.filter((currentId) => currentId !== slideId);
    const targetIndex = withoutDragged.indexOf(targetSlideId);
    if (targetIndex < 0) return slideIds;
    const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
    return [
      ...withoutDragged.slice(0, insertIndex),
      slideId,
      ...withoutDragged.slice(insertIndex),
    ];
  };

  return (
    <div className="grid min-w-0 gap-3 rounded-[var(--radius-md)] bg-[var(--color-page-quiet)] px-[var(--space-3)] py-[var(--space-3)] sm:px-[var(--space-4)]">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[var(--space-2)]">
        <button
          aria-label="Previous slide"
          className="secondary-button size-10 justify-center p-0"
          disabled={!previousSlide}
          onClick={() => {
            if (previousSlide) onSelectSlide(previousSlide.slideId);
          }}
          type="button"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex min-w-0 items-center justify-center gap-[var(--space-3)] overflow-hidden py-1 sm:gap-[var(--space-4)]">
          {stageSlides.map((slide) => {
            const isCurrent = slide.slideId === selectedSlide.slideId;
            const className = stageSlideFrameClass(isCurrent);
            const preview = (
              <SlidePreview
                mode="stage"
                onChangeBlock={isCurrent ? onChangeBlock : undefined}
                onSelectBlock={isCurrent ? onSelectBlock : undefined}
                selectedBlockId={isCurrent ? selectedBlockId : undefined}
                slide={slide}
                spec={spec}
                textBlocks={isCurrent ? textBlocksDraft : undefined}
              />
            );

            return isCurrent ? (
              <div className={className} key={slide.slideId}>
                {preview}
              </div>
            ) : (
              <button
                aria-label={`Select slide ${slide.index}`}
                className={className}
                key={slide.slideId}
                onClick={() => onSelectSlide(slide.slideId)}
                type="button"
              >
                {preview}
              </button>
            );
          })}
        </div>
        <button
          aria-label="Next slide"
          className="secondary-button size-10 justify-center p-0"
          disabled={!nextSlide}
          onClick={() => {
            if (nextSlide) onSelectSlide(nextSlide.slideId);
          }}
          type="button"
        >
          <ArrowRight size={17} />
        </button>
      </div>

      {actionBar}
      {editTray}

      <div className="flex min-w-0 items-center justify-center gap-2 overflow-x-auto pb-1">
        {displaySlides.map((slide) => (
          <button
            aria-label={`Select slide ${slide.index}`}
            className={[
              "size-14 shrink-0 cursor-grab overflow-hidden rounded-[0.65rem] border-2 bg-transparent p-[2px] transition active:cursor-grabbing",
              draggedSlideId === slide.slideId ? "scale-105 opacity-65 ring-2 ring-[var(--color-accent)]" : "",
              draggedSlideId && draggedSlideId !== slide.slideId ? "hover:scale-105 hover:border-[var(--color-primary)]" : "",
              slide.slideId === selectedSlide.slideId
                ? "border-[var(--color-primary)]"
                : "border-transparent hover:border-[var(--color-border-strong)]",
            ].join(" ")}
            draggable
            key={slide.slideId}
            onClick={() => {
              if (!didReorderDuringDragRef.current) onSelectSlide(slide.slideId);
            }}
            data-slide-thumb-id={slide.slideId}
            onDragEnd={() => {
              const nextOrder = orderedSlideIdsRef.current;
              const changed = nextOrder.join("|") !== baseSlideIds.join("|");
              if (changed) onReorderSlides(nextOrder);
              setDraggedSlideId("");
              window.setTimeout(() => {
                didReorderDuringDragRef.current = false;
              }, 0);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (!draggedSlideId || draggedSlideId === slide.slideId) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const placement = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
              setOrderedSlideIds((current) => {
                const next = moveSlideRelativeToTarget(
                  current,
                  draggedSlideId,
                  slide.slideId,
                  placement
                );
                if (next.join("|") !== current.join("|")) {
                  didReorderDuringDragRef.current = true;
                }
                return next;
              });
            }}
            onDragStart={(event) => {
              didReorderDuringDragRef.current = false;
              setDraggedSlideId(slide.slideId);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", slide.slideId);
            }}
            type="button"
          >
            <SlidePreview mode="thumb" slide={slide} spec={spec} />
          </button>
        ))}
        <button
          aria-label="Create slide"
          className="grid size-14 shrink-0 place-items-center rounded-[0.65rem] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-sm)] transition hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onCreateSlide}
          type="button"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
