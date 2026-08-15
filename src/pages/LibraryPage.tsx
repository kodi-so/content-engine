import { useAction, useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MediaLightbox } from "../components/MediaLightbox";
import { LoadingState, Page, Panel, Select } from "../components/ui";
import {
  AddMediaModal,
  ImageRevisionModal,
  TitleRenameModal,
} from "../features/library/LibraryModals";
import { LibraryOutputCard } from "../features/library/LibraryOutputCard";
import { LibrarySlideshowCard } from "../features/library/LibrarySlideshowCard";
import { visibleLibrarySlideshows } from "../features/library/librarySlideshows";
import {
  LibraryTextDraftModal,
  LibraryTextDraftRow,
} from "../features/library/LibraryTextDrafts";
import {
  createOutputsFromArtifacts,
  creativeAssetOutputsFromAssets,
  textDraftOutputsFromArtifacts,
} from "../features/library/libraryOutputs";
import {
  assetKindFromFile,
  editableImageOutput,
  generationAspectRatio,
  libraryImageEditPrompt,
  libraryImageReference,
  mediaTypeFromFile,
} from "../features/library/libraryMedia";
import type {
  CandidateImage,
  LibraryOutput,
  LibraryTextDraft,
} from "../features/library/libraryTypes";
import { useLibraryArtifactReview } from "../features/library/useLibraryArtifactReview";
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
  const [typeFilter, setTypeFilter] = useState("");
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

  const createOutputs = useMemo(
    () =>
      [
        ...creativeAssetOutputsFromAssets(creativeAssets ?? []),
        ...createOutputsFromArtifacts(artifacts ?? []),
      ].sort((first, second) => second.createdAt - first.createdAt),
    [artifacts, creativeAssets]
  );
  const textDrafts = useMemo(
    () => textDraftOutputsFromArtifacts(artifacts ?? []),
    [artifacts]
  );
  const librarySlideshows = useMemo(
    () => visibleLibrarySlideshows(slideshows ?? []),
    [slideshows]
  );

  const filteredCreateOutputs = useMemo(
    () => createOutputs.filter((output) => {
      if (typeFilter && output.type !== typeFilter) return false;
      return true;
    }),
    [createOutputs, typeFilter]
  );
  const filteredTextDrafts = useMemo(
    () => textDrafts.filter((draft) => !typeFilter || draft.type === typeFilter),
    [textDrafts, typeFilter]
  );
  const filteredSlideshows = useMemo(
    () => librarySlideshows.filter(() => {
      if (typeFilter && typeFilter !== "slideshow") return false;
      return true;
    }),
    [librarySlideshows, typeFilter]
  );

  const outputTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...createOutputs.map((output) => output.type),
          ...textDrafts.map((draft) => draft.type),
        ])
      ).sort(),
    [createOutputs, textDrafts]
  );
  const visibleOutputTypes = useMemo(
    () => Array.from(new Set([...outputTypes, "slideshow"])).sort(),
    [outputTypes]
  );
  const loading = !artifacts || !creativeAssets || !slideshows;
  const filteredItemCount =
    filteredTextDrafts.length + filteredCreateOutputs.length + filteredSlideshows.length;
  const libraryItemCount = textDrafts.length + createOutputs.length + librarySlideshows.length;
  const {
    closeArtifact,
    closeMedia,
    lightboxMedia,
    openArtifact,
    openMedia,
    requestedArtifactId,
    requestedTextDraft,
  } = useLibraryArtifactReview({ mediaOutputs: createOutputs, textDrafts });

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

  const removeTextDraft = async (draft: LibraryTextDraft) => {
    const confirmed = window.confirm(`Delete draft "${draft.title}" from the library?`);
    if (!confirmed) return;

    setDeletingArtifactId(String(draft.artifactId));
    setLibraryStatus("");
    try {
      await deleteArtifact({ id: draft.artifactId });
      if (requestedArtifactId === String(draft.artifactId)) closeArtifact();
      setLibraryStatus("Draft deleted");
    } catch (error) {
      setLibraryStatus(error instanceof Error ? error.message : "Unable to delete draft");
    } finally {
      setDeletingArtifactId(null);
    }
  };

  const removeSlideshow = async (slideshowId: Id<"slideshows">, title: string) => {
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
        storageId: stored.storageId,
        storageUrl: stored.storageUrl,
        mimeType: stored.mimeType,
      });
      setAddMediaStatus("");
      setLibraryStatus("Media added to library");
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

  return (
    <Page
      title="Library"
      description={`Generated drafts and media for ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <Panel title="Library items">
        <div className="section-toolbar">
          <div className="grid min-w-0 gap-[var(--space-3)]">
            <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
              <div className="min-w-0 text-[0.9rem] text-[var(--color-ink-muted)]">
                {`${filteredItemCount} item${filteredItemCount === 1 ? "" : "s"}`}
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
              }}
            >
              Clear filters
            </button>
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
          </div>
        </div>
        {libraryStatus ? (
          <p className="m-0 text-[0.86rem] text-[var(--color-ink-muted)]">{libraryStatus}</p>
        ) : null}

        {loading && (
          <LoadingState
            detail="Fetching generated drafts, media, and slideshows."
            title="Loading library"
          />
        )}
        {!loading && filteredItemCount === 0 && (
          <div className="empty-state">
            {libraryItemCount === 0
              ? "No library items yet. Generated drafts and media will appear here."
              : "No library items match these filters."}
          </div>
        )}

        {!loading && filteredItemCount > 0 ? (
          <div className="grid gap-[var(--space-5)]">
            {filteredTextDrafts.length > 0 ? (
              <section className="grid gap-[var(--space-2)]" aria-labelledby="library-drafts-heading">
                <div className="flex items-baseline justify-between gap-[var(--space-3)]">
                  <h2
                    className="m-0 text-[0.92rem] font-[780] text-[var(--color-ink)]"
                    id="library-drafts-heading"
                  >
                    Text drafts
                  </h2>
                  <span className="text-[0.76rem] text-[var(--color-ink-muted)]">
                    {filteredTextDrafts.length}
                  </span>
                </div>
                <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
                  {filteredTextDrafts.map((draft) => (
                    <LibraryTextDraftRow
                      draft={draft}
                      isDeleting={deletingArtifactId === String(draft.artifactId)}
                      key={draft.artifactId}
                      onDelete={() => void removeTextDraft(draft)}
                      onOpen={() => openArtifact(draft.artifactId)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {filteredCreateOutputs.length > 0 || filteredSlideshows.length > 0 ? (
              <section className="grid gap-[var(--space-2)]" aria-labelledby="library-media-heading">
                <h2
                  className="m-0 text-[0.92rem] font-[780] text-[var(--color-ink)]"
                  id="library-media-heading"
                >
                  Media and references
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),16rem))] items-start justify-start gap-[var(--space-3)]">
                  {filteredSlideshows.map((slideshow) => (
                    <LibrarySlideshowCard
                      isDeleting={deletingSlideshowId === String(slideshow._id)}
                      key={slideshow._id}
                      onDelete={() => void removeSlideshow(slideshow._id, slideshow.title)}
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
                      onOpenMedia={openMedia}
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
              </section>
            ) : null}
          </div>
        ) : null}
        <MediaLightbox media={lightboxMedia} onClose={closeMedia} />
        {requestedTextDraft ? (
          <LibraryTextDraftModal draft={requestedTextDraft} onClose={closeArtifact} />
        ) : null}
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
