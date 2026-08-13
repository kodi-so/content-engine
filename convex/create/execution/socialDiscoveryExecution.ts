import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { internalAction, type MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import {
  discoverSocialContent,
  type SocialDiscoveryPlatform,
  type SocialDiscoveryResult,
  type SocialDiscoverySort,
} from "../../providers/scrapeCreators/client";
import { socialContentContextLines } from "./socialContentContext";
import { isRecord } from "../references/referenceResolution";
import {
  appendAgentMessage,
  cleanOptionalStringFromRecord,
  errorMessageFromUnknown,
} from "./toolExecutionShared";

function socialPlatform(value: unknown): SocialDiscoveryPlatform | undefined {
  return value === "instagram" || value === "tiktok" ? value : undefined;
}

function socialSort(value: unknown): SocialDiscoverySort | undefined {
  return value === "latest" || value === "popular" ? value : undefined;
}

function discoveryLimit(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function socialDiscoveryAgentContext(result: SocialDiscoveryResult) {
  if (!result.content.length) {
    return [
      `ScrapeCreators found no public ${result.platform} content for @${result.handle}.`,
      "The profile may be private, unavailable, or not exposing content publicly. Do not invent post URLs.",
    ].join("\n");
  }

  const lines = socialContentContextLines(result.content);

  return [
    `ScrapeCreators discovered ${result.content.length} public ${result.platform} item${result.content.length === 1 ? "" : "s"} for @${result.handle}.`,
    "These are the canonical source URLs available for follow-up analysis. Use only URLs from this result; do not fabricate or reconstruct different post URLs.",
    ...lines,
    result.hasMore && result.nextCursor
      ? `More results are available with cursor: ${result.nextCursor}`
      : "No additional result page was reported.",
  ].join("\n\n");
}

export async function createSocialDiscoveryForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const profile = cleanOptionalStringFromRecord(input, "profile") ?? "";
  if (!profile) throw new Error("Social content discovery needs a profile URL or handle.");

  const platform = socialPlatform(input.platform);
  const limit = discoveryLimit(input.limit);
  const cursor = cleanOptionalStringFromRecord(input, "cursor");
  const region = cleanOptionalStringFromRecord(input, "region");
  const sortBy = socialSort(input.sortBy);
  const now = Date.now();
  await ctx.db.patch(toolCall._id, {
    status: "running",
    startedAt: toolCall.startedAt ?? now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(
    0,
    internal.create.execution.socialDiscoveryExecution.executeSocialDiscovery,
    {
      profile,
      ...(platform ? { platform } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor ? { cursor } : {}),
      ...(region ? { region } : {}),
      ...(sortBy ? { sortBy } : {}),
      threadId: thread._id,
      toolCallId: toolCall._id,
    }
  );

  await appendAgentMessage(ctx, thread, {
    content: `Looking up public social content for ${profile}.`,
    kind: "status",
  });
  return true;
}

export const executeSocialDiscovery = internalAction({
  args: {
    profile: v.string(),
    platform: v.optional(v.union(v.literal("instagram"), v.literal("tiktok"))),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    region: v.optional(v.string()),
    sortBy: v.optional(v.union(v.literal("latest"), v.literal("popular"))),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const result = await discoverSocialContent({
        profile: args.profile,
        ...(args.platform ? { platform: args.platform } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.cursor ? { cursor: args.cursor } : {}),
        ...(args.region ? { region: args.region } : {}),
        ...(args.sortBy ? { sortBy: args.sortBy } : {}),
      });
      await ctx.runMutation(internal.create.toolExecution.completeSocialResearch, {
        agentContext: socialDiscoveryAgentContext(result),
        result,
        threadId: args.threadId,
        toolCallId: args.toolCallId,
      });
    } catch (error) {
      await ctx.runMutation(internal.create.toolExecution.failSocialResearch, {
        errorMessage: errorMessageFromUnknown(error),
        threadId: args.threadId,
        toolCallId: args.toolCallId,
      });
    }
    return null;
  },
});
