import { Images, Trash2 } from "lucide-react";
import type {
  CanonicalSlideshowSpec,
  CanonicalSlideshowSlide,
  SlideshowDoc,
} from "../../types";

function activeSlides(spec: CanonicalSlideshowSpec) {
  return [...(spec.slides ?? [])]
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

function slideText(slide: CanonicalSlideshowSlide) {
  const block = slide.textBlocks?.[0];
  if (block?.text?.trim()) return block.text.trim();
  if (block?.items?.length) return block.items.filter(Boolean).join(" ");
  return slide.visibleText ?? "";
}

function SlideshowThumbnail({
  slide,
  spec,
}: {
  slide?: CanonicalSlideshowSlide;
  spec: CanonicalSlideshowSpec;
}) {
  const isFullGraphic =
    spec.renderingMode === "full_graphic_generation" ||
    slide?.renderingMode === "full_graphic_generation";
  const text = slide ? slideText(slide) : "";

  return (
    <div className="relative aspect-[9/16] max-h-[18rem] min-h-[9rem] w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[#111513]">
      {slide?.backgroundImageUrl ? (
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          src={slide.backgroundImageUrl}
        />
      ) : (
        <div className="grid h-full place-items-center text-[var(--color-ink-muted)]">
          <Images size={30} />
        </div>
      )}
      {!isFullGraphic && text ? (
        <>
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute left-[8%] right-[8%] top-[42%] text-center text-[clamp(1rem,5vw,2rem)] font-[850] leading-[1.05] text-white [text-shadow:0_2px_0_#111,0_0_12px_rgba(0,0,0,0.7)]">
            {text}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function LibrarySlideshowCard({
  isDeleting,
  onDelete,
  onOpen,
  slideshow,
}: {
  isDeleting?: boolean;
  onDelete?: () => void;
  onOpen?: () => void;
  slideshow: SlideshowDoc;
}) {
  const spec = slideshow.spec as CanonicalSlideshowSpec;
  const slides = activeSlides(spec);
  const metadata = [
    "Native slideshow",
    spec.renderingMode?.replace(/_/g, " "),
    spec.aspectRatio,
  ].filter(Boolean);

  return (
    <article className="group grid min-w-0 content-start gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)] shadow-[var(--shadow-sm)] transition hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)]">
      <button
        aria-label={`Open ${slideshow.title}`}
        className="block w-full border-0 bg-transparent p-0 text-left focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface)]"
        onClick={onOpen}
        type="button"
      >
        <SlideshowThumbnail slide={slides[0]} spec={spec} />
      </button>
      <div className="grid min-w-0 gap-[var(--space-2)]">
        <div className="entity-eyebrow">slideshow</div>
        <button
          aria-label={`Open ${slideshow.title}`}
          className="block w-full min-w-0 rounded-[var(--radius-sm)] border border-transparent bg-transparent p-0 text-left text-[var(--color-ink)] transition hover:text-[var(--color-primary-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface)]"
          onClick={onOpen}
          type="button"
        >
          <span className="block overflow-hidden text-[0.95rem] font-[760] leading-[1.2] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {slideshow.title}
          </span>
        </button>
        <p className="m-0 truncate text-[0.78rem] leading-snug text-[var(--color-ink-muted)]">
          {[`${slides.length} slide${slides.length === 1 ? "" : "s"}`, ...metadata].join(" · ")}
        </p>
        {spec.creativeBrief ? (
          <p className="m-0 overflow-hidden text-[0.78rem] leading-snug text-[var(--color-ink-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {spec.creativeBrief}
          </p>
        ) : null}
      </div>
      {onDelete ? (
        <div className="flex flex-wrap gap-[var(--space-2)]">
          <button
            className="secondary-button min-h-[2rem] px-[var(--space-2)] py-[0.35rem] text-[0.78rem] text-[var(--color-danger)]"
            disabled={isDeleting}
            onClick={onDelete}
            type="button"
          >
            <Trash2 size={15} />
            {isDeleting ? "Deleting" : "Delete"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
