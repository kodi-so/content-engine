import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  FileText,
  Image,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ArtifactDoc, SlideshowBundle } from "../types";
import {
  artifactImageUrl,
  artifactSummary,
  latestRevisionNote,
  slideNumber,
  supportsRegeneration,
} from "../lib/artifactUtils";
import { ArtifactPreview } from "./ArtifactPreview";

export function SlideshowBundleCard({
  bundle,
  revisionNotes,
  setRevisionNotes,
  approveArtifact,
  requestRevision,
  regenerateReviewedArtifact,
  removeSlideshowBundle,
}: {
  bundle: SlideshowBundle;
  revisionNotes: Record<string, string>;
  setRevisionNotes: (
    updater: (current: Record<string, string>) => Record<string, string>
  ) => void;
  approveArtifact: (artifactId: ArtifactDoc["_id"]) => Promise<void>;
  requestRevision: (artifactId: ArtifactDoc["_id"]) => Promise<void>;
  regenerateReviewedArtifact: (artifact: ArtifactDoc) => Promise<void>;
  removeSlideshowBundle: (bundle: SlideshowBundle) => Promise<void>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const activeArtifact =
    bundle.artifacts[Math.min(activeIndex, Math.max(bundle.artifacts.length - 1, 0))];
  if (!activeArtifact) return null;

  const moveSlide = (direction: -1 | 1) => {
    setActiveIndex((current) =>
      Math.min(Math.max(current + direction, 0), bundle.artifacts.length - 1)
    );
  };

  const handleTouchEnd = (clientX: number) => {
    if (touchStart === null) return;
    const delta = touchStart - clientX;
    if (Math.abs(delta) > 40) {
      moveSlide(delta > 0 ? 1 : -1);
    }
    setTouchStart(null);
  };

  return (
    <article className="slideshow-bundle-card">
      <div className="slideshow-bundle-header">
        <div>
          <div className="entity-eyebrow">Slideshow</div>
          <h3>{bundle.title}</h3>
          <p>{bundle.subtitle}</p>
        </div>
        <div className="slideshow-bundle-actions">
          <span>{bundle.reviewStatus}</span>
          <button
            className="danger-button"
            type="button"
            onClick={() => void removeSlideshowBundle(bundle)}
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
          {artifactImageUrl(activeArtifact) ? (
            <img src={artifactImageUrl(activeArtifact)} alt={activeArtifact.title || "Rendered slide"} />
          ) : (
            <ArtifactPreview artifact={activeArtifact} />
          )}
          <div className="slideshow-slide-count">
            {activeIndex + 1}/{bundle.artifacts.length}
          </div>
        </div>
        <button
          className="slideshow-nav-button"
          type="button"
          disabled={activeIndex === bundle.artifacts.length - 1}
          onClick={() => moveSlide(1)}
          aria-label="Next slide"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="slideshow-thumb-row" aria-label="Slides">
        {bundle.artifacts.map((artifact, index) => (
          <button
            className={`slideshow-thumb ${index === activeIndex ? "active" : ""}`}
            key={artifact._id}
            type="button"
            onClick={() => setActiveIndex(index)}
          >
            {artifactImageUrl(artifact) ? (
              <img src={artifactImageUrl(artifact)} alt="" />
            ) : (
              <span>{index + 1}</span>
            )}
          </button>
        ))}
      </div>

      <div className="slideshow-current-slide">
        <div className="artifact-copy">
          <div className="entity-eyebrow">Slide {slideNumber(activeArtifact)}</div>
          <h3>{activeArtifact.title || "Rendered slide"}</h3>
          <p>{artifactSummary(activeArtifact)}</p>
          {latestRevisionNote(activeArtifact) && (
            <p className="revision-note">
              Latest revision note: {latestRevisionNote(activeArtifact)}
            </p>
          )}
          <span>{activeArtifact.reviewStatus}</span>
        </div>
        <label className="revision-field">
          <span>Revision note for this slide</span>
          <textarea
            value={revisionNotes[activeArtifact._id] ?? ""}
            onChange={(event) =>
              setRevisionNotes((current) => ({
                ...current,
                [activeArtifact._id]: event.target.value,
              }))
            }
            placeholder="What should the agent change next time?"
            rows={3}
          />
        </label>
        <div className="button-row">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void approveArtifact(activeArtifact._id)}
          >
            <Check size={16} />
            Approve slide
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void requestRevision(activeArtifact._id)}
          >
            <X size={16} />
            Request revision
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={
              activeArtifact.reviewStatus !== "needs_revision" ||
              !supportsRegeneration(activeArtifact)
            }
            onClick={() => void regenerateReviewedArtifact(activeArtifact)}
          >
            <RefreshCw size={16} />
            Regenerate slide
          </button>
        </div>
      </div>
    </article>
  );
}

export function CreateSlideshowPreview({
  title,
  subtitle,
  artifacts,
  onDeleteSlide,
  onDuplicateSlide,
  onMoveSlide,
  onUpdateSlideText,
}: {
  title: string;
  subtitle: string;
  artifacts: ArtifactDoc[];
  onDeleteSlide?: (artifact: ArtifactDoc) => Promise<void>;
  onDuplicateSlide?: (artifact: ArtifactDoc) => Promise<void>;
  onMoveSlide?: (artifact: ArtifactDoc, direction: "left" | "right") => Promise<void>;
  onUpdateSlideText?: (
    artifact: ArtifactDoc,
    args: { primaryText: string; secondaryText?: string; bullets: string[] }
  ) => Promise<void>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [primaryText, setPrimaryText] = useState("");
  const [secondaryText, setSecondaryText] = useState("");
  const [bulletsText, setBulletsText] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeArtifact =
    artifacts[Math.min(activeIndex, Math.max(artifacts.length - 1, 0))];
  if (!activeArtifact) return null;
  const activeData = activeArtifact.data && typeof activeArtifact.data === "object"
    ? activeArtifact.data as {
        textBlocks?: Array<{ role?: string; text?: string; items?: string[] }>;
        visualPrompt?: string;
        prompt?: string;
        layout?: { intent?: string };
      }
    : {};
  const headlineBlock = activeData.textBlocks?.find((block) =>
    block.role === "headline" || block.role === "cta"
  );
  const bodyBlock = activeData.textBlocks?.find((block) => block.role === "body");
  const bulletBlock = activeData.textBlocks?.find((block) => block.role === "bullet_list");
  const imagePrompt = activeData.visualPrompt || activeData.prompt || activeArtifact.prompt || "No image prompt saved for this slide.";

  useEffect(() => {
    slideRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex, artifacts.length]);

  useEffect(() => {
    if (activeIndex > artifacts.length - 1) {
      setActiveIndex(Math.max(artifacts.length - 1, 0));
    }
  }, [activeIndex, artifacts.length]);

  const moveSlide = (direction: -1 | 1) => {
    setActiveIndex((current) =>
      Math.min(Math.max(current + direction, 0), artifacts.length - 1)
    );
  };

  const handleTouchEnd = (clientX: number) => {
    if (touchStart === null) return;
    const delta = touchStart - clientX;
    if (Math.abs(delta) > 40) {
      moveSlide(delta > 0 ? 1 : -1);
    }
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

    await onUpdateSlideText(activeArtifact, {
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
          <span>{activeArtifact.lifecycle ?? activeArtifact.reviewStatus}</span>
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
        <div className="create-slide-stage" ref={stageRef}>
          {artifacts.map((artifact, index) => (
            <button
              className={`create-slide-card ${index === activeIndex ? "active" : ""}`}
              key={artifact._id}
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
                {artifactImageUrl(artifact) ? (
                  <img src={artifactImageUrl(artifact)} alt={artifact.title || "Rendered slide"} />
                ) : (
                  <ArtifactPreview artifact={artifact} />
                )}
                <div className="slideshow-slide-count">
                  {index + 1}/{artifacts.length}
                </div>
              </div>
            </button>
          ))}
        </div>
        <button
          className="slideshow-nav-button"
          type="button"
          disabled={activeIndex === artifacts.length - 1}
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
          onClick={() => void onMoveSlide?.(activeArtifact, "left")}
        >
          <ArrowLeft size={16} />
          Move left
        </button>
        <button
          className="icon-action-button"
          type="button"
          disabled={!onMoveSlide || activeIndex === artifacts.length - 1}
          onClick={() => void onMoveSlide?.(activeArtifact, "right")}
        >
          <ArrowRight size={16} />
          Move right
        </button>
        <button
          className="icon-action-button"
          type="button"
          disabled={!onDuplicateSlide}
          onClick={() => void onDuplicateSlide?.(activeArtifact)}
        >
          <Copy size={16} />
          Duplicate
        </button>
        <button
          className="icon-action-button danger"
          type="button"
          disabled={!onDeleteSlide || artifacts.length <= 1}
          onClick={() => void onDeleteSlide?.(activeArtifact)}
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
          {activeData.layout?.intent && <small>Layout intent: {activeData.layout.intent}</small>}
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
        {artifacts.map((artifact, index) => (
          <button
            className={`slideshow-thumb ${index === activeIndex ? "active" : ""}`}
            key={artifact._id}
            type="button"
            onClick={() => {
              setActiveIndex(index);
              setShowImagePrompt(false);
              setIsEditingText(false);
            }}
          >
            {artifactImageUrl(artifact) ? (
              <img src={artifactImageUrl(artifact)} alt="" />
            ) : (
              <span>{index + 1}</span>
            )}
          </button>
        ))}
      </div>

      <div className="slideshow-current-slide">
        <div className="artifact-copy">
          <div className="entity-eyebrow">Slide {slideNumber(activeArtifact)}</div>
          <h3>{activeArtifact.title || "Rendered slide"}</h3>
          <p>{artifactSummary(activeArtifact)}</p>
        </div>
      </div>
    </article>
  );
}
