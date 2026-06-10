import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { storeGeneratedAsset } from "../content/assetStorage";
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

export const regenerate = action({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args): Promise<{ artifactIds: Id<"artifacts">[] }> => {
    const identity = await requireBetaAccessForAction(ctx);

    const context = await ctx.runQuery(internal.artifacts.records.getRegenerationContext, {
      artifactId: args.id,
      userId: identity.subject,
    });
    if (!context) throw new Error("Artifact not found");

    const { artifact, parentArtifacts, workflow } = context;
    if (artifact.reviewStatus !== "needs_revision") {
      throw new Error("Only artifacts marked as needs_revision can be regenerated");
    }

    const note = latestRevisionNote(artifact);
    const modelDefaults = workflow?.modelDefaults;
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
        const stored = await storeGeneratedAsset(ctx, image);
        artifactIds.push(
          await ctx.runMutation(internal.artifacts.records.createFromRunner, {
            userId: identity.subject,
            brandId: artifact.brandId,
            workflowId: artifact.workflowId,
            workflowRunId: artifact.workflowRunId,
            parentArtifactIds: [artifact._id, promptArtifactId],
            type: "image",
            title: `${artifact.title || "Image"} revision ${index + 1}`,
            storageUrl: stored.storageUrl,
            data: {
              storageId: stored.storageId,
              mimeType: stored.mimeType,
              fileSize: stored.byteLength,
            },
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

    throw new Error(`Regeneration is not supported for ${artifact.type} artifacts yet`);
  },
});
