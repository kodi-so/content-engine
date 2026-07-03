import { useMemo } from "react";
import type { SelectableLibraryAsset } from "../assets/assetTypes";
import { fileToDataUrl } from "../../lib/browser/dataUrl";
import { assignReferenceAliases } from "../../lib/references/referenceAliases";
import {
  localReferenceFilesFromConfig,
  type LocalReferenceFileKind,
} from "../../lib/workflow/workflowConfigFields";
import type { ImageModelUiContract } from "../../lib/workflow/workflowModelCatalog";
import type { WorkflowNodeType } from "../../lib/workflow/workflowGraph";
import { createLocalFileFieldMeta } from "./createPageHelpers";

type LocalReferenceFile = {
  alias: string;
  file?: File;
  id: string;
  isDraft?: boolean;
  kind: string;
  mimeType?: string;
  previewUrl?: string;
  source?: string;
  sourceId?: string;
  storageId?: string;
  storageUrl: string;
  temporary?: boolean;
  title: string;
};

type UploadReference = (args: {
  base64Data: string;
  filename: string;
}) => Promise<{
  mimeType: string;
  storageId: unknown;
  storageUrl: string;
}>;

const DRAFT_REFERENCE_SOURCE = "draft_upload";

function createDraftReferenceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `draft:${crypto.randomUUID()}`;
  }

  return `draft:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function createDraftPreviewUrl(file: File) {
  return URL.createObjectURL(file);
}

function revokeDraftReference(file: { source?: string; storageUrl?: string; previewUrl?: string }) {
  if (file.source !== DRAFT_REFERENCE_SOURCE) return;
  const url = file.previewUrl ?? file.storageUrl;
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function useCreateReferenceFiles(args: {
  createNodeType: WorkflowNodeType;
  generationConfig: Record<string, unknown>;
  selectedImageModelUiContract: ImageModelUiContract | null;
  setGenerationConfig: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  setIsUploadingReference: (isUploading: boolean) => void;
  setStatus: (status: string) => void;
  uploadReference: UploadReference;
}) {
  const localFileFieldMeta = useMemo(
    () => (fieldKey: string) =>
      createLocalFileFieldMeta({
        createNodeType: args.createNodeType,
        fieldKey,
        selectedImageModelUiContract: args.selectedImageModelUiContract,
      }),
    [args.createNodeType, args.selectedImageModelUiContract]
  );

  const handleReferenceUpload = async (
    files: File[],
    configKey: string,
    kind: LocalReferenceFileKind,
    options: { multiple?: boolean; maxCount?: number } = {}
  ) => {
    if (!files.length) return [];

    const existingFiles = localReferenceFilesFromConfig(args.generationConfig, configKey, kind);
    const remainingSlots = options.maxCount
      ? Math.max(0, options.maxCount - existingFiles.length)
      : options.multiple === false
        ? 1
        : files.length;
    const filesToAdd = files.slice(0, remainingSlots);

    if (!filesToAdd.length) {
      args.setStatus(
        options.maxCount
          ? `This field allows up to ${options.maxCount} file${options.maxCount === 1 ? "" : "s"}.`
            : "This field only allows one file."
      );
      return [];
    }

    const draftFiles = filesToAdd.map((file) => {
      const previewUrl = createDraftPreviewUrl(file);
      return {
        id: createDraftReferenceId(),
        storageUrl: previewUrl,
        previewUrl,
        mimeType: file.type || undefined,
        title: file.name || `Pasted ${kind}`,
        kind,
        file,
        source: DRAFT_REFERENCE_SOURCE,
        isDraft: true,
      };
    });

    let draftFilesWithAliases: LocalReferenceFile[] = assignReferenceAliases(draftFiles, kind);
    args.setGenerationConfig((current) => ({
      ...current,
      [configKey]: (() => {
        const replacedFiles = options.multiple === false
          ? localReferenceFilesFromConfig(current, configKey, kind)
          : [];
        replacedFiles.forEach(revokeDraftReference);
        const nextFiles = assignReferenceAliases(
          [
            ...(options.multiple === false
              ? []
              : localReferenceFilesFromConfig(current, configKey, kind)),
            ...draftFiles,
          ],
          kind
        );
        draftFilesWithAliases = nextFiles.filter((file) =>
          draftFiles.some((draftFile) => draftFile.id === file.id)
        );
        return nextFiles;
      })(),
    }));
    args.setStatus("");
    return draftFilesWithAliases;
  };

  const removeReferenceUpload = (
    configKey: string,
    fileId: string,
    kind: LocalReferenceFileKind
  ) => {
    args.setGenerationConfig((current) => ({
      ...current,
      [configKey]: localReferenceFilesFromConfig(current, configKey, kind).filter((file) => {
        const shouldRemove = file.id === fileId;
        if (shouldRemove) revokeDraftReference(file);
        return !shouldRemove;
      }),
    }));
  };

  const updateReferenceAlias = (
    configKey: string,
    fileId: string,
    kind: LocalReferenceFileKind,
    alias: string
  ) => {
    args.setGenerationConfig((current) => ({
      ...current,
      [configKey]: assignReferenceAliases(
        localReferenceFilesFromConfig(current, configKey, kind).map((file) =>
          file.id === fileId ? { ...file, alias } : file
        ),
        kind
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

    args.setGenerationConfig((current) => {
      const existingFiles = localReferenceFilesFromConfig(current, configKey, kind);
      const remainingSlots = options.maxCount
        ? Math.max(0, options.maxCount - existingFiles.length)
        : options.multiple === false
          ? 1
          : assets.length;
      const selectedAssets = assets.slice(0, remainingSlots);

      if (!selectedAssets.length) {
        args.setStatus(
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

      args.setStatus("");
      return {
        ...current,
        [configKey]: assignReferenceAliases(
          [
            ...(options.multiple === false
              ? []
              : localReferenceFilesFromConfig(current, configKey, kind)),
            ...selectedFiles,
          ],
          kind
        ),
      };
    });
  };

  const uploadDraftReferencesForSubmit = async (config: Record<string, unknown>) => {
    const referenceFields: Array<{ key: string; kind: LocalReferenceFileKind }> = [
      { key: "localReferenceImages", kind: "image" },
      { key: "localStartFrameImages", kind: "image" },
      { key: "localEndFrameImages", kind: "image" },
      { key: "localReferenceVideos", kind: "video" },
      { key: "localReferenceAudios", kind: "audio" },
    ];
    const nextConfig: Record<string, unknown> = { ...config };
    const temporaryStorageUrls: string[] = [];
    const draftReferences = referenceFields.flatMap(({ key, kind }) =>
      localReferenceFilesFromConfig(config, key, kind)
        .filter((file) => file.source === DRAFT_REFERENCE_SOURCE && file.file)
        .map((file) => ({ key, kind, file }))
    );

    if (!draftReferences.length) {
      return { config: nextConfig, temporaryStorageUrls };
    }

    args.setIsUploadingReference(true);
    args.setStatus("Uploading temporary references");
    try {
      const uploadedById = new Map<string, LocalReferenceFile>();
      await Promise.all(
        draftReferences.map(async ({ file }) => {
          if (!file.file) return;
          const stored = await args.uploadReference({
            base64Data: await fileToDataUrl(file.file),
            filename: file.title,
          });
          const uploaded = {
            ...file,
            id: String(stored.storageId),
            storageId: String(stored.storageId),
            storageUrl: stored.storageUrl,
            previewUrl: stored.storageUrl,
            mimeType: stored.mimeType,
            file: undefined,
            isDraft: false,
            temporary: true,
          };
          temporaryStorageUrls.push(stored.storageUrl);
          uploadedById.set(file.id, uploaded);
        })
      );

      for (const { key, kind } of referenceFields) {
        const files = localReferenceFilesFromConfig(config, key, kind);
        if (!files.length) continue;
        nextConfig[key] = assignReferenceAliases(
          files.map((file) => uploadedById.get(file.id) ?? file),
          kind
        );
      }

      return { config: nextConfig, temporaryStorageUrls };
    } finally {
      args.setIsUploadingReference(false);
    }
  };

  const revokeDraftReferencesInConfig = (config: Record<string, unknown>) => {
    const referenceFields: Array<{ key: string; kind: LocalReferenceFileKind }> = [
      { key: "localReferenceImages", kind: "image" },
      { key: "localStartFrameImages", kind: "image" },
      { key: "localEndFrameImages", kind: "image" },
      { key: "localReferenceVideos", kind: "video" },
      { key: "localReferenceAudios", kind: "audio" },
    ];

    for (const { key, kind } of referenceFields) {
      localReferenceFilesFromConfig(config, key, kind).forEach(revokeDraftReference);
    }
  };

  return {
    handleLibraryReferenceSelect,
    handleReferenceUpload,
    localFileFieldMeta,
    removeReferenceUpload,
    revokeDraftReferencesInConfig,
    updateReferenceAlias,
    uploadDraftReferencesForSubmit,
  };
}
