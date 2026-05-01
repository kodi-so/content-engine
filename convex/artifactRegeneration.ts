import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getModelProvider } from "./providers";
import type { ModelProviderName } from "./providers/model";

function latestRevisionNote(artifact: Doc<"artifacts">): string {
  if (!artifact.data || typeof artifact.data !== "object") {
    return "Regenerate this artifact with the requested revision.";
  }

  const data = artifact.data as Record<string, unknown>;
  if (typeof data.latestRevisionNote === "string" && data.latestRevisionNote.trim()) {
    return data.latestRevisionNote.trim();
  }

  const revisionRequests = Array.isArray(data.revisionRequests)
    ? data.revisionRequests
    : [];
  const latest = revisionRequests[revisionRequests.length - 1];
  if (latest && typeof latest === "object") {
    const note = (latest as Record<string, unknown>).note;
    if (typeof note === "string" && note.trim()) return note.trim();
  }

  return "Regenerate this artifact with the requested revision.";
}

function getArtifactPrompt(artifact: Doc<"artifacts">): string | undefined {
  if (artifact.prompt?.trim()) return artifact.prompt.trim();
  if (!artifact.data || typeof artifact.data !== "object") return undefined;

  const data = artifact.data as Record<string, unknown>;
  const prompt = data.prompt ?? data.visualPrompt;
  return typeof prompt === "string" && prompt.trim() ? prompt.trim() : undefined;
}

function getModelProviderName(
  value: unknown,
  fallback: ModelProviderName
): ModelProviderName {
  return value === "gemini" ||
    value === "fal" ||
    value === "openrouter" ||
    value === "manual"
    ? value
    : fallback;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(value: string | undefined, maxChars: number): string[] {
  if (!value?.trim()) return [];

  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > maxChars && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

async function fetchImageDataUri(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;

  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;

    const contentType = response.headers.get("content-type") ?? "image/png";
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const chunkSize = 8192;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
    }

    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return undefined;
  }
}

function getRenderedSlideDimensions(data: Record<string, unknown>): {
  width: number;
  height: number;
} {
  const dimensions = data.dimensions;
  if (dimensions && typeof dimensions === "object") {
    const width = (dimensions as Record<string, unknown>).width;
    const height = (dimensions as Record<string, unknown>).height;
    if (typeof width === "number" && typeof height === "number") {
      return { width, height };
    }
  }

  if (data.aspectRatio === "1:1") return { width: 1080, height: 1080 };
  if (data.aspectRatio === "4:5") return { width: 1080, height: 1350 };
  if (data.aspectRatio === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 };
}

function renderSlideSvg(args: {
  dimensions: { width: number; height: number };
  backgroundImageDataUri?: string;
  headline?: string;
  body?: string;
  role?: string;
  slideIndex: number;
}): string {
  const { width, height } = args.dimensions;
  const margin = Math.round(width * 0.075);
  const panelHeight = Math.round(height * 0.36);
  const panelY = height - panelHeight;
  const headlineSize = Math.round(width * 0.065);
  const bodySize = Math.round(width * 0.036);
  const eyebrowSize = Math.round(width * 0.026);
  const maxHeadlineChars = width > height ? 34 : 21;
  const maxBodyChars = width > height ? 72 : 42;
  const headlineLines = wrapText(args.headline, maxHeadlineChars).slice(0, 4);
  const bodyLines = wrapText(args.body, maxBodyChars).slice(0, 4);
  const background = args.backgroundImageDataUri
    ? `<image href="${args.backgroundImageDataUri}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />`
    : `<linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#203428" />
        <stop offset="48%" stop-color="#877c5e" />
        <stop offset="100%" stop-color="#f2bd5f" />
      </linearGradient>
      <rect width="${width}" height="${height}" fill="url(#background)" />`;
  const headlineText = headlineLines
    .map(
      (line, index) =>
        `<tspan x="${margin}" dy="${index === 0 ? 0 : headlineSize * 1.08}">${escapeXml(line)}</tspan>`
    )
    .join("");
  const bodyText = bodyLines
    .map(
      (line, index) =>
        `<tspan x="${margin}" dy="${index === 0 ? 0 : bodySize * 1.35}">${escapeXml(line)}</tspan>`
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Rendered slide ${args.slideIndex}">
    <defs>
      <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#101712" stop-opacity="0" />
        <stop offset="38%" stop-color="#101712" stop-opacity="0.74" />
        <stop offset="100%" stop-color="#101712" stop-opacity="0.96" />
      </linearGradient>
    </defs>
    ${background}
    <rect width="${width}" height="${height}" fill="#101712" opacity="${args.backgroundImageDataUri ? 0.18 : 0}" />
    <rect y="${panelY}" width="${width}" height="${panelHeight}" fill="url(#panel)" />
    <text x="${margin}" y="${panelY + margin * 0.9}" fill="#f8f3e7" font-family="Georgia, 'Times New Roman', serif" font-size="${eyebrowSize}" font-weight="700" letter-spacing="${Math.round(width * 0.004)}">${escapeXml(args.role ?? `Slide ${args.slideIndex}`)}</text>
    <text x="${margin}" y="${panelY + margin * 1.72}" fill="#ffffff" font-family="Georgia, 'Times New Roman', serif" font-size="${headlineSize}" font-weight="800" letter-spacing="-2">${headlineText}</text>
    <text x="${margin}" y="${panelY + margin * 1.95 + headlineLines.length * headlineSize * 1.08}" fill="#f2eee3" font-family="Arial, sans-serif" font-size="${bodySize}" font-weight="500">${bodyText}</text>
  </svg>`;
}

function parseRenderedSlideRevision(
  text: string,
  fallback: { headline?: string; body?: string }
): { headline?: string; body?: string } {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      headline:
        typeof parsed.headline === "string" && parsed.headline.trim()
          ? parsed.headline.trim()
          : fallback.headline,
      body:
        typeof parsed.body === "string" && parsed.body.trim()
          ? parsed.body.trim()
          : fallback.body,
    };
  } catch {
    return fallback;
  }
}

export const regenerate = action({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args): Promise<{ artifactIds: Id<"artifacts">[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const context = await ctx.runQuery(internal.artifacts.getRegenerationContext, {
      artifactId: args.id,
      userId: identity.subject,
    });
    if (!context) throw new Error("Artifact not found");

    const { artifact, parentArtifacts, workflowVersion } = context;
    if (artifact.reviewStatus !== "needs_revision") {
      throw new Error("Only artifacts marked as needs_revision can be regenerated");
    }

    const note = latestRevisionNote(artifact);
    const modelDefaults = workflowVersion?.modelDefaults;
    const textProvider = getModelProvider(
      getModelProviderName(modelDefaults?.textProvider, "openrouter")
    );

    if (artifact.type === "image_prompt") {
      const sourcePrompt = getArtifactPrompt(artifact);
      if (!sourcePrompt) throw new Error("Image prompt artifact has no prompt to revise");

      const response = await textProvider.generateText({
        systemPrompt:
          "You revise production image prompts for short-form social content. Return only the revised prompt.",
        prompt: [
          "Revise this image prompt using the review note.",
          `Original prompt: ${sourcePrompt}`,
          `Review note: ${note}`,
        ].join("\n"),
        model: modelDefaults?.preferredTextModel,
        maxTokens: 500,
        metadata: { sourceArtifactId: artifact._id },
      });
      const revisedPrompt = response.text.trim() || sourcePrompt;
      const sourceData =
        artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data)
          ? (artifact.data as Record<string, unknown>)
          : {};
      const artifactId = await ctx.runMutation(internal.artifacts.createFromRunner, {
        userId: identity.subject,
        brandId: artifact.brandId,
        workflowId: artifact.workflowId,
        workflowRunId: artifact.workflowRunId,
        parentArtifactIds: [artifact._id],
        type: "image_prompt",
        title: `${artifact.title || "Image prompt"} revision`,
        data: {
          ...sourceData,
          prompt: revisedPrompt,
          sourceArtifactId: artifact._id,
          regeneration: {
            requestedFromArtifactId: artifact._id,
            note,
            regeneratedAt: Date.now(),
          },
        },
        provider: response.metadata.provider,
        model: response.metadata.model,
        prompt: revisedPrompt,
        reviewStatus: "pending",
      });

      if (artifact.workflowRunId && artifact.workflowId) {
        await ctx.runMutation(internal.workflowRuns.recordEvent, {
          userId: identity.subject,
          workflowRunId: artifact.workflowRunId,
          workflowId: artifact.workflowId,
          type: "artifact_created",
          message: "Regenerated image prompt from revision feedback.",
          data: { artifactId, sourceArtifactId: artifact._id, note },
        });
      }

      return { artifactIds: [artifactId] };
    }

    if (artifact.type === "image") {
      const sourcePrompt =
        getArtifactPrompt(artifact) ??
        parentArtifacts.map((item: Doc<"artifacts">) => getArtifactPrompt(item)).find(Boolean);
      if (!sourcePrompt) throw new Error("Image artifact has no prompt to regenerate from");

      const rewrite = await textProvider.generateText({
        systemPrompt:
          "You revise image generation prompts for short-form social content. Return only the revised prompt.",
        prompt: [
          "Revise this image generation prompt using the review note.",
          `Original prompt: ${sourcePrompt}`,
          `Review note: ${note}`,
        ].join("\n"),
        model: modelDefaults?.preferredTextModel,
        maxTokens: 500,
        metadata: { sourceArtifactId: artifact._id },
      });
      const revisedPrompt = rewrite.text.trim() || sourcePrompt;
      const promptArtifactId = await ctx.runMutation(internal.artifacts.createFromRunner, {
        userId: identity.subject,
        brandId: artifact.brandId,
        workflowId: artifact.workflowId,
        workflowRunId: artifact.workflowRunId,
        parentArtifactIds: [
          artifact._id,
          ...parentArtifacts.map((item: Doc<"artifacts">) => item._id),
        ],
        type: "image_prompt",
        title: `${artifact.title || "Image"} revised prompt`,
        data: {
          prompt: revisedPrompt,
          sourceArtifactId: artifact._id,
          regeneration: {
            requestedFromArtifactId: artifact._id,
            note,
            regeneratedAt: Date.now(),
          },
        },
        provider: rewrite.metadata.provider,
        model: rewrite.metadata.model,
        prompt: revisedPrompt,
        reviewStatus: "pending",
      });

      const mediaProvider = getModelProvider(
        getModelProviderName(modelDefaults?.mediaProvider, "fal")
      );
      const sourceData =
        artifact.data && typeof artifact.data === "object"
          ? (artifact.data as Record<string, unknown>)
          : {};
      const aspectRatio =
        typeof sourceData.aspectRatio === "string" ? sourceData.aspectRatio : undefined;
      const imageResult = await mediaProvider.generateImage({
        prompt: revisedPrompt,
        model: modelDefaults?.preferredImageModel,
        aspectRatio,
        count: 1,
        metadata: {
          sourceArtifactId: artifact._id,
          revisionNote: note,
        },
      });
      const artifactIds: Id<"artifacts">[] = [promptArtifactId];

      for (const [index, image] of imageResult.images.entries()) {
        artifactIds.push(
          await ctx.runMutation(internal.artifacts.createFromRunner, {
            userId: identity.subject,
            brandId: artifact.brandId,
            workflowId: artifact.workflowId,
            workflowRunId: artifact.workflowRunId,
            parentArtifactIds: [artifact._id, promptArtifactId],
            type: "image",
            title: `${artifact.title || "Image"} revision ${index + 1}`,
            storageUrl: image.url,
            data: image.url ? { url: image.url, mimeType: image.mimeType } : image,
            provider: imageResult.metadata.provider,
            model: imageResult.metadata.model,
            prompt: revisedPrompt,
            reviewStatus: "pending",
          })
        );
      }

      if (imageResult.jobId) {
        artifactIds.push(
          await ctx.runMutation(internal.artifacts.createFromRunner, {
            userId: identity.subject,
            brandId: artifact.brandId,
            workflowId: artifact.workflowId,
            workflowRunId: artifact.workflowRunId,
            parentArtifactIds: [artifact._id, promptArtifactId],
            type: "image",
            title: `${artifact.title || "Image"} revision job`,
            data: {
              jobId: imageResult.jobId,
              status: imageResult.status,
              sourceArtifactId: artifact._id,
              revisionNote: note,
            },
            provider: imageResult.metadata.provider,
            model: imageResult.metadata.model,
            prompt: revisedPrompt,
            reviewStatus: "pending",
          })
        );
      }

      if (artifact.workflowRunId && artifact.workflowId) {
        await ctx.runMutation(internal.workflowRuns.recordEvent, {
          userId: identity.subject,
          workflowRunId: artifact.workflowRunId,
          workflowId: artifact.workflowId,
          type: "artifact_created",
          message: "Regenerated image artifacts from revision feedback.",
          data: {
            artifactIds,
            sourceArtifactId: artifact._id,
            note,
            provider: imageResult.metadata.provider,
            model: imageResult.metadata.model,
          },
        });
      }

      return { artifactIds };
    }

    if (artifact.type === "rendered_slide") {
      const sourceData =
        artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data)
          ? (artifact.data as Record<string, unknown>)
          : {};
      const currentHeadline =
        typeof sourceData.headline === "string" ? sourceData.headline : undefined;
      const currentBody =
        typeof sourceData.body === "string" ? sourceData.body : undefined;
      const response = await textProvider.generateText({
        systemPrompt:
          "You revise short-form slideshow overlay copy. Return compact JSON only: {\"headline\":\"...\",\"body\":\"...\"}.",
        prompt: [
          "Revise this rendered slide using the review note.",
          `Current headline: ${currentHeadline ?? ""}`,
          `Current body: ${currentBody ?? ""}`,
          `Review note: ${note}`,
          "Keep the headline punchy and the body readable on a phone screen.",
        ].join("\n"),
        responseFormat: { type: "json_object" },
        model: modelDefaults?.preferredTextModel,
        maxTokens: 500,
        metadata: { sourceArtifactId: artifact._id },
      });
      const revisedCopy = parseRenderedSlideRevision(response.text, {
        headline: currentHeadline,
        body: currentBody,
      });
      const dimensions = getRenderedSlideDimensions(sourceData);
      const backgroundImageUrl =
        typeof sourceData.backgroundImageUrl === "string"
          ? sourceData.backgroundImageUrl
          : undefined;
      const backgroundImageDataUri = await fetchImageDataUri(backgroundImageUrl);
      const slideIndex =
        typeof sourceData.slideIndex === "number" ? sourceData.slideIndex : 1;
      const role = typeof sourceData.role === "string" ? sourceData.role : undefined;
      const svg = renderSlideSvg({
        dimensions,
        backgroundImageDataUri,
        headline: revisedCopy.headline,
        body: revisedCopy.body,
        role,
        slideIndex,
      });
      const storageId = await ctx.storage.store(
        new Blob([svg], { type: "image/svg+xml" })
      );
      const renderedImageUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
      const artifactId = await ctx.runMutation(internal.artifacts.createFromRunner, {
        userId: identity.subject,
        brandId: artifact.brandId,
        workflowId: artifact.workflowId,
        workflowRunId: artifact.workflowRunId,
        parentArtifactIds: [artifact._id],
        type: "rendered_slide",
        title: `${artifact.title || "Rendered slide"} revision`,
        storageUrl: renderedImageUrl,
        data: {
          ...sourceData,
          headline: revisedCopy.headline,
          body: revisedCopy.body,
          renderedImageUrl,
          storageId,
          backgroundEmbedded: Boolean(backgroundImageDataUri),
          sourceArtifactId: artifact._id,
          regeneration: {
            requestedFromArtifactId: artifact._id,
            note,
            regeneratedAt: Date.now(),
            provider: response.metadata.provider,
            model: response.metadata.model,
          },
        },
        provider: response.metadata.provider,
        model: response.metadata.model,
        prompt: response.text,
        reviewStatus: "pending",
      });

      if (artifact.workflowRunId && artifact.workflowId) {
        await ctx.runMutation(internal.workflowRuns.recordEvent, {
          userId: identity.subject,
          workflowRunId: artifact.workflowRunId,
          workflowId: artifact.workflowId,
          type: "artifact_created",
          message: "Regenerated rendered slide from revision feedback.",
          data: {
            artifactId,
            sourceArtifactId: artifact._id,
            note,
            provider: response.metadata.provider,
            model: response.metadata.model,
          },
        });
      }

      return { artifactIds: [artifactId] };
    }

    throw new Error(`Regeneration is not supported for ${artifact.type} artifacts yet`);
  },
});
