import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileText,
  Image,
  Plus,
  Send,
  RefreshCw,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
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

const textWorkspaceInspectorClass =
  "flex max-h-[38.75rem] min-h-[29rem] w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-sm)] max-[1079px]:max-h-none max-[1079px]:min-h-0";

const rangeClass =
  "h-2 w-full accent-[var(--color-primary)]";

const colorInputClass =
  "h-9 w-12 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1";

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

function newTextBlock(index: number): SlideshowTextBlock {
  return normalizedTextBlock({
    id: `text-${Date.now()}`,
    role: index === 0 ? "headline" : "body",
    text: "Add text here",
    items: [],
    emphasis: index === 0 ? "primary" : "secondary",
    x: 16,
    y: Math.min(82, 38 + index * 12),
    width: 68,
    align: "center",
    fontSize: index === 0 ? 72 : 48,
    fontWeight: 800,
    color: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 16,
    backgroundStyle: "none",
    backgroundColor: "#FFFFFF",
  }, index);
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
    args: { textBlocks: SlideshowTextBlock[] }
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
  const previewSlideRefs = useRef<Array<HTMLElement | null>>([]);
  const thumbnailTrackRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasCenteredPreviewOnce = useRef(false);
  const hasCenteredThumbnailOnce = useRef(false);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imagePromptText, setImagePromptText] = useState("");
  const [useReferenceImage, setUseReferenceImage] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [localTextBlocks, setLocalTextBlocks] = useState<SlideshowTextBlock[]>([]);
  const [selectedTextBlockId, setSelectedTextBlockId] = useState("");
  const activeSlide = slides[Math.min(activeIndex, Math.max(slides.length - 1, 0))];
  const activeRenderingMode = activeSlide?.renderingMode ?? spec.renderingMode ?? "background_plus_overlay";
  const isFullGraphic = activeRenderingMode === "full_graphic_generation";
  const selectedTextBlock = localTextBlocks.find((block, index) =>
    textBlockId(block, index) === selectedTextBlockId
  );
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
    if (!isEditingText || !activeSlide || isFullGraphic) return;
    const blocks = normalizedTextBlocks(activeSlide);
    setLocalTextBlocks(blocks);
    setSelectedTextBlockId(textBlockId(blocks[0], 0));
  }, [activeSlide?.slideId, isEditingText, isFullGraphic]);

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

  const beginTextEdit = (targetBlockId?: string) => {
    if (isFullGraphic) return;
    const blocks = normalizedTextBlocks(activeSlide);
    setLocalTextBlocks(blocks);
    const hasTarget = targetBlockId && blocks.some((block, index) => textBlockId(block, index) === targetBlockId);
    setSelectedTextBlockId(hasTarget ? targetBlockId : textBlockId(blocks[0], 0));
    setIsEditingText(true);
  };

  const saveTextEdit = async () => {
    if (!onUpdateSlideText || !localTextBlocks.some((block) => blockText(block))) return;

    await onUpdateSlideText(activeSlide, {
      textBlocks: localTextBlocks
        .map((block, index) => normalizedTextBlock(block, index))
        .filter((block) => blockText(block)),
    });
    setIsEditingText(false);
  };

  const patchTextBlock = (blockId: string, patch: Partial<SlideshowTextBlock>) => {
    setLocalTextBlocks((current) =>
      current.map((block, index) =>
        textBlockId(block, index) === blockId ? { ...block, ...patch } : block
      )
    );
  };

  const updateTextBlockText = (blockId: string, text: string) => {
    patchTextBlock(blockId, { text });
  };

  const addTextBlock = () => {
    setLocalTextBlocks((current) => {
      const block = newTextBlock(current.length);
      setSelectedTextBlockId(textBlockId(block, current.length));
      return [...current, block];
    });
    setIsEditingText(true);
  };

  const deleteSelectedTextBlock = () => {
    setLocalTextBlocks((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((block, index) => textBlockId(block, index) !== selectedTextBlockId);
      setSelectedTextBlockId(next[0] ? textBlockId(next[0], 0) : "");
      return next;
    });
  };

  const patchSelectedTextBlock = (patch: Partial<SlideshowTextBlock>) => {
    if (!selectedTextBlockId) return;
    patchTextBlock(selectedTextBlockId, patch);
  };

  const patchBackgroundBox = (enabled: boolean) => {
    patchSelectedTextBlock(enabled
      ? {
          backgroundStyle: "solid",
          backgroundColor: "#FFFFFF",
          backgroundOpacity: 1,
          color: "#000000",
          strokeWidth: 0,
        }
      : {
          backgroundStyle: "none",
          backgroundOpacity: 0,
          color: "#FFFFFF",
          strokeColor: "#000000",
          strokeWidth: 16,
        });
  };

  const patchBackgroundColor = (color: string) => {
    const normalizedColor = color.toUpperCase();
    patchSelectedTextBlock({
      backgroundColor: normalizedColor,
      ...(normalizedColor === "#FFFFFF"
        ? { color: "#000000", strokeWidth: 0 }
        : {}),
    });
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

  const textSettingsPanel = isEditingText ? (
    <aside className={textWorkspaceInspectorClass} aria-label="Text settings">
      <div className="grid min-h-0 flex-1 content-start gap-[var(--space-3)] overflow-y-auto p-[var(--space-4)]">
        <div className="entity-eyebrow">
          <Type size={13} />
          Text blocks
        </div>
        <div className="grid gap-[var(--space-2)]">
          {localTextBlocks.map((block, index) => {
            const blockId = textBlockId(block, index);
            return (
              <button
                className={cx(
                  "min-w-0 truncate rounded-[var(--radius-md)] border px-[var(--space-3)] py-[var(--space-2)] text-left text-[0.8rem] font-[650]",
                  selectedTextBlockId === blockId
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]"
                )}
                key={blockId}
                type="button"
                onClick={() => setSelectedTextBlockId(blockId)}
              >
                {blockText(block)}
              </button>
            );
          })}
        </div>

        {selectedTextBlock ? (
          <>
            <div className="entity-eyebrow border-t border-[var(--color-border)] pt-[var(--space-3)]">
              <Edit3 size={13} />
              Selected text
            </div>
            <label className={editorLabelClass}>
              <span>Text</span>
              <textarea
                className={editorInputClass}
                value={selectedTextBlock.text ?? ""}
                rows={3}
                onChange={(event) => patchSelectedTextBlock({ text: event.target.value })}
              />
            </label>
            <div className="grid content-end gap-[var(--space-2)]">
              <span className="text-[0.86rem] font-[650] text-[var(--color-ink)]">Align</span>
              <div className="flex gap-[var(--space-1)]" aria-label="Text alignment">
                {[
                  { value: "left", icon: AlignLeft },
                  { value: "center", icon: AlignCenter },
                  { value: "right", icon: AlignRight },
                ].map(({ value, icon: Icon }) => (
                  <button
                    className={cx(
                      "grid size-9 place-items-center rounded-[var(--radius-md)] border",
                      selectedTextBlock.align === value
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]"
                    )}
                    key={value}
                    type="button"
                    onClick={() => patchSelectedTextBlock({ align: value as SlideshowTextBlock["align"] })}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-[var(--space-2)]">
              <label className={editorLabelClass}>
                <span>X: {Math.round(selectedTextBlock.x ?? 0)}%</span>
                <input className={rangeClass} type="range" min={0} max={88} value={selectedTextBlock.x ?? 0} onChange={(event) => patchSelectedTextBlock({ x: Number(event.target.value) })} />
              </label>
              <label className={editorLabelClass}>
                <span>Y: {Math.round(selectedTextBlock.y ?? 0)}%</span>
                <input className={rangeClass} type="range" min={0} max={92} value={selectedTextBlock.y ?? 42} onChange={(event) => patchSelectedTextBlock({ y: Number(event.target.value) })} />
              </label>
            </div>
            <label className={editorLabelClass}>
              <span>Width: {Math.round(selectedTextBlock.width ?? 80)}%</span>
              <input className={rangeClass} type="range" min={12} max={100} value={selectedTextBlock.width ?? 80} onChange={(event) => patchSelectedTextBlock({ width: Number(event.target.value) })} />
            </label>
            <div className="grid grid-cols-2 gap-[var(--space-2)]">
              <label className={editorLabelClass}>
                <span>Size: {Math.round(selectedTextBlock.fontSize ?? 72)}px</span>
                <input className={rangeClass} type="range" min={20} max={150} value={selectedTextBlock.fontSize ?? 72} onChange={(event) => patchSelectedTextBlock({ fontSize: Number(event.target.value) })} />
              </label>
              <label className={editorLabelClass}>
                <span>Weight: {Math.round(selectedTextBlock.fontWeight ?? 800)}</span>
                <input className={rangeClass} type="range" min={400} max={900} step={100} value={selectedTextBlock.fontWeight ?? 800} onChange={(event) => patchSelectedTextBlock({ fontWeight: Number(event.target.value) })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-[var(--space-2)]">
              <div className={editorLabelClass}>
                <span>Color</span>
                <input className={colorInputClass} type="color" value={selectedTextBlock.color ?? "#FFFFFF"} onChange={(event) => patchSelectedTextBlock({ color: event.target.value })} />
              </div>
              <div className={editorLabelClass}>
                <span>Stroke</span>
                <input className={colorInputClass} type="color" value={selectedTextBlock.strokeColor ?? "#000000"} onChange={(event) => patchSelectedTextBlock({ strokeColor: event.target.value })} />
              </div>
            </div>
            <label className={editorLabelClass}>
              <span>Stroke width: {Math.round(selectedTextBlock.strokeWidth ?? 16)}px</span>
              <input className={rangeClass} type="range" min={0} max={48} value={selectedTextBlock.strokeWidth ?? 16} onChange={(event) => patchSelectedTextBlock({ strokeWidth: Number(event.target.value) })} />
            </label>
            <label className="flex items-center gap-[var(--space-2)] text-[0.86rem] font-[650] text-[var(--color-ink)]">
              <input
                checked={selectedTextBlock.backgroundStyle === "solid"}
                className="size-4 accent-[var(--color-primary)]"
                type="checkbox"
                onChange={(event) => patchBackgroundBox(event.target.checked)}
              />
              <span>Background box</span>
            </label>
            {selectedTextBlock.backgroundStyle === "solid" && (
              <div className={editorLabelClass}>
                <span>Background color</span>
                <input className={colorInputClass} type="color" value={selectedTextBlock.backgroundColor ?? "#FFFFFF"} onChange={(event) => patchBackgroundColor(event.target.value)} />
              </div>
            )}
          </>
        ) : (
          <p className={inspectorTextClass}>Select a text block on the slide.</p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-[var(--space-2)] border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] px-[var(--space-4)] py-[var(--space-3)]">
        <button className="secondary-button" type="button" onClick={addTextBlock}>
          <Plus size={16} />
          Add
        </button>
        <button className="primary-button" type="button" disabled={!localTextBlocks.some((block) => blockText(block))} onClick={() => void saveTextEdit()}>
          Save
        </button>
        <button className="secondary-button" type="button" onClick={() => setIsEditingText(false)}>
          Cancel
        </button>
        <button className="danger-button" type="button" disabled={localTextBlocks.length <= 1} onClick={deleteSelectedTextBlock}>
          <Trash2 size={16} />
        </button>
      </div>
    </aside>
  ) : null;

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

      <div
        className={cx(
          "grid items-center gap-[var(--space-3)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[radial-gradient(circle_at_18%_20%,oklch(100%_0_0_/_0.75),transparent_24%),linear-gradient(135deg,var(--color-page)_0%,var(--color-page-quiet)_100%)] px-[var(--space-3)] py-[var(--space-5)] max-[900px]:grid-cols-1",
          isEditingText
            ? "min-[901px]:grid-cols-[2.75rem_minmax(0,1fr)_18rem_2.75rem]"
            : "min-[901px]:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]"
        )}
      >
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
          className={cx(
            "min-h-[29rem] max-h-[38.75rem] items-center gap-[var(--space-4)] overflow-x-auto [scrollbar-width:none] [scroll-snap-type:x_mandatory] [&::-webkit-scrollbar]:hidden",
            isEditingText
              ? "grid place-items-center overflow-hidden px-[var(--space-2)]"
              : "flex [padding-left:max(0px,calc(50%_-_7.8125rem))] [padding-right:max(0px,calc(75%_-_7.8125rem))]"
          )}
          ref={previewTrackRef}
        >
          {slides.map((slide, index) => {
            const isActive = index === activeIndex;
            if (isEditingText && !isActive) return null;
            const slideForFrame = isActive && isEditingText
              ? { ...slide, textBlocks: localTextBlocks }
              : slide;
            const frame = (
              <div
                className={cx(
                  phoneFrameClass,
                  "w-full min-h-0",
                  isActive ? "" : "border-4"
                )}
                onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
                onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
              >
                <LiveSlideFrame
                  slide={slideForFrame}
                  index={index}
                  total={slides.length}
                  renderingMode={spec.renderingMode}
                  editable={isActive && isEditingText}
                  selectedBlockId={selectedTextBlockId}
                  onSelectBlock={setSelectedTextBlockId}
                  onChangeBlockText={updateTextBlockText}
                  onPatchBlock={patchTextBlock}
                  onBeginTextEdit={isActive && !isFullGraphic ? beginTextEdit : undefined}
                />
              </div>
            );

            return isActive ? (
              <div
                className="grid w-[15.625rem] shrink-0 place-items-center border-0 bg-transparent p-0 [scroll-snap-align:center] transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-[180ms] ease-[var(--ease-out)]"
                key={slide.slideId}
                ref={(node) => {
                  previewSlideRefs.current[index] = node;
                }}
              >
                {frame}
              </div>
            ) : (
              <button
                className="grid w-[15.625rem] shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 [scroll-snap-align:center] scale-[0.72] opacity-[0.58] transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-[180ms] ease-[var(--ease-out)]"
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
                {frame}
              </button>
            );
          })}
        </div>
        {textSettingsPanel}
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
        <button className={actionButtonClass} type="button" disabled={isFullGraphic} onClick={() => beginTextEdit()}>
          <Edit3 size={16} />
          {isEditingText ? "Editing text" : "Edit text"}
        </button>
        <button className={actionButtonClass} type="button" disabled={isFullGraphic} onClick={addTextBlock}>
          <Plus size={16} />
          Add text
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
