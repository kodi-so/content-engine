import { useAction, useMutation, useQuery } from "convex/react";
import {
  Film,
  FolderOpen,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LoadingSignal } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import {
  createOutputsFromArtifacts,
  creativeAssetOutputsFromAssets,
} from "../features/library/libraryOutputs";
import { isImageOutput, isVideoOutput } from "../features/library/libraryMedia";
import type { LibraryOutput } from "../features/library/libraryTypes";
import {
  VideoComposerInspectorPanel,
  VideoComposerMediaPanel,
} from "../features/video-composer/VideoComposerPanels";
import { VideoComposerPreview } from "../features/video-composer/VideoComposerPreview";
import { VideoStudioProjectHub } from "../features/video-composer/VideoStudioProjectHub";
import { VideoComposerTimeline } from "../features/video-composer/VideoComposerTimeline";
import { useVideoComposerExportActions } from "../features/video-composer/useVideoComposerExportActions";
import { useVideoComposerMediaDurations } from "../features/video-composer/useVideoComposerMediaDurations";
import {
  clampTimelineTime,
  clipFromLibraryOutput,
  compositionDuration,
  compositionTimelineDuration,
  createEmptyVideoCompositionDraft,
  createTimedTextOverlay,
  formatTimelineTime,
  normalizedClipTrim,
  type TimedTextOverlay,
  type VideoComposerAudioTrack,
  type VideoComposerClip,
  type VideoCompositionDraft,
} from "../features/video-composer/videoComposerModel";
import {
  dimensionsForAspectRatio,
  type CompositionAspectRatio,
} from "../lib/composition/aspectRatios";
import { withAutoTextOverlayBlockHeight } from "../lib/composition/textOverlays";

function sourceParamMatches(output: LibraryOutput, key: string | null, value: string | null) {
  if (!key || !value) return false;
  if (key === "artifactId") return String(output.artifactId ?? "") === value;
  if (key === "creativeAssetId") return String(output.creativeAssetId ?? "") === value;
  return output.id === value;
}

export function VideoComposerPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const projectId = searchParams.get("projectId") as Id<"videoProjects"> | null;
  const renderRequestId = searchParams.get("renderRequestId") as Id<"studioRenderRequests"> | null;
  const autoRenderRequested = searchParams.get("autoRender") === "1";
  const artifacts = useQuery(api.artifacts.records.list, {
    ...workspaceArgs,
    includeDebug: true,
  });
  const creativeAssets = useQuery(api.accounts.creativeAssets.list, workspaceArgs);
  const videoProjects = useQuery(api.content.videoProjects.list, workspaceArgs);
  const currentProject = useQuery(
    api.content.videoProjects.get,
    projectId ? { id: projectId } : "skip"
  );
  const currentRenderRequest = useQuery(
    api.create.studioRenderRequests.get,
    renderRequestId ? { id: renderRequestId } : "skip"
  );
  const renderWorkerAvailability = useQuery(api.create.studioRenderRequests.workerAvailability);
  const uploadMedia = useAction(api.storage.files.uploadBase64ImageWithMetadata);
  const createArtifact = useMutation(api.artifacts.records.create);
  const completeStudioRenderRequest = useMutation(api.create.studioRenderRequests.complete);
  const requestStudioRender = useMutation(api.create.studioRenderRequests.requestForProject);
  const createVideoProject = useMutation(api.content.videoProjects.create);
  const updateVideoProject = useMutation(api.content.videoProjects.update);
  const touchVideoProject = useMutation(api.content.videoProjects.touch);
  const archiveVideoProject = useMutation(api.content.videoProjects.archive);
  const [aspectRatio, setAspectRatio] = useState<CompositionAspectRatio>("9:16");
  const [audioTracks, setAudioTracks] = useState<VideoComposerAudioTrack[]>([]);
  const [clips, setClips] = useState<VideoComposerClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState("");
  const [textOverlays, setTextOverlays] = useState<TimedTextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [title, setTitle] = useState("Composed video");
  const [status, setStatus] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [draggedClipId, setDraggedClipId] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState("");
  const [loadedProjectId, setLoadedProjectId] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState("Saved");
  const creatingSourceKeyRef = useRef("");
  const lastSavedSnapshotRef = useRef("");

  const visualOutputs = useMemo(
    () =>
      [
        ...creativeAssetOutputsFromAssets(creativeAssets ?? []),
        ...createOutputsFromArtifacts(artifacts ?? []),
      ]
        .filter((output) => isVideoOutput(output) || isImageOutput(output))
        .sort((first, second) => second.createdAt - first.createdAt),
    [artifacts, creativeAssets]
  );
  const selectedText = textOverlays.find((overlay) => overlay.id === selectedTextId);
  const selectedClip = clips.find((clip) => clip.id === selectedClipId);
  const selectedClipIndex = clips.findIndex((clip) => clip.id === selectedClipId);
  const selectedClipTrim = selectedClip ? normalizedClipTrim(selectedClip) : undefined;
  const durationSeconds = compositionTimelineDuration(clips, audioTracks);
  const dimensions = dimensionsForAspectRatio(aspectRatio);
  const loading = !artifacts || !creativeAssets;
  const projectsLoading = videoProjects === undefined;
  useVideoComposerMediaDurations({
    audioTracks,
    clips,
    setAudioTracks,
    setClips,
  });
  const { exportComposition } = useVideoComposerExportActions({
    activeWorkspaceId: activeWorkspaceId as Id<"workspaces"> | undefined,
    aspectRatio,
    audioTracks,
    autoRenderRequested,
    clips,
    completeStudioRenderRequest,
    createArtifact,
    currentProject,
    currentRenderRequest,
    dimensions,
    durationSeconds,
    isExporting,
    lastSavedSnapshotRef,
    loadedProjectId,
    projectId,
    renderRequestId,
    renderWorkerAvailability,
    requestStudioRender,
    setAutosaveStatus,
    setExportProgress,
    setIsExporting,
    setStatus,
    textOverlays,
    title,
    updateVideoProject,
    uploadMedia,
  });
  const incomingSource = useMemo(() => {
    const artifactId = searchParams.get("artifactId");
    const creativeAssetId = searchParams.get("creativeAssetId");
    const outputId = searchParams.get("outputId");
    const key = artifactId ? "artifactId" : creativeAssetId ? "creativeAssetId" : "outputId";
    const value = artifactId ?? creativeAssetId ?? outputId;
    return value ? { identity: `${key}:${value}`, key, value } : null;
  }, [searchParams]);

  const createProject = async (draft = createEmptyVideoCompositionDraft(), projectTitle = "Untitled video") => {
    setIsCreatingProject(true);
    try {
      const nextProjectId = await createVideoProject({
        workspaceId: activeWorkspaceId,
        title: projectTitle,
        draft,
      });
      navigate(`/studio?projectId=${encodeURIComponent(String(nextProjectId))}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create video project");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const deleteProject = async (projectToDeleteId: Id<"videoProjects">) => {
    setDeletingProjectId(projectToDeleteId);
    try {
      await archiveVideoProject({ id: projectToDeleteId });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete video project");
    } finally {
      setDeletingProjectId("");
    }
  };

  useEffect(() => {
    setPlayheadSeconds((current) => clampTimelineTime(clips, current));
    if (clips.length === 0) setIsPreviewPlaying(false);
  }, [clips]);

  useEffect(() => {
    if (projectId || loading || !incomingSource) return;
    if (creatingSourceKeyRef.current === incomingSource.identity) return;
    const output = visualOutputs.find((candidate) =>
      sourceParamMatches(candidate, incomingSource.key, incomingSource.value)
    );
    if (!output) return;
    creatingSourceKeyRef.current = incomingSource.identity;
    const clip = clipFromLibraryOutput(output);
    const draft: VideoCompositionDraft = {
      ...createEmptyVideoCompositionDraft(),
      clips: [clip],
    };
    void createProject(draft, `${output.title} edit`);
  }, [incomingSource, loading, projectId, visualOutputs]);

  useEffect(() => {
    if (!projectId) {
      setLoadedProjectId("");
      return;
    }
    if (currentProject === undefined) return;
    if (!currentProject) {
      navigate("/studio", { replace: true });
      return;
    }
    if (loadedProjectId === currentProject._id) return;

    const draft: VideoCompositionDraft = {
      ...createEmptyVideoCompositionDraft(),
      ...(currentProject.draft as Partial<VideoCompositionDraft> | undefined),
    };
    setAspectRatio(draft.aspectRatio);
    setAudioTracks(draft.audioTracks ?? []);
    setClips(draft.clips);
    setTextOverlays(draft.textOverlays);
    setTitle(currentProject.title);
    setSelectedClipId(draft.clips[0]?.id ?? "");
    setSelectedTextId(draft.textOverlays[0]?.id ?? "");
    setSelectedAssetId("");
    setPlayheadSeconds(0);
    setIsPreviewPlaying(false);
    setLoadedProjectId(currentProject._id);
    setAutosaveStatus("Saved");
    setStatus("");
    lastSavedSnapshotRef.current = JSON.stringify({
      title: currentProject.title,
      draft,
    });
    void touchVideoProject({ id: currentProject._id });
  }, [currentProject, loadedProjectId, navigate, projectId, touchVideoProject]);

  useEffect(() => {
    if (!projectId || loadedProjectId !== projectId || currentProject === undefined || !currentProject) return;
    const draft: VideoCompositionDraft = {
      aspectRatio,
      audioTracks,
      clips,
      textOverlays,
    };
    const snapshot = JSON.stringify({
      title,
      draft,
    });
    if (lastSavedSnapshotRef.current === snapshot) return;
    setAutosaveStatus("Saving...");
    const timeoutId = window.setTimeout(() => {
      void updateVideoProject({
        id: projectId,
        title,
        draft,
      })
        .then(() => {
          lastSavedSnapshotRef.current = snapshot;
          setAutosaveStatus(`Saved ${new Date().toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}`);
        })
        .catch((error) => {
          setAutosaveStatus("Autosave failed");
          setStatus(error instanceof Error ? error.message : "Autosave failed");
        });
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [
    aspectRatio,
    audioTracks,
    clips,
    currentProject,
    loadedProjectId,
    projectId,
    textOverlays,
    title,
    updateVideoProject,
  ]);

  useEffect(() => {
    if (!currentRenderRequest) return;
    const progressPercent = typeof currentRenderRequest.progress === "number"
      ? Math.round(Math.max(0, Math.min(1, currentRenderRequest.progress)) * 100)
      : undefined;
    if (currentRenderRequest.status === "queued") {
      setStatus(progressPercent !== undefined ? `Server render queued (${progressPercent}%)...` : "Server render queued...");
    } else if (currentRenderRequest.status === "rendering") {
      setStatus(progressPercent !== undefined
        ? `${currentRenderRequest.progressMessage ?? "Server render in progress"} (${progressPercent}%)...`
        : "Server render in progress...");
    } else if (currentRenderRequest.status === "completed") {
      setStatus("Server render complete. The finished video is saved in Library.");
    } else if (currentRenderRequest.status === "failed") {
      setStatus(currentRenderRequest.errorMessage ?? "Server render failed.");
    } else if (currentRenderRequest.status === "blocked") {
      setStatus("Server render worker is not configured. Browser export is available.");
    }
  }, [currentRenderRequest]);

  const addSelectedClip = () => {
    const output = visualOutputs.find((candidate) => candidate.id === selectedAssetId);
    if (!output) return;
    const clip = clipFromLibraryOutput(output);
    setClips((current) => [...current, clip]);
    setSelectedClipId(clip.id);
    setPlayheadSeconds(compositionDuration(clips));
    setSelectedAssetId("");
  };

  const reorderClipRelativeToTarget = (
    currentClips: VideoComposerClip[],
    clipId: string,
    targetClipId: string,
    placement: "before" | "after"
  ) => {
    if (clipId === targetClipId) return currentClips;
    const withoutDragged = currentClips.filter((clip) => clip.id !== clipId);
    const targetIndex = withoutDragged.findIndex((clip) => clip.id === targetClipId);
    if (targetIndex < 0) return currentClips;
    const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
    return [
      ...withoutDragged.slice(0, insertIndex),
      currentClips.find((clip) => clip.id === clipId)!,
      ...withoutDragged.slice(insertIndex),
    ];
  };

  const updateSelectedClip = (patch: Partial<VideoComposerClip>) => {
    if (!selectedClip) return;
    setClips((current) =>
      current.map((clip) =>
        clip.id === selectedClip.id
          ? {
              ...clip,
              ...patch,
            }
          : clip
      )
    );
  };

  const updateTextOverlay = (textId: string, patch: Partial<TimedTextOverlay>) => {
    const shouldFitHeight =
      !("height" in patch) &&
      ("fontSize" in patch ||
        "items" in patch ||
        "strokeWidth" in patch ||
        "text" in patch ||
        "width" in patch);
    setTextOverlays((current) =>
      current.map((overlay, index) => {
        if (overlay.id !== textId) return overlay;
        const next = { ...overlay, ...patch };
        return shouldFitHeight
          ? withAutoTextOverlayBlockHeight(next, dimensions, index) as TimedTextOverlay
          : next;
      })
    );
  };

  const updateSelectedText = (patch: Partial<TimedTextOverlay>) => {
    if (!selectedText?.id) return;
    updateTextOverlay(selectedText.id, patch);
  };

  const addTextOverlay = () => {
    const overlay = createTimedTextOverlay(textOverlays.length);
    setTextOverlays((current) => [...current, overlay]);
    setSelectedTextId(overlay.id ?? "");
  };

  if (!projectId) {
    if (incomingSource) {
      return (
        <section className="grid h-screen min-h-0 w-full place-items-center bg-[var(--color-page)] text-[var(--color-ink-muted)]">
          <LoadingSignal label="Creating video project" showLabel size="sm" />
        </section>
      );
    }
    return (
      <VideoStudioProjectHub
        activeWorkspaceName={activeWorkspace?.name}
        isCreating={isCreatingProject}
        isDeletingProjectId={deletingProjectId}
        loading={projectsLoading}
        notice={status}
        onCreateProject={() => void createProject()}
        onDeleteProject={(projectToDeleteId) => void deleteProject(projectToDeleteId)}
        onOpenProject={(projectToOpenId) =>
          navigate(`/studio?projectId=${encodeURIComponent(String(projectToOpenId))}`)
        }
        projects={videoProjects}
      />
    );
  }

  if (currentProject === undefined || loadedProjectId !== projectId) {
    return (
      <section className="grid h-screen min-h-0 w-full place-items-center bg-[var(--color-page)] text-[var(--color-ink-muted)]">
        <LoadingSignal label="Opening video project" showLabel size="sm" />
      </section>
    );
  }

  return (
    <section className="h-screen min-h-0 w-full overflow-hidden bg-[var(--color-page)] text-[var(--color-ink)]">
      <div className="grid h-full min-h-0 grid-rows-[2.75rem_minmax(0,1fr)_20rem]">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3">
          <div className="flex items-center gap-3 text-[0.78rem] font-[760] text-[var(--color-ink-muted)]">
            <button
              className="inline-flex min-h-8 items-center justify-center gap-2 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-page)] px-2 text-[0.76rem] font-[820] text-[var(--color-ink)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)]"
              onClick={() => navigate("/studio")}
              type="button"
            >
              <FolderOpen size={15} />
              Projects
            </button>
            <span className="font-[820] text-[var(--color-ink)]">Video Studio</span>
            <span>{activeWorkspace?.name ?? "Workspace"}</span>
            <span>{clips.length} visual{clips.length === 1 ? "" : "s"} · {formatTimelineTime(durationSeconds)}</span>
          </div>
          <input
            className="mx-auto h-8 w-full max-w-[24rem] rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-page)] px-3 text-center text-[0.82rem] font-[760] text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <div className="flex items-center gap-2">
            {status ? (
              <span className="max-w-[18rem] truncate text-[0.74rem] font-[700] text-[var(--color-ink-muted)]">
                {status}
              </span>
            ) : null}
            <span className="hidden text-[0.72rem] font-[760] text-[var(--color-ink-muted)] sm:inline">
              {autosaveStatus}
            </span>
            <button
              className="inline-flex min-h-8 items-center justify-center gap-2 rounded-[0.35rem] bg-[var(--color-primary)] px-3 text-[0.78rem] font-[820] text-[var(--color-surface)] shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isExporting || clips.length === 0}
              onClick={() => void exportComposition()}
              type="button"
            >
              {isExporting ? <LoadingSignal label="Exporting" size="sm" /> : <Upload size={15} />}
              {currentRenderRequest && currentRenderRequest.status !== "completed"
                ? "Complete Render"
                : "Export"}
            </button>
          </div>
        </header>

        {loading ? (
          <div className="grid place-items-center text-[0.86rem] font-[720] text-[var(--color-ink-muted)]">
            <LoadingSignal label="Loading media" showLabel size="sm" />
          </div>
        ) : (
          <div className="grid min-h-0 grid-cols-[20rem_minmax(0,1fr)_22rem] gap-1 bg-[var(--color-border)] p-1">
            <VideoComposerMediaPanel
              onAddSelectedClip={addSelectedClip}
              onAddTextOverlay={addTextOverlay}
              onSelectAsset={setSelectedAssetId}
              selectedAssetId={selectedAssetId}
              visualOutputs={visualOutputs}
            />

            <main className="grid min-h-0 grid-rows-[2.5rem_minmax(0,1fr)] overflow-hidden rounded-[0.4rem] bg-[var(--color-surface)]">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4">
                <h2 className="m-0 text-[0.9rem] font-[820] text-[var(--color-ink)]">Player</h2>
                <span className="text-[0.72rem] font-[760] text-[var(--color-ink-muted)]">
                  {formatTimelineTime(playheadSeconds, 2)} / {formatTimelineTime(durationSeconds, 2)}
                </span>
              </div>
              <div className="grid min-h-0 place-items-center p-3">
              <VideoComposerPreview
                audioTracks={audioTracks}
                aspectRatio={aspectRatio}
                clips={clips}
                isPlaying={isPreviewPlaying}
                onChangeText={(textId, patch) => updateTextOverlay(textId, patch as Partial<TimedTextOverlay>)}
                onPlayheadChange={setPlayheadSeconds}
                onPlayingChange={setIsPreviewPlaying}
                onSelectText={(textId) => {
                  setSelectedTextId(textId);
                  setSelectedClipId("");
                }}
                playheadSeconds={playheadSeconds}
                selectedTextId={selectedTextId}
                textOverlays={textOverlays}
              />
              </div>
            </main>

            <VideoComposerInspectorPanel
              aspectRatio={aspectRatio}
              clips={clips}
              durationSeconds={durationSeconds}
              onAddTextOverlay={addTextOverlay}
              onRemoveSelectedClip={() => {
                if (!selectedClip) return;
                setClips((current) => current.filter((clip) => clip.id !== selectedClip.id));
                setSelectedClipId(clips.find((clip) => clip.id !== selectedClip.id)?.id ?? "");
              }}
              onRemoveSelectedText={() => {
                if (!selectedText?.id) return;
                setTextOverlays((current) => current.filter((overlay) => overlay.id !== selectedText.id));
                setSelectedTextId(textOverlays.find((overlay) => overlay.id !== selectedText.id)?.id ?? "");
              }}
              onSelectText={setSelectedTextId}
              onSetAspectRatio={setAspectRatio}
              onSetPlayhead={setPlayheadSeconds}
              onUpdateSelectedClip={updateSelectedClip}
              onUpdateSelectedText={updateSelectedText}
              selectedClip={selectedClip}
              selectedClipIndex={selectedClipIndex}
              selectedClipTrim={selectedClipTrim}
              selectedText={selectedText}
              textOverlays={textOverlays}
            />
          </div>
        )}
        <footer className="grid min-h-0 grid-rows-[2.2rem_minmax(0,1fr)] border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3">
            <div className="flex items-center gap-2 text-[0.78rem] font-[760] text-[var(--color-ink-muted)]">
              <Film size={15} />
              <span>{formatTimelineTime(playheadSeconds, 2)}</span>
              <span>/</span>
              <span>{formatTimelineTime(durationSeconds, 2)}</span>
            </div>
            {isExporting ? (
              <div className="h-1.5 w-52 overflow-hidden rounded-full bg-[var(--color-page-quiet)]">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                  style={{ width: `${Math.round(exportProgress * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
          <div className="min-h-0 overflow-hidden p-3">
            <VideoComposerTimeline
              audioTracks={audioTracks}
              clips={clips}
              draggedClipId={draggedClipId}
              onDragEnd={() => setDraggedClipId("")}
              onDragOverClip={(targetClipId, placement) => {
                setClips((current) =>
                  reorderClipRelativeToTarget(current, draggedClipId, targetClipId, placement)
                );
              }}
              onDragStart={setDraggedClipId}
              onRemoveClip={(clipId) => {
                setClips((current) => current.filter((clip) => clip.id !== clipId));
                if (selectedClipId === clipId) {
                  const nextClip = clips.find((clip) => clip.id !== clipId);
                  setSelectedClipId(nextClip?.id ?? "");
                }
              }}
              onSeek={(timeSeconds) => {
                setIsPreviewPlaying(false);
                setPlayheadSeconds(timeSeconds);
              }}
              onSelectClip={(clipId) => {
                setSelectedClipId(clipId);
                setSelectedTextId("");
              }}
              onSelectText={(textId) => {
                setSelectedTextId(textId);
                setSelectedClipId("");
              }}
              onTrimClip={(clipId, patch) => {
                setClips((current) =>
                  current.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip))
                );
              }}
              onTrimText={(textId, patch) => updateTextOverlay(textId, patch)}
              playheadSeconds={playheadSeconds}
              selectedClipId={selectedClipId}
              selectedTextId={selectedTextId}
              textOverlays={textOverlays}
              totalDurationSeconds={durationSeconds}
            />
          </div>
        </footer>
      </div>
    </section>
  );
}
