import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LoadingSignal, Page, Select } from "../components/ui";
import type { RichMentionToken } from "../components/references/RichMentionTextarea";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { CreateGenerationFields } from "../features/create/CreateGenerationFields";
import { CreateModeTabs } from "../features/create/CreateModeTabs";
import { CreateResultPanel } from "../features/create/CreateResultPanel";
import { SlideshowEditor } from "../features/create/slideshow/SlideshowEditor";
import {
  mediaPreviewTitle,
  numberConfigValue,
  referenceMentionOptionsFromConfig,
  stringConfigValue,
  visibleConfigValues,
} from "../features/create/createPageHelpers";
import { resultFromRequest } from "../features/create/createRequestResult";
import type { CreateResult } from "../features/create/createPageTypes";
import {
  createGenerationReferenceInputs,
  providerInputForGenerationSubmit,
} from "../features/create/createSubmitPayload";
import { useCreateReferenceFiles } from "../features/create/useCreateReferenceFiles";
import {
  generationOperationForConfig,
  generationOperationsForNodeType,
  operationConfigPatch,
  type GenerationOperationId,
} from "../lib/generation/generationOperations";
import {
  durationForSelectedFalVideoModel,
} from "../lib/generation/videoDurationConstraints";
import {
  defaultRosterModelForMode,
  falModelIdForRosterModel,
  rosterModelById,
  rosterModelPricingDescription,
  rosterModelsForMode,
  type RosterModelMode,
} from "../lib/generation/modelRoster";
import {
  createGenerationFields,
  createGenerationPromptValue,
  createGenerationRequiredFieldsSatisfied,
  defaultCreateGenerationConfig,
  groupCreateGenerationFields,
  isCreateGenerationMode,
} from "../lib/create/createGenerationConfig";
import {
  getCreateModeDefinition,
  createNodeTypeForMode,
  type CreateMode,
} from "../lib/create/createModes";
import {
  generationDefaultForMode,
  generationModeForCreateMode,
} from "../lib/providers/aiGenerationDefaults";

export function CreateToolsPage() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const selectableLibraryAssets = useQuery(api.library.assets.listSelectable, workspaceArgs);
  const createGeneration = useMutation(api.content.requests.createGeneration);
  const saveContentRequest = useMutation(api.content.requests.save);
  const discardContentRequest = useMutation(api.content.requests.discard);
  const uploadReference = useAction(api.storage.files.uploadBase64ImageWithMetadata);

  const [mode, setMode] = useState<CreateMode>("image");
  const modeDefinition = getCreateModeDefinition(mode);
  const createGenerationMode = generationModeForCreateMode(mode);
  const createGenerationDefault = createGenerationMode
    ? generationDefaultForMode(activeWorkspace?.aiGenerationSettings, createGenerationMode)
    : null;
  const slideshowImageGenerationDefault = generationDefaultForMode(
    activeWorkspace?.aiGenerationSettings,
    "image"
  );
  const selectedCreateProvider = createGenerationDefault?.provider ?? "bulkapis";
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [generationConfig, setGenerationConfig] = useState<Record<string, unknown>>(
    defaultCreateGenerationConfig("image")
  );
  const [slideshowMode, setSlideshowMode] = useState("background_plus_overlay");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [isReviewActionPending, setIsReviewActionPending] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<Id<"contentRequests"> | null>(null);
  const activeRequest = useQuery(
    api.content.requests.get,
    activeRequestId ? { id: activeRequestId } : "skip"
  );
  const activeRequestArtifacts = useQuery(
    api.artifacts.records.list,
    activeRequestId ? { contentRequestId: activeRequestId, includeDebug: true } : "skip"
  );
  const activeRequestSlideshows = useQuery(
    api.content.slideshows.list,
    activeRequestId ? { contentRequestId: activeRequestId } : "skip"
  );

  const selectedModel = model;
  const createNodeType = createNodeTypeForMode(mode) ?? "image_generation";
  const rosterMode = isCreateGenerationMode(mode) ? mode as RosterModelMode : null;
  const selectedGenerationOperation = useMemo(
    () => generationOperationForConfig(createNodeType, generationConfig),
    [createNodeType, generationConfig]
  );
  const generationOperationOptions = useMemo(
    () =>
      generationOperationsForNodeType(createNodeType).map((operation) => ({
        value: operation.id,
        label: operation.label,
        description: operation.description,
      })),
    [createNodeType]
  );
  const availableModels = useMemo(
    () =>
      rosterMode
        ? rosterModelsForMode(rosterMode).map((rosterModel) => ({
            value: rosterModel.id,
            label: rosterModel.label,
            description: rosterModelPricingDescription(rosterModel),
            meta: rosterModel.strengths,
            recommendationTag: rosterModel.isDefault ? "Default" : undefined,
            tags: [
              rosterModel.falModelId,
              rosterModel.textToVideoModelId,
              rosterModel.imageToVideoModelId,
              rosterModel.referenceToVideoModelId,
              ...rosterModel.aliases,
            ].filter((value): value is string => Boolean(value)),
          }))
        : [],
    [rosterMode]
  );
  const selectedRosterModel = useMemo(
    () => rosterModelById(selectedModel) ?? null,
    [selectedModel]
  );
  const selectedModelLabel = selectedRosterModel?.label ?? selectedModel;
  const selectedGenerationProvider =
    selectedRosterModel?.falModelId ||
    selectedRosterModel?.textToVideoModelId ||
    selectedRosterModel?.imageToVideoModelId ||
    selectedRosterModel?.referenceToVideoModelId
      ? "fal"
      : selectedCreateProvider;
  const generationFields = useMemo(
    () =>
      isCreateGenerationMode(mode)
        ? createGenerationFields({
            config: generationConfig,
            mode,
            selectedModel: selectedRosterModel,
          })
        : [],
    [generationConfig, mode, selectedRosterModel]
  );
  const generationFieldGroups = useMemo(
    () => groupCreateGenerationFields(generationFields),
    [generationFields]
  );
  const referenceMentionOptions = useMemo(
    () => referenceMentionOptionsFromConfig(generationConfig),
    [generationConfig]
  );
  const currentPrompt = isCreateGenerationMode(mode)
    ? createGenerationPromptValue(mode, generationConfig)
    : prompt.trim();
  const generationModelSelected = !isCreateGenerationMode(mode) || Boolean(selectedModel);
  const canSubmit = isCreateGenerationMode(mode)
    ? Boolean(currentPrompt) &&
      generationModelSelected &&
      createGenerationRequiredFieldsSatisfied({
          config: generationConfig,
          fields: generationFields,
        })
    : Boolean(currentPrompt);

  useEffect(() => {
    if (!rosterMode) return;
    const configuredDefault = createGenerationDefault?.model
      ? rosterModelById(createGenerationDefault.model)
      : null;
    const fallback = configuredDefault?.mode === rosterMode
      ? configuredDefault
      : defaultRosterModelForMode(rosterMode);
    setModel((current) => {
      const currentRosterModel = rosterModelById(current);
      if (currentRosterModel?.mode === rosterMode) return current;
      return fallback?.id ?? "";
    });
  }, [createGenerationDefault?.model, rosterMode]);

  const handleModeChange = (nextMode: CreateMode) => {
    revokeDraftReferencesInConfig(generationConfig);
    setMode(nextMode);
    setModel("");
    setGenerationConfig(defaultCreateGenerationConfig(nextMode));
    setPrompt("");
    setStatus("");
    setResult(null);
    setActiveRequestId(null);
  };

  const handleGenerationConfigChange = (key: string, value: unknown) => {
    setGenerationConfig((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSelectedModelChange = (nextModel: string) => {
    setModel(nextModel);
    if (mode !== "video") return;
    const rosterModel = rosterModelById(nextModel);
    const falModelId = rosterModel ? falModelIdForRosterModel(rosterModel) ?? nextModel : nextModel;

    setGenerationConfig((current) => ({
      ...current,
      durationSeconds: durationForSelectedFalVideoModel(falModelId, current.durationSeconds),
    }));
  };

  const handleGenerationOperationChange = (operationId: string) => {
    const operation = operationId as GenerationOperationId;
    setGenerationConfig((current) => ({
      ...current,
      ...operationConfigPatch(operation),
    }));
    setModel("");
  };

  const {
    handleLibraryReferenceSelect,
    handleReferenceUpload,
    localFileFieldMeta,
    removeReferenceUpload,
    revokeDraftReferencesInConfig,
    updateReferenceAlias,
    uploadDraftReferencesForSubmit,
  } = useCreateReferenceFiles({
    createNodeType,
    generationConfig,
    setGenerationConfig,
    setIsUploadingReference,
    setStatus,
    uploadReference,
  });

  const handlePromptPasteReferenceFiles = async (files: File[]): Promise<RichMentionToken[]> => {
    const targetField = generationFieldGroups.referenceFields
      .map((field) => ({ field, meta: localFileFieldMeta(field.key) }))
      .find(({ meta }) =>
        meta &&
        files.some((file) =>
          meta.kind === "media" ||
            file.type.startsWith(`${meta.kind}/`)
        )
      );

    if (!targetField?.meta) {
      setStatus("This operation does not have a compatible reference field for pasted media.");
      return [];
    }

    const uploaded = await handleReferenceUpload(
      files,
      targetField.field.key,
      targetField.meta.kind,
      {
        multiple: targetField.meta.multiple,
        maxCount: targetField.meta.maxCount,
      }
    );

    return uploaded
      .filter((file): file is typeof file & { alias: string } => Boolean(file.alias))
      .map((file) => ({
        token: file.alias,
        asset: {
          id: file.id,
          title: file.title,
          storageUrl: file.storageUrl,
          thumbnailUrl: file.kind === "image" ? file.storageUrl : undefined,
          mimeType: file.mimeType,
          mediaKind: file.kind,
        },
        meta: [file.alias, file.kind].filter(Boolean).join(" · "),
      }));
  };

  useEffect(() => {
    if (!activeRequestId || activeRequest === undefined) return;
    if (activeRequest === null) {
      setResult(null);
      return;
    }
    const nextResult = resultFromRequest({
      artifacts: activeRequestArtifacts ?? [],
      request: activeRequest,
      selectedModelLabel: selectedModelLabel,
      slideshows: activeRequestSlideshows ?? [],
    });
    if (nextResult) setResult(nextResult);
  }, [
    activeRequest,
    activeRequestArtifacts,
    activeRequestId,
    activeRequestSlideshows,
    selectedModel,
    selectedModelLabel,
  ]);

  const saveResultToLibrary = async (currentResult: CreateResult) => {
    if (!currentResult.requestId || isReviewActionPending) return;

    setIsReviewActionPending(true);
    setStatus("");
    try {
      await saveContentRequest({ id: currentResult.requestId });
      setResult({
        ...currentResult,
        status: "saved",
        detail:
          currentResult.kind === "slideshow"
            ? "Slideshow saved to the library."
            : `${currentResult.artifactIds?.length ?? 0} ${currentResult.kind}${currentResult.artifactIds?.length === 1 ? "" : "s"} saved to the media library.`,
      });
      setStatus("Saved to library");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save preview");
    } finally {
      setIsReviewActionPending(false);
    }
  };

  const rejectResult = async (currentResult: CreateResult) => {
    if (!currentResult.requestId || isReviewActionPending) return;

    setIsReviewActionPending(true);
    setStatus("");
    try {
      await discardContentRequest({ id: currentResult.requestId });
      setResult(null);
      setActiveRequestId(null);
      setStatus("Preview rejected");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to reject preview");
    } finally {
      setIsReviewActionPending(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const creativeRequest = currentPrompt;
    if (!creativeRequest || isSubmitting) return;

    setIsSubmitting(true);
    if (isCreateGenerationMode(mode)) {
      setResult({
        kind: mode,
        status: "pending",
        title: mediaPreviewTitle(mode),
        detail: "Generating a preview. Save it if it looks right.",
        model: selectedModelLabel,
        prompt: creativeRequest,
      });
    } else {
      setResult(null);
    }
    setStatus(
      mode === "slideshow"
          ? "Queueing slideshow"
          : `Generating ${mode}`
    );

    try {
      const submitGenerationConfig = isCreateGenerationMode(mode)
        ? (await uploadDraftReferencesForSubmit(generationConfig)).config
        : generationConfig;
      const generationOperationId = selectedGenerationOperation?.id;
      const {
        audioReferenceAudios,
        imageReferenceImages,
        videoReferenceImages,
        videoReferenceVideos,
      } = createGenerationReferenceInputs(submitGenerationConfig, generationOperationId);
      const visibleGenerationConfig = visibleConfigValues(
        submitGenerationConfig,
        generationFields.map((field) => field.key)
      );

      if (mode === "image" || mode === "video" || mode === "audio" || mode === "slideshow") {
        const providerInput = providerInputForGenerationSubmit({
          generationOperationId,
          mode,
          submitGenerationConfig,
          visibleGenerationConfig,
        });

        const requestId = await createGeneration({
          ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
          mode,
          prompt: creativeRequest,
          provider: mode === "slideshow"
            ? slideshowImageGenerationDefault.provider
            : selectedGenerationProvider,
          model: mode === "slideshow" ? undefined : selectedModel || undefined,
          generationOperation: selectedGenerationOperation?.id,
          providerInput,
          aspectRatio: stringConfigValue(generationConfig.aspectRatio),
          count: numberConfigValue(generationConfig.count) ?? undefined,
          durationSeconds: numberConfigValue(generationConfig.durationSeconds),
          options:
            generationConfig.options &&
            typeof generationConfig.options === "object" &&
            !Array.isArray(generationConfig.options)
              ? generationConfig.options as Record<string, string | boolean>
              : undefined,
          audioMode: stringConfigValue(generationConfig.mode),
          referenceImages: mode === "image" ? imageReferenceImages : videoReferenceImages,
          referenceVideos: videoReferenceVideos,
          voiceReferenceAudios: audioReferenceAudios,
          requestedRenderingMode:
            mode === "slideshow"
              ? slideshowMode as "background_plus_overlay" | "full_graphic_generation"
              : undefined,
        });
        setActiveRequestId(requestId);
        setResult({
          kind: mode,
          status: "pending",
          requestId,
          title: mediaPreviewTitle(mode),
          detail: mode === "slideshow" ? "Planning the slideshow." : "Generating a preview.",
          model: selectedModelLabel,
          prompt: creativeRequest,
        });
      }

      if (!isCreateGenerationMode(mode)) {
        setPrompt("");
      }
      setStatus("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create request failed";
      setStatus(message);
      if (isCreateGenerationMode(mode)) {
        setResult({
          kind: mode,
          status: "error",
          title: "Generation failed",
          detail: message,
          model: selectedModelLabel,
          prompt: creativeRequest,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeSlideshow = activeRequestSlideshows?.[0];

  return (
    <Page
      title="Create"
      description={`Creation tools inside ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <form className="panel grid gap-[var(--space-5)]" onSubmit={handleSubmit}>
        <div className="section-toolbar">
          <div>
            <h2>Create Studio</h2>
            <p className="muted">
              Make one-off assets now, then save or reuse the best ones when they earn their keep.
            </p>
          </div>
        </div>

        <CreateModeTabs mode={mode} onModeChange={handleModeChange} />

        <div
          className={
            result
              ? "grid min-w-0 gap-[var(--space-5)] xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]"
              : "grid min-w-0 gap-[var(--space-5)]"
          }
        >
          <section className="grid min-w-0 max-w-[68rem] content-start gap-[var(--space-5)]">
            <CreateGenerationFields
              availableModels={availableModels}
              config={generationConfig}
              generationFieldGroups={generationFieldGroups}
              generationOperationOptions={generationOperationOptions}
              isUploadingReference={isUploadingReference}
              libraryAssets={selectableLibraryAssets}
              localFileFieldMeta={localFileFieldMeta}
              modePromptLabel={modeDefinition.promptLabel}
              modePromptPlaceholder={modeDefinition.promptPlaceholder}
              modelCatalogLoading={false}
              rosterModel={selectedRosterModel}
              nonGenerationPrompt={prompt}
              onConfigChange={handleGenerationConfigChange}
              onGenerationOperationChange={handleGenerationOperationChange}
              onLibraryReferenceSelect={handleLibraryReferenceSelect}
              onLocalReferenceFileUpload={handleReferenceUpload}
              onNonGenerationPromptChange={setPrompt}
              onPromptPasteReferenceFiles={handlePromptPasteReferenceFiles}
              onRemoveLocalReferenceFile={removeReferenceUpload}
              onSelectedModelChange={handleSelectedModelChange}
              onUpdateLocalReferenceAlias={updateReferenceAlias}
              referenceMentionOptions={referenceMentionOptions}
              selectedGenerationOperationId={selectedGenerationOperation?.id}
              selectedModel={selectedModel}
              showGenerationFields={isCreateGenerationMode(mode)}
            />

            {mode === "slideshow" ? (
              <div className="grid min-w-0 gap-[var(--space-3)] lg:grid-cols-[minmax(12rem,18rem)]">
                <Select label="Slideshow style" value={slideshowMode} onChange={setSlideshowMode}>
                  <option value="background_plus_overlay">Editable text</option>
                  <option value="full_graphic_generation">Designed slides</option>
                </Select>
              </div>
            ) : null}

            <button
              className="primary-button justify-self-start"
              disabled={!canSubmit || isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <LoadingSignal label="Creating" size="sm" />
              ) : (
                <Sparkles size={16} />
              )}
              {isSubmitting
                ? "Creating"
                : `Create ${mode}`}
              <ArrowRight size={16} />
            </button>
            {status && <p className="muted">{status}</p>}

            {activeSlideshow && activeRequest?.status === "ready" ? (
              <SlideshowEditor
                onDiscard={() => {
                  if (result) void rejectResult(result);
                }}
                onSave={() => {
                  if (result) void saveResultToLibrary(result);
                }}
                slideshow={activeSlideshow}
              />
            ) : null}
          </section>

          {result ? (
            <CreateResultPanel
              isReviewActionPending={isReviewActionPending}
              onReject={(currentResult) => {
                void rejectResult(currentResult);
              }}
              onSave={(currentResult) => {
                void saveResultToLibrary(currentResult);
              }}
              result={result}
            />
          ) : null}
        </div>
      </form>
    </Page>
  );
}
