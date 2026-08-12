import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { recordCreatedPostMemory } from "../accounts/accountMemory";
import { ensureCurrentUser } from "../auth/users";
import { resolveWritableWorkspace } from "../workspaces/workspaces";
import { publishingProviderValidator } from "../validators";

const DEFAULT_PUBLISHING_PROVIDER = "post_bridge";

export const composerMediaItemValidator = v.object({
  artifactId: v.optional(v.id("artifacts")),
  storageUrl: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  kind: v.optional(v.union(v.literal("image"), v.literal("video"))),
  title: v.optional(v.string()),
});

/**
 * Creates one account-owned draft per selected destination from media picked in the post
 * composer. Media can reference existing artifacts or plain storage URLs
 * (e.g. rendered slideshow slides); URL-only items get an artifact record so
 * each post fits the artifact-based publish pipeline.
 */
export const createPostsFromMedia = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    provider: v.optional(publishingProviderValidator),
    socialAccountIds: v.array(v.id("socialAccounts")),
    media: v.array(composerMediaItemValidator),
    caption: v.string(),
    scheduledFor: v.optional(v.number()),
    timezone: v.optional(v.string()),
    platformConfigurations: v.optional(v.any()),
    source: v.optional(v.string()),
  },
  returns: v.array(v.id("accountPosts")),
  handler: async (ctx, args): Promise<Id<"accountPosts">[]> => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);

    const workspace = args.workspaceId
      ? await resolveWritableWorkspace(ctx, userId, args.workspaceId)
      : defaultWorkspace;

    if (args.socialAccountIds.length === 0) {
      throw new Error("Select at least one social account");
    }
    if (args.media.length === 0) {
      throw new Error("Select media to post");
    }

    for (const socialAccountId of args.socialAccountIds) {
      const account = await ctx.db.get(socialAccountId);
      if (
        !account ||
        (account.workspaceId
          ? account.workspaceId !== workspace._id
          : account.userId !== userId)
      ) {
        throw new Error("Social account not found");
      }
    }

    for (const item of args.media) {
      if (item.artifactId) {
        const artifact = await ctx.db.get(item.artifactId);
        if (
          !artifact ||
          (artifact.workspaceId
            ? artifact.workspaceId !== workspace._id
            : artifact.userId !== userId)
        ) {
          throw new Error("Artifact not found");
        }
      } else if (!item.storageUrl) {
        throw new Error("Media items need an artifact or a storage URL");
      }
    }

    const now = Date.now();
    const postIds: Id<"accountPosts">[] = [];
    for (const socialAccountId of args.socialAccountIds) {
      const artifactIds: Id<"artifacts">[] = [];
      for (const [index, item] of args.media.entries()) {
        const source = item.artifactId ? await ctx.db.get(item.artifactId) : null;
        const sourceData = source?.data && typeof source.data === "object" && !Array.isArray(source.data)
          ? source.data as Record<string, unknown>
          : {};
        artifactIds.push(await ctx.db.insert("artifacts", {
          userId,
          workspaceId: workspace._id,
          socialAccountId,
          parentArtifactIds: source ? [source._id] : undefined,
          type: source?.type ?? (item.kind === "video" ? "video" : "rendered_asset"),
          title: item.title ?? source?.title ?? `Post media ${index + 1}`,
          storageUrl: item.storageUrl ?? source?.storageUrl,
          data: {
            ...sourceData,
            format: "post_composer_media",
            slideIndex: index,
            mimeType: item.mimeType ?? sourceData.mimeType,
            sourceArtifactId: source?._id,
          },
          provider: source?.provider ?? "manual",
          model: source?.model,
          prompt: source?.prompt,
          lifecycle: "saved",
          reviewStatus: "approved",
          createdAt: now,
          updatedAt: now,
        }));
      }
      const postId = await ctx.db.insert("accountPosts", {
        userId,
        workspaceId: workspace._id,
        socialAccountId,
        origin: "manual",
        artifactIds,
        provider: args.provider ?? DEFAULT_PUBLISHING_PROVIDER,
        status: "draft",
        scheduledFor: args.scheduledFor,
        timezone: args.timezone,
        caption: args.caption,
        providerPayload: {
          source: args.source ?? "post_composer",
          ...(args.platformConfigurations
            ? { platformConfigurations: args.platformConfigurations }
            : {}),
        },
        createdAt: now,
        updatedAt: now,
      });
      for (const artifactId of artifactIds) {
        await ctx.db.patch(artifactId, { accountPostId: postId, updatedAt: now });
      }
      await recordCreatedPostMemory(ctx, {
        accountPostId: postId,
        artifactIds,
        caption: args.caption,
        socialAccountId,
        userId,
        workspaceId: workspace._id,
      });
      postIds.push(postId);
    }
    return postIds;
  },
});
