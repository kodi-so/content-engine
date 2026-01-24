import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Image, X, ChevronDown, ChevronUp } from "lucide-react";

interface ReferenceImagePickerProps {
  selectedIds: Id<"referenceImages">[];
  onSelectionChange: (ids: Id<"referenceImages">[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

const imageTypeLabels: Record<string, string> = {
  character: "Character",
  person: "Person",
  logo: "Logo",
  style: "Style",
};

export function ReferenceImagePicker({
  selectedIds,
  onSelectionChange,
  disabled = false,
  compact = false,
}: ReferenceImagePickerProps) {
  const images = useQuery(api.referenceImages.list);
  const [isExpanded, setIsExpanded] = useState(!compact || selectedIds.length > 0);

  const toggleImage = (imageId: Id<"referenceImages">) => {
    if (disabled) return;

    if (selectedIds.includes(imageId)) {
      onSelectionChange(selectedIds.filter((id) => id !== imageId));
    } else {
      // Limit to 6 images (Gemini API limit)
      if (selectedIds.length >= 6) {
        alert("Maximum of 6 reference images allowed");
        return;
      }
      onSelectionChange([...selectedIds, imageId]);
    }
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  if (!images || images.length === 0) {
    return null;
  }

  const selectedImages = images.filter((img) => selectedIds.includes(img._id));

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          marginBottom: isExpanded ? "0.75rem" : 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Image size={14} style={{ color: "#6b7280" }} />
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            Reference Images
            {selectedIds.length > 0 && (
              <span style={{ color: "#3b82f6", marginLeft: "0.25rem" }}>
                ({selectedIds.length} selected)
              </span>
            )}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp size={14} style={{ color: "#9ca3af" }} />
        ) : (
          <ChevronDown size={14} style={{ color: "#9ca3af" }} />
        )}
      </div>

      {isExpanded && (
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.75rem",
          }}
        >
          {/* Selected images preview */}
          {selectedImages.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 500 }}>
                  Selected ({selectedImages.length}/6)
                </span>
                <button
                  onClick={clearAll}
                  disabled={disabled}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#9ca3af",
                    fontSize: "0.7rem",
                    cursor: disabled ? "not-allowed" : "pointer",
                    padding: 0,
                  }}
                >
                  Clear all
                </button>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {selectedImages.map((img) => (
                  <div
                    key={img._id}
                    style={{
                      position: "relative",
                      width: "48px",
                      height: "48px",
                      borderRadius: "6px",
                      overflow: "hidden",
                      border: "2px solid #3b82f6",
                    }}
                  >
                    <img
                      src={img.storageUrl}
                      alt={img.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {!disabled && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleImage(img._id);
                        }}
                        style={{
                          position: "absolute",
                          top: "-4px",
                          right: "-4px",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "#ef4444",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <X size={10} color="white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available images grid */}
          <div style={{ marginBottom: "0.75rem" }}>
            <span
              style={{
                fontSize: "0.7rem",
                color: "#6b7280",
                fontWeight: 500,
                display: "block",
                marginBottom: "0.5rem",
              }}
            >
              Available Images
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
                gap: "0.5rem",
              }}
            >
              {images.map((img) => {
                const isSelected = selectedIds.includes(img._id);
                return (
                  <div
                    key={img._id}
                    onClick={() => toggleImage(img._id)}
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      borderRadius: "6px",
                      overflow: "hidden",
                      border: isSelected ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <img
                      src={img.storageUrl}
                      alt={img.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
                        padding: "0.25rem",
                        paddingTop: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.6rem",
                          color: "white",
                          display: "block",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {img.name}
                      </span>
                    </div>
                    {isSelected && (
                      <div
                        style={{
                          position: "absolute",
                          top: "4px",
                          right: "4px",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "#3b82f6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span style={{ color: "white", fontSize: "0.6rem", fontWeight: 600 }}>
                          {selectedIds.indexOf(img._id) + 1}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <p
            style={{
              fontSize: "0.65rem",
              color: "#9ca3af",
              marginTop: "0.5rem",
              marginBottom: 0,
            }}
          >
            Selected images will be used as references for consistent visual identity.
          </p>
        </div>
      )}
    </div>
  );
}
