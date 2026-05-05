import { useMutation, useQuery } from "convex/react";
import { Check, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { CreateSlideshowPreview } from "../components/SlideshowPreview";
import { FormPanel, Page, Panel, Select, TextArea } from "../components/ui";
import type { BrandId, CanonicalSlideshowSlide, SocialAccountId } from "../types";

export function CreatePage() {
  const brands = useQuery(api.accounts.brands.list);
  const accounts = useQuery(api.accounts.socialAccounts.list);
  const contentRequests = useQuery(api.content.requests.list, {});
  const createSlideshow = useMutation(api.content.requests.createSlideshow);
  const reviseSlideshow = useMutation(api.content.requests.reviseSlideshow);
  const saveRequest = useMutation(api.content.requests.save);
  const discardRequest = useMutation(api.content.requests.discard);
  const deleteSlide = useMutation(api.content.requests.deleteSlide);
  const moveSlide = useMutation(api.content.requests.moveSlide);
  const duplicateSlide = useMutation(api.content.requests.duplicateSlide);
  const updateSlideText = useMutation(api.content.requests.updateSlideText);
  const [brandId, setBrandId] = useState("");
  const [socialAccountId, setSocialAccountId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const selectedBrandId = brandId || brands?.[0]?._id || "";
  const brandAccounts = useMemo(
    () =>
      accounts?.filter((account) => !selectedBrandId || account.brandId === selectedBrandId) ?? [],
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
  const plan = activeRequest?.plan && typeof activeRequest.plan === "object"
    ? activeRequest.plan as {
        title?: string;
        creativeBrief?: string;
        hook?: string;
        caption?: string;
        strategy?: {
          narrativePattern?: string;
          targetSlideCount?: number;
          reasoning?: string;
          visualStyle?: string;
          tone?: string;
        };
        slides?: Array<{
          slideId?: string;
          purpose?: string;
          role?: string;
          visualPrompt?: string;
          textBlocks?: Array<{ role?: string; text?: string; items?: string[] }>;
        }>;
      }
    : undefined;
  const isWorking = activeRequest
    ? ["queued", "planning", "generating"].includes(activeRequest.status)
    : false;

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
    const activeSlides = activeSlideshow.spec && typeof activeSlideshow.spec === "object"
      ? (activeSlideshow.spec as { slides?: CanonicalSlideshowSlide[] }).slides?.filter((item) => item.status !== "deleted") ?? []
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

  const handleDuplicateSlide = async (slide: CanonicalSlideshowSlide) => {
    if (!activeSlideshow) return;
    setStatusMessage("Duplicating slide");
    try {
      await duplicateSlide({ slideshowId: activeSlideshow._id, slideId: slide.slideId });
      setStatusMessage("Slide duplicated");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Duplicate slide failed");
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
    args: { primaryText: string; secondaryText?: string; bullets: string[] }
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

  return (
    <Page title="Create" description="Turn a rough idea into a reviewable one-off slideshow.">
      <FormPanel title="Generate Slideshow Preview" onSubmit={handleSubmit}>
        <Select label="Brand" value={selectedBrandId} onChange={setBrandId}>
          <option value="">Select brand</option>
          {brands?.map((brand) => (
            <option key={brand._id} value={brand._id}>
              {brand.name}
            </option>
          ))}
        </Select>
        <Select label="Account" value={socialAccountId} onChange={setSocialAccountId}>
          <option value="">No account yet</option>
          {brandAccounts.map((account) => (
            <option key={account._id} value={account._id}>
              {account.username}
            </option>
          ))}
        </Select>
        <Select label="Format" value="slideshow" onChange={() => undefined}>
          <option value="slideshow">Slideshow</option>
        </Select>
        <TextArea
          label="Prompt"
          value={prompt}
          onChange={setPrompt}
          placeholder="Create a slideshow for five habits you should do every morning. Use a dark minimalist style."
          rows={4}
        />
        <button
          className="primary-button"
          type="submit"
          disabled={!selectedBrandId || !prompt.trim()}
        >
          <Sparkles size={16} />
          Generate preview
        </button>
        {brands?.length === 0 && <p className="muted">Create a brand before generating content.</p>}
      </FormPanel>

      {statusMessage && <p className="muted">{statusMessage}</p>}

      <div className="two-column create-workspace">
        <Panel title="Recent Requests">
          {!contentRequests && <p className="muted">Loading requests...</p>}
          {contentRequests?.length === 0 && <p className="muted">No one-off content requests yet.</p>}
          <div className="request-list">
            {contentRequests?.map((request) => (
              <button
                className={`request-list-item ${activeRequest?._id === request._id ? "active" : ""}`}
                key={request._id}
                type="button"
                onClick={() => setSelectedRequestId(String(request._id))}
              >
                <span>{request.status}</span>
                <strong>{request.summary || request.prompt}</strong>
                <small>{new Date(request.createdAt).toLocaleString()}</small>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Creative Plan">
          {!activeRequest && <p className="muted">Generate a preview to see the agent's plan.</p>}
          {activeRequest && (
            <div className="create-plan">
              <div className="entity-eyebrow">{activeRequest.status}</div>
              <h3>{plan?.title || activeRequest.prompt}</h3>
              <p>{plan?.creativeBrief || activeRequest.summary || "The creative plan will appear here once planning finishes."}</p>
              {activeRequest.errorMessage && <p className="error-note">{activeRequest.errorMessage}</p>}
              {plan?.slides && (
                <div className="status-row">
                  <span>Planned slides</span>
                  <strong>{plan.slides.length}</strong>
                </div>
              )}
              {plan?.hook && (
                <div className="status-row">
                  <span>Hook</span>
                  <strong>{plan.hook}</strong>
                </div>
              )}
              {plan?.strategy && (
                <>
                  <div className="status-row">
                    <span>Pattern</span>
                    <strong>{plan.strategy.narrativePattern}</strong>
                  </div>
                  <div className="status-row">
                    <span>Tone</span>
                    <strong>{plan.strategy.tone}</strong>
                  </div>
                </>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Preview">
        {isWorking && <div className="empty-state">The agent is creating your slideshow preview...</div>}
        {!isWorking && activeRequest && !activeSlideshow && (
          <div className="empty-state">No slideshow preview yet.</div>
        )}
        {activeRequest && activeSlideshow && (
          <>
            <CreateSlideshowPreview
              title={plan?.title || "Generated slideshow"}
              subtitle={`${activeSlideshow.title} · ${activeRequest.status}`}
              slideshow={activeSlideshow}
              onDeleteSlide={handleDeleteSlide}
              onDuplicateSlide={handleDuplicateSlide}
              onMoveSlide={handleMoveSlide}
              onUpdateSlideText={handleUpdateSlideText}
            />
            <label className="revision-field">
              <span>Regenerate with changes</span>
              <textarea
                value={revisionPrompt}
                onChange={(event) => setRevisionPrompt(event.target.value)}
                placeholder="Make it more premium, remove the CTA, use a harsher gym tone..."
                rows={3}
              />
            </label>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                disabled={isWorking || !revisionPrompt.trim()}
                onClick={() => void handleRevise()}
              >
                <RefreshCw size={16} />
                Regenerate preview
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={isWorking || activeRequest.status === "saved"}
                onClick={() => void handleSave()}
              >
                <Check size={16} />
                Save to Library
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={isWorking}
                onClick={() => void handleDiscard()}
              >
                <Trash2 size={16} />
                Discard preview
              </button>
            </div>
          </>
        )}
      </Panel>
    </Page>
  );
}
