import { ChevronDown, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { artifactSummary } from "../../lib/artifactUtils";
import {
  artifactDataMimeType,
  artifactStorageUrl,
  isRecord,
  mediaItemsForArtifact,
} from "../../lib/artifacts/mediaItems";
import { ArtifactPreview } from "../ArtifactPreview";
import { MediaLightbox, type MediaLightboxItem } from "../MediaLightbox";
import { LoadingSignal, LoadingState } from "../ui";
import { formatDuration, formatStatus, formatTimestamp, type WorkflowRunDoc } from "./workflowRunFormat";

function isPlaceholderArtifact(artifact: Doc<"artifacts">): boolean {
  return isRecord(artifact.data) && artifact.data.placeholderExecution === true;
}

function isMediaArtifact(artifact: Doc<"artifacts">): boolean {
  return (
    artifact.type === "image" ||
    artifact.type === "video" ||
    artifact.type === "rendered_asset" ||
    artifact.type === "thumbnail"
  );
}

function artifactMimeType(artifact: Doc<"artifacts">): string | undefined {
  return artifactDataMimeType(artifact);
}

function isImageArtifact(artifact: Doc<"artifacts">): boolean {
  return (
    artifact.type === "image" ||
    artifact.type === "thumbnail" ||
    artifactMimeType(artifact)?.startsWith("image/") === true
  );
}

function isUserFacingArtifact(artifact: Doc<"artifacts">): boolean {
  if (isPlaceholderArtifact(artifact) || artifact.type === "publish_payload") return false;
  if (isMediaArtifact(artifact)) return Boolean(artifactStorageUrl(artifact));
  return Boolean(artifact.title || artifact.prompt || artifactSummary(artifact));
}

function firstExportedArtifactId(artifacts: Doc<"artifacts">[]): string | undefined {
  for (const artifact of artifacts) {
    if (artifact.type !== "publish_payload") continue;
    const item = mediaItemsForArtifact(artifact).find((mediaItem) => mediaItem.artifactId);
    if (item?.artifactId) return item.artifactId;
  }
  return undefined;
}

function runOutputSummary(
  artifacts: Doc<"artifacts">[] | undefined,
  selectedRunNodeStates: Doc<"workflowRunNodeStates">[] | undefined
): string {
  if (!artifacts) return "";

  const visibleArtifacts = artifacts.filter(isUserFacingArtifact);
  const mediaCount = visibleArtifacts.filter(isMediaArtifact).length;
  const nodeCount = selectedRunNodeStates?.length;

  return [
    mediaCount ? `${mediaCount} media output${mediaCount === 1 ? "" : "s"}` : undefined,
    nodeCount ? `${nodeCount} nodes` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function providerModelLabel(artifact: Doc<"artifacts">): string {
  return [artifact.provider, artifact.model].filter(Boolean).join(" · ");
}

function artifactOutputBaseTitle(artifact: Doc<"artifacts">): string {
  return (artifact.title || "Untitled artifact").replace(/\s+(image|video|asset)\s+\d+$/i, "");
}

function artifactOutputOrdinal(artifact: Doc<"artifacts">): string | undefined {
  const match = artifact.title?.match(/\s+(image|video|asset)\s+(\d+)$/i);
  if (!match) return undefined;

  const label = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  return `${label} ${match[2]}`;
}

function outputTitleCounts(artifacts: Doc<"artifacts">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const artifact of artifacts) {
    const title = artifactOutputBaseTitle(artifact);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  return counts;
}

function RunArtifactCard({
  artifact,
  deliverySummary,
  displayTitle,
  label,
  prominence = "secondary",
  sequenceLabel,
}: {
  artifact: Doc<"artifacts">;
  deliverySummary?: string;
  displayTitle?: string;
  label?: string;
  prominence?: "primary" | "secondary";
  sequenceLabel?: string;
}) {
  const [lightboxImage, setLightboxImage] = useState<MediaLightboxItem | null>(null);
  const storageUrl = artifactStorageUrl(artifact);
  const providerModel = providerModelLabel(artifact);
  const isPrimary = prominence === "primary";
  const canOpenImage = Boolean(storageUrl) && isImageArtifact(artifact);
  const outputTitle = displayTitle || artifact.title || "Untitled artifact";

  return (
    <article
      className={`grid min-w-0 gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-3)] ${
        isPrimary ? "" : "md:grid-cols-[7rem_minmax(0,1fr)]"
      }`}
    >
      <div
        className={`min-w-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-page-quiet)] ${
          isPrimary
            ? "[&_.artifact-preview]:min-h-[14rem] [&_.image-preview_img]:max-h-[24rem]"
            : "[&_.artifact-preview]:min-h-[6rem] [&_.image-preview_img]:max-h-[8rem]"
        } [&_.artifact-preview]:rounded-[var(--radius-sm)] [&_.image-preview_img]:w-full [&_.image-preview_img]:object-cover`}
      >
        <ArtifactPreview artifact={artifact} />
      </div>
      <div className="grid min-w-0 gap-[var(--space-1)]">
        {label ? (
          <span className="text-[0.68rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-ink-soft)]">
            {label}
          </span>
        ) : null}
        <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.86rem] font-[800] text-[var(--color-ink)]">
          {outputTitle}
        </strong>
        {sequenceLabel ? (
          <span className="text-[0.72rem] font-[740] text-[var(--color-ink-soft)]">
            {sequenceLabel}
          </span>
        ) : null}
        {providerModel ? (
          <span className="text-[0.74rem] text-[var(--color-ink-soft)]">{providerModel}</span>
        ) : null}
        {artifact.prompt ? (
          <p className="m-0 rounded-[var(--radius-xs)] bg-[var(--color-page-quiet)] p-[var(--space-2)] text-[0.78rem] leading-[1.35] text-[var(--color-ink-muted)]">
            {artifact.prompt}
          </p>
        ) : (
          <p className="m-0 text-[0.78rem] leading-[1.35] text-[var(--color-ink-muted)]">
            {artifactSummary(artifact)}
          </p>
        )}
        {storageUrl && canOpenImage ? (
          <button
            className="inline-flex w-fit items-center gap-[var(--space-1)] border-0 bg-transparent p-0 text-[0.76rem] font-[760] text-[var(--color-primary)]"
            onClick={() => {
              setLightboxImage({
                src: storageUrl,
                title: outputTitle,
                meta: providerModel,
              });
            }}
            type="button"
          >
            <ExternalLink size={14} />
            Open artifact
          </button>
        ) : storageUrl ? (
          <a
            className="inline-flex w-fit items-center gap-[var(--space-1)] text-[0.76rem] font-[760] text-[var(--color-primary)] no-underline"
            href={storageUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink size={14} />
            Open artifact
          </a>
        ) : null}
        <MediaLightbox media={lightboxImage} onClose={() => setLightboxImage(null)} />
        {deliverySummary ? (
          <p className="m-0 border-t border-[var(--color-border)] pt-[var(--space-2)] text-[0.76rem] font-[740] text-[var(--color-ink-soft)]">
            {deliverySummary}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function packageDeliverySummary(artifact: Doc<"artifacts">): string {
  if (!isRecord(artifact.data)) return "Exported";

  const exportStatus = isRecord(artifact.data.exportStatus) ? artifact.data.exportStatus : undefined;
  const destination =
    exportStatus && typeof exportStatus.destination === "string"
      ? formatStatus(exportStatus.destination)
      : "Media Library";
  const status =
    exportStatus && typeof exportStatus.status === "string"
      ? formatStatus(exportStatus.status)
      : "exported";

  return `${status.charAt(0).toUpperCase()}${status.slice(1)} to ${destination}`;
}

function RawPackageCard({ artifact }: { artifact: Doc<"artifacts"> }) {
  return (
    <div className="workflow-run-event">
      <span>export package</span>
      <strong>{artifact.title || "Export post package"}</strong>
      <p>{artifactSummary(artifact)}</p>
    </div>
  );
}

export type WorkflowExecutionPanelProps = {
  actionStatus?: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectRun: (runId: Id<"workflowRuns">) => void;
  selectedCanvasNode: { id: string; label: string } | null;
  selectedRun: WorkflowRunDoc | null;
  selectedRunArtifacts: Doc<"artifacts">[] | undefined;
  selectedRunEvents: Doc<"workflowRunEvents">[] | undefined;
  selectedRunNodeStates: Doc<"workflowRunNodeStates">[] | undefined;
  workflowRuns: WorkflowRunDoc[] | undefined;
};

export function WorkflowExecutionPanel({
  actionStatus,
  isOpen,
  onClose,
  onSelectRun,
  selectedCanvasNode,
  selectedRun,
  selectedRunArtifacts,
  selectedRunEvents,
  selectedRunNodeStates,
  workflowRuns,
}: WorkflowExecutionPanelProps) {
  const visibleArtifacts = selectedRunArtifacts?.filter(isUserFacingArtifact) ?? [];
  const packageArtifacts =
    selectedRunArtifacts?.filter((artifact) => artifact.type === "publish_payload") ?? [];
  const exportedArtifactId = selectedRunArtifacts ? firstExportedArtifactId(selectedRunArtifacts) : undefined;
  const exportedArtifact = exportedArtifactId
    ? visibleArtifacts.find((artifact) => String(artifact._id) === exportedArtifactId)
    : undefined;
  const fallbackPrimaryArtifact = [...visibleArtifacts].reverse().find(isMediaArtifact);
  const primaryArtifact = exportedArtifact ?? fallbackPrimaryArtifact;
  const secondaryArtifacts = visibleArtifacts.filter((artifact) => artifact._id !== primaryArtifact?._id);
  const outputCount = visibleArtifacts.length;
  const titleCounts = outputTitleCounts(visibleArtifacts);
  const deliverySummary = packageArtifacts.length
    ? packageArtifacts.map(packageDeliverySummary).join(" · ")
    : undefined;
  const selectedNodeState = selectedCanvasNode
    ? selectedRunNodeStates?.find((state) => state.nodeId === selectedCanvasNode.id) ?? null
    : null;
  const selectedNodeEvents = selectedCanvasNode
    ? selectedRunEvents?.filter((event) => event.nodeId === selectedCanvasNode.id) ?? []
    : [];
  const selectedNodeStatus = selectedNodeState
    ? formatStatus(selectedNodeState.status)
    : selectedCanvasNode
      ? selectedRunNodeStates
        ? "No state"
        : "Loading"
      : undefined;

  return (
    <section
      className={`workflow-execution-panel workflow-side-drawer${
        isOpen ? " workflow-side-drawer-open" : ""
      }`}
      aria-label="Workflow execution panel"
    >
      <div className="workflow-execution-header !static !mb-[var(--space-5)]">
        <div>
          <h2>Executions</h2>
          <p>
            {workflowRuns ? (
              `${workflowRuns.length} runs`
            ) : (
              <LoadingSignal label="Loading runs" showLabel size="sm" />
            )}
          </p>
        </div>
        <div className="workflow-execution-header-actions">
          <button
            aria-label="Close executions"
            className="workflow-drawer-close"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {actionStatus ? (
        <p className="mb-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-3)] py-[var(--space-2)] text-[0.78rem] text-[var(--color-ink-muted)]">
          {actionStatus}
        </p>
      ) : null}

      <div className="workflow-execution-grid pt-[var(--space-1)]">
        <div className="workflow-run-history rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-[var(--space-3)] shadow-[var(--shadow-sm)]">
          <div className="workflow-execution-section-heading">
            <h3>Recent Runs</h3>
            <span>
              {workflowRuns ? `${workflowRuns.length}` : <LoadingSignal label="Loading" size="sm" />}
            </span>
          </div>
          {!workflowRuns ? (
            <LoadingState
              className="border-0 bg-[var(--color-page)]"
              compact
              detail="Fetching the latest workflow executions."
              title="Loading runs"
            />
          ) : workflowRuns.length ? (
            <div className="workflow-run-list">
              {workflowRuns.slice(0, 8).map((run) => (
                <button
                  className={`workflow-run-row${
                    selectedRun?._id === run._id ? " workflow-run-row-selected" : ""
                  }`}
                  key={run._id}
                  onClick={() => onSelectRun(run._id)}
                  type="button"
                >
                  <span className={`workflow-run-status workflow-run-status-${run.status}`}>
                    {formatStatus(run.status)}
                  </span>
                  <strong>{formatTimestamp(run.createdAt)}</strong>
                  <small>{run.summary || run.errorMessage || "Workflow run record"}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="workflow-inspector-empty">No runs for this workflow yet.</p>
          )}
        </div>

        <div className="workflow-run-detail rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-[var(--space-3)] shadow-[var(--shadow-sm)]">
          <div className="workflow-execution-section-heading">
            <h3>Selected Run</h3>
            <span>{selectedRun ? formatStatus(selectedRun.status) : "None"}</span>
          </div>

          {selectedRun ? (
            <>
              <div className="grid gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-3)]">
                <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
                  <span className={`workflow-run-status workflow-run-status-${selectedRun.status}`}>
                    {formatStatus(selectedRun.status)}
                  </span>
                  <strong className="text-[0.84rem] font-[800] text-[var(--color-ink)]">
                    {formatDuration(selectedRun)}
                  </strong>
                  {selectedRun.costUsd ? (
                    <span className="text-[0.76rem] text-[var(--color-ink-soft)]">
                      ${selectedRun.costUsd.toFixed(4)}
                    </span>
                  ) : null}
                </div>
                <p className="m-0 text-[0.78rem] leading-[1.35] text-[var(--color-ink-muted)]">
                  {selectedRunArtifacts ? (
                    runOutputSummary(selectedRunArtifacts, selectedRunNodeStates) ||
                    selectedRun.summary ||
                    formatTimestamp(selectedRun.startedAt)
                  ) : (
                    <LoadingSignal label="Loading outputs" showLabel size="sm" />
                  )}
                </p>
              </div>

              {selectedRun.errorMessage ? (
                <p className="workflow-execution-warning">{selectedRun.errorMessage}</p>
              ) : null}

              {selectedCanvasNode ? (
                <div className="grid gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-3)]">
                  <div className="workflow-execution-section-heading">
                    <h3>Selected Node</h3>
                    <span>{selectedNodeStatus}</span>
                  </div>
                  <strong className="text-[0.86rem] font-[800] text-[var(--color-ink)]">
                    {selectedNodeState?.label ?? selectedCanvasNode.label}
                  </strong>
                  <p className="m-0 text-[0.78rem] leading-[1.35] text-[var(--color-ink-muted)]">
                    {selectedNodeState?.errorMessage ||
                      (selectedNodeState?.blockedByNodeIds?.length
                        ? `Blocked by ${selectedNodeState.blockedByNodeIds.join(", ")}`
                        : selectedNodeState
                          ? `${selectedNodeState.dependencyNodeIds.length} dependencies · ${selectedNodeEvents.length} events`
                          : selectedRunNodeStates
                            ? "No execution state recorded for this node in the selected run."
                            : undefined)}
                    {!selectedRunNodeStates ? (
                      <LoadingSignal label="Loading node execution state" showLabel size="sm" />
                    ) : null}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-[var(--space-3)]">
                <div className="workflow-execution-section-heading">
                  <h3>Outputs</h3>
                  <span>
                    {selectedRunArtifacts ? outputCount : <LoadingSignal label="Loading" size="sm" />}
                  </span>
                </div>

                {!selectedRunArtifacts ? (
                  <LoadingState
                    className="border-0 bg-[var(--color-page)]"
                    compact
                    detail="Collecting generated artifacts and export packages."
                    title="Loading outputs"
                  />
                ) : outputCount ? (
                  <div className="grid gap-[var(--space-3)]">
                    {primaryArtifact ? (
                      <RunArtifactCard
                        artifact={primaryArtifact}
                        deliverySummary={deliverySummary}
                        displayTitle={artifactOutputBaseTitle(primaryArtifact)}
                        label="Final output"
                        prominence="primary"
                        sequenceLabel={
                          (titleCounts.get(artifactOutputBaseTitle(primaryArtifact)) ?? 0) > 1
                            ? artifactOutputOrdinal(primaryArtifact)
                            : undefined
                        }
                      />
                    ) : null}

                    {secondaryArtifacts.length ? (
                      <div className="grid gap-[var(--space-2)]">
                        <span className="text-[0.72rem] font-[820] text-[var(--color-ink-soft)]">
                          Intermediate outputs
                        </span>
                        {secondaryArtifacts.map((artifact) => (
                          <RunArtifactCard
                            artifact={artifact}
                            displayTitle={artifactOutputBaseTitle(artifact)}
                            key={artifact._id}
                            sequenceLabel={
                              (titleCounts.get(artifactOutputBaseTitle(artifact)) ?? 0) > 1
                                ? artifactOutputOrdinal(artifact)
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="workflow-inspector-empty">No user-facing outputs were produced for this run.</p>
                )}

                <details className="group rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-[var(--space-2)] p-[var(--space-3)] text-[0.82rem] font-[800] text-[var(--color-ink)] marker:hidden">
                    Technical details
                    <span className="inline-flex items-center gap-[var(--space-1)] text-[0.72rem] font-[760] text-[var(--color-ink-soft)]">
                      {selectedRunNodeStates?.length ?? 0} nodes · {selectedRunEvents?.length ?? 0} events
                      {packageArtifacts.length ? ` · ${packageArtifacts.length} packages` : ""}
                      <ChevronDown
                        className="transition-transform group-open:rotate-180"
                        size={14}
                      />
                    </span>
                  </summary>
                  <div className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] p-[var(--space-3)]">
                    <div>
                      <div className="workflow-execution-section-heading">
                        <h3>Nodes</h3>
                        <span>
                          {selectedRunNodeStates ? (
                            selectedRunNodeStates.length
                          ) : (
                            <LoadingSignal label="Loading" size="sm" />
                          )}
                        </span>
                      </div>
                      {selectedRunNodeStates?.length ? (
                        <div className="workflow-run-node-state-list mt-[var(--space-2)]">
                          {selectedRunNodeStates.map((nodeState) => (
                            <div
                              className={`workflow-run-node-state workflow-run-node-state-${nodeState.status}`}
                              key={nodeState._id}
                            >
                              <span>{formatStatus(nodeState.status)}</span>
                              <strong>{nodeState.label}</strong>
                              <p>
                                {nodeState.errorMessage ||
                                  (nodeState.blockedByNodeIds?.length
                                    ? `Blocked by ${nodeState.blockedByNodeIds.join(", ")}`
                                    : `${nodeState.dependencyNodeIds.length} dependencies`)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : selectedRunNodeStates === undefined ? (
                        <LoadingState
                          className="mt-[var(--space-2)] border-0 bg-[var(--color-page-quiet)]"
                          compact
                          title="Loading nodes"
                        />
                      ) : (
                        <p className="workflow-inspector-empty">No node execution state recorded yet.</p>
                      )}
                    </div>

                    <div>
                      <div className="workflow-execution-section-heading">
                        <h3>Events</h3>
                        <span>
                          {selectedRunEvents ? (
                            selectedRunEvents.length
                          ) : (
                            <LoadingSignal label="Loading" size="sm" />
                          )}
                        </span>
                      </div>
                      {selectedRunEvents?.length ? (
                        <div className="workflow-run-event-list mt-[var(--space-2)]">
                          {selectedRunEvents.map((event) => (
                            <div className="workflow-run-event" key={event._id}>
                              <span>{formatStatus(event.type)}</span>
                              <strong>{event.nodeId || "Workflow"}</strong>
                              <p>{event.message}</p>
                            </div>
                          ))}
                        </div>
                      ) : selectedRunEvents === undefined ? (
                        <LoadingState
                          className="mt-[var(--space-2)] border-0 bg-[var(--color-page-quiet)]"
                          compact
                          title="Loading events"
                        />
                      ) : (
                        <p className="workflow-inspector-empty">No events recorded yet.</p>
                      )}
                    </div>

                    {packageArtifacts.length ? (
                      <div>
                        <div className="workflow-execution-section-heading">
                          <h3>Export Packages</h3>
                          <span>{packageArtifacts.length}</span>
                        </div>
                        <div className="workflow-run-event-list mt-[var(--space-2)]">
                          {packageArtifacts.map((artifact) => (
                            <RawPackageCard artifact={artifact} key={artifact._id} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>
              </div>
            </>
          ) : (
            <p className="workflow-inspector-empty">Select or create a run to inspect it.</p>
          )}
        </div>
      </div>
    </section>
  );
}
