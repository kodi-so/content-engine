import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { modelProviderValidator } from "../validators";
import {
  runCreateAudioRequest,
  runCreateImageRequest,
  runCreateVideoRequest,
} from "./createAssetRunner";

const referenceAssetValidator = v.object({
  url: v.string(),
  mimeType: v.string(),
  alias: v.optional(v.string()),
  description: v.optional(v.string()),
});

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

export const generateImage = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    prompt: v.string(),
    provider: v.optional(modelProviderValidator),
    model: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    count: v.optional(v.number()),
    providerInput: v.optional(v.any()),
    referenceImages: v.optional(v.array(referenceAssetValidator)),
  },
  handler: async (ctx, args): Promise<{
    artifactIds: Id<"artifacts">[];
    assets: Array<{ artifactId: Id<"artifacts">; storageUrl: string; title: string }>;
  }> => {
    const userId = currentUserId(await requireBetaAccessForAction(ctx));
    const { costUsd: _costUsd, ...result } = await runCreateImageRequest(ctx, {
      ...args,
      userId,
    });
    return result;
  },
});

export const generateVideo = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    prompt: v.string(),
    provider: v.optional(modelProviderValidator),
    model: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    providerInput: v.optional(v.any()),
    referenceImages: v.optional(v.array(referenceAssetValidator)),
    referenceVideos: v.optional(v.array(referenceAssetValidator)),
  },
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    storageUrl: string;
    title: string;
  }> => {
    const userId = currentUserId(await requireBetaAccessForAction(ctx));
    const { costUsd: _costUsd, ...result } = await runCreateVideoRequest(ctx, {
      ...args,
      userId,
    });
    return result;
  },
});

export const generateAudio = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    text: v.string(),
    provider: v.optional(modelProviderValidator),
    model: v.optional(v.string()),
    mode: v.optional(v.string()),
    providerInput: v.optional(v.any()),
    voiceReferenceAudios: v.optional(v.array(referenceAssetValidator)),
  },
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    storageUrl: string;
    title: string;
  }> => {
    const userId = currentUserId(await requireBetaAccessForAction(ctx));
    const { costUsd: _costUsd, ...result } = await runCreateAudioRequest(ctx, {
      ...args,
      userId,
    });
    return result;
  },
});
