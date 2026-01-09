import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import {
  X,
  Download,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Type,
  Save,
  Sparkles,
  Contrast,
} from "lucide-react";

interface Slide {
  text: string;
  imageUrl: string;
  overlay?: boolean;
}

interface ContentEditorProps {
  content: Doc<"content">;
  product: Doc<"products"> | null;
  onClose: () => void;
  onDownload: () => void;
  onMarkPosted: () => void;
}

export default function ContentEditor({
  content,
  product,
  onClose,
  onDownload,
  onMarkPosted,
}: ContentEditorProps) {
  const updateSlide = useMutation(api.content.updateSlide);
  const updateCaption = useMutation(api.content.updateCaption);
  const regenerateSlideImage = useAction(api.slideshows.generate.regenerateSlideImage);

  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [editedSlides, setEditedSlides] = useState<Slide[]>(
    content.content?.slides || []
  );
  const [editedCaption, setEditedCaption] = useState(
    content.content?.caption || ""
  );
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const currentSlide = editedSlides[selectedSlideIndex];

  const handleSlideTextChange = (text: string) => {
    const newSlides = [...editedSlides];
    newSlides[selectedSlideIndex] = {
      ...newSlides[selectedSlideIndex],
      text,
    };
    setEditedSlides(newSlides);
    setHasChanges(true);
  };

  // Font size and color are now global config settings, not per-slide
  // These handlers are commented out but kept for potential future use
  /*
  const handleFontSizeChange = (fontSize: number) => {
    // Would need to update global config instead
  };

  const handleFontColorChange = (fontColor: string) => {
    // Would need to update global config instead
  };
  */

  const handleToggleOverlay = () => {
    const newSlides = [...editedSlides];
    newSlides[selectedSlideIndex] = {
      ...newSlides[selectedSlideIndex],
      overlay: !newSlides[selectedSlideIndex].overlay,
    };
    setEditedSlides(newSlides);
    setHasChanges(true);
  };

  const handleCaptionChange = (caption: string) => {
    setEditedCaption(caption);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save each edited slide
      for (let i = 0; i < editedSlides.length; i++) {
        const originalSlide = content.content?.slides?.[i];
        const editedSlide = editedSlides[i];

        // Check if slide was modified (text or overlay)
        if (
          originalSlide?.text !== editedSlide.text ||
          originalSlide?.overlay !== editedSlide.overlay
        ) {
          await updateSlide({
            id: content._id,
            slideIndex: i,
            slide: editedSlide,
          });
        }
      }

      // Save caption if changed
      if (editedCaption !== content.content?.caption) {
        await updateCaption({
          id: content._id,
          caption: editedCaption,
        });
      }

      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save:", error);
      alert("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCaption = async () => {
    await navigator.clipboard.writeText(editedCaption);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleDownloadSlide = (index: number) => {
    const slide = editedSlides[index];
    if (slide?.imageUrl) {
      const link = document.createElement("a");
      link.href = slide.imageUrl;
      link.download = `slide-${index + 1}.png`;
      link.click();
    }
  };

  const handleRegenerateSlide = async () => {
    if (!currentSlide) return;

    setIsRegenerating(true);
    try {
      const result = await regenerateSlideImage({
        contentId: content._id,
        slideIndex: selectedSlideIndex,
        slideText: currentSlide.text,
      });

      if (result.success && result.imageUrl) {
        // Update local state with the new image
        const newSlides = [...editedSlides];
        newSlides[selectedSlideIndex] = {
          ...newSlides[selectedSlideIndex],
          imageUrl: result.imageUrl,
        };
        setEditedSlides(newSlides);
      } else {
        alert(`Failed to regenerate image: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to regenerate slide:", error);
      alert("Failed to regenerate slide image");
    } finally {
      setIsRegenerating(false);
    }
  };

  // Font colors and sizes moved to global config, these are no longer used
  // const fontColors = [
  //   "#FFFFFF",
  //   "#000000",
  //   "#EF4444",
  //   "#F59E0B",
  //   "#10B981",
  //   "#3B82F6",
  //   "#8B5CF6",
  //   "#EC4899",
  // ];
  //
  // const fontSizes = [24, 32, 40, 48, 56, 64, 72];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "900px" }}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 style={{ marginBottom: "0.25rem" }}>Edit Content</h2>
            <p style={{ fontSize: "0.875rem", color: "#6b7280", margin: 0 }}>
              {product?.name} • {content.inputParams?.topic}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.5rem" }}>
          {/* Main Preview */}
          <div>
            {/* Large Slide Preview */}
            {currentSlide && (
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  paddingBottom: "100%",
                  borderRadius: "12px",
                  overflow: "hidden",
                  background: "#f3f4f6",
                }}
              >
                {currentSlide.imageUrl && (
                  <img
                    src={currentSlide.imageUrl}
                    alt={`Slide ${selectedSlideIndex + 1}`}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                )}
                {/* Dark Overlay (for text readability) */}
                {currentSlide.overlay && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0, 0, 0, 0.4)",
                    }}
                  />
                )}
                {/* Text Overlay Preview */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "2rem",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontSize: `${(content.content?.config?.fontSize || 48) / 2}px`,
                      color: "white",
                      fontFamily: '"TikTok Display Medium"',
                      fontWeight: 700,
                      textShadow: "rgb(0, 0, 0) -0.714286px -0.714286px 0px, rgb(0, 0, 0) 0.714286px -0.714286px 0px, rgb(0, 0, 0) -0.714286px 0.714286px 0px, rgb(0, 0, 0) 0.714286px 0.714286px 0px",
                      margin: 0,
                      lineHeight: 1.2,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {currentSlide.text}
                  </p>
                </div>
              </div>
            )}

            {/* Slide Navigation */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                marginTop: "1rem",
              }}
            >
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setSelectedSlideIndex(Math.max(0, selectedSlideIndex - 1))}
                disabled={selectedSlideIndex === 0}
              >
                <ChevronLeft size={16} />
              </button>

              <div className="carousel-preview" style={{ flex: 1, justifyContent: "center" }}>
                {editedSlides.map((slide, idx) => (
                  <div
                    key={idx}
                    className={`slide-preview ${selectedSlideIndex === idx ? "active" : ""}`}
                    onClick={() => setSelectedSlideIndex(idx)}
                    style={{ width: "60px", height: "60px", position: "relative" }}
                  >
                    {slide.imageUrl && <img src={slide.imageUrl} alt={`Slide ${idx + 1}`} />}
                    {slide.overlay && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(0, 0, 0, 0.4)",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                className="btn btn-sm btn-secondary"
                onClick={() =>
                  setSelectedSlideIndex(Math.min(editedSlides.length - 1, selectedSlideIndex + 1))
                }
                disabled={selectedSlideIndex === editedSlides.length - 1}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Edit Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Slide Text */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                <Type size={14} style={{ marginRight: "0.5rem" }} />
                Slide {selectedSlideIndex + 1} Text
              </label>
              <textarea
                className="textarea"
                value={currentSlide?.text || ""}
                onChange={(e) => handleSlideTextChange(e.target.value)}
                style={{ minHeight: "80px" }}
                maxLength={100}
              />
              <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                {currentSlide?.text?.length || 0}/100 characters
              </div>
            </div>

            {/* Font Size and Color are now global config settings, editing disabled */}
            {/* TODO: Add global font size/color editing if needed */}

            {/* Overlay Toggle */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                <Contrast size={14} style={{ marginRight: "0.5rem" }} />
                Overlay
              </label>
              <button
                className={`btn btn-sm ${currentSlide?.overlay ? "btn-primary" : "btn-secondary"}`}
                onClick={handleToggleOverlay}
                style={{ width: "100%" }}
              >
                {currentSlide?.overlay ? "Remove Dark Overlay" : "Add Dark Overlay"}
              </button>
            </div>

            {/* Regenerate and Download Slide */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleRegenerateSlide}
                disabled={isRegenerating}
                style={{ flex: 1 }}
              >
                {isRegenerating ? (
                  <>
                    <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> Regenerate Image
                  </>
                )}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleDownloadSlide(selectedSlideIndex)}
                disabled={isRegenerating}
              >
                <Download size={14} />
              </button>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "0.5rem 0" }} />

            {/* Caption */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Caption</label>
              <textarea
                className="textarea"
                value={editedCaption}
                onChange={(e) => handleCaptionChange(e.target.value)}
                style={{ minHeight: "60px" }}
                maxLength={150}
              />
              <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                {editedCaption.length}/150 characters
              </div>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={handleCopyCaption}>
              {copiedCaption ? <Check size={14} /> : <Copy size={14} />}
              {copiedCaption ? "Copied!" : "Copy Caption"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {hasChanges && (
            <span style={{ fontSize: "0.875rem", color: "#f59e0b", marginRight: "auto" }}>
              Unsaved changes
            </span>
          )}

          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>

          {hasChanges && (
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} /> Save Changes
                </>
              )}
            </button>
          )}

          <button className="btn btn-primary" onClick={onDownload}>
            <Download size={16} /> Download All
          </button>

          <button className="btn btn-success" onClick={onMarkPosted}>
            <Check size={16} /> Mark Posted
          </button>
        </div>
      </div>
    </div>
  );
}
