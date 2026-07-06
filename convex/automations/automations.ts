import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  automationApprovalModeValidator,
  automationScheduleValidator,
} from "../validators";
import { nextScheduledRunAt } from "./scheduling";

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
        return { ...automation, recentRuns: runs };
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
