import { Check, Library, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { MediaLightbox, type MediaLightboxItem } from "../../components/MediaLightbox";
import { GenerationLoadingState, LoadingSignal } from "../../components/ui";
import { PostAction } from "../publishing/PostAction";
import type { PostComposerMedia } from "../publishing/postMedia";
import { mediaPreviewTitle } from "./createPageHelpers";
import type { CreateResult } from "./createPageTypes";

function postMediaForCreateResult(result: CreateResult): PostComposerMedia | null {
  const artifactId = result.artifactIds?.[0];
  if (result.kind !== "video" || !result.url || !artifactId) return null;

  return {
    kind: "video",
    title: result.title,
    item: {
      artifactId,
      storageUrl: result.url,
      kind: "video",
      title: result.title,
    },
  };
}

export function CreateResultPanel({
  isReviewActionPending,
  onReject,
  onSave,
  result,
}: {
  isReviewActionPending: boolean;
  onReject: (result: CreateResult) => void;
  onSave: (result: CreateResult) => void;
  result: CreateResult;
}) {
  const isPending = result.status === "pending";
  const isError = result.status === "error";
  const isReview = result.status === "review";
  const isSaved = result.status === "saved";
  const [lightboxImage, setLightboxImage] = useState<MediaLightboxItem | null>(null);
  const postMedia = postMediaForCreateResult(result);

  return (
    <aside className="grid content-start rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-page-quiet)] p-[var(--space-4)]">
      <div className="entity-eyebrow">
        {isPending ? "Generating" : isError ? "Needs attention" : isSaved ? "Saved" : "Preview"}
      </div>
      <h3 className="m-0 mt-[var(--space-1)] text-[1.05rem] font-[780]">
        {result.title}
      </h3>
      <p className="muted">{result.detail}</p>

      {isPending ? (
        <div className="mt-[var(--space-3)] grid gap-[var(--space-3)]">
          <GenerationLoadingState
            detail={result.model ? `Using ${result.model}.` : "The preview will appear here when it is ready."}
            steps={
              result.kind === "audio"
                ? ["Preparing script", "Synthesizing audio", "Saving preview"]
                : result.kind === "video"
                  ? ["Preparing references", "Rendering motion", "Saving preview"]
                  : result.kind === "slideshow"
                    ? ["Planning slides", "Queueing request", "Saving draft"]
                    : ["Preparing prompt", "Generating image", "Saving preview"]
            }
            title={mediaPreviewTitle(result.kind)}
          />
        </div>
      ) : result.url ? (
        result.kind === "video" ? (
          <video
            className="mt-[var(--space-3)] w-full rounded-[var(--radius-sm)]"
            controls
            src={result.url}
          />
        ) : result.kind === "audio" ? (
          <audio className="mt-[var(--space-3)] w-full" controls src={result.url} />
        ) : (
          <>
            <button
              aria-label={`View ${result.title}`}
              className="mt-[var(--space-3)] block w-full cursor-zoom-in rounded-[var(--radius-sm)] border-0 bg-transparent p-0 text-left focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2"
              onClick={() => {
                if (!result.url) return;
                setLightboxImage({
                  src: result.url,
                  title: result.title,
                  meta: result.model,
                });
              }}
              type="button"
            >
              <img
                alt=""
                className="max-h-[22rem] w-full rounded-[var(--radius-sm)] object-cover"
                src={result.url}
              />
            </button>
            <MediaLightbox media={lightboxImage} onClose={() => setLightboxImage(null)} />
          </>
        )
      ) : null}

      {result.prompt && !isPending ? (
        <details className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-3)] text-[0.78rem] text-[var(--color-ink-muted)]">
          <summary className="cursor-pointer list-none font-[760] text-[var(--color-ink)] marker:hidden">
            Prompt used
          </summary>
          <p className="m-0 mt-[var(--space-2)] max-h-[9rem] overflow-auto leading-[1.45]">
            {result.prompt}
          </p>
        </details>
      ) : null}

      {isReview ? (
        <div className="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
          <button
            className="primary-button"
            disabled={isReviewActionPending}
            onClick={() => onSave(result)}
            type="button"
          >
            {isReviewActionPending ? (
              <LoadingSignal label="Saving" size="sm" />
            ) : (
              <Check size={16} />
            )}
            {isReviewActionPending ? "Saving" : "Save"}
          </button>
          <button
            className="secondary-button text-[var(--color-danger)]"
            disabled={isReviewActionPending}
            onClick={() => onReject(result)}
            type="button"
          >
            {isReviewActionPending ? (
              <LoadingSignal label="Rejecting" size="sm" />
            ) : (
              <Trash2 size={16} />
            )}
            {isReviewActionPending ? "Rejecting" : "Reject"}
          </button>
        </div>
      ) : null}

      {isSaved ? (
        <div className="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
          {postMedia ? <PostAction media={postMedia} /> : null}
          <Link className="secondary-button w-fit" to="/library">
            <Library size={16} />
            Open library
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
