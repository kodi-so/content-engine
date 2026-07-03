import { artifactSummary } from "../../lib/artifactUtils";
import { isRecord, mediaItemsForArtifact } from "../../lib/artifacts/mediaItems";
import type { ArtifactDoc, CreativeAssetDoc, WorkflowDoc, WorkflowRunDoc } from "../../types";
import type { LibraryOutput, LibraryRunGroup, LibraryWorkflowGroup } from "./libraryTypes";

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

function exportTimestamp(artifact: ArtifactDoc) {
  if (!isRecord(artifact.data) || !isRecord(artifact.data.exportStatus)) return artifact.createdAt;
  return typeof artifact.data.exportStatus.exportedAt === "number"
    ? artifact.data.exportStatus.exportedAt
    : artifact.createdAt;
}

function exportedToMediaLibrary(artifact: ArtifactDoc) {
  if (artifact.type !== "publish_payload" || !isRecord(artifact.data)) return false;

  if (
    isRecord(artifact.data.exportStatus) &&
    artifact.data.exportStatus.destination === "media_library"
  ) {
    return true;
  }

  return Array.isArray(artifact.data.exports) &&
    artifact.data.exports.some((item) =>
      isRecord(item) && item.destination === "media_library"
    );
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

export function workflowOutputsFromArtifacts(artifacts: ArtifactDoc[]) {
  const artifactsById = new Map(artifacts.map((artifact) => [String(artifact._id), artifact]));
  const seenOutputKeys = new Set<string>();
  const outputs: LibraryOutput[] = [];

  for (const artifact of artifacts) {
    if (!artifact.workflowId || !artifact.workflowRunId || !exportedToMediaLibrary(artifact)) {
      continue;
    }

    for (const item of mediaItemsForArtifact(artifact)) {
      if (!item.storageUrl) continue;
      const key = item.artifactId ?? item.storageUrl;
      if (seenOutputKeys.has(key)) continue;
      seenOutputKeys.add(key);

      const sourceArtifact = item.artifactId ? artifactsById.get(item.artifactId) : undefined;
      outputs.push({
        id: `media:${artifact._id}:${key}`,
        artifactId: sourceArtifact?._id,
        title: sourceArtifact?.title?.trim() || item.title?.trim() || "Exported media",
        type: item.artifactType ?? item.role ?? "media",
        source: "workflow",
        createdAt: exportTimestamp(artifact),
        workflowId: String(artifact.workflowId),
        workflowRunId: String(artifact.workflowRunId),
        provider: item.provider,
        model: item.model,
        prompt: artifactUserPrompt(sourceArtifact),
        latestEditPrompt: artifactLatestEditPrompt(sourceArtifact),
        summary: sourceArtifact ? artifactSummary(sourceArtifact) : undefined,
        storageUrl: item.storageUrl,
        mimeType: item.mimeType,
        aspectRatio: artifactAspectRatio(sourceArtifact),
      });
    }
  }

  return outputs.sort((first, second) => second.createdAt - first.createdAt);
}

export function groupLibraryOutputs(args: {
  outputs: LibraryOutput[];
  workflows?: WorkflowDoc[];
  runs?: WorkflowRunDoc[];
}) {
  const workflowsById = new Map((args.workflows ?? []).map((workflow) => [String(workflow._id), workflow]));
  const runsById = new Map((args.runs ?? []).map((run) => [String(run._id), run]));
  const runGroupsById = new Map<string, LibraryRunGroup>();

  for (const output of args.outputs) {
    if (!output.workflowId || !output.workflowRunId) continue;
    const run = runsById.get(output.workflowRunId);
    const existing = runGroupsById.get(output.workflowRunId);
    if (existing) {
      existing.outputs.push(output);
      existing.createdAt = Math.max(existing.createdAt, output.createdAt);
      continue;
    }

    runGroupsById.set(output.workflowRunId, {
      id: output.workflowRunId,
      workflowId: output.workflowId,
      run,
      outputs: [output],
      createdAt: output.createdAt,
    });
  }

  const workflowGroupsById = new Map<string, LibraryWorkflowGroup>();

  for (const runGroup of runGroupsById.values()) {
    runGroup.outputs.sort((first, second) => second.createdAt - first.createdAt);
    const existing = workflowGroupsById.get(runGroup.workflowId);
    if (existing) {
      existing.runs.push(runGroup);
      existing.outputCount += runGroup.outputs.length;
      existing.latestAt = Math.max(existing.latestAt, runGroup.createdAt);
      continue;
    }

    workflowGroupsById.set(runGroup.workflowId, {
      id: runGroup.workflowId,
      workflow: workflowsById.get(runGroup.workflowId),
      runs: [runGroup],
      outputCount: runGroup.outputs.length,
      latestAt: runGroup.createdAt,
    });
  }

  return [...workflowGroupsById.values()]
    .map((folder) => ({
      ...folder,
      runs: folder.runs.sort((first, second) => second.createdAt - first.createdAt),
    }))
    .sort((first, second) => second.latestAt - first.latestAt);
}
