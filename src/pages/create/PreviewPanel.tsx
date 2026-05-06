import { Check, RefreshCw, Trash2 } from "lucide-react";
import { CreateSlideshowPreview } from "../../components/SlideshowPreview";
import { Panel } from "../../components/ui";
import type { CreativePlan, PreviewActions } from "./types";
import type { ContentRequestDoc, SlideshowDoc } from "./viewTypes";

type PreviewPanelProps = {
  activeRequest?: ContentRequestDoc;
  activeSlideshow?: SlideshowDoc;
  isWorking: boolean;
  plan?: CreativePlan;
  actions: PreviewActions;
};

export function PreviewPanel({
  activeRequest,
  activeSlideshow,
  isWorking,
  plan,
  actions,
}: PreviewPanelProps) {
  return (
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
            onDeleteSlide={actions.handleDeleteSlide}
            onMoveSlide={actions.handleMoveSlide}
            onRegenerateSlideImage={actions.handleRegenerateSlideImage}
            onUpdateSlideImagePrompt={actions.handleUpdateSlideImagePrompt}
            onUpdateSlideText={actions.handleUpdateSlideText}
          />
          <label className="revision-field">
            <span>Regenerate with changes</span>
            <textarea
              value={actions.revisionPrompt}
              onChange={(event) => actions.setRevisionPrompt(event.target.value)}
              placeholder="Make it more premium, remove the CTA, use a harsher gym tone..."
              rows={3}
            />
          </label>
          <div className="button-row">
            <button
              className="secondary-button"
              type="button"
              disabled={isWorking || !actions.revisionPrompt.trim()}
              onClick={() => void actions.handleRevise()}
            >
              <RefreshCw size={16} />
              Regenerate preview
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={isWorking || activeRequest.status === "saved"}
              onClick={() => void actions.handleSave()}
            >
              <Check size={16} />
              Save to Library
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={isWorking}
              onClick={() => void actions.handleDiscard()}
            >
              <Trash2 size={16} />
              Discard preview
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
