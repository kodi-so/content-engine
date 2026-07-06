import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Music,
  Pencil,
  Play,
  Send,
  Sparkles,
} from "lucide-react";
import {
  AgentCreateSlideshowArtifact,
  isInlineSlideshowArtifact,
} from "./AgentCreateSlideshowArtifact";
import { ReferenceBriefPanel } from "../../analyze/ReferenceBriefPanel";
import { PostComposerModal } from "../../publishing/PostComposerModal";
import type { PostComposerMedia } from "../../publishing/postMedia";
import type { AgentCreateArtifact } from "../model/agentCreateTypes";
import { agentCreateClassNames } from "../model/agentCreateUi";
import type { Id } from "../../../../convex/_generated/dataModel";

// The reference brief is the agent's working memory for later generations, not
// a user deliverable: show a compact gist and keep the full analysis behind an
// expander so the chat reads like a conversation, not a report.
function CollapsibleReferenceBrief({
  artifact,
}: {
  artifact: AgentCreateArtifact & { referenceBrief: NonNullable<AgentCreateArtifact["referenceBrief"]> };
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const brief = artifact.referenceBrief;
  const gist = brief.oneLineSummary?.trim() || artifact.description?.trim() || brief.coreIdea?.trim();
  const sourceType = brief.sourceType && brief.sourceType !== "unknown" ? brief.sourceType : undefined;

  if (isExpanded) {
    return (
      <div className="grid min-w-0 gap-[var(--space-2)]">
        <ReferenceBriefPanel
          brief={brief}
          summary={artifact.description}
          title={artifact.title}
          variant="embedded"
        />
        <button
          className="inline-flex w-fit items-center gap-1 text-[0.76rem] font-[780] text-[var(--color-primary)]"
          onClick={() => setIsExpanded(false)}
          type="button"
        >
          <ChevronUp size={14} />
          Collapse analysis
        </button>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 max-w-[34rem] gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)]">
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <Sparkles size={15} className="shrink-0 text-[var(--color-primary)]" strokeWidth={1.9} />
        <strong className="min-w-0 text-[0.92rem] font-[820] leading-tight text-[var(--color-ink)]">
          {artifact.title}
        </strong>
        {sourceType ? (
          <span className="rounded-full border border-[var(--color-border)] px-[var(--space-2)] py-[0.14rem] text-[0.68rem] font-[760] capitalize text-[var(--color-muted)]">
            {sourceType}
          </span>
        ) : null}
      </div>
      {gist ? (
        <p className="m-0 text-[0.86rem] leading-[1.5] text-[var(--color-ink)]">{gist}</p>
      ) : null}
      <button
        className="inline-flex w-fit items-center gap-1 text-[0.76rem] font-[780] text-[var(--color-primary)]"
        onClick={() => setIsExpanded(true)}
        type="button"
      >
        <ChevronDown size={14} />
        View full analysis
      </button>
    </div>
  );
}

function postMediaForAgentArtifact(
  artifact: AgentCreateArtifact
): PostComposerMedia | null {
  if (
    artifact.status !== "ready" ||
    artifact.kind !== "video" ||
    !artifact.url ||
    artifact.id.includes(":")
  ) {
    return null;
  }

  return {
    kind: "video",
    title: artifact.title,
    item: {
      artifactId: artifact.id as Id<"artifacts">,
      storageUrl: artifact.url,
      mimeType: artifact.mimeType,
      kind: "video",
      title: artifact.title,
    },
  };
}

export function AgentCreateArtifactCard({
  artifact,
  compact = false,
  onDownload,
  onOpen,
  onOpenStudio,
  onPreview,
  onSave,
}: {
  artifact: AgentCreateArtifact;
  compact?: boolean;
  onDownload?: (artifact: AgentCreateArtifact) => void;
  onOpen?: (artifact: AgentCreateArtifact) => void;
  onOpenStudio?: (artifact: AgentCreateArtifact) => void;
  onPreview?: (artifact: AgentCreateArtifact) => void;
  onSave?: (artifact: AgentCreateArtifact) => void;
}) {
  const isReady = artifact.status === "ready";
  const isWorking = artifact.status === "generating" || artifact.status === "placeholder";
  const mediaUrl = artifact.url ?? artifact.thumbnailUrl;
  const hasInlinePreview = Boolean(
    (artifact.kind === "image" && mediaUrl) ||
      (artifact.kind === "video" && mediaUrl) ||
      (artifact.kind === "audio" && mediaUrl)
  );
  const canPreview = Boolean(
    onPreview &&
      isReady &&
      mediaUrl &&
      (artifact.kind === "image" || artifact.kind === "video")
  );
  const isDirectGeneratedArtifact = isReady &&
    !artifact.id.includes(":") &&
    artifact.kind !== "slideshow";
  const canOpenInStudio = artifact.id.startsWith("studio:") ||
    (isDirectGeneratedArtifact && (artifact.kind === "image" || artifact.kind === "video"));
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const postMedia = postMediaForAgentArtifact(artifact);
  const hasMenuActions = Boolean(
    postMedia ||
      (onSave && isDirectGeneratedArtifact) ||
      (onOpenStudio && canOpenInStudio) ||
      (onDownload && artifact.url) ||
      (onOpen && artifact.url)
  );

  useEffect(() => {
    if (!menuPoint) return;

    const closeMenu = () => setMenuPoint(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuPoint]);

  const openContextMenu = (event: ReactMouseEvent) => {
    if (!hasMenuActions || !isReady) return;
    event.preventDefault();
    const menuWidth = 176;
    const menuHeight = 176;
    setMenuPoint({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  };

  const runMenuAction = (action?: (selectedArtifact: AgentCreateArtifact) => void) => {
    setMenuPoint(null);
    action?.(artifact);
  };

  const contextMenu = menuPoint ? (
    <div
      className="fixed z-[90] grid min-w-40 overflow-hidden rounded-[0.7rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-[0.78rem] font-[720] text-[var(--color-ink)] shadow-[var(--shadow-lg)]"
      onClick={(event) => event.stopPropagation()}
      style={{ left: menuPoint.x, top: menuPoint.y }}
    >
      {postMedia ? (
        <button
          className="inline-flex min-h-8 items-center gap-2 rounded-[0.5rem] px-2 text-left transition hover:bg-[var(--color-page-quiet)]"
          onClick={() => {
            setMenuPoint(null);
            setIsComposerOpen(true);
          }}
          type="button"
        >
          <Send size={14} />
          Post
        </button>
      ) : null}
      {onSave && isDirectGeneratedArtifact ? (
        <button
          className="inline-flex min-h-8 items-center gap-2 rounded-[0.5rem] px-2 text-left transition hover:bg-[var(--color-page-quiet)]"
          onClick={() => runMenuAction(onSave)}
          type="button"
        >
          <Archive size={14} />
          Save to Library
        </button>
      ) : null}
      {onOpenStudio && canOpenInStudio ? (
        <button
          className="inline-flex min-h-8 items-center gap-2 rounded-[0.5rem] px-2 text-left transition hover:bg-[var(--color-page-quiet)]"
          onClick={() => runMenuAction(onOpenStudio)}
          type="button"
        >
          <Pencil size={14} />
          Open in Studio
        </button>
      ) : null}
      {onDownload && artifact.url ? (
        <button
          className="inline-flex min-h-8 items-center gap-2 rounded-[0.5rem] px-2 text-left transition hover:bg-[var(--color-page-quiet)]"
          onClick={() => runMenuAction(onDownload)}
          type="button"
        >
          <Download size={14} />
          Export
        </button>
      ) : null}
      {onOpen && artifact.url ? (
        <button
          className="inline-flex min-h-8 items-center gap-2 rounded-[0.5rem] px-2 text-left transition hover:bg-[var(--color-page-quiet)]"
          onClick={() => runMenuAction(onOpen)}
          type="button"
        >
          <ExternalLink size={14} />
          Open
        </button>
      ) : null}
    </div>
  ) : null;

  const composerModal = isComposerOpen && postMedia ? (
    <PostComposerModal media={postMedia} onClose={() => setIsComposerOpen(false)} />
  ) : null;

  if (artifact.referenceBrief && !compact) {
    return (
      <CollapsibleReferenceBrief
        artifact={artifact as AgentCreateArtifact & { referenceBrief: NonNullable<AgentCreateArtifact["referenceBrief"]> }}
      />
    );
  }

  if (!compact && isReady && mediaUrl && (artifact.kind === "image" || artifact.kind === "video")) {
    return (
      <figure className="m-0 grid min-w-0 max-w-[26rem] gap-[var(--space-2)]">
        {artifact.kind === "image" ? (
          <>
            <button
              aria-label={`Open ${artifact.title}`}
              className={agentCreateClassNames(
                "relative w-fit max-w-full overflow-hidden rounded-[0.9rem] p-0 text-left shadow-[var(--shadow-sm)]",
                canPreview
                  ? "cursor-zoom-in transition hover:brightness-[0.98] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-page)]"
                  : "cursor-default"
              )}
              onClick={() => {
                if (canPreview) onPreview?.(artifact);
              }}
              onContextMenu={openContextMenu}
              type="button"
            >
              <img
                alt={artifact.title}
                className="max-h-[26rem] max-w-full object-contain"
                src={mediaUrl}
              />
            </button>
            {contextMenu}
          </>
        ) : (
          <>
            <button
              aria-label={`Open ${artifact.title}`}
              className={agentCreateClassNames(
                "group/final-video relative w-fit max-w-full overflow-hidden rounded-[0.9rem] bg-black p-0 text-left shadow-[var(--shadow-sm)]",
                canPreview
                  ? "cursor-zoom-in transition hover:brightness-[0.98] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-page)]"
                  : "cursor-default"
              )}
              onClick={() => {
                if (canPreview) onPreview?.(artifact);
              }}
              onContextMenu={openContextMenu}
              type="button"
            >
              <video
                className="max-h-[26rem] max-w-full object-contain"
                muted
                playsInline
                preload="metadata"
                src={mediaUrl}
              />
              {canPreview ? (
                <span className="absolute inset-0 grid place-items-center bg-[oklch(8%_0.018_220_/_0.08)] text-white opacity-95 transition group-hover/final-video:bg-[oklch(8%_0.018_220_/_0.16)]">
                  <span className="grid size-11 place-items-center rounded-full bg-[oklch(8%_0.018_220_/_0.54)] shadow-[var(--shadow-sm)]">
                    <Play size={19} fill="currentColor" strokeWidth={0} />
                  </span>
                </span>
              ) : null}
            </button>
            {contextMenu}
          </>
        )}
        {composerModal}
      </figure>
    );
  }

  return (
    <article
      className={agentCreateClassNames(
        "grid min-w-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]",
        compact && hasInlinePreview ? "grid-cols-[5.5rem_minmax(0,1fr)]" : "content-start"
      )}
    >
      {hasInlinePreview ? (
        <div
          className={agentCreateClassNames(
            "relative grid place-items-center bg-[var(--color-page-quiet)] text-[var(--color-ink-muted)]",
            compact ? "min-h-[5.5rem]" : "aspect-[16/10]"
          )}
        >
          {artifact.kind === "image" && mediaUrl ? (
            <img alt="" className="size-full object-cover" src={mediaUrl} />
          ) : artifact.kind === "video" && mediaUrl ? (
            <video
              className="size-full object-cover"
              controls={isReady && !compact}
              muted
              playsInline
              preload="metadata"
              src={mediaUrl}
            />
          ) : artifact.kind === "audio" && mediaUrl ? (
            <div className="grid size-full place-items-center p-[var(--space-3)]">
              <span className="grid size-14 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)]">
                <Music size={22} />
              </span>
              {isReady && !compact ? (
                <audio className="absolute bottom-2 left-2 right-2 w-[calc(100%-1rem)]" controls src={mediaUrl} />
              ) : null}
            </div>
          ) : null}
          {isWorking ? (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[0.66rem] font-[820] text-[var(--color-ink-soft)]">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
              {artifact.status === "placeholder" ? "Planned" : "Working"}
            </span>
          ) : null}
          {artifact.status === "failed" ? (
            <span className="absolute right-2 top-2 rounded-full bg-[var(--color-danger-soft)] px-2 py-1 text-[0.66rem] font-[820] text-[var(--color-danger)]">
              Failed
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-[var(--space-2)] p-[var(--space-3)]">
        <div className="grid min-w-0 gap-[0.15rem]">
          <h3 className="m-0 truncate text-[0.9rem] font-[790] text-[var(--color-ink)]">
            {artifact.title}
          </h3>
          {artifact.description ? (
            <p className="m-0 line-clamp-2 break-words text-[0.76rem] leading-[1.4] text-[var(--color-ink-muted)]">
              {artifact.description}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
          {artifact.modelLabel ? (
            <span className="truncate text-[0.7rem] font-[700] text-[var(--color-ink-muted)]">
              {artifact.modelLabel}
            </span>
          ) : null}
          <span className="rounded-full bg-[var(--color-page-quiet)] px-2 py-1 text-[0.66rem] font-[780] text-[var(--color-ink-soft)]">
            {artifact.kind}
          </span>
          {!hasInlinePreview && isWorking ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-page-quiet)] px-2 py-1 text-[0.66rem] font-[780] text-[var(--color-ink-soft)]">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
              {artifact.status === "placeholder" ? "Planned" : "Working"}
            </span>
          ) : null}
          {!hasInlinePreview && artifact.status === "failed" ? (
            <span className="rounded-full bg-[var(--color-danger-soft)] px-2 py-1 text-[0.66rem] font-[780] text-[var(--color-danger)]">
              Failed
            </span>
          ) : null}
        </div>

        {(onOpen || onDownload || postMedia) && (isReady || artifact.url) ? (
          <div className="flex flex-wrap gap-[var(--space-2)]">
            {postMedia ? (
              <button
                className="secondary-button min-h-8 px-2 py-1 text-[0.76rem]"
                onClick={() => setIsComposerOpen(true)}
                type="button"
              >
                <Send size={14} />
                Post
              </button>
            ) : null}
            {onOpen && artifact.url ? (
              <button
                className="secondary-button min-h-8 px-2 py-1 text-[0.76rem]"
                onClick={() => onOpen(artifact)}
                type="button"
              >
                <ExternalLink size={14} />
                Open
              </button>
            ) : null}
            {onDownload && isReady ? (
              <button
                className="secondary-button min-h-8 px-2 py-1 text-[0.76rem]"
                onClick={() => onDownload(artifact)}
                type="button"
              >
                <Download size={14} />
                Export
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {composerModal}
    </article>
  );
}

export function AgentCreateArtifactGrid({
  artifacts,
  compact = false,
  emptyLabel = "Artifacts will appear here as the agent creates them.",
  onDownload,
  onOpen,
  onOpenStudio,
  onPreview,
  onSave,
}: {
  artifacts: AgentCreateArtifact[];
  compact?: boolean;
  emptyLabel?: string;
  onDownload?: (artifact: AgentCreateArtifact) => void;
  onOpen?: (artifact: AgentCreateArtifact) => void;
  onOpenStudio?: (artifact: AgentCreateArtifact) => void;
  onPreview?: (artifact: AgentCreateArtifact) => void;
  onSave?: (artifact: AgentCreateArtifact) => void;
}) {
  if (!artifacts.length) {
    return (
      <div className="grid min-h-[8rem] place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-page-quiet)] p-[var(--space-4)] text-center text-[0.82rem] text-[var(--color-ink-muted)]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-[var(--space-3)]">
      {artifacts.map((artifact) => (
        isInlineSlideshowArtifact(artifact, compact) ? (
          <AgentCreateSlideshowArtifact artifact={artifact} key={artifact.id} />
        ) : (
          <AgentCreateArtifactCard
            artifact={artifact}
            compact={compact}
            key={artifact.id}
            onDownload={onDownload}
            onOpen={onOpen}
            onOpenStudio={onOpenStudio}
            onPreview={onPreview}
            onSave={onSave}
          />
        )
      ))}
    </div>
  );
}

function workLogMediaArtifacts(artifacts: AgentCreateArtifact[]) {
  return artifacts.filter((artifact) =>
    artifact.status === "ready" &&
    Boolean(artifact.url ?? artifact.thumbnailUrl) &&
    (artifact.kind === "image" || artifact.kind === "video")
  );
}

export function AgentCreateMediaResultGrid({
  artifacts,
  onPreview,
}: {
  artifacts: AgentCreateArtifact[];
  onPreview?: (artifact: AgentCreateArtifact) => void;
}) {
  const mediaArtifacts = workLogMediaArtifacts(artifacts);
  if (!mediaArtifacts.length) return null;

  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(6rem,9rem))] gap-2">
      {mediaArtifacts.map((artifact) => {
        const mediaUrl = artifact.thumbnailUrl ?? artifact.url;
        if (!mediaUrl) return null;

        return (
          <button
            aria-label={`Open ${artifact.title}`}
            className="group/media relative grid aspect-[4/5] min-w-0 cursor-zoom-in overflow-hidden rounded-[0.65rem] border border-[var(--color-border)] bg-[var(--color-page-quiet)] p-0 text-left transition hover:border-[var(--color-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-page)]"
            key={artifact.id}
            onClick={() => onPreview?.(artifact)}
            type="button"
          >
            {artifact.kind === "video" ? (
              <>
                <video
                  className="absolute inset-0 size-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  src={mediaUrl}
                />
                <span className="absolute inset-0 grid place-items-center bg-[oklch(8%_0.018_220_/_0.16)] text-white">
                  <span className="grid size-9 place-items-center rounded-full bg-[oklch(8%_0.018_220_/_0.52)] shadow-[var(--shadow-sm)]">
                    <Play size={17} fill="currentColor" strokeWidth={0} />
                  </span>
                </span>
              </>
            ) : (
              <img
                alt={artifact.title}
                className="size-full object-cover transition duration-200 group-hover/media:scale-[1.02]"
                src={mediaUrl}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
