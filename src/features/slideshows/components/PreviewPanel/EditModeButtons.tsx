import { X, Check, Contrast, ImageIcon, Type } from "lucide-react";
import { AspectRatio } from "../../types";
import { ImageRegeneratePopover } from "./ImageRegeneratePopover";

interface EditModeButtonsProps {
  isEditMode: boolean;
  onEnterEditMode: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleOverlay: () => void;
  onToggleRatioMenu: () => void;
  showRatioMenu: boolean;
  currentRatio: AspectRatio;
  hasOverlay: boolean;
  onChangeRatio: (ratio: AspectRatio) => void;
  // Image regeneration
  showRegeneratePopover: boolean;
  onToggleRegeneratePopover: () => void;
  onRegenerateImage: (prompt: string) => void;
  currentSlidePrompt?: string;
  isRegenerating: boolean;
}

export function EditModeButtons({
  isEditMode,
  onEnterEditMode,
  onCancelEdit,
  onSaveEdit,
  onToggleOverlay,
  onToggleRatioMenu,
  showRatioMenu,
  currentRatio,
  hasOverlay,
  onChangeRatio,
  showRegeneratePopover,
  onToggleRegeneratePopover,
  onRegenerateImage,
  currentSlidePrompt,
  isRegenerating,
}: EditModeButtonsProps) {
  // When in edit mode, show Cancel/Save buttons
  if (isEditMode) {
    return (
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "1.5rem",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <button
          onClick={onCancelEdit}
          style={{
            minWidth: "120px",
            height: "48px",
            borderRadius: "24px",
            border: "none",
            background: "#ef4444",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 600,
            gap: "0.5rem",
            padding: "0 1.5rem",
          }}
        >
          <X size={20} />
          Cancel
        </button>
        <button
          onClick={onSaveEdit}
          style={{
            minWidth: "120px",
            height: "48px",
            borderRadius: "24px",
            border: "none",
            background: "#22c55e",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 600,
            gap: "0.5rem",
            padding: "0 1.5rem",
          }}
        >
          <Check size={20} />
          Save
        </button>
      </div>
    );
  }

  // Default state: show action buttons
  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        marginBottom: "1.5rem",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <button
        onClick={onToggleOverlay}
        title="Toggle dark overlay"
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: "2px solid #e5e7eb",
          background: hasOverlay ? "#3b82f6" : "white",
          color: hasOverlay ? "white" : "#6b7280",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <Contrast size={18} />
      </button>
      <button
        onClick={onEnterEditMode}
        title="Edit text elements"
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: "2px solid #e5e7eb",
          background: "white",
          color: "#6b7280",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <Type size={18} />
      </button>
      <div style={{ position: "relative" }}>
        <button
          onClick={onToggleRegeneratePopover}
          title="Regenerate image"
          disabled={isRegenerating}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "2px solid #e5e7eb",
            background: showRegeneratePopover ? "#3b82f6" : "white",
            color: showRegeneratePopover ? "white" : "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isRegenerating ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            opacity: isRegenerating ? 0.6 : 1,
          }}
        >
          <ImageIcon size={18} />
        </button>
        <ImageRegeneratePopover
          isOpen={showRegeneratePopover}
          onClose={onToggleRegeneratePopover}
          onRegenerate={onRegenerateImage}
          currentPrompt={currentSlidePrompt}
          isRegenerating={isRegenerating}
        />
      </div>
      <div style={{ position: "relative" }}>
        <button
          onClick={onToggleRatioMenu}
          title="Change aspect ratio"
          style={{
            minWidth: "40px",
            height: "40px",
            borderRadius: "20px",
            border: "2px solid #e5e7eb",
            background: showRatioMenu ? "#3b82f6" : "white",
            color: showRatioMenu ? "white" : "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
            padding: "0 12px",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          {currentRatio}
        </button>
        {showRatioMenu && (
          <div
            style={{
              position: "absolute",
              top: "48px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "white",
              border: "2px solid #e5e7eb",
              borderRadius: "12px",
              padding: "0.5rem",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
              zIndex: 10,
              minWidth: "80px",
            }}
          >
            {(["1:1", "4:5", "9:16"] as AspectRatio[]).map((ratio) => (
              <button
                key={ratio}
                onClick={() => onChangeRatio(ratio)}
                style={{
                  width: "100%",
                  padding: "0.5rem 1rem",
                  background: currentRatio === ratio ? "#eff6ff" : "transparent",
                  color: currentRatio === ratio ? "#3b82f6" : "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {ratio}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
