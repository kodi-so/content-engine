import { useState, useEffect } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Play, Loader, Clock, Edit2, Check, Copy, Package, Contrast, Type, Plus, Minus, Trash2, X } from "lucide-react";
import ContentEditor from "../components/ContentEditor";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export default function Slideshows() {
  const products = useQuery(api.products.listActive);
  const content = useQuery(api.content.list);
  const generateCarousel = useAction(api.slideshows.generate.generate);
  const updateStatus = useMutation(api.content.updateStatus);
  const toggleSlideOverlay = useMutation(api.content.toggleSlideOverlay);
  const updateSlide = useMutation(api.content.updateSlide);
  const updateAspectRatio = useMutation(api.content.updateAspectRatio);
  const updateFontSize = useMutation(api.content.updateFontSize);

  const [selectedProduct, setSelectedProduct] = useState<Id<"products"> | "">("");
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview panel state
  const [selectedCarousel, setSelectedCarousel] = useState<Id<"content"> | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [editingCarousel, setEditingCarousel] = useState<Id<"content"> | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Text editing state
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [editedFontSize, setEditedFontSize] = useState(48);

  // Ratio selection state
  const [showRatioMenu, setShowRatioMenu] = useState(false);

  // Query carousels for selected product (if product is selected)
  const carouselsByProduct = useQuery(
    api.content.listByProduct,
    selectedProduct ? { productId: selectedProduct as Id<"products"> } : "skip"
  );

  // All carousels (filtered to carousel type)
  const allCarousels = content
    ?.filter((item) => item.content?.type === "carousel")
    ?.sort((a: any, b: any) => b.createdAt - a.createdAt);

  // Use product-specific carousels if product selected, otherwise use all carousels
  const filteredCarousels = selectedProduct
    ? carouselsByProduct
        ?.filter((item: any) => item.content?.type === "carousel")
        ?.sort((a: any, b: any) => b.createdAt - a.createdAt)
    : allCarousels;

  // Recent carousels for display (limited to 10)
  const recentCarousels = allCarousels?.slice(0, 10);

  // Selected carousel item for preview
  const selectedCarouselItem = selectedCarousel
    ? filteredCarousels?.find((c: any) => c._id === selectedCarousel)
    : filteredCarousels?.[0]; // Auto-select most recent if none selected

  const editingItem = content?.find((c: any) => c._id === editingCarousel);
  const editingProduct = editingItem
    ? products?.find((p) => p._id === editingItem.productId)
    : null;

  // Auto-select most recent carousel when data changes
  useEffect(() => {
    if (filteredCarousels?.[0]) {
      setSelectedCarousel(filteredCarousels[0]._id);
      setSelectedSlideIndex(0);
    } else {
      setSelectedCarousel(null);
      setSelectedSlideIndex(0);
    }
  }, [selectedProduct, filteredCarousels?.[0]?._id]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Extract slide count from prompt if specified, otherwise default to 5
      const slideCountMatch = prompt.match(/(\d+)\s+slides?/i);
      const slideCount = slideCountMatch ? parseInt(slideCountMatch[1]) : 5;

      const result = await generateCarousel({
        productId: selectedProduct ? (selectedProduct as Id<"products">) : undefined,
        topic: prompt.trim(),
        slideCount: Math.max(3, Math.min(10, slideCount)),
      });

      console.log("Generation result:", result);

      // Reset form on success
      setPrompt("");
    } catch (err) {
      console.error("Generation failed:", err);
      setError(err instanceof Error ? err.message : "Failed to generate slideshow");
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleDownloadCarousel = async (item = selectedCarouselItem) => {
    if (!item?.content?.slides) return;

    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const topic = item.inputParams?.topic || "carousel";
      const folderName = topic.replace(/[^a-z0-9]/gi, "_").toLowerCase();

      // Add each slide to the zip
      for (let i = 0; i < item.content.slides.length; i++) {
        const slide = item.content.slides[i];
        if (slide.imageUrl) {
          // Extract base64 data from data URL
          const base64Data = slide.imageUrl.split(",")[1];
          if (base64Data) {
            zip.file(`${folderName}/slide-${i + 1}.png`, base64Data, { base64: true });
          }
        }
      }

      // Add caption as text file
      if (item.content.caption) {
        zip.file(`${folderName}/caption.txt`, item.content.caption);
      }

      // Add slide texts as text file
      const slideTexts = item.content.slides.map((s: any, i: number) => `Slide ${i + 1}: ${s.text}`).join("\n\n");
      zip.file(`${folderName}/slide-texts.txt`, slideTexts);

      // Generate and download zip
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `${folderName}.zip`);

      // Update status
      await updateStatus({
        id: item._id,
        status: "downloaded",
      });
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download slides");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleMarkPosted = async (item = selectedCarouselItem) => {
    if (!item) return;
    await updateStatus({
      id: item._id,
      status: "posted",
    });
    setSelectedCarousel(null);
  };

  const handleCopyCaption = async () => {
    if (!selectedCarouselItem?.content?.caption) return;
    await navigator.clipboard.writeText(selectedCarouselItem.content.caption);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleStartTextEdit = () => {
    if (!selectedCarouselItem?.content?.slides?.[selectedSlideIndex]) return;
    const currentSlide = selectedCarouselItem.content.slides[selectedSlideIndex];
    setEditedText(currentSlide.text || "");
    setEditedFontSize(selectedCarouselItem.content.config?.fontSize || 48);
    setIsEditingText(true);
  };

  const handleCancelTextEdit = () => {
    setIsEditingText(false);
    setEditedText("");
  };

  const handleSaveTextEdit = async () => {
    if (!selectedCarousel || !selectedCarouselItem?.content?.slides?.[selectedSlideIndex]) return;

    try {
      const currentSlide = selectedCarouselItem.content.slides[selectedSlideIndex];
      const slideUpdate: { text: string; imageUrl: string; overlay?: boolean } = {
        text: editedText,
        imageUrl: currentSlide.imageUrl,
      };

      if (currentSlide.overlay !== undefined) {
        slideUpdate.overlay = currentSlide.overlay;
      }

      // Update the slide text
      await updateSlide({
        id: selectedCarousel,
        slideIndex: selectedSlideIndex,
        slide: slideUpdate,
      });

      // Update the global font size if it changed
      const currentFontSize = selectedCarouselItem.content?.config?.fontSize || 48;
      if (editedFontSize !== currentFontSize) {
        await updateFontSize({
          id: selectedCarousel,
          fontSize: editedFontSize,
        });
      }

      setIsEditingText(false);
      setEditedText("");
    } catch (error) {
      console.error("Failed to save text:", error);
      alert("Failed to save text changes");
    }
  };

  const handleDeleteText = async () => {
    if (!selectedCarousel || !selectedCarouselItem?.content?.slides?.[selectedSlideIndex]) return;

    const currentSlide = selectedCarouselItem.content.slides[selectedSlideIndex];
    await updateSlide({
      id: selectedCarousel,
      slideIndex: selectedSlideIndex,
      slide: {
        ...currentSlide,
        text: "",
      },
    });

    setIsEditingText(false);
  };

  const handleChangeRatio = async (ratio: "1:1" | "4:5" | "9:16") => {
    if (!selectedCarousel) return;
    await updateAspectRatio({
      id: selectedCarousel,
      aspectRatio: ratio,
    });
    setShowRatioMenu(false);
  };

  return (
    <div>
      {/* Top Section: Grid with Generation Form + Preview Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: "1.5rem", marginBottom: "1.5rem", alignItems: "start" }}>
        {/* Left Column: Generation Form */}
        <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>1. Prompt</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "#6b7280" }}>
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
              onChange={(e) => setSelectedProduct(e.target.value as Id<"products"> | "")}
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
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isGenerating}
          autoComplete="off"
          style={{
            minHeight: "300px",
            fontSize: "0.875rem",
            lineHeight: "1.6",
            marginBottom: "1rem",
          }}
        />

        <button
          className="btn btn-primary btn-lg"
          onClick={handleGenerate}
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

        {/* Right Column: Preview Panel (Always Visible) */}
        <div className="card" style={{ overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Preview Editor</h2>
          </div>

          {selectedCarouselItem ? (
            <>
              {/* Status */}
              <div style={{ marginBottom: "1rem" }}>
                <span className={`badge badge-${selectedCarouselItem.status}`}>
                  {selectedCarouselItem.status}
                </span>
                {selectedCarouselItem.errorMessage && (
                  <div className="alert alert-error" style={{ marginTop: "0.5rem" }}>
                    {selectedCarouselItem.errorMessage}
                  </div>
                )}
              </div>

              {/* Info Section */}
              <div style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1rem" }}>
                <div><strong>Topic:</strong> {selectedCarouselItem.inputParams?.topic}</div>
                <div><strong>Slides:</strong> {selectedCarouselItem.content?.slides?.length || 0}</div>
                <div><strong>Created:</strong> {formatDate(selectedCarouselItem.createdAt)}</div>
              </div>

              {/* Slides Carousel Preview */}
              {selectedCarouselItem.content?.slides && selectedCarouselItem.content.slides.length > 0 && (
                <>
                  {/* Large Carousel with Centered Selected Slide */}
                  <div style={{ marginBottom: "1rem", position: "relative", overflow: "hidden" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: "1rem",
                        height: "400px",
                        transform: `translateX(calc(50% - ${selectedSlideIndex * 320}px - 150px))`,
                        transition: "transform 0.3s ease-out",
                      }}
                    >
                      {selectedCarouselItem.content.slides.map((slide: any, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            minWidth: "300px",
                            width: "300px",
                            height: "100%",
                            position: "relative",
                            borderRadius: "12px",
                            overflow: "hidden",
                            background: "#f3f4f6",
                            border: selectedSlideIndex === idx ? "3px solid #3b82f6" : "2px solid #e5e7eb",
                            cursor: "pointer",
                            opacity: selectedSlideIndex === idx ? 1 : 0.6,
                            transform: selectedSlideIndex === idx ? "scale(1)" : "scale(0.95)",
                            transition: "all 0.3s ease-out",
                          }}
                          onClick={() => setSelectedSlideIndex(idx)}
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
                          {/* Text Overlay */}
                          {isEditingText && selectedSlideIndex === idx ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: "absolute",
                                top: `${selectedCarouselItem.content?.config?.textPosition?.y || 50}%`,
                                left: `${selectedCarouselItem.content?.config?.textPosition?.x || 50}%`,
                                transform: "translate(-50%, -50%)",
                                width: "80%",
                                maxWidth: "280px",
                              }}
                            >
                              <textarea
                                value={editedText}
                                onChange={(e) => setEditedText(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  width: "100%",
                                  minHeight: "60px",
                                  padding: "8px 12px",
                                  fontSize: `${editedFontSize / 4}px`,
                                  fontFamily: '"TikTok Display Medium"',
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
                                    setEditedFontSize(Math.max(24, editedFontSize - 4));
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
                                    setEditedFontSize(Math.min(72, editedFontSize + 4));
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
                                    handleDeleteText();
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
                          ) : slide.text ? (
                            <div
                              style={{
                                position: "absolute",
                                top: `${selectedCarouselItem.content?.config?.textPosition?.y || 50}%`,
                                left: `${selectedCarouselItem.content?.config?.textPosition?.x || 50}%`,
                                transform: "translate(-50%, -50%)",
                                color: "white",
                                fontSize: `${(selectedCarouselItem.content?.config?.fontSize || 48) / 4}px`,
                                fontFamily: '"TikTok Display Medium"',
                                fontWeight: 700,
                                textAlign: "center",
                                textShadow: "rgb(0, 0, 0) -0.714286px -0.714286px 0px, rgb(0, 0, 0) 0.714286px -0.714286px 0px, rgb(0, 0, 0) -0.714286px 0.714286px 0px, rgb(0, 0, 0) 0.714286px 0.714286px 0px",
                                width: "max-content",
                                maxWidth: "90%",
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.2,
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "flex-start",
                              }}
                            >
                              {slide.text}
                            </div>
                          ) : null}
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

                  {/* Action Buttons / Cancel-Save Buttons - Directly under selected image */}
                  {isEditingText ? (
                    // Cancel and Save buttons (shown when editing text)
                    <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", justifyContent: "center", alignItems: "center" }}>
                      <button
                        onClick={handleCancelTextEdit}
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
                        onClick={handleSaveTextEdit}
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
                  ) : (
                    // Action buttons (shown when not editing)
                    <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", justifyContent: "center", alignItems: "center" }}>
                      <button
                        onClick={() => {
                          if (selectedCarousel) {
                            toggleSlideOverlay({
                              id: selectedCarousel,
                              slideIndex: selectedSlideIndex,
                            });
                          }
                        }}
                        title="Toggle dark overlay"
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "50%",
                          border: "2px solid #e5e7eb",
                          background: selectedCarouselItem.content?.slides?.[selectedSlideIndex]?.overlay ? "#3b82f6" : "white",
                          color: selectedCarouselItem.content?.slides?.[selectedSlideIndex]?.overlay ? "white" : "#6b7280",
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
                        onClick={handleStartTextEdit}
                        title="Edit text"
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
                          onClick={() => setShowRatioMenu(!showRatioMenu)}
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
                          {selectedCarouselItem.content?.config?.aspectRatio || "1:1"}
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
                            {["1:1", "4:5", "9:16"].map((ratio) => (
                              <button
                                key={ratio}
                                onClick={() => handleChangeRatio(ratio as "1:1" | "4:5" | "9:16")}
                                style={{
                                  width: "100%",
                                  padding: "0.5rem 1rem",
                                  background: selectedCarouselItem.content?.config?.aspectRatio === ratio ? "#eff6ff" : "transparent",
                                  color: selectedCarouselItem.content?.config?.aspectRatio === ratio ? "#3b82f6" : "#1f2937",
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
                  )}

                  {/* Thumbnail Navigation */}
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginBottom: "1rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
                    {selectedCarouselItem.content.slides.map((slide: any, idx: number) => (
                      <div
                        key={idx}
                        className={`slide-preview ${selectedSlideIndex === idx ? "active" : ""}`}
                        onClick={() => setSelectedSlideIndex(idx)}
                        style={{ cursor: "pointer", position: "relative" }}
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
                        {slide.text && (
                          <div
                            style={{
                              position: "absolute",
                              top: "50%",
                              left: "50%",
                              transform: "translate(-50%, -50%)",
                              color: "white",
                              fontSize: `${(selectedCarouselItem.content?.config?.fontSize || 48) / 8}px`,
                              fontFamily: '"TikTok Display Medium"',
                              fontWeight: 700,
                              textAlign: "center",
                              textShadow: "rgb(0, 0, 0) -0.5px -0.5px 0px, rgb(0, 0, 0) 0.5px -0.5px 0px, rgb(0, 0, 0) -0.5px 0.5px 0px, rgb(0, 0, 0) 0.5px 0.5px 0px",
                              width: "90%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {slide.text.split('\n')[0]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

            {/* Caption Section */}
            {selectedCarouselItem.content?.caption && (
              <div style={{ marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Caption
                </h3>
                <div
                  style={{
                    padding: "0.75rem",
                    background: "#f9fafb",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                  }}
                >
                  {selectedCarouselItem.content.caption}
                </div>
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ marginTop: "0.5rem" }}
                  onClick={handleCopyCaption}
                >
                  {copiedCaption ? <Check size={14} /> : <Copy size={14} />}
                  {copiedCaption ? "Copied!" : "Copy Caption"}
                </button>
              </div>
            )}

            {/* Action Buttons */}
            {(selectedCarouselItem.status === "ready" || selectedCarouselItem.status === "edited" || selectedCarouselItem.status === "downloaded") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditingCarousel(selectedCarousel)}
                >
                  <Edit2 size={16} /> Edit
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleDownloadCarousel()}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <>
                      <span className="spinner" style={{ width: 16, height: 16 }} />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Package size={16} /> Download as ZIP
                    </>
                  )}
                </button>
                <button className="btn btn-success" onClick={() => handleMarkPosted()}>
                  <Check size={16} /> Mark as Posted
                </button>
              </div>
            )}
            </>
          ) : (
            <>
              {/* Placeholder State - No Carousel Yet */}
              <>
                {/* Large Carousel Placeholder */}
                <div style={{ marginBottom: "1rem", position: "relative", overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      height: "400px",
                      transform: "translateX(calc(50% - 150px))",
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        style={{
                          minWidth: "300px",
                          width: "300px",
                          height: "100%",
                          borderRadius: "12px",
                          overflow: "hidden",
                          background: "#f3f4f6",
                          border: "2px solid #e5e7eb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "column",
                          gap: "0.5rem",
                          color: "#9ca3af",
                          opacity: i === 1 ? 1 : 0.6,
                          transform: i === 1 ? "scale(1)" : "scale(0.95)",
                        }}
                      >
                        <Play size={48} style={{ opacity: 0.3 }} />
                        <p style={{ margin: 0, fontSize: "0.875rem" }}>Slide {i}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Placeholder Thumbnail Navigation */}
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginBottom: "1rem" }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: "112px",
                        height: "112px",
                        borderRadius: "8px",
                        background: "#f3f4f6",
                        border: i === 1 ? "2px solid #3b82f6" : "2px solid #e5e7eb",
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
              </>

              {/* Placeholder Caption */}
              <div style={{ marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Caption
                </h3>
                <div
                  style={{
                    padding: "0.75rem",
                    background: "#f3f4f6",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    color: "#9ca3af",
                    minHeight: "60px",
                  }}
                >
                  Your caption will appear here...
                </div>
              </div>

              <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center" }}>
                Generate a slideshow to see it here
              </p>
            </>
          )}
        </div>
      </div>

      {/* Bottom Section: Recent Slideshows */}
      <div className="card">
        <h2>Recent Slideshows</h2>

        {!recentCarousels || recentCarousels.length === 0 ? (
          <div className="empty-state">
            <Clock size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
            <p>No slideshows generated yet</p>
            <p style={{ fontSize: "0.875rem" }}>
              Generate your first slideshow using the form above
            </p>
          </div>
        ) : (
          <div className="content-list">
            {recentCarousels.map((item) => {
              const product = products?.find((p) => p._id === item.productId);
              return (
                <div key={item._id} className="content-item">
                  <div className="content-preview">
                    {item.content?.slides?.[0]?.imageUrl ? (
                      <img src={item.content.slides[0].imageUrl} alt="Preview" />
                    ) : (
                      <Play size={24} style={{ opacity: 0.3 }} />
                    )}
                  </div>
                  <div className="content-details">
                    <h4>{item.inputParams?.topic || "Untitled Slideshow"}</h4>
                    <div className="content-meta">
                      {product?.name} • {item.content?.slides?.length || item.inputParams?.slideCount || 0} slides •{" "}
                      {formatDate(item.createdAt)}
                    </div>
                    <span className={`badge badge-${item.status}`}>{item.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Content Editor Modal */}
      {editingCarousel && editingItem && (
        <ContentEditor
          content={editingItem}
          product={editingProduct || null}
          onClose={() => setEditingCarousel(null)}
          onDownload={() => {
            handleDownloadCarousel(editingItem);
            setEditingCarousel(null);
          }}
          onMarkPosted={() => {
            handleMarkPosted(editingItem);
            setEditingCarousel(null);
          }}
        />
      )}
    </div>
  );
}
