import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  FileText,
  Image,
  Library,
  LoaderCircle,
  Music,
  Sparkles,
  Trash2,
  Video,
  Workflow,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Field, Page, Panel, Select, TextArea } from "../components/ui";
import {
  CreateGenerationConfigField,
  type CreateLocalFileFieldMeta,
} from "../components/create/CreateGenerationConfigField";
import type { SelectableLibraryAsset } from "../components/library/ReferenceAssetField";
import { WorkflowSelect } from "../components/workflow/WorkflowSelect";
import { fileToDataUrl } from "../lib/browser/dataUrl";
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
  CREATE_MODE_DEFINITIONS,
  getCreateModeDefinition,
  workflowNodeTypeForCreateMode,
  type CreateMode,
} from "../lib/create/createModes";
import { DEFAULT_PUBLISHING_PROVIDER } from "../lib/publishingRouting";
import { createStarterWorkflowGraph } from "../lib/workflow/workflowGraph";
import {
  localReferenceFilesFromConfig,
  type LocalReferenceFileKind,
} from "../lib/workflow/workflowConfigFields";
import { imageModelUiContractFromModel } from "../lib/workflow/workflowModelCatalog";
import {
  modelOptionSourcesForNode,
  richModelPickerOptions,
} from "../lib/workflow/workflowModelPickerOptions";
import type { BrandId } from "../types";

type CreateResult = {
  kind: CreateMode;
  status: "pending" | "review" | "saved" | "error";
  artifactIds?: Id<"artifacts">[];
  title: string;
  detail: string;
  model?: string;
  prompt?: string;
  url?: string;
};

const createModeIcons: Record<CreateMode, typeof Image> = {
  image: Image,
  video: Video,
  audio: Music,
  slideshow: FileText,
  workflow: Workflow,
};

function draftName(prompt: string) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!cleanPrompt) return "Untitled workflow";
  return cleanPrompt.length > 54 ? `${cleanPrompt.slice(0, 54)}...` : cleanPrompt;
}

function resultTitle(prompt: string, fallback: string) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!cleanPrompt) return fallback;
  return cleanPrompt.length > 48 ? `${cleanPrompt.slice(0, 48)}...` : cleanPrompt;
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberConfigValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function referenceAssetsFromConfig(
  config: Record<string, unknown>,
  key: string,
  kind: LocalReferenceFileKind
) {
  return localReferenceFilesFromConfig(config, key, kind).map((reference) => ({
    url: reference.storageUrl,
    mimeType: reference.mimeType ?? "application/octet-stream",
    description: reference.title,
  }));
}

function visibleConfigValues(
  config: Record<string, unknown>,
  fieldKeys: string[]
): Record<string, unknown> {
  const visibleKeys = new Set(fieldKeys);
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => visibleKeys.has(key))
  );
}

function mediaPreviewTitle(kind: CreateMode) {
  switch (kind) {
    case "image":
      return "Generating image";
    case "video":
      return "Generating video";
    case "audio":
      return "Generating audio";
    case "slideshow":
      return "Queueing slideshow";
    case "workflow":
      return "Creating workflow";
  }
}

function CreateResultPanel({
  isReviewActionPending,
  onReject,
  onSave,
  result,
}: {
  isReviewActionPending: boolean;
  onReject: (result: CreateResult) => void;
  onSave: (result: CreateResult) => void;
  result: CreateResult;
}) {
  const isPending = result.status === "pending";
  const isError = result.status === "error";
  const isReview = result.status === "review";
  const isSaved = result.status === "saved";

  return (
    <aside className="grid content-start rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-page-quiet)] p-[var(--space-4)]">
      <div className="entity-eyebrow">
        {isPending ? "Generating" : isError ? "Needs attention" : isSaved ? "Saved" : "Preview"}
      </div>
      <h3 className="m-0 mt-[var(--space-1)] text-[1.05rem] font-[780]">
        {result.title}
      </h3>
      <p className="muted">{result.detail}</p>

      {isPending ? (
        <div className="mt-[var(--space-3)] grid gap-[var(--space-3)]">
          {result.kind === "audio" ? (
            <div className="grid min-h-[7rem] place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-4)]">
              <div className="flex h-10 items-end gap-1" aria-hidden="true">
                {[18, 28, 14, 34, 22, 30, 16].map((height, index) => (
                  <span
                    className="w-2 animate-pulse rounded-full bg-[var(--color-primary)] opacity-70"
                    key={`${height}-${index}`}
                    style={{ height }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto grid aspect-[9/16] max-h-[26rem] w-full max-w-[16rem] place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-page)]">
              <LoaderCircle
                className="animate-spin text-[var(--color-primary)]"
                size={32}
              />
            </div>
          )}
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-3)] text-[0.78rem] text-[var(--color-ink-muted)]">
            <strong className="block text-[var(--color-ink)]">Creating preview</strong>
            {result.model ? <span>{result.model}</span> : null}
          </div>
        </div>
      ) : result.url ? (
        result.kind === "video" ? (
          <video
            className="mt-[var(--space-3)] w-full rounded-[var(--radius-sm)]"
            controls
            src={result.url}
          />
        ) : result.kind === "audio" ? (
          <audio className="mt-[var(--space-3)] w-full" controls src={result.url} />
        ) : (
          <img
            alt=""
            className="mt-[var(--space-3)] max-h-[22rem] w-full rounded-[var(--radius-sm)] object-cover"
            src={result.url}
          />
        )
      ) : null}

      {result.prompt && !isPending ? (
        <details className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-3)] text-[0.78rem] text-[var(--color-ink-muted)]">
          <summary className="cursor-pointer list-none font-[760] text-[var(--color-ink)] marker:hidden">
            Prompt used
          </summary>
          <p className="m-0 mt-[var(--space-2)] max-h-[9rem] overflow-auto leading-[1.45]">
            {result.prompt}
          </p>
        </details>
      ) : null}

      {isReview ? (
        <div className="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
          <button
            className="primary-button"
            disabled={isReviewActionPending}
            onClick={() => onSave(result)}
            type="button"
          >
            <Check size={16} />
            {isReviewActionPending ? "Saving..." : "Save"}
          </button>
          <button
            className="secondary-button text-[var(--color-danger)]"
            disabled={isReviewActionPending}
            onClick={() => onReject(result)}
            type="button"
          >
            <Trash2 size={16} />
            {isReviewActionPending ? "Rejecting..." : "Reject"}
          </button>
        </div>
      ) : null}

      {isSaved ? (
        <Link className="secondary-button mt-[var(--space-3)] w-fit" to="/library">
          <Library size={16} />
          Open library
        </Link>
      ) : null}
    </aside>
  );
}

export function CreatePage() {
  const navigate = useNavigate();
  const brands = useQuery(api.accounts.brands.list);
  const workflows = useQuery(api.workflows.definitions.list);
  const selectableLibraryAssets = useQuery(api.library.assets.listSelectable, {});
  const createWorkflow = useMutation(api.workflows.definitions.create);
  const createSlideshow = useMutation(api.content.requests.createSlideshow);
  const deleteArtifact = useMutation(api.artifacts.records.remove);
  const saveArtifactToLibrary = useMutation(api.artifacts.records.saveToLibrary);
  const uploadReference = useAction(api.storage.files.uploadBase64ImageWithMetadata);
  const generateImage = useAction(api.content.createAssets.generateImage);
  const generateVideo = useAction(api.content.createAssets.generateVideo);
  const generateAudio = useAction(api.content.createAssets.generateAudio);

  const [mode, setMode] = useState<CreateMode>("image");
  const modeDefinition = getCreateModeDefinition(mode);
  const modelCatalog = useQuery(
    api.providers.modelCatalog.list,
    modeDefinition.modelCategory
      ? { provider: "bulkapis", category: modeDefinition.modelCategory }
      : "skip"
  );
  const [brandId, setBrandId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState(modeDefinition.defaultModel ?? "");
  const [generationConfig, setGenerationConfig] = useState<Record<string, unknown>>(
    defaultCreateGenerationConfig("image")
  );
  const [slideshowMode, setSlideshowMode] = useState("background_plus_overlay");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [isReviewActionPending, setIsReviewActionPending] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  const selectedWorkflowBrandId = mode === "workflow" ? brandId : "";
  const recentDrafts = useMemo(
    () =>
      workflows
        ?.filter((workflow) => workflow.description?.startsWith("Prompt draft:"))
        .slice(0, 4) ?? [],
    [workflows]
  );
  const selectedModel = model || modeDefinition.defaultModel || "";
  const createNodeType = workflowNodeTypeForCreateMode(mode);
  const modelOptionSources = modelOptionSourcesForNode({
    nodeType: createNodeType,
    providerModels: modelCatalog,
  });
  const availableModels = richModelPickerOptions({
    modelOptions: modelOptionSources,
    nodeType: createNodeType,
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

  const handleModeChange = (nextMode: CreateMode) => {
    const nextDefinition = getCreateModeDefinition(nextMode);
    setMode(nextMode);
    setModel(nextDefinition.defaultModel ?? "");
    setGenerationConfig(defaultCreateGenerationConfig(nextMode));
    setPrompt("");
    setName("");
    setStatus("");
    setResult(null);
  };

  const handleGenerationConfigChange = (key: string, value: unknown) => {
    setGenerationConfig((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const localFileFieldMeta = (fieldKey: string): CreateLocalFileFieldMeta | null => {
    if (fieldKey === "localReferenceImages") {
      return {
        accept: "image/*",
        kind: "image",
        multiple: createNodeType === "image_generation"
          ? selectedImageModelUiContract?.images.multiple !== false
          : true,
        maxCount: createNodeType === "image_generation"
          ? selectedImageModelUiContract?.images.maxCount
          : undefined,
      };
    }

    if (fieldKey === "localStartFrameImages" || fieldKey === "localEndFrameImages") {
      return {
        accept: "image/*",
        kind: "image",
        multiple: false,
        maxCount: 1,
      };
    }

    if (fieldKey === "localReferenceVideos") {
      return {
        accept: "video/*",
        kind: "video",
        multiple: true,
      };
    }

    if (fieldKey === "localReferenceAudios") {
      return {
        accept: "audio/*",
        kind: "audio",
        multiple: true,
      };
    }

    return null;
  };

  const handleReferenceUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    configKey: string,
    kind: LocalReferenceFileKind,
    options: { multiple?: boolean; maxCount?: number } = {}
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    const existingFiles = localReferenceFilesFromConfig(generationConfig, configKey, kind);
    const remainingSlots = options.maxCount
      ? Math.max(0, options.maxCount - existingFiles.length)
      : options.multiple === false
        ? 1
        : files.length;
    const filesToUpload = files.slice(0, remainingSlots);

    if (!filesToUpload.length) {
      setStatus(
        options.maxCount
          ? `This field allows up to ${options.maxCount} file${options.maxCount === 1 ? "" : "s"}.`
          : "This field only allows one file."
      );
      return;
    }

    setIsUploadingReference(true);
    setStatus("Uploading references");
    try {
      const uploaded = await Promise.all(
        filesToUpload.map(async (file) => {
          const stored = await uploadReference({
            base64Data: await fileToDataUrl(file),
            filename: file.name,
          });
          return {
            id: String(stored.storageId),
            storageUrl: stored.storageUrl,
            mimeType: stored.mimeType,
            title: file.name,
            kind,
          };
        })
      );
      setGenerationConfig((current) => ({
        ...current,
        [configKey]: [
          ...(options.multiple === false
            ? []
            : localReferenceFilesFromConfig(current, configKey, kind)),
          ...uploaded,
        ],
      }));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Reference upload failed");
    } finally {
      setIsUploadingReference(false);
    }
  };

  const removeReferenceUpload = (
    configKey: string,
    fileId: string,
    kind: LocalReferenceFileKind
  ) => {
    setGenerationConfig((current) => ({
      ...current,
      [configKey]: localReferenceFilesFromConfig(current, configKey, kind).filter(
        (file) => file.id !== fileId
      ),
    }));
  };

  const handleLibraryReferenceSelect = (
    assets: SelectableLibraryAsset[],
    configKey: string,
    kind: LocalReferenceFileKind,
    options: { multiple?: boolean; maxCount?: number } = {}
  ) => {
    if (!assets.length) return;

    setGenerationConfig((current) => {
      const existingFiles = localReferenceFilesFromConfig(current, configKey, kind);
      const remainingSlots = options.maxCount
        ? Math.max(0, options.maxCount - existingFiles.length)
        : options.multiple === false
          ? 1
          : assets.length;
      const selectedAssets = assets.slice(0, remainingSlots);

      if (!selectedAssets.length) {
        setStatus(
          options.maxCount
            ? `This field allows up to ${options.maxCount} file${options.maxCount === 1 ? "" : "s"}.`
            : "This field only allows one file."
        );
        return current;
      }

      const selectedFiles = selectedAssets.map((asset) => ({
        id: asset.id,
        source: asset.source,
        sourceId: asset.sourceId,
        storageUrl: asset.storageUrl,
        title: asset.title,
        mimeType: asset.mimeType,
        kind: asset.mediaKind === "media" ? kind : asset.mediaKind,
      }));

      setStatus("");
      return {
        ...current,
        [configKey]: [
          ...(options.multiple === false
            ? []
            : localReferenceFilesFromConfig(current, configKey, kind)),
          ...selectedFiles,
        ],
      };
    });
  };

  const saveResultToLibrary = async (currentResult: CreateResult) => {
    const artifactIds = currentResult.artifactIds ?? [];
    if (!artifactIds.length || isReviewActionPending) return;

    setIsReviewActionPending(true);
    setStatus("");
    try {
      await Promise.all(
        artifactIds.map((artifactId) => saveArtifactToLibrary({ id: artifactId }))
      );
      setResult({
        ...currentResult,
        status: "saved",
        detail: `${artifactIds.length} ${currentResult.kind}${artifactIds.length === 1 ? "" : "s"} saved to the media library.`,
      });
      setStatus("Saved to library");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save preview");
    } finally {
      setIsReviewActionPending(false);
    }
  };

  const rejectResult = async (currentResult: CreateResult) => {
    const artifactIds = currentResult.artifactIds ?? [];
    if (!artifactIds.length || isReviewActionPending) return;

    setIsReviewActionPending(true);
    setStatus("");
    try {
      await Promise.all(
        artifactIds.map((artifactId) => deleteArtifact({ id: artifactId }))
      );
      setResult(null);
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
      const workflowBrandId = selectedWorkflowBrandId
        ? (selectedWorkflowBrandId as BrandId)
        : undefined;
      const referenceImages = referenceAssetsFromConfig(
        generationConfig,
        "localReferenceImages",
        "image"
      );
      const startFrameImages = referenceAssetsFromConfig(
        generationConfig,
        "localStartFrameImages",
        "image"
      );
      const endFrameImages = referenceAssetsFromConfig(
        generationConfig,
        "localEndFrameImages",
        "image"
      );
      const referenceVideos = referenceAssetsFromConfig(
        generationConfig,
        "localReferenceVideos",
        "video"
      );
      const voiceReferenceAudios = referenceAssetsFromConfig(
        generationConfig,
        "localReferenceAudios",
        "audio"
      );
      const visibleGenerationConfig = visibleConfigValues(
        generationConfig,
        generationFields.map((field) => field.key)
      );

      if (mode === "workflow") {
        const workflowId = await createWorkflow({
          brandId: workflowBrandId,
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

      if (mode === "slideshow") {
        const requestId = await createSlideshow({
          prompt: creativeRequest,
          requestedRenderingMode: slideshowMode as
            | "background_plus_overlay"
            | "full_graphic_generation",
        });
        setResult({
          kind: "slideshow",
          status: "saved",
          title: resultTitle(creativeRequest, "Slideshow queued"),
          detail: `Slideshow request queued. Request ID: ${requestId}`,
          prompt: creativeRequest,
        });
      }

      if (mode === "image") {
        const providerInput = providerInputFromCreateConfig(visibleGenerationConfig, [
          "prompt",
          "aspectRatio",
          "count",
          "localReferenceImages",
        ]);
        const generated = await generateImage({
          prompt: creativeRequest,
          provider: "bulkapis",
          model: selectedModel || undefined,
          aspectRatio: stringConfigValue(generationConfig.aspectRatio),
          count: numberConfigValue(generationConfig.count) ?? 1,
          providerInput,
          referenceImages,
        });
        setResult({
          kind: "image",
          status: "review",
          artifactIds: generated.artifactIds,
          title: generated.assets[0]?.title ?? resultTitle(creativeRequest, "Generated image"),
          detail: `${generated.assets.length} image${generated.assets.length === 1 ? "" : "s"} ready to review.`,
          model: selectedProviderModel?.displayName ?? selectedModel,
          prompt: creativeRequest,
          url: generated.assets[0]?.storageUrl,
        });
      }

      if (mode === "video") {
        const providerInput = providerInputFromCreateConfig(visibleGenerationConfig, [
          "prompt",
          "aspectRatio",
          "durationSeconds",
          "localReferenceImages",
          "localStartFrameImages",
          "localEndFrameImages",
          "localReferenceVideos",
          "startEndFrameMode",
        ]);
        const startFrameUrl = startFrameImages[0]?.url;
        const endFrameUrl = endFrameImages[0]?.url;
        if (generationConfig.startEndFrameMode === true && startFrameUrl) {
          providerInput.start_frame_url = startFrameUrl;
          providerInput.start_image_url = startFrameUrl;
          providerInput.first_frame_url = startFrameUrl;
        }
        if (generationConfig.startEndFrameMode === true && endFrameUrl) {
          providerInput.end_frame_url = endFrameUrl;
          providerInput.end_image_url = endFrameUrl;
          providerInput.last_frame_url = endFrameUrl;
          providerInput.tail_image_url = endFrameUrl;
        }
        const generated = await generateVideo({
          prompt: creativeRequest,
          provider: "bulkapis",
          model: selectedModel || undefined,
          aspectRatio: stringConfigValue(generationConfig.aspectRatio),
          durationSeconds: numberConfigValue(generationConfig.durationSeconds),
          providerInput,
          referenceImages: generationConfig.startEndFrameMode === true
            ? [...startFrameImages, ...endFrameImages]
            : referenceImages,
          referenceVideos,
        });
        setResult({
          kind: "video",
          status: "review",
          artifactIds: [generated.artifactId],
          title: generated.title,
          detail: "Video ready to review.",
          model: selectedProviderModel?.displayName ?? selectedModel,
          prompt: creativeRequest,
          url: generated.storageUrl,
        });
      }

      if (mode === "audio") {
        const providerInput = providerInputFromCreateConfig(visibleGenerationConfig, [
          "text",
          "prompt",
          "mode",
          "localReferenceAudios",
        ]);
        const generated = await generateAudio({
          text: creativeRequest,
          provider: "bulkapis",
          model: selectedModel || undefined,
          mode: stringConfigValue(generationConfig.mode),
          providerInput,
          voiceReferenceAudios,
        });
        setResult({
          kind: "audio",
          status: "review",
          artifactIds: [generated.artifactId],
          title: generated.title,
          detail: "Audio ready to review.",
          model: selectedProviderModel?.displayName ?? selectedModel,
          prompt: creativeRequest,
          url: generated.storageUrl,
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

  return (
    <Page
      title="Create"
      description="Generate assets directly, build slideshows, or start a reusable workflow."
    >
      <form className="panel grid gap-[var(--space-5)]" onSubmit={handleSubmit}>
        <div className="section-toolbar">
          <div>
            <h2>Create Studio</h2>
            <p className="muted">
              Make one-off assets now, then save or reuse them in workflows when they earn their keep.
            </p>
          </div>
          <Link className="secondary-button" to="/library">
            <Library size={16} />
            Library
          </Link>
        </div>

        <div className="flex flex-wrap gap-[var(--space-2)]">
          {CREATE_MODE_DEFINITIONS.map((definition) => {
            const Icon = createModeIcons[definition.id];
            const selected = definition.id === mode;
            return (
              <button
                className={selected ? "primary-button" : "secondary-button"}
                key={definition.id}
                onClick={() => handleModeChange(definition.id)}
                type="button"
              >
                <Icon size={16} />
                {definition.label}
              </button>
            );
          })}
        </div>

        <div
          className={
            result
              ? "grid min-w-0 gap-[var(--space-5)] xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]"
              : "grid min-w-0 gap-[var(--space-5)]"
          }
        >
          <section className="grid min-w-0 max-w-[68rem] content-start gap-[var(--space-5)]">
            {mode === "workflow" ? (
              <div className="grid min-w-0 gap-[var(--space-3)] lg:grid-cols-[minmax(12rem,18rem)_minmax(14rem,1fr)]">
                <Select label="Brand" value={selectedWorkflowBrandId} onChange={setBrandId}>
                  <option value="">No brand</option>
                  {brands?.map((brand) => (
                    <option key={brand._id} value={brand._id}>
                      {brand.name}
                    </option>
                  ))}
                </Select>
                <Field
                  label="Workflow name"
                  value={name}
                  onChange={setName}
                  placeholder="Untitled workflow"
                />
              </div>
            ) : null}

            {isCreateGenerationMode(mode) ? (
              <>
                {generationFieldGroups.promptFields.length ? (
                  <div className="grid min-w-0 gap-[var(--space-3)]">
                    {generationFieldGroups.promptFields.map((field) => (
                      <CreateGenerationConfigField
                        config={generationConfig}
                        field={field}
                        isUploadingReference={isUploadingReference}
                        key={field.key}
                        localFileFieldMeta={localFileFieldMeta}
                        libraryAssets={selectableLibraryAssets}
                        onConfigChange={handleGenerationConfigChange}
                        onLibraryReferenceSelect={handleLibraryReferenceSelect}
                        onLocalReferenceFileUpload={handleReferenceUpload}
                        onRemoveLocalReferenceFile={removeReferenceUpload}
                      />
                    ))}
                  </div>
                ) : null}

                <div className="grid min-w-0 gap-[var(--space-2)]">
                  <span className="text-[0.74rem] font-[780] text-[var(--color-ink-soft)]">Model</span>
                  <WorkflowSelect
                    disabled={!availableModels.length}
                    onChange={setModel}
                    options={availableModels}
                    placeholder={modelCatalog === undefined ? "Loading models" : "Select model"}
                    rich
                    value={selectedModel}
                  />
                </div>

                {generationFieldGroups.referenceFields.length ? (
                  <div className="grid min-w-0 gap-[var(--space-3)]">
                    <div className="border-t border-[var(--color-border)] pt-[var(--space-4)]">
                      <h3 className="m-0 text-[0.9rem] font-[800] text-[var(--color-ink)]">References</h3>
                    </div>
                    <div className="grid min-w-0 gap-[var(--space-3)] md:grid-cols-2">
                      {generationFieldGroups.referenceFields.map((field) => (
                        <CreateGenerationConfigField
                          className={
                            field.key === "startEndFrameMode"
                              ? "md:col-span-2"
                              : undefined
                          }
                          config={generationConfig}
                          field={field}
                          isUploadingReference={isUploadingReference}
                          key={field.key}
                          localFileFieldMeta={localFileFieldMeta}
                          libraryAssets={selectableLibraryAssets}
                          onConfigChange={handleGenerationConfigChange}
                          onLibraryReferenceSelect={handleLibraryReferenceSelect}
                          onLocalReferenceFileUpload={handleReferenceUpload}
                          onRemoveLocalReferenceFile={removeReferenceUpload}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {generationFieldGroups.coreFields.length ? (
                  <div className="grid min-w-0 gap-[var(--space-3)]">
                    <div className="border-t border-[var(--color-border)] pt-[var(--space-4)]">
                      <h3 className="m-0 text-[0.9rem] font-[800] text-[var(--color-ink)]">Settings</h3>
                    </div>
                    <div className="grid min-w-0 gap-[var(--space-3)] md:grid-cols-2 xl:grid-cols-3">
                      {generationFieldGroups.coreFields.map((field) => (
                        <CreateGenerationConfigField
                          config={generationConfig}
                          field={field}
                          isUploadingReference={isUploadingReference}
                          key={field.key}
                          localFileFieldMeta={localFileFieldMeta}
                          libraryAssets={selectableLibraryAssets}
                          onConfigChange={handleGenerationConfigChange}
                          onLibraryReferenceSelect={handleLibraryReferenceSelect}
                          onLocalReferenceFileUpload={handleReferenceUpload}
                          onRemoveLocalReferenceFile={removeReferenceUpload}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

              </>
            ) : (
              <TextArea
                label={modeDefinition.promptLabel}
                value={prompt}
                onChange={setPrompt}
                placeholder={modeDefinition.promptPlaceholder}
                rows={8}
              />
            )}

            {mode === "slideshow" ? (
              <div className="grid min-w-0 gap-[var(--space-3)] lg:grid-cols-[minmax(12rem,18rem)]">
                <Select label="Rendering" value={slideshowMode} onChange={setSlideshowMode}>
                  <option value="background_plus_overlay">Background + overlay</option>
                  <option value="full_graphic_generation">Full graphic slides</option>
                </Select>
              </div>
            ) : null}

            <button
              className="primary-button justify-self-start"
              disabled={!canSubmit || isSubmitting}
              type="submit"
            >
              <Sparkles size={16} />
              {isSubmitting
                ? "Creating..."
                : mode === "workflow"
                  ? "Create workflow draft"
                  : `Create ${mode}`}
              <ArrowRight size={16} />
            </button>
            {status && <p className="muted">{status}</p>}
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

      <Panel title="Recent Workflow Drafts">
        {recentDrafts.length === 0 ? (
          <div className="empty-state">No workflow drafts from Create yet.</div>
        ) : (
          <div className="entity-grid">
            {recentDrafts.map((workflow) => (
              <Link
                className="entity-card workflow-card-link"
                key={workflow._id}
                to={`/workflows/${workflow._id}`}
              >
                <div className="entity-eyebrow">{workflow.isActive ? "Active" : "Draft"}</div>
                <h3>{workflow.name}</h3>
                <p>{workflow.description}</p>
                <span>{workflow.isActive ? "Active" : "Draft"}</span>
                <span className="workflow-card-action">
                  <Workflow size={15} />
                  Open canvas
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </Page>
  );
}
