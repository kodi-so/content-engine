import { useCallback, useState, type ChangeEvent } from "react";
import type { WorkflowCanvasNodeData, WorkflowFlowNode } from "../../lib/workflow/workflowCanvasGraph";
import {
  localReferenceFilesFromConfig,
  type LocalReferenceFileKind,
} from "../../lib/workflow/workflowConfigFields";
import type { ImageModelUiContract } from "../../lib/workflow/workflowModelCatalog";
import { fileToDataUrl } from "../../lib/browser/dataUrl";
import type { LocalFileFieldMeta } from "../../components/workflow/WorkflowConfigField";

type UploadReferenceImage = (args: {
  base64Data: string;
  filename: string;
}) => Promise<{
  mimeType?: string;
  storageId: unknown;
  storageUrl: string;
}>;

type UseWorkflowLocalReferenceFilesArgs = {
  onSaveStatusChange: (status: string) => void;
  selectedImageModelUiContract: ImageModelUiContract | null;
  selectedNode: WorkflowFlowNode | null;
  updateSelectedNodeData: (
    updater: (data: WorkflowCanvasNodeData) => Partial<WorkflowCanvasNodeData>
  ) => void;
  uploadReferenceImage: UploadReferenceImage;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unable to save workflow graph.";
}

export function useWorkflowLocalReferenceFiles({
  onSaveStatusChange,
  selectedImageModelUiContract,
  selectedNode,
  updateSelectedNodeData,
  uploadReferenceImage,
}: UseWorkflowLocalReferenceFilesArgs) {
  const [isUploadingImageReference, setIsUploadingImageReference] = useState(false);

  const handleLocalReferenceFileUpload = useCallback(
    async (
      event: ChangeEvent<HTMLInputElement>,
      configKey: string,
      kind: LocalReferenceFileKind,
      options: { multiple?: boolean; maxCount?: number } = {}
    ) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      event.target.value = "";

      if (!selectedFiles.length || !selectedNode) return;

      setIsUploadingImageReference(true);
      onSaveStatusChange("");

      try {
        const existingFiles = localReferenceFilesFromConfig(
          selectedNode.data.config,
          configKey,
          kind
        );
        const maxCount = options.maxCount;
        const remainingSlots = maxCount
          ? Math.max(0, maxCount - existingFiles.length)
          : options.multiple === false
            ? 1
            : selectedFiles.length;
        const files = selectedFiles.slice(0, remainingSlots);

        if (!files.length) {
          onSaveStatusChange(maxCount ? `This field allows up to ${maxCount} file${maxCount === 1 ? "" : "s"}.` : "This field only allows one file.");
          return;
        }

        const uploadedFiles = await Promise.all(
          files.map(async (file) => {
            const uploaded = await uploadReferenceImage({
              base64Data: await fileToDataUrl(file),
              filename: file.name,
            });

            return {
              id: String(uploaded.storageId),
              storageUrl: uploaded.storageUrl,
              title: file.name,
              mimeType: uploaded.mimeType,
              kind,
            };
          })
        );

        updateSelectedNodeData((data) => ({
          config: {
            ...data.config,
            [configKey]: [
              ...(options.multiple === false
                ? []
                : localReferenceFilesFromConfig(data.config, configKey, kind)),
              ...uploadedFiles,
            ],
          },
        }));
      } catch (error) {
        onSaveStatusChange(errorMessage(error));
      } finally {
        setIsUploadingImageReference(false);
      }
    },
    [
      onSaveStatusChange,
      selectedNode,
      updateSelectedNodeData,
      uploadReferenceImage,
    ]
  );

  const removeLocalReferenceFile = useCallback(
    (configKey: string, fileId: string, kind: LocalReferenceFileKind) => {
      updateSelectedNodeData((data) => ({
        config: {
          ...data.config,
          [configKey]: localReferenceFilesFromConfig(data.config, configKey, kind).filter(
            (file) => file.id !== fileId
          ),
        },
      }));
    },
    [updateSelectedNodeData]
  );

  const localFileFieldMeta = useCallback(
    (fieldKey: string): LocalFileFieldMeta | null => {
      if (!selectedNode) return null;

      if (fieldKey === "localReferenceImages") {
        return {
          accept: "image/*",
          disabled: selectedNode.data.config.imageFromInputNode === true,
          disabledCopy: "Using image data from a connected input node.",
          kind: "image",
          multiple: selectedNode.data.type === "image_generation"
            ? selectedImageModelUiContract?.images.multiple !== false
            : true,
          maxCount: selectedNode.data.type === "image_generation"
            ? selectedImageModelUiContract?.images.maxCount
            : undefined,
        };
      }

      if (fieldKey === "localReferenceVideos") {
        return {
          accept: "video/*",
          disabled: selectedNode.data.config.imageFromInputNode === true ||
            selectedNode.data.config.mediaFromInputNode === true,
          disabledCopy: "Using video/media data from a connected input node.",
          kind: "video",
          multiple: true,
        };
      }

      if (fieldKey === "localReferenceAudios") {
        return {
          accept: "audio/*",
          disabled: selectedNode.data.config.audioFromInputNode === true ||
            selectedNode.data.config.voiceFromInputNode === true,
          disabledCopy: "Using audio data from a connected input node.",
          kind: "audio",
          multiple: true,
        };
      }

      if (fieldKey === "uploadedMedia") {
        return {
          accept: "image/*,video/*,audio/*",
          disabled: selectedNode.data.config.mediaFromInputNode === true,
          disabledCopy: "Using media from a connected input node.",
          kind: "media",
          multiple: true,
        };
      }

      return null;
    },
    [selectedImageModelUiContract?.images.maxCount, selectedImageModelUiContract?.images.multiple, selectedNode]
  );

  return {
    handleLocalReferenceFileUpload,
    isUploadingImageReference,
    localFileFieldMeta,
    removeLocalReferenceFile,
  };
}
