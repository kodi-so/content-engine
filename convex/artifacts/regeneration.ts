import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getRenderedSlideDimensions,
  slideFromCopy,
} from "../content/slideshowAdapter";
import {
  fetchImageDataUri,
  renderSlideSvg,
} from "../content/slideshowRenderer";
import { getModelProvider } from "../providers";
import type { ModelProviderName } from "../providers/model";

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

function renderedSlideCopy(data: Record<string, unknown>): {
  headline?: string;
  body?: string;
} {
  const headline = typeof data.headline === "string" ? data.headline : undefined;
  const body = typeof data.body === "string" ? data.body : undefined;
  if (headline || body) return { headline, body };

  const textBlocks = Array.isArray(data.textBlocks) ? data.textBlocks : [];
  const blockText = (roles: string[]) => {
    const block = textBlocks.find((item) =>
      item &&
      typeof item === "object" &&
      roles.includes(String((item as Record<string, unknown>).role))
    );
    if (!block || typeof block !== "object") return undefined;

    const record = block as Record<string, unknown>;
    if (typeof record.text === "string" && record.text.trim()) return record.text.trim();
    if (Array.isArray(record.items)) {
      const items = record.items.filter((item): item is string => typeof item === "string");
      if (items.length) return items.join("\n");
    }
    return undefined;
  };

  return {
    headline: blockText(["headline", "cta"]),
    body: blockText(["body", "bullet_list"]),
  };
}

export const regenerate = action({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args): Promise<{ artifactIds: Id<"artifacts">[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const context = await ctx.runQuery(internal.artifacts.records.getRegenerationContext, {
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
      const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
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
        await ctx.runMutation(internal.workflows.runs.recordEvent, {
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
      const promptArtifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
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
          await ctx.runMutation(internal.artifacts.records.createFromRunner, {
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
          await ctx.runMutation(internal.artifacts.records.createFromRunner, {
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
        await ctx.runMutation(internal.workflows.runs.recordEvent, {
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
      const currentCopy = renderedSlideCopy(sourceData);
      const response = await textProvider.generateText({
        systemPrompt:
          "You revise short-form slideshow overlay copy. Return compact JSON only: {\"headline\":\"...\",\"body\":\"...\"}.",
        prompt: [
          "Revise this rendered slide using the review note.",
          `Current headline: ${currentCopy.headline ?? ""}`,
          `Current body: ${currentCopy.body ?? ""}`,
          `Review note: ${note}`,
          "Keep the headline punchy and the body readable on a phone screen.",
        ].join("\n"),
        responseFormat: { type: "json_object" },
        model: modelDefaults?.preferredTextModel,
        maxTokens: 500,
        metadata: { sourceArtifactId: artifact._id },
      });
      const revisedCopy = parseRenderedSlideRevision(response.text, {
        headline: currentCopy.headline,
        body: currentCopy.body,
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
      const renderableSlide = slideFromCopy({
        index: slideIndex,
        role,
        headline: revisedCopy.headline,
        body: revisedCopy.body,
        visualPrompt: typeof sourceData.visualPrompt === "string" ? sourceData.visualPrompt : undefined,
        layout: sourceData.layout,
      });
      const svg = renderSlideSvg({
        dimensions,
        backgroundImageDataUri,
        slide: renderableSlide,
      });
      const storageId = await ctx.storage.store(
        new Blob([svg], { type: "image/svg+xml" })
      );
      const renderedImageUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
      const artifactId = await ctx.runMutation(internal.artifacts.records.createFromRunner, {
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
          role: renderableSlide.role,
          textBlocks: renderableSlide.textBlocks,
          layout: renderableSlide.layout,
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
        await ctx.runMutation(internal.workflows.runs.recordEvent, {
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
