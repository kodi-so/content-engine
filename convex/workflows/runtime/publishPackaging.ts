import type { Doc, Id } from "../../_generated/dataModel";
import type { PublishingProviderName } from "../../providers/publishing";
import { workflowGraphValidator } from "../../validators";
import {
  objectValue,
  stringArrayFromConfig,
  stringFromValue,
  type ResolvedInputsForRun,
} from "./inputValues";
import { buildPlatformPackages } from "../postCompilerPresets";

type WorkflowGraphForRun = typeof workflowGraphValidator.type;
type WorkflowGraphNodeForRun = WorkflowGraphForRun["nodes"][number];
type ArtifactDocForRun = Doc<"artifacts">;

export function postPackageArtifactIdsFromInputs(
  resolvedInputs: ResolvedInputsForRun
): Id<"artifacts">[] {
  const inputs = resolvedInputs.inputs ?? {};
  const ids = new Set<string>();
  if (inputs.post_package) {
    for (const artifactId of inputs.post_package.artifactIds ?? []) {
      ids.add(artifactId);
    }
  }

  for (const input of [inputs.post_package, inputs.input].filter(Boolean)) {
    const value = objectValue(input?.value);
    if (value.type === "publish_payload" && typeof value.artifactId === "string") {
      ids.add(value.artifactId);
    }
  }

  return [...ids] as Id<"artifacts">[];
}

function packageMediaItemFromArtifact(
  artifact: ArtifactDocForRun,
  index: number
) {
  const data = objectValue(artifact.data);
  const dimensions = objectValue(data.dimensions);
  const format = typeof data.format === "string" ? data.format : undefined;
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : undefined;
  const artifactType = artifact.type;
  const role =
    artifactType === "rendered_asset" && format === "native_slideshow"
      ? "slideshow"
      : artifactType === "video"
        ? "video"
        : artifactType === "image" || artifactType === "thumbnail"
          ? "image"
          : mimeType?.startsWith("audio/")
            ? "audio"
            : artifactType === "slide_spec"
              ? "slide_spec"
              : "asset";

  return {
    artifactId: String(artifact._id),
    order: index + 1,
    role,
    artifactType,
    title: artifact.title,
    storageUrl: artifact.storageUrl,
    mimeType,
    dimensions:
      typeof dimensions.width === "number" && typeof dimensions.height === "number"
        ? {
            width: dimensions.width,
            height: dimensions.height,
          }
        : undefined,
    durationSeconds:
      typeof data.durationSeconds === "number"
        ? data.durationSeconds
        : typeof data.duration === "number"
          ? data.duration
          : undefined,
    slideshow:
      role === "slideshow"
        ? {
            slideshowId: typeof data.slideshowId === "string" ? data.slideshowId : undefined,
            slideCount: typeof data.slideCount === "number" ? data.slideCount : undefined,
            aspectRatio: typeof data.aspectRatio === "string" ? data.aspectRatio : undefined,
          }
        : undefined,
    provider: artifact.provider,
    model: artifact.model,
  };
}

function inferredPostType(args: {
  configuredPostType?: string;
  mediaItems: ReturnType<typeof packageMediaItemFromArtifact>[];
}) {
  if (args.configuredPostType?.trim()) return args.configuredPostType.trim();

  const mediaItems = args.mediaItems;
  if (mediaItems.some((item) => item.role === "slideshow")) return "slideshow";
  if (mediaItems.some((item) => item.role === "video")) return "video";
  const imageCount = mediaItems.filter((item) => item.role === "image").length;
  if (imageCount > 1) return "carousel";
  if (imageCount === 1) return "single_image";
  if (mediaItems.some((item) => item.role === "audio")) return "audio";
  return "media";
}

function mediaSummaryForItems(
  mediaItems: ReturnType<typeof packageMediaItemFromArtifact>[]
) {
  return {
    total: mediaItems.length,
    slideshowCount: mediaItems.filter((item) => item.role === "slideshow").length,
    videoCount: mediaItems.filter((item) => item.role === "video").length,
    imageCount: mediaItems.filter((item) => item.role === "image").length,
    audioCount: mediaItems.filter((item) => item.role === "audio").length,
  };
}

export function postPackageDataForNode(args: {
  node: WorkflowGraphNodeForRun;
  resolvedInputs: ResolvedInputsForRun;
  sourceArtifactIds: Id<"artifacts">[];
  sourceArtifacts: ArtifactDocForRun[];
}) {
  const { node, resolvedInputs, sourceArtifactIds, sourceArtifacts } = args;
  const inputs = resolvedInputs.inputs ?? {};
  const config = objectValue(node.config);
  const metadataInput = objectValue(inputs.metadata?.value);
  const platformSettings = {
    ...objectValue(config.platformSettings),
    ...objectValue(inputs.platformSettings?.value),
  };
  const destinationPolicy = {
    ...objectValue(config.destinationPolicy),
    ...objectValue(inputs.destinationPolicy?.value),
  };
  const captionFromInputNode = config.captionFromInputNode === true;
  const configuredCaption = captionFromInputNode ? undefined : stringFromValue(config.caption);
  const inputCaption =
    (captionFromInputNode && inputs.caption?.source === "config"
      ? undefined
      : stringFromValue(inputs.caption?.value)) ??
    stringFromValue(inputs.text?.value) ??
    stringFromValue(inputs.prompt?.value) ??
    stringFromValue(inputs.input?.value);
  const mediaItems = sourceArtifacts.map((artifact, index) =>
    packageMediaItemFromArtifact(artifact, index)
  );
  const postType = inferredPostType({
    configuredPostType: typeof config.postType === "string" ? config.postType : undefined,
    mediaItems,
  });
  const name =
    typeof config.name === "string" && config.name.trim()
      ? config.name.trim()
      : `${node.label} package`;
  const mediaSummary = mediaSummaryForItems(mediaItems);
  const caption = configuredCaption ?? inputCaption;
  const platformCompilation = buildPlatformPackages({
    caption,
    config,
    mediaSummary,
    platformSettings,
    postType,
  });

  return {
    schemaVersion: 2,
    kind: "post_package",
    postType,
    name,
    caption,
    mediaArtifactIds: sourceArtifactIds.map((artifactId) => String(artifactId)),
    mediaItems,
    mediaSummary,
    primaryPlatformPreset: platformCompilation.primaryPlatformPreset,
    platformPresets: platformCompilation.platformPresets,
    platformPackages: platformCompilation.platformPackages,
    platformSettings: platformCompilation.platformSettings,
    destinationPolicy: {
      destination:
        typeof config.destination === "string" && config.destination.trim()
          ? config.destination.trim()
          : undefined,
      ...destinationPolicy,
    },
    optimizeForPlatforms: platformCompilation.optimizeForPlatforms,
    metadata: {
      ...metadataInput,
      sourceNodeId: node.id,
      sourceNodeType: node.type,
      inputSummary: resolvedInputs.summary ?? {},
      compiledAt: Date.now(),
    },
  };
}

export function postPackageOutputRefsForNode(args: {
  nodeId: string;
  artifactId: Id<"artifacts">;
  packageData: ReturnType<typeof postPackageDataForNode>;
}) {
  return [{
    nodeId: args.nodeId,
    port: "post_package",
    artifactIds: [args.artifactId],
    value: {
      kind: "post_package",
      artifactId: args.artifactId,
      postType: args.packageData.postType,
      name: args.packageData.name,
      caption: args.packageData.caption,
      mediaArtifactIds: args.packageData.mediaArtifactIds,
      mediaSummary: args.packageData.mediaSummary,
      primaryPlatformPreset: args.packageData.primaryPlatformPreset,
      platformPackages: args.packageData.platformPackages,
    },
  }];
}

export function postPackageDataForWorkflowFallback(args: {
  workflowName: string;
  sourceArtifactIds: Id<"artifacts">[];
  sourceArtifacts: ArtifactDocForRun[];
}) {
  const mediaItems = args.sourceArtifacts.map((artifact, index) =>
    packageMediaItemFromArtifact(artifact, index)
  );
  const postType = inferredPostType({
    mediaItems,
  });
  const mediaSummary = mediaSummaryForItems(mediaItems);
  const platformCompilation = buildPlatformPackages({
    config: {},
    mediaSummary,
    platformSettings: {},
    postType,
  });

  return {
    schemaVersion: 2,
    kind: "post_package",
    postType,
    name: `${args.workflowName} package`,
    mediaArtifactIds: args.sourceArtifactIds.map((artifactId) => String(artifactId)),
    mediaItems,
    mediaSummary,
    primaryPlatformPreset: platformCompilation.primaryPlatformPreset,
    platformPresets: platformCompilation.platformPresets,
    platformPackages: platformCompilation.platformPackages,
    platformSettings: platformCompilation.platformSettings,
    destinationPolicy: {
      destination: "media_library",
    },
    optimizeForPlatforms: platformCompilation.optimizeForPlatforms,
    metadata: {
      sourceNodeId: "workflow",
      sourceNodeType: "workflow_fallback",
      reason: "No reachable terminal node produced a post package.",
      compiledAt: Date.now(),
    },
  };
}

export function exportDestinationForNode(
  node: WorkflowGraphNodeForRun,
  resolvedInputs: ResolvedInputsForRun
): string {
  const config = objectValue(node.config);
  const inputs = resolvedInputs.inputs ?? {};
  return stringFromValue(inputs.destination?.value) ??
    (typeof config.destination === "string" && config.destination.trim()
      ? config.destination.trim()
      : "media_library");
}

function exportStatusForDestination(destination: string): string {
  if (destination === "media_library") return "exported";
  if (destination === "download") return "ready_for_download";
  return "pending_external_integration";
}

export function exportRecordForNode(args: {
  node: WorkflowGraphNodeForRun;
  resolvedInputs: ResolvedInputsForRun;
  destination: string;
}) {
  const config = objectValue(args.node.config);
  const inputs = args.resolvedInputs.inputs ?? {};
  const folder = stringFromValue(inputs.folder?.value) ?? stringFromValue(config.folder);
  const fileName = stringFromValue(inputs.fileName?.value) ?? stringFromValue(config.fileName);
  const optimizeFor =
    stringFromValue(inputs.optimizeFor?.value) ??
    stringFromValue(config.optimizeFor);

  return {
    destination: args.destination,
    status: exportStatusForDestination(args.destination),
    nodeId: args.node.id,
    nodeType: args.node.type,
    exportedAt: Date.now(),
    ...(folder ? { folder } : {}),
    ...(fileName ? { fileName } : {}),
    ...(optimizeFor ? { optimizeFor } : {}),
    externalDelivery:
      args.destination === "media_library"
        ? undefined
        : {
            status: "not_configured",
            reason: `${args.destination} export is reserved for a future destination integration.`,
          },
  };
}

export function exportedPackageData(args: {
  packageArtifact: ArtifactDocForRun;
  exportRecord: ReturnType<typeof exportRecordForNode>;
}) {
  const data = objectValue(args.packageArtifact.data);
  const existingExports = Array.isArray(data.exports) ? data.exports : [];
  return {
    ...data,
    destinationPolicy: {
      ...objectValue(data.destinationPolicy),
      destination: args.exportRecord.destination,
    },
    exportStatus: args.exportRecord,
    exports: [...existingExports, args.exportRecord],
  };
}

export function exportOutputRefsForNode(args: {
  nodeId: string;
  packageArtifactIds: Id<"artifacts">[];
  destination: string;
  status: string;
}) {
  return [{
    nodeId: args.nodeId,
    port: "artifact",
    artifactIds: args.packageArtifactIds,
    value: {
      kind: "export",
      destination: args.destination,
      status: args.status,
      packageArtifactIds: args.packageArtifactIds.map((artifactId) => String(artifactId)),
      artifactId: args.packageArtifactIds[0],
    },
  }];
}

function timestampFromValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function socialAccountIdsFromInputs(
  node: WorkflowGraphNodeForRun,
  resolvedInputs: ResolvedInputsForRun
): Id<"socialAccounts">[] {
  const config = objectValue(node.config);
  const inputs = resolvedInputs.inputs ?? {};
  const ids = new Set<string>();

  for (const value of [
    config.socialAccountIds,
    config.targetAccountIds,
    inputs.socialAccountIds?.value,
    inputs.targetAccountIds?.value,
  ]) {
    for (const id of stringArrayFromConfig(value)) ids.add(id);
  }

  return [...ids] as Id<"socialAccounts">[];
}

export function packageMediaArtifactIdsFromData(
  packageArtifact: ArtifactDocForRun
): Id<"artifacts">[] {
  const data = objectValue(packageArtifact.data);
  const mediaArtifactIds = stringArrayFromConfig(data.mediaArtifactIds);
  return mediaArtifactIds.length
    ? mediaArtifactIds as Id<"artifacts">[]
    : [packageArtifact._id];
}

export function captionFromPackageArtifact(
  packageArtifact: ArtifactDocForRun,
  fallback?: string
): string | undefined {
  const data = objectValue(packageArtifact.data);
  return stringFromValue(data.caption) ?? fallback;
}

export function autoPostScheduleForNode(
  node: WorkflowGraphNodeForRun,
  resolvedInputs: ResolvedInputsForRun
) {
  const config = objectValue(node.config);
  const inputs = resolvedInputs.inputs ?? {};
  return timestampFromValue(inputs.scheduledAt?.value) ??
    timestampFromValue(inputs.scheduledFor?.value) ??
    timestampFromValue(config.scheduledAt) ??
    timestampFromValue(config.scheduledFor);
}

export function autoPublishEnabled(
  node: WorkflowGraphNodeForRun,
  resolvedInputs: ResolvedInputsForRun
): boolean {
  const config = objectValue(node.config);
  const value = resolvedInputs.inputs?.autoPublish?.value ?? config.autoPublish;
  return value === true;
}

export function autoPostPackageData(args: {
  packageArtifact: ArtifactDocForRun;
  distributionPlanId: Id<"distributionPlans">;
  provider: PublishingProviderName;
  status: string;
  autoPublish: boolean;
  externalPostIds?: string[];
  publishedAt?: number;
  scheduledFor?: number;
  errorMessage?: string;
  providerPayload?: unknown;
}) {
  const data = objectValue(args.packageArtifact.data);
  const existingPublishRequests = Array.isArray(data.publishRequests)
    ? data.publishRequests
    : [];
  const publishRecord = {
    distributionPlanId: args.distributionPlanId,
    provider: args.provider,
    status: args.status,
    autoPublish: args.autoPublish,
    requestedAt: Date.now(),
    ...(args.externalPostIds ? { externalPostIds: args.externalPostIds } : {}),
    ...(args.publishedAt ? { publishedAt: args.publishedAt } : {}),
    ...(args.scheduledFor ? { scheduledFor: args.scheduledFor } : {}),
    ...(args.errorMessage ? { errorMessage: args.errorMessage } : {}),
    ...(args.providerPayload !== undefined ? { providerPayload: args.providerPayload } : {}),
  };

  return {
    ...data,
    publishingStatus: publishRecord,
    distributionPlanIds: [
      ...new Set([
        ...stringArrayFromConfig(data.distributionPlanIds),
        String(args.distributionPlanId),
      ]),
    ],
    publishRequests: [...existingPublishRequests, publishRecord],
  };
}

export function autoPostOutputRefsForNode(args: {
  nodeId: string;
  packageArtifactId: Id<"artifacts">;
  distributionPlanId: Id<"distributionPlans">;
  provider: PublishingProviderName;
  status: string;
  autoPublish: boolean;
  externalPostIds?: string[];
}) {
  return [{
    nodeId: args.nodeId,
    port: "result",
    artifactIds: [args.packageArtifactId],
    value: {
      kind: "publish_result",
      artifactId: args.packageArtifactId,
      distributionPlanId: args.distributionPlanId,
      provider: args.provider,
      status: args.status,
      autoPublish: args.autoPublish,
      ...(args.externalPostIds ? { externalPostIds: args.externalPostIds } : {}),
    },
  }];
}
