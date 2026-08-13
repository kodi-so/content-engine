import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { internalAction, type MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import {
  researchSocialTrends,
  type SocialTrendPlatform,
  type SocialTrendResearchResult,
  type SocialTrendSort,
  type SocialTrendTimeframe,
} from "../../providers/scrapeCreators/client";
import { isRecord } from "../references/referenceResolution";
import { socialContentContextLines } from "./socialContentContext";
import {
  appendAgentMessage,
  cleanOptionalStringFromRecord,
  errorMessageFromUnknown,
} from "./toolExecutionShared";

function trendPlatform(value: unknown): SocialTrendPlatform | undefined {
  return value === "instagram" || value === "tiktok" || value === "both"
    ? value
    : undefined;
}

function trendTimeframe(value: unknown): SocialTrendTimeframe | undefined {
  return value === "day" || value === "week" || value === "month" || value === "all_time"
    ? value
    : undefined;
}

function trendSort(value: unknown): SocialTrendSort | undefined {
  return value === "trending" ||
    value === "relevance" ||
    value === "most_liked" ||
    value === "recent"
    ? value
    : undefined;
}

function trendLimit(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function socialTrendResearchAgentContext(result: SocialTrendResearchResult) {
  const researchLabel = result.query
    ? `keyword research for "${result.query}"`
    : "platform-wide trend research";
  const sourceSummary = result.sources.map((source) =>
    `${source.platform}: ${source.status}, ${source.contentCount} items, ${source.creditsCharged} credits`
  ).join("; ");
  if (!result.content.length) {
    return [
      `ScrapeCreators returned no usable public content for ${researchLabel}.`,
      `Sources: ${sourceSummary}.`,
      ...result.notes,
      "Do not invent trend examples or source URLs.",
    ].join("\n\n");
  }

  return [
    `ScrapeCreators returned ${result.content.length} public trend signal${result.content.length === 1 ? "" : "s"} from ${result.platforms.join(" and ")} for ${researchLabel}.`,
    `Sources: ${sourceSummary}.`,
    "Use these examples to identify recurring hooks, formats, themes, visual patterns, and audience angles. Treat them as evidence and inspiration, not templates to copy.",
    "If the user wants content created from the research, synthesize an original concept that fits the conversation and managed-account playbook. Use only the exact URLs below for follow-up analyze.source calls, and analyze no more than three representative examples unless the user requests otherwise.",
    ...socialContentContextLines(result.content, { includePlatform: true }),
    `Research qualifications:\n- ${result.notes.join("\n- ")}`,
  ].join("\n\n");
}

export async function createSocialTrendResearchForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  const platform = trendPlatform(input.platform);
  const query = cleanOptionalStringFromRecord(input, "query");
  const region = cleanOptionalStringFromRecord(input, "region");
  const timeframe = trendTimeframe(input.timeframe);
  const sortBy = trendSort(input.sortBy);
  const limit = trendLimit(input.limit);
  const now = Date.now();
  await ctx.db.patch(toolCall._id, {
    status: "running",
    startedAt: toolCall.startedAt ?? now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(
    0,
    internal.create.execution.socialTrendResearchExecution.executeSocialTrendResearch,
    {
      ...(platform ? { platform } : {}),
      ...(query ? { query } : {}),
      ...(region ? { region } : {}),
      ...(timeframe ? { timeframe } : {}),
      ...(sortBy ? { sortBy } : {}),
      ...(limit !== undefined ? { limit } : {}),
      threadId: thread._id,
      toolCallId: toolCall._id,
    }
  );

  await appendAgentMessage(ctx, thread, {
    content: query
      ? `Researching public social trends for “${query}”.`
      : "Researching public social trends.",
    kind: "status",
  });
  return true;
}

export const executeSocialTrendResearch = internalAction({
  args: {
    platform: v.optional(v.union(
      v.literal("instagram"),
      v.literal("tiktok"),
      v.literal("both")
    )),
    query: v.optional(v.string()),
    region: v.optional(v.string()),
    timeframe: v.optional(v.union(
      v.literal("day"),
      v.literal("week"),
      v.literal("month"),
      v.literal("all_time")
    )),
    sortBy: v.optional(v.union(
      v.literal("trending"),
      v.literal("relevance"),
      v.literal("most_liked"),
      v.literal("recent")
    )),
    limit: v.optional(v.number()),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const result = await researchSocialTrends({
        ...(args.platform ? { platform: args.platform } : {}),
        ...(args.query ? { query: args.query } : {}),
        ...(args.region ? { region: args.region } : {}),
        ...(args.timeframe ? { timeframe: args.timeframe } : {}),
        ...(args.sortBy ? { sortBy: args.sortBy } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
      });
      await ctx.runMutation(internal.create.toolExecution.completeSocialResearch, {
        agentContext: socialTrendResearchAgentContext(result),
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
