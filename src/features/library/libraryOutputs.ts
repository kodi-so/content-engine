import { artifactSummary } from "../../lib/artifactUtils";
import { isRecord } from "../../lib/artifacts/mediaItems";
import type { ArtifactDoc, CreativeAssetDoc } from "../../types";
import type { LibraryOutput } from "./libraryTypes";

function artifactAspectRatio(artifact?: ArtifactDoc) {
  if (!artifact || !isRecord(artifact.data)) return undefined;

  if (typeof artifact.data.aspectRatio === "string") {
    return artifact.data.aspectRatio.replace(":", " / ");
  }

  const dimensions = isRecord(artifact.data.dimensions)
    ? artifact.data.dimensions
    : artifact.data;
  const width = typeof dimensions.width === "number" ? dimensions.width : undefined;
  const height = typeof dimensions.height === "number" ? dimensions.height : undefined;
  return width && height ? `${width} / ${height}` : undefined;
}

function artifactLatestEditPrompt(artifact?: ArtifactDoc) {
  if (!artifact || !isRecord(artifact.data)) return undefined;
  if (typeof artifact.data.latestEditPrompt !== "string") return undefined;
  return userFacingPrompt(artifact.data.latestEditPrompt);
}

function userFacingPrompt(prompt: string) {
  const suffix =
    "Use the provided reference image as the source image. Apply only the requested edit. Preserve the original subject, composition, framing, background, lighting, colors, camera angle, and style unless the requested edit directly requires a change.";
  const marker = "User prompt:";
  const markerIndex = prompt.lastIndexOf(marker);
  const userPrompt = markerIndex >= 0
    ? prompt.slice(markerIndex + marker.length).trim()
    : prompt.trim();
  const [instruction] = userPrompt.split(`\n\n${suffix}`);
  return instruction?.trim() || userPrompt || undefined;
}

function artifactUserPrompt(artifact?: ArtifactDoc) {
  if (!artifact) return undefined;
  if (isRecord(artifact.data) && typeof artifact.data.userPrompt === "string") {
    return artifact.data.userPrompt;
  }
  return artifact.prompt ? userFacingPrompt(artifact.prompt) : undefined;
}

function createPageArtifactOutput(artifact: ArtifactDoc): LibraryOutput | null {
  if (!isRecord(artifact.data)) return null;
  if (artifact.data.source !== "create_page" && artifact.data.source !== "video_composer") return null;
  if (!artifact.storageUrl) return null;
  if (artifact.lifecycle && artifact.lifecycle !== "saved") return null;

  const mimeType = typeof artifact.data.mimeType === "string"
    ? artifact.data.mimeType
    : undefined;

  return {
    id: `create:${artifact._id}`,
    artifactId: artifact._id,
    title: artifact.title?.trim() || "Generated asset",
    type: artifact.type,
    source: "create",
    createdAt: artifact.createdAt,
    provider: artifact.provider,
    model: artifact.model,
    prompt: artifactUserPrompt(artifact),
    latestEditPrompt: artifactLatestEditPrompt(artifact),
    summary: artifactSummary(artifact),
    storageUrl: artifact.storageUrl,
    mimeType,
    aspectRatio: artifactAspectRatio(artifact),
  };
}

export function createOutputsFromArtifacts(artifacts: ArtifactDoc[]) {
  return artifacts
    .map(createPageArtifactOutput)
    .filter((output): output is LibraryOutput => Boolean(output))
    .sort((first, second) => second.createdAt - first.createdAt);
}

function creativeAssetMimeType(asset: CreativeAssetDoc) {
  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  return typeof metadata.mimeType === "string" ? metadata.mimeType : undefined;
}

function creativeAssetOutput(asset: CreativeAssetDoc): LibraryOutput {
  const mimeType = creativeAssetMimeType(asset);
  return {
    id: `creative_asset:${asset._id}`,
    creativeAssetId: asset._id,
    title: asset.name,
    type: asset.mediaType,
    source: "creative_asset",
    createdAt: asset.createdAt,
    prompt: asset.description ?? asset.usageNotes,
    summary: asset.usageNotes ?? asset.description,
    storageUrl: asset.storageUrl,
    mimeType,
  };
}

export function creativeAssetOutputsFromAssets(assets: CreativeAssetDoc[]) {
  return assets
    .map(creativeAssetOutput)
    .sort((first, second) => second.createdAt - first.createdAt);
}
