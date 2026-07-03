import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Field, LoadingSignal, Page, Select } from "../components/ui";
import type { RichMentionToken } from "../components/references/RichMentionTextarea";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { CreateGenerationFields } from "../features/create/CreateGenerationFields";
import { CreateModeTabs } from "../features/create/CreateModeTabs";
import { CreateResultPanel } from "../features/create/CreateResultPanel";
import { SlideshowEditor } from "../features/create/SlideshowEditor";
import {
  draftName,
  mediaPreviewTitle,
  numberConfigValue,
  referenceAssetsFromConfig,
  referenceMentionOptionsFromConfig,
  stringConfigValue,
  visibleConfigValues,
} from "../features/create/createPageHelpers";
import { resultFromRequest } from "../features/create/createRequestResult";
import type { CreateResult } from "../features/create/createPageTypes";
import { useCreateReferenceFiles } from "../features/create/useCreateReferenceFiles";
import {
  generationOperationForConfig,
  generationOperationsForNodeType,
  operationConfigPatch,
  type GenerationOperationId,
} from "../lib/generation/generationOperations";
import {
  createGenerationFields,
  createGenerationPromptValue,
  createGenerationRequiredFieldsSatisfied,
  defaultCreateGenerationConfig,
  groupCreateGenerationFields,
  isCreateGenerationMode,
  providerInputFromCreateConfig,
} from "../lib/create/createGenerationConfig";
import {
  getCreateModeDefinition,
  workflowNodeTypeForCreateMode,
  type CreateMode,
} from "../lib/create/createModes";
import { DEFAULT_PUBLISHING_PROVIDER } from "../lib/publishingRouting";
import {
  generationDefaultForMode,
  generationModeForCreateMode,
} from "../lib/providers/aiGenerationDefaults";
import { createStarterWorkflowGraph } from "../lib/workflow/workflowGraph";
import { imageModelUiContractFromModel } from "../lib/workflow/workflowModelCatalog";
import {
  modelOptionSourcesForNode,
  richModelPickerOptions,
} from "../lib/workflow/workflowModelPickerOptions";

export function CreateToolsPage() {
  const navigate = useNavigate();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const selectableLibraryAssets = useQuery(api.library.assets.listSelectable, workspaceArgs);
  const createWorkflow = useMutation(api.workflows.definitions.create);
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
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const modelCatalog = useQuery(
    api.providers.modelCatalog.list,
    modeDefinition.modelCategory
      ? { provider: selectedCreateProvider, category: modeDefinition.modelCategory }
      : "skip"
  );
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
  const createNodeType = workflowNodeTypeForCreateMode(mode) ?? "image_generation";
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
  const modelOptionSources = modelOptionSourcesForNode({
    nodeType: createNodeType,
    operationId: selectedGenerationOperation?.id,
    providerName: selectedCreateProvider,
    providerModels: modelCatalog,
  });
  const availableModels = richModelPickerOptions({
    modelOptions: modelOptionSources,
    nodeType: createNodeType,
    operationId: selectedGenerationOperation?.id,
    providerModels: modelCatalog,
    selectedModel,
  });
  const selectedProviderModel = useMemo(
    () => modelCatalog?.find((catalogModel) => catalogModel.modelId === selectedModel) ?? null,
    [modelCatalog, selectedModel]
  );
  const selectedImageModelUiContract = useMemo(
    () =>
      createNodeType === "image_generation"
        ? imageModelUiContractFromModel(selectedProviderModel)
        : null,
    [createNodeType, selectedProviderModel]
  );
  const generationFields = useMemo(
    () =>
      createNodeType && isCreateGenerationMode(mode)
        ? createGenerationFields({
            config: generationConfig,
            imageModelUiContract: selectedImageModelUiContract,
            nodeType: createNodeType,
            selectedModel: selectedProviderModel,
          })
        : [],
    [createNodeType, generationConfig, mode, selectedImageModelUiContract, selectedProviderModel]
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
  const canSubmit = isCreateGenerationMode(mode)
    ? Boolean(currentPrompt) &&
      createGenerationRequiredFieldsSatisfied({
          config: generationConfig,
          fields: generationFields,
        })
    : Boolean(currentPrompt);

  useEffect(() => {
    setModel("");
  }, [selectedCreateProvider, mode]);

  const handleModeChange = (nextMode: CreateMode) => {
    revokeDraftReferencesInConfig(generationConfig);
    setMode(nextMode);
    setModel("");
    setGenerationConfig(defaultCreateGenerationConfig(nextMode));
    setPrompt("");
    setName("");
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
    selectedImageModelUiContract,
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
      .filter((file) => file.alias)
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
      selectedModelLabel: selectedProviderModel?.displayName ?? selectedModel,
      slideshows: activeRequestSlideshows ?? [],
    });
    if (nextResult) setResult(nextResult);
  }, [
    activeRequest,
    activeRequestArtifacts,
    activeRequestId,
    activeRequestSlideshows,
    selectedModel,
    selectedProviderModel,
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
        model: selectedProviderModel?.displayName ?? selectedModel,
        prompt: creativeRequest,
      });
    } else {
      setResult(null);
    }
    setStatus(
      mode === "workflow"
        ? "Creating workflow draft"
        : mode === "slideshow"
          ? "Queueing slideshow"
          : `Generating ${mode}`
    );

    try {
      const submitGenerationConfig = isCreateGenerationMode(mode)
        ? (await uploadDraftReferencesForSubmit(generationConfig)).config
        : generationConfig;
      const referenceImages = referenceAssetsFromConfig(
        submitGenerationConfig,
        "localReferenceImages",
        "image"
      );
      const startFrameImages = referenceAssetsFromConfig(
        submitGenerationConfig,
        "localStartFrameImages",
        "image"
      );
      const endFrameImages = referenceAssetsFromConfig(
        submitGenerationConfig,
        "localEndFrameImages",
        "image"
      );
      const referenceVideos = referenceAssetsFromConfig(
        submitGenerationConfig,
        "localReferenceVideos",
        "video"
      );
      const voiceReferenceAudios = referenceAssetsFromConfig(
        submitGenerationConfig,
        "localReferenceAudios",
        "audio"
      );
      const generationOperationId = selectedGenerationOperation?.id;
      const imageReferenceImages =
        generationOperationId === "image_text_to_image" ? [] : referenceImages;
      const videoReferenceImages =
        generationOperationId === "video_start_end_frame"
          ? [...startFrameImages, ...endFrameImages]
          : generationOperationId === "video_image_to_video" ||
              generationOperationId === "video_reference_to_video"
            ? referenceImages
            : [];
      const videoReferenceVideos =
        generationOperationId === "video_reference_to_video" ? referenceVideos : [];
      const audioReferenceAudios =
        generationOperationId === "audio_voice_clone" ? voiceReferenceAudios : [];
      const visibleGenerationConfig = visibleConfigValues(
        submitGenerationConfig,
        generationFields.map((field) => field.key)
      );

      if (mode === "workflow") {
        const workflowId = await createWorkflow({
          ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
          name: name.trim() || draftName(creativeRequest),
          description: `Prompt draft: ${creativeRequest}`,
          trigger: "manual",
          approvalPolicy: { mode: "always" },
          publishingPolicy: {
            provider: DEFAULT_PUBLISHING_PROVIDER,
            autoPublish: false,
            defaultPlatforms: ["tiktok"],
          },
          graph: createStarterWorkflowGraph(),
        });
        navigate(`/workflows/${workflowId}`);
        return;
      }

      if (mode === "image" || mode === "video" || mode === "audio" || mode === "slideshow") {
        const providerInput = mode === "image"
          ? providerInputFromCreateConfig(visibleGenerationConfig, [
              "prompt",
              "aspectRatio",
              "count",
              "localReferenceImages",
              "generationOperation",
            ])
          : mode === "video"
            ? providerInputFromCreateConfig(visibleGenerationConfig, [
                "prompt",
                "aspectRatio",
                "durationSeconds",
                "localReferenceImages",
                "localStartFrameImages",
                "localEndFrameImages",
                "localReferenceVideos",
                "startEndFrameMode",
                "generationOperation",
              ])
            : mode === "audio"
              ? providerInputFromCreateConfig(visibleGenerationConfig, [
                  "text",
                  "prompt",
                  "mode",
                  "localReferenceAudios",
                  "generationOperation",
                ])
              : {};

        if (mode === "video") {
          const startFrameUrl = startFrameImages[0]?.url;
          const endFrameUrl = endFrameImages[0]?.url;
          if (submitGenerationConfig.startEndFrameMode === true && startFrameUrl) {
            providerInput.start_frame_url = startFrameUrl;
            providerInput.start_image_url = startFrameUrl;
            providerInput.first_frame_url = startFrameUrl;
          }
          if (submitGenerationConfig.startEndFrameMode === true && endFrameUrl) {
            providerInput.end_frame_url = endFrameUrl;
            providerInput.end_image_url = endFrameUrl;
            providerInput.last_frame_url = endFrameUrl;
            providerInput.tail_image_url = endFrameUrl;
          }
        }

        const requestId = await createGeneration({
          ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
          mode,
          prompt: creativeRequest,
          provider: mode === "slideshow"
            ? slideshowImageGenerationDefault.provider
            : selectedCreateProvider,
          model: mode === "slideshow" ? undefined : selectedModel || undefined,
          generationOperation: selectedGenerationOperation?.id,
          providerInput,
          aspectRatio: stringConfigValue(generationConfig.aspectRatio),
          count: numberConfigValue(generationConfig.count) ?? undefined,
          durationSeconds: numberConfigValue(generationConfig.durationSeconds),
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
          model: selectedProviderModel?.displayName ?? selectedModel,
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
          model: selectedProviderModel?.displayName ?? selectedModel,
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
              Make one-off assets now, then save or reuse them in workflows when they earn their keep.
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
            {mode === "workflow" ? (
              <div className="grid min-w-0 gap-[var(--space-3)] lg:grid-cols-[minmax(14rem,1fr)]">
                <Field
                  label="Workflow name"
                  value={name}
                  onChange={setName}
                  placeholder="Untitled workflow"
                />
              </div>
            ) : null}

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
              modelCatalogLoading={modelCatalog === undefined}
              nonGenerationPrompt={prompt}
              onConfigChange={handleGenerationConfigChange}
              onGenerationOperationChange={handleGenerationOperationChange}
              onLibraryReferenceSelect={handleLibraryReferenceSelect}
              onLocalReferenceFileUpload={handleReferenceUpload}
              onNonGenerationPromptChange={setPrompt}
              onPromptPasteReferenceFiles={handlePromptPasteReferenceFiles}
              onRemoveLocalReferenceFile={removeReferenceUpload}
              onSelectedModelChange={setModel}
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
                : mode === "workflow"
                  ? "Create workflow draft"
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
