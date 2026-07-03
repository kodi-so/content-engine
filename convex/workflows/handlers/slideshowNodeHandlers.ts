import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { buildCanonicalSlideshowSpec } from "../../content/slideshowAdapter";
import { getSlideDimensions } from "../../content/slideshowDimensions";
import {
  buildFullGraphicPlannerPrompt,
  buildOverlayPlannerPrompt,
  buildSingleImagePromptWriterPrompt,
  IMAGE_PROMPT_WRITER_SYSTEM_PROMPT,
  normalizePlan,
  type PlannerReference,
  type RequestedRenderingMode,
} from "../../content/planning";
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
} from "../../content/types";
import { getModelProvider } from "../../providers";
import { artifactIdsFromInputs } from "../runtime/artifactInputs";
import type {
  WorkflowNodeHandlerArgs,
  WorkflowNodeHandlerResult,
} from "../runtime/executionTypes";
import { costUsdFromMetadata } from "../runtime/generationWaiters";
import {
  numberFromInputValue,
  objectValue,
  textFromInputValue,
  type ResolvedInputsForRun,
} from "../runtime/inputValues";
import {
  isNativeSlideshowPlannerNode,
  isNativeSlideshowRendererNode,
  placeholderLifecycleForNode,
} from "../runtime/nodeRuntime";
import {
  nativeSlideshowOutputRefsForNode,
  slideSpecOutputRefsForNode,
} from "../runtime/outputRefs";
import { modelProviderNameForNode, providerOverridesFromConfig } from "../runtime/providerInputs";

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


export async function executeSlideshowNode({
  ctx,
  context,
  graph,
  node,
  resolvedInputs,
}: WorkflowNodeHandlerArgs): Promise<WorkflowNodeHandlerResult | null> {
  const emittedArtifactIds = new Set<Id<"artifacts">>();
  let totalCostUsd = 0;

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
  return { costUsd: totalCostUsd, emittedArtifactIds: [...emittedArtifactIds] };
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
  return { costUsd: totalCostUsd, emittedArtifactIds: [...emittedArtifactIds] };
  }



  return null;
}
