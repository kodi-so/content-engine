import { Minus, Plus, Trash2 } from "lucide-react";
import { getPreviewFontSize } from "../../styles";

interface SlideEditorProps {
  editedText: string;
  editedFontSize: number;
  position: { x: number; y: number };
  onTextChange: (text: string) => void;
  onIncrementFontSize: () => void;
  onDecrementFontSize: () => void;
  onDeleteText: () => void;
}

export function SlideEditor({
  editedText,
  editedFontSize,
  position,
  onTextChange,
  onIncrementFontSize,
  onDecrementFontSize,
  onDeleteText,
}: SlideEditorProps) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: `${position.y}%`,
        left: `${position.x}%`,
        transform: "translate(-50%, -50%)",
        width: "80%",
        maxWidth: "280px",
      }}
    >
      <textarea
        value={editedText}
        onChange={(e) => onTextChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          minHeight: "60px",
          padding: "8px 12px",
          fontSize: `${getPreviewFontSize(editedFontSize)}px`,
          fontFamily: '"TikTok Display", system-ui, sans-serif',
          fontWeight: 700,
          textAlign: "center",
          color: "white",
          background: "rgba(0, 0, 0, 0.6)",
          border: "2px solid #3b82f6",
          borderRadius: "8px",
          resize: "none",
          outline: "none",
        }}
        maxLength={100}
      />
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          justifyContent: "center",
          marginTop: "0.5rem",
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDecrementFontSize();
          }}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "2px solid white",
            background: "white",
            color: "#1f2937",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "18px",
            fontWeight: 700,
          }}
        >
          <Minus size={16} />
        </button>
        <div
          style={{
            minWidth: "40px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "14px",
            fontWeight: 700,
            background: "rgba(255, 255, 255, 0.2)",
            borderRadius: "16px",
            padding: "0 8px",
          }}
        >
          {editedFontSize}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onIncrementFontSize();
          }}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "2px solid white",
            background: "white",
            color: "#1f2937",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "18px",
            fontWeight: 700,
          }}
        >
          <Plus size={16} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteText();
          }}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "2px solid white",
            background: "#ef4444",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
