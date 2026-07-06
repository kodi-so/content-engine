import { v } from "convex/values";
import {
  action,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  automationApprovalModeValidator,
  automationScheduleValidator,
} from "../validators";
import { calendarMonthStart, nextScheduledRunAt } from "./scheduling";

const generationDefaultsValidator = v.object({
  imageResolution: v.optional(v.string()),
  aspectRatio: v.optional(v.string()),
  imageModel: v.optional(v.string()),
  videoModel: v.optional(v.string()),
});

const budgetValidator = v.object({
  maxUsdPerRun: v.optional(v.number()),
  maxUsdPerMonth: v.optional(v.number()),
});

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

async function requireAutomationAccess(
  ctx: MutationCtx | QueryCtx,
  automationId: Id<"automations">,
  userId: string
) {
  const automation = await ctx.db.get(automationId);
  if (!automation) throw new Error("Automation not found");
  if (automation.workspaceId) {
    await requireWorkspaceMember(ctx, automation.workspaceId, userId);
  } else if (automation.userId !== userId) {
    throw new Error("Automation not found");
  }
  return automation;
}

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    const automations = args.workspaceId
      ? await (async () => {
          await requireWorkspaceMember(ctx, args.workspaceId!, userId);
          return await ctx.db
            .query("automations")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
            .order("desc")
            .collect();
        })()
      : await ctx.db
          .query("automations")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .order("desc")
          .collect();

    return await Promise.all(
      automations.map(async (automation) => {
        const runs = await ctx.db
          .query("automationRuns")
          .withIndex("by_automation_started", (q) => q.eq("automationId", automation._id))
          .order("desc")
          .take(3);
        const monthStart = calendarMonthStart(
          Date.now(),
          automation.scheduleConfig.timezone || "America/Chicago"
        );
        const monthRuns = await ctx.db
          .query("automationRuns")
          .withIndex("by_automation_started", (q) =>
            q.eq("automationId", automation._id).gte("startedAt", monthStart)
          )
          .collect();
        const pendingApprovalRuns = await ctx.db
          .query("automationRuns")
          .withIndex("by_automation", (q) => q.eq("automationId", automation._id))
          .filter((q) => q.eq(q.field("status"), "awaiting_approval"))
          .collect();
        const pendingApprovalCount = pendingApprovalRuns.length;
        return {
          ...automation,
          recentRuns: runs,
          monthToDateSpendUsd: monthRuns.reduce((sum, run) => sum + (run.costUsd ?? 0), 0),
          pendingApprovalCount,
        };
      })
    );
  },
});

export const get = query({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    const automation = await ctx.db.get(args.id);
    if (!automation) return null;
    if (automation.workspaceId) {
      await requireWorkspaceMember(ctx, automation.workspaceId, userId);
    } else if (automation.userId !== userId) {
      return null;
    }
    const runs = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation_started", (q) => q.eq("automationId", automation._id))
      .order("desc")
      .take(50);
    return { ...automation, runs };
  },
});

export const create = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountIds: v.array(v.id("socialAccounts")),
    name: v.string(),
    brief: v.string(),
    pillars: v.array(v.string()),
    formatMix: v.optional(v.string()),
    scheduleConfig: automationScheduleValidator,
    approvalMode: automationApprovalModeValidator,
    generationDefaults: v.optional(generationDefaultsValidator),
    budget: v.optional(budgetValidator),
  },
  handler: async (ctx, args) => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    const workspace = args.workspaceId
      ? await resolveWritableWorkspace(ctx, userId, args.workspaceId)
      : defaultWorkspace;
    const now = Date.now();
    const automationId = await ctx.db.insert("automations", {
      userId,
      workspaceId: workspace._id,
      socialAccountIds: args.socialAccountIds,
      name: args.name.trim() || "Untitled automation",
      brief: args.brief.trim(),
      pillars: args.pillars.map((pillar) => pillar.trim()).filter(Boolean),
      formatMix: args.formatMix?.trim() || undefined,
      scheduleConfig: args.scheduleConfig,
      approvalMode: args.approvalMode,
      generationDefaults: args.generationDefaults,
      budget: args.budget,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });
    const automation = await ctx.db.get(automationId);
    await ctx.db.patch(automationId, {
      nextRunAt: automation ? nextScheduledRunAt(automation) : undefined,
    });
    return automationId;
  },
});

export const update = mutation({
  args: {
    id: v.id("automations"),
    socialAccountIds: v.optional(v.array(v.id("socialAccounts"))),
    name: v.optional(v.string()),
    brief: v.optional(v.string()),
    pillars: v.optional(v.array(v.string())),
    formatMix: v.optional(v.string()),
    scheduleConfig: v.optional(automationScheduleValidator),
    approvalMode: v.optional(automationApprovalModeValidator),
    generationDefaults: v.optional(generationDefaultsValidator),
    budget: v.optional(budgetValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const automation = await requireAutomationAccess(ctx, args.id, userId);
    const patch: Partial<typeof automation> = { updatedAt: Date.now() };
    if (args.socialAccountIds !== undefined) patch.socialAccountIds = args.socialAccountIds;
    if (args.name !== undefined) patch.name = args.name.trim() || automation.name;
    if (args.brief !== undefined) patch.brief = args.brief.trim();
    if (args.pillars !== undefined) patch.pillars = args.pillars.map((pillar) => pillar.trim()).filter(Boolean);
    if (args.formatMix !== undefined) patch.formatMix = args.formatMix.trim() || undefined;
    if (args.scheduleConfig !== undefined) patch.scheduleConfig = args.scheduleConfig;
    if (args.approvalMode !== undefined) patch.approvalMode = args.approvalMode;
    if (args.generationDefaults !== undefined) patch.generationDefaults = args.generationDefaults;
    if (args.budget !== undefined) patch.budget = args.budget;
    const updated = { ...automation, ...patch };
    patch.nextRunAt = updated.isActive ? nextScheduledRunAt(updated) : automation.nextRunAt;
    await ctx.db.patch(args.id, patch);
  },
});

export const setActive = mutation({
  args: { id: v.id("automations"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const automation = await requireAutomationAccess(ctx, args.id, userId);
    const updated = { ...automation, isActive: args.isActive };
    await ctx.db.patch(args.id, {
      isActive: args.isActive,
      nextRunAt: args.isActive ? nextScheduledRunAt(updated) : undefined,
      updatedAt: Date.now(),
    });
  },
});

// One immediate run outside the schedule. Does not touch nextRunAt or isActive,
// so it works on paused automations and never disturbs the cadence.
export const runNow = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const automation = await requireAutomationAccess(ctx, args.id, userId);
    const now = Date.now();
    const runId = await ctx.db.insert("automationRuns", {
      automationId: automation._id,
      userId: automation.userId,
      workspaceId: automation.workspaceId,
      topic: "Picking topic",
      status: "picking_topic",
      startedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.automations.scheduling.startAutomationRun, {
      runId,
    });
    return runId;
  },
});

export const remove = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const automation = await requireAutomationAccess(ctx, args.id, userId);
    const runs = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation", (q) => q.eq("automationId", automation._id))
      .collect();
    for (const run of runs) {
      await ctx.db.delete(run._id);
    }
    await ctx.db.delete(automation._id);
  },
});

type RunPlanSummary = {
  status: Doc<"distributionPlans">["status"];
  caption?: string;
  externalPostIds?: string[];
  artifactPreviews: Array<{
    artifactId: Id<"artifacts">;
    title?: string;
    storageUrl?: string;
    mimeType?: string;
  }>;
};

async function runPlanSummary(
  ctx: QueryCtx,
  run: Doc<"automationRuns">
): Promise<RunPlanSummary | null> {
  if (!run.distributionPlanId) return null;
  const plan = await ctx.db.get(run.distributionPlanId);
  if (!plan) return null;
  const artifacts = await Promise.all(
    plan.artifactIds.slice(0, 3).map((artifactId) => ctx.db.get(artifactId))
  );
  return {
    status: plan.status,
    caption: plan.caption,
    externalPostIds: plan.externalPostIds,
    artifactPreviews: artifacts.flatMap((artifact) =>
      artifact
        ? [{
            artifactId: artifact._id,
            title: artifact.title,
            storageUrl: artifact.storageUrl,
            mimeType: typeof (artifact.data as Record<string, unknown> | undefined)?.mimeType === "string"
              ? (artifact.data as Record<string, unknown>).mimeType as string
              : undefined,
          }]
        : []
    ),
  };
}

export const listRuns = query({
  args: {
    automationId: v.id("automations"),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = currentUserId(await requireBetaAccess(ctx));
    await requireAutomationAccess(ctx, args.automationId, userId);
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 10)));
    const runs = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation_started", (q) =>
        args.before === undefined
          ? q.eq("automationId", args.automationId)
          : q.eq("automationId", args.automationId).lt("startedAt", args.before)
      )
      .order("desc")
      .take(limit + 1);
    const page = runs.slice(0, limit);
    return {
      runs: await Promise.all(
        page.map(async (run) => ({
          ...run,
          plan: await runPlanSummary(ctx, run),
        }))
      ),
      hasMore: runs.length > limit,
      nextBefore: page.length ? page[page.length - 1].startedAt : undefined,
    };
  },
});

export const getRunApprovalContext = internalQuery({
  args: { runId: v.id("automationRuns"), userId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const automation = await ctx.db.get(run.automationId);
    if (!automation) return null;
    if (automation.workspaceId) {
      await requireWorkspaceMember(ctx, automation.workspaceId, args.userId);
    } else if (automation.userId !== args.userId) {
      return null;
    }
    return { automation, run };
  },
});

export const approveRun = action({
  args: { runId: v.id("automationRuns") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccessForAction(ctx);
    const context = await ctx.runQuery(internal.automations.automations.getRunApprovalContext, {
      runId: args.runId,
      userId: identity.subject,
    });
    if (!context) throw new Error("Automation run not found");
    if (context.run.status !== "awaiting_approval") {
      throw new Error(`Run is ${context.run.status}, not awaiting approval`);
    }
    if (!context.run.distributionPlanId) {
      throw new Error("Run has no distribution plan to publish");
    }
    await ctx.runAction(internal.publishing.distributionPlans.publishInternal, {
      id: context.run.distributionPlanId,
      mode: "now",
      userId: context.run.userId,
      automationRunId: context.run._id,
    });
  },
});

export const rejectRun = mutation({
  args: { runId: v.id("automationRuns"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Automation run not found");
    await requireAutomationAccess(ctx, run.automationId, userId);
    if (run.status !== "awaiting_approval") {
      throw new Error(`Run is ${run.status}, not awaiting approval`);
    }
    if (run.distributionPlanId) {
      const plan = await ctx.db.get(run.distributionPlanId);
      if (plan && plan.status === "draft") {
        await ctx.db.delete(plan._id);
      }
    }
    await ctx.db.patch(run._id, {
      status: "skipped",
      errorMessage: args.reason?.trim() || "Rejected by user",
      distributionPlanId: undefined,
      completedAt: Date.now(),
    });
  },
});
