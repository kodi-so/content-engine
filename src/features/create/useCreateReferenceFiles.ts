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
  id: string;
  kind: string;
  mimeType?: string;
  source?: string;
  sourceId?: string;
  storageUrl: string;
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
    const filesToUpload = files.slice(0, remainingSlots);

    if (!filesToUpload.length) {
      args.setStatus(
        options.maxCount
          ? `This field allows up to ${options.maxCount} file${options.maxCount === 1 ? "" : "s"}.`
            : "This field only allows one file."
      );
      return [];
    }

    args.setIsUploadingReference(true);
    args.setStatus("Uploading references");
    try {
      const uploaded = await Promise.all(
        filesToUpload.map(async (file) => {
          const stored = await args.uploadReference({
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
      let uploadedWithAliases: LocalReferenceFile[] = assignReferenceAliases(uploaded, kind);
      args.setGenerationConfig((current) => ({
        ...current,
        [configKey]: (() => {
          const nextFiles = assignReferenceAliases(
            [
              ...(options.multiple === false
                ? []
                : localReferenceFilesFromConfig(current, configKey, kind)),
              ...uploaded,
            ],
            kind
          );
          uploadedWithAliases = nextFiles.filter((file) =>
            uploaded.some((uploadedFile) => uploadedFile.id === file.id)
          );
          return nextFiles;
        })(),
      }));
      args.setStatus("");
      return uploadedWithAliases;
    } catch (error) {
      args.setStatus(error instanceof Error ? error.message : "Reference upload failed");
      return [];
    } finally {
      args.setIsUploadingReference(false);
    }
  };

  const removeReferenceUpload = (
    configKey: string,
    fileId: string,
    kind: LocalReferenceFileKind
  ) => {
    args.setGenerationConfig((current) => ({
      ...current,
      [configKey]: localReferenceFilesFromConfig(current, configKey, kind).filter(
        (file) => file.id !== fileId
      ),
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

  return {
    handleLibraryReferenceSelect,
    handleReferenceUpload,
    localFileFieldMeta,
    removeReferenceUpload,
    updateReferenceAlias,
  };
}
