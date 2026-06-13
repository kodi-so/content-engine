import type { ArtifactDoc, ContentRequestDoc, SlideshowDoc } from "../../types";
import { mediaPreviewTitle, resultTitle } from "./createPageHelpers";
import type { CreateResult } from "./createPageTypes";
import type { CreateMode } from "../../lib/create/createModes";

function recordData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function requestMode(request?: ContentRequestDoc | null): CreateMode | null {
  if (!request) return null;
  const generation = recordData(
    (request as ContentRequestDoc & { generation?: unknown }).generation
  );
  const mode = generation.mode;
  if (mode === "image" || mode === "video" || mode === "audio" || mode === "slideshow") {
    return mode;
  }
  if (request.contentFormat === "slideshow") return "slideshow";
  return null;
}

function artifactMimeType(artifact?: ArtifactDoc) {
  const data = recordData(artifact?.data);
  return typeof data.mimeType === "string" ? data.mimeType : undefined;
}

function artifactPreviewKind(artifact?: ArtifactDoc): CreateMode | null {
  const mimeType = artifactMimeType(artifact);
  if (artifact?.type === "video" || mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (artifact?.type === "image" || mimeType?.startsWith("image/")) return "image";
  return null;
}

export function resultFromRequest(args: {
  artifacts?: ArtifactDoc[];
  request?: ContentRequestDoc | null;
  selectedModelLabel?: string;
  slideshows?: SlideshowDoc[];
}): CreateResult | null {
  const { artifacts = [], request, selectedModelLabel, slideshows = [] } = args;
  if (!request) return null;
  const mode = requestMode(request) ?? "image";
  const firstArtifact = artifacts.find((artifact) => artifact.storageUrl);
  const previewKind = mode === "slideshow"
    ? "slideshow"
    : artifactPreviewKind(firstArtifact) ?? mode;

  if (request.status === "failed") {
    return {
      kind: mode,
      status: "error",
      requestId: request._id,
      title: "Generation failed",
      detail: request.errorMessage ?? "Create request failed.",
      model: selectedModelLabel,
      prompt: request.prompt,
    };
  }

  if (
    request.status === "queued" ||
    request.status === "planning" ||
    request.status === "generating"
  ) {
    return {
      kind: mode,
      status: "pending",
      requestId: request._id,
      title: mediaPreviewTitle(mode),
      detail:
        request.status === "planning"
          ? "Planning the slideshow."
          : request.status === "generating"
            ? "Generating the preview."
            : "Queued for generation.",
      model: selectedModelLabel,
      prompt: request.prompt,
    };
  }

  if (request.status === "saved") {
    return {
      kind: mode,
      status: "saved",
      requestId: request._id,
      artifactIds: artifacts.map((artifact) => artifact._id),
      title: resultTitle(
        request.prompt,
        mode === "slideshow" ? "Saved slideshow" : "Saved result"
      ),
      detail:
        mode === "slideshow"
          ? `${slideshows.length || 1} slideshow saved to the library.`
          : `${artifacts.length} ${mode}${artifacts.length === 1 ? "" : "s"} saved to the media library.`,
      model: selectedModelLabel,
      prompt: request.prompt,
      url: firstArtifact?.storageUrl,
    };
  }

  if (request.status === "ready") {
    return {
      kind: previewKind,
      status: "review",
      requestId: request._id,
      artifactIds: artifacts.map((artifact) => artifact._id),
      title:
        firstArtifact?.title ??
        resultTitle(request.prompt, mode === "slideshow" ? "Slideshow ready" : "Generated result"),
      detail:
        mode === "slideshow"
          ? request.summary ?? "Slideshow ready to review."
          : request.summary ?? `${artifacts.length} ${mode}${artifacts.length === 1 ? "" : "s"} ready to review.`,
      model: firstArtifact?.model ?? selectedModelLabel,
      prompt: request.prompt,
      url: firstArtifact?.storageUrl,
    };
  }

  return null;
}
