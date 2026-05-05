import type { ArtifactDoc } from "../types";
import { artifactImageUrl } from "../lib/artifactUtils";

export function ArtifactPreview({ artifact }: { artifact: ArtifactDoc }) {
  const data = artifact.data && typeof artifact.data === "object"
    ? (artifact.data as Record<string, unknown>)
    : {};
  const imageUrl =
    typeof artifact.storageUrl === "string"
      ? artifact.storageUrl
      : typeof data.url === "string"
        ? data.url
        : undefined;

  if (artifact.type === "image" && imageUrl) {
    return (
      <div className="artifact-preview image-preview">
        <img src={imageUrl} alt={artifact.title || "Generated image"} />
      </div>
    );
  }

  if (artifact.type === "rendered_slide" && artifact.data && typeof artifact.data === "object") {
    const slideData = artifact.data as {
      headline?: string;
      body?: string;
      renderedImageUrl?: string;
      backgroundImageUrl?: string;
    };
    const renderedImageUrl = artifactImageUrl(artifact);

    if (renderedImageUrl) {
      return (
        <div className="artifact-preview image-preview">
          <img src={renderedImageUrl} alt={artifact.title || "Rendered slide"} />
        </div>
      );
    }

    return (
      <div className="artifact-preview rendered-slide-preview">
        {slideData.backgroundImageUrl && <img src={slideData.backgroundImageUrl} alt="" />}
        <div>
          <strong>{slideData.headline || "Rendered slide"}</strong>
          {slideData.body && <span>{slideData.body}</span>}
        </div>
      </div>
    );
  }

  if (artifact.type === "slide_spec" && artifact.data && typeof artifact.data === "object") {
    const spec = artifact.data as {
      hook?: string;
      slides?: Array<{ headline?: string; body?: string }>;
    };
    return (
      <div className="artifact-preview spec-preview">
        <strong>{spec.hook || "Slide spec"}</strong>
        {spec.slides?.slice(0, 3).map((slide, index) => (
          <span key={`${slide.headline ?? "slide"}-${index}`}>
            {slide.headline || slide.body || `Slide ${index + 1}`}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="artifact-preview text-preview">
      <span>{artifact.type}</span>
      <strong>{artifact.title || "Artifact"}</strong>
    </div>
  );
}
