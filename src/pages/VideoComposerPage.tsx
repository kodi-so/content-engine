import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Film,
  Plus,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CustomSelect } from "../components/CustomSelect";
import { LoadingSignal, LoadingState, Page, Panel, Select } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import {
  createOutputsFromArtifacts,
  creativeAssetOutputsFromAssets,
  workflowOutputsFromArtifacts,
} from "../features/library/libraryOutputs";
import { isVideoOutput } from "../features/library/libraryMedia";
import type { LibraryOutput } from "../features/library/libraryTypes";
import { renderVideoCompositionToBlob } from "../features/video-composer/renderVideoComposition";
import { VideoComposerPreview } from "../features/video-composer/VideoComposerPreview";
import {
  clipFromLibraryOutput,
  compositionDuration,
  createTimedTextOverlay,
  formatTimelineTime,
  moveItem,
  type TimedTextOverlay,
  type VideoComposerClip,
  type VideoCompositionDraft,
} from "../features/video-composer/videoComposerModel";
import {
  COMPOSITION_ASPECT_RATIO_OPTIONS,
  dimensionsForAspectRatio,
  type CompositionAspectRatio,
} from "../lib/composition/aspectRatios";
import {
  applyTextStylePreset,
  textStylePresetForBlock,
  withAutoTextOverlayBlockHeight,
  type TextStylePreset,
} from "../lib/composition/textOverlays";
import { blobToDataUrl } from "../lib/browser/dataUrl";

function videoDurationForUrl(url: string) {
  return new Promise<number>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => resolve(video.duration || 0);
    video.onerror = () => resolve(0);
    video.src = url;
  });
}

function SliderControl({
  label,
  max,
  min,
  onChange,
  suffix = "",
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix?: string;
  value: number;
}) {
  return (
    <label className="grid min-w-[8rem] flex-1 gap-1 text-[0.74rem] font-[760] text-[var(--color-ink-muted)]">
      <span className="flex items-center justify-between gap-2">
        {label}
        <strong className="font-[780] text-[var(--color-ink)]">
          {Math.round(value)}
          {suffix}
        </strong>
      </span>
      <input
        className="w-full accent-[var(--color-primary)]"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
    </label>
  );
}

function isCompositionAspectRatioValue(value: string): value is CompositionAspectRatio {
  return COMPOSITION_ASPECT_RATIO_OPTIONS.some((option) => option.value === value);
}

function sourceParamMatches(output: LibraryOutput, key: string | null, value: string | null) {
  if (!key || !value) return false;
  if (key === "artifactId") return String(output.artifactId ?? "") === value;
  if (key === "creativeAssetId") return String(output.creativeAssetId ?? "") === value;
  return output.id === value;
}

export function VideoComposerPage() {
  const [searchParams] = useSearchParams();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const artifacts = useQuery(api.artifacts.records.list, {
    ...workspaceArgs,
    includeDebug: true,
  });
  const creativeAssets = useQuery(api.accounts.creativeAssets.list, workspaceArgs);
  const uploadMedia = useAction(api.storage.files.uploadBase64ImageWithMetadata);
  const createArtifact = useMutation(api.artifacts.records.create);
  const [aspectRatio, setAspectRatio] = useState<CompositionAspectRatio>("9:16");
  const [clips, setClips] = useState<VideoComposerClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState("");
  const [textOverlays, setTextOverlays] = useState<TimedTextOverlay[]>([
    createTimedTextOverlay(0),
  ]);
  const [selectedTextId, setSelectedTextId] = useState(textOverlays[0]?.id ?? "");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [title, setTitle] = useState("Composed video");
  const [status, setStatus] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const videoOutputs = useMemo(
    () =>
      [
        ...creativeAssetOutputsFromAssets(creativeAssets ?? []),
        ...createOutputsFromArtifacts(artifacts ?? []),
        ...workflowOutputsFromArtifacts(artifacts ?? []),
      ]
        .filter(isVideoOutput)
        .sort((first, second) => second.createdAt - first.createdAt),
    [artifacts, creativeAssets]
  );
  const selectedText = textOverlays.find((overlay) => overlay.id === selectedTextId);
  const durationSeconds = compositionDuration(clips);
  const dimensions = dimensionsForAspectRatio(aspectRatio);
  const loading = !artifacts || !creativeAssets;

  useEffect(() => {
    const artifactId = searchParams.get("artifactId");
    const creativeAssetId = searchParams.get("creativeAssetId");
    const outputId = searchParams.get("outputId");
    const key = artifactId ? "artifactId" : creativeAssetId ? "creativeAssetId" : "outputId";
    const value = artifactId ?? creativeAssetId ?? outputId;
    const output = videoOutputs.find((candidate) => sourceParamMatches(candidate, key, value));
    if (!output || clips.some((clip) => clip.id === output.id)) return;
    const clip = clipFromLibraryOutput(output);
    setClips((current) => [...current, clip]);
    setSelectedClipId(clip.id);
  }, [clips, searchParams, videoOutputs]);

  useEffect(() => {
    const missingDurationClips = clips.filter((clip) => !clip.durationSeconds);
    if (!missingDurationClips.length) return;
    let canceled = false;
    for (const clip of missingDurationClips) {
      void videoDurationForUrl(clip.storageUrl).then((durationSeconds) => {
        if (canceled || !durationSeconds) return;
        setClips((current) =>
          current.map((currentClip) =>
            currentClip.id === clip.id
              ? {
                  ...currentClip,
                  durationSeconds,
                  trimEndSeconds: currentClip.trimEndSeconds ?? durationSeconds,
                }
              : currentClip
          )
        );
      });
    }
    return () => {
      canceled = true;
    };
  }, [clips]);

  const addSelectedClip = () => {
    const output = videoOutputs.find((candidate) => candidate.id === selectedAssetId);
    if (!output) return;
    const clip = clipFromLibraryOutput(output);
    setClips((current) => [...current, clip]);
    setSelectedClipId(clip.id);
    setSelectedAssetId("");
  };

  const updateSelectedText = (patch: Partial<TimedTextOverlay>) => {
    if (!selectedText) return;
    setTextOverlays((current) =>
      current.map((overlay, index) => {
        if (overlay.id !== selectedText.id) return overlay;
        const next = { ...overlay, ...patch };
        return withAutoTextOverlayBlockHeight(next, dimensions, index) as TimedTextOverlay;
      })
    );
  };

  const addTextOverlay = () => {
    const overlay = createTimedTextOverlay(textOverlays.length);
    setTextOverlays((current) => [...current, overlay]);
    setSelectedTextId(overlay.id ?? "");
  };

  const exportComposition = async () => {
    if (clips.length === 0) return;
    setIsExporting(true);
    setStatus("Rendering edit in this browser...");
    setExportProgress(0);
    try {
      const draft: VideoCompositionDraft = {
        aspectRatio,
        clips,
        textOverlays,
      };
      const blob = await renderVideoCompositionToBlob(draft, {
        onProgress: (progress) => setExportProgress(progress.progress),
      });
      setStatus("Uploading rendered video...");
      const stored = await uploadMedia({
        base64Data: await blobToDataUrl(blob),
        filename: `${title.trim() || "composed-video"}.webm`,
      });
      const artifactId = await createArtifact({
        workspaceId: activeWorkspaceId as Id<"workspaces"> | undefined,
        parentArtifactIds: clips
          .map((clip) => clip.artifactId)
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
            .filter(Boolean)
            .map(String),
        },
      });
      setStatus(`Saved composed video to Library (${String(artifactId).slice(-6)}).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to export video");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Page
      title="Video Studio"
      description={`Assemble saved clips into finished videos for ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <Panel title="Final assembly">
        {loading ? (
          <LoadingState title="Loading videos" detail="Fetching saved clips from the library." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid min-w-0 gap-4">
              <VideoComposerPreview
                aspectRatio={aspectRatio}
                clips={clips}
                selectedClipId={selectedClipId}
                textOverlays={textOverlays}
              />
              <div className="grid gap-3 border-t border-[var(--color-border)] pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-[0.82rem] font-[760] text-[var(--color-ink-muted)]">
                    <Film size={16} />
                    <span>
                      {clips.length} clip{clips.length === 1 ? "" : "s"} · {formatTimelineTime(durationSeconds)}
                    </span>
                  </div>
                  <button
                    className="secondary-button min-h-9 px-3 py-2 text-[0.8rem]"
                    onClick={addTextOverlay}
                    type="button"
                  >
                    <Type size={15} />
                    Text
                  </button>
                </div>
                <div className="grid gap-2">
                  {clips.length === 0 ? (
                    <div className="empty-state">Add videos from the library to create an edit.</div>
                  ) : (
                    clips.map((clip, index) => (
                      <div
                        className={[
                          "grid gap-2 rounded-[var(--radius-sm)] border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                          selectedClipId === clip.id
                            ? "border-[var(--color-primary)] bg-[var(--color-accent)]"
                            : "border-[var(--color-border)] bg-[var(--color-page)]",
                        ].join(" ")}
                        key={`${clip.id}-${index}`}
                      >
                        <button
                          className="min-w-0 bg-transparent p-0 text-left"
                          onClick={() => setSelectedClipId(clip.id)}
                          type="button"
                        >
                          <span className="block truncate text-[0.88rem] font-[780] text-[var(--color-ink)]">
                            {index + 1}. {clip.title}
                          </span>
                          <span className="text-[0.76rem] text-[var(--color-ink-muted)]">
                            {formatTimelineTime(clip.durationSeconds ?? 0)}
                          </span>
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            aria-label="Move clip up"
                            className="secondary-button size-8 justify-center p-0"
                            disabled={index === 0}
                            onClick={() => setClips((current) => moveItem(current, index, -1))}
                            type="button"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            aria-label="Move clip down"
                            className="secondary-button size-8 justify-center p-0"
                            disabled={index === clips.length - 1}
                            onClick={() => setClips((current) => moveItem(current, index, 1))}
                            type="button"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            aria-label="Remove clip"
                            className="secondary-button size-8 justify-center p-0 text-[var(--color-danger)]"
                            onClick={() =>
                              setClips((current) => current.filter((_, currentIndex) => currentIndex !== index))
                            }
                            type="button"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <aside className="grid content-start gap-4 border-t border-[var(--color-border)] pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
              <div className="grid gap-2">
                <label className="field">
                  <span>Title</span>
                  <input
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Composed video"
                    value={title}
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <CustomSelect
                    onChange={setSelectedAssetId}
                    options={videoOutputs.map((output) => ({
                      value: output.id,
                      label: output.title,
                      description: output.source.replace(/_/g, " "),
                      meta: output.type,
                    }))}
                    placeholder="Choose video"
                    rich
                    value={selectedAssetId}
                  />
                  <button
                    className="primary-button min-h-10"
                    disabled={!selectedAssetId}
                    onClick={addSelectedClip}
                    type="button"
                  >
                    <Plus size={16} />
                    Add clip
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <h3 className="m-0 text-[0.88rem] font-[820] text-[var(--color-ink)]">Format</h3>
                <div className="grid grid-cols-2 gap-2">
                  {COMPOSITION_ASPECT_RATIO_OPTIONS.map((option) => {
                    const selected = option.value === aspectRatio;
                    return (
                      <button
                        className={[
                          "grid min-h-14 gap-1 rounded-[var(--radius-sm)] border px-3 py-2 text-left transition",
                          selected
                            ? "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]"
                            : "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink)] hover:border-[var(--color-border-strong)]",
                        ].join(" ")}
                        key={option.value}
                        onClick={() => {
                          if (isCompositionAspectRatioValue(option.value)) setAspectRatio(option.value);
                        }}
                        type="button"
                      >
                        <span className="text-[0.86rem] font-[820]">{option.label}</span>
                        <span className="text-[0.68rem] font-[650] text-[var(--color-ink-muted)]">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="m-0 text-[0.88rem] font-[820] text-[var(--color-ink)]">Text overlay</h3>
                  <button
                    aria-label="Add text overlay"
                    className="secondary-button size-8 justify-center p-0"
                    onClick={addTextOverlay}
                    type="button"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                {textOverlays.length > 0 ? (
                  <CustomSelect
                    onChange={setSelectedTextId}
                    options={textOverlays.map((overlay, index) => ({
                      value: overlay.id ?? String(index),
                      label: overlay.text?.trim() || `Text ${index + 1}`,
                      meta: `${formatTimelineTime(overlay.startSeconds)} start`,
                    }))}
                    placeholder="Choose text"
                    value={selectedTextId}
                  />
                ) : null}
                {selectedText ? (
                  <div className="grid gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-3">
                    <label className="field">
                      <span>Copy</span>
                      <input
                        onChange={(event) => updateSelectedText({ text: event.target.value, items: [] })}
                        value={selectedText.text ?? ""}
                      />
                    </label>
                    <Select
                      label="Style"
                      onChange={(value) =>
                        updateSelectedText(
                          applyTextStylePreset(selectedText, value as TextStylePreset) as TimedTextOverlay
                        )
                      }
                      value={textStylePresetForBlock(selectedText)}
                    >
                      <option value="outline">Outline</option>
                      <option value="white">White text</option>
                      <option value="black">Black text</option>
                      <option value="yellow">Yellow text</option>
                      <option value="white_background">White background</option>
                      <option value="white_50_background">White 50% background</option>
                    </Select>
                    <div className="flex min-h-10 items-center gap-1 rounded-[0.75rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
                      <button
                        aria-label="Align left"
                        className="secondary-button size-8 justify-center p-0"
                        onClick={() => updateSelectedText({ align: "left" })}
                        type="button"
                      >
                        <AlignLeft size={15} />
                      </button>
                      <button
                        aria-label="Align center"
                        className="secondary-button size-8 justify-center p-0"
                        onClick={() => updateSelectedText({ align: "center" })}
                        type="button"
                      >
                        <AlignCenter size={15} />
                      </button>
                      <button
                        aria-label="Align right"
                        className="secondary-button size-8 justify-center p-0"
                        onClick={() => updateSelectedText({ align: "right" })}
                        type="button"
                      >
                        <AlignRight size={15} />
                      </button>
                      <button
                        aria-label="Delete text overlay"
                        className="secondary-button ml-auto size-8 justify-center p-0 text-[var(--color-danger)]"
                        onClick={() => {
                          setTextOverlays((current) => current.filter((overlay) => overlay.id !== selectedText.id));
                          setSelectedTextId(textOverlays.find((overlay) => overlay.id !== selectedText.id)?.id ?? "");
                        }}
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <SliderControl label="X" max={88} min={0} onChange={(x) => updateSelectedText({ x })} suffix="%" value={selectedText.x ?? 10} />
                      <SliderControl label="Y" max={92} min={0} onChange={(y) => updateSelectedText({ y })} suffix="%" value={selectedText.y ?? 42} />
                      <SliderControl label="Width" max={100} min={12} onChange={(width) => updateSelectedText({ width })} suffix="%" value={selectedText.width ?? 80} />
                      <SliderControl label="Size" max={150} min={20} onChange={(fontSize) => updateSelectedText({ fontSize })} suffix="px" value={selectedText.fontSize ?? 72} />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2 border-t border-[var(--color-border)] pt-3">
                <button
                  className="primary-button min-h-11"
                  disabled={isExporting || clips.length === 0}
                  onClick={() => void exportComposition()}
                  type="button"
                >
                  {isExporting ? <LoadingSignal label="Exporting" size="sm" /> : <Upload size={16} />}
                  Export WebM
                </button>
                {isExporting ? (
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-page)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                      style={{ width: `${Math.round(exportProgress * 100)}%` }}
                    />
                  </div>
                ) : null}
                {status ? (
                  <p className="m-0 text-[0.78rem] leading-snug text-[var(--color-ink-muted)]">
                    {status}
                  </p>
                ) : (
                  <p className="m-0 text-[0.78rem] leading-snug text-[var(--color-ink-muted)]">
                    Browser export is deterministic and local. MP4 server rendering can replace this later.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
      </Panel>
    </Page>
  );
}
