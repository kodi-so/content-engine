import type { ArtifactDoc } from "../types";

export function artifactSummary(artifact: ArtifactDoc): string {
  if (artifact.type === "slide_spec" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { hook?: string; slides?: unknown[] };
    return `${data.hook ?? "Slideshow spec"}${data.slides ? ` · ${data.slides.length} slides` : ""}`;
  }

  if (artifact.type === "image_prompt" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { prompt?: string };
    return data.prompt ?? artifact.prompt ?? "Image prompt";
  }

  if ((artifact.type === "image" || artifact.type === "video") && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { status?: string; jobId?: string; url?: string };
    if (data.status || data.jobId) return `${data.status ?? "job"} · ${data.jobId ?? ""}`.trim();
    if (data.url) return data.url;
  }

  if (artifact.type === "rendered_asset" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as {
      format?: string;
      slideIndex?: number;
      slideCount?: number;
      width?: number;
      height?: number;
      dimensions?: { width?: number; height?: number };
      mimeType?: string;
    };
    if (data.format === "native_slideshow") {
      return [
        "Native slideshow",
        data.slideCount ? `${data.slideCount} slides` : undefined,
        data.dimensions?.width && data.dimensions.height
          ? `${data.dimensions.width}x${data.dimensions.height}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    return [
      typeof data.slideIndex === "number" ? `Publish-ready slide ${data.slideIndex}` : "Publish-ready asset",
      data.width && data.height ? `${data.width}x${data.height}` : undefined,
      data.mimeType,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (artifact.type === "publish_payload" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as {
      caption?: string;
      mediaArtifactIds?: string[];
      mediaItems?: unknown[];
      mediaSummary?: {
        total?: number;
      };
      exportStatus?: {
        destination?: string;
        status?: string;
      };
      primaryPlatformPreset?: {
        label?: string;
      };
      postType?: string;
    };
    const mediaCount = data.mediaSummary?.total ?? data.mediaItems?.length ?? data.mediaArtifactIds?.length;
    return [
      data.postType,
      data.primaryPlatformPreset?.label,
      mediaCount ? `${mediaCount} media refs` : undefined,
      data.exportStatus?.destination
        ? `${data.exportStatus.destination}: ${data.exportStatus.status ?? "export"}`
        : undefined,
      data.caption ? "caption ready" : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { text?: string };
    if (data.text) return data.text;
  }

  return artifact.prompt || "Artifact metadata will appear here as content runs.";
}
