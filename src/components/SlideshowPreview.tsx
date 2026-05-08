import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileText,
  Image,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

const createBundleCardClass =
  "grid min-w-0 gap-[var(--space-4)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[radial-gradient(circle_at_100%_0%,oklch(79%_0.15_92_/_0.16),transparent_28rem),linear-gradient(180deg,var(--color-surface-raised)_0%,var(--color-surface)_100%)] p-[var(--space-5)] shadow-[var(--shadow-sm)] mb-[var(--space-4)]";

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

const actionButtonClass =
  "inline-flex min-h-9 cursor-pointer items-center gap-[var(--space-2)] rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-[0.78rem] py-[0.46rem] text-[0.78rem] font-bold text-[var(--color-ink)] transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-[180ms] ease-[var(--ease-out)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-52 max-[560px]:w-full max-[560px]:justify-center";

const dangerActionButtonClass =
  "border-[oklch(85%_0.05_27)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]";

const inspectorClass =
  "grid gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-[var(--space-4)]";

const inspectorTextClass = "m-0 leading-[1.5] [overflow-wrap:anywhere]";

const promptTextareaClass =
  "min-h-[18rem] w-full resize-none overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)] text-[0.9rem] leading-[1.48] text-[var(--color-ink)] [overflow-wrap:anywhere] focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-raised)] focus:shadow-[var(--focus-ring)] focus:outline-none";

const promptHeadingPrefixes = [
  "Visible text exact line breaks",
  "Camera and framing",
  "Style consistency",
  "Negative prompt",
  "Shared style",
  "Typography",
  "Composition",
  "Background",
  "Lighting",
  "Subject",
  "Scene",
  "Layout",
  "Color",
  "Mood",
  "Text",
  "Create",
];

const editorLabelClass =
  "grid gap-[var(--space-2)] text-[0.86rem] font-[650] text-[var(--color-ink)]";

const editorInputClass =
  "w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-[var(--space-3)] text-[0.9rem] text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:shadow-[var(--focus-ring)] focus:outline-none";

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

function getSlideshowSpec(slideshow: SlideshowDoc): CanonicalSlideshowSpec {
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

function inferPromptSection(content: string): { heading?: string; body: string } {
  const trimmed = content.trim();
  const firstLineBreak = trimmed.indexOf("\n");

  if (firstLineBreak > -1) {
    return {
      heading: trimmed.slice(0, firstLineBreak).trim(),
      body: trimmed.slice(firstLineBreak + 1).trim(),
    };
  }

  const colonMatch = trimmed.match(/^(.{2,48}?):\s+(.+)$/);
  if (colonMatch) return { heading: colonMatch[1].trim(), body: colonMatch[2].trim() };

  const prefix = promptHeadingPrefixes.find((item) =>
    trimmed.toLowerCase().startsWith(`${item.toLowerCase()} `)
  );
  if (prefix) {
    return {
      heading: prefix,
      body: trimmed.slice(prefix.length).trim(),
    };
  }

  return { heading: undefined, body: trimmed };
}

function splitMarkdownHeadingSections(text?: string): Array<{ heading?: string; body: string }> {
  const prompt = text?.trim();
  if (!prompt) return [{ heading: undefined, body: "No image prompt saved for this slide." }];

  const headingPattern = /(?:^|\s)(#{1,6})\s+/g;
  const matches = [...prompt.matchAll(headingPattern)];

  if (matches.length === 0) return [{ heading: undefined, body: prompt }];

  const sections: Array<{ heading?: string; body: string }> = [];
  const leadingText = prompt.slice(0, matches[0].index).trim();
  if (leadingText) sections.push({ body: leadingText });

  matches.forEach((match, index) => {
    const contentStart = (match.index ?? 0) + match[0].length;
    const nextStart = matches[index + 1]?.index ?? prompt.length;
    sections.push(inferPromptSection(prompt.slice(contentStart, nextStart)));
  });

  return sections;
}

function formatPromptForEditing(text?: string) {
  return splitMarkdownHeadingSections(text)
    .map((section) => {
      const body = section.body.trim();
      if (!section.heading) return body;
      return [section.heading.toUpperCase(), body].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function promptHeadingForLine(line: string) {
  const normalized = line.trim().replace(/\s+/g, " ").toLowerCase();
  return promptHeadingPrefixes.find((heading) => heading.toLowerCase() === normalized);
}

function serializeEditablePrompt(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const heading = promptHeadingForLine(line);
      return heading ? `### ${heading}` : line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function AutoHeightTextarea({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  useLayoutEffect(resizeTextarea, [value]);

  return (
    <textarea
      className={promptTextareaClass}
      ref={textareaRef}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        requestAnimationFrame(resizeTextarea);
      }}
      onBlur={onBlur}
      onFocus={resizeTextarea}
      rows={1}
    />
  );
}

function textZoneClass(slide: CanonicalSlideshowSlide) {
  const textZone = slide.layout?.textZone;
  if (textZone === "top") return "top-[14%] content-start";
  if (textZone === "bottom") return "bottom-[14%] content-end";
  return "top-1/2 content-center -translate-y-1/2";
}

function contrastOverlayClass(contrast: NonNullable<CanonicalSlideshowSlide["layout"]>["contrast"]) {
  if (contrast === "shadow") return "bg-[oklch(0%_0_0_/_0.16)]";
  if (contrast === "solid_scrim") return "bg-[oklch(0%_0_0_/_0.48)]";
  return "bg-[linear-gradient(180deg,oklch(0%_0_0_/_0.54),transparent_30%,transparent_60%,oklch(0%_0_0_/_0.64)),oklch(0%_0_0_/_0.14)]";
}

function liveTextBlockClass(block: SlideshowTextBlock, thumbnail: boolean) {
  const isPrimary =
    block.role === "headline" ||
    block.role === "cta" ||
    block.emphasis === "primary";

  if (thumbnail) {
    return "mx-auto line-clamp-2 max-w-full overflow-hidden text-ellipsis whitespace-pre-line text-[0.44rem] font-extrabold leading-[1.05] [overflow-wrap:anywhere] [paint-order:stroke_fill] [-webkit-box-orient:vertical] [-webkit-text-stroke-color:oklch(0%_0_0_/_0.86)] [-webkit-text-stroke-width:0.45px]";
  }

  return cx(
    "mx-auto max-w-full whitespace-pre-line font-extrabold leading-[1.08] [overflow-wrap:anywhere] [paint-order:stroke_fill] [-webkit-text-stroke-color:oklch(0%_0_0_/_0.86)]",
    isPrimary
      ? "text-[clamp(1.05rem,8cqw,2.35rem)] [-webkit-text-stroke-width:1.6px]"
      : "text-[clamp(0.7rem,3.8cqw,1.15rem)] leading-[1.18] [-webkit-text-stroke-width:1.1px]"
  );
}

function LiveSlideFrame({
  slide,
  index,
  total,
  renderingMode,
  thumbnail = false,
}: {
  slide: CanonicalSlideshowSlide;
  index: number;
  total: number;
  renderingMode?: CanonicalSlideshowSpec["renderingMode"];
  thumbnail?: boolean;
}) {
  const slideRenderingMode = slide.renderingMode ?? renderingMode;
  const blocks = slideRenderingMode === "background_plus_overlay"
    ? slide.textBlocks?.filter((block) => blockText(block)) ?? []
    : [];
  const contrast = slide.layout?.contrast ?? "gradient_scrim";
  const isFullGraphic = slideRenderingMode === "full_graphic_generation";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[oklch(13%_0.028_220)] [container-type:inline-size]">
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
      {!thumbnail && !isFullGraphic && (
        <div
          className={cx(
            "absolute z-10 grid text-center text-white",
            thumbnail
              ? "inset-x-[8%] gap-0.5 [text-shadow:0_1px_3px_oklch(0%_0_0_/_0.6)]"
              : "inset-x-[8%] gap-[var(--space-3)] [text-shadow:0_2px_8px_oklch(0%_0_0_/_0.35)]",
            textZoneClass(slide)
          )}
        >
          {blocks.map((block, blockIndex) => (
            <div
              className={liveTextBlockClass(block, thumbnail)}
              key={`${block.role ?? "block"}-${blockIndex}`}
            >
              {block.items?.length ? (
                <ul className="grid list-none gap-[var(--space-2)] p-0 m-0">
                  {block.items.map((item, itemIndex) => (
                    <li key={`${item}-${itemIndex}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                block.text
              )}
            </div>
          ))}
        </div>
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
  removeSlideshow,
}: {
  slideshow: SlideshowDoc;
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

export function CreateSlideshowPreview({
  title,
  subtitle,
  slideshow,
  onDeleteSlide,
  onMoveSlide,
  onRegenerateSlideImage,
  onUpdateSlideImagePrompt,
  onUpdateSlideText,
}: {
  title: string;
  subtitle: string;
  slideshow: SlideshowDoc;
  onDeleteSlide?: (slide: CanonicalSlideshowSlide) => Promise<void>;
  onMoveSlide?: (slide: CanonicalSlideshowSlide, direction: "left" | "right") => Promise<void>;
  onUpdateSlideText?: (
    slide: CanonicalSlideshowSlide,
    args: { primaryText: string; secondaryText?: string; bullets: string[] }
  ) => Promise<void>;
  onRegenerateSlideImage?: (
    slide: CanonicalSlideshowSlide,
    prompt: string,
    useReferenceImage: boolean
  ) => Promise<void>;
  onUpdateSlideImagePrompt?: (
    slide: CanonicalSlideshowSlide,
    prompt: string
  ) => Promise<void>;
}) {
  const slides = getActiveSlides(slideshow);
  const spec = getSlideshowSpec(slideshow);
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const previewTrackRef = useRef<HTMLDivElement | null>(null);
  const previewSlideRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const thumbnailTrackRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasCenteredPreviewOnce = useRef(false);
  const hasCenteredThumbnailOnce = useRef(false);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imagePromptText, setImagePromptText] = useState("");
  const [useReferenceImage, setUseReferenceImage] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [primaryText, setPrimaryText] = useState("");
  const [secondaryText, setSecondaryText] = useState("");
  const [bulletsText, setBulletsText] = useState("");
  const activeSlide = slides[Math.min(activeIndex, Math.max(slides.length - 1, 0))];
  const activeRenderingMode = activeSlide?.renderingMode ?? spec.renderingMode ?? "background_plus_overlay";
  const isFullGraphic = activeRenderingMode === "full_graphic_generation";
  const headlineBlock = !isFullGraphic
    ? activeSlide?.textBlocks?.find((block) => block.role === "headline" || block.role === "cta")
    : undefined;
  const bodyBlock = !isFullGraphic
    ? activeSlide?.textBlocks?.find((block) => block.role === "body")
    : undefined;
  const bulletBlock = !isFullGraphic
    ? activeSlide?.textBlocks?.find((block) => block.role === "bullet_list")
    : undefined;
  const imagePrompt = activeSlide
    ? activeRenderingMode === "full_graphic_generation"
      ? activeSlide.finalImagePrompt
      : activeSlide.backgroundPrompt
    : "No image prompt saved for this slide.";

  useEffect(() => {
    if (!showImagePrompt) return;
    setImagePromptText(formatPromptForEditing(imagePrompt));
    setUseReferenceImage(activeSlide?.useReferenceImage === true);
  }, [activeSlide?.slideId, activeSlide?.useReferenceImage, imagePrompt, showImagePrompt]);

  useEffect(() => {
    if (activeIndex > slides.length - 1) {
      setActiveIndex(Math.max(slides.length - 1, 0));
    }
  }, [activeIndex, slides.length]);

  useEffect(() => {
    const track = previewTrackRef.current;
    const slide = previewSlideRefs.current[activeIndex];
    if (!track || !slide) return;

    centerItemInScrollContainer({
      behavior: hasCenteredPreviewOnce.current ? "smooth" : "auto",
      container: track,
      item: slide,
      targetRatio: 0.50,
    });
    hasCenteredPreviewOnce.current = true;
  }, [activeIndex, slides.length]);

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

  const beginTextEdit = () => {
    if (isFullGraphic) return;
    setPrimaryText(headlineBlock?.text ?? "");
    setSecondaryText(bodyBlock?.text ?? "");
    setBulletsText((bulletBlock?.items ?? []).join("\n"));
    setIsEditingText(true);
  };

  const saveTextEdit = async () => {
    if (!onUpdateSlideText || !primaryText.trim()) return;

    await onUpdateSlideText(activeSlide, {
      primaryText: primaryText.trim(),
      secondaryText: secondaryText.trim() || undefined,
      bullets: bulletsText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    });
    setIsEditingText(false);
  };

  const regenerateActiveImage = async () => {
    if (!onRegenerateSlideImage) return;
    const prompt = serializeEditablePrompt(imagePromptText);
    if (!prompt.trim()) return;

    setIsRegeneratingImage(true);
    try {
      await onRegenerateSlideImage(activeSlide, prompt, useReferenceImage);
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  const saveImagePromptEdit = async () => {
    if (!onUpdateSlideImagePrompt) return;
    const prompt = serializeEditablePrompt(imagePromptText);
    const savedPrompt = serializeEditablePrompt(formatPromptForEditing(imagePrompt));
    if (!prompt.trim() || prompt === savedPrompt) return;
    await onUpdateSlideImagePrompt(activeSlide, prompt);
  };

  return (
    <article className={createBundleCardClass}>
      <div className={bundleHeaderClass}>
        <div>
          <div className="entity-eyebrow">Create preview</div>
          <h3 className={bundleTitleClass}>{title}</h3>
          <p className={bundleSubtitleClass}>{subtitle}</p>
        </div>
        <div className={bundleActionsClass}>
          <span className={statusPillClass}>{slideshow.status}</span>
        </div>
      </div>

      <div className="grid items-center gap-[var(--space-3)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[radial-gradient(circle_at_18%_20%,oklch(100%_0_0_/_0.75),transparent_24%),linear-gradient(135deg,var(--color-page)_0%,var(--color-page-quiet)_100%)] px-[var(--space-3)] py-[var(--space-5)] min-[901px]:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] max-[900px]:grid-cols-1">
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
          className="flex min-h-[29rem] max-h-[38.75rem] items-center gap-[var(--space-4)] overflow-x-auto [padding-left:max(0px,calc(50%_-_7.8125rem))] [padding-right:max(0px,calc(75%_-_7.8125rem))] [scrollbar-width:none] [scroll-snap-type:x_mandatory] [&::-webkit-scrollbar]:hidden"
          ref={previewTrackRef}
        >
          {slides.map((slide, index) => (
            <button
              className={cx(
                "grid w-[15.625rem] shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 [scroll-snap-align:center] transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-[180ms] ease-[var(--ease-out)]",
                index === activeIndex ? "scale-100 opacity-100" : "scale-[0.72] opacity-[0.58]"
              )}
              key={slide.slideId}
              ref={(node) => {
                previewSlideRefs.current[index] = node;
              }}
              type="button"
              onClick={() => {
                setActiveIndex(index);
                setShowImagePrompt(false);
                setIsEditingText(false);
              }}
            >
              <div
                className={cx(
                  phoneFrameClass,
                  "w-full min-h-0",
                  index === activeIndex ? "" : "border-4"
                )}
                onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
                onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
              >
                <LiveSlideFrame slide={slide} index={index} total={slides.length} renderingMode={spec.renderingMode} />
              </div>
            </button>
          ))}
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

      <div className="flex flex-wrap justify-center gap-[var(--space-2)] max-[560px]:grid" aria-label="Slide actions">
        <button
          className={actionButtonClass}
          type="button"
          onClick={() => {
            setImagePromptText(formatPromptForEditing(imagePrompt));
            setShowImagePrompt((value) => !value);
          }}
        >
          <Image size={16} />
          Edit image prompt
        </button>
        <button className={actionButtonClass} type="button" disabled={isFullGraphic} onClick={beginTextEdit}>
          <Edit3 size={16} />
          Edit text
        </button>
        <button
          className={actionButtonClass}
          type="button"
          disabled={!onMoveSlide || activeIndex === 0}
          onClick={() => void onMoveSlide?.(activeSlide, "left")}
        >
          <ArrowLeft size={16} />
          Move left
        </button>
        <button
          className={actionButtonClass}
          type="button"
          disabled={!onMoveSlide || activeIndex === slides.length - 1}
          onClick={() => void onMoveSlide?.(activeSlide, "right")}
        >
          <ArrowRight size={16} />
          Move right
        </button>
        <button
          className={cx(actionButtonClass, dangerActionButtonClass)}
          type="button"
          disabled={!onDeleteSlide || slides.length <= 1}
          onClick={() => void onDeleteSlide?.(activeSlide)}
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>

      {showImagePrompt && (
        <div className={inspectorClass}>
          <div className="entity-eyebrow">
            <FileText size={13} />
            Edit slide image prompt
          </div>
          <AutoHeightTextarea
            value={imagePromptText}
            onChange={setImagePromptText}
            onBlur={() => void saveImagePromptEdit()}
          />
          <label className="flex items-center gap-[var(--space-2)] text-[0.86rem] font-[650] text-[var(--color-ink)]">
            <input
              checked={useReferenceImage}
              className="size-4 accent-[var(--color-primary)]"
              type="checkbox"
              onChange={(event) => setUseReferenceImage(event.target.checked)}
            />
            <span>Use selected reference image</span>
          </label>
          {activeSlide.layout?.intent && (
            <small className={cx(inspectorTextClass, "text-[var(--color-ink-muted)]")}>
              Layout intent: {activeSlide.layout.intent}
            </small>
          )}
          <div className="button-row justify-end">
            <button
              className="primary-button"
              type="button"
              disabled={
                isRegeneratingImage ||
                !onRegenerateSlideImage ||
                !serializeEditablePrompt(imagePromptText).trim()
              }
              onClick={() => void regenerateActiveImage()}
            >
              <RefreshCw size={16} />
              {isRegeneratingImage ? "Regenerating..." : "Regenerate slide image"}
            </button>
          </div>
        </div>
      )}

      {isEditingText && (
        <div className={inspectorClass}>
          <label className={editorLabelClass}>
            <span>Primary text</span>
            <input className={editorInputClass} value={primaryText} onChange={(event) => setPrimaryText(event.target.value)} />
          </label>
          <label className={editorLabelClass}>
            <span>Secondary text</span>
            <textarea className={editorInputClass} value={secondaryText} onChange={(event) => setSecondaryText(event.target.value)} rows={2} />
          </label>
          <label className={editorLabelClass}>
            <span>Bullets, one per line</span>
            <textarea className={editorInputClass} value={bulletsText} onChange={(event) => setBulletsText(event.target.value)} rows={3} />
          </label>
          <div className="button-row">
            <button className="primary-button" type="button" disabled={!primaryText.trim()} onClick={() => void saveTextEdit()}>
              Save text
            </button>
            <button className="secondary-button" type="button" onClick={() => setIsEditingText(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
              onClick={() => {
                setActiveIndex(index);
                setShowImagePrompt(false);
                setIsEditingText(false);
              }}
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
