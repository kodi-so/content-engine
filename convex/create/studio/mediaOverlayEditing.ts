import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  clampNumber,
  normalizeMediaTextOverlayBlocks,
  normalizeTimedMediaTextOverlayBlock,
  optionalText,
  textFromMediaOverlayInput,
} from "../../lib/mediaTextOverlays";
import {
  activeSlides,
  normalizeCanonicalSpec,
  renderingModeForSlide,
} from "../../content/slideshow/slideshowRequestEditing";
import { isRecord } from "../references/referenceResolution";

type MediaOverlayTargetKind = "auto" | "slideshow" | "video_project";

type OverlayOperationInput = {
  addTextBlocks: unknown[];
  removeTextBlockIds: string[];
  replaceTextBlocks?: unknown[];
  textBlockPatch?: Record<string, unknown>;
  adjustTextBlocks?: Record<string, unknown>;
  updateTextBlocks: Array<{
    id: string;
    patch: Record<string, unknown>;
  }>;
};

function outputId(output: unknown, key: string) {
  if (!isRecord(output)) return null;
  const value = output[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTargetKind(value: unknown): MediaOverlayTargetKind {
  if (value === "slideshow" || value === "video_project") return value;
  return "auto";
}

function normalizeOperationInput(input: Record<string, unknown>): OverlayOperationInput {
  const updateTextBlocks = Array.isArray(input.updateTextBlocks)
    ? input.updateTextBlocks.flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = optionalText(item.id) ?? optionalText(item.textBlockId);
        const patch = isRecord(item.patch) ? item.patch : item;
        return id ? [{ id, patch }] : [];
      })
    : [];

  const removeTextBlockIds = Array.isArray(input.removeTextBlockIds)
    ? input.removeTextBlockIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())
    : [];

  return {
    addTextBlocks: Array.isArray(input.addTextBlocks) ? input.addTextBlocks : [],
    removeTextBlockIds,
    replaceTextBlocks: Array.isArray(input.replaceTextBlocks)
      ? input.replaceTextBlocks
      : Array.isArray(input.textBlocks)
        ? input.textBlocks
        : undefined,
    textBlockPatch: isRecord(input.textBlockPatch) ? input.textBlockPatch : undefined,
    adjustTextBlocks: isRecord(input.adjustTextBlocks) ? input.adjustTextBlocks : undefined,
    updateTextBlocks,
  };
}

export async function latestThreadTargets(ctx: MutationCtx, thread: Doc<"createThreads">) {
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .order("asc")
    .collect();

  const slideshows: Doc<"slideshows">[] = [];
  const seenSlideshowIds = new Set<string>();
  const videoProjects: Doc<"videoProjects">[] = [];
  const seenProjectIds = new Set<string>();

  for (const toolCall of toolCalls) {
    const projectId = outputId(toolCall.output, "projectId");
    if (projectId && !seenProjectIds.has(projectId)) {
      const normalizedProjectId = ctx.db.normalizeId("videoProjects", projectId);
      const project = normalizedProjectId ? await ctx.db.get(normalizedProjectId) : null;
      if (
        project &&
        project.status !== "archived" &&
        (thread.workspaceId ? project.workspaceId === thread.workspaceId : project.userId === thread.userId)
      ) {
        videoProjects.push(project);
        seenProjectIds.add(projectId);
      }
    }

    const requestId = outputId(toolCall.output, "contentRequestId");
    const normalizedRequestId = requestId
      ? ctx.db.normalizeId("contentRequests", requestId)
      : null;
    if (!normalizedRequestId) continue;

    const requestSlideshows = await ctx.db
      .query("slideshows")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", normalizedRequestId))
      .collect();
    for (const slideshow of requestSlideshows) {
      if (seenSlideshowIds.has(String(slideshow._id))) continue;
      if (thread.workspaceId ? slideshow.workspaceId !== thread.workspaceId : slideshow.userId !== thread.userId) {
        continue;
      }
      slideshows.push(slideshow);
      seenSlideshowIds.add(String(slideshow._id));
    }
  }

  const byUpdatedAt = <T extends { updatedAt?: number; createdAt?: number }>(first: T, second: T) =>
    (second.updatedAt ?? second.createdAt ?? 0) - (first.updatedAt ?? first.createdAt ?? 0);

  return {
    slideshow: slideshows.sort(byUpdatedAt)[0],
    videoProject: videoProjects.sort(byUpdatedAt)[0],
  };
}

function slideForInput(spec: ReturnType<typeof normalizeCanonicalSpec>, input: Record<string, unknown>) {
  const slideId = optionalText(input.slideId);
  const slideIndex = typeof input.slideIndex === "number" && Number.isFinite(input.slideIndex)
    ? input.slideIndex
    : undefined;
  const slides = activeSlides(spec);
  return slides.find((slide) => slide.slideId === slideId) ??
    slides.find((slide) => slide.index === slideIndex) ??
    slides[0];
}

function applyOverlayOperations(
  existingBlocks: unknown[],
  operations: OverlayOperationInput,
  defaultIdPrefix: string
) {
  const startingBlocks = operations.replaceTextBlocks !== undefined
    ? normalizeMediaTextOverlayBlocks(operations.replaceTextBlocks, { defaultIdPrefix })
    : normalizeMediaTextOverlayBlocks(existingBlocks, { defaultIdPrefix });
  const removedIds = new Set(operations.removeTextBlockIds);
  const sharedPatch = operations.textBlockPatch ?? {};
  const updatedBlocks = startingBlocks
    .filter((block) => !removedIds.has(block.id))
    .map((block) => {
      const update = operations.updateTextBlocks.find((item) => item.id === block.id);
      const patch = {
        ...sharedPatch,
        ...(update?.patch ?? {}),
      };
      const adjustedPatch = applyRelativeTextOverlayAdjustment(
        {
          ...block,
          ...patch,
        },
        operations.adjustTextBlocks
      );
      return {
        ...block,
        ...patch,
        ...adjustedPatch,
        id: block.id,
        text: textFromMediaOverlayInput({ ...block, ...patch }) || block.text,
      };
    });
  const additions = normalizeMediaTextOverlayBlocks(operations.addTextBlocks, {
    defaultIdPrefix,
  }).map((block, index) => ({
    ...block,
    id: block.id || `${defaultIdPrefix}-new-${Date.now()}-${index + 1}`,
  }));
  return normalizeMediaTextOverlayBlocks([...updatedBlocks, ...additions], {
    defaultIdPrefix,
  });
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function applyRelativeTextOverlayAdjustment(
  block: Record<string, unknown>,
  adjustment?: Record<string, unknown>
) {
  if (!adjustment) return {};
  const deltaX = finiteNumber(adjustment.deltaX) ?? 0;
  const deltaY = finiteNumber(adjustment.deltaY) ?? 0;
  const deltaWidth = finiteNumber(adjustment.deltaWidth) ?? 0;
  const deltaHeight = finiteNumber(adjustment.deltaHeight) ?? 0;
  const deltaFontSize = finiteNumber(adjustment.deltaFontSize) ?? 0;
  const fontSizeMultiplier = finiteNumber(adjustment.fontSizeMultiplier) ?? 1;

  const x = clampNumber(block.x, 10, 0, 96);
  const y = clampNumber(block.y, 42, 0, 96);
  const width = clampNumber(block.width, 80, 12, 100 - x);
  const height = clampNumber(block.height, 10, 4, 100 - y);
  const fontSize = clampNumber(block.fontSize, 72, 20, 150);
  const nextX = clampNumber(x + deltaX, x, 0, 96);
  const nextY = clampNumber(y + deltaY, y, 0, 96);

  return {
    x: nextX,
    y: nextY,
    width: clampNumber(width + deltaWidth, width, 12, 100 - nextX),
    height: clampNumber(height + deltaHeight, height, 4, 100 - nextY),
    fontSize: clampNumber(fontSize * fontSizeMultiplier + deltaFontSize, fontSize, 20, 150),
  };
}

async function updateSlideshowTextOverlays(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  slideshow: Doc<"slideshows">,
  input: Record<string, unknown>,
  operations: OverlayOperationInput
) {
  if (thread.workspaceId ? slideshow.workspaceId !== thread.workspaceId : slideshow.userId !== thread.userId) {
    throw new Error("Slideshow not found");
  }

  const spec = normalizeCanonicalSpec(slideshow.spec);
  const targetSlide = slideForInput(spec, input);
  if (!targetSlide) throw new Error("No slide found to update");
  if (renderingModeForSlide(spec, targetSlide) !== "background_plus_overlay") {
    throw new Error("This slide does not use editable text overlays");
  }

  const now = Date.now();
  const nextBlocks = applyOverlayOperations(
    "textBlocks" in targetSlide && Array.isArray(targetSlide.textBlocks)
      ? targetSlide.textBlocks
      : [],
    operations,
    `${targetSlide.slideId}-text`
  );
  const nextSpec = {
    ...spec,
    slides: spec.slides.map((slide) =>
      slide.slideId === targetSlide.slideId
        ? { ...slide, textBlocks: nextBlocks, updatedAt: now }
        : slide
    ),
  };
  await ctx.db.patch(slideshow._id, {
    spec: nextSpec,
    updatedAt: now,
  });

  return {
    targetKind: "slideshow",
    targetId: slideshow._id,
    slideId: targetSlide.slideId,
    textOverlayCount: nextBlocks.length,
  };
}

function normalizeVideoTextOverlays(
  blocks: unknown[],
  durationSeconds: number,
  defaultIdPrefix: string
) {
  return blocks
    .map((block, index) =>
      normalizeTimedMediaTextOverlayBlock(block, index, durationSeconds, { defaultIdPrefix })
    )
    .filter((block): block is NonNullable<ReturnType<typeof normalizeTimedMediaTextOverlayBlock>> =>
      Boolean(block)
    );
}

async function updateVideoProjectTextOverlays(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  project: Doc<"videoProjects">,
  operations: OverlayOperationInput
) {
  if (thread.workspaceId ? project.workspaceId !== thread.workspaceId : project.userId !== thread.userId) {
    throw new Error("Video project not found");
  }
  const draft = isRecord(project.draft) ? project.draft : {};
  const durationSeconds = Array.isArray(draft.clips)
    ? Math.max(0.5, draft.clips.length * 4)
    : 12;
  const existing = Array.isArray(draft.textOverlays) ? draft.textOverlays : [];
  const nextUntimedBlocks = applyOverlayOperations(existing, operations, "video-text");
  const nextTextOverlays = normalizeVideoTextOverlays(
    nextUntimedBlocks.map((block, index) => {
      const priorById = existing.find((overlay) => isRecord(overlay) && overlay.id === block.id);
      const prior = isRecord(priorById)
        ? priorById
        : isRecord(existing[index])
          ? existing[index]
          : {};
      return {
        ...prior,
        ...block,
        startSeconds: prior.startSeconds,
        endSeconds: prior.endSeconds,
      };
    }),
    durationSeconds,
    "video-text"
  );
  const now = Date.now();
  await ctx.db.patch(project._id, {
    draft: {
      ...draft,
      textOverlays: nextTextOverlays,
    },
    updatedAt: now,
  });

  return {
    targetKind: "video_project",
    targetId: project._id,
    textOverlayCount: nextTextOverlays.length,
  };
}

export async function updateMediaTextOverlaysForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  input: unknown
) {
  if (!isRecord(input)) throw new Error("Media overlay update input is required");

  const targetKind = normalizeTargetKind(input.targetKind ?? input.mediaType);
  const targetId = optionalText(input.targetId) ?? optionalText(input.slideshowId) ?? optionalText(input.projectId);
  const operations = normalizeOperationInput(input);
  if (
    operations.replaceTextBlocks === undefined &&
    !operations.addTextBlocks.length &&
    !operations.updateTextBlocks.length &&
    !operations.removeTextBlockIds.length &&
    operations.textBlockPatch === undefined &&
    operations.adjustTextBlocks === undefined
  ) {
    throw new Error("At least one text overlay operation is required");
  }

  const targets = await latestThreadTargets(ctx, thread);

  const latestSlideshowAt = targets.slideshow?.updatedAt ?? targets.slideshow?.createdAt ?? 0;
  const latestProjectAt = targets.videoProject?.updatedAt ?? targets.videoProject?.createdAt ?? 0;
  if (targetKind === "auto" && targetId) {
    const slideshowId = ctx.db.normalizeId("slideshows", targetId);
    const slideshow = slideshowId ? await ctx.db.get(slideshowId) : null;
    if (slideshow) {
      return await updateSlideshowTextOverlays(ctx, thread, slideshow, input, operations);
    }
    const projectId = ctx.db.normalizeId("videoProjects", targetId);
    const project = projectId ? await ctx.db.get(projectId) : null;
    if (project) {
      return await updateVideoProjectTextOverlays(ctx, thread, project, operations);
    }
    throw new Error("Editable media target not found");
  }

  const autoTargetKind = targetKind === "auto"
    ? latestProjectAt > latestSlideshowAt
      ? "video_project"
      : "slideshow"
    : targetKind;

  if (autoTargetKind === "slideshow") {
    const slideshowId = targetId ? ctx.db.normalizeId("slideshows", targetId) : targets.slideshow?._id;
    const slideshow = slideshowId ? await ctx.db.get(slideshowId) : targets.slideshow;
    if (!slideshow) throw new Error("Slideshow not found");
    return await updateSlideshowTextOverlays(ctx, thread, slideshow, input, operations);
  }

  if (autoTargetKind === "video_project") {
    const projectId = targetId ? ctx.db.normalizeId("videoProjects", targetId) : targets.videoProject?._id;
    const project = projectId ? await ctx.db.get(projectId) : targets.videoProject;
    if (!project) throw new Error("Video project not found");
    return await updateVideoProjectTextOverlays(ctx, thread, project, operations);
  }

  throw new Error("No editable media target found");
}
