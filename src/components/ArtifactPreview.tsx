import type { ArtifactDoc } from "../types";

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

  if (
    (artifact.type === "image" ||
      artifact.type === "rendered_asset" ||
      artifact.type === "thumbnail") &&
    imageUrl
  ) {
    return (
      <div className="artifact-preview image-preview">
        <img src={imageUrl} alt={artifact.title || "Generated image"} />
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
