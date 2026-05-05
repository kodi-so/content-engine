"use node";

import { v } from "convex/values";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import * as PImage from "pureimage";
import type { Bitmap, Context } from "pureimage";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { CanonicalSlideshowSlide, CanonicalSlideshowSpec, SlideshowTextBlock } from "./types";
import { DEJAVU_SANS_CONDENSED_BOLD_BASE64 } from "./fonts/dejavuSansCondensedBold";
import { SLIDESHOW_RENDERER_VERSION } from "./slideshowRenderer";

type Dimensions = { width: number; height: number };
type TextStyle = {
  size: number;
  weight: number;
  lineHeight: number;
  strokeWidth: number;
};
type RenderedBlock = {
  block: SlideshowTextBlock;
  lines: string[];
  style: TextStyle;
  height: number;
};

const SLIDE_FONT_FAMILY = "SlideSansCondensedBold";
let fontLoaded = false;

class BufferSink extends Writable {
  chunks: Buffer[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

function ensureFontLoaded() {
  if (fontLoaded) return;
  const fontPath = join(tmpdir(), "content-engine-dejavu-sans-condensed-bold.ttf");
  if (!existsSync(fontPath)) {
    writeFileSync(fontPath, Buffer.from(DEJAVU_SANS_CONDENSED_BOLD_BASE64, "base64"));
  }
  PImage.registerFont(fontPath, SLIDE_FONT_FAMILY).loadSync();
  fontLoaded = true;
}

function font(style: TextStyle) {
  return `${style.size} ${SLIDE_FONT_FAMILY}`;
}

function addColorStop(
  gradient: ReturnType<Context["createLinearGradient"]>,
  offset: number,
  color: string
) {
  gradient.addColorStop(offset, color as unknown as number);
}

async function fetchImageBytes(url: string | undefined): Promise<Uint8Array | undefined> {
  if (!url) return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

function styleForBlock(block: SlideshowTextBlock, width: number): TextStyle {
  const base =
    block.role === "headline" || block.role === "cta"
      ? 0.075
      : block.role === "bullet_list"
        ? 0.043
        : 0.04;
  const size = Math.round(width * base);
  return {
    size,
    weight: block.role === "headline" || block.role === "cta" ? 900 : 800,
    lineHeight: Math.round(size * 1.15),
    strokeWidth: Math.max(5, Math.round(width * (base >= 0.07 ? 0.009 : 0.005))),
  };
}

function wrapMeasuredText(ctx: Context, text: string, maxWidth: number, maxLines = 8) {
  const words = text.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      if (current) {
        lines.push(current);
        current = "";
        if (lines.length >= maxLines) break;
      }
      lines.push(...wrapLongWord(ctx, word, maxWidth, maxLines - lines.length));
      if (lines.length >= maxLines) break;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function wrapLongWord(ctx: Context, word: string, maxWidth: number, maxLines: number) {
  const chunks: string[] = [];
  let current = "";
  for (const char of word) {
    const candidate = `${current}${char}`;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    current = char;
    if (chunks.length >= maxLines) return chunks;
  }
  if (current && chunks.length < maxLines) chunks.push(current);
  return chunks;
}

function linesForBlock(
  ctx: Context,
  block: SlideshowTextBlock,
  style: TextStyle,
  maxWidth: number
) {
  ctx.font = font(style);
  if (block.role === "bullet_list") {
    const items = block.items.length ? block.items : [block.text].filter(Boolean);
    return items.flatMap((item) => wrapMeasuredText(ctx, `- ${item}`, maxWidth, 2));
  }
  return wrapMeasuredText(ctx, block.text, maxWidth, block.role === "headline" ? 4 : 5);
}

function measureBlocks(
  ctx: Context,
  blocks: SlideshowTextBlock[],
  width: number,
  maxWidth: number,
  maxHeight: number
): RenderedBlock[] {
  let scale = blocks.some((block) => block.role === "headline" && block.text.length > 68) ? 0.88 : 1;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const rendered = blocks.map((block) => {
      const baseStyle = styleForBlock(block, width);
      const style = {
        ...baseStyle,
        size: Math.max(22, Math.round(baseStyle.size * scale)),
        lineHeight: Math.max(26, Math.round(baseStyle.lineHeight * scale)),
        strokeWidth: Math.max(4, Math.round(baseStyle.strokeWidth * scale)),
      };
      const lines = linesForBlock(ctx, block, style, maxWidth);
      return {
        block,
        lines,
        style,
        height: Math.max(lines.length, 1) * style.lineHeight,
      };
    });
    const gap = Math.round(width * 0.035);
    const totalHeight =
      rendered.reduce((total, item) => total + item.height, 0) +
      Math.max(0, rendered.length - 1) * gap;
    if (totalHeight <= maxHeight || scale <= 0.55) return rendered;
    scale *= 0.9;
  }
  return [];
}

async function decodeBackgroundImage(imageBytes: Uint8Array): Promise<Bitmap | undefined> {
  const stream = Readable.from(Buffer.from(imageBytes));
  const isPng =
    imageBytes[0] === 0x89 &&
    imageBytes[1] === 0x50 &&
    imageBytes[2] === 0x4e &&
    imageBytes[3] === 0x47;
  const isJpeg = imageBytes[0] === 0xff && imageBytes[1] === 0xd8;
  try {
    if (isPng) return await PImage.decodePNGFromStream(stream);
    if (isJpeg) return await PImage.decodeJPEGFromStream(stream);
  } catch {
    return undefined;
  }
  return undefined;
}

async function drawBackground(ctx: Context, dimensions: Dimensions, imageBytes?: Uint8Array) {
  const { width, height } = dimensions;
  if (!imageBytes) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    addColorStop(gradient, 0, "#080808");
    addColorStop(gradient, 0.55, "#161616");
    addColorStop(gradient, 1, "#303030");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  try {
    const image = await decodeBackgroundImage(imageBytes);
    if (!image) throw new Error("Unsupported background image format");
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(
      image,
      0,
      0,
      image.width,
      image.height,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  } catch {
    await drawBackground(ctx, dimensions);
  }
}

function drawScrim(ctx: Context, slide: CanonicalSlideshowSlide, dimensions: Dimensions) {
  const { width, height } = dimensions;
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  ctx.fillRect(0, 0, width, height);
  if (slide.layout.contrast === "none") return;

  if (slide.layout.contrast === "solid_scrim") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    ctx.fillRect(Math.round(width * 0.07), Math.round(height * 0.1), Math.round(width * 0.86), Math.round(height * 0.76));
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  if (slide.layout.textZone === "bottom") {
    addColorStop(gradient, 0, "rgba(0, 0, 0, 0)");
    addColorStop(gradient, 0.48, "rgba(0, 0, 0, 0.08)");
    addColorStop(gradient, 1, "rgba(0, 0, 0, 0.66)");
  } else if (slide.layout.textZone === "top") {
    addColorStop(gradient, 0, "rgba(0, 0, 0, 0.62)");
    addColorStop(gradient, 0.5, "rgba(0, 0, 0, 0.1)");
    addColorStop(gradient, 1, "rgba(0, 0, 0, 0)");
  } else {
    addColorStop(gradient, 0, "rgba(0, 0, 0, 0.25)");
    addColorStop(gradient, 0.5, "rgba(0, 0, 0, 0.28)");
    addColorStop(gradient, 1, "rgba(0, 0, 0, 0.25)");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawTextWithOutline(ctx: Context, line: string, x: number, y: number, style: TextStyle) {
  ctx.lineWidth = style.strokeWidth;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.88)";
  ctx.strokeText(line, x, y);

  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillText(line, x + Math.round(style.strokeWidth * 0.5), y + Math.round(style.strokeWidth * 0.55));

  ctx.fillStyle = "#ffffff";
  ctx.fillText(line, x, y);
}

function renderText(ctx: Context, slide: CanonicalSlideshowSlide, dimensions: Dimensions) {
  const { width, height } = dimensions;
  const safeTop = Math.round(height * 0.09);
  const safeBottom = Math.round(height * 0.16);
  const maxWidth = Math.round(width * 0.78);
  const maxHeight = height - safeTop - safeBottom;
  const blocks = slide.textBlocks
    .filter((block) => block.role !== "eyebrow")
    .filter((block) => block.text || block.items.length);
  const rendered = measureBlocks(ctx, blocks, width, maxWidth, maxHeight);
  const gap = Math.round(width * 0.035);
  const totalHeight =
    rendered.reduce((total, item) => total + item.height, 0) +
    Math.max(0, rendered.length - 1) * gap;
  const startY =
    slide.layout.textZone === "top"
      ? safeTop
      : slide.layout.textZone === "bottom"
        ? height - safeBottom - totalHeight
        : Math.round((height - totalHeight) / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  let y = startY;
  for (const item of rendered) {
    ctx.font = font(item.style);
    for (const line of item.lines) {
      drawTextWithOutline(ctx, line, width / 2, y, item.style);
      y += item.style.lineHeight;
    }
    y += gap;
  }
}

async function encodeBitmap(bitmap: Bitmap, mimeType: "image/png" | "image/jpeg") {
  const sink = new BufferSink();
  if (mimeType === "image/png") {
    await PImage.encodePNGToStream(bitmap, sink);
  } else {
    await PImage.encodeJPEGToStream(bitmap, sink, 92);
  }
  return sink.toBuffer();
}

async function renderSlideRaster(slide: CanonicalSlideshowSlide) {
  const startedAt = Date.now();
  ensureFontLoaded();
  const canvas = PImage.make(slide.dimensions.width, slide.dimensions.height);
  const ctx = canvas.getContext("2d");
  const imageBytes = await fetchImageBytes(slide.backgroundImageUrl);
  await drawBackground(ctx, slide.dimensions, imageBytes);
  drawScrim(ctx, slide, slide.dimensions);
  renderText(ctx, slide, slide.dimensions);
  const png = await encodeBitmap(canvas, "image/png");
  const publishMimeType = "image/jpeg" as const;
  const publish = await encodeBitmap(canvas, publishMimeType);
  return {
    png,
    publish,
    publishMimeType,
    renderDurationMs: Date.now() - startedAt,
    backgroundEmbedded: Boolean(imageBytes),
  };
}

function artifactData(args: {
  artifact?: Doc<"artifacts">;
  slide: CanonicalSlideshowSlide;
  spec: CanonicalSlideshowSpec;
  slideshowId: Id<"slideshows">;
  renderedImageUrl?: string;
  publishImageUrl?: string;
  storageId: Id<"_storage">;
  publishStorageId: Id<"_storage">;
  rendered: Awaited<ReturnType<typeof renderSlideRaster>>;
  sourceSlideSpecArtifactId?: Id<"artifacts">;
}) {
  const existing =
    args.artifact?.data && typeof args.artifact.data === "object" && !Array.isArray(args.artifact.data)
      ? args.artifact.data as Record<string, unknown>
      : {};
  return {
    ...existing,
    format: "rendered_slide_image",
    mimeType: "image/png",
    publishMimeType: args.rendered.publishMimeType,
    slideIndex: args.slide.index,
    aspectRatio: args.spec.aspectRatio,
    dimensions: args.slide.dimensions,
    renderedImageUrl: args.renderedImageUrl,
    publishImageUrl: args.publishImageUrl,
    storageId: args.storageId,
    publishStorageId: args.publishStorageId,
    backgroundImageUrl: args.slide.backgroundImageUrl,
    backgroundEmbedded: args.rendered.backgroundEmbedded,
    sourceSlideId: args.slide.slideId,
    sourceSlideshowId: args.slideshowId,
    sourceImageArtifactId: args.slide.sourceImageArtifactId,
    renderVersion: args.slide.renderVersion,
    rendererVersion: SLIDESHOW_RENDERER_VERSION,
    renderDurationMs: args.rendered.renderDurationMs,
    outputFileSize: args.rendered.png.byteLength,
    publishFileSize: args.rendered.publish.byteLength,
    purpose: args.slide.purpose,
    textBlocks: args.slide.textBlocks,
    visualPrompt: args.slide.visualPrompt,
    layout: args.slide.layout,
    sourceSlideSpecArtifactId: args.sourceSlideSpecArtifactId,
  };
}

export const renderSlideForContentRequest = internalAction({
  args: {
    requestId: v.id("contentRequests"),
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    specArtifactId: v.optional(v.id("artifacts")),
    parentArtifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args): Promise<Id<"artifacts">> => {
    const context = await ctx.runQuery(internal.content.requests.getExecutionContext, {
      requestId: args.requestId,
    });
    if (!context) throw new Error("Content request not found");
    const slideshow = await ctx.runQuery(internal.content.slideshows.getForRunner, {
      slideshowId: args.slideshowId,
    });
    if (!slideshow || slideshow.userId !== context.request.userId) {
      throw new Error("Slideshow not found");
    }
    const spec = slideshow.spec as CanonicalSlideshowSpec;
    const slide = spec.slides.find((item) => item.slideId === args.slideId);
    if (!slide || slide.status === "deleted") throw new Error("Slide not found");

    const rendered = await renderSlideRaster(slide);
    const storageId = await ctx.storage.store(new Blob([rendered.png], { type: "image/png" }));
    const publishStorageId = await ctx.storage.store(new Blob([rendered.publish], { type: rendered.publishMimeType }));
    const renderedImageUrl = await ctx.storage.getUrl(storageId) ?? undefined;
    const publishImageUrl = await ctx.storage.getUrl(publishStorageId) ?? undefined;

    return await ctx.runMutation(internal.artifacts.records.createFromRunner, {
      userId: context.request.userId,
      brandId: context.request.brandId,
      contentRequestId: context.request._id,
      parentArtifactIds: args.parentArtifactIds,
      type: "rendered_slide_image",
      title: `Slide ${slide.index}`,
      storageUrl: renderedImageUrl,
      data: artifactData({
        slide,
        spec,
        slideshowId: args.slideshowId,
        renderedImageUrl,
        publishImageUrl,
        storageId,
        publishStorageId,
        rendered,
        sourceSlideSpecArtifactId: args.specArtifactId,
      }),
      provider: "manual",
      lifecycle: "preview",
      reviewStatus: "pending",
    });
  },
});

export const renderSlideForWorkflow = internalAction({
  args: {
    userId: v.string(),
    brandId: v.id("brands"),
    workflowId: v.id("workflows"),
    workflowRunId: v.id("workflowRuns"),
    slideshowId: v.id("slideshows"),
    slideId: v.string(),
    specArtifactId: v.id("artifacts"),
    parentArtifactIds: v.optional(v.array(v.id("artifacts"))),
    reviewStatus: v.union(v.literal("not_required"), v.literal("pending")),
  },
  handler: async (ctx, args): Promise<Id<"artifacts">> => {
    const slideshow = await ctx.runQuery(internal.content.slideshows.getForRunner, {
      slideshowId: args.slideshowId,
    });
    if (!slideshow || slideshow.userId !== args.userId) throw new Error("Slideshow not found");
    const spec = slideshow.spec as CanonicalSlideshowSpec;
    const slide = spec.slides.find((item) => item.slideId === args.slideId);
    if (!slide || slide.status === "deleted") throw new Error("Slide not found");

    const rendered = await renderSlideRaster(slide);
    const storageId = await ctx.storage.store(new Blob([rendered.png], { type: "image/png" }));
    const publishStorageId = await ctx.storage.store(new Blob([rendered.publish], { type: rendered.publishMimeType }));
    const renderedImageUrl = await ctx.storage.getUrl(storageId) ?? undefined;
    const publishImageUrl = await ctx.storage.getUrl(publishStorageId) ?? undefined;

    return await ctx.runMutation(internal.artifacts.records.createFromRunner, {
      userId: args.userId,
      brandId: args.brandId,
      workflowId: args.workflowId,
      workflowRunId: args.workflowRunId,
      parentArtifactIds: args.parentArtifactIds,
      type: "rendered_slide_image",
      title: `Rendered slide ${slide.index}`,
      storageUrl: renderedImageUrl,
      data: artifactData({
        slide,
        spec,
        slideshowId: args.slideshowId,
        renderedImageUrl,
        publishImageUrl,
        storageId,
        publishStorageId,
        rendered,
        sourceSlideSpecArtifactId: args.specArtifactId,
      }),
      provider: "manual",
      reviewStatus: args.reviewStatus,
    });
  },
});

export const rerenderSlideArtifact = internalAction({
  args: {
    artifactId: v.id("artifacts"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.runQuery(internal.artifacts.records.getForRunner, {
      artifactId: args.artifactId,
    });
    if (!artifact || artifact.userId !== args.userId || artifact.type !== "rendered_slide_image") {
      throw new Error("Rendered slide image not found");
    }
    const data = artifact.data && typeof artifact.data === "object"
      ? artifact.data as Record<string, unknown>
      : {};
    if (typeof data.sourceSlideshowId !== "string" || typeof data.sourceSlideId !== "string") {
      throw new Error("Rendered slide image is not linked to a slideshow spec");
    }
    const slideshowId = data.sourceSlideshowId as Id<"slideshows">;
    const slideshow = await ctx.runQuery(internal.content.slideshows.getForRunner, { slideshowId });
    if (!slideshow || slideshow.userId !== args.userId) throw new Error("Slideshow not found");
    const spec = slideshow.spec as CanonicalSlideshowSpec;
    const slide = spec.slides.find((item) => item.slideId === data.sourceSlideId);
    if (!slide || slide.status === "deleted") throw new Error("Slide not found");

    const rendered = await renderSlideRaster(slide);
    const storageId = await ctx.storage.store(new Blob([rendered.png], { type: "image/png" }));
    const publishStorageId = await ctx.storage.store(new Blob([rendered.publish], { type: rendered.publishMimeType }));
    const renderedImageUrl = await ctx.storage.getUrl(storageId) ?? undefined;
    const publishImageUrl = await ctx.storage.getUrl(publishStorageId) ?? undefined;

    for (const oldStorageId of [data.storageId, data.publishStorageId]) {
      if (typeof oldStorageId !== "string") continue;
      try {
        await ctx.storage.delete(oldStorageId as Id<"_storage">);
      } catch {
        // Old derived images are best-effort cleanup.
      }
    }

    await ctx.runMutation(internal.artifacts.records.updateFromRunner, {
      artifactId: artifact._id,
      userId: args.userId,
      storageUrl: renderedImageUrl,
      data: artifactData({
        artifact,
        slide,
        spec,
        slideshowId,
        renderedImageUrl,
        publishImageUrl,
        storageId,
        publishStorageId,
        rendered,
      }),
      reviewStatus: "pending",
    });

    return {
      renderedImageUrl,
      publishImageUrl,
      renderDurationMs: rendered.renderDurationMs,
      outputFileSize: rendered.png.byteLength,
      publishFileSize: rendered.publish.byteLength,
    };
  },
});
