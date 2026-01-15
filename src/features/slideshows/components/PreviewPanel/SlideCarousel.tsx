import { useMemo } from "react";
import { Slide, TextElement, ContentConfig } from "../../types";
import { SlideEditor } from "./SlideEditor";
import {
  TEXT_STYLES,
  DEFAULT_CONFIG,
  PREVIEW_SLIDE_WIDTH,
  EXPORT_BASE_SIZE,
  getPreviewFontSize,
  getDimensions,
} from "../../styles";

/**
 * Use canvas to wrap text exactly like the export does.
 * This ensures preview matches what gets rendered to TikTok.
 */
function useCanvasTextWrap(
  text: string,
  fontSize: number,
  fontWeight: number
): string[] {
  return useMemo(() => {
    // Calculate maxWidth at export scale (1080px base)
    const maxWidth = (TEXT_STYLES.maxWidthPercent / 100) * EXPORT_BASE_SIZE;

    // Create off-screen canvas for measurement
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return [text];

    ctx.font = `${fontWeight} ${fontSize}px ${TEXT_STYLES.fontFamily}`;

    // Word wrap using same logic as export
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  }, [text, fontSize, fontWeight]);
}

interface SlideCarouselProps {
  slides: Slide[];
  selectedIndex: number;
  onSelectSlide: (index: number) => void;
  config?: ContentConfig;
  isEditingText: boolean;
  selectedElementId: string | null;
  editedText: string;
  editedFontSize: number;
  onTextChange: (text: string) => void;
  onIncrementFontSize: () => void;
  onDecrementFontSize: () => void;
  onDeleteText: () => void;
  onStartTextEdit: (element: TextElement) => void;
}

// Render a single text element
function TextElementView({
  element,
  slideWidth,
  onClick,
  stopPropagation = true,
}: {
  element: TextElement;
  slideWidth: number;
  onClick: () => void;
  stopPropagation?: boolean;
}) {
  const textShadow = TEXT_STYLES.getTextShadow(slideWidth);
  const previewFontSize = getPreviewFontSize(element.fontSize);
  const fontWeight = element.fontWeight || 700;

  // Use canvas-based text wrapping to match export exactly
  const lines = useCanvasTextWrap(
    element.content,
    element.fontSize,
    fontWeight
  );

  return (
    <div
      onClick={(e) => {
        if (stopPropagation) {
          e.stopPropagation();
        }
        onClick();
      }}
      style={{
        position: "absolute",
        top: `${element.position.y}%`,
        left: `${element.position.x}%`,
        transform: "translate(-50%, -50%)",
        color: element.fontColor || "#ffffff",
        fontSize: `${previewFontSize}px`,
        fontFamily: TEXT_STYLES.fontFamily,
        fontWeight,
        textAlign: element.textAlign || "center",
        textShadow,
        lineHeight: TEXT_STYLES.lineHeight,
        cursor: "pointer",
      }}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ whiteSpace: "nowrap" }}>{line}</div>
      ))}
    </div>
  );
}

export function SlideCarousel({
  slides,
  selectedIndex,
  onSelectSlide,
  config,
  isEditingText,
  selectedElementId,
  editedText,
  editedFontSize,
  onTextChange,
  onIncrementFontSize,
  onDecrementFontSize,
  onDeleteText,
  onStartTextEdit,
}: SlideCarouselProps) {
  const aspectRatio = config?.aspectRatio || DEFAULT_CONFIG.aspectRatio;
  const { height: slideHeight } = getDimensions(aspectRatio, PREVIEW_SLIDE_WIDTH);

  const currentSlide = slides[selectedIndex];
  const editingElement = isEditingText && selectedElementId && currentSlide?.textElements
    ? currentSlide.textElements.find(el => el.id === selectedElementId)
    : null;

  return (
    <div style={{ marginBottom: "1rem", position: "relative", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          height: `${slideHeight}px`,
          transform: `translateX(calc(50% - ${selectedIndex * (PREVIEW_SLIDE_WIDTH + 20)}px - ${PREVIEW_SLIDE_WIDTH / 2}px))`,
          transition: "transform 0.3s ease-out, height 0.3s ease-out",
        }}
      >
        {slides.map((slide, idx) => (
          <div
            key={idx}
            style={{
              minWidth: `${PREVIEW_SLIDE_WIDTH}px`,
              width: `${PREVIEW_SLIDE_WIDTH}px`,
              height: `${slideHeight}px`,
              position: "relative",
              borderRadius: "12px",
              overflow: "hidden",
              background: "#f3f4f6",
              cursor: "pointer",
              opacity: selectedIndex === idx ? 1 : 0.6,
              transition: "opacity 0.3s ease-out",
            }}
            onClick={() => onSelectSlide(idx)}
          >
            <img
              src={slide.imageUrl}
              alt={`Slide ${idx + 1}`}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            {/* Dark Overlay (for text readability) */}
            {slide.overlay && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.4)",
                }}
              />
            )}

            {/* Text Elements */}
            {selectedIndex === idx && slide.textElements?.map((element) => {
              // If editing this element, show the editor instead
              if (isEditingText && selectedElementId === element.id && editingElement) {
                return (
                  <SlideEditor
                    key={element.id}
                    editedText={editedText}
                    editedFontSize={editedFontSize}
                    position={element.position}
                    onTextChange={onTextChange}
                    onIncrementFontSize={onIncrementFontSize}
                    onDecrementFontSize={onDecrementFontSize}
                    onDeleteText={onDeleteText}
                  />
                );
              }

              // Otherwise show the text element (clickable to edit)
              return (
                <TextElementView
                  key={element.id}
                  element={element}
                  slideWidth={PREVIEW_SLIDE_WIDTH}
                  onClick={() => onStartTextEdit(element)}
                />
              );
            })}

            {/* Show text elements on non-selected slides (non-interactive) */}
            {selectedIndex !== idx && slide.textElements?.map((element) => (
              <TextElementView
                key={element.id}
                element={element}
                slideWidth={PREVIEW_SLIDE_WIDTH}
                onClick={() => {}}
                stopPropagation={false}
              />
            ))}

            {/* Slide number badge */}
            <div
              style={{
                position: "absolute",
                top: "0.5rem",
                right: "0.5rem",
                background: "rgba(0, 0, 0, 0.6)",
                color: "white",
                padding: "0.25rem 0.5rem",
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {idx + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
