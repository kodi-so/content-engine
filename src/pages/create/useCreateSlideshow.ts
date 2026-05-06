import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type {
  BrandAssetId,
  BrandId,
  CanonicalSlideshowSlide,
  CanonicalSlideshowSpec,
  SocialAccountId,
} from "../../types";
import { readFileAsDataUrl } from "./fileUtils";
import type {
  CreativePlan,
  ReferenceComposer,
  RequestedRenderingMode,
  SlideTextUpdate,
} from "./types";

export function useCreateSlideshow() {
  const brands = useQuery(api.accounts.brands.list);
  const accounts = useQuery(api.accounts.socialAccounts.list);
  const contentRequests = useQuery(api.content.requests.list, {});
  const createSlideshow = useMutation(api.content.requests.createSlideshow);
  const uploadBase64Image = useAction(api.storage.files.uploadBase64Image);
  const generateReferencePreview = useAction(api.accounts.brandAssets.generatePreview);
  const createBrandAsset = useMutation(api.accounts.brandAssets.create);
  const deleteStorageByUrl = useMutation(api.storage.files.deleteByUrl);
  const reviseSlideshow = useMutation(api.content.requests.reviseSlideshow);
  const saveRequest = useMutation(api.content.requests.save);
  const discardRequest = useMutation(api.content.requests.discard);
  const deleteSlide = useMutation(api.content.requests.deleteSlide);
  const moveSlide = useMutation(api.content.requests.moveSlide);
  const updateSlideText = useMutation(api.content.requests.updateSlideText);
  const updateSlideImagePrompt = useMutation(api.content.requests.updateSlideImagePrompt);
  const regenerateSlideImage = useAction(api.content.requests.regenerateSlideImage);

  const [brandId, setBrandId] = useState("");
  const [socialAccountId, setSocialAccountId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [requestedRenderingMode, setRequestedRenderingMode] =
    useState<RequestedRenderingMode>("background_plus_overlay");
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
  const [assetName, setAssetName] = useState("");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [aiAssetName, setAiAssetName] = useState("");
  const [aiAssetPrompt, setAiAssetPrompt] = useState("");
  const [aiPreview, setAiPreview] = useState<{ storageUrl: string; prompt: string } | null>(
    null
  );
  const [isGeneratingReference, setIsGeneratingReference] = useState(false);
  const [referenceComposer, setReferenceComposer] = useState<ReferenceComposer>(null);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const selectedBrandId = brandId || brands?.[0]?._id || "";
  const brandAssets = useQuery(
    api.accounts.brandAssets.list,
    selectedBrandId ? { brandId: selectedBrandId as BrandId } : "skip"
  );
  const brandAccounts = useMemo(
    () =>
      accounts?.filter((account) => !selectedBrandId || account.brandId === selectedBrandId) ??
      [],
    [accounts, selectedBrandId]
  );
  const activeRequest =
    contentRequests?.find((request) => String(request._id) === selectedRequestId) ??
    contentRequests?.find((request) => request.status !== "discarded") ??
    contentRequests?.[0];
  const slideshows = useQuery(
    api.content.slideshows.list,
    activeRequest ? { contentRequestId: activeRequest._id } : "skip"
  );
  const activeSlideshow = slideshows?.[0];
  const plan =
    activeRequest?.plan && typeof activeRequest.plan === "object"
      ? (activeRequest.plan as CreativePlan)
      : undefined;
  const isWorking = activeRequest
    ? ["queued", "planning", "generating"].includes(activeRequest.status)
    : false;

  useEffect(() => {
    setSelectedReferenceIds([]);
  }, [selectedBrandId]);

  const toggleReference = (assetId: string) => {
    setSelectedReferenceIds((current) => {
      if (current.includes(assetId)) {
        return current.filter((id) => id !== assetId);
      }
      return [...current, assetId];
    });
  };

  const handleAssetFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAssetFile(event.target.files?.[0] ?? null);
  };

  const handleCreateAsset = async () => {
    if (!selectedBrandId || !assetName.trim() || !assetFile) return;

    setStatusMessage("Uploading reference asset");
    try {
      const storageUrl = await uploadBase64Image({
        base64Data: await readFileAsDataUrl(assetFile),
        filename: assetFile.name,
      });
      const assetId = await createBrandAsset({
        brandId: selectedBrandId as BrandId,
        name: assetName.trim(),
        storageUrl,
      });
      setSelectedReferenceIds((current) => [...current, String(assetId)]);
      setAssetName("");
      setAssetFile(null);
      setReferenceComposer(null);
      setStatusMessage("Reference asset ready");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Reference upload failed");
    }
  };

  const handleGenerateReferencePreview = async () => {
    if (!aiAssetPrompt.trim()) return;

    setStatusMessage("Generating reference preview");
    setIsGeneratingReference(true);
    try {
      if (aiPreview?.storageUrl) {
        await deleteStorageByUrl({ url: aiPreview.storageUrl });
      }
      const preview = await generateReferencePreview({ prompt: aiAssetPrompt.trim() });
      setAiPreview({ storageUrl: preview.storageUrl, prompt: preview.prompt });
      setStatusMessage("Reference preview ready");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Reference generation failed");
    } finally {
      setIsGeneratingReference(false);
    }
  };

  const handleSaveGeneratedReference = async () => {
    if (!selectedBrandId || !aiPreview || !aiAssetName.trim()) return;

    setStatusMessage("Saving generated reference");
    try {
      const assetId = await createBrandAsset({
        brandId: selectedBrandId as BrandId,
        name: aiAssetName.trim(),
        storageUrl: aiPreview.storageUrl,
        description: aiPreview.prompt,
      });
      setSelectedReferenceIds((current) => [...current, String(assetId)]);
      setAiAssetName("");
      setAiAssetPrompt("");
      setAiPreview(null);
      setReferenceComposer(null);
      setStatusMessage("Generated reference saved");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Save generated reference failed"
      );
    }
  };

  const handleRejectGeneratedReference = async () => {
    if (!aiPreview) return;

    setStatusMessage("Discarding generated reference");
    try {
      await deleteStorageByUrl({ url: aiPreview.storageUrl });
      setAiPreview(null);
      setStatusMessage("Generated reference discarded");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Discard generated reference failed"
      );
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const targetBrandId = selectedBrandId;
    if (!targetBrandId || !prompt.trim()) return;

    setStatusMessage("Creating slideshow preview");
    try {
      const requestId = await createSlideshow({
        brandId: targetBrandId as BrandId,
        socialAccountId: socialAccountId ? (socialAccountId as SocialAccountId) : undefined,
        prompt: prompt.trim(),
        requestedRenderingMode,
        referenceAssets: selectedReferenceIds.map((assetId) => ({
          assetId: assetId as BrandAssetId,
        })),
      });
      setSelectedRequestId(String(requestId));
      setPrompt("");
      setRevisionPrompt("");
      setStatusMessage("Preview queued");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Create failed");
    }
  };

  const handleRevise = async () => {
    if (!activeRequest || !revisionPrompt.trim()) return;

    setStatusMessage("Regenerating preview");
    try {
      await reviseSlideshow({
        id: activeRequest._id,
        revisionPrompt: revisionPrompt.trim(),
      });
      setRevisionPrompt("");
      setStatusMessage("Revision queued");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Revision failed");
    }
  };

  const handleSave = async () => {
    if (!activeRequest) return;

    setStatusMessage("Saving slideshow");
    try {
      await saveRequest({ id: activeRequest._id });
      setStatusMessage("Slideshow saved to Library");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Save failed");
    }
  };

  const handleDiscard = async () => {
    if (!activeRequest) return;
    if (!window.confirm("Discard this preview and delete its generated artifacts?")) return;

    setStatusMessage("Discarding preview");
    try {
      await discardRequest({ id: activeRequest._id });
      setStatusMessage("Preview discarded");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Discard failed");
    }
  };

  const handleDeleteSlide = async (slide: CanonicalSlideshowSlide) => {
    if (!activeSlideshow) return;
    const activeSlides =
      activeSlideshow.spec && typeof activeSlideshow.spec === "object"
        ? ((activeSlideshow.spec as CanonicalSlideshowSpec).slides?.filter(
            (item) => item.status !== "deleted"
          ) ?? [])
        : [];
    if (activeSlides.length <= 1) return;
    if (!window.confirm("Delete this slide from the preview?")) return;

    setStatusMessage("Deleting slide");
    try {
      await deleteSlide({ slideshowId: activeSlideshow._id, slideId: slide.slideId });
      setStatusMessage("Slide deleted");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Delete slide failed");
    }
  };

  const handleMoveSlide = async (
    slide: CanonicalSlideshowSlide,
    direction: "left" | "right"
  ) => {
    if (!activeSlideshow) return;
    setStatusMessage("Reordering slides");
    try {
      await moveSlide({ slideshowId: activeSlideshow._id, slideId: slide.slideId, direction });
      setStatusMessage("Slides reordered");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Move slide failed");
    }
  };

  const handleUpdateSlideText = async (
    slide: CanonicalSlideshowSlide,
    args: SlideTextUpdate
  ) => {
    if (!activeSlideshow) return;
    setStatusMessage("Updating slide text");
    try {
      await updateSlideText({
        slideshowId: activeSlideshow._id,
        slideId: slide.slideId,
        ...args,
      });
      setStatusMessage("Slide text updated");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Update slide failed");
    }
  };

  const handleRegenerateSlideImage = async (
    slide: CanonicalSlideshowSlide,
    imagePrompt: string
  ) => {
    if (!activeSlideshow) return;
    const prompt = imagePrompt.trim();
    if (!prompt) return;

    setStatusMessage(`Regenerating slide ${slide.index} image`);
    try {
      await regenerateSlideImage({
        slideshowId: activeSlideshow._id,
        slideId: slide.slideId,
        prompt,
      });
      setStatusMessage(`Slide ${slide.index} image regenerated`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Regenerate slide image failed");
    }
  };

  const handleUpdateSlideImagePrompt = async (
    slide: CanonicalSlideshowSlide,
    imagePrompt: string
  ) => {
    if (!activeSlideshow) return;
    const prompt = imagePrompt.trim();
    if (!prompt) return;

    setStatusMessage(`Saving slide ${slide.index} image prompt`);
    try {
      await updateSlideImagePrompt({
        slideshowId: activeSlideshow._id,
        slideId: slide.slideId,
        prompt,
      });
      setStatusMessage(`Slide ${slide.index} image prompt saved`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Save image prompt failed");
    }
  };

  return {
    data: {
      brands,
      brandAccounts,
      brandAssets,
      contentRequests,
      activeRequest,
      activeSlideshow,
      plan,
      isWorking,
    },
    form: {
      selectedBrandId,
      socialAccountId,
      prompt,
      requestedRenderingMode,
      selectedReferenceIds,
      assetName,
      assetFile,
      aiAssetName,
      aiAssetPrompt,
      aiPreview,
      isGeneratingReference,
      referenceComposer,
    },
    formActions: {
      setBrandId,
      setSocialAccountId,
      setPrompt,
      setRequestedRenderingMode,
      setAssetName,
      setAiAssetName,
      setAiAssetPrompt,
      setReferenceComposer,
      toggleReference,
      handleAssetFileChange,
      handleCreateAsset,
      handleGenerateReferencePreview,
      handleSaveGeneratedReference,
      handleRejectGeneratedReference,
      handleSubmit,
    },
    previewActions: {
      revisionPrompt,
      setRevisionPrompt,
      handleRevise,
      handleSave,
      handleDiscard,
      handleDeleteSlide,
      handleMoveSlide,
      handleUpdateSlideText,
      handleRegenerateSlideImage,
      handleUpdateSlideImagePrompt,
    },
    selectedRequestId,
    setSelectedRequestId,
    statusMessage,
  };
}
