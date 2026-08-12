import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { getModelProvider } from "../providers";
import {
  DEFAULT_ACCOUNT_TIMEZONE,
  nextAutopilotRunAfterDue,
} from "./accountCadence";

type SocialAccount = Doc<"socialAccounts">;
const SCHEDULER_BATCH_SIZE = 25;

function calendarMonthStart(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(timestamp));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return Date.UTC(year, month - 1, 1);
}

function parseDecision(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? trimmed) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function accountLabel(account: SocialAccount) {
  return account.displayName?.trim() || `@${account.username}`;
}

export const runDueAccountAutopilots = internalMutation({
  args: {},
  returns: v.object({
    checkedAt: v.number(),
    dueAccountCount: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const dueAccounts = await ctx.db
      .query("socialAccounts")
      .withIndex("by_autopilot_status_and_next_run", (q) =>
        q.eq("autopilotStatus", "active").lte("nextAutopilotRunAt", now)
      )
      .take(SCHEDULER_BATCH_SIZE);

    for (const account of dueAccounts) {
      if (!account.autopilot) continue;
      const timezone = account.autopilot.timezone || DEFAULT_ACCOUNT_TIMEZONE;
      const monthStart = calendarMonthStart(now, timezone);
      const monthRuns = await ctx.db
        .query("accountAgentRuns")
        .withIndex("by_social_account_and_created_at", (q) =>
          q.eq("socialAccountId", account._id).gte("createdAt", monthStart)
        )
        .take(500);
      const monthCost = monthRuns.reduce((sum, run) => sum + (run.costUsd ?? 0), 0);
      const monthlyBudget = account.autopilot.budget?.maxUsdPerMonth;

      if (monthlyBudget !== undefined && monthCost >= monthlyBudget) {
        await ctx.db.insert("accountAgentRuns", {
          userId: account.userId,
          workspaceId: account.workspaceId,
          socialAccountId: account._id,
          trigger: "scheduled",
          status: "skipped",
          scheduledFor: account.nextAutopilotRunAt,
          decisionSummary: "Monthly budget exhausted",
          errorMessage: `Monthly budget of $${monthlyBudget.toFixed(2)} is exhausted.`,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(account._id, {
          lastAutopilotRunAt: now,
          nextAutopilotRunAt: nextAutopilotRunAfterDue(account, now),
          updatedAt: now,
        });
        continue;
      }

      const runId = await ctx.db.insert("accountAgentRuns", {
        userId: account.userId,
        workspaceId: account.workspaceId,
        socialAccountId: account._id,
        trigger: "scheduled",
        status: "queued",
        scheduledFor: account.nextAutopilotRunAt,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(account._id, {
        lastAutopilotRunAt: now,
        nextAutopilotRunAt: nextAutopilotRunAfterDue(account, now),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.accounts.autopilotScheduling.startAccountAgentRun, {
        runId,
      });
    }

    return { checkedAt: now, dueAccountCount: dueAccounts.length };
  },
});

export const getAccountAgentRunContext = internalQuery({
  args: { runId: v.id("accountAgentRuns") },
  returns: v.union(
    v.null(),
    v.object({
      account: v.any(),
      insights: v.array(v.any()),
      posts: v.array(v.any()),
      references: v.array(v.any()),
      run: v.any(),
    })
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const account = await ctx.db.get(run.socialAccountId);
    if (!account) return null;
    const posts = await ctx.db
      .query("accountPosts")
      .withIndex("by_social_account", (q) => q.eq("socialAccountId", account._id))
      .order("desc")
      .take(30);
    const insights = await ctx.db
      .query("accountInsights")
      .withIndex("by_social_account_and_status", (q) =>
        q.eq("socialAccountId", account._id).eq("status", "active")
      )
      .take(30);
    const referenceLinks = await ctx.db
      .query("accountReferences")
      .withIndex("by_social_account", (q) => q.eq("socialAccountId", account._id))
      .take(50);
    const references = [];
    for (const link of referenceLinks) {
      if (!link.isActive) continue;
      const asset = await ctx.db.get(link.creativeAssetId);
      if (asset) references.push({ link, asset });
    }
    return { account, insights, posts, references, run };
  },
});

export const startAccountAgentRun = internalAction({
  args: { runId: v.id("accountAgentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.accounts.autopilotScheduling.getAccountAgentRunContext,
      args
    );
    if (!context) return null;
    const { account, insights, posts, references } = context;
    const playbook = account.playbook ?? {
      summary: `Create content that naturally fits ${accountLabel(account)}.`,
      goals: [],
      instructions: [],
      guardrails: [],
    };
    let decisionSummary = `Create the next fitting post for ${accountLabel(account)}.`;
    let contentBrief = decisionSummary;
    let decisionCostUsd = 0;

    try {
      const provider = getModelProvider("openrouter");
      const response = await provider.generateText({
        model: process.env.CONTENT_ENGINE_ACCOUNT_MANAGER_MODEL?.trim() || undefined,
        maxTokens: 900,
        systemPrompt: [
          "You are the editorial decision-maker for one social media account.",
          "Choose exactly one concrete next post that fits the account as a whole.",
          "Use the feed history to avoid repetition, not as a rigid list of series.",
          "Return strict JSON with keys decisionSummary and contentBrief.",
          "contentBrief must be a self-contained production request for the Create agent.",
        ].join("\n"),
        prompt: [
          `Account: ${accountLabel(account)} on ${account.platform}`,
          `Account playbook: ${JSON.stringify(playbook)}`,
          `Autopilot settings and budget: ${JSON.stringify(account.autopilot)}`,
          account.agentSummary ? `Rolling account understanding: ${account.agentSummary}` : undefined,
          insights.length
            ? `Active insights:\n${insights.map((insight) => `- ${insight.statement}`).join("\n")}`
            : "Active insights: none yet.",
          posts.length
            ? `Recent account posts:\n${posts.map((post) =>
                `- ${post.status} | ${post.caption || "No caption"} | ${new Date(post.createdAt).toISOString()}`
              ).join("\n")}`
            : "Recent account posts: none yet.",
          references.length
            ? `Active identity/style references:\n${references.map(({ link, asset }) =>
                `- ${asset.name} (${link.role})${link.instruction ? `: ${link.instruction}` : ""}`
              ).join("\n")}`
            : "Active identity/style references: none.",
          "Create one new post. Do not simply repeat the most recent concept.",
          "The Create agent must finish by preparing this post for the scoped account.",
        ].filter(Boolean).join("\n\n"),
        metadata: {
          accountAgentRunId: args.runId,
          socialAccountId: account._id,
        },
      });
      const parsed = parseDecision(response.text);
      decisionCostUsd = response.metadata.costUsd ?? 0;
      decisionSummary = stringField(parsed, "decisionSummary") ?? decisionSummary;
      contentBrief = stringField(parsed, "contentBrief") ?? decisionSummary;
    } catch (error) {
      await ctx.runMutation(internal.accounts.autopilotScheduling.markAccountAgentRunFailed, {
        runId: args.runId,
        errorMessage: error instanceof Error ? error.message : "Account post decision failed",
      });
      return null;
    }

    await ctx.runMutation(internal.accounts.autopilotScheduling.seedAccountAgentThread, {
      runId: args.runId,
      decisionSummary,
      contentBrief,
      decisionCostUsd,
    });
    return null;
  },
});

export const seedAccountAgentThread = internalMutation({
  args: {
    runId: v.id("accountAgentRuns"),
    decisionSummary: v.string(),
    contentBrief: v.string(),
    decisionCostUsd: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const account = await ctx.db.get(run.socialAccountId);
    if (!account) return null;
    const referenceLinks = await ctx.db
      .query("accountReferences")
      .withIndex("by_social_account", (q) => q.eq("socialAccountId", account._id))
      .take(50);
    const referenceMentions = [];
    for (const link of referenceLinks) {
      if (!link.isActive) continue;
      const asset = await ctx.db.get(link.creativeAssetId);
      if (!asset) continue;
      referenceMentions.push({
        token: `@${asset.name.replace(/\s+/g, "_").toLowerCase()}`,
        label: asset.name,
        entityType: "creative_asset" as const,
        entityId: String(asset._id),
        mediaType: asset.mediaType,
        storageUrl: asset.storageUrl,
        instruction: link.instruction ?? `Use as an account ${link.role} reference.`,
      });
    }

    const now = Date.now();
    const threadId = await ctx.db.insert("createThreads", {
      userId: account.userId,
      workspaceId: account.workspaceId,
      origin: "account_schedule",
      socialAccountId: account._id,
      accountAgentRunId: run._id,
      title: accountLabel(account),
      status: "planning",
      checkpointMode: "auto",
      decisionRunId: crypto.randomUUID(),
      turnDecisionCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const messageId = await ctx.db.insert("createMessages", {
      userId: account.userId,
      workspaceId: account.workspaceId,
      createThreadId: threadId,
      role: "user",
      content: [
        args.contentBrief,
        `This post is for ${accountLabel(account)} on ${account.platform}.`,
        "When the media is complete, prepare the post for this account.",
      ].join("\n\n"),
      kind: "chat",
      referenceMentions: referenceMentions.length ? referenceMentions : undefined,
      createdAt: now,
    });
    const decisionRunId = crypto.randomUUID();
    await ctx.db.patch(threadId, { decisionRunId, updatedAt: now });
    await ctx.db.patch(run._id, {
      createThreadId: threadId,
      decisionSummary: args.decisionSummary,
      costUsd: args.decisionCostUsd,
      status: "running",
      startedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.create.agent.decideAgentTurn, {
      checkpointMode: "auto",
      decisionRunId,
      threadId,
      userMessageId: messageId,
    });
    return null;
  },
});

export const markAccountAgentRunFailed = internalMutation({
  args: {
    runId: v.id("accountAgentRuns"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markAccountAgentRunComplete = internalMutation({
  args: {
    runId: v.id("accountAgentRuns"),
    accountPostId: v.id("accountPosts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "completed",
      accountPostId: args.accountPostId,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});
