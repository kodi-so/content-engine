import { useEffect, useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import JSZip from "jszip";
import {
  GenerationForm,
  PreviewPanel,
  SlideshowGrid,
  useSlideshowGeneration,
  useTextEditing,
  useSlideshowState,
  renderSlideToCanvas,
} from "../features/slideshows";

export default function Slideshows() {
  // State management
  const state = useSlideshowState();
  const generation = useSlideshowGeneration();
  const textEditing = useTextEditing();
  const removeContent = useMutation(api.content.remove);
  const regenerateSlideImage = useAction(api.slideshows.generate.regenerateSlideImage);

  // Image regeneration state
  const [showRegeneratePopover, setShowRegeneratePopover] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Sync prompt with selected slideshow
  useEffect(() => {
    if (state.selectedCarouselItem?.inputParams?.topic) {
      generation.setPrompt(state.selectedCarouselItem.inputParams.topic);
    }
  }, [state.selectedCarouselItem?._id]);

  // Handle generation
  const handleGenerate = () => {
    generation.generate(state.selectedProduct || undefined);
  };

  // Handle text editing
  const handleStartTextEdit = () => {
    if (!state.selectedCarouselItem?.content?.slides?.[state.selectedSlideIndex]) return;
    const currentSlide = state.selectedCarouselItem.content.slides[state.selectedSlideIndex];
    const currentFontSize = state.selectedCarouselItem.content.config?.fontSize || 48;
    textEditing.startEditing(currentSlide.text || "", currentFontSize);
  };

  const handleSaveTextEdit = async () => {
    if (!state.selectedCarousel || !state.selectedCarouselItem?.content?.slides?.[state.selectedSlideIndex]) return;
    const currentSlide = state.selectedCarouselItem.content.slides[state.selectedSlideIndex];
    const currentFontSize = state.selectedCarouselItem.content.config?.fontSize || 48;
    await textEditing.saveText(
      state.selectedCarousel,
      state.selectedSlideIndex,
      currentSlide,
      currentFontSize
    );
  };

  const handleDeleteText = async () => {
    if (!state.selectedCarousel || !state.selectedCarouselItem?.content?.slides?.[state.selectedSlideIndex]) return;
    const currentSlide = state.selectedCarouselItem.content.slides[state.selectedSlideIndex];
    await textEditing.deleteText(state.selectedCarousel, state.selectedSlideIndex, currentSlide);
  };

  // Handle download as zip
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    const slides = state.selectedCarouselItem?.content?.slides;
    const config = state.selectedCarouselItem?.content?.config;
    if (!slides) return;

    setIsDownloading(true);
    try {
      const zip = new JSZip();

      // Render each slide and add to zip
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (slide.imageUrl) {
          const blob = await renderSlideToCanvas(slide, {
            fontSize: config?.fontSize,
            aspectRatio: config?.aspectRatio,
            textPosition: config?.textPosition,
          });
          zip.file(`slide-${i + 1}.png`, blob);
        }
      }

      // Generate and download zip
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const blobUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "slideshow.zip";
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Failed to download slides:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!state.selectedCarousel) return;
    if (!confirm("Are you sure you want to delete this slideshow?")) return;

    await removeContent({ id: state.selectedCarousel });
    state.setSelectedCarousel(null);
  };

  // Handle image regeneration
  const handleRegenerateImage = async (prompt: string) => {
    if (!state.selectedCarousel) return;

    setIsRegenerating(true);
    try {
      const result = await regenerateSlideImage({
        contentId: state.selectedCarousel,
        slideIndex: state.selectedSlideIndex,
        prompt,
      });

      if (!result.success) {
        console.error("Failed to regenerate image:", result.error);
        alert(`Failed to regenerate image: ${result.error}`);
      } else {
        // Close the popover on success
        setShowRegeneratePopover(false);
      }
    } catch (error) {
      console.error("Failed to regenerate image:", error);
      alert("Failed to regenerate image. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div>
      {/* Top Section: Grid with Generation Form + Preview Panel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(300px, 400px) minmax(400px, 1fr)",
          gap: "1.5rem",
          marginBottom: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left Column: Generation Form */}
        <GenerationForm
          products={state.products}
          selectedProduct={state.selectedProduct}
          onProductChange={state.setSelectedProduct}
          prompt={generation.prompt}
          onPromptChange={generation.setPrompt}
          isGenerating={generation.isGenerating}
          error={generation.error}
          onGenerate={handleGenerate}
        />

        {/* Right Column: Preview Panel */}
        <PreviewPanel
          selectedCarouselItem={state.selectedCarouselItem}
          selectedSlideIndex={state.selectedSlideIndex}
          onSelectSlide={state.setSelectedSlideIndex}
          isEditingText={textEditing.isEditingText}
          editedText={textEditing.editedText}
          editedFontSize={textEditing.editedFontSize}
          onTextChange={textEditing.setEditedText}
          onStartTextEdit={handleStartTextEdit}
          onCancelTextEdit={textEditing.cancelEditing}
          onSaveTextEdit={handleSaveTextEdit}
          onDeleteText={handleDeleteText}
          onIncrementFontSize={textEditing.incrementFontSize}
          onDecrementFontSize={textEditing.decrementFontSize}
          onToggleOverlay={state.handleToggleOverlay}
          showRatioMenu={state.showRatioMenu}
          onToggleRatioMenu={() => state.setShowRatioMenu(!state.showRatioMenu)}
          onChangeRatio={state.handleChangeRatio}
          showRegeneratePopover={showRegeneratePopover}
          onToggleRegeneratePopover={() => setShowRegeneratePopover(!showRegeneratePopover)}
          onRegenerateImage={handleRegenerateImage}
          isRegenerating={isRegenerating}
          onDownload={handleDownload}
          onDelete={handleDelete}
          isDownloading={isDownloading}
        />
      </div>

      {/* My Slideshows Section */}
      <SlideshowGrid
        slideshows={state.allCarousels}
        products={state.products}
        currentSlideshowId={state.selectedCarousel}
        onSelectSlideshow={(id) => {
          state.setSelectedCarousel(id);
          state.setSelectedSlideIndex(0);
        }}
      />
    </div>
  );
}
