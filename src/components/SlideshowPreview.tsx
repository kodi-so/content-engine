import { Check, ChevronLeft, ChevronRight, RefreshCw, Trash2, X } from "lucide-react";
import { useState } from "react";
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
}: {
  title: string;
  subtitle: string;
  artifacts: ArtifactDoc[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const activeArtifact =
    artifacts[Math.min(activeIndex, Math.max(artifacts.length - 1, 0))];
  if (!activeArtifact) return null;

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

  return (
    <article className="slideshow-bundle-card create-preview-card">
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
            {activeIndex + 1}/{artifacts.length}
          </div>
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

      <div className="slideshow-thumb-row" aria-label="Slides">
        {artifacts.map((artifact, index) => (
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
        </div>
      </div>
    </article>
  );
}
