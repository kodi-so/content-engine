import type { Doc } from "../_generated/dataModel";

const reviewableTextArtifactTypes = new Set<Doc<"artifacts">["type"]>([
  "text_draft",
  "caption",
  "script",
  "scene_spec",
  "shot_list",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function artifactHasLibraryDestination(artifact: Doc<"artifacts">) {
  if (
    artifact.lifecycle === "debug" ||
    artifact.lifecycle === "preview" ||
    artifact.lifecycle === "discarded"
  ) {
    return false;
  }
  const data = isRecord(artifact.data) ? artifact.data : {};
  if (reviewableTextArtifactTypes.has(artifact.type)) {
    return typeof data.text === "string" && Boolean(data.text.trim());
  }
  return Boolean(
    artifact.storageUrl &&
    (data.source === "create_page" || data.source === "video_composer")
  );
}

export function contentEngineArtifactUrl(
  appUrl: string | undefined,
  artifact: Doc<"artifacts">
) {
  if (!appUrl || !artifactHasLibraryDestination(artifact)) return undefined;
  return `${appUrl}/library?artifactId=${artifact._id}`;
}
