import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { RichMentionToken } from "../../../components/references/RichMentionTextarea";
import { fileToDataUrl } from "../../../lib/browser/dataUrl";
import type { AgentCreateSelectedMention } from "../model/agentCreateTypes";
import {
  draftReferenceId,
  mediaTypeFromFile,
  revokeDraftMentionPreview,
  uniqueMentions,
} from "../model/agentCreateSurfaceModel";

type UploadedReference = {
  mimeType?: string;
  storageId: string;
  storageUrl: string;
};

type UploadReference = (args: {
  base64Data: string;
  filename: string;
}) => Promise<UploadedReference>;

export function useAgentCreateMentionDrafts({
  setStatusMessage,
  uploadReference,
}: {
  setStatusMessage: Dispatch<SetStateAction<string>>;
  uploadReference: UploadReference;
}) {
  const [prompt, setPrompt] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<AgentCreateSelectedMention[]>([]);

  const handleMentionSelect = useCallback((mention: AgentCreateSelectedMention) => {
    setSelectedMentions((current) => uniqueMentions([...current, mention]));
  }, []);

  const handlePastedReferenceFiles = useCallback((files: File[]): RichMentionToken[] => {
    const mediaFiles = files.filter((file) =>
      file.type.startsWith("image/") ||
        file.type.startsWith("video/") ||
        file.type.startsWith("audio/")
    );
    if (!mediaFiles.length) return [];

    const pastedMentions = mediaFiles.map((file, index) => {
      const mediaType = mediaTypeFromFile(file);
      const label = file.name || `Pasted ${mediaType}`;
      const token = `@pasted_${mediaType}_${Date.now()}_${index + 1}`;
      const previewUrl = URL.createObjectURL(file);

      return {
        token,
        label,
        entityType: "uploaded_reference" as const,
        entityId: draftReferenceId(),
        draftFile: file,
        draftPreviewUrl: previewUrl,
        mediaType,
        mimeType: file.type || undefined,
        previewUrl,
        sourceLabel: "Pasted reference",
        thumbnailUrl: mediaType === "image" ? previewUrl : undefined,
      };
    });

    setSelectedMentions((current) => uniqueMentions([...current, ...pastedMentions]));
    setStatusMessage("");

    return pastedMentions.map((mention) => ({
      token: mention.token,
      asset: {
        id: mention.entityId,
        title: mention.label,
        storageUrl: mention.previewUrl,
        thumbnailUrl: mention.thumbnailUrl,
        mimeType: mention.mimeType,
        mediaKind: mention.mediaType,
      },
      meta: [mention.token, mention.sourceLabel].filter(Boolean).join(" · "),
    }));
  }, [setStatusMessage]);

  const handlePromptChange = useCallback((nextPrompt: string) => {
    setPrompt(nextPrompt);
    setSelectedMentions((current) => {
      const nextMentions = current.filter((mention) => nextPrompt.includes(mention.token));
      current
        .filter((mention) => !nextMentions.includes(mention))
        .forEach(revokeDraftMentionPreview);
      return nextMentions;
    });
  }, []);

  const clearComposer = useCallback(() => {
    setPrompt("");
    setSelectedMentions((current) => {
      current.forEach(revokeDraftMentionPreview);
      return [];
    });
  }, []);

  const restoreComposer = useCallback((
    content: string,
    mentions: AgentCreateSelectedMention[]
  ) => {
    setPrompt(content);
    setSelectedMentions(mentions);
  }, []);

  const uploadDraftMentionsForSubmit = useCallback(async (
    mentions: AgentCreateSelectedMention[]
  ): Promise<AgentCreateSelectedMention[]> => {
    if (!mentions.some((mention) => mention.draftFile)) return mentions;

    setStatusMessage("Uploading pasted references");
    const uploadedMentions = await Promise.all(
      mentions.map(async (mention) => {
        if (!mention.draftFile) return mention;

        const uploaded = await uploadReference({
          base64Data: await fileToDataUrl(mention.draftFile),
          filename: mention.label,
        });
        const uploadedMention: AgentCreateSelectedMention = {
          ...mention,
          entityId: String(uploaded.storageId),
          draftFile: undefined,
          draftPreviewUrl: undefined,
          mimeType: uploaded.mimeType,
          previewUrl: uploaded.storageUrl,
          storageUrl: uploaded.storageUrl,
          thumbnailUrl: mention.mediaType === "image" ? uploaded.storageUrl : undefined,
        };
        return uploadedMention;
      })
    );
    mentions.forEach(revokeDraftMentionPreview);
    return uploadedMentions;
  }, [setStatusMessage, uploadReference]);

  return {
    clearComposer,
    handleMentionSelect,
    handlePastedReferenceFiles,
    handlePromptChange,
    prompt,
    restoreComposer,
    selectedMentions,
    setPrompt,
    setSelectedMentions,
    uploadDraftMentionsForSubmit,
  };
}
