import { Plus, Minus, Trash2, Move } from "lucide-react";
import { Slide, TextElement, ContentConfig } from "../../types";
import {
  TEXT_STYLES,
  DEFAULT_CONFIG,
  PREVIEW_SLIDE_WIDTH,
  getPreviewFontSize,
  getDimensions,
} from "../../styles";

// Pending edit for an element
interface PendingEdit {
  text: string;
  fontSize: number;
}

// Pending position for an element
interface PendingPosition {
  x: number;
  y: number;
}

// Pending size for an element
interface PendingSize {
  width: number;
  height: number;
}

interface SlideCarouselProps {
  slides: Slide[];
  selectedIndex: number;
  onSelectSlide: (index: number) => void;
  config?: ContentConfig;
  isEditMode: boolean;
  selectedElementId: string | null;
  editedText: string;
  editedFontSize: number;
  pendingDeletes: Set<string>;
  pendingAdds: TextElement[];
  pendingEdits: Map<string, PendingEdit>;
  pendingPositions: Map<string, PendingPosition>;
  pendingSizes: Map<string, PendingSize>;
  onTextChange: (text: string) => void;
  onIncrementFontSize: () => void;
  onDecrementFontSize: () => void;
  onDeleteText: () => void;
  onStartTextEdit: (element: TextElement) => void;
  onAddText: () => void;
  onUpdatePosition: (elementId: string, position: { x: number; y: number }, element: TextElement) => void;
  onUpdateSize: (elementId: string, size: { width: number; height: number }, element: TextElement) => void;
}

// Render a single text element (non-editing state)
function TextElementView({
  element,
  slideWidth,
  onClick,
  stopPropagation = true,
  pendingEdit,
  pendingPosition,
  isEditMode,
  onDrag,
}: {
  element: TextElement;
  slideWidth: number;
  onClick: () => void;
  stopPropagation?: boolean;
  pendingEdit?: PendingEdit;
  pendingPosition?: PendingPosition;
  isEditMode?: boolean;
  onDrag?: (elementId: string, position: { x: number; y: number }, element: TextElement) => void;
}) {
  const textShadow = TEXT_STYLES.getTextShadow(slideWidth);
  // Use pending edit values if available
  const displayText = pendingEdit?.text ?? element.content;
  const displayFontSize = pendingEdit?.fontSize ?? element.fontSize;
  const previewFontSize = getPreviewFontSize(displayFontSize);
  const fontWeight = element.fontWeight || TEXT_STYLES.fontWeight;

  // Use pending position if available, otherwise use element position
  const position = pendingPosition || element.position;

  // Calculate fixed dimensions from element size (percentage of slide)
  const widthPx = (element.size.width / 100) * slideWidth;
  const heightPx = (element.size.height / 100) * slideWidth * (5 / 4); // Assuming 4:5 aspect ratio for now

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditMode || !onDrag) return;

    e.stopPropagation();

    const slideElement = (e.target as HTMLElement).closest('[data-slide-container]') as HTMLElement;
    if (!slideElement) return;

    const slideRect = slideElement.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let hasDragged = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Only start dragging if moved more than 5px (prevents accidental drags)
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!hasDragged && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

      hasDragged = true;
      const x = ((moveEvent.clientX - slideRect.left) / slideRect.width) * 100;
      const y = ((moveEvent.clientY - slideRect.top) / slideRect.height) * 100;
      onDrag(element.id, { x, y }, element);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // If we didn't drag, treat it as a click to select
      if (!hasDragged) {
        onClick();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      onClick={(e) => {
        // Only handle click if not in edit mode (edit mode uses mousedown/mouseup)
        if (!isEditMode) {
          if (stopPropagation) {
            e.stopPropagation();
          }
          onClick();
        }
      }}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        top: `${position.y}%`,
        left: `${position.x}%`,
        transform: "translate(-50%, -50%)",
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: element.fontColor || TEXT_STYLES.fontColor,
        fontSize: `${previewFontSize}px`,
        fontFamily: TEXT_STYLES.fontFamily,
        fontWeight,
        textAlign: element.textAlign || TEXT_STYLES.textAlign,
        textShadow,
        lineHeight: TEXT_STYLES.lineHeight,
        cursor: isEditMode ? "grab" : "pointer",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {displayText}
    </div>
  );
}

// Render an editable text element with controls
function EditableTextElement({
  element,
  slideWidth,
  slideHeight,
  editedText,
  editedFontSize,
  pendingPosition,
  pendingSize,
  onTextChange,
  onIncrementFontSize,
  onDecrementFontSize,
  onDeleteText,
  onDrag,
  onResize,
}: {
  element: TextElement;
  slideWidth: number;
  slideHeight: number;
  editedText: string;
  editedFontSize: number;
  pendingPosition?: PendingPosition;
  pendingSize?: PendingSize;
  onTextChange: (text: string) => void;
  onIncrementFontSize: () => void;
  onDecrementFontSize: () => void;
  onDeleteText: () => void;
  onDrag?: (elementId: string, position: { x: number; y: number }, element: TextElement) => void;
  onResize?: (elementId: string, size: { width: number; height: number }, element: TextElement) => void;
}) {
  const textShadow = TEXT_STYLES.getTextShadow(slideWidth);
  const previewFontSize = getPreviewFontSize(editedFontSize);
  const fontWeight = element.fontWeight || TEXT_STYLES.fontWeight;

  // Use pending position if available, otherwise use element position
  const position = pendingPosition || element.position;

  // Use pending size if available, otherwise use element size
  const size = pendingSize || element.size;

  // Calculate fixed dimensions from element size (percentage of slide)
  const widthPx = (size.width / 100) * slideWidth;
  const heightPx = (size.height / 100) * slideHeight;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onDrag) return;

    e.stopPropagation();
    e.preventDefault();

    const slideElement = (e.target as HTMLElement).closest('[data-slide-container]') as HTMLElement;
    if (!slideElement) return;

    const slideRect = slideElement.getBoundingClientRect();

    // Calculate offset from cursor to element center (in percentage)
    const cursorXPercent = ((e.clientX - slideRect.left) / slideRect.width) * 100;
    const cursorYPercent = ((e.clientY - slideRect.top) / slideRect.height) * 100;
    const offsetX = cursorXPercent - position.x;
    const offsetY = cursorYPercent - position.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const cursorX = ((moveEvent.clientX - slideRect.left) / slideRect.width) * 100;
      const cursorY = ((moveEvent.clientY - slideRect.top) / slideRect.height) * 100;
      // Subtract the offset to keep element position relative to where we grabbed
      onDrag(element.id, { x: cursorX - offsetX, y: cursorY - offsetY }, element);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle corner resize
  const handleResizeMouseDown = (corner: 'nw' | 'ne' | 'sw' | 'se') => (e: React.MouseEvent) => {
    if (!onResize) return;

    e.stopPropagation();
    e.preventDefault();

    const slideElement = (e.target as HTMLElement).closest('[data-slide-container]') as HTMLElement;
    if (!slideElement) return;

    const slideRect = slideElement.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startSize = { ...size };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaXPx = moveEvent.clientX - startX;
      const deltaYPx = moveEvent.clientY - startY;

      // Convert pixel delta to percentage
      const deltaWidthPercent = (deltaXPx / slideRect.width) * 100;
      const deltaHeightPercent = (deltaYPx / slideRect.height) * 100;

      let newWidth = startSize.width;
      let newHeight = startSize.height;

      // Adjust size based on which corner is being dragged
      // Since element is centered, we need to double the delta (dragging one edge affects both sides visually)
      if (corner === 'ne' || corner === 'se') {
        newWidth = startSize.width + deltaWidthPercent * 2;
      } else {
        newWidth = startSize.width - deltaWidthPercent * 2;
      }

      if (corner === 'sw' || corner === 'se') {
        newHeight = startSize.height + deltaHeightPercent * 2;
      } else {
        newHeight = startSize.height - deltaHeightPercent * 2;
      }

      onResize(element.id, { width: newWidth, height: newHeight }, element);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Corner handle style
  const cornerHandleStyle: React.CSSProperties = {
    position: 'absolute',
    width: '10px',
    height: '10px',
    background: '#3b82f6',
    border: '2px solid white',
    borderRadius: '2px',
    zIndex: 10,
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: `${position.y}%`,
        left: `${position.x}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Text with blue dashed outline - fixed dimensions */}
      <div
        style={{
          width: `${widthPx}px`,
          height: `${heightPx}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: element.fontColor || TEXT_STYLES.fontColor,
          fontSize: `${previewFontSize}px`,
          fontFamily: TEXT_STYLES.fontFamily,
          fontWeight,
          textAlign: element.textAlign || TEXT_STYLES.textAlign,
          textShadow,
          lineHeight: TEXT_STYLES.lineHeight,
          outline: "2px dashed rgba(59, 130, 246, 0.8)",
          outlineOffset: "4px",
          borderRadius: "4px",
          cursor: "text",
          overflow: "hidden",
        }}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onTextChange(e.currentTarget.textContent || "")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      >
        {editedText}
      </div>

      {/* Control icons */}
      <div
        style={{
          position: "absolute",
          bottom: "-32px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "4px",
          background: "rgba(0, 0, 0, 0.7)",
          borderRadius: "6px",
          padding: "4px",
        }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "4px",
            background: "transparent",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
          }}
          title="Drag to reposition"
        >
          <Move size={14} />
        </div>
        <div style={{ width: "1px", background: "rgba(255,255,255,0.3)", margin: "2px 2px" }} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDecrementFontSize();
          }}
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "4px",
            border: "none",
            background: "transparent",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          title="Decrease font size"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onIncrementFontSize();
          }}
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "4px",
            border: "none",
            background: "transparent",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          title="Increase font size"
        >
          <Plus size={14} />
        </button>
        <div style={{ width: "1px", background: "rgba(255,255,255,0.3)", margin: "2px 2px" }} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteText();
          }}
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "4px",
            border: "none",
            background: "transparent",
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          title="Delete text element"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Corner resize handles */}
      <div
        onMouseDown={handleResizeMouseDown('nw')}
        style={{
          ...cornerHandleStyle,
          top: '-5px',
          left: '-5px',
          cursor: 'nw-resize',
        }}
        title="Resize"
      />
      <div
        onMouseDown={handleResizeMouseDown('ne')}
        style={{
          ...cornerHandleStyle,
          top: '-5px',
          right: '-5px',
          cursor: 'ne-resize',
        }}
        title="Resize"
      />
      <div
        onMouseDown={handleResizeMouseDown('sw')}
        style={{
          ...cornerHandleStyle,
          bottom: '-5px',
          left: '-5px',
          cursor: 'sw-resize',
        }}
        title="Resize"
      />
      <div
        onMouseDown={handleResizeMouseDown('se')}
        style={{
          ...cornerHandleStyle,
          bottom: '-5px',
          right: '-5px',
          cursor: 'se-resize',
        }}
        title="Resize"
      />
    </div>
  );
}

export function SlideCarousel({
  slides,
  selectedIndex,
  onSelectSlide,
  config,
  isEditMode,
  selectedElementId,
  editedText,
  editedFontSize,
  pendingDeletes,
  pendingAdds,
  pendingEdits,
  pendingPositions,
  pendingSizes,
  onTextChange,
  onIncrementFontSize,
  onDecrementFontSize,
  onDeleteText,
  onStartTextEdit,
  onAddText,
  onUpdatePosition,
  onUpdateSize,
}: SlideCarouselProps) {
  const aspectRatio = config?.aspectRatio || DEFAULT_CONFIG.aspectRatio;
  const { height: slideHeight } = getDimensions(aspectRatio, PREVIEW_SLIDE_WIDTH);

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
        {slides.map((slide, idx) => {
          // Get visible elements for this slide (original - deleted + added)
          const originalElements = slide.textElements || [];
          const visibleOriginal = originalElements.filter((el) => !pendingDeletes.has(el.id));
          // Only show pending adds on the selected slide
          const visibleAdds = selectedIndex === idx ? pendingAdds : [];
          const allVisibleElements = [...visibleOriginal, ...visibleAdds];

          return (
            <div
              key={idx}
              data-slide-container
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

              {/* Text Elements on selected slide */}
              {selectedIndex === idx && allVisibleElements.map((element) => {
                const isSelected = selectedElementId === element.id;

                if (isSelected) {
                  // Show editable element with controls
                  return (
                    <EditableTextElement
                      key={element.id}
                      element={element}
                      slideWidth={PREVIEW_SLIDE_WIDTH}
                      slideHeight={slideHeight}
                      editedText={editedText}
                      editedFontSize={editedFontSize}
                      pendingPosition={pendingPositions.get(element.id)}
                      pendingSize={pendingSizes.get(element.id)}
                      onTextChange={onTextChange}
                      onIncrementFontSize={onIncrementFontSize}
                      onDecrementFontSize={onDecrementFontSize}
                      onDeleteText={onDeleteText}
                      onDrag={onUpdatePosition}
                      onResize={onUpdateSize}
                    />
                  );
                }

                // Show regular text element (clickable to edit)
                return (
                  <TextElementView
                    key={element.id}
                    element={element}
                    slideWidth={PREVIEW_SLIDE_WIDTH}
                    onClick={() => onStartTextEdit(element)}
                    pendingEdit={pendingEdits.get(element.id)}
                    pendingPosition={pendingPositions.get(element.id)}
                    isEditMode={isEditMode}
                    onDrag={onUpdatePosition}
                  />
                );
              })}

              {/* Show text elements on non-selected slides (non-interactive, no pending changes) */}
              {selectedIndex !== idx && (slide.textElements || []).map((element) => (
                <TextElementView
                  key={element.id}
                  element={element}
                  slideWidth={PREVIEW_SLIDE_WIDTH}
                  onClick={() => {}}
                  stopPropagation={false}
                />
              ))}

              {/* Add text button - shown in edit mode on selected slide */}
              {selectedIndex === idx && isEditMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddText();
                  }}
                  title="Add text element"
                  style={{
                    position: "absolute",
                    bottom: "0.75rem",
                    right: "0.75rem",
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    border: "none",
                    background: "#3b82f6",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
                    zIndex: 5,
                  }}
                >
                  <Plus size={20} />
                </button>
              )}

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
          );
        })}
      </div>
    </div>
  );
}
