import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MediaLightboxItem } from "../../components/MediaLightbox";
import { isImageOutput, isVideoOutput, lightboxMediaForOutput } from "./libraryMedia";
import type { LibraryOutput, LibraryTextDraft } from "./libraryTypes";

export function useLibraryArtifactReview({
  mediaOutputs,
  textDrafts,
}: {
  mediaOutputs: LibraryOutput[];
  textDrafts: LibraryTextDraft[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lightboxMedia, setLightboxMedia] = useState<MediaLightboxItem | null>(null);
  const requestedArtifactId = searchParams.get("artifactId");
  const requestedTextDraft = useMemo(
    () => textDrafts.find((draft) => String(draft.artifactId) === requestedArtifactId),
    [requestedArtifactId, textDrafts]
  );
  const requestedMediaOutput = useMemo(
    () => mediaOutputs.find((output) => String(output.artifactId) === requestedArtifactId),
    [mediaOutputs, requestedArtifactId]
  );

  const openArtifact = (artifactId: Id<"artifacts">) => {
    const next = new URLSearchParams(searchParams);
    next.set("artifactId", String(artifactId));
    setSearchParams(next);
  };

  const closeArtifact = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("artifactId");
    setSearchParams(next, { replace: true });
    setLightboxMedia(null);
  };

  const openMedia = (output: LibraryOutput) => {
    setLightboxMedia(lightboxMediaForOutput(output));
    if (output.artifactId) openArtifact(output.artifactId);
  };

  useEffect(() => {
    if (
      !requestedMediaOutput ||
      requestedTextDraft ||
      (!isImageOutput(requestedMediaOutput) && !isVideoOutput(requestedMediaOutput))
    ) {
      return;
    }
    setLightboxMedia(lightboxMediaForOutput(requestedMediaOutput));
  }, [requestedMediaOutput, requestedTextDraft]);

  return {
    closeArtifact,
    closeMedia: requestedArtifactId ? closeArtifact : () => setLightboxMedia(null),
    lightboxMedia,
    openArtifact,
    openMedia,
    requestedArtifactId,
    requestedTextDraft,
  };
}
