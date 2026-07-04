import { useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LoadingState } from "../components/ui";
import { SlideshowEditor } from "../features/create/slideshow/SlideshowEditor";
import { PostAction } from "../features/publishing/PostAction";
import { postMediaForSlideshow } from "../features/publishing/postMedia";
import { useWorkspace } from "../contexts/WorkspaceContext";

export function SlideshowEditorPage() {
  const navigate = useNavigate();
  const { slideshowId } = useParams();
  const { activeWorkspace } = useWorkspace();
  const slideshow = useQuery(
    api.content.slideshows.get,
    slideshowId ? { id: slideshowId as Id<"slideshows"> } : "skip"
  );

  return (
    <section>
      <section className="panel grid gap-[var(--space-5)]">
        <div className="section-toolbar">
          <div>
            <h2>{slideshow?.title ?? "Slideshow editor"}</h2>
            <p className="muted">
              Edit saved slideshow content for {activeWorkspace?.name ?? "this workspace"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[var(--space-2)]">
            {slideshow ? (
              <PostAction media={postMediaForSlideshow(slideshow)} />
            ) : null}
            <button className="primary-button" onClick={() => navigate("/library")} type="button">
              Done
            </button>
          </div>
        </div>

        {slideshow === undefined ? (
          <LoadingState detail="Fetching saved slideshow state." title="Loading slideshow" />
        ) : slideshow === null ? (
          <div className="empty-state">Slideshow not found.</div>
        ) : (
          <SlideshowEditor slideshow={slideshow} />
        )}
      </section>
    </section>
  );
}
