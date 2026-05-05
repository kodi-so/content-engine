import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  FileText,
  Image,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SlideshowDoc,
  SlideshowTextBlock,
} from "../types";

function getSlideshowSpec(slideshow: SlideshowDoc): CanonicalSlideshowSpec {
  return slideshow.spec && typeof slideshow.spec === "object"
    ? slideshow.spec as CanonicalSlideshowSpec
    : { slides: [] };
}

export function getActiveSlides(slideshow: SlideshowDoc): CanonicalSlideshowSlide[] {
  return [...(getSlideshowSpec(slideshow).slides ?? [])]
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

function slideTitle(slide: CanonicalSlideshowSlide) {
  const headline = slide.textBlocks?.find((block) =>
    block.role === "headline" || block.role === "cta"
  );
  return headline?.text || slide.purpose || `Slide ${slide.index}`;
}

function blockText(block: SlideshowTextBlock) {
  if (block.text?.trim()) return block.text.trim();
  return block.items?.filter(Boolean).join("\n") ?? "";
}

function textZoneClass(slide: CanonicalSlideshowSlide) {
  const textZone = slide.layout?.textZone;
  if (textZone === "top") return "top";
  if (textZone === "bottom") return "bottom";
  return "center";
}

function LiveSlideFrame({
  slide,
  index,
  total,
  thumbnail = false,
}: {
  slide: CanonicalSlideshowSlide;
  index: number;
  total: number;
  thumbnail?: boolean;
}) {
  const blocks = slide.textBlocks?.filter((block) => blockText(block)) ?? [];
  const contrast = slide.layout?.contrast ?? "gradient_scrim";

  return (
    <div className={`live-slide-preview ${thumbnail ? "thumbnail" : ""}`}>
      {slide.backgroundImageUrl ? (
        <img src={slide.backgroundImageUrl} alt="" />
      ) : (
        <div className="live-slide-placeholder" />
      )}
      {contrast !== "none" && <div className={`live-slide-overlay ${contrast}`} />}
      <div className={`live-slide-text-layer ${textZoneClass(slide)}`}>
        {blocks.map((block, blockIndex) => (
          <div
            className={`live-slide-text-block ${block.role ?? "body"} ${block.emphasis ?? "secondary"}`}
            key={`${block.role ?? "block"}-${blockIndex}`}
          >
            {block.items?.length ? (
              <ul>
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
      {!thumbnail && (
        <div className="slideshow-slide-count">
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
  const slides = getActiveSlides(slideshow);
  const activeSlide = slides[Math.min(activeIndex, Math.max(slides.length - 1, 0))];
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
    <article className="slideshow-bundle-card">
      <div className="slideshow-bundle-header">
        <div>
          <div className="entity-eyebrow">Slideshow</div>
          <h3>{slideshow.title}</h3>
          <p>{slides.length} slides · {new Date(slideshow.updatedAt).toLocaleString()}</p>
        </div>
        <div className="slideshow-bundle-actions">
          <span>{slideshow.status}</span>
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

      <div className="slideshow-editor">
        <button
          className="slideshow-nav-button"
          type="button"
          disabled={activeIndex === 0}
          onClick={() => moveSlide(-1)}
          aria-label="Previous slide"
        >
          <ChevronLeft size={22} />
        </button>
        <div
          className="slideshow-phone-frame"
          onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
          onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
        >
          <LiveSlideFrame slide={activeSlide} index={activeIndex} total={slides.length} />
        </div>
        <button
          className="slideshow-nav-button"
          type="button"
          disabled={activeIndex === slides.length - 1}
          onClick={() => moveSlide(1)}
          aria-label="Next slide"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="slideshow-thumb-row" aria-label="Slides">
        {slides.map((slide, index) => (
          <button
            className={`slideshow-thumb ${index === activeIndex ? "active" : ""}`}
            key={slide.slideId}
            type="button"
            onClick={() => setActiveIndex(index)}
          >
            <LiveSlideFrame slide={slide} index={index} total={slides.length} thumbnail />
          </button>
        ))}
      </div>

      <div className="slideshow-current-slide">
        <div className="artifact-copy">
          <div className="entity-eyebrow">Slide {activeSlide.index}</div>
          <h3>{slideTitle(activeSlide)}</h3>
          <p>{activeSlide.purpose || activeSlide.visualPrompt || "Readable TikTok carousel slide."}</p>
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
  onDuplicateSlide,
  onMoveSlide,
  onUpdateSlideText,
}: {
  title: string;
  subtitle: string;
  slideshow: SlideshowDoc;
  onDeleteSlide?: (slide: CanonicalSlideshowSlide) => Promise<void>;
  onDuplicateSlide?: (slide: CanonicalSlideshowSlide) => Promise<void>;
  onMoveSlide?: (slide: CanonicalSlideshowSlide, direction: "left" | "right") => Promise<void>;
  onUpdateSlideText?: (
    slide: CanonicalSlideshowSlide,
    args: { primaryText: string; secondaryText?: string; bullets: string[] }
  ) => Promise<void>;
}) {
  const slides = getActiveSlides(slideshow);
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [primaryText, setPrimaryText] = useState("");
  const [secondaryText, setSecondaryText] = useState("");
  const [bulletsText, setBulletsText] = useState("");
  const slideRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeSlide = slides[Math.min(activeIndex, Math.max(slides.length - 1, 0))];
  const headlineBlock = activeSlide?.textBlocks?.find((block) =>
    block.role === "headline" || block.role === "cta"
  );
  const bodyBlock = activeSlide?.textBlocks?.find((block) => block.role === "body");
  const bulletBlock = activeSlide?.textBlocks?.find((block) => block.role === "bullet_list");
  const imagePrompt = activeSlide?.visualPrompt || "No image prompt saved for this slide.";

  useEffect(() => {
    if (activeIndex > slides.length - 1) {
      setActiveIndex(Math.max(slides.length - 1, 0));
    }
  }, [activeIndex, slides.length]);

  useEffect(() => {
    slideRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
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

  return (
    <article className="slideshow-bundle-card create-preview-card create-workbench-card">
      <div className="slideshow-bundle-header">
        <div>
          <div className="entity-eyebrow">Create preview</div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <div className="slideshow-bundle-actions">
          <span>{slideshow.status}</span>
        </div>
      </div>

      <div className="create-slide-canvas" aria-label="Slideshow canvas">
        <button
          className="slideshow-nav-button"
          type="button"
          disabled={activeIndex === 0}
          onClick={() => moveSlide(-1)}
          aria-label="Previous slide"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="create-slide-stage">
          {slides.map((slide, index) => (
            <button
              className={`create-slide-card ${index === activeIndex ? "active" : ""}`}
              key={slide.slideId}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
              type="button"
              onClick={() => {
                setActiveIndex(index);
                setShowImagePrompt(false);
                setIsEditingText(false);
              }}
            >
              <div
                className="slideshow-phone-frame"
                onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
                onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
              >
                <LiveSlideFrame slide={slide} index={index} total={slides.length} />
              </div>
            </button>
          ))}
        </div>
        <button
          className="slideshow-nav-button"
          type="button"
          disabled={activeIndex === slides.length - 1}
          onClick={() => moveSlide(1)}
          aria-label="Next slide"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="create-slide-actions" aria-label="Slide actions">
        <button className="icon-action-button" type="button" onClick={() => setShowImagePrompt((value) => !value)}>
          <Image size={16} />
          Image prompt
        </button>
        <button className="icon-action-button" type="button" onClick={beginTextEdit}>
          <Edit3 size={16} />
          Edit text
        </button>
        <button
          className="icon-action-button"
          type="button"
          disabled={!onMoveSlide || activeIndex === 0}
          onClick={() => void onMoveSlide?.(activeSlide, "left")}
        >
          <ArrowLeft size={16} />
          Move left
        </button>
        <button
          className="icon-action-button"
          type="button"
          disabled={!onMoveSlide || activeIndex === slides.length - 1}
          onClick={() => void onMoveSlide?.(activeSlide, "right")}
        >
          <ArrowRight size={16} />
          Move right
        </button>
        <button
          className="icon-action-button"
          type="button"
          disabled={!onDuplicateSlide}
          onClick={() => void onDuplicateSlide?.(activeSlide)}
        >
          <Copy size={16} />
          Duplicate
        </button>
        <button
          className="icon-action-button danger"
          type="button"
          disabled={!onDeleteSlide || slides.length <= 1}
          onClick={() => void onDeleteSlide?.(activeSlide)}
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>

      {showImagePrompt && (
        <div className="slide-inspector">
          <div className="entity-eyebrow">
            <FileText size={13} />
            Slide image prompt
          </div>
          <p>{imagePrompt}</p>
          {activeSlide.layout?.intent && <small>Layout intent: {activeSlide.layout.intent}</small>}
        </div>
      )}

      {isEditingText && (
        <div className="slide-text-editor">
          <label>
            <span>Primary text</span>
            <input value={primaryText} onChange={(event) => setPrimaryText(event.target.value)} />
          </label>
          <label>
            <span>Secondary text</span>
            <textarea value={secondaryText} onChange={(event) => setSecondaryText(event.target.value)} rows={2} />
          </label>
          <label>
            <span>Bullets, one per line</span>
            <textarea value={bulletsText} onChange={(event) => setBulletsText(event.target.value)} rows={3} />
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

      <div className="slideshow-thumb-row" aria-label="Slides">
        {slides.map((slide, index) => (
          <button
            className={`slideshow-thumb ${index === activeIndex ? "active" : ""}`}
            key={slide.slideId}
            type="button"
            onClick={() => {
              setActiveIndex(index);
              setShowImagePrompt(false);
              setIsEditingText(false);
            }}
          >
            <LiveSlideFrame slide={slide} index={index} total={slides.length} thumbnail />
          </button>
        ))}
      </div>

      <div className="slideshow-current-slide">
        <div className="artifact-copy">
          <div className="entity-eyebrow">Slide {activeSlide.index}</div>
          <h3>{slideTitle(activeSlide)}</h3>
          <p>{activeSlide.purpose || "Readable TikTok carousel slide."}</p>
        </div>
      </div>
    </article>
  );
}
