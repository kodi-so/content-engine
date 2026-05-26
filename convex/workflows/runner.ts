import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "../_generated/server";
import { storeGeneratedAsset } from "../content/assetStorage";
import {
  buildFullGraphicPlannerPrompt,
  buildOverlayPlannerPrompt,
  buildSingleImagePromptWriterPrompt,
  IMAGE_PROMPT_WRITER_SYSTEM_PROMPT,
  normalizePlan,
  type PlannerReference,
  type RequestedRenderingMode,
} from "../content/planning";
import {
  fullGraphicSlideshowPlanSchema,
  overlaySlideshowPlanSchema,
  singleFullGraphicImagePromptWriterSchema,
  singleOverlayImagePromptWriterSchema,
  type CanonicalSlideshowSpec,
  type ImagePromptWriterOutput,
  type SingleImagePromptWriterOutput,
  type SlideshowPlan,
  type SlideshowPlannerOutput,
} from "../content/types";
import { buildCanonicalSlideshowSpec } from "../content/slideshowAdapter";
import { getSlideDimensions } from "../content/slideshowDimensions";
import { getModelProvider, getPublishingProvider } from "../providers";
import {
  loadPublishInput,
  mapProviderStatus,
} from "../publishing/publishInput";
import type {
  GeneratedAsset,
  ModelProvider,
  ModelProviderName,
  ReferenceAsset,
} from "../providers/model";
import type { PublishingProviderName } from "../providers/publishing";
import { artifactLifecycleValidator, workflowGraphValidator } from "../validators";
import {
  buildWorkflowAgentPrompt,
  getWorkflowAgentPreset,
  type WorkflowAgentOutputKind,
} from "./agentPresets";
import { buildPlatformPackages } from "./postCompilerPresets";

type WorkflowGraphForRun = typeof workflowGraphValidator.type;
type WorkflowGraphNodeForRun = WorkflowGraphForRun["nodes"][number];
type ArtifactLifecycleForRun = typeof artifactLifecycleValidator.type;
type NodeRetentionModeForRun = "inherit" | "keep" | "discard" | "keep_on_failure";
type ResolvedInputsForRun = {
  inputs?: Record<string, {
    source?: string;
    value?: unknown;
    artifactIds?: string[];
    metadata?: Record<string, unknown>;
  }>;
  summary?: Record<string, unknown>;
};
type MediaKindForRun = "image" | "video" | "audio" | "media";
type ArtifactDocForRun = Doc<"artifacts">;

type MediaNodeItemForRun = {
  id: string;
  source: "artifact" | "creative_asset" | "persona" | "uploaded";
  kind: MediaKindForRun;
  title?: string;
  storageUrl?: string;
  data?: unknown;
  metadata?: unknown;
};

function adjacencyForGraph(graph: WorkflowGraphForRun): Map<string, string[]> {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  return adjacency;
}

function reachableNodeIdsFromRunner(graph: WorkflowGraphForRun): Set<string> {
  const runnerNode = graph.nodes.find((node) => node.type === "runner") ?? graph.nodes[0];
  if (!runnerNode) return new Set();

  const adjacency = adjacencyForGraph(graph);
  const reachableNodeIds = new Set<string>();
  const stack = [runnerNode.id];

  while (stack.length) {
    const nodeId = stack.pop();
    if (!nodeId || reachableNodeIds.has(nodeId)) continue;

    reachableNodeIds.add(nodeId);
    stack.push(...(adjacency.get(nodeId) ?? []));
  }

  return reachableNodeIds;
}

function runnableNodeIdsForGraph(graph: WorkflowGraphForRun): Set<string> {
  const runnableNodeIds = reachableNodeIdsFromRunner(graph);
  let addedDependency = true;

  while (addedDependency) {
    addedDependency = false;
    for (const edge of graph.edges) {
      if (!runnableNodeIds.has(edge.targetNodeId) || runnableNodeIds.has(edge.sourceNodeId)) {
        continue;
      }

      runnableNodeIds.add(edge.sourceNodeId);
      addedDependency = true;
    }
  }

  return runnableNodeIds;
}

function dependencyNodeIdsForGraph(graph: WorkflowGraphForRun): Map<string, string[]> {
  const dependenciesByNodeId = new Map(
    graph.nodes.map((node) => [node.id, new Set<string>()])
  );

  for (const edge of graph.edges) {
    const dependencies = dependenciesByNodeId.get(edge.targetNodeId);
    if (dependencies) dependencies.add(edge.sourceNodeId);
  }

  return new Map(
    [...dependenciesByNodeId.entries()].map(([nodeId, dependencies]) => [
      nodeId,
      [...dependencies].sort(),
    ])
  );
}

function readyNodesForPass(
  nodes: WorkflowGraphNodeForRun[],
  dependencyNodeIdsByNode: Map<string, string[]>,
  pendingNodeIds: Set<string>,
  completedNodeIds: Set<string>
): WorkflowGraphNodeForRun[] {
  return nodes.filter((node) => {
    if (!pendingNodeIds.has(node.id)) return false;
    const dependencyNodeIds = dependencyNodeIdsByNode.get(node.id) ?? [];
    return dependencyNodeIds.every((nodeId) => completedNodeIds.has(nodeId));
  });
}

function outboundPortsForNode(
  graph: WorkflowGraphForRun,
  nodeId: string
): string[] {
  return [
    ...new Set(
      graph.edges
        .filter((edge) => edge.sourceNodeId === nodeId)
        .map((edge) => edge.sourcePort)
    ),
  ].sort();
}

function mediaNodeOutputPorts(): string[] {
  return ["media", "image", "video", "audio"];
}

function retentionModeForNode(node: WorkflowGraphNodeForRun): NodeRetentionModeForRun {
  const retention = node.retention;
  if (!retention || typeof retention !== "object" || Array.isArray(retention)) return "inherit";
  const mode = (retention as Record<string, unknown>).mode;

  if (
    mode === "inherit" ||
    mode === "keep" ||
    mode === "discard" ||
    mode === "keep_on_failure"
  ) {
    return mode;
  }

  return "inherit";
}

function placeholderLifecycleForNode(
  graph: WorkflowGraphForRun,
  node: WorkflowGraphNodeForRun
): ArtifactLifecycleForRun {
  const retentionMode = retentionModeForNode(node);
  const runMode = graph.runSettings?.mode ?? "production";
  const graphRetention = graph.runSettings?.artifactRetention;

  if (retentionMode === "keep") return "saved";
  if (retentionMode === "discard") return "discarded";
  if (retentionMode === "keep_on_failure") return "discarded";
  if (runMode === "test" || graphRetention === "keep_all") return "debug";
  return "discarded";
}

function isPostPackageNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "post_compiler";
}

function isExportNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "export";
}

function isAutoPostNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "auto_post";
}

function isTerminalPackageConsumer(node: WorkflowGraphNodeForRun): boolean {
  return isExportNode(node) || isAutoPostNode(node);
}

function isMediaNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "media";
}

function isLlmNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "llm";
}

function isAiAgentNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "ai_agent";
}

function isImageGenerationNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "image_generation";
}

function isVideoGenerationNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "video_generation";
}

function isAudioGenerationNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "audio_generation";
}

function isLipsyncNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "lipsync";
}

function isAiVideoEditorNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "ai_video_editor";
}

function isNativeSlideshowPlannerNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "native_slideshow_planner";
}

function isNativeSlideshowRendererNode(node: WorkflowGraphNodeForRun): boolean {
  return node.type === "native_slideshow_renderer";
}

function isImplementedNode(node: WorkflowGraphNodeForRun): boolean {
  return isMediaNode(node) ||
    isLlmNode(node) ||
    isAiAgentNode(node) ||
    isImageGenerationNode(node) ||
    isVideoGenerationNode(node) ||
    isAudioGenerationNode(node) ||
    isLipsyncNode(node) ||
    isAiVideoEditorNode(node) ||
    isNativeSlideshowPlannerNode(node) ||
    isNativeSlideshowRendererNode(node) ||
    isExportNode(node) ||
    isAutoPostNode(node);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringFromValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const data = value as Record<string, unknown>;
  for (const key of ["caption", "text", "content", "prompt"]) {
    const candidate = data[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return undefined;
}

function textFromInputValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const text = value.flatMap((item) => {
      const itemText = textFromInputValue(item);
      return itemText ? [itemText] : [];
    }).join("\n\n");
    return text.trim() || undefined;
  }
  if (!value || typeof value !== "object") return undefined;

  const data = value as Record<string, unknown>;
  for (const key of ["prompt", "text", "content", "caption", "script"]) {
    const candidate = textFromInputValue(data[key]);
    if (candidate) return candidate;
  }

  if (data.data && typeof data.data === "object") {
    const nestedText = textFromInputValue(data.data);
    if (nestedText) return nestedText;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

function numberFromInputValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function modelProviderNameForNode(node: WorkflowGraphNodeForRun): ModelProviderName {
  switch (node.provider) {
    case "bulkapis":
    case "gemini":
    case "fal":
    case "openrouter":
    case "manual":
      return node.provider;
    default:
      return "bulkapis";
  }
}

function publishingProviderNameForNode(node: WorkflowGraphNodeForRun): PublishingProviderName {
  switch (node.provider) {
    case "postiz":
    case "post_bridge":
    case "manual":
      return node.provider;
    default:
      return "manual";
  }
}

function llmResponseFormat(value: unknown): "text" | "json" {
  return value === "json" ||
    value === "json_object" ||
    value === "structured" ||
    value === "schema"
    ? "json"
    : "text";
}

function providerOverridesFromConfig(config: Record<string, unknown>) {
  const overrides = {
    ...objectValue(config.bulkapisInput),
    ...objectValue(config.providerInput),
  };
  const seed = numberFromInputValue(config.seed);
  if (seed !== undefined) overrides.seed = seed;
  return overrides;
}

function generationProviderInputFromConfig(
  config: Record<string, unknown>,
  excludedKeys: string[]
) {
  const overrides = {
    ...objectValue(config.bulkapisInput),
    ...objectValue(config.providerInput),
  };
  const excluded = new Set([
    ...excludedKeys,
    "bulkapisInput",
    "providerInput",
    "model",
  ]);

  for (const [key, value] of Object.entries(config)) {
    if (excluded.has(key) || value === undefined || value === "") continue;
    overrides[key] = value;
  }

  return overrides;
}

type ImageModelUiContractForRun = {
  prompt: {
    visible: boolean;
    required: boolean;
  };
  images: {
    visible: boolean;
    required: boolean;
    multiple: boolean;
    maxCount?: number;
  };
};

function imageModelUiContractForRun(model: Doc<"providerModels"> | null): ImageModelUiContractForRun {
  const metadata = objectValue(model?.metadata);
  const uiContract = objectValue(metadata.uiContract);
  const prompt = objectValue(uiContract.prompt);
  const images = objectValue(uiContract.images);
  const maxCount = numberFromInputValue(images.maxCount);

  return {
    prompt: {
      visible: typeof prompt.visible === "boolean" ? prompt.visible : true,
      required: typeof prompt.required === "boolean" ? prompt.required : true,
    },
    images: {
      visible: typeof images.visible === "boolean" ? images.visible : true,
      required: typeof images.required === "boolean" ? images.required : false,
      multiple: typeof images.multiple === "boolean" ? images.multiple : true,
      ...(maxCount !== undefined ? { maxCount } : {}),
    },
  };
}

function providerModelInputSchema(model: Doc<"providerModels"> | null): Record<string, unknown> {
  const schemaSnapshot = objectValue(model?.schemaSnapshot);
  return objectValue(schemaSnapshot.inputSchema);
}

function schemaHasField(schema: Record<string, unknown>, key: string): boolean {
  if (schema[key] !== undefined) return true;
  const properties = objectValue(schema.properties);
  return properties[key] !== undefined;
}

function imageProviderInputFromModelSchema(args: {
  model: Doc<"providerModels"> | null;
  referenceImages: ReferenceAsset[];
  count: number;
}) {
  const schema = providerModelInputSchema(args.model);
  const urls = args.referenceImages
    .map((referenceImage) => referenceImage.url)
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0);
  const input: Record<string, unknown> = {};

  if (urls.length) {
    if (schemaHasField(schema, "image_url")) input.image_url = urls[0];
    if (schemaHasField(schema, "image")) input.image = urls[0];
    if (schemaHasField(schema, "image_urls")) input.image_urls = urls;
    if (schemaHasField(schema, "image_input")) input.image_input = urls;
    if (schemaHasField(schema, "input_urls")) input.input_urls = urls;
    if (schemaHasField(schema, "reference_image_urls")) input.reference_image_urls = urls;
  }

  if (schemaHasField(schema, "max_images")) {
    input.max_images = args.count;
  }
  if (schemaHasField(schema, "num_images")) {
    input.num_images = args.count;
  }

  return input;
}

function looksLikeUrl(value: string): boolean {
  return value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:");
}

function referenceAssetMimeType(
  value: Record<string, unknown>,
  fallbackMimeType = "image/png"
): string {
  const data = objectValue(value.data);
  const metadata = objectValue(value.metadata);
  const mimeType = value.mimeType ?? data.mimeType ?? metadata.mimeType;
  return typeof mimeType === "string" && mimeType.trim()
    ? mimeType.trim()
    : fallbackMimeType;
}

function collectReferenceAssetsFromValue(
  value: unknown,
  output: ReferenceAsset[],
  seenUrls: Set<string>,
  options: {
    acceptedKinds: string[];
    defaultMimeType: string;
    mimePrefix: string;
  } = {
    acceptedKinds: ["image"],
    defaultMimeType: "image/png",
    mimePrefix: "image/",
  }
) {
  if (typeof value === "string") {
    const url = value.trim();
    if (looksLikeUrl(url) && !seenUrls.has(url)) {
      seenUrls.add(url);
      output.push({ url, mimeType: options.defaultMimeType });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferenceAssetsFromValue(item, output, seenUrls, options);
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) {
    for (const item of record.items) {
      collectReferenceAssetsFromValue(item, output, seenUrls, options);
    }
  }

  const url = record.storageUrl ?? record.url;
  const kind = typeof record.kind === "string" ? record.kind : undefined;
  const mimeType = referenceAssetMimeType(record, options.defaultMimeType);
  if (
    typeof url === "string" &&
    looksLikeUrl(url.trim()) &&
    !seenUrls.has(url.trim()) &&
    (kind === undefined ||
      options.acceptedKinds.includes(kind) ||
      mimeType.startsWith(options.mimePrefix))
  ) {
    const trimmedUrl = url.trim();
    seenUrls.add(trimmedUrl);
    output.push({
      url: trimmedUrl,
      mimeType,
      description:
        typeof record.title === "string"
          ? record.title
          : typeof record.name === "string"
            ? record.name
            : undefined,
    });
  }

  if (record.data && typeof record.data === "object") {
    collectReferenceAssetsFromValue(record.data, output, seenUrls, options);
  }
}

function referenceAssetsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): ReferenceAsset[] {
  const inputs = resolvedInputs.inputs ?? {};
  const seenUrls = new Set<string>();
  const referenceAssets: ReferenceAsset[] = [];

  for (const key of preferredKeys) {
    collectReferenceAssetsFromValue(inputs[key]?.value, referenceAssets, seenUrls);
  }

  return referenceAssets;
}

function referenceVideoAssetsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): ReferenceAsset[] {
  const inputs = resolvedInputs.inputs ?? {};
  const seenUrls = new Set<string>();
  const referenceAssets: ReferenceAsset[] = [];

  for (const key of preferredKeys) {
    collectReferenceAssetsFromValue(inputs[key]?.value, referenceAssets, seenUrls, {
      acceptedKinds: ["video"],
      defaultMimeType: "video/mp4",
      mimePrefix: "video/",
    });
  }

  return referenceAssets;
}

function referenceAudioAssetsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): ReferenceAsset[] {
  const inputs = resolvedInputs.inputs ?? {};
  const seenUrls = new Set<string>();
  const referenceAssets: ReferenceAsset[] = [];

  for (const key of preferredKeys) {
    collectReferenceAssetsFromValue(inputs[key]?.value, referenceAssets, seenUrls, {
      acceptedKinds: ["audio"],
      defaultMimeType: "audio/mpeg",
      mimePrefix: "audio/",
    });
  }

  return referenceAssets;
}

function uniqueReferenceAssets(assets: ReferenceAsset[]): ReferenceAsset[] {
  const seen = new Set<string>();
  const uniqueAssets: ReferenceAsset[] = [];

  for (const asset of assets) {
    const key = asset.url ?? asset.base64Data;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueAssets.push(asset);
  }

  return uniqueAssets;
}

function allMediaReferenceAssetsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): ReferenceAsset[] {
  return uniqueReferenceAssets([
    ...referenceAssetsFromInputs(resolvedInputs, preferredKeys),
    ...referenceVideoAssetsFromInputs(resolvedInputs, preferredKeys),
    ...referenceAudioAssetsFromInputs(resolvedInputs, preferredKeys),
  ]);
}

function requestedRenderingModeFromValue(value: unknown): RequestedRenderingMode {
  return value === "full_graphic_generation"
    ? "full_graphic_generation"
    : "background_plus_overlay";
}

function plannerSchemaForMode(renderingMode: RequestedRenderingMode) {
  return renderingMode === "full_graphic_generation"
    ? fullGraphicSlideshowPlanSchema
    : overlaySlideshowPlanSchema;
}

function singleImagePromptSchemaForMode(renderingMode: RequestedRenderingMode) {
  return renderingMode === "full_graphic_generation"
    ? singleFullGraphicImagePromptWriterSchema
    : singleOverlayImagePromptWriterSchema;
}

function buildPlannerPromptForMode(args: {
  prompt: string;
  revisionPrompt?: string;
  brand: Parameters<typeof buildOverlayPlannerPrompt>[0]["brand"];
  socialAccount?: Parameters<typeof buildOverlayPlannerPrompt>[0]["socialAccount"];
  requestedRenderingMode: RequestedRenderingMode;
  references: PlannerReference[];
}) {
  return args.requestedRenderingMode === "full_graphic_generation"
    ? buildFullGraphicPlannerPrompt(args)
    : buildOverlayPlannerPrompt(args);
}

function plannerReferencesFromInputs(
  resolvedInputs: ResolvedInputsForRun
): PlannerReference[] {
  const references: PlannerReference[] = [];
  const seen = new Set<string>();

  const addReference = (value: unknown, fallbackIndex: number) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;

    const record = value as Record<string, unknown>;
    const metadata = objectValue(record.metadata);
    const key = String(record.id ?? record.assetId ?? record.artifactId ?? record.storageUrl ?? `reference-${fallbackIndex}`);
    if (seen.has(key)) return;
    seen.add(key);

    references.push({
      assetId: key,
      name:
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : typeof record.name === "string" && record.name.trim()
            ? record.name.trim()
            : `Workflow reference ${references.length + 1}`,
      type:
        typeof record.kind === "string"
          ? record.kind
          : typeof record.type === "string"
            ? record.type
            : "media",
      description:
        typeof record.description === "string"
          ? record.description
          : typeof metadata.description === "string"
            ? metadata.description
            : undefined,
      instruction:
        typeof record.instruction === "string"
          ? record.instruction
          : typeof metadata.instruction === "string"
            ? metadata.instruction
            : undefined,
    });
  };

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item));
      return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      record.items.forEach((item, index) => addReference(item, index));
      return;
    }
    addReference(value, references.length + 1);
  };

  for (const key of ["media", "image", "video", "audio", "reference", "input"]) {
    visit(resolvedInputs.inputs?.[key]?.value);
  }

  return references;
}

function slideSpecOutputRefsForNode(args: {
  nodeId: string;
  artifactId: Id<"artifacts">;
  plan: unknown;
}) {
  return [{
    nodeId: args.nodeId,
    port: "slide_spec",
    artifactIds: [args.artifactId],
    value: {
      kind: "slide_spec",
      artifactId: args.artifactId,
      plan: args.plan,
    },
  }];
}

function isSlideshowPlanValue(value: unknown): value is SlideshowPlan {
  const record = objectValue(value);
  return record.format === "slideshow" &&
    typeof record.renderingMode === "string" &&
    typeof record.title === "string" &&
    typeof record.aspectRatio === "string" &&
    Array.isArray(record.slides);
}

function isCanonicalSlideshowSpecValue(value: unknown): value is CanonicalSlideshowSpec {
  const record = objectValue(value);
  return isSlideshowPlanValue(value) &&
    Boolean(record.dimensions && typeof record.dimensions === "object") &&
    Boolean(record.exportSettings && typeof record.exportSettings === "object");
}

function slideshowSpecFromValue(value: unknown): {
  plan?: SlideshowPlan;
  canonicalSpec?: CanonicalSlideshowSpec;
  artifactId?: Id<"artifacts">;
} | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = slideshowSpecFromValue(item);
      if (extracted) return extracted;
    }
    return undefined;
  }

  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const artifactId = typeof record.artifactId === "string"
    ? record.artifactId as Id<"artifacts">
    : undefined;

  for (const candidate of [
    record.plan,
    record.spec,
    record.data,
    objectValue(record.data).plan,
    objectValue(record.data).spec,
    value,
  ]) {
    if (isCanonicalSlideshowSpecValue(candidate)) {
      return { canonicalSpec: candidate, artifactId };
    }
    if (isSlideshowPlanValue(candidate)) {
      return { plan: candidate, artifactId };
    }
  }

  return undefined;
}

function slideshowSpecFromInputs(resolvedInputs: ResolvedInputsForRun) {
  const inputs = resolvedInputs.inputs ?? {};
  for (const key of ["slide_spec", "input"]) {
    const extracted = slideshowSpecFromValue(inputs[key]?.value);
    if (extracted) return extracted;
  }

  for (const input of Object.values(inputs)) {
    const extracted = slideshowSpecFromValue(input.value);
    if (extracted) return extracted;
  }

  return undefined;
}

function numberFromRecordFields(
  record: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function slideImageArtifactIdFromRecord(record: Record<string, unknown>): Id<"artifacts"> | undefined {
  const artifactId = record.artifactId ?? (record.source === "artifact" ? record.id : undefined);
  return typeof artifactId === "string" && artifactId.trim()
    ? artifactId as Id<"artifacts">
    : undefined;
}

function collectSlideImagesFromValue(
  value: unknown,
  images: Array<{
    artifactId?: Id<"artifacts">;
    url?: string;
    title?: string;
    slideIndex?: number;
  }>,
  seen: Set<string>
) {
  if (Array.isArray(value)) {
    for (const item of value) collectSlideImagesFromValue(item, images, seen);
    return;
  }

  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) {
    for (const item of record.items) collectSlideImagesFromValue(item, images, seen);
  }

  const data = objectValue(record.data);
  const metadata = objectValue(record.metadata);
  const mimeType =
    typeof record.mimeType === "string" ? record.mimeType :
      typeof data.mimeType === "string" ? data.mimeType :
        typeof metadata.mimeType === "string" ? metadata.mimeType :
          undefined;
  const kind = typeof record.kind === "string" ? record.kind : undefined;
  const type =
    typeof record.type === "string" ? record.type :
      typeof metadata.artifactType === "string" ? metadata.artifactType :
        undefined;
  const url = record.storageUrl ?? record.url ?? data.storageUrl ?? data.url ?? data.backgroundImageUrl;
  const artifactId = slideImageArtifactIdFromRecord(record);
  const isImage =
    kind === "image" ||
    type === "image" ||
    type === "thumbnail" ||
    (typeof mimeType === "string" && mimeType.startsWith("image/"));

  if ((isImage || typeof url === "string") && (artifactId || typeof url === "string")) {
    const key = String(artifactId ?? url);
    if (!seen.has(key)) {
      seen.add(key);
      images.push({
        artifactId,
        url: typeof url === "string" && url.trim() ? url.trim() : undefined,
        title:
          typeof record.title === "string" ? record.title :
            typeof record.name === "string" ? record.name :
              undefined,
        slideIndex:
          numberFromRecordFields(record, ["slideIndex", "index"]) ??
          numberFromRecordFields(data, ["slideIndex", "index"]) ??
          numberFromRecordFields(metadata, ["slideIndex", "index"]),
      });
    }
  }

  if (record.data && typeof record.data === "object") {
    collectSlideImagesFromValue(record.data, images, seen);
  }
}

function slideImagesByIndexFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  spec: SlideshowPlan | CanonicalSlideshowSpec
): Map<number, { artifactId?: string; url?: string }> {
  const inputs = resolvedInputs.inputs ?? {};
  const images: Array<{
    artifactId?: Id<"artifacts">;
    url?: string;
    title?: string;
    slideIndex?: number;
  }> = [];
  const seen = new Set<string>();

  for (const key of ["media", "image", "input"]) {
    collectSlideImagesFromValue(inputs[key]?.value, images, seen);
  }

  const activeSlideIndexes = spec.slides
    .map((slide) => slide.index)
    .sort((first, second) => first - second);
  const byIndex = new Map<number, { artifactId?: string; url?: string }>();
  let fallbackIndex = 0;

  for (const image of images) {
    const mappedIndex = image.slideIndex ?? activeSlideIndexes[fallbackIndex];
    if (mappedIndex === undefined || byIndex.has(mappedIndex)) continue;

    byIndex.set(mappedIndex, {
      artifactId: image.artifactId ? String(image.artifactId) : undefined,
      url: image.url,
    });
    if (image.slideIndex === undefined) fallbackIndex += 1;
  }

  return byIndex;
}

function enrichCanonicalSpecWithImages(
  spec: CanonicalSlideshowSpec,
  imageBySlideIndex: ReadonlyMap<number, { artifactId?: string; url?: string }>
): CanonicalSlideshowSpec {
  return {
    ...spec,
    slides: spec.slides.map((slide) => {
      const image = imageBySlideIndex.get(slide.index);
      if (!image || (slide.backgroundImageUrl && slide.sourceImageArtifactId)) return slide;
      return {
        ...slide,
        backgroundImageUrl: slide.backgroundImageUrl ?? image.url,
        sourceImageArtifactId: slide.sourceImageArtifactId ?? image.artifactId,
        updatedAt: Date.now(),
      };
    }),
  };
}

function nativeSlideshowOutputRefsForNode(args: {
  nodeId: string;
  artifactId: Id<"artifacts">;
  slideshowId: Id<"slideshows">;
  spec: CanonicalSlideshowSpec;
}) {
  return [{
    nodeId: args.nodeId,
    port: "slideshow",
    artifactIds: [args.artifactId],
    value: {
      kind: "slideshow",
      artifactId: args.artifactId,
      slideshowId: args.slideshowId,
      title: args.spec.title,
      slideCount: args.spec.slides.filter((slide) => slide.status !== "deleted").length,
      aspectRatio: args.spec.aspectRatio,
      dimensions: args.spec.dimensions,
      spec: args.spec,
    },
  }];
}

function costUsdFromMetadata(metadata: { costUsd?: number }): number {
  return typeof metadata.costUsd === "number" ? metadata.costUsd : 0;
}

async function waitForGeneratedImage(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
  },
  onStatus?: (status: string) => Promise<void>
): Promise<GeneratedAsset> {
  if (!args.jobId) throw new Error("Image generation did not return an image or job id");

  let lastStatus = "unknown";
  let lastError = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await provider.getJobStatus({
      jobId: args.jobId,
      model: args.model,
      metadata: args.metadata,
    });
    lastStatus = result.status;
    lastError = result.errorMessage ?? "";
    await onStatus?.(result.status);

    if (result.status === "succeeded") {
      const asset = result.assets?.find((candidate) =>
        candidate.mimeType.startsWith("image/")
      );
      if (asset) return asset;
      throw new Error(`Image job ${args.jobId} succeeded but returned no image assets`);
    }
    if (result.status === "failed" || result.status === "canceled") {
      throw new Error(`Image job ${args.jobId} ${result.status}${result.errorMessage ? `: ${result.errorMessage}` : ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Image job ${args.jobId} timed out after 5 minutes with status ${lastStatus}${lastError ? `: ${lastError}` : ""}`);
}

async function waitForGeneratedVideo(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
  },
  onStatus?: (status: string) => Promise<void>
): Promise<GeneratedAsset> {
  if (!args.jobId) throw new Error("Video generation did not return a job id");

  let lastStatus = "unknown";
  let lastError = "";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await provider.getJobStatus({
      jobId: args.jobId,
      model: args.model,
      metadata: args.metadata,
    });
    lastStatus = result.status;
    lastError = result.errorMessage ?? "";
    await onStatus?.(result.status);

    if (result.status === "succeeded") {
      const asset = result.assets?.find((candidate) =>
        candidate.mimeType.startsWith("video/")
      );
      if (asset) return asset;
      throw new Error(`Video job ${args.jobId} succeeded but returned no video assets`);
    }
    if (result.status === "failed" || result.status === "canceled") {
      throw new Error(`Video job ${args.jobId} ${result.status}${result.errorMessage ? `: ${result.errorMessage}` : ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Video job ${args.jobId} timed out after 10 minutes with status ${lastStatus}${lastError ? `: ${lastError}` : ""}`);
}

async function waitForGeneratedAudio(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
  },
  onStatus?: (status: string) => Promise<void>
): Promise<GeneratedAsset> {
  if (!args.jobId) throw new Error("Audio generation did not return an audio asset or job id");

  let lastStatus = "unknown";
  let lastError = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await provider.getJobStatus({
      jobId: args.jobId,
      model: args.model,
      metadata: args.metadata,
    });
    lastStatus = result.status;
    lastError = result.errorMessage ?? "";
    await onStatus?.(result.status);

    if (result.status === "succeeded") {
      const asset = result.assets?.find((candidate) =>
        candidate.mimeType.startsWith("audio/")
      );
      if (asset) return asset;
      throw new Error(`Audio job ${args.jobId} succeeded but returned no audio assets`);
    }
    if (result.status === "failed" || result.status === "canceled") {
      throw new Error(`Audio job ${args.jobId} ${result.status}${result.errorMessage ? `: ${result.errorMessage}` : ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Audio job ${args.jobId} timed out after 5 minutes with status ${lastStatus}${lastError ? `: ${lastError}` : ""}`);
}

function llmOutputRefsForNode(args: {
  nodeId: string;
  artifactId: Id<"artifacts">;
  text: string;
  responseFormat: "text" | "json";
  object?: unknown;
}) {
  const baseValue = {
    artifactId: args.artifactId,
    text: args.text,
    prompt: args.text,
    responseFormat: args.responseFormat,
    ...(args.object !== undefined ? { json: args.object } : {}),
  };

  return [
    {
      nodeId: args.nodeId,
      port: "text",
      artifactIds: [args.artifactId],
      value: baseValue,
    },
    ...(args.object !== undefined
      ? [{
          nodeId: args.nodeId,
          port: "json",
          artifactIds: [args.artifactId],
          value: {
            artifactId: args.artifactId,
            json: args.object,
            text: args.text,
            responseFormat: args.responseFormat,
          },
        }]
      : []),
    {
      nodeId: args.nodeId,
      port: "prompt",
      artifactIds: [args.artifactId],
      value: {
        artifactId: args.artifactId,
        prompt: args.text,
        text: args.text,
        responseFormat: args.responseFormat,
      },
    },
  ];
}

function textFieldFromObject(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return textFromInputValue((value as Record<string, unknown>)[key]);
}

function agentOutputText(args: {
  object: unknown;
  fallbackText: string;
  outputKind: WorkflowAgentOutputKind;
}): string {
  return textFieldFromObject(args.object, args.outputKind) ??
    textFieldFromObject(args.object, "text") ??
    textFieldFromObject(args.object, "prompt") ??
    textFieldFromObject(args.object, "script") ??
    textFieldFromObject(args.object, "analysis") ??
    args.fallbackText.trim();
}

function agentOutputRefsForNode(args: {
  nodeId: string;
  artifactId: Id<"artifacts">;
  text: string;
  object: unknown;
  outputKind: WorkflowAgentOutputKind;
}) {
  const commonValue = {
    artifactId: args.artifactId,
    outputKind: args.outputKind,
    text: args.text,
    [args.outputKind]: args.text,
    ...(args.outputKind === "prompt" ? { prompt: args.text } : {}),
    json: args.object,
  };
  return [
    {
      nodeId: args.nodeId,
      port: "text",
      artifactIds: [args.artifactId],
      value: commonValue,
    },
    {
      nodeId: args.nodeId,
      port: "json",
      artifactIds: [args.artifactId],
      value: {
        artifactId: args.artifactId,
        outputKind: args.outputKind,
        json: args.object,
        text: args.text,
      },
    },
    {
      nodeId: args.nodeId,
      port: args.outputKind,
      artifactIds: [args.artifactId],
      value: commonValue,
    },
  ];
}

function imageOutputRefsForNode(
  nodeId: string,
  images: MediaNodeItemForRun[]
) {
  const artifactIds = images
    .filter((item) => item.source === "artifact")
    .map((item) => item.id as Id<"artifacts">);

  return [{
    nodeId,
    port: "image",
    ...(artifactIds.length ? { artifactIds } : {}),
    value: {
      kind: "image",
      items: images,
      count: images.length,
    },
  }];
}

function videoOutputRefsForNode(
  nodeId: string,
  videos: MediaNodeItemForRun[]
) {
  const artifactIds = videos
    .filter((item) => item.source === "artifact")
    .map((item) => item.id as Id<"artifacts">);

  return [{
    nodeId,
    port: "video",
    ...(artifactIds.length ? { artifactIds } : {}),
    value: {
      kind: "video",
      items: videos,
      count: videos.length,
    },
  }];
}

function audioOutputRefsForNode(
  nodeId: string,
  audios: MediaNodeItemForRun[]
) {
  const artifactIds = audios
    .filter((item) => item.source === "artifact")
    .map((item) => item.id as Id<"artifacts">);

  return [{
    nodeId,
    port: "audio",
    ...(artifactIds.length ? { artifactIds } : {}),
    value: {
      kind: "audio",
      items: audios,
      count: audios.length,
    },
  }];
}

function artifactIdsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): Id<"artifacts">[] {
  const ids = new Set<string>();
  const inputs = resolvedInputs.inputs ?? {};
  const orderedInputs = [
    ...preferredKeys.flatMap((key) => (inputs[key] ? [[key, inputs[key]] as const] : [])),
    ...Object.entries(inputs).filter(([key]) => !preferredKeys.includes(key)),
  ];

  for (const [, input] of orderedInputs) {
    for (const artifactId of input.artifactIds ?? []) {
      ids.add(artifactId);
    }
  }

  return [...ids] as Id<"artifacts">[];
}

async function artifactsForIds(
  ctx: ActionCtx,
  artifactIds: Id<"artifacts">[]
): Promise<ArtifactDocForRun[]> {
  const artifacts: ArtifactDocForRun[] = [];
  const seen = new Set<string>();

  for (const artifactId of artifactIds) {
    if (seen.has(String(artifactId))) continue;
    seen.add(String(artifactId));
    const artifact = await ctx.runQuery(internal.artifacts.records.getForRunner, {
      artifactId,
    });
    if (artifact) artifacts.push(artifact);
  }

  return artifacts;
}

function postPackageArtifactIdsFromInputs(
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

function postPackageDataForNode(args: {
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
  const mediaSummary = {
    total: mediaItems.length,
    slideshowCount: mediaItems.filter((item) => item.role === "slideshow").length,
    videoCount: mediaItems.filter((item) => item.role === "video").length,
    imageCount: mediaItems.filter((item) => item.role === "image").length,
    audioCount: mediaItems.filter((item) => item.role === "audio").length,
  };
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

function postPackageOutputRefsForNode(args: {
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

function postPackageDataForWorkflowFallback(args: {
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
  const mediaSummary = {
    total: mediaItems.length,
    slideshowCount: mediaItems.filter((item) => item.role === "slideshow").length,
    videoCount: mediaItems.filter((item) => item.role === "video").length,
    imageCount: mediaItems.filter((item) => item.role === "image").length,
    audioCount: mediaItems.filter((item) => item.role === "audio").length,
  };
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

function exportDestinationForNode(
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

function exportRecordForNode(args: {
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

function exportedPackageData(args: {
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

function exportOutputRefsForNode(args: {
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

function socialAccountIdsFromInputs(
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

function packageMediaArtifactIdsFromData(
  packageArtifact: ArtifactDocForRun
): Id<"artifacts">[] {
  const data = objectValue(packageArtifact.data);
  const mediaArtifactIds = stringArrayFromConfig(data.mediaArtifactIds);
  return mediaArtifactIds.length
    ? mediaArtifactIds as Id<"artifacts">[]
    : [packageArtifact._id];
}

function captionFromPackageArtifact(
  packageArtifact: ArtifactDocForRun,
  fallback?: string
): string | undefined {
  const data = objectValue(packageArtifact.data);
  return stringFromValue(data.caption) ?? fallback;
}

function autoPostScheduleForNode(
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

function autoPublishEnabled(
  node: WorkflowGraphNodeForRun,
  resolvedInputs: ResolvedInputsForRun
): boolean {
  const config = objectValue(node.config);
  const value = resolvedInputs.inputs?.autoPublish?.value ?? config.autoPublish;
  return value === true;
}

function autoPostPackageData(args: {
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

function autoPostOutputRefsForNode(args: {
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

function mediaOutputRefsForNode(
  nodeId: string,
  items: MediaNodeItemForRun[]
) {
  return mediaNodeOutputPorts().flatMap((port) => {
    const matchingItems =
      port === "media"
        ? items
        : items.filter((item) => item.kind === port);
    if (!matchingItems.length) return [];

    const artifactIds = matchingItems
      .filter((item) => item.source === "artifact")
      .map((item) => item.id as Id<"artifacts">);

    return [{
      nodeId,
      port,
      ...(artifactIds.length ? { artifactIds } : {}),
      value: {
        kind: port,
        items: matchingItems,
        count: matchingItems.length,
      },
    }];
  });
}

function stringArrayFromConfig(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function mediaKindFromMimeType(mimeType?: string): MediaKindForRun {
  if (!mimeType) return "media";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "media";
}

function mediaKindFromArtifact(artifact: {
  type: string;
  data?: unknown;
}): MediaKindForRun {
  const data = objectValue(artifact.data);
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : undefined;
  const mimeKind = mediaKindFromMimeType(mimeType);
  if (mimeKind !== "media") return mimeKind;

  if (artifact.type === "image" || artifact.type === "thumbnail") return "image";
  if (artifact.type === "video") return "video";
  return "media";
}

function mediaKindFromAsset(asset: { mediaType: string }): MediaKindForRun {
  if (
    asset.mediaType === "image" ||
    asset.mediaType === "video" ||
    asset.mediaType === "audio"
  ) {
    return asset.mediaType;
  }

  return "media";
}

function uploadedMediaItemsFromConfig(value: unknown): MediaNodeItemForRun[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index): MediaNodeItemForRun[] => {
    if (typeof item === "string" && item.trim()) {
      return [{
        id: `uploaded:${index}`,
        source: "uploaded",
        kind: "media",
        storageUrl: item.trim(),
      } satisfies MediaNodeItemForRun];
    }

    const record = objectValue(item);
    const storageUrl = record.storageUrl ?? record.url;
    if (typeof storageUrl !== "string" || !storageUrl.trim()) return [];
    const mimeType = typeof record.mimeType === "string" ? record.mimeType : undefined;
    const configuredKind = record.kind;
    const kind =
      configuredKind === "image" ||
      configuredKind === "video" ||
      configuredKind === "audio" ||
      configuredKind === "media"
        ? configuredKind
        : mediaKindFromMimeType(mimeType);

    return [{
      id: typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `uploaded:${index}`,
      source: "uploaded",
      kind,
      title: typeof record.title === "string" ? record.title : undefined,
      storageUrl: storageUrl.trim(),
      metadata: record,
    } satisfies MediaNodeItemForRun];
  });
}

export const executeRun = internalAction({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.workflows.runs.getExecutionContext, {
      runId: args.runId,
    });
    if (!context) {
      throw new Error("Workflow run context not found");
    }

    const graph = context.workflow.graph;
    const runnableNodeIds = runnableNodeIdsForGraph(graph);
    const runnableNodes = graph.nodes.filter((node) => runnableNodeIds.has(node.id));
    const dependencyNodeIdsByNode = dependencyNodeIdsForGraph(graph);
    const pendingNodeIds = new Set(runnableNodes.map((node) => node.id));
    const completedNodeIds = new Set<string>();
    const emittedArtifactIds = new Set<Id<"artifacts">>();
    const finalPackageArtifactIds = new Set<Id<"artifacts">>();
    let executedNodeCount = 0;
    let passCount = 0;
    let totalCostUsd = 0;

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "running",
      ...(runnableNodes[0] ? { currentNodeId: runnableNodes[0].id } : {}),
    });

    if (!runnableNodes.length) {
      const message = "Workflow graph has no nodes reachable from the runner.";
      await ctx.runMutation(internal.workflows.runs.recordEvent, {
        userId: context.run.userId,
        workflowRunId: context.run._id,
        workflowId: context.workflow._id,
        type: "error",
        message,
      });
      await ctx.runMutation(internal.workflows.runs.transitionRun, {
        runId: context.run._id,
        status: "failed",
        errorMessage: message,
        completedAt: Date.now(),
      });
      return;
    }

    while (pendingNodeIds.size) {
      passCount += 1;
      const readyNodes = readyNodesForPass(
        runnableNodes,
        dependencyNodeIdsByNode,
        pendingNodeIds,
        completedNodeIds
      );

      if (!readyNodes.length) {
        const message =
          "Workflow graph executor could not find a runnable node. Check for invalid dependencies.";
        await ctx.runMutation(internal.workflows.runs.recordEvent, {
          userId: context.run.userId,
          workflowRunId: context.run._id,
          workflowId: context.workflow._id,
          type: "error",
          message,
          data: {
            pendingNodeIds: [...pendingNodeIds].sort(),
            completedNodeIds: [...completedNodeIds].sort(),
          },
        });
        await ctx.runMutation(internal.workflows.runs.transitionRun, {
          runId: context.run._id,
          status: "failed",
          errorMessage: message,
          completedAt: Date.now(),
        });
        return;
      }

      for (const node of readyNodes) {
        await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
          runId: context.run._id,
          nodeId: node.id,
          status: "queued",
        });
      }

      for (const node of readyNodes) {
        try {
          const resolvedInputs = await ctx.runQuery(
            internal.workflows.inputResolver.resolveForNode,
            {
              runId: context.run._id,
              nodeId: node.id,
            }
          );

          await ctx.runMutation(internal.workflows.runs.transitionRun, {
            runId: context.run._id,
            status: "running",
            currentNodeId: node.id,
          });
          await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
            runId: context.run._id,
            nodeId: node.id,
            status: "running",
          });
          await ctx.runMutation(internal.workflows.runs.recordEvent, {
            userId: context.run.userId,
            workflowRunId: context.run._id,
            workflowId: context.workflow._id,
            type: "node_started",
            nodeId: node.id,
            message: `${node.label} started.`,
            data: {
              nodeType: node.type,
              inputSummary: resolvedInputs.summary,
              placeholderExecution: !isImplementedNode(node),
            },
          });

          if (isMediaNode(node)) {
            const mediaItems = await ctx.runQuery(
              internal.workflows.runner.resolveMediaNodeItems,
              {
                runId: context.run._id,
                nodeId: node.id,
              }
            );
            const outputRefs = mediaOutputRefsForNode(node.id, mediaItems);

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd: 0,
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} exposed ${mediaItems.length} media reference${mediaItems.length === 1 ? "" : "s"}.`,
              data: {
                nodeType: node.type,
                mediaCount: mediaItems.length,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isLlmNode(node)) {
            const config = objectValue(node.config);
            const inputs = resolvedInputs.inputs ?? {};
            const providerName = modelProviderNameForNode(node);
            const provider = getModelProvider(providerName);
            const responseFormat = llmResponseFormat(inputs.responseFormat?.value);
            const promptFromInputNode = config.promptFromInputNode === true;
            const prompt = promptFromInputNode && inputs.prompt?.source === "config"
              ? ""
              : textFromInputValue(inputs.prompt?.value);
            const contextText = textFromInputValue(inputs.context?.value);
            const systemPrompt = textFromInputValue(inputs.systemPrompt?.value);
            const userPrompt = [contextText ? `Context:\n${contextText}` : undefined, prompt]
              .filter(Boolean)
              .join("\n\n");
            const model =
              typeof node.model === "string" && node.model.trim()
                ? node.model.trim()
                : textFromInputValue(inputs.model?.value);
            const temperature = numberFromInputValue(inputs.temperature?.value);
            const maxTokens = numberFromInputValue(inputs.maxTokens?.value);
            const providerOverrides = providerOverridesFromConfig(config);
            const providerMetadata = {
              workflowId: String(context.workflow._id),
              workflowRunId: String(context.run._id),
              nodeId: node.id,
              nodeType: node.type,
              ...(Object.keys(providerOverrides).length
                ? { bulkapisInput: providerOverrides }
                : {}),
            };

            if (!userPrompt.trim()) {
              throw new Error(`${node.label} needs a prompt or context input.`);
            }
            if (!provider.capabilities.text) {
              throw new Error(`${provider.displayName} does not support text generation.`);
            }
            if (responseFormat === "json" && !provider.capabilities.structured) {
              throw new Error(`${provider.displayName} does not support structured generation.`);
            }

            const textResult =
              responseFormat === "json"
                ? await provider.generateStructured<unknown>({
                    prompt: userPrompt,
                    systemPrompt,
                    model,
                    temperature,
                    maxTokens,
                    schema: config.schema ?? config.jsonSchema ?? config.outputSchema,
                    schemaName:
                      typeof config.schemaName === "string" && config.schemaName.trim()
                        ? config.schemaName.trim()
                        : "workflow_llm_output",
                    metadata: providerMetadata,
                  })
                : await provider.generateText({
                    prompt: userPrompt,
                    systemPrompt,
                    model,
                    temperature,
                    maxTokens,
                    metadata: providerMetadata,
                  });
            const outputText = textResult.text.trim();
            const outputObject = "object" in textResult ? textResult.object : undefined;
            const lifecycle = placeholderLifecycleForNode(graph, node);
            const artifactId = await ctx.runMutation(
              internal.artifacts.records.createFromRunner,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                parentArtifactIds: artifactIdsFromInputs(resolvedInputs, [
                  "context",
                  "input",
                ]),
                type: "text_draft",
                title: `${node.label} output`,
                data: {
                  nodeId: node.id,
                  nodeType: node.type,
                  responseFormat,
                  text: outputText,
                  ...(outputObject !== undefined ? { json: outputObject } : {}),
                  inputSummary: resolvedInputs.summary,
                  providerMetadata: textResult.metadata,
                },
                provider: textResult.metadata.provider,
                model: textResult.metadata.model,
                prompt: userPrompt,
                lifecycle,
                reviewStatus: "not_required",
              }
            );
            emittedArtifactIds.add(artifactId);

            const outputRefs = llmOutputRefsForNode({
              nodeId: node.id,
              artifactId,
              text: outputText,
              responseFormat,
              object: outputObject,
            });
            const costUsd = textResult.metadata.costUsd ?? 0;
            totalCostUsd += costUsd;

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd,
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "model_call",
              nodeId: node.id,
              message: `${node.label} called ${provider.displayName}.`,
              data: {
                provider: textResult.metadata.provider,
                model: textResult.metadata.model,
                usage: textResult.metadata.usage,
                costUsd,
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} generated ${responseFormat === "json" ? "structured output" : "text"}.`,
              data: {
                nodeType: node.type,
                lifecycle,
                artifactId,
                provider: textResult.metadata.provider,
                model: textResult.metadata.model,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isAiAgentNode(node)) {
            const config = objectValue(node.config);
            const inputs = resolvedInputs.inputs ?? {};
            const preset = getWorkflowAgentPreset(inputs.agentMode?.value);
            const providerName = modelProviderNameForNode(node);
            const provider = getModelProvider(providerName);
            const requestFromInputNode = config.requestFromInputNode === true;
            const request = requestFromInputNode && inputs.request?.source === "config"
              ? undefined
              : textFromInputValue(inputs.request?.value);
            const contextText = textFromInputValue(inputs.context?.value);
            const mediaText = textFromInputValue(inputs.media?.value);
            const model =
              typeof node.model === "string" && node.model.trim()
                ? node.model.trim()
                : textFromInputValue(inputs.model?.value);
            const temperature = numberFromInputValue(inputs.temperature?.value);
            const maxTokens = numberFromInputValue(inputs.maxTokens?.value);
            const customSystemPrompt = textFromInputValue(inputs.systemPrompt?.value);
            const systemPrompt = [preset.systemPrompt, customSystemPrompt]
              .filter(Boolean)
              .join("\n\n");
            const userPrompt = buildWorkflowAgentPrompt(preset, {
              request,
              contextText,
              mediaText,
              config,
            });
            const providerOverrides = providerOverridesFromConfig(config);
            const providerMetadata = {
              workflowId: String(context.workflow._id),
              workflowRunId: String(context.run._id),
              nodeId: node.id,
              nodeType: node.type,
              agentPreset: preset.id,
              ...(Object.keys(providerOverrides).length
                ? { bulkapisInput: providerOverrides }
                : {}),
            };

            if (![request, contextText, mediaText].some((value) => value?.trim())) {
              throw new Error(`${node.label} needs a request, context, or media input.`);
            }
            if (!provider.capabilities.structured) {
              throw new Error(`${provider.displayName} does not support structured generation.`);
            }

            const structuredResult = await provider.generateStructured<unknown>({
              prompt: userPrompt,
              systemPrompt,
              model,
              temperature,
              maxTokens,
              schemaName: `${preset.id}_agent_output`,
              metadata: providerMetadata,
            });
            const outputText = agentOutputText({
              object: structuredResult.object,
              fallbackText: structuredResult.text,
              outputKind: preset.outputKind,
            });
            const lifecycle = placeholderLifecycleForNode(graph, node);
            const artifactId = await ctx.runMutation(
              internal.artifacts.records.createFromRunner,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                parentArtifactIds: artifactIdsFromInputs(resolvedInputs, [
                  "media",
                  "context",
                  "input",
                ]),
                type: preset.artifactType,
                title: `${node.label} ${preset.label} output`,
                data: {
                  nodeId: node.id,
                  nodeType: node.type,
                  agentPreset: preset.id,
                  outputKind: preset.outputKind,
                  text: outputText,
                  json: structuredResult.object,
                  inputSummary: resolvedInputs.summary,
                  providerMetadata: structuredResult.metadata,
                },
                provider: structuredResult.metadata.provider,
                model: structuredResult.metadata.model,
                prompt: userPrompt,
                lifecycle,
                reviewStatus: "not_required",
              }
            );
            emittedArtifactIds.add(artifactId);

            const outputRefs = agentOutputRefsForNode({
              nodeId: node.id,
              artifactId,
              text: outputText,
              object: structuredResult.object,
              outputKind: preset.outputKind,
            });
            const costUsd = structuredResult.metadata.costUsd ?? 0;
            totalCostUsd += costUsd;

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd,
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "model_call",
              nodeId: node.id,
              message: `${node.label} ran ${preset.label}.`,
              data: {
                provider: structuredResult.metadata.provider,
                model: structuredResult.metadata.model,
                usage: structuredResult.metadata.usage,
                costUsd,
                agentPreset: preset.id,
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} produced ${preset.outputKind} output.`,
              data: {
                nodeType: node.type,
                lifecycle,
                artifactId,
                provider: structuredResult.metadata.provider,
                model: structuredResult.metadata.model,
                agentPreset: preset.id,
                outputKind: preset.outputKind,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isImageGenerationNode(node)) {
            const config = objectValue(node.config);
            const inputs = resolvedInputs.inputs ?? {};
            const providerName = modelProviderNameForNode(node);
            const provider = getModelProvider(providerName);
            const model =
              typeof node.model === "string" && node.model.trim()
                ? node.model.trim()
                : textFromInputValue(inputs.model?.value);
            const providerModel = model
              ? await ctx.runQuery(internal.providers.modelCatalog.getByProviderModelForRun, {
                  provider: providerName,
                  modelId: model,
                })
              : null;
            const imageContract = imageModelUiContractForRun(providerModel);
            const promptFromInputNode = config.promptFromInputNode === true;
            const imageFromInputNode = config.imageFromInputNode === true;
            const prompt =
              imageContract.prompt.visible === false ||
              (promptFromInputNode && inputs.prompt?.source === "config")
                ? ""
                : textFromInputValue(inputs.prompt?.value);
            const aspectRatio = textFromInputValue(inputs.aspectRatio?.value);
            const count = Math.max(1, Math.floor(numberFromInputValue(inputs.count?.value) ?? 1));
            const referenceImages = referenceAssetsFromInputs(
              resolvedInputs,
              imageFromInputNode
                ? ["reference_image", "image", "media"]
                : ["localReferenceImages", "reference_image", "image", "media"]
            );
            const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
              "reference_image",
              "image",
              "media",
              "input",
            ]);
            const providerInput = generationProviderInputFromConfig(config, [
              "prompt",
              "aspectRatio",
              "count",
              "promptFromInputNode",
              "imageFromInputNode",
              "localReferenceImages",
            ]);

            if (imageContract.prompt.required && !prompt) {
              throw new Error(
                promptFromInputNode
                  ? `${node.label} needs a prompt from an upstream node.`
                  : `${node.label} needs a prompt.`
              );
            }
            if (imageContract.images.required && !referenceImages.length) {
              throw new Error(
                imageFromInputNode
                  ? `${node.label} needs an image from an upstream node.`
                  : `${node.label} needs a reference image.`
              );
            }
            if (imageContract.images.maxCount && referenceImages.length > imageContract.images.maxCount) {
              throw new Error(
                `${node.label} allows up to ${imageContract.images.maxCount} reference image${imageContract.images.maxCount === 1 ? "" : "s"}.`
              );
            }
            if (!provider.capabilities.image) {
              throw new Error(`${provider.displayName} does not support image generation.`);
            }

            const imageResult = await provider.generateImage({
              prompt: prompt ?? "",
              model,
              aspectRatio,
              count,
              referenceImages: referenceImages.length ? referenceImages : undefined,
              metadata: {
                workflowId: String(context.workflow._id),
                workflowRunId: String(context.run._id),
                nodeId: node.id,
                nodeType: node.type,
                referenceImageCount: referenceImages.length,
                ...(Object.keys(providerInput).length || providerModel
                  ? {
                      bulkapisInput: {
                        ...imageProviderInputFromModelSchema({
                          model: providerModel,
                          referenceImages,
                          count,
                        }),
                        ...providerInput,
                      },
                    }
                  : {}),
              },
            });
            const providerJob = imageResult.jobId
              ? {
                  provider: imageResult.metadata.provider,
                  model: imageResult.metadata.model,
                  externalJobId: imageResult.jobId,
                  status: imageResult.status ?? "queued",
                  submittedAt: Date.now(),
                  raw: imageResult.raw,
                }
              : undefined;

            if (providerJob) {
              await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
                runId: context.run._id,
                nodeId: node.id,
                status: "running",
                providerJob,
              });
            }

            const generatedAssets = [...imageResult.images];
            if (!generatedAssets.length && imageResult.jobId) {
              generatedAssets.push(
                await waitForGeneratedImage(
                  provider,
                  {
                    jobId: imageResult.jobId,
                    model: imageResult.metadata.model,
                    metadata: imageResult.metadata,
                  },
                  async (status) => {
                    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
                      runId: context.run._id,
                      nodeId: node.id,
                      status: "running",
                      providerJob: {
                        provider: imageResult.metadata.provider,
                        model: imageResult.metadata.model,
                        externalJobId: imageResult.jobId!,
                        status,
                        ...(status === "succeeded" ? { completedAt: Date.now() } : {}),
                      },
                    });
                  }
                )
              );
            }

            if (!generatedAssets.length) {
              throw new Error(`${node.label} did not return any images.`);
            }

            const lifecycle = placeholderLifecycleForNode(graph, node);
            const imageItems: MediaNodeItemForRun[] = [];
            for (const [index, image] of generatedAssets.entries()) {
              if (!image.mimeType.startsWith("image/")) continue;

              const stored = await storeGeneratedAsset(ctx, image);
              const artifactId = await ctx.runMutation(
                internal.artifacts.records.createFromRunner,
                {
                  userId: context.run.userId,
                  brandId: context.run.brandId,
                  workflowId: context.workflow._id,
                  workflowRunId: context.run._id,
                  parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
                  type: "image",
                  title: `${node.label} image ${index + 1}`,
                  storageUrl: stored.storageUrl,
                  data: {
                    storageId: stored.storageId,
                    mimeType: stored.mimeType,
                    fileSize: stored.byteLength,
                    aspectRatio,
                    sourceMimeType: image.mimeType,
                    jobId: imageResult.jobId,
                    status: "succeeded",
                    referenceImageCount: referenceImages.length,
                    inputSummary: resolvedInputs.summary,
                    providerMetadata: imageResult.metadata,
                  },
                  provider: imageResult.metadata.provider,
                  model: imageResult.metadata.model,
                  prompt,
                  lifecycle,
                  reviewStatus: "not_required",
                }
              );
              emittedArtifactIds.add(artifactId);
              imageItems.push({
                id: String(artifactId),
                source: "artifact",
                kind: "image",
                title: `${node.label} image ${index + 1}`,
                storageUrl: stored.storageUrl,
                metadata: {
                  mimeType: stored.mimeType,
                  fileSize: stored.byteLength,
                  provider: imageResult.metadata.provider,
                  model: imageResult.metadata.model,
                },
              });
            }

            if (!imageItems.length) {
              throw new Error(`${node.label} returned assets but none were images.`);
            }

            const outputRefs = imageOutputRefsForNode(node.id, imageItems);
            const costUsd = imageResult.metadata.costUsd ?? 0;
            totalCostUsd += costUsd;

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd,
              ...(imageResult.jobId
                ? {
                    providerJob: {
                      provider: imageResult.metadata.provider,
                      model: imageResult.metadata.model,
                      externalJobId: imageResult.jobId,
                      status: "succeeded",
                      completedAt: Date.now(),
                    },
                  }
                : {}),
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "model_call",
              nodeId: node.id,
              message: `${node.label} generated ${imageItems.length} image${imageItems.length === 1 ? "" : "s"}.`,
              data: {
                provider: imageResult.metadata.provider,
                model: imageResult.metadata.model,
                usage: imageResult.metadata.usage,
                costUsd,
                jobId: imageResult.jobId,
                status: imageResult.status,
                referenceImageCount: referenceImages.length,
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} produced ${imageItems.length} image output${imageItems.length === 1 ? "" : "s"}.`,
              data: {
                nodeType: node.type,
                lifecycle,
                artifactIds: imageItems.map((item) => item.id),
                provider: imageResult.metadata.provider,
                model: imageResult.metadata.model,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isVideoGenerationNode(node)) {
            const config = objectValue(node.config);
            const inputs = resolvedInputs.inputs ?? {};
            const providerName = modelProviderNameForNode(node);
            const provider = getModelProvider(providerName);
            const promptFromInputNode = config.promptFromInputNode === true;
            const imageFromInputNode = config.imageFromInputNode === true;
            const prompt = promptFromInputNode && inputs.prompt?.source === "config"
              ? ""
              : textFromInputValue(inputs.prompt?.value);
            const model =
              typeof node.model === "string" && node.model.trim()
                ? node.model.trim()
                : textFromInputValue(inputs.model?.value);
            const aspectRatio = textFromInputValue(inputs.aspectRatio?.value);
            const durationSeconds = numberFromInputValue(inputs.durationSeconds?.value);
            const startFrameAssets = referenceAssetsFromInputs(resolvedInputs, [
              "start_frame",
              "startFrameUrl",
            ]);
            const endFrameAssets = referenceAssetsFromInputs(resolvedInputs, [
              "end_frame",
              "endFrameUrl",
            ]);
            const imageAssets = referenceAssetsFromInputs(resolvedInputs, [
              ...(imageFromInputNode ? [] : ["localReferenceImages"]),
              "image",
              "imageUrl",
              "reference_image",
              "media",
            ]);
            const referenceImages = uniqueReferenceAssets([
              ...startFrameAssets,
              ...endFrameAssets,
              ...imageAssets,
            ]);
            const referenceVideos = referenceVideoAssetsFromInputs(resolvedInputs, [
              ...(imageFromInputNode ? [] : ["localReferenceVideos"]),
              "reference_video",
              "referenceVideoUrl",
              "video",
              "videoUrl",
              "media",
            ]);
            const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
              "localReferenceImages",
              "localReferenceVideos",
              "image",
              "start_frame",
              "end_frame",
              "reference_video",
              "video",
              "media",
              "input",
            ]);
            const providerInput = generationProviderInputFromConfig(config, [
              "prompt",
              "promptFromInputNode",
              "imageFromInputNode",
              "localReferenceImages",
              "localReferenceVideos",
              "aspectRatio",
              "durationSeconds",
              "imageUrl",
              "startFrameUrl",
              "endFrameUrl",
              "referenceVideoUrl",
              "videoUrl",
            ]);
            const startFrameUrl = startFrameAssets[0]?.url;
            const endFrameUrl = endFrameAssets[0]?.url;
            const referenceVideoUrl = referenceVideos[0]?.url;
            if (startFrameUrl) {
              providerInput.start_frame_url = startFrameUrl;
              providerInput.start_image_url = startFrameUrl;
            }
            if (endFrameUrl) {
              providerInput.end_frame_url = endFrameUrl;
              providerInput.end_image_url = endFrameUrl;
            }
            if (referenceVideoUrl) {
              providerInput.reference_video_url = referenceVideoUrl;
              providerInput.video_url = providerInput.video_url ?? referenceVideoUrl;
            }
            if (referenceVideos.length > 1) {
              providerInput.reference_video_urls = referenceVideos.flatMap((asset) =>
                asset.url ? [asset.url] : []
              );
            }

            if (!prompt) {
              throw new Error(`${node.label} needs a prompt input.`);
            }
            if (!provider.capabilities.video) {
              throw new Error(`${provider.displayName} does not support video generation.`);
            }

            const providerMetadata = {
              workflowId: String(context.workflow._id),
              workflowRunId: String(context.run._id),
              nodeId: node.id,
              nodeType: node.type,
              referenceImageCount: referenceImages.length,
              referenceVideoCount: referenceVideos.length,
              ...(Object.keys(providerInput).length
                ? {
                    arguments: providerInput,
                    bulkapisInput: providerInput,
                  }
                : {}),
            };
            const videoResult = await provider.generateVideo({
              prompt,
              model,
              aspectRatio,
              durationSeconds,
              referenceImages: referenceImages.length ? referenceImages : undefined,
              metadata: providerMetadata,
            });
            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "running",
              providerJob: {
                provider: videoResult.metadata.provider,
                model: videoResult.metadata.model,
                externalJobId: videoResult.jobId,
                status: videoResult.status,
                submittedAt: Date.now(),
                raw: videoResult.raw,
              },
            });

            const videoAsset = await waitForGeneratedVideo(
              provider,
              {
                jobId: videoResult.jobId,
                model: videoResult.metadata.model,
                metadata: videoResult.metadata,
              },
              async (status) => {
                await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
                  runId: context.run._id,
                  nodeId: node.id,
                  status: "running",
                  providerJob: {
                    provider: videoResult.metadata.provider,
                    model: videoResult.metadata.model,
                    externalJobId: videoResult.jobId,
                    status,
                    ...(status === "succeeded" ? { completedAt: Date.now() } : {}),
                  },
                });
              }
            );
            const lifecycle = placeholderLifecycleForNode(graph, node);
            const stored = await storeGeneratedAsset(ctx, videoAsset);
            const artifactId = await ctx.runMutation(
              internal.artifacts.records.createFromRunner,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
                type: "video",
                title: `${node.label} video`,
                storageUrl: stored.storageUrl,
                data: {
                  storageId: stored.storageId,
                  mimeType: stored.mimeType,
                  fileSize: stored.byteLength,
                  aspectRatio,
                  durationSeconds,
                  sourceMimeType: videoAsset.mimeType,
                  jobId: videoResult.jobId,
                  status: "succeeded",
                  referenceImageCount: referenceImages.length,
                  referenceVideoCount: referenceVideos.length,
                  inputSummary: resolvedInputs.summary,
                  providerMetadata: videoResult.metadata,
                },
                provider: videoResult.metadata.provider,
                model: videoResult.metadata.model,
                prompt,
                lifecycle,
                reviewStatus: "not_required",
              }
            );
            emittedArtifactIds.add(artifactId);

            const videoItems: MediaNodeItemForRun[] = [{
              id: String(artifactId),
              source: "artifact",
              kind: "video",
              title: `${node.label} video`,
              storageUrl: stored.storageUrl,
              metadata: {
                mimeType: stored.mimeType,
                fileSize: stored.byteLength,
                provider: videoResult.metadata.provider,
                model: videoResult.metadata.model,
              },
            }];
            const outputRefs = videoOutputRefsForNode(node.id, videoItems);
            const costUsd = videoResult.metadata.costUsd ?? 0;
            totalCostUsd += costUsd;

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd,
              providerJob: {
                provider: videoResult.metadata.provider,
                model: videoResult.metadata.model,
                externalJobId: videoResult.jobId,
                status: "succeeded",
                completedAt: Date.now(),
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "model_call",
              nodeId: node.id,
              message: `${node.label} generated a video.`,
              data: {
                provider: videoResult.metadata.provider,
                model: videoResult.metadata.model,
                usage: videoResult.metadata.usage,
                costUsd,
                jobId: videoResult.jobId,
                status: videoResult.status,
                referenceImageCount: referenceImages.length,
                referenceVideoCount: referenceVideos.length,
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} produced a video output.`,
              data: {
                nodeType: node.type,
                lifecycle,
                artifactId,
                provider: videoResult.metadata.provider,
                model: videoResult.metadata.model,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isAudioGenerationNode(node)) {
            const config = objectValue(node.config);
            const inputs = resolvedInputs.inputs ?? {};
            const providerName = modelProviderNameForNode(node);
            const provider = getModelProvider(providerName);
            const textFromInputNode = config.textFromInputNode === true;
            const voiceFromInputNode = config.voiceFromInputNode === true;
            const text =
              (textFromInputNode && inputs.text?.source === "config"
                ? undefined
                : textFromInputValue(inputs.text?.value)) ??
              textFromInputValue(inputs.prompt?.value) ??
              textFromInputValue(inputs.input?.value);
            const mode = textFromInputValue(inputs.mode?.value);
            const model =
              typeof node.model === "string" && node.model.trim()
                ? node.model.trim()
                : textFromInputValue(inputs.model?.value);
            const voiceReferenceAudios = referenceAudioAssetsFromInputs(resolvedInputs, [
              ...(voiceFromInputNode ? [] : ["localReferenceAudios"]),
              "voice_reference",
              "audio",
              "voiceReferenceUrl",
              "audioUrl",
              "media",
            ]);
            const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
              "localReferenceAudios",
              "voice_reference",
              "audio",
              "media",
              "input",
            ]);
            const providerInput = generationProviderInputFromConfig(config, [
              "text",
              "textFromInputNode",
              "mode",
              "voice",
              "voiceFromInputNode",
              "localReferenceAudios",
              "voiceReferenceUrl",
              "audioUrl",
            ]);
            const voiceReferenceUrl = voiceReferenceAudios[0]?.url;
            if (voiceReferenceUrl) {
              providerInput.audio_url = voiceReferenceUrl;
            }
            if (voiceReferenceAudios.length > 1) {
              providerInput.audio_urls = voiceReferenceAudios.flatMap((asset) =>
                asset.url ? [asset.url] : []
              );
            }
            const cfgScale = numberFromInputValue(config.cfgScale);
            if (cfgScale !== undefined && providerInput.cfg === undefined) {
              providerInput.cfg = cfgScale;
            }

            if (!text) {
              throw new Error(`${node.label} needs text input.`);
            }
            if (!provider.capabilities.audio) {
              throw new Error(`${provider.displayName} does not support audio generation.`);
            }

            const audioResult = await provider.generateAudio({
              text,
              model,
              mode,
              voiceReferenceAudios: voiceReferenceAudios.length
                ? voiceReferenceAudios
                : undefined,
              metadata: {
                workflowId: String(context.workflow._id),
                workflowRunId: String(context.run._id),
                nodeId: node.id,
                nodeType: node.type,
                mode,
                voiceReferenceCount: voiceReferenceAudios.length,
                ...(Object.keys(providerInput).length
                  ? {
                      arguments: providerInput,
                      bulkapisInput: providerInput,
                    }
                  : {}),
              },
            });
            const providerJob = audioResult.jobId
              ? {
                  provider: audioResult.metadata.provider,
                  model: audioResult.metadata.model,
                  externalJobId: audioResult.jobId,
                  status: audioResult.status ?? "queued",
                  submittedAt: Date.now(),
                  raw: audioResult.raw,
                }
              : undefined;

            if (providerJob) {
              await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
                runId: context.run._id,
                nodeId: node.id,
                status: "running",
                providerJob,
              });
            }

            const generatedAudios = [...audioResult.audios];
            if (!generatedAudios.length && audioResult.jobId) {
              generatedAudios.push(
                await waitForGeneratedAudio(
                  provider,
                  {
                    jobId: audioResult.jobId,
                    model: audioResult.metadata.model,
                    metadata: audioResult.metadata,
                  },
                  async (status) => {
                    await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
                      runId: context.run._id,
                      nodeId: node.id,
                      status: "running",
                      providerJob: {
                        provider: audioResult.metadata.provider,
                        model: audioResult.metadata.model,
                        externalJobId: audioResult.jobId!,
                        status,
                        ...(status === "succeeded" ? { completedAt: Date.now() } : {}),
                      },
                    });
                  }
                )
              );
            }

            if (!generatedAudios.length) {
              throw new Error(`${node.label} did not return any audio.`);
            }

            const lifecycle = placeholderLifecycleForNode(graph, node);
            const audioItems: MediaNodeItemForRun[] = [];
            for (const [index, audio] of generatedAudios.entries()) {
              if (!audio.mimeType.startsWith("audio/")) continue;

              const stored = await storeGeneratedAsset(ctx, audio);
              const artifactId = await ctx.runMutation(
                internal.artifacts.records.createFromRunner,
                {
                  userId: context.run.userId,
                  brandId: context.run.brandId,
                  workflowId: context.workflow._id,
                  workflowRunId: context.run._id,
                  parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
                  type: "rendered_asset",
                  title: `${node.label} audio ${index + 1}`,
                  storageUrl: stored.storageUrl,
                  data: {
                    kind: "audio",
                    storageId: stored.storageId,
                    mimeType: stored.mimeType,
                    fileSize: stored.byteLength,
                    sourceMimeType: audio.mimeType,
                    jobId: audioResult.jobId,
                    status: "succeeded",
                    mode,
                    voiceReferenceCount: voiceReferenceAudios.length,
                    inputSummary: resolvedInputs.summary,
                    providerMetadata: audioResult.metadata,
                  },
                  provider: audioResult.metadata.provider,
                  model: audioResult.metadata.model,
                  prompt: text,
                  lifecycle,
                  reviewStatus: "not_required",
                }
              );
              emittedArtifactIds.add(artifactId);
              audioItems.push({
                id: String(artifactId),
                source: "artifact",
                kind: "audio",
                title: `${node.label} audio ${index + 1}`,
                storageUrl: stored.storageUrl,
                metadata: {
                  mimeType: stored.mimeType,
                  fileSize: stored.byteLength,
                  provider: audioResult.metadata.provider,
                  model: audioResult.metadata.model,
                  mode,
                },
              });
            }

            if (!audioItems.length) {
              throw new Error(`${node.label} returned assets but none were audio.`);
            }

            const outputRefs = audioOutputRefsForNode(node.id, audioItems);
            const costUsd = audioResult.metadata.costUsd ?? 0;
            totalCostUsd += costUsd;

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd,
              ...(audioResult.jobId
                ? {
                    providerJob: {
                      provider: audioResult.metadata.provider,
                      model: audioResult.metadata.model,
                      externalJobId: audioResult.jobId,
                      status: "succeeded",
                      completedAt: Date.now(),
                    },
                  }
                : {}),
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "model_call",
              nodeId: node.id,
              message: `${node.label} generated ${audioItems.length} audio output${audioItems.length === 1 ? "" : "s"}.`,
              data: {
                provider: audioResult.metadata.provider,
                model: audioResult.metadata.model,
                usage: audioResult.metadata.usage,
                costUsd,
                jobId: audioResult.jobId,
                status: audioResult.status,
                mode,
                voiceReferenceCount: voiceReferenceAudios.length,
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} produced ${audioItems.length} audio output${audioItems.length === 1 ? "" : "s"}.`,
              data: {
                nodeType: node.type,
                lifecycle,
                artifactIds: audioItems.map((item) => item.id),
                provider: audioResult.metadata.provider,
                model: audioResult.metadata.model,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isLipsyncNode(node)) {
            const config = objectValue(node.config);
            const inputs = resolvedInputs.inputs ?? {};
            const providerName = modelProviderNameForNode(node);
            const provider = getModelProvider(providerName);
            const imageFromInputNode = config.imageFromInputNode === true;
            const audioFromInputNode = config.audioFromInputNode === true;
            const model =
              typeof node.model === "string" && node.model.trim()
                ? node.model.trim()
                : textFromInputValue(inputs.model?.value);
            const resolution = textFromInputValue(inputs.resolution?.value);
            const imageReferences = referenceAssetsFromInputs(resolvedInputs, [
              ...(imageFromInputNode ? [] : ["localReferenceImages"]),
              "image",
              "imageUrl",
              "media",
            ]);
            const videoReferences = referenceVideoAssetsFromInputs(resolvedInputs, [
              ...(imageFromInputNode ? [] : ["localReferenceVideos"]),
              "video",
              "videoUrl",
              "media",
            ]);
            const audioReferences = referenceAudioAssetsFromInputs(resolvedInputs, [
              ...(audioFromInputNode ? [] : ["localReferenceAudios"]),
              "audio",
              "audioUrl",
              "media",
            ]);
            const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
              "localReferenceImages",
              "localReferenceVideos",
              "localReferenceAudios",
              "image",
              "video",
              "audio",
              "media",
              "input",
            ]);
            const providerInput = generationProviderInputFromConfig(config, [
              "imageFromInputNode",
              "audioFromInputNode",
              "localReferenceImages",
              "localReferenceVideos",
              "localReferenceAudios",
              "imageUrl",
              "videoUrl",
              "audioUrl",
              "resolution",
            ]);
            if (config.turboMode !== undefined && providerInput.turbo_mode === undefined) {
              providerInput.turbo_mode = Boolean(config.turboMode);
            }
            const image = imageReferences[0];
            const video = videoReferences[0];
            const audio = audioReferences[0];
            if (image?.url) providerInput.image_url = image.url;
            if (video?.url) providerInput.video_url = video.url;
            if (audio?.url) providerInput.audio_url = audio.url;

            if (!audio) {
              throw new Error(`${node.label} needs an audio input.`);
            }
            if (!image && !video) {
              throw new Error(`${node.label} needs an image or video input.`);
            }
            if (!provider.capabilities.lipsync) {
              throw new Error(`${provider.displayName} does not support lipsync generation.`);
            }

            const lipsyncResult = await provider.generateLipsync({
              audio,
              image,
              video,
              model,
              resolution,
              metadata: {
                workflowId: String(context.workflow._id),
                workflowRunId: String(context.run._id),
                nodeId: node.id,
                nodeType: node.type,
                hasImageInput: Boolean(image),
                hasVideoInput: Boolean(video),
                ...(Object.keys(providerInput).length
                  ? {
                      arguments: providerInput,
                      bulkapisInput: providerInput,
                    }
                  : {}),
              },
            });
            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "running",
              providerJob: {
                provider: lipsyncResult.metadata.provider,
                model: lipsyncResult.metadata.model,
                externalJobId: lipsyncResult.jobId,
                status: lipsyncResult.status,
                submittedAt: Date.now(),
                raw: lipsyncResult.raw,
              },
            });

            const videoAsset = await waitForGeneratedVideo(
              provider,
              {
                jobId: lipsyncResult.jobId,
                model: lipsyncResult.metadata.model,
                metadata: lipsyncResult.metadata,
              },
              async (status) => {
                await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
                  runId: context.run._id,
                  nodeId: node.id,
                  status: "running",
                  providerJob: {
                    provider: lipsyncResult.metadata.provider,
                    model: lipsyncResult.metadata.model,
                    externalJobId: lipsyncResult.jobId,
                    status,
                    ...(status === "succeeded" ? { completedAt: Date.now() } : {}),
                  },
                });
              }
            );
            const lifecycle = placeholderLifecycleForNode(graph, node);
            const stored = await storeGeneratedAsset(ctx, videoAsset);
            const artifactId = await ctx.runMutation(
              internal.artifacts.records.createFromRunner,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
                type: "video",
                title: `${node.label} video`,
                storageUrl: stored.storageUrl,
                data: {
                  storageId: stored.storageId,
                  mimeType: stored.mimeType,
                  fileSize: stored.byteLength,
                  sourceMimeType: videoAsset.mimeType,
                  jobId: lipsyncResult.jobId,
                  status: "succeeded",
                  resolution,
                  hasImageInput: Boolean(image),
                  hasVideoInput: Boolean(video),
                  inputSummary: resolvedInputs.summary,
                  providerMetadata: lipsyncResult.metadata,
                },
                provider: lipsyncResult.metadata.provider,
                model: lipsyncResult.metadata.model,
                lifecycle,
                reviewStatus: "not_required",
              }
            );
            emittedArtifactIds.add(artifactId);

            const videoItems: MediaNodeItemForRun[] = [{
              id: String(artifactId),
              source: "artifact",
              kind: "video",
              title: `${node.label} video`,
              storageUrl: stored.storageUrl,
              metadata: {
                mimeType: stored.mimeType,
                fileSize: stored.byteLength,
                provider: lipsyncResult.metadata.provider,
                model: lipsyncResult.metadata.model,
              },
            }];
            const outputRefs = videoOutputRefsForNode(node.id, videoItems);
            const costUsd = lipsyncResult.metadata.costUsd ?? 0;
            totalCostUsd += costUsd;

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd,
              providerJob: {
                provider: lipsyncResult.metadata.provider,
                model: lipsyncResult.metadata.model,
                externalJobId: lipsyncResult.jobId,
                status: "succeeded",
                completedAt: Date.now(),
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "model_call",
              nodeId: node.id,
              message: `${node.label} generated a lip-synced video.`,
              data: {
                provider: lipsyncResult.metadata.provider,
                model: lipsyncResult.metadata.model,
                usage: lipsyncResult.metadata.usage,
                costUsd,
                jobId: lipsyncResult.jobId,
                status: lipsyncResult.status,
                hasImageInput: Boolean(image),
                hasVideoInput: Boolean(video),
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} produced a lip-synced video output.`,
              data: {
                nodeType: node.type,
                lifecycle,
                artifactId,
                provider: lipsyncResult.metadata.provider,
                model: lipsyncResult.metadata.model,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isAiVideoEditorNode(node)) {
            const config = objectValue(node.config);
            const inputs = resolvedInputs.inputs ?? {};
            const providerName = modelProviderNameForNode(node);
            const provider = getModelProvider(providerName);
            const promptFromInputNode = config.promptFromInputNode === true;
            const mediaFromInputNode = config.mediaFromInputNode === true;
            const prompt = promptFromInputNode && inputs.prompt?.source === "config"
              ? ""
              : textFromInputValue(inputs.prompt?.value);
            const systemPrompt = textFromInputValue(inputs.systemPrompt?.value);
            const knowledgeBase = textFromInputValue(inputs.knowledgeBase?.value);
            const model =
              typeof node.model === "string" && node.model.trim()
                ? node.model.trim()
                : textFromInputValue(inputs.model?.value);
            const aspectRatio = textFromInputValue(inputs.aspectRatio?.value);
            const maxDurationSeconds = numberFromInputValue(inputs.maxDurationSeconds?.value);
            const width = numberFromInputValue(inputs.width?.value);
            const height = numberFromInputValue(inputs.height?.value);
            const fps = numberFromInputValue(inputs.fps?.value);
            const mediaAssets = allMediaReferenceAssetsFromInputs(resolvedInputs, [
              ...(mediaFromInputNode ? [] : ["uploadedMedia"]),
              "media",
              "video",
              "image",
              "audio",
              "videoUrl",
              "imageUrl",
              "audioUrl",
            ]);
            const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
              "uploadedMedia",
              "media",
              "video",
              "image",
              "audio",
              "input",
            ]);
            const providerInput = generationProviderInputFromConfig(config, [
              "prompt",
              "promptFromInputNode",
              "mediaFromInputNode",
              "uploadedMedia",
              "systemPrompt",
              "knowledgeBase",
              "aspectRatio",
              "maxDurationSeconds",
              "width",
              "height",
              "fps",
              "videoUrl",
              "imageUrl",
              "audioUrl",
            ]);
            const mediaUrls = mediaAssets.flatMap((asset) => asset.url ? [asset.url] : []);
            if (mediaUrls.length) providerInput.media_urls = mediaUrls;

            if (!prompt) {
              throw new Error(`${node.label} needs a prompt input.`);
            }
            if (!provider.capabilities.videoRender) {
              throw new Error(`${provider.displayName} does not support AI video render.`);
            }

            const renderResult = await provider.generateVideoRender({
              prompt,
              model,
              systemPrompt,
              knowledgeBase,
              mediaAssets: mediaAssets.length ? mediaAssets : undefined,
              aspectRatio,
              width,
              height,
              fps,
              maxDurationSeconds,
              metadata: {
                workflowId: String(context.workflow._id),
                workflowRunId: String(context.run._id),
                nodeId: node.id,
                nodeType: node.type,
                mediaAssetCount: mediaAssets.length,
                ...(Object.keys(providerInput).length
                  ? {
                      arguments: providerInput,
                      bulkapisInput: providerInput,
                    }
                  : {}),
              },
            });
            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "running",
              providerJob: {
                provider: renderResult.metadata.provider,
                model: renderResult.metadata.model,
                externalJobId: renderResult.jobId,
                status: renderResult.status,
                submittedAt: Date.now(),
                raw: renderResult.raw,
              },
            });

            const videoAsset = await waitForGeneratedVideo(
              provider,
              {
                jobId: renderResult.jobId,
                model: renderResult.metadata.model,
                metadata: renderResult.metadata,
              },
              async (status) => {
                await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
                  runId: context.run._id,
                  nodeId: node.id,
                  status: "running",
                  providerJob: {
                    provider: renderResult.metadata.provider,
                    model: renderResult.metadata.model,
                    externalJobId: renderResult.jobId,
                    status,
                    ...(status === "succeeded" ? { completedAt: Date.now() } : {}),
                  },
                });
              }
            );
            const lifecycle = placeholderLifecycleForNode(graph, node);
            const stored = await storeGeneratedAsset(ctx, videoAsset);
            const artifactId = await ctx.runMutation(
              internal.artifacts.records.createFromRunner,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
                type: "video",
                title: `${node.label} render`,
                storageUrl: stored.storageUrl,
                data: {
                  storageId: stored.storageId,
                  mimeType: stored.mimeType,
                  fileSize: stored.byteLength,
                  sourceMimeType: videoAsset.mimeType,
                  jobId: renderResult.jobId,
                  status: "succeeded",
                  aspectRatio,
                  maxDurationSeconds,
                  width,
                  height,
                  fps,
                  mediaAssetCount: mediaAssets.length,
                  inputSummary: resolvedInputs.summary,
                  providerMetadata: renderResult.metadata,
                },
                provider: renderResult.metadata.provider,
                model: renderResult.metadata.model,
                prompt,
                lifecycle,
                reviewStatus: "not_required",
              }
            );
            emittedArtifactIds.add(artifactId);

            const videoItems: MediaNodeItemForRun[] = [{
              id: String(artifactId),
              source: "artifact",
              kind: "video",
              title: `${node.label} render`,
              storageUrl: stored.storageUrl,
              metadata: {
                mimeType: stored.mimeType,
                fileSize: stored.byteLength,
                provider: renderResult.metadata.provider,
                model: renderResult.metadata.model,
              },
            }];
            const outputRefs = videoOutputRefsForNode(node.id, videoItems);
            const costUsd = renderResult.metadata.costUsd ?? 0;
            totalCostUsd += costUsd;

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd,
              providerJob: {
                provider: renderResult.metadata.provider,
                model: renderResult.metadata.model,
                externalJobId: renderResult.jobId,
                status: "succeeded",
                completedAt: Date.now(),
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "model_call",
              nodeId: node.id,
              message: `${node.label} rendered a video.`,
              data: {
                provider: renderResult.metadata.provider,
                model: renderResult.metadata.model,
                usage: renderResult.metadata.usage,
                costUsd,
                jobId: renderResult.jobId,
                status: renderResult.status,
                mediaAssetCount: mediaAssets.length,
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} produced a rendered video output.`,
              data: {
                nodeType: node.type,
                lifecycle,
                artifactId,
                provider: renderResult.metadata.provider,
                model: renderResult.metadata.model,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isNativeSlideshowPlannerNode(node)) {
            const config = objectValue(node.config);
            const inputs = resolvedInputs.inputs ?? {};
            const providerName = modelProviderNameForNode(node);
            const provider = getModelProvider(providerName);
            const promptFromInputNode = config.promptFromInputNode === true;
            const basePrompt = promptFromInputNode && inputs.prompt?.source === "config"
              ? undefined
              : textFromInputValue(inputs.prompt?.value);
            const revisionPrompt = textFromInputValue(inputs.revisionPrompt?.value);
            const requestedRenderingMode = requestedRenderingModeFromValue(
              inputs.renderingMode?.value ?? inputs.renderMode?.value
            );
            const model =
              typeof node.model === "string" && node.model.trim()
                ? node.model.trim()
                : textFromInputValue(inputs.model?.value);
            const imagePromptModel =
              textFromInputValue(inputs.imagePromptModel?.value) ?? model;
            const slideCount = numberFromInputValue(inputs.slideCount?.value);
            const aspectRatio = textFromInputValue(inputs.aspectRatio?.value);
            const platform = textFromInputValue(inputs.platform?.value);
            const tone = textFromInputValue(inputs.tone?.value);
            const brandContext = objectValue(inputs.brand_context?.value);
            const planningBrand = {
              ...context.brand,
              name: textFromInputValue(brandContext.name) ?? context.brand.name,
              audience: textFromInputValue(brandContext.audience) ?? context.brand.audience,
              voice: textFromInputValue(brandContext.voice) ?? context.brand.voice,
              visualStyle:
                textFromInputValue(brandContext.visualStyle) ?? context.brand.visualStyle,
              constraints: Array.isArray(brandContext.constraints)
                ? brandContext.constraints.flatMap((constraint) => {
                    const text = textFromInputValue(constraint);
                    return text ? [text] : [];
                  })
                : context.brand.constraints,
            };
            const references = plannerReferencesFromInputs(resolvedInputs);
            const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
              "media",
              "image",
              "video",
              "audio",
              "input",
            ]);
            const promptSettings = [
              slideCount ? `Target slide count: ${slideCount}` : undefined,
              aspectRatio ? `Target aspect ratio: ${aspectRatio}` : undefined,
              platform ? `Target platform: ${platform}` : undefined,
              tone ? `Tone: ${tone}` : undefined,
            ].filter((line): line is string => Boolean(line));
            const prompt = [
              basePrompt,
              promptSettings.length
                ? `Workflow planner settings:\n${promptSettings.join("\n")}`
                : undefined,
            ].filter((line): line is string => Boolean(line?.trim())).join("\n\n");

            if (!prompt) {
              throw new Error(`${node.label} needs a prompt input.`);
            }
            if (!provider.capabilities.structured) {
              throw new Error(`${provider.displayName} does not support structured generation.`);
            }

            const plannerOutput = await provider.generateStructured<SlideshowPlannerOutput>({
              systemPrompt: "You are a senior short-form content creative director and slideshow planner.",
              prompt: buildPlannerPromptForMode({
                prompt,
                revisionPrompt,
                brand: planningBrand,
                socialAccount: context.socialAccount,
                requestedRenderingMode,
                references,
              }),
              schema: plannerSchemaForMode(requestedRenderingMode),
              schemaName: "slideshow_create_plan",
              model,
              temperature: 0.7,
              parser: (text) => JSON.parse(text) as SlideshowPlannerOutput,
              metadata: {
                workflowId: String(context.workflow._id),
                workflowRunId: String(context.run._id),
                nodeId: node.id,
                nodeType: node.type,
                requestedRenderingMode,
              },
            });
            const rawSlides = Array.isArray((plannerOutput.object as { slides?: unknown }).slides)
              ? (plannerOutput.object as { slides: unknown[] }).slides
              : [];
            const imagePromptResults = await Promise.all(rawSlides.map(async (slide) => {
              return await provider.generateStructured<SingleImagePromptWriterOutput>({
                systemPrompt: IMAGE_PROMPT_WRITER_SYSTEM_PROMPT,
                prompt: buildSingleImagePromptWriterPrompt({
                  prompt,
                  revisionPrompt,
                  brand: planningBrand,
                  socialAccount: context.socialAccount,
                  requestedRenderingMode,
                  references,
                  plan: plannerOutput.object,
                  slide,
                }),
                schema: singleImagePromptSchemaForMode(requestedRenderingMode),
                schemaName: "slideshow_single_image_prompt",
                model: imagePromptModel,
                temperature: 0.2,
                parser: (text) => JSON.parse(text) as SingleImagePromptWriterOutput,
                metadata: {
                  workflowId: String(context.workflow._id),
                  workflowRunId: String(context.run._id),
                  nodeId: node.id,
                  nodeType: node.type,
                  requestedRenderingMode,
                },
              });
            }));
            const imagePrompts = {
              renderingMode: requestedRenderingMode,
              slides: imagePromptResults.map((result) => result.object),
            } as ImagePromptWriterOutput;
            const plan = normalizePlan(
              plannerOutput.object,
              imagePrompts,
              prompt,
              revisionPrompt,
              requestedRenderingMode
            );
            const lifecycle = placeholderLifecycleForNode(graph, node);
            const artifactId = await ctx.runMutation(
              internal.artifacts.records.createFromRunner,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
                type: "slide_spec",
                title: plan.title,
                data: {
                  ...plan,
                  workflowPlanner: {
                    nodeId: node.id,
                    nodeType: node.type,
                    requestedRenderingMode,
                    referenceCount: references.length,
                    inputSummary: resolvedInputs.summary,
                    plannerMetadata: plannerOutput.metadata,
                    imagePromptMetadata: imagePromptResults.map((result) => result.metadata),
                  },
                },
                provider: plannerOutput.metadata.provider,
                model: plannerOutput.metadata.model,
                prompt,
                lifecycle,
                reviewStatus: "not_required",
              }
            );
            emittedArtifactIds.add(artifactId);
            const outputRefs = slideSpecOutputRefsForNode({
              nodeId: node.id,
              artifactId,
              plan,
            });
            const costUsd = [
              plannerOutput.metadata,
              ...imagePromptResults.map((result) => result.metadata),
            ].reduce((sum, metadata) => sum + costUsdFromMetadata(metadata), 0);
            totalCostUsd += costUsd;

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd,
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "model_call",
              nodeId: node.id,
              message: `${node.label} planned ${plan.slides.length} slideshow slides.`,
              data: {
                provider: plannerOutput.metadata.provider,
                model: plannerOutput.metadata.model,
                costUsd,
                requestedRenderingMode,
                slideCount: plan.slides.length,
                referenceCount: references.length,
              },
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} produced a slide spec.`,
              data: {
                nodeType: node.type,
                lifecycle,
                artifactId,
                provider: plannerOutput.metadata.provider,
                model: plannerOutput.metadata.model,
                slideCount: plan.slides.length,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isNativeSlideshowRendererNode(node)) {
            const sourceSpec = slideshowSpecFromInputs(resolvedInputs);
            if (!sourceSpec?.plan && !sourceSpec?.canonicalSpec) {
              throw new Error(`${node.label} needs a slide spec input.`);
            }

            const planOrSpec = sourceSpec.canonicalSpec ?? sourceSpec.plan!;
            const imageBySlideIndex = slideImagesByIndexFromInputs(resolvedInputs, planOrSpec);
            const canonicalSpec = sourceSpec.canonicalSpec
              ? enrichCanonicalSpecWithImages(sourceSpec.canonicalSpec, imageBySlideIndex)
              : buildCanonicalSlideshowSpec({
                  plan: sourceSpec.plan!,
                  dimensions: getSlideDimensions(sourceSpec.plan!.aspectRatio),
                  imageBySlideIndex,
                });
            const lifecycle = placeholderLifecycleForNode(graph, node);
            const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
              "slide_spec",
              "media",
              "image",
              "input",
            ]);
            const slideshowId = await ctx.runMutation(
              internal.content.slideshows.createFromRunner,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                title: canonicalSpec.title,
                status: "preview",
                spec: canonicalSpec,
              }
            );
            const renderedArtifactId = await ctx.runMutation(
              internal.artifacts.records.createFromRunner,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                parentArtifactIds: sourceArtifactIds.length ? sourceArtifactIds : undefined,
                type: "rendered_asset",
                title: `${node.label} slideshow`,
                data: {
                  format: "native_slideshow",
                  renderMode: "native",
                  slideshowId,
                  title: canonicalSpec.title,
                  aspectRatio: canonicalSpec.aspectRatio,
                  dimensions: canonicalSpec.dimensions,
                  slideCount: canonicalSpec.slides.filter((slide) => slide.status !== "deleted").length,
                  spec: canonicalSpec,
                  sourceSlideSpecArtifactId: sourceSpec.artifactId,
                  sourceImageArtifactIds: [...imageBySlideIndex.values()]
                    .map((image) => image.artifactId)
                    .filter(Boolean),
                  inputSummary: resolvedInputs.summary,
                },
                lifecycle,
                reviewStatus: "not_required",
              }
            );
            emittedArtifactIds.add(renderedArtifactId);

            const outputRefs = nativeSlideshowOutputRefsForNode({
              nodeId: node.id,
              artifactId: renderedArtifactId,
              slideshowId,
              spec: canonicalSpec,
            });

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd: 0,
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} rendered an editable native slideshow.`,
              data: {
                nodeType: node.type,
                lifecycle,
                artifactId: renderedArtifactId,
                slideshowId,
                slideCount: canonicalSpec.slides.length,
                imageCount: imageBySlideIndex.size,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isPostPackageNode(node)) {
            const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
              "slideshow",
              "media",
              "video",
              "image",
              "audio",
              "input",
              "slide_spec",
            ]);
            const sourceArtifacts = await artifactsForIds(ctx, sourceArtifactIds);
            const packageData = postPackageDataForNode({
              node,
              resolvedInputs,
              sourceArtifactIds,
              sourceArtifacts,
            });
            const packageArtifactId = await ctx.runMutation(
              internal.workflows.runner.createPostPackageArtifact,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                nodeId: node.id,
                label: node.label,
                sourceArtifactIds,
                packageData,
              }
            );
            finalPackageArtifactIds.add(packageArtifactId);
            emittedArtifactIds.add(packageArtifactId);

            const outputRefs = postPackageOutputRefsForNode({
              nodeId: node.id,
              artifactId: packageArtifactId,
              packageData,
            });

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd: 0,
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: `${node.label} compiled a ${packageData.postType} post package.`,
              data: {
                nodeType: node.type,
                artifactId: packageArtifactId,
                postType: packageData.postType,
                mediaSummary: packageData.mediaSummary,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isExportNode(node)) {
            const destination = exportDestinationForNode(node, resolvedInputs);
            let packageArtifactIds = postPackageArtifactIdsFromInputs(resolvedInputs);
            let sourceArtifactIds: Id<"artifacts">[] = [];

            if (!packageArtifactIds.length) {
              sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
                "slideshow",
                "media",
                "video",
                "image",
                "audio",
                "input",
                "slide_spec",
              ]);
              const sourceArtifacts = await artifactsForIds(ctx, sourceArtifactIds);
              const packageData = postPackageDataForNode({
                node,
                resolvedInputs,
                sourceArtifactIds,
                sourceArtifacts,
              });
              const packageArtifactId = await ctx.runMutation(
                internal.workflows.runner.createPostPackageArtifact,
                {
                  userId: context.run.userId,
                  brandId: context.run.brandId,
                  workflowId: context.workflow._id,
                  workflowRunId: context.run._id,
                  nodeId: node.id,
                  label: node.label,
                  sourceArtifactIds,
                  packageData,
                }
              );
              packageArtifactIds = [packageArtifactId];
              emittedArtifactIds.add(packageArtifactId);
            }

            const packageArtifacts = await artifactsForIds(ctx, packageArtifactIds);
            const exportRecord = exportRecordForNode({
              node,
              resolvedInputs,
              destination,
            });

            for (const packageArtifact of packageArtifacts) {
              await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
                artifactId: packageArtifact._id,
                userId: context.run.userId,
                data: exportedPackageData({
                  packageArtifact,
                  exportRecord,
                }),
              });
              finalPackageArtifactIds.add(packageArtifact._id);
              emittedArtifactIds.add(packageArtifact._id);
            }

            const outputRefs = exportOutputRefsForNode({
              nodeId: node.id,
              packageArtifactIds,
              destination,
              status: exportRecord.status,
            });

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd: 0,
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message:
                destination === "media_library"
                  ? `${node.label} exported the post package to Media Library.`
                  : `${node.label} prepared a ${destination} export request.`,
              data: {
                nodeType: node.type,
                destination,
                status: exportRecord.status,
                packageArtifactIds,
                sourceArtifactIds,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          if (isAutoPostNode(node)) {
            const providerName = publishingProviderNameForNode(node);
            const autoPublish = autoPublishEnabled(node, resolvedInputs);
            const socialAccountIds = socialAccountIdsFromInputs(node, resolvedInputs);
            const scheduledFor = autoPostScheduleForNode(node, resolvedInputs);
            const config = objectValue(node.config);
            const inputs = resolvedInputs.inputs ?? {};
            let packageArtifactIds = postPackageArtifactIdsFromInputs(resolvedInputs);
            let sourceArtifactIds: Id<"artifacts">[] = [];

            if (!packageArtifactIds.length) {
              sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
                "slideshow",
                "media",
                "video",
                "image",
                "audio",
                "input",
                "slide_spec",
              ]);
              const sourceArtifacts = await artifactsForIds(ctx, sourceArtifactIds);
              const packageData = postPackageDataForNode({
                node,
                resolvedInputs,
                sourceArtifactIds,
                sourceArtifacts,
              });
              const packageArtifactId = await ctx.runMutation(
                internal.workflows.runner.createPostPackageArtifact,
                {
                  userId: context.run.userId,
                  brandId: context.run.brandId,
                  workflowId: context.workflow._id,
                  workflowRunId: context.run._id,
                  nodeId: node.id,
                  label: node.label,
                  sourceArtifactIds,
                  packageData,
                }
              );
              packageArtifactIds = [packageArtifactId];
              emittedArtifactIds.add(packageArtifactId);
            }

            const packageArtifacts = await artifactsForIds(ctx, packageArtifactIds);
            const packageArtifact = packageArtifacts[0];
            if (!packageArtifact) {
              throw new Error(`${node.label} needs a post package input.`);
            }

            const captionFromInputNode = config.captionFromInputNode === true;
            const caption =
              (captionFromInputNode && inputs.caption?.source === "config"
                ? undefined
                : stringFromValue(inputs.caption?.value)) ??
              (captionFromInputNode ? undefined : stringFromValue(config.caption)) ??
              captionFromPackageArtifact(packageArtifact);
            const distributionArtifactIds = packageMediaArtifactIdsFromData(packageArtifact);
            const timezone =
              stringFromValue(inputs.timezone?.value) ??
              stringFromValue(config.timezone);
            const distributionPlanId = await ctx.runMutation(
              internal.publishing.distributionPlans.createFromRunner,
              {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                artifactIds: distributionArtifactIds,
                socialAccountIds,
                provider: providerName,
                status: "draft",
                ...(scheduledFor ? { scheduledFor } : {}),
                ...(timezone ? { timezone } : {}),
                ...(caption ? { caption } : {}),
                providerPayload: {
                  source: "workflow_auto_post",
                  nodeId: node.id,
                  packageArtifactId: packageArtifact._id,
                  packageData: packageArtifact.data,
                },
              }
            );

            let publishStatus = "draft";
            let externalPostIds: string[] | undefined;
            let publishedAt: number | undefined;
            let providerPayload: unknown;

            try {
              if (autoPublish) {
                if (socialAccountIds.length === 0 && providerName !== "manual") {
                  throw new Error(`${node.label} needs at least one target social account to auto-post with ${providerName}.`);
                }

                const provider = getPublishingProvider(providerName);
                await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
                  id: distributionPlanId,
                  userId: context.run.userId,
                  status: "publishing",
                });
                const publishContext = await ctx.runQuery(
                  internal.publishing.distributionPlans.getPublishContext,
                  {
                    id: distributionPlanId,
                    userId: context.run.userId,
                  }
                );
                if (!publishContext) {
                  throw new Error("Distribution plan not found for auto-post.");
                }

                const publishInput = await loadPublishInput(provider, publishContext);
                const result = scheduledFor
                  ? await provider.schedulePost(publishInput)
                  : await provider.publishNow(publishInput);
                publishStatus = mapProviderStatus(result.status);
                externalPostIds = result.externalPostIds;
                publishedAt = result.publishedAt;
                providerPayload = result.providerPayload;

                await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
                  id: distributionPlanId,
                  userId: context.run.userId,
                  status: publishStatus as "draft" | "scheduled" | "publishing" | "published" | "failed" | "canceled",
                  externalPostIds,
                  publishedAt,
                  providerPayload,
                });
                await ctx.runMutation(internal.workflows.runs.recordEvent, {
                  userId: context.run.userId,
                  workflowRunId: context.run._id,
                  workflowId: context.workflow._id,
                  type: scheduledFor ? "publish_requested" : "publish_completed",
                  nodeId: node.id,
                  message: scheduledFor
                    ? `${node.label} scheduled a post through ${provider.displayName}.`
                    : `${node.label} published a post through ${provider.displayName}.`,
                  data: {
                    distributionPlanId,
                    provider: providerName,
                    status: publishStatus,
                    externalPostIds,
                    publishedAt,
                    providerPayload,
                  },
                });
              }

              await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
                artifactId: packageArtifact._id,
                userId: context.run.userId,
                data: autoPostPackageData({
                  packageArtifact,
                  distributionPlanId,
                  provider: providerName,
                  status: publishStatus,
                  autoPublish,
                  externalPostIds,
                  publishedAt,
                  scheduledFor,
                  providerPayload,
                }),
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : "Auto-post failed";
              publishStatus = "failed";
              await ctx.runMutation(internal.publishing.distributionPlans.updateFromProvider, {
                id: distributionPlanId,
                userId: context.run.userId,
                status: "failed",
                errorMessage: message,
              });
              await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
                artifactId: packageArtifact._id,
                userId: context.run.userId,
                data: autoPostPackageData({
                  packageArtifact,
                  distributionPlanId,
                  provider: providerName,
                  status: "failed",
                  autoPublish,
                  scheduledFor,
                  errorMessage: message,
                }),
              });
              throw error;
            }

            finalPackageArtifactIds.add(packageArtifact._id);
            emittedArtifactIds.add(packageArtifact._id);

            const outputRefs = autoPostOutputRefsForNode({
              nodeId: node.id,
              packageArtifactId: packageArtifact._id,
              distributionPlanId,
              provider: providerName,
              status: publishStatus,
              autoPublish,
              externalPostIds,
            });

            await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
              runId: context.run._id,
              nodeId: node.id,
              status: "succeeded",
              outputRefs,
              costUsd: 0,
            });
            await ctx.runMutation(internal.workflows.runs.recordEvent, {
              userId: context.run.userId,
              workflowRunId: context.run._id,
              workflowId: context.workflow._id,
              type: "node_completed",
              nodeId: node.id,
              message: autoPublish
                ? `${node.label} completed with publishing status ${publishStatus}.`
                : `${node.label} created a draft distribution plan.`,
              data: {
                nodeType: node.type,
                provider: providerName,
                autoPublish,
                status: publishStatus,
                distributionPlanId,
                packageArtifactId: packageArtifact._id,
                targetAccountCount: socialAccountIds.length,
                scheduledFor,
                outputPorts: outputRefs.map((outputRef) => outputRef.port),
                placeholderExecution: false,
              },
            });

            pendingNodeIds.delete(node.id);
            completedNodeIds.add(node.id);
            executedNodeCount += 1;
            continue;
          }

          const outboundPorts = outboundPortsForNode(graph, node.id);
          const packageArtifactIds = postPackageArtifactIdsFromInputs(resolvedInputs);
          const shouldCreatePostPackage =
            isTerminalPackageConsumer(node) && packageArtifactIds.length === 0;
          const sourceArtifactIds = artifactIdsFromInputs(resolvedInputs, [
            "slideshow",
            "slide_spec",
            "media",
            "video",
            "image",
            "audio",
            "input",
          ]);
          const packageData = shouldCreatePostPackage
            ? postPackageDataForNode({
                node,
                resolvedInputs,
                sourceArtifactIds,
                sourceArtifacts: await artifactsForIds(ctx, sourceArtifactIds),
              })
            : undefined;
          const createdPostPackageArtifactId = shouldCreatePostPackage
            ? await ctx.runMutation(internal.workflows.runner.createPostPackageArtifact, {
                userId: context.run.userId,
                brandId: context.run.brandId,
                workflowId: context.workflow._id,
                workflowRunId: context.run._id,
                nodeId: node.id,
                label: node.label,
                sourceArtifactIds,
                packageData: packageData!,
              })
            : undefined;
          const consumedOrCreatedPackageIds = [
            ...packageArtifactIds,
            ...(createdPostPackageArtifactId ? [createdPostPackageArtifactId] : []),
          ];
          for (const artifactId of consumedOrCreatedPackageIds) {
            finalPackageArtifactIds.add(artifactId);
            emittedArtifactIds.add(artifactId);
          }
          const outputRefs = outboundPorts.map((port) => ({
            nodeId: node.id,
            port,
            value: {
              placeholderExecution: !createdPostPackageArtifactId,
              nodeId: node.id,
              nodeType: node.type,
              label: node.label,
              ...(createdPostPackageArtifactId
                ? {
                    kind: "post_package",
                    artifactId: createdPostPackageArtifactId,
                    postType: packageData!.postType,
                    name: packageData!.name,
                    caption: packageData!.caption,
                    mediaArtifactIds: packageData!.mediaArtifactIds,
                    mediaSummary: packageData!.mediaSummary,
                    primaryPlatformPreset: packageData!.primaryPlatformPreset,
                    platformPackages: packageData!.platformPackages,
                  }
                : {}),
              inputSummary: resolvedInputs.summary,
            },
          }));
          const lifecycle = placeholderLifecycleForNode(graph, node);
          const placeholderArtifactId = createdPostPackageArtifactId
            ? undefined
            : await ctx.runMutation(
                internal.workflows.runner.createPlaceholderArtifact,
                {
                  userId: context.run.userId,
                  brandId: context.run.brandId,
                  workflowId: context.workflow._id,
                  workflowRunId: context.run._id,
                  nodeId: node.id,
                  nodeType: node.type,
                  label: node.label,
                  lifecycle,
                  inputSummary: resolvedInputs.summary,
                  outputPorts: outputRefs.map((outputRef) => outputRef.port),
                }
              );
          if (placeholderArtifactId) emittedArtifactIds.add(placeholderArtifactId);
          const outputRefsWithArtifact = outputRefs.map((outputRef) => ({
            ...outputRef,
            ...(outputRef.port === "post_package"
              ? { artifactIds: consumedOrCreatedPackageIds }
              : createdPostPackageArtifactId
                ? { artifactIds: consumedOrCreatedPackageIds }
                : placeholderArtifactId
                  ? { artifactIds: [placeholderArtifactId] }
                  : {}),
          }));

          await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
            runId: context.run._id,
            nodeId: node.id,
            status: "succeeded",
            ...(outputRefsWithArtifact.length ? { outputRefs: outputRefsWithArtifact } : {}),
            costUsd: 0,
          });
          await ctx.runMutation(internal.workflows.runs.recordEvent, {
            userId: context.run.userId,
            workflowRunId: context.run._id,
            workflowId: context.workflow._id,
            type: "node_completed",
            nodeId: node.id,
            message: `${node.label} completed with placeholder execution.`,
            data: {
              nodeType: node.type,
              lifecycle: createdPostPackageArtifactId ? "saved" : lifecycle,
              artifactId: createdPostPackageArtifactId ?? placeholderArtifactId,
              packageArtifactIds: consumedOrCreatedPackageIds,
              outputPorts: outputRefsWithArtifact.map((outputRef) => outputRef.port),
              placeholderExecution: !createdPostPackageArtifactId,
            },
          });

          pendingNodeIds.delete(node.id);
          completedNodeIds.add(node.id);
          executedNodeCount += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : `${node.label} failed during execution.`;
          await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
            runId: context.run._id,
            nodeId: node.id,
            status: "failed",
            errorMessage: message,
          });
          await ctx.runMutation(internal.workflows.runs.recordEvent, {
            userId: context.run.userId,
            workflowRunId: context.run._id,
            workflowId: context.workflow._id,
            type: "error",
            nodeId: node.id,
            message,
          });
          await ctx.runMutation(internal.workflows.runs.transitionRun, {
            runId: context.run._id,
            status: "failed",
            errorNodeId: node.id,
            errorMessage: message,
            completedAt: Date.now(),
          });
          return;
        }
      }
    }

    if (!finalPackageArtifactIds.size) {
      const fallbackSourceArtifactIds = [...emittedArtifactIds];
      const fallbackSourceArtifacts = await artifactsForIds(ctx, fallbackSourceArtifactIds);
      const fallbackPackageArtifactId = await ctx.runMutation(
        internal.workflows.runner.createPostPackageArtifact,
        {
          userId: context.run.userId,
          brandId: context.run.brandId,
          workflowId: context.workflow._id,
          workflowRunId: context.run._id,
          nodeId: "workflow",
          label: context.workflow.name,
          sourceArtifactIds: fallbackSourceArtifactIds,
          packageData: postPackageDataForWorkflowFallback({
            workflowName: context.workflow.name,
            sourceArtifactIds: fallbackSourceArtifactIds,
            sourceArtifacts: fallbackSourceArtifacts,
          }),
        }
      );
      finalPackageArtifactIds.add(fallbackPackageArtifactId);
      await ctx.runMutation(internal.workflows.runs.recordEvent, {
        userId: context.run.userId,
        workflowRunId: context.run._id,
        workflowId: context.workflow._id,
        type: "artifact_created",
        message: "Workflow fallback post package created.",
        data: {
          artifactId: fallbackPackageArtifactId,
        },
      });
    }

    await ctx.runMutation(internal.workflows.runs.recordEvent, {
      userId: context.run.userId,
      workflowRunId: context.run._id,
      workflowId: context.workflow._id,
      type: "node_completed",
      message: "Workflow graph completed execution.",
      data: {
        executedNodeCount,
        finalPackageArtifactIds: [...finalPackageArtifactIds],
        passCount,
        costUsd: totalCostUsd,
        skippedNonRunnableNodeIds: graph.nodes
          .filter((node) => !runnableNodeIds.has(node.id))
          .map((node) => node.id),
      },
    });

    await ctx.runMutation(internal.workflows.runs.transitionRun, {
      runId: context.run._id,
      status: "completed",
      summary: `Executed ${executedNodeCount} workflow nodes.`,
      costUsd: totalCostUsd,
      completedAt: Date.now(),
    });
  },
});

export const createPlaceholderArtifact = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    workflowId: v.id("workflows"),
    workflowRunId: v.id("workflowRuns"),
    nodeId: v.string(),
    nodeType: v.string(),
    label: v.string(),
    lifecycle: artifactLifecycleValidator,
    inputSummary: v.any(),
    outputPorts: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("artifacts", {
      userId: args.userId,
      brandId: args.brandId,
      workflowId: args.workflowId,
      workflowRunId: args.workflowRunId,
      type: "text_draft",
      title: `${args.label} placeholder output`,
      data: {
        placeholderExecution: true,
        nodeId: args.nodeId,
        nodeType: args.nodeType,
        inputSummary: args.inputSummary,
        outputPorts: args.outputPorts,
      },
      lifecycle: args.lifecycle,
      reviewStatus: "not_required",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const resolveMediaNodeItems = internalQuery({
  args: {
    runId: v.id("workflowRuns"),
    nodeId: v.string(),
  },
  handler: async (ctx, args): Promise<MediaNodeItemForRun[]> => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Workflow run not found");

    const workflow = await ctx.db.get(run.workflowId);
    if (!workflow) throw new Error("Workflow not found");

    const node = workflow.graph.nodes.find((candidateNode) => candidateNode.id === args.nodeId);
    if (!node || node.type !== "media") throw new Error("Media node not found");

    const config = objectValue(node.config);
    const artifactIds = stringArrayFromConfig(config.artifactIds);
    const creativeAssetIds = stringArrayFromConfig(config.creativeAssetIds);
    const personaIds = stringArrayFromConfig(config.personaIds);
    const items: MediaNodeItemForRun[] = [];

    for (const artifactId of artifactIds) {
      const artifact = await ctx.db.get(artifactId as Id<"artifacts">);
      if (!artifact || artifact.userId !== run.userId) continue;

      items.push({
        id: String(artifact._id),
        source: "artifact",
        kind: mediaKindFromArtifact(artifact),
        title: artifact.title,
        storageUrl: artifact.storageUrl,
        data: artifact.data,
        metadata: {
          artifactType: artifact.type,
          reviewStatus: artifact.reviewStatus,
        },
      });
    }

    for (const assetId of creativeAssetIds) {
      const asset = await ctx.db.get(assetId as Id<"creativeAssets">);
      if (!asset || asset.userId !== run.userId) continue;

      items.push({
        id: String(asset._id),
        source: "creative_asset",
        kind: mediaKindFromAsset(asset),
        title: asset.name,
        storageUrl: asset.storageUrl,
        metadata: {
          assetKind: asset.assetKind,
          mediaType: asset.mediaType,
          description: asset.description,
          usageNotes: asset.usageNotes,
          metadata: asset.metadata,
        },
      });
    }

    for (const personaId of personaIds) {
      const persona = await ctx.db.get(personaId as Id<"personas">);
      if (!persona || persona.userId !== run.userId) continue;

      const attachedAssets = [
        ...persona.sourceAssetIds.map((assetId) => ({ assetId, role: "source" })),
        ...persona.generatedAssetIds.map((assetId) => ({ assetId, role: "generated" })),
        ...persona.voiceAssetIds.map((assetId) => ({ assetId, role: "voice" })),
      ];

      for (const { assetId, role } of attachedAssets) {
        const asset = await ctx.db.get(assetId);
        if (!asset || asset.userId !== run.userId) continue;

        items.push({
          id: `${String(persona._id)}:${String(asset._id)}`,
          source: "persona",
          kind: mediaKindFromAsset(asset),
          title: `${persona.name} · ${asset.name}`,
          storageUrl: asset.storageUrl,
          metadata: {
            personaId: persona._id,
            personaName: persona.name,
            personaType: persona.personaType,
            personaDescription: persona.description,
            identityPrompt: persona.identityPrompt,
            visualConstraints: persona.visualConstraints,
            personaUsageNotes: persona.usageNotes,
            personaAssetRole: role,
            assetId: asset._id,
            assetKind: asset.assetKind,
            mediaType: asset.mediaType,
            description: asset.description,
            usageNotes: asset.usageNotes,
            metadata: asset.metadata,
          },
        });
      }
    }

    items.push(...uploadedMediaItemsFromConfig(config.uploadedMedia));

    return items;
  },
});

export const createPostPackageArtifact = internalMutation({
  args: {
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    workflowId: v.id("workflows"),
    workflowRunId: v.id("workflowRuns"),
    nodeId: v.string(),
    label: v.string(),
    sourceArtifactIds: v.array(v.id("artifacts")),
    packageData: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("artifacts", {
      userId: args.userId,
      brandId: args.brandId,
      workflowId: args.workflowId,
      workflowRunId: args.workflowRunId,
      parentArtifactIds: args.sourceArtifactIds.length ? args.sourceArtifactIds : undefined,
      type: "publish_payload",
      title: `${args.label} post package`,
      data: args.packageData,
      lifecycle: "saved",
      reviewStatus: "not_required",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
