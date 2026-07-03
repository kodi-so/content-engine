import type { Id } from "../../../../convex/_generated/dataModel";
import type { AgentCreateArtifact } from "../model/agentCreateTypes";
import {
  isDirectArtifactId,
  studioArtifactUrl,
  studioProjectUrl,
  videoProjectIdFromStudioArtifact,
} from "../model/agentCreateSurfaceModel";

type ArtifactId = Id<"artifacts">;
type ThreadId = Id<"createThreads">;

export function useAgentCreateArtifactActions({
  activeThreadId,
  exportThreadOutputs,
  saveThreadOutputs,
  setStatusMessage,
}: {
  activeThreadId: ThreadId | null;
  exportThreadOutputs: (args: {
    artifactIds?: ArtifactId[];
    threadId: ThreadId;
  }) => Promise<{ exportUrls: Array<{ storageUrl?: string }> }>;
  saveThreadOutputs: (args: {
    artifactIds?: ArtifactId[];
    threadId: ThreadId;
  }) => Promise<unknown>;
  setStatusMessage: (message: string) => void;
}) {
  const openArtifact = (artifact: AgentCreateArtifact) => {
    if (!artifact.url) return;
    window.open(artifact.url, "_blank", "noopener,noreferrer");
  };

  const openArtifactInStudio = (artifact: AgentCreateArtifact) => {
    const projectId = videoProjectIdFromStudioArtifact(artifact);
    if (projectId) {
      window.open(studioProjectUrl(projectId), "_blank", "noopener,noreferrer");
      return;
    }
    if (isDirectArtifactId(artifact) && (artifact.kind === "image" || artifact.kind === "video")) {
      window.open(studioArtifactUrl(artifact.id as ArtifactId), "_blank", "noopener,noreferrer");
    }
  };

  const saveArtifactToLibrary = async (artifact: AgentCreateArtifact) => {
    if (!activeThreadId || !isDirectArtifactId(artifact)) return;

    setStatusMessage("");
    try {
      await saveThreadOutputs({
        threadId: activeThreadId,
        artifactIds: [artifact.id as ArtifactId],
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to save artifact");
    }
  };

  const exportArtifact = async (artifact: AgentCreateArtifact) => {
    if (!activeThreadId || !isDirectArtifactId(artifact)) {
      openArtifact(artifact);
      return;
    }

    setStatusMessage("");
    try {
      const result = await exportThreadOutputs({
        threadId: activeThreadId,
        artifactIds: [artifact.id as ArtifactId],
      });
      const exportUrl = result.exportUrls[0]?.storageUrl ?? artifact.url;
      if (exportUrl) window.open(exportUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to export artifact");
    }
  };

  return {
    exportArtifact,
    openArtifact,
    openArtifactInStudio,
    saveArtifactToLibrary,
  };
}
