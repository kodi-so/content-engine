import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SlideshowEditor } from "../../create/slideshow/SlideshowEditor";
import type { AgentCreateArtifact } from "../model/agentCreateTypes";

export function isInlineSlideshowArtifact(artifact: AgentCreateArtifact, compact: boolean) {
  return !compact &&
    artifact.kind === "slideshow" &&
    artifact.status === "ready" &&
    !artifact.id.includes(":");
}

export function AgentCreateSlideshowArtifact({
  artifact,
}: {
  artifact: AgentCreateArtifact;
}) {
  const slideshow = useQuery(api.content.slideshows.get, {
    id: artifact.id as Id<"slideshows">,
  });

  return (
    <section className="grid min-w-0 gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)] shadow-[var(--shadow-sm)]">
      <div className="flex min-w-0 items-center justify-between gap-[var(--space-3)]">
        <div className="grid min-w-0 gap-1">
          <h3 className="m-0 truncate text-[0.92rem] font-[820] text-[var(--color-ink)]">
            {slideshow?.title ?? artifact.title}
          </h3>
          <p className="m-0 text-[0.76rem] font-[720] text-[var(--color-ink-muted)]">
            Editable slideshow
          </p>
        </div>
        <a
          className="secondary-button min-h-8 shrink-0 px-2 py-1 text-[0.76rem]"
          href={`/slideshows/${encodeURIComponent(artifact.id)}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} />
          Full editor
        </a>
      </div>

      {slideshow === undefined ? (
        <div className="grid min-h-[10rem] place-items-center rounded-[var(--radius-sm)] bg-[var(--color-page-quiet)] p-[var(--space-4)] text-center text-[0.82rem] text-[var(--color-ink-muted)]">
          Loading slideshow
        </div>
      ) : slideshow === null ? (
        <div className="grid min-h-[10rem] place-items-center rounded-[var(--radius-sm)] bg-[var(--color-page-quiet)] p-[var(--space-4)] text-center text-[0.82rem] text-[var(--color-ink-muted)]">
          Slideshow not found.
        </div>
      ) : (
        <SlideshowEditor slideshow={slideshow} />
      )}
    </section>
  );
}
