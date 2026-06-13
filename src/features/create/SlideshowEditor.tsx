import { useAction, useMutation } from "convex/react";
import {
  Image as ImageIcon,
  Trash2,
  Type,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { SlideshowEditTray, type SlideshowEditTrayMode } from "./SlideshowEditTray";
import { SlideshowStage } from "./SlideshowStage";
import {
  activeSlides,
  createTextBlock,
  normalizedTextBlocks,
  selectedSlideWindow,
  slideImagePrompt,
  withAutoTextBlockHeight,
} from "./slideshowEditorModel";
import type {
  CanonicalSlideshowSpec,
  SlideshowDoc,
  SlideshowTextBlock,
} from "../../types";

function TrayButton({
  active,
  children,
  className = "",
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={[
        "grid size-9 place-items-center rounded-full border bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-sm)] transition hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-45",
        active ? "border-[var(--color-primary)] text-[var(--color-primary)] ring-2 ring-[var(--color-accent)]" : "border-[var(--color-border)]",
        className,
      ].filter(Boolean).join(" ")}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function SlideshowEditor({
  slideshow,
}: {
  onDiscard?: () => void;
  onSave?: () => void;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  slideshow: SlideshowDoc;
}) {
  const updateSlideText = useMutation(api.content.requests.updateSlideText);
  const updateSlideImagePrompt = useMutation(api.content.requests.updateSlideImagePrompt);
  const createSlide = useMutation(api.content.requests.createSlide);
  const reorderSlides = useMutation(api.content.requests.reorderSlides);
  const deleteSlide = useMutation(api.content.requests.deleteSlide);
  const regenerateSlideImage = useAction(api.content.requests.regenerateSlideImage);
  const spec = slideshow.spec as CanonicalSlideshowSpec;
  const slides = useMemo(() => activeSlides(spec), [spec]);
  const [selectedSlideId, setSelectedSlideId] = useState(slides[0]?.slideId ?? "");
  const selectedSlide = slides.find((slide) => slide.slideId === selectedSlideId) ?? slides[0];
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [textBlocksDraft, setTextBlocksDraft] = useState<SlideshowTextBlock[]>([]);
  const [imagePromptDraft, setImagePromptDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [activeTray, setActiveTray] = useState<SlideshowEditTrayMode>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!selectedSlide) return;
    const blocks = normalizedTextBlocks(selectedSlide);
    setSelectedSlideId(selectedSlide.slideId);
    setTextBlocksDraft(blocks);
    setSelectedBlockId(blocks[0]?.id ?? "");
    setImagePromptDraft(slideImagePrompt(selectedSlide));
    setStatus("");
  }, [selectedSlide?.slideId, selectedSlide?.updatedAt]);

  const selectedBlockIndex = textBlocksDraft.findIndex((block) => block.id === selectedBlockId);
  const selectedBlock = selectedBlockIndex >= 0 ? textBlocksDraft[selectedBlockIndex] : undefined;
  const stageSlides = selectedSlide ? selectedSlideWindow(slides, selectedSlide) : [];
  const selectedSlideIndex = slides.findIndex((slide) => slide.slideId === selectedSlide?.slideId);
  const previousSlide = selectedSlideIndex > 0 ? slides[selectedSlideIndex - 1] : undefined;
  const nextSlide = selectedSlideIndex >= 0 ? slides[selectedSlideIndex + 1] : undefined;
  const canEditText = selectedSlide?.renderingMode === "background_plus_overlay" ||
    (!selectedSlide?.renderingMode && spec.renderingMode !== "full_graphic_generation");

  const updateSelectedBlock = (patch: Partial<SlideshowTextBlock>) => {
    if (!selectedBlock) return;
    updateBlockById(selectedBlock.id ?? "", patch);
  };

  const updateBlockById = (blockId: string, patch: Partial<SlideshowTextBlock>) => {
    if (!blockId) return;
    const shouldFitHeight =
      "fontSize" in patch ||
      "items" in patch ||
      "strokeWidth" in patch ||
      "text" in patch ||
      "width" in patch;
    setTextBlocksDraft((current) =>
      current.map((block) => {
        if (block.id !== blockId) return block;
        const nextBlock = { ...block, ...patch };
        return shouldFitHeight ? withAutoTextBlockHeight(nextBlock) : nextBlock;
      })
    );
  };

  const toggleTray = (mode: Exclude<SlideshowEditTrayMode, null>) => {
    setActiveTray((current) => (current === mode ? null : mode));
    setShowDeleteConfirm(false);
  };

  useEffect(() => {
    if (!selectedSlide || activeTray !== "image") return;
    const prompt = imagePromptDraft.trim();
    if (!prompt || prompt === slideImagePrompt(selectedSlide).trim()) return;
    const timeoutId = window.setTimeout(() => {
      void updateSlideImagePrompt({
        slideshowId: slideshow._id,
        slideId: selectedSlide.slideId,
        prompt,
      })
        .then(() => setStatus("Prompt saved"))
        .catch((error) => {
          setStatus(error instanceof Error ? error.message : "Unable to save image prompt");
        });
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeTray,
    imagePromptDraft,
    selectedSlide?.slideId,
    slideshow._id,
    updateSlideImagePrompt,
  ]);

  useEffect(() => {
    if (!selectedSlide || !canEditText || textBlocksDraft.length === 0) return;
    const savedBlocks = normalizedTextBlocks(selectedSlide);
    if (JSON.stringify(savedBlocks) === JSON.stringify(textBlocksDraft)) return;
    const timeoutId = window.setTimeout(() => {
      void updateSlideText({
        slideshowId: slideshow._id,
        slideId: selectedSlide.slideId,
        textBlocks: textBlocksDraft,
      })
        .then(() => setStatus("Text layout saved"))
        .catch((error) => {
          setStatus(error instanceof Error ? error.message : "Unable to save text layout");
        });
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [
    canEditText,
    selectedSlide?.slideId,
    selectedSlide?.updatedAt,
    slideshow._id,
    textBlocksDraft,
    updateSlideText,
  ]);

  if (!selectedSlide || slides.length === 0) {
    return (
      <section className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] pt-[var(--space-5)]">
        <h3 className="m-0 text-[1rem] font-[780]">Slideshow editor</h3>
        <p className="muted m-0">No active slides are available for this slideshow.</p>
      </section>
    );
  }

  const regenerateImage = async () => {
    const prompt = imagePromptDraft.trim();
    if (!prompt) return;
    setPendingAction("regenerate");
    setStatus("");
    try {
      await regenerateSlideImage({
        slideshowId: slideshow._id,
        slideId: selectedSlide.slideId,
        prompt,
        useReferenceImage: selectedSlide.useReferenceImage,
      });
      setStatus("Slide image regenerated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to regenerate image");
    } finally {
      setPendingAction(null);
    }
  };

  const addTextBlock = () => {
    const nextBlock = createTextBlock(textBlocksDraft.length);
    setTextBlocksDraft((current) => [...current, nextBlock]);
    setSelectedBlockId(nextBlock.id ?? "");
    setActiveTray("text");
  };

  const deleteTextBlock = () => {
    if (!selectedBlock) return;
    setTextBlocksDraft((current) => {
      const next = current.filter((block) => block.id !== selectedBlock.id);
      setSelectedBlockId(next[0]?.id ?? "");
      return next;
    });
  };

  const createSlideAfterSelected = async () => {
    setPendingAction("create-slide");
    setStatus("");
    try {
      const newSlideId = await createSlide({
        slideshowId: slideshow._id,
        afterSlideId: selectedSlide.slideId,
      });
      setSelectedSlideId(newSlideId);
      setStatus("Slide created");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create slide");
    } finally {
      setPendingAction(null);
    }
  };

  const deleteSelectedSlide = async () => {
    setPendingAction("delete");
    setStatus("");
    try {
      await deleteSlide({
        slideshowId: slideshow._id,
        slideId: selectedSlide.slideId,
      });
      const nextSlide = slides.find((slide) => slide.slideId !== selectedSlide.slideId);
      setSelectedSlideId(nextSlide?.slideId ?? "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete slide");
    } finally {
      setPendingAction(null);
      setShowDeleteConfirm(false);
    }
  };

  const reorderSlideIds = async (slideIds: string[]) => {
    if (slideIds.join("|") === slides.map((slide) => slide.slideId).join("|")) return;
    setPendingAction("reorder");
    setStatus("");
    try {
      await reorderSlides({
        slideshowId: slideshow._id,
        slideIds,
      });
      setStatus("Slides reordered");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to reorder slide");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section className="grid gap-[var(--space-4)]">
      <div className="grid min-w-0 gap-[var(--space-5)]">
        <SlideshowStage
          actionBar={
            <div className="relative flex min-w-0 items-center justify-center gap-2">
              <TrayButton
                active={activeTray === "image"}
                label="Edit image prompt"
                onClick={() => toggleTray("image")}
              >
                <ImageIcon size={16} />
              </TrayButton>
              <TrayButton
                active={activeTray === "text"}
                disabled={!canEditText}
                label="Edit text"
                onClick={() => toggleTray("text")}
              >
                <Type size={16} />
              </TrayButton>
              <TrayButton
                className="text-[var(--color-danger)]"
                disabled={pendingAction !== null || slides.length <= 1}
                label="Delete slide"
                onClick={() => {
                  setActiveTray(null);
                  setShowDeleteConfirm((current) => !current);
                }}
              >
                <Trash2 size={16} />
              </TrayButton>
              {showDeleteConfirm ? (
                <div className="absolute left-1/2 top-[calc(100%+0.5rem)] z-10 grid w-[15rem] -translate-x-1/2 gap-2 rounded-[0.9rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center shadow-[0_18px_38px_rgba(15,23,42,0.18)]">
                  <p className="m-0 text-[0.86rem] font-[760] text-[var(--color-ink)]">
                    Delete slide {selectedSlide.index}?
                  </p>
                  <div className="flex justify-center gap-2">
                    <button
                      className="secondary-button min-h-9 px-3 py-2 text-[0.8rem]"
                      onClick={() => setShowDeleteConfirm(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button min-h-9 bg-[var(--color-danger)] px-3 py-2 text-[0.8rem]"
                      disabled={pendingAction !== null}
                      onClick={() => void deleteSelectedSlide()}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          }
          editTray={
            <SlideshowEditTray
              activeTray={activeTray}
              addTextBlock={addTextBlock}
              canEditText={canEditText}
              deleteTextBlock={deleteTextBlock}
              imagePromptDraft={imagePromptDraft}
              onClose={() => setActiveTray(null)}
              pendingAction={pendingAction}
              regenerateImage={() => void regenerateImage()}
              selectedBlock={selectedBlock}
              selectedBlockIndex={selectedBlockIndex}
              setImagePromptDraft={setImagePromptDraft}
              status={status}
              textBlocksCount={textBlocksDraft.length}
              updateSelectedBlock={updateSelectedBlock}
            />
          }
          nextSlide={nextSlide}
          onChangeBlock={updateBlockById}
          onCreateSlide={() => void createSlideAfterSelected()}
          onReorderSlides={(slideIds) => void reorderSlideIds(slideIds)}
          onSelectBlock={setSelectedBlockId}
          onSelectSlide={setSelectedSlideId}
          previousSlide={previousSlide}
          selectedBlockId={selectedBlockId}
          selectedSlide={selectedSlide}
          slides={slides}
          spec={spec}
          stageSlides={stageSlides}
          textBlocksDraft={textBlocksDraft}
        />
      </div>
    </section>
  );
}
