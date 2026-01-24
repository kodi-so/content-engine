import { Play, Loader, Type, LayoutGrid } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { Product } from "../types";
import { ReferenceImagePicker } from "../../../components/ReferenceImagePicker";
import { ContentStyle } from "../hooks/useSlideshowGeneration";

interface GenerationFormProps {
  products: Product[] | undefined;
  selectedProduct: Id<"products"> | "";
  onProductChange: (productId: Id<"products"> | "") => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  selectedReferenceImages?: Id<"referenceImages">[];
  onReferenceImagesChange?: (ids: Id<"referenceImages">[]) => void;
  contentStyle?: ContentStyle;
  onContentStyleChange?: (style: ContentStyle) => void;
}

export function GenerationForm({
  products,
  selectedProduct,
  onProductChange,
  prompt,
  onPromptChange,
  isGenerating,
  error,
  onGenerate,
  selectedReferenceImages = [],
  onReferenceImagesChange,
  contentStyle = "overlay",
  onContentStyleChange,
}: GenerationFormProps) {
  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>1. Prompt</h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.75rem",
            color: "#6b7280",
          }}
        >
          <span>Product Context:</span>
          <select
            style={{
              border: "none",
              background: "transparent",
              color: "#3b82f6",
              fontWeight: 500,
              cursor: "pointer",
              fontSize: "0.75rem",
              outline: "none",
            }}
            value={selectedProduct}
            onChange={(e) => onProductChange(e.target.value as Id<"products"> | "")}
            disabled={isGenerating}
          >
            <option value="">Select product...</option>
            {products?.map((product) => (
              <option key={product._id} value={product._id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <textarea
        className="textarea"
        placeholder="I want 12 slides about personal growth and habit building. The first slide should say 'WAIT. you're giving up???' written in a conversational, motivational tone using second person perspective..."
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        disabled={isGenerating}
        autoComplete="off"
        style={{
          minHeight: "250px",
          fontSize: "0.875rem",
          lineHeight: "1.6",
          marginBottom: "1rem",
        }}
      />

      {/* Content Style Toggle */}
      {onContentStyleChange && (
        <div style={{ marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>Content Style:</span>
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
            }}
          >
            <button
              type="button"
              onClick={() => onContentStyleChange("overlay")}
              disabled={isGenerating}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 500,
                border: contentStyle === "overlay" ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                borderRadius: "6px",
                background: contentStyle === "overlay" ? "#eff6ff" : "white",
                color: contentStyle === "overlay" ? "#3b82f6" : "#6b7280",
                cursor: isGenerating ? "not-allowed" : "pointer",
                opacity: isGenerating ? 0.5 : 1,
              }}
            >
              <Type size={14} />
              Text Overlay
            </button>
            <button
              type="button"
              onClick={() => onContentStyleChange("infographic")}
              disabled={isGenerating}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 500,
                border: contentStyle === "infographic" ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                borderRadius: "6px",
                background: contentStyle === "infographic" ? "#eff6ff" : "white",
                color: contentStyle === "infographic" ? "#3b82f6" : "#6b7280",
                cursor: isGenerating ? "not-allowed" : "pointer",
                opacity: isGenerating ? 0.5 : 1,
              }}
            >
              <LayoutGrid size={14} />
              Infographic
            </button>
          </div>
          <p
            style={{
              fontSize: "0.65rem",
              color: "#9ca3af",
              marginTop: "0.5rem",
              marginBottom: 0,
            }}
          >
            {contentStyle === "overlay"
              ? "Editable text layered over background images"
              : "Text baked into AI-generated graphics (not editable)"}
          </p>
        </div>
      )}

      {onReferenceImagesChange && (
        <ReferenceImagePicker
          selectedIds={selectedReferenceImages}
          onSelectionChange={onReferenceImagesChange}
          disabled={isGenerating}
          compact
        />
      )}

      <button
        className="btn btn-primary btn-lg"
        onClick={onGenerate}
        disabled={isGenerating || !prompt.trim()}
        style={{ width: "100%" }}
      >
        {isGenerating ? (
          <>
            <Loader size={18} className="spinner" />
            Generating...
          </>
        ) : (
          <>
            <Play size={18} />
            Generate
          </>
        )}
      </button>
    </div>
  );
}
