import { useState } from "react";
import { Download, Trash2, Calendar } from "lucide-react";
import { ContentItem, AspectRatio } from "../../types";
import { PlaceholderState } from "./PlaceholderState";
import { SlideCarousel } from "./SlideCarousel";
import { ThumbnailNav } from "./ThumbnailNav";
import { EditModeButtons } from "./EditModeButtons";
import { TikTokPostModal } from "./TikTokPostModal";

type ModalTab = "post" | "schedule";

// TikTok icon component
function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

interface PreviewPanelProps {
  selectedCarouselItem: ContentItem | undefined;
  selectedSlideIndex: number;
  onSelectSlide: (index: number) => void;

  // Text editing
  isEditingText: boolean;
  editedText: string;
  editedFontSize: number;
  onTextChange: (text: string) => void;
  onStartTextEdit: () => void;
  onCancelTextEdit: () => void;
  onSaveTextEdit: () => void;
  onDeleteText: () => void;
  onIncrementFontSize: () => void;
  onDecrementFontSize: () => void;

  // Overlay & ratio
  onToggleOverlay: () => void;
  showRatioMenu: boolean;
  onToggleRatioMenu: () => void;
  onChangeRatio: (ratio: AspectRatio) => void;

  // Image regeneration
  showRegeneratePopover: boolean;
  onToggleRegeneratePopover: () => void;
  onRegenerateImage: (prompt: string) => void;
  isRegenerating: boolean;

  // Actions
  onDownload: () => void;
  onDelete: () => void;
  isDownloading?: boolean;
}

export function PreviewPanel({
  selectedCarouselItem,
  selectedSlideIndex,
  onSelectSlide,
  isEditingText,
  editedText,
  editedFontSize,
  onTextChange,
  onStartTextEdit,
  onCancelTextEdit,
  onSaveTextEdit,
  onDeleteText,
  onIncrementFontSize,
  onDecrementFontSize,
  onToggleOverlay,
  showRatioMenu,
  onToggleRatioMenu,
  onChangeRatio,
  showRegeneratePopover,
  onToggleRegeneratePopover,
  onRegenerateImage,
  isRegenerating,
  onDownload,
  onDelete,
  isDownloading,
}: PreviewPanelProps) {
  const [showTikTokModal, setShowTikTokModal] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<ModalTab>("post");

  const openModal = (tab: ModalTab) => {
    setModalInitialTab(tab);
    setShowTikTokModal(true);
  };

  return (
    <div className="card" style={{ overflow: "visible", minWidth: 0 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Preview Editor</h2>
      </div>

      {selectedCarouselItem ? (
        <>
          {/* Slides Carousel Preview */}
          {selectedCarouselItem.content?.slides &&
            selectedCarouselItem.content.slides.length > 0 && (
              <>
                <SlideCarousel
                  slides={selectedCarouselItem.content.slides}
                  selectedIndex={selectedSlideIndex}
                  onSelectSlide={onSelectSlide}
                  config={selectedCarouselItem.content.config}
                  isEditingText={isEditingText}
                  editedText={editedText}
                  editedFontSize={editedFontSize}
                  onTextChange={onTextChange}
                  onIncrementFontSize={onIncrementFontSize}
                  onDecrementFontSize={onDecrementFontSize}
                  onDeleteText={onDeleteText}
                  onStartTextEdit={onStartTextEdit}
                />

                <EditModeButtons
                  isEditingText={isEditingText}
                  onCancelEdit={onCancelTextEdit}
                  onSaveEdit={onSaveTextEdit}
                  onToggleOverlay={onToggleOverlay}
                  onStartTextEdit={onStartTextEdit}
                  onToggleRatioMenu={onToggleRatioMenu}
                  showRatioMenu={showRatioMenu}
                  currentRatio={selectedCarouselItem.content.config?.aspectRatio || "1:1"}
                  hasOverlay={
                    selectedCarouselItem.content.slides[selectedSlideIndex]?.overlay || false
                  }
                  onChangeRatio={onChangeRatio}
                  showRegeneratePopover={showRegeneratePopover}
                  onToggleRegeneratePopover={onToggleRegeneratePopover}
                  onRegenerateImage={onRegenerateImage}
                  currentSlidePrompt={
                    selectedCarouselItem.content.slides[selectedSlideIndex]?.imagePrompt
                  }
                  isRegenerating={isRegenerating}
                />

                <ThumbnailNav
                  slides={selectedCarouselItem.content.slides}
                  selectedIndex={selectedSlideIndex}
                  onSelectSlide={onSelectSlide}
                />

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    onClick={onDownload}
                    disabled={isDownloading}
                    style={{ flex: 1, minWidth: "120px" }}
                  >
                    <Download size={16} /> {isDownloading ? "Downloading..." : "Download"}
                  </button>
                  <button
                    className="btn"
                    onClick={() => openModal("post")}
                    style={{
                      background: "#fe2c55",
                      color: "white",
                      border: "none",
                    }}
                  >
                    <TikTokIcon size={16} />
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => openModal("schedule")}
                  >
                    <Calendar size={16} />
                  </button>
                  <button
                    className="btn"
                    onClick={onDelete}
                    style={{
                      background: "#fef2f2",
                      color: "#dc2626",
                      border: "1px solid #fecaca",
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </>
            )}
        </>
      ) : (
        <PlaceholderState />
      )}

      {/* TikTok Post Modal */}
      {selectedCarouselItem && selectedCarouselItem.content?.slides && (
        <TikTokPostModal
          isOpen={showTikTokModal}
          onClose={() => setShowTikTokModal(false)}
          slides={selectedCarouselItem.content.slides}
          config={selectedCarouselItem.content.config}
          contentId={selectedCarouselItem._id}
          initialTab={modalInitialTab}
        />
      )}
    </div>
  );
}
