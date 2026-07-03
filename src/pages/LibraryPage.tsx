import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MediaLightbox, type MediaLightboxItem } from "../components/MediaLightbox";
import { LoadingState, Page, Panel, Select } from "../components/ui";
import {
  AddMediaModal,
  ImageRevisionModal,
  TitleRenameModal,
} from "../features/library/LibraryModals";
import { LibraryOutputCard } from "../features/library/LibraryOutputCard";
import {
  LibraryFolderButton,
  LibraryRunRow,
} from "../features/library/LibraryWorkflowBrowser";
import { LibrarySlideshowCard } from "../features/library/LibrarySlideshowCard";
import {
  createOutputsFromArtifacts,
  creativeAssetOutputsFromAssets,
  groupLibraryOutputs,
  workflowOutputsFromArtifacts,
} from "../features/library/libraryOutputs";
import {
  assetKindFromFile,
  editableImageOutput,
  formatRunTime,
  generationAspectRatio,
  libraryImageEditPrompt,
  libraryImageReference,
  lightboxMediaForOutput,
  mediaTypeFromFile,
} from "../features/library/libraryMedia";
import type { CandidateImage, LibraryOutput } from "../features/library/libraryTypes";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { fileToDataUrl } from "../lib/browser/dataUrl";
import {
  AI_PROVIDER_LABELS,
  generationDefaultForMode,
} from "../lib/providers/aiGenerationDefaults";

export function LibraryPage() {
  const navigate = useNavigate();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const artifacts = useQuery(api.artifacts.records.list, {
    ...workspaceArgs,
    includeDebug: true,
  });
  const workflows = useQuery(api.workflows.definitions.list, workspaceArgs);
  const runs = useQuery(api.workflows.runs.list, workspaceArgs);
  const creativeAssets = useQuery(api.accounts.creativeAssets.list, workspaceArgs);
  const slideshows = useQuery(api.content.slideshows.list, workspaceArgs);
  const generateImage = useAction(api.content.createAssets.generateImage);
  const uploadMedia = useAction(api.storage.files.uploadBase64ImageWithMetadata);
  const createCreativeAsset = useMutation(api.accounts.creativeAssets.create);
  const updateCreativeAsset = useMutation(api.accounts.creativeAssets.update);
  const deleteCreativeAsset = useMutation(api.accounts.creativeAssets.remove);
  const deleteArtifact = useMutation(api.artifacts.records.remove);
  const deleteSlideshow = useMutation(api.content.slideshows.remove);
  const updateArtifactTitle = useMutation(api.artifacts.records.updateTitle);
  const approveImageReplacement = useMutation(api.artifacts.records.approveImageReplacement);
  const [libraryView, setLibraryView] = useState<"assets" | "workflows">("assets");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deletingArtifactId, setDeletingArtifactId] = useState<string | null>(null);
  const [deletingSlideshowId, setDeletingSlideshowId] = useState<string | null>(null);
  const [libraryStatus, setLibraryStatus] = useState("");
  const [renamingOutput, setRenamingOutput] = useState<LibraryOutput | null>(null);
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [isAddingMedia, setIsAddingMedia] = useState(false);
  const [addMediaStatus, setAddMediaStatus] = useState("");
  const [editingOutput, setEditingOutput] = useState<LibraryOutput | null>(null);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [candidateImage, setCandidateImage] = useState<CandidateImage | undefined>();
  const [revisionStatus, setRevisionStatus] = useState("");
  const [isGeneratingRevision, setIsGeneratingRevision] = useState(false);
  const [isApprovingRevision, setIsApprovingRevision] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<MediaLightboxItem | null>(null);
  const imageGenerationDefault = useMemo(
    () => generationDefaultForMode(activeWorkspace?.aiGenerationSettings, "image"),
    [activeWorkspace?.aiGenerationSettings]
  );

  useEffect(() => {
    if (!editingOutput) return;
    setRevisionPrompt(editingOutput.prompt ?? "");
    setCandidateImage(undefined);
    setRevisionStatus("");
  }, [editingOutput]);

  const workflowOutputs = useMemo(
    () => workflowOutputsFromArtifacts(artifacts ?? []),
    [artifacts]
  );
  const createOutputs = useMemo(
    () =>
      [
        ...creativeAssetOutputsFromAssets(creativeAssets ?? []),
        ...createOutputsFromArtifacts(artifacts ?? []),
      ].sort((first, second) => second.createdAt - first.createdAt),
    [artifacts, creativeAssets]
  );
  const savedSlideshows = useMemo(
    () =>
      (slideshows ?? [])
        .filter((slideshow) => slideshow.status === "saved")
        .sort((first, second) => second.updatedAt - first.updatedAt),
    [slideshows]
  );

  const filteredCreateOutputs = useMemo(
    () => createOutputs.filter((output) => {
      if (typeFilter && output.type !== typeFilter) return false;
      return true;
    }),
    [createOutputs, typeFilter]
  );
  const filteredSlideshows = useMemo(
    () => savedSlideshows.filter(() => {
      if (typeFilter && typeFilter !== "slideshow") return false;
      return true;
    }),
    [savedSlideshows, typeFilter]
  );

  const filteredWorkflowOutputs = useMemo(
    () => workflowOutputs.filter((output) => {
      if (typeFilter && output.type !== typeFilter) return false;
      return true;
    }),
    [typeFilter, workflowOutputs]
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
  const visibleOutputTypes = useMemo(
    () => Array.from(new Set([...outputTypes, "slideshow"])).sort(),
    [outputTypes]
  );
  const loading = !artifacts || !runs || !workflows || !creativeAssets || !slideshows;

  const clearSelection = () => {
    setSelectedWorkflowId(null);
    setSelectedRunId(null);
  };

  const removeSavedAsset = async (output: LibraryOutput) => {
    if (!output.artifactId && !output.creativeAssetId) return;
    const confirmed = window.confirm(`Delete "${output.title}" from the library?`);
    if (!confirmed) return;

    setDeletingArtifactId(String(output.artifactId ?? output.creativeAssetId));
    setLibraryStatus("");
    try {
      if (output.artifactId) {
        await deleteArtifact({ id: output.artifactId });
      } else if (output.creativeAssetId) {
        await deleteCreativeAsset({ id: output.creativeAssetId });
      }
      setLibraryStatus("Asset deleted");
    } catch (error) {
      setLibraryStatus(error instanceof Error ? error.message : "Unable to delete asset");
    } finally {
      setDeletingArtifactId(null);
    }
  };

  const removeSavedSlideshow = async (slideshowId: Id<"slideshows">, title: string) => {
    const confirmed = window.confirm(`Delete "${title}" from the library?`);
    if (!confirmed) return;

    setDeletingSlideshowId(String(slideshowId));
    setLibraryStatus("");
    try {
      await deleteSlideshow({ id: slideshowId });
      setLibraryStatus("Slideshow deleted");
    } catch (error) {
      setLibraryStatus(error instanceof Error ? error.message : "Unable to delete slideshow");
    } finally {
      setDeletingSlideshowId(null);
    }
  };

  const renameSavedAsset = async (output: LibraryOutput, title: string) => {
    if (!output.artifactId && !output.creativeAssetId) return;
    setLibraryStatus("");
    try {
      if (output.artifactId) {
        await updateArtifactTitle({ id: output.artifactId, title });
      } else if (output.creativeAssetId) {
        await updateCreativeAsset({ id: output.creativeAssetId, name: title });
      }
      setLibraryStatus("Title updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update title";
      setLibraryStatus(message);
      throw new Error(message);
    }
  };

  const addReusableMedia = async (args: {
    file: File;
    name: string;
  }) => {
    setIsAddingMedia(true);
    setAddMediaStatus("Uploading media...");
    setLibraryStatus("");
    try {
      const stored = await uploadMedia({
        base64Data: await fileToDataUrl(args.file),
        filename: args.file.name,
      });
      setAddMediaStatus("Saving media to library...");
      await createCreativeAsset({
        workspaceId: activeWorkspaceId as Id<"workspaces"> | undefined,
        name: args.name,
        assetKind: assetKindFromFile(args.file),
        mediaType: mediaTypeFromFile(args.file),
        storageUrl: stored.storageUrl,
        mimeType: stored.mimeType,
      });
      setAddMediaStatus("");
      setLibraryStatus("Media added to library");
      setLibraryView("assets");
      clearSelection();
      setIsAddMediaOpen(false);
    } catch (error) {
      setAddMediaStatus(error instanceof Error ? error.message : "Unable to add media");
    } finally {
      setIsAddingMedia(false);
    }
  };

  const discardCandidate = async () => {
    if (!candidateImage) return;
    const artifactId = candidateImage.artifactId;
    setCandidateImage(undefined);
    try {
      await deleteArtifact({ id: artifactId });
    } catch {
      // Best-effort cleanup. Preview candidates are hidden from the saved library either way.
    }
  };

  const closeRevisionModal = async () => {
    await discardCandidate();
    setEditingOutput(null);
    setRevisionStatus("");
  };

  const generateRevisionCandidate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingOutput?.artifactId || !revisionPrompt.trim()) return;

    await discardCandidate();
    setIsGeneratingRevision(true);
    setRevisionStatus("Generating a revised image...");
    try {
      const generated = await generateImage({
        workspaceId: activeWorkspaceId as Id<"workspaces"> | undefined,
        prompt: libraryImageEditPrompt(revisionPrompt),
        provider: imageGenerationDefault.provider,
        aspectRatio: generationAspectRatio(editingOutput),
        count: 1,
        referenceImages: [libraryImageReference(editingOutput)],
      });
      const asset = generated.assets[0];
      if (!asset) throw new Error("Image generation returned no candidate.");
      setCandidateImage({
        artifactId: asset.artifactId,
        storageUrl: asset.storageUrl,
        title: asset.title,
      });
      setRevisionStatus(
        `Candidate ready via ${AI_PROVIDER_LABELS[imageGenerationDefault.provider]}. Approve it to replace the saved image.`
      );
    } catch (error) {
      setRevisionStatus(
        error instanceof Error ? error.message : "Unable to generate revised image"
      );
    } finally {
      setIsGeneratingRevision(false);
    }
  };

  const approveRevisionCandidate = async () => {
    if (!editingOutput?.artifactId || !candidateImage) return;

    setIsApprovingRevision(true);
    setRevisionStatus("Replacing saved image...");
    try {
      await approveImageReplacement({
        originalArtifactId: editingOutput.artifactId,
        candidateArtifactId: candidateImage.artifactId,
      });
      setLibraryStatus("Saved image replaced");
      setEditingOutput(null);
      setCandidateImage(undefined);
      setRevisionStatus("");
    } catch (error) {
      setRevisionStatus(error instanceof Error ? error.message : "Unable to replace image");
    } finally {
      setIsApprovingRevision(false);
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
                      ? `${filteredCreateOutputs.length + filteredSlideshows.length} saved asset${filteredCreateOutputs.length + filteredSlideshows.length === 1 ? "" : "s"}`
                      : `${folders.length} workflow folder${folders.length === 1 ? "" : "s"} · ${filteredWorkflowOutputs.length} output${filteredWorkflowOutputs.length === 1 ? "" : "s"}`}
              </div>
            </div>
          </div>
          <div className="filter-grid">
            <Select label="Type" value={typeFilter} onChange={setTypeFilter}>
              <option value="">All output types</option>
              {visibleOutputTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
            <button
              className="secondary-button self-end"
              type="button"
              onClick={() => {
                setTypeFilter("");
                clearSelection();
              }}
            >
              Clear filters
            </button>
            {libraryView === "assets" && !selectedFolder && !selectedRun ? (
              <button
                className="primary-button self-end"
                type="button"
                onClick={() => {
                  setAddMediaStatus("");
                  setIsAddMediaOpen(true);
                }}
              >
                <Plus size={16} />
                Add media
              </button>
            ) : null}
          </div>
        </div>
        {libraryStatus ? (
          <p className="m-0 text-[0.86rem] text-[var(--color-ink-muted)]">{libraryStatus}</p>
        ) : null}

        {loading && (
          <LoadingState
            detail="Fetching saved assets, workflow exports, and run history."
            title="Loading library"
          />
        )}
        {!loading && libraryView === "assets" && filteredCreateOutputs.length === 0 && filteredSlideshows.length === 0 && (
          <div className="empty-state">
            {createOutputs.length === 0 && savedSlideshows.length === 0
              ? "No saved assets yet. Add reusable media or save a generated result here."
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

        {!loading && libraryView === "assets" && (filteredCreateOutputs.length > 0 || filteredSlideshows.length > 0) && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),16rem))] items-start justify-start gap-[var(--space-3)]">
            {filteredSlideshows.map((slideshow) => (
              <LibrarySlideshowCard
                isDeleting={deletingSlideshowId === String(slideshow._id)}
                key={slideshow._id}
                onDelete={() => void removeSavedSlideshow(slideshow._id, slideshow.title)}
                onOpen={() => navigate(`/slideshows/${slideshow._id}`)}
                slideshow={slideshow}
              />
            ))}
            {filteredCreateOutputs.map((output) => (
              <LibraryOutputCard
                isDeleting={
                  deletingArtifactId === String(output.artifactId ?? output.creativeAssetId)
                }
                key={output.id}
                onOpenMedia={(mediaOutput) => setLightboxMedia(lightboxMediaForOutput(mediaOutput))}
                onCompose={
                  output.mimeType?.startsWith("video/") || output.type === "video"
                    ? () => navigate(`/studio?${
                        output.artifactId
                          ? `artifactId=${encodeURIComponent(String(output.artifactId))}`
                          : output.creativeAssetId
                            ? `creativeAssetId=${encodeURIComponent(String(output.creativeAssetId))}`
                            : `outputId=${encodeURIComponent(output.id)}`
                      }`)
                    : undefined
                }
                onEdit={editableImageOutput(output) ? () => setEditingOutput(output) : undefined}
                onDelete={() => void removeSavedAsset(output)}
                onRename={
                  output.artifactId || output.creativeAssetId
                    ? () => setRenamingOutput(output)
                    : undefined
                }
                output={output}
              />
            ))}
          </div>
        )}

        {!loading && libraryView === "workflows" && !selectedFolder && folders.length > 0 && (
          <div className="artifact-grid">
            {folders.map((folder) => (
              <LibraryFolderButton
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
              <LibraryRunRow
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
              <LibraryOutputCard
                key={output.id}
                onOpenMedia={(mediaOutput) => setLightboxMedia(lightboxMediaForOutput(mediaOutput))}
                onCompose={
                  output.mimeType?.startsWith("video/") || output.type === "video"
                    ? () => navigate(`/studio?${
                        output.artifactId
                          ? `artifactId=${encodeURIComponent(String(output.artifactId))}`
                          : `outputId=${encodeURIComponent(output.id)}`
                      }`)
                    : undefined
                }
                onRename={
                  output.artifactId
                    ? () => setRenamingOutput(output)
                    : undefined
                }
                output={output}
              />
            ))}
          </div>
        )}
        <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />
        {renamingOutput ? (
          <TitleRenameModal
            onCancel={() => setRenamingOutput(null)}
            onSave={(nextTitle) => renameSavedAsset(renamingOutput, nextTitle)}
            output={renamingOutput}
          />
        ) : null}
        {editingOutput ? (
          <ImageRevisionModal
            candidate={candidateImage}
            isApproving={isApprovingRevision}
            isGenerating={isGeneratingRevision}
            onApprove={() => void approveRevisionCandidate()}
            onCancel={() => void closeRevisionModal()}
            onGenerate={(event) => void generateRevisionCandidate(event)}
            output={editingOutput}
            prompt={revisionPrompt}
            status={revisionStatus}
            setPrompt={setRevisionPrompt}
          />
        ) : null}
        {isAddMediaOpen ? (
          <AddMediaModal
            isSaving={isAddingMedia}
            onCancel={() => {
              if (isAddingMedia) return;
              setIsAddMediaOpen(false);
              setAddMediaStatus("");
            }}
            onSave={addReusableMedia}
            status={addMediaStatus}
          />
        ) : null}
      </Panel>
    </Page>
  );
}
