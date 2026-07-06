import { useEffect, useRef, type MutableRefObject } from "react";
import { useNavigate } from "react-router-dom";
import type { Id } from "../../../convex/_generated/dataModel";
import { blobToDataUrl } from "../../lib/browser/dataUrl";
import type { CompositionAspectRatio } from "../../lib/composition/aspectRatios";
import { renderVideoCompositionToBlob } from "./renderVideoComposition";
import type {
  CompositionCaptions,
  TimedTextOverlay,
  VideoComposerAudioTrack,
  VideoComposerClip,
  VideoCompositionDraft,
} from "./videoComposerModel";

type UploadMediaAction = (args: {
  base64Data: string;
  filename: string;
}) => Promise<{
  byteLength?: number;
  mimeType?: string;
  storageUrl: string;
}>;

type CreateArtifactMutation = (args: {
  data: Record<string, unknown>;
  lifecycle: "saved";
  parentArtifactIds?: Id<"artifacts">[];
  reviewStatus: "approved";
  storageUrl: string;
  title: string;
  type: "video";
  workspaceId?: Id<"workspaces">;
}) => Promise<Id<"artifacts">>;

type CompleteRenderMutation = (args: {
  id: Id<"studioRenderRequests">;
  outputArtifactId: Id<"artifacts">;
  projectId: Id<"videoProjects">;
}) => Promise<unknown>;

type RequestRenderMutation = (args: {
  projectId: Id<"videoProjects">;
  renderSettings: { fps: number };
}) => Promise<{
  requestId?: Id<"studioRenderRequests">;
  status: "queued" | "blocked";
}>;

type UpdateProjectMutation = (args: {
  draft: VideoCompositionDraft;
  id: Id<"videoProjects">;
  title: string;
}) => Promise<unknown>;

export function useVideoComposerExportActions({
  activeWorkspaceId,
  aspectRatio,
  audioTracks,
  autoRenderRequested,
  captions,
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
}: {
  activeWorkspaceId?: Id<"workspaces">;
  aspectRatio: CompositionAspectRatio;
  audioTracks: VideoComposerAudioTrack[];
  autoRenderRequested: boolean;
  captions?: CompositionCaptions;
  clips: VideoComposerClip[];
  completeStudioRenderRequest: CompleteRenderMutation;
  createArtifact: CreateArtifactMutation;
  currentProject?: { _id: Id<"videoProjects"> } | null;
  currentRenderRequest?: {
    _id: Id<"studioRenderRequests">;
    status: string;
  } | null;
  dimensions: { height: number; width: number };
  durationSeconds: number;
  isExporting: boolean;
  lastSavedSnapshotRef: MutableRefObject<string>;
  loadedProjectId: string;
  projectId: Id<"videoProjects"> | null;
  renderRequestId: Id<"studioRenderRequests"> | null;
  renderWorkerAvailability?: { configured?: boolean } | null;
  requestStudioRender: RequestRenderMutation;
  setAutosaveStatus: (value: string) => void;
  setExportProgress: (value: number) => void;
  setIsExporting: (value: boolean) => void;
  setStatus: (value: string) => void;
  textOverlays: TimedTextOverlay[];
  title: string;
  updateVideoProject: UpdateProjectMutation;
  uploadMedia: UploadMediaAction;
}) {
  const navigate = useNavigate();
  const autoRenderKeyRef = useRef("");

  const currentDraft = (): VideoCompositionDraft => ({
    aspectRatio,
    audioTracks,
    clips,
    textOverlays,
    ...(captions ? { captions } : {}),
  });

  const exportCompositionInBrowser = async () => {
    if (clips.length === 0) return;
    setIsExporting(true);
    setStatus("Rendering edit in this browser...");
    setExportProgress(0);
    try {
      const draft = currentDraft();
      const blob = await renderVideoCompositionToBlob(draft, {
        onProgress: (progress) => setExportProgress(progress.progress),
      });
      setStatus("Uploading rendered video...");
      const stored = await uploadMedia({
        base64Data: await blobToDataUrl(blob),
        filename: `${title.trim() || "composed-video"}.webm`,
      });
      const artifactId = await createArtifact({
        workspaceId: activeWorkspaceId,
        parentArtifactIds: clips
          .map((clip) => clip.artifactId)
          .concat(audioTracks.map((track) => track.artifactId))
          .filter((artifactId): artifactId is Id<"artifacts"> => Boolean(artifactId)),
        type: "video",
        title: title.trim() || "Composed video",
        storageUrl: stored.storageUrl,
        lifecycle: "saved",
        reviewStatus: "approved",
        data: {
          source: "video_composer",
          mimeType: stored.mimeType,
          fileSize: stored.byteLength,
          aspectRatio,
          dimensions,
          durationSeconds,
          composition: draft,
          sourceCreativeAssetIds: clips
            .map((clip) => clip.creativeAssetId)
            .concat(audioTracks.map((track) => track.creativeAssetId))
            .filter(Boolean)
            .map(String),
        },
      });
      if (currentRenderRequest && currentRenderRequest.status !== "completed" && projectId) {
        await completeStudioRenderRequest({
          id: currentRenderRequest._id,
          projectId,
          outputArtifactId: artifactId,
        });
        setStatus(`Completed Create render request and saved video to Library (${String(artifactId).slice(-6)}).`);
      } else {
        setStatus(`Saved composed video to Library (${String(artifactId).slice(-6)}).`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to export video");
    } finally {
      setIsExporting(false);
    }
  };

  const exportComposition = async () => {
    if (clips.length === 0) return;
    const shouldUseBrowserFallback =
      !projectId ||
      renderWorkerAvailability?.configured === false ||
      Boolean(currentRenderRequest && currentRenderRequest.status !== "completed");

    if (shouldUseBrowserFallback) {
      await exportCompositionInBrowser();
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setStatus("Queuing server render...");
    try {
      const draft = currentDraft();
      await updateVideoProject({
        id: projectId,
        title,
        draft,
      });
      lastSavedSnapshotRef.current = JSON.stringify({ title, draft });
      setAutosaveStatus(`Saved ${new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`);
      const request = await requestStudioRender({
        projectId,
        renderSettings: { fps: 30 },
      });
      if (request.status === "queued" && request.requestId) {
        navigate(
          `/studio?projectId=${encodeURIComponent(String(projectId))}&renderRequestId=${encodeURIComponent(String(request.requestId))}`,
          { replace: true }
        );
        setStatus("Server render queued. The finished MP4 will appear in Library when it completes.");
        return;
      }
      setStatus("Server render worker is not configured; rendering in this browser...");
      await exportCompositionInBrowser();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to export video");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!autoRenderRequested || !projectId || !renderRequestId) return;
    if (!currentRenderRequest || currentRenderRequest.status === "completed") return;
    if (currentProject === undefined || !currentProject || loadedProjectId !== projectId) return;
    if (isExporting || clips.length === 0) return;

    const key = `${projectId}:${renderRequestId}:${clips.length}:${durationSeconds}`;
    if (autoRenderKeyRef.current === key) return;
    autoRenderKeyRef.current = key;
    setStatus("Auto-rendering Create request in this browser...");
    void exportCompositionInBrowser();
  }, [
    autoRenderRequested,
    clips.length,
    currentProject,
    currentRenderRequest,
    durationSeconds,
    isExporting,
    loadedProjectId,
    projectId,
    renderRequestId,
  ]);

  return {
    exportComposition,
  };
}
