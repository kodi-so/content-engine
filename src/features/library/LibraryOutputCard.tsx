import { Clapperboard, ExternalLink, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { AssetThumbnail } from "../assets/AssetThumbnail";
import { PostAction } from "../publishing/PostAction";
import { postMediaForLibraryOutput } from "../publishing/postMedia";
import type { LibraryOutput } from "./libraryTypes";
import { isImageOutput, isVideoOutput } from "./libraryMedia";

export function LibraryMediaPreview({
  onOpenMedia,
  output,
}: {
  onOpenMedia?: (output: LibraryOutput) => void;
  output: LibraryOutput;
}) {
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<string | undefined>();
  const resolvedAspectRatio = output.aspectRatio ?? naturalAspectRatio;
  const canOpenMedia = Boolean(onOpenMedia && (isImageOutput(output) || isVideoOutput(output)));
  const className =
    "grid max-h-[18rem] min-h-[9rem] w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page-quiet)]";
  const style = resolvedAspectRatio ? { aspectRatio: resolvedAspectRatio } : undefined;
  const preview = (
    <AssetThumbnail
      asset={{
        id: output.id,
        title: output.title,
        storageUrl: output.storageUrl,
        mimeType: output.mimeType,
        mediaKind: output.type,
      }}
      audioControls={!canOpenMedia}
      onAspectRatio={setNaturalAspectRatio}
    />
  );

  if (canOpenMedia) {
    return (
      <button
        aria-label={`Open ${output.title}`}
        className={`${className} cursor-zoom-in p-0 text-left transition hover:border-[var(--color-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface)]`}
        style={style}
        type="button"
        onClick={() => onOpenMedia?.(output)}
      >
        {preview}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      {preview}
    </div>
  );
}

function OutputTitle({
  onRename,
  title,
}: {
  onRename?: () => void;
  title: string;
}) {
  if (!onRename) {
    return (
      <h3 className="m-0 overflow-hidden text-[0.95rem] font-[760] leading-[1.2] text-[var(--color-ink)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
        {title}
      </h3>
    );
  }

  return (
    <button
      aria-label={`Rename ${title}`}
      className="block w-full min-w-0 rounded-[var(--radius-sm)] border border-transparent bg-transparent p-0 text-left text-[var(--color-ink)] transition hover:text-[var(--color-primary-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface)]"
      onClick={onRename}
      title="Rename title"
      type="button"
    >
      <span className="block overflow-hidden text-[0.95rem] font-[760] leading-[1.2] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
        {title}
      </span>
    </button>
  );
}

export function LibraryOutputCard({
  onOpenMedia,
  onCompose,
  onEdit,
  isDeleting,
  onDelete,
  onRename,
  output,
}: {
  onOpenMedia?: (output: LibraryOutput) => void;
  onCompose?: () => void;
  onEdit?: () => void;
  isDeleting?: boolean;
  onDelete?: () => void;
  onRename?: () => void;
  output: LibraryOutput;
}) {
  const metadata = [
    output.source === "create"
      ? "Create"
      : output.source === "creative_asset"
        ? "Reusable asset"
        : "Workflow export",
    output.provider,
    output.model,
  ].filter(Boolean);
  const postMedia = postMediaForLibraryOutput(output);

  return (
    <article className="group grid min-w-0 content-start gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)] shadow-[var(--shadow-sm)] transition hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)]">
      <LibraryMediaPreview onOpenMedia={onOpenMedia} output={output} />
      <div className="grid min-w-0 gap-[var(--space-2)]">
        <div className="entity-eyebrow">{output.type.replace(/_/g, " ")}</div>
        <OutputTitle onRename={onRename} title={output.title} />
        {metadata.length > 0 ? (
          <p className="m-0 truncate text-[0.78rem] leading-snug text-[var(--color-ink-muted)]">
            {metadata.join(" · ")}
          </p>
        ) : null}
        {output.prompt ? (
          <details className="group/prompt text-[0.78rem] text-[var(--color-ink-muted)]">
            <summary className="cursor-pointer list-none font-[720] text-[var(--color-ink-soft)] marker:hidden">
              Prompt used
            </summary>
            <p className="m-0 mt-[var(--space-2)] max-h-[7rem] overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-2)] leading-[1.45]">
              {output.prompt}
            </p>
          </details>
        ) : !output.prompt && output.summary ? (
          <p className="m-0 overflow-hidden text-[0.78rem] leading-snug text-[var(--color-ink-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {output.summary}
          </p>
        ) : null}
        {output.latestEditPrompt ? (
          <details className="group/edit-prompt text-[0.78rem] text-[var(--color-ink-muted)]">
            <summary className="cursor-pointer list-none font-[720] text-[var(--color-ink-soft)] marker:hidden">
              Latest edit
            </summary>
            <p className="m-0 mt-[var(--space-2)] max-h-[7rem] overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-2)] leading-[1.45]">
              {output.latestEditPrompt}
            </p>
          </details>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-[var(--space-2)]">
        {postMedia ? (
          <PostAction
            className="secondary-button min-h-[2rem] px-[var(--space-2)] py-[0.35rem] text-[0.78rem]"
            media={postMedia}
          />
        ) : null}
        {onEdit ? (
          <button
            className="secondary-button min-h-[2rem] px-[var(--space-2)] py-[0.35rem] text-[0.78rem]"
            onClick={onEdit}
            type="button"
          >
            <Wand2 size={15} />
            Edit image
          </button>
        ) : null}
        {onCompose ? (
          <button
            className="secondary-button min-h-[2rem] px-[var(--space-2)] py-[0.35rem] text-[0.78rem]"
            onClick={onCompose}
            type="button"
          >
            <Clapperboard size={15} />
            Create edit
          </button>
        ) : null}
        {!isImageOutput(output) ? (
          <a
            className="secondary-button min-h-[2rem] px-[var(--space-2)] py-[0.35rem] text-[0.78rem]"
            href={output.storageUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            Open output
          </a>
        ) : null}
        {onDelete ? (
          <button
            className="secondary-button min-h-[2rem] px-[var(--space-2)] py-[0.35rem] text-[0.78rem] text-[var(--color-danger)]"
            disabled={isDeleting}
            onClick={onDelete}
            type="button"
          >
            <Trash2 size={15} />
            {isDeleting ? "Deleting" : "Delete"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
