import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Folder,
  Image as ImageIcon,
  Music,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Page, Panel, Select } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { artifactSummary } from "../lib/artifactUtils";
import type { ArtifactDoc, WorkflowDoc, WorkflowRunDoc } from "../types";

type PackageMediaItem = {
  artifactId?: string;
  artifactType?: string;
  mimeType?: string;
  model?: string;
  provider?: string;
  role?: string;
  storageUrl: string;
  title?: string;
};

type LibraryOutput = {
  id: string;
  artifactId?: Id<"artifacts">;
  title: string;
  type: string;
  source: "create" | "workflow";
  createdAt: number;
  brandId?: string;
  workflowId?: string;
  workflowRunId?: string;
  provider?: string;
  model?: string;
  prompt?: string;
  summary?: string;
  storageUrl: string;
  mimeType?: string;
  aspectRatio?: string;
};

type LibraryRunGroup = {
  id: string;
  workflowId: string;
  run?: WorkflowRunDoc;
  outputs: LibraryOutput[];
  createdAt: number;
};

type LibraryWorkflowGroup = {
  id: string;
  workflow?: WorkflowDoc;
  runs: LibraryRunGroup[];
  outputCount: number;
  latestAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function artifactAspectRatio(artifact?: ArtifactDoc) {
  if (!artifact || !isRecord(artifact.data)) return undefined;

  if (typeof artifact.data.aspectRatio === "string") {
    return artifact.data.aspectRatio.replace(":", " / ");
  }

  const dimensions = isRecord(artifact.data.dimensions)
    ? artifact.data.dimensions
    : artifact.data;
  const width = typeof dimensions.width === "number" ? dimensions.width : undefined;
  const height = typeof dimensions.height === "number" ? dimensions.height : undefined;
  return width && height ? `${width} / ${height}` : undefined;
}

function exportTimestamp(artifact: ArtifactDoc) {
  if (!isRecord(artifact.data) || !isRecord(artifact.data.exportStatus)) return artifact.createdAt;
  return typeof artifact.data.exportStatus.exportedAt === "number"
    ? artifact.data.exportStatus.exportedAt
    : artifact.createdAt;
}

function exportedToMediaLibrary(artifact: ArtifactDoc) {
  if (artifact.type !== "publish_payload" || !isRecord(artifact.data)) return false;

  if (
    isRecord(artifact.data.exportStatus) &&
    artifact.data.exportStatus.destination === "media_library"
  ) {
    return true;
  }

  return Array.isArray(artifact.data.exports) &&
    artifact.data.exports.some((item) =>
      isRecord(item) && item.destination === "media_library"
    );
}

function createPageArtifactOutput(artifact: ArtifactDoc): LibraryOutput | null {
  if (!isRecord(artifact.data)) return null;
  if (artifact.data.source !== "create_page") return null;
  if (!artifact.storageUrl) return null;
  if (artifact.lifecycle && artifact.lifecycle !== "saved") return null;

  const mimeType = typeof artifact.data.mimeType === "string"
    ? artifact.data.mimeType
    : undefined;

  return {
    id: `create:${artifact._id}`,
    artifactId: artifact._id,
    title: artifact.title?.trim() || "Generated asset",
    type: artifact.type,
    source: "create",
    createdAt: artifact.createdAt,
    brandId: artifact.brandId ? String(artifact.brandId) : undefined,
    provider: artifact.provider,
    model: artifact.model,
    prompt: artifact.prompt,
    summary: artifactSummary(artifact),
    storageUrl: artifact.storageUrl,
    mimeType,
    aspectRatio: artifactAspectRatio(artifact),
  };
}

function createOutputsFromArtifacts(artifacts: ArtifactDoc[]) {
  return artifacts
    .map(createPageArtifactOutput)
    .filter((output): output is LibraryOutput => Boolean(output))
    .sort((first, second) => second.createdAt - first.createdAt);
}

function mediaItemsForArtifact(artifact: ArtifactDoc): PackageMediaItem[] {
  if (!isRecord(artifact.data) || !Array.isArray(artifact.data.mediaItems)) return [];

  return artifact.data.mediaItems
    .filter(isRecord)
    .map((item) => ({
      artifactId: typeof item.artifactId === "string" ? item.artifactId : undefined,
      artifactType: typeof item.artifactType === "string" ? item.artifactType : undefined,
      mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
      model: typeof item.model === "string" ? item.model : undefined,
      provider: typeof item.provider === "string" ? item.provider : undefined,
      role: typeof item.role === "string" ? item.role : undefined,
      storageUrl: typeof item.storageUrl === "string" ? item.storageUrl : "",
      title: typeof item.title === "string" ? item.title : undefined,
    }))
    .filter((item) => item.storageUrl);
}

function outputsFromArtifacts(artifacts: ArtifactDoc[]) {
  const artifactsById = new Map(artifacts.map((artifact) => [String(artifact._id), artifact]));
  const seenOutputKeys = new Set<string>();
  const outputs: LibraryOutput[] = [];

  for (const artifact of artifacts) {
    if (!artifact.workflowId || !artifact.workflowRunId || !exportedToMediaLibrary(artifact)) {
      continue;
    }

    for (const item of mediaItemsForArtifact(artifact)) {
      const key = item.artifactId ?? item.storageUrl;
      if (seenOutputKeys.has(key)) continue;
      seenOutputKeys.add(key);

      const sourceArtifact = item.artifactId ? artifactsById.get(item.artifactId) : undefined;
      outputs.push({
        id: `media:${artifact._id}:${key}`,
        title: item.title?.trim() || "Exported media",
        type: item.artifactType ?? item.role ?? "media",
        source: "workflow",
        createdAt: exportTimestamp(artifact),
        brandId: artifact.brandId ? String(artifact.brandId) : undefined,
        workflowId: String(artifact.workflowId),
        workflowRunId: String(artifact.workflowRunId),
        provider: item.provider,
        model: item.model,
        prompt: sourceArtifact?.prompt,
        summary: sourceArtifact ? artifactSummary(sourceArtifact) : undefined,
        storageUrl: item.storageUrl,
        mimeType: item.mimeType,
        aspectRatio: artifactAspectRatio(sourceArtifact),
      });
    }
  }

  return outputs.sort((first, second) => second.createdAt - first.createdAt);
}

function formatDateTime(value: number) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRunTime(run: WorkflowRunDoc | undefined, fallback: number) {
  return formatDateTime(run?.completedAt ?? run?.startedAt ?? run?.createdAt ?? fallback);
}

function MediaPreview({ output }: { output: LibraryOutput }) {
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<string | undefined>();
  const resolvedAspectRatio = output.aspectRatio ?? naturalAspectRatio;

  return (
    <div
      className="grid max-h-[18rem] min-h-[9rem] w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page-quiet)]"
      style={resolvedAspectRatio ? { aspectRatio: resolvedAspectRatio } : undefined}
    >
      {output.mimeType?.startsWith("audio/") || output.type === "audio" ? (
        <div className="grid place-items-center gap-[var(--space-3)] p-[var(--space-3)]">
          <Music size={28} className="text-[var(--color-ink-muted)]" />
          <audio src={output.storageUrl} controls className="w-full" />
        </div>
      ) : output.mimeType?.startsWith("video/") || output.type === "video" ? (
        <video className="h-full w-full object-cover" src={output.storageUrl} controls />
      ) : (
        <img
          className="h-full w-full object-cover"
          src={output.storageUrl}
          alt={output.title}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth && image.naturalHeight) {
              setNaturalAspectRatio(`${image.naturalWidth} / ${image.naturalHeight}`);
            }
          }}
        />
      )}
    </div>
  );
}

function OutputCard({
  isDeleting,
  onDelete,
  output,
}: {
  isDeleting?: boolean;
  onDelete?: () => void;
  output: LibraryOutput;
}) {
  const metadata = [
    output.source === "create" ? "Create" : "Workflow export",
    output.provider,
    output.model,
  ].filter(Boolean);

  return (
    <article className="group grid min-w-0 content-start gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)] shadow-[var(--shadow-sm)] transition hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)]">
      <MediaPreview output={output} />
      <div className="grid min-w-0 gap-[var(--space-2)]">
        <div className="entity-eyebrow">{output.type.replaceAll("_", " ")}</div>
        <h3 className="m-0 overflow-hidden text-[0.95rem] font-[760] leading-[1.2] text-[var(--color-ink)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {output.title}
        </h3>
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
      </div>
      <div className="flex flex-wrap gap-[var(--space-2)]">
        <a
          className="secondary-button min-h-[2rem] px-[var(--space-2)] py-[0.35rem] text-[0.78rem]"
          href={output.storageUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} />
          Open output
        </a>
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

function FolderButton({
  folder,
  onOpen,
}: {
  folder: LibraryWorkflowGroup;
  onOpen: () => void;
}) {
  return (
    <button
      className="grid min-w-0 cursor-pointer gap-[var(--space-4)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] text-left shadow-[var(--shadow-sm)] transition hover:-translate-y-px hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-md)]"
      type="button"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-[var(--space-3)]">
        <div className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
          <Folder size={22} />
        </div>
        <ChevronRight size={18} className="mt-2 text-[var(--color-ink-muted)]" />
      </div>
      <div className="artifact-copy">
        <h3>{folder.workflow?.name ?? "Untitled workflow"}</h3>
        <p>
          {folder.runs.length} run{folder.runs.length === 1 ? "" : "s"} ·{" "}
          {folder.outputCount} output{folder.outputCount === 1 ? "" : "s"}
        </p>
        <p>Latest {formatDateTime(folder.latestAt)}</p>
      </div>
    </button>
  );
}

function RunRow({
  group,
  onOpen,
}: {
  group: LibraryRunGroup;
  onOpen: () => void;
}) {
  const nonCompletedStatus = group.run?.status && group.run.status !== "completed"
    ? group.run.status.replaceAll("_", " ")
    : undefined;

  return (
    <button
      className="flex w-full cursor-pointer items-center justify-between gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] text-left transition hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-raised)]"
      type="button"
      onClick={onOpen}
    >
      <div className="flex min-w-0 items-center gap-[var(--space-3)]">
        <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-page-quiet)] text-[var(--color-ink-muted)]">
          <ImageIcon size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="m-0 text-[1rem] font-[680] leading-tight text-[var(--color-ink)]">
            {formatRunTime(group.run, group.createdAt)}
          </h3>
          <p className="m-0 mt-1 text-[0.9rem] leading-snug text-[var(--color-ink-muted)]">
            {group.outputs.length} output{group.outputs.length === 1 ? "" : "s"}
            {nonCompletedStatus ? ` · ${nonCompletedStatus}` : ""}
          </p>
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-[var(--color-ink-muted)]" />
    </button>
  );
}

function groupLibraryOutputs(args: {
  outputs: LibraryOutput[];
  workflows?: WorkflowDoc[];
  runs?: WorkflowRunDoc[];
}) {
  const workflowsById = new Map((args.workflows ?? []).map((workflow) => [String(workflow._id), workflow]));
  const runsById = new Map((args.runs ?? []).map((run) => [String(run._id), run]));
  const runGroupsById = new Map<string, LibraryRunGroup>();

  for (const output of args.outputs) {
    if (!output.workflowId || !output.workflowRunId) continue;
    const run = runsById.get(output.workflowRunId);
    const existing = runGroupsById.get(output.workflowRunId);
    if (existing) {
      existing.outputs.push(output);
      existing.createdAt = Math.max(existing.createdAt, output.createdAt);
      continue;
    }

    runGroupsById.set(output.workflowRunId, {
      id: output.workflowRunId,
      workflowId: output.workflowId,
      run,
      outputs: [output],
      createdAt: output.createdAt,
    });
  }

  const workflowGroupsById = new Map<string, LibraryWorkflowGroup>();

  for (const runGroup of runGroupsById.values()) {
    runGroup.outputs.sort((first, second) => second.createdAt - first.createdAt);
    const existing = workflowGroupsById.get(runGroup.workflowId);
    if (existing) {
      existing.runs.push(runGroup);
      existing.outputCount += runGroup.outputs.length;
      existing.latestAt = Math.max(existing.latestAt, runGroup.createdAt);
      continue;
    }

    workflowGroupsById.set(runGroup.workflowId, {
      id: runGroup.workflowId,
      workflow: workflowsById.get(runGroup.workflowId),
      runs: [runGroup],
      outputCount: runGroup.outputs.length,
      latestAt: runGroup.createdAt,
    });
  }

  return [...workflowGroupsById.values()]
    .map((folder) => ({
      ...folder,
      runs: folder.runs.sort((first, second) => second.createdAt - first.createdAt),
    }))
    .sort((first, second) => second.latestAt - first.latestAt);
}

export function LibraryPage() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const artifacts = useQuery(api.artifacts.records.list, {
    ...workspaceArgs,
    includeDebug: true,
  });
  const brands = useQuery(api.accounts.brands.list, workspaceArgs);
  const workflows = useQuery(api.workflows.definitions.list, workspaceArgs);
  const runs = useQuery(api.workflows.runs.list, workspaceArgs);
  const deleteArtifact = useMutation(api.artifacts.records.remove);
  const [libraryView, setLibraryView] = useState<"assets" | "workflows">("assets");
  const [brandFilter, setBrandFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deletingArtifactId, setDeletingArtifactId] = useState<string | null>(null);
  const [libraryStatus, setLibraryStatus] = useState("");

  const workflowOutputs = useMemo(
    () => outputsFromArtifacts(artifacts ?? []),
    [artifacts]
  );
  const createOutputs = useMemo(
    () => createOutputsFromArtifacts(artifacts ?? []),
    [artifacts]
  );

  const filteredCreateOutputs = useMemo(
    () => createOutputs.filter((output) => {
      if (brandFilter && output.brandId !== brandFilter) return false;
      if (typeFilter && output.type !== typeFilter) return false;
      return true;
    }),
    [brandFilter, createOutputs, typeFilter]
  );

  const filteredWorkflowOutputs = useMemo(
    () => workflowOutputs.filter((output) => {
      if (brandFilter && output.brandId !== brandFilter) return false;
      if (typeFilter && output.type !== typeFilter) return false;
      return true;
    }),
    [brandFilter, typeFilter, workflowOutputs]
  );

  const folders = useMemo(
    () => groupLibraryOutputs({ outputs: filteredWorkflowOutputs, runs, workflows }),
    [filteredWorkflowOutputs, runs, workflows]
  );

  const selectedFolder = folders.find((folder) => folder.id === selectedWorkflowId);
  const selectedRun = selectedFolder?.runs.find((run) => run.id === selectedRunId);
  const outputTypes = useMemo(
    () =>
      Array.from(
        new Set([...createOutputs, ...workflowOutputs].map((output) => output.type))
      ).sort(),
    [createOutputs, workflowOutputs]
  );
  const loading = !artifacts || !runs || !workflows;

  const clearSelection = () => {
    setSelectedWorkflowId(null);
    setSelectedRunId(null);
  };

  const removeSavedAsset = async (output: LibraryOutput) => {
    if (!output.artifactId) return;
    const confirmed = window.confirm(`Delete "${output.title}" from the library?`);
    if (!confirmed) return;

    setDeletingArtifactId(String(output.artifactId));
    setLibraryStatus("");
    try {
      await deleteArtifact({ id: output.artifactId });
      setLibraryStatus("Asset deleted");
    } catch (error) {
      setLibraryStatus(error instanceof Error ? error.message : "Unable to delete asset");
    } finally {
      setDeletingArtifactId(null);
    }
  };

  const title = selectedRun
    ? formatRunTime(selectedRun.run, selectedRun.createdAt)
    : selectedFolder?.workflow?.name ??
      (libraryView === "assets" ? "Saved Assets" : "Workflow Exports");

  return (
    <Page
      title="Library"
      description={`Saved assets and workflow exports for ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <Panel title={title}>
        <div className="section-toolbar">
          <div className="grid min-w-0 gap-[var(--space-3)]">
            <div className="flex flex-wrap gap-[var(--space-2)]">
              <button
                className={libraryView === "assets" ? "primary-button" : "secondary-button"}
                type="button"
                onClick={() => {
                  setLibraryView("assets");
                  clearSelection();
                }}
              >
                Saved assets
              </button>
              <button
                className={libraryView === "workflows" ? "primary-button" : "secondary-button"}
                type="button"
                onClick={() => {
                  setLibraryView("workflows");
                  clearSelection();
                }}
              >
                Workflow exports
              </button>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
            {(selectedFolder || selectedRun) && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  if (selectedRun) {
                    setSelectedRunId(null);
                  } else {
                    clearSelection();
                  }
                }}
              >
                <ArrowLeft size={16} />
                Back
              </button>
            )}
            <div className="min-w-0 text-[0.9rem] text-[var(--color-ink-muted)]">
              {selectedRun
                ? `${selectedRun.outputs.length} output${selectedRun.outputs.length === 1 ? "" : "s"}`
                : selectedFolder
                  ? `${selectedFolder.runs.length} run${selectedFolder.runs.length === 1 ? "" : "s"} · ${selectedFolder.outputCount} output${selectedFolder.outputCount === 1 ? "" : "s"}`
                  : libraryView === "assets"
                    ? `${filteredCreateOutputs.length} saved asset${filteredCreateOutputs.length === 1 ? "" : "s"}`
                    : `${folders.length} workflow folder${folders.length === 1 ? "" : "s"} · ${filteredWorkflowOutputs.length} output${filteredWorkflowOutputs.length === 1 ? "" : "s"}`}
            </div>
            </div>
          </div>
          <div className="filter-grid">
            <Select label="Brand" value={brandFilter} onChange={setBrandFilter}>
              <option value="">All brands</option>
              {brands?.map((brand) => (
                <option key={brand._id} value={brand._id}>
                  {brand.name}
                </option>
              ))}
            </Select>
            <Select label="Type" value={typeFilter} onChange={setTypeFilter}>
              <option value="">All output types</option>
              {outputTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
            <button
              className="secondary-button self-end"
              type="button"
              onClick={() => {
                setBrandFilter("");
                setTypeFilter("");
                clearSelection();
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
        {libraryStatus ? (
          <p className="m-0 text-[0.86rem] text-[var(--color-ink-muted)]">{libraryStatus}</p>
        ) : null}

        {loading && <div className="empty-state">Loading library...</div>}
        {!loading && libraryView === "assets" && filteredCreateOutputs.length === 0 && (
          <div className="empty-state">
            {createOutputs.length === 0
              ? "No saved Create assets yet."
              : "No saved assets match these filters."}
          </div>
        )}
        {!loading && libraryView === "workflows" && folders.length === 0 && (
          <div className="empty-state">
            {workflowOutputs.length === 0
              ? "No media library exports yet."
              : "No exports match these filters."}
          </div>
        )}

        {!loading && libraryView === "assets" && filteredCreateOutputs.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),16rem))] items-start justify-start gap-[var(--space-3)]">
            {filteredCreateOutputs.map((output) => (
              <OutputCard
                isDeleting={deletingArtifactId === String(output.artifactId)}
                key={output.id}
                onDelete={() => void removeSavedAsset(output)}
                output={output}
              />
            ))}
          </div>
        )}

        {!loading && libraryView === "workflows" && !selectedFolder && folders.length > 0 && (
          <div className="artifact-grid">
            {folders.map((folder) => (
              <FolderButton
                key={folder.id}
                folder={folder}
                onOpen={() => {
                  setSelectedWorkflowId(folder.id);
                  setSelectedRunId(null);
                }}
              />
            ))}
          </div>
        )}

        {!loading && libraryView === "workflows" && selectedFolder && !selectedRun && (
          <div className="grid gap-[var(--space-3)]">
            {selectedFolder.runs.map((runGroup) => (
              <RunRow
                key={runGroup.id}
                group={runGroup}
                onOpen={() => setSelectedRunId(runGroup.id)}
              />
            ))}
          </div>
        )}

        {!loading && libraryView === "workflows" && selectedRun && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),16rem))] items-start justify-start gap-[var(--space-3)]">
            {selectedRun.outputs.map((output) => (
              <OutputCard key={output.id} output={output} />
            ))}
          </div>
        )}
      </Panel>
    </Page>
  );
}
