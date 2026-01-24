import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  themeConfigValidator,
  formatConfigValidator,
  scheduleConfigValidator,
  postSettingsValidator,
  contentTypeValidator,
} from "../validators";

// Get all automations for current user
export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const automations = await ctx.db
      .query("automations")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();

    // Get recent runs for each automation (last 5)
    const automationsWithRuns = await Promise.all(
      automations.map(async (automation) => {
        const recentRuns = await ctx.db
          .query("automationRuns")
          .withIndex("by_automation", (q) =>
            q.eq("automationId", automation._id)
          )
          .order("desc")
          .take(5);

        // Count failed runs in last 24 hours
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentFailures = recentRuns.filter(
          (run) => run.status === "failed" && run.createdAt > oneDayAgo
        ).length;

        // Get account info
        const account = await ctx.db.get(automation.accountId);

        return {
          ...automation,
          recentRuns,
          recentFailures,
          account,
        };
      })
    );

    return automationsWithRuns;
  },
});

// Get a single automation with details
export const get = query({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const automation = await ctx.db.get(args.id);
    if (!automation || automation.userId !== identity.subject) {
      return null;
    }

    const account = await ctx.db.get(automation.accountId);

    // Get recent runs
    const recentRuns = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation", (q) => q.eq("automationId", args.id))
      .order("desc")
      .take(10);

    return {
      ...automation,
      account,
      recentRuns,
    };
  },
});

// Get run history for an automation (paginated)
export const getRunHistory = query({
  args: {
    automationId: v.id("automations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Verify ownership
    const automation = await ctx.db.get(args.automationId);
    if (!automation || automation.userId !== identity.subject) {
      return [];
    }

    const limit = args.limit || 50;
    const runs = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation", (q) => q.eq("automationId", args.automationId))
      .order("desc")
      .take(limit);

    // Enrich with content details
    const enrichedRuns = await Promise.all(
      runs.map(async (run) => {
        const content = run.contentId ? await ctx.db.get(run.contentId) : null;
        return {
          ...run,
          content,
        };
      })
    );

    return enrichedRuns;
  },
});

// Create a new automation (initially inactive)
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    accountId: v.id("accounts"),
    contentType: contentTypeValidator,
    themeConfig: themeConfigValidator,
    formatConfig: formatConfigValidator,
    referenceImageIds: v.optional(v.array(v.id("referenceImages"))),
    characterInstructions: v.optional(v.string()),
    scheduleConfig: scheduleConfigValidator,
    postSettings: postSettingsValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Verify account ownership
    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== identity.subject) {
      throw new Error("Account not found or not owned by user");
    }

    const now = Date.now();
    const automationId = await ctx.db.insert("automations", {
      userId: identity.subject,
      name: args.name,
      description: args.description,
      accountId: args.accountId,
      contentType: args.contentType,
      themeConfig: args.themeConfig,
      formatConfig: args.formatConfig,
      referenceImageIds: args.referenceImageIds,
      characterInstructions: args.characterInstructions,
      scheduleConfig: args.scheduleConfig,
      postSettings: args.postSettings,
      isActive: false, // Start inactive, user must activate
      createdAt: now,
      updatedAt: now,
    });

    return automationId;
  },
});

// Update an automation
export const update = mutation({
  args: {
    id: v.id("automations"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    themeConfig: v.optional(themeConfigValidator),
    formatConfig: v.optional(formatConfigValidator),
    referenceImageIds: v.optional(v.array(v.id("referenceImages"))),
    characterInstructions: v.optional(v.string()),
    scheduleConfig: v.optional(scheduleConfigValidator),
    postSettings: v.optional(postSettingsValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const automation = await ctx.db.get(args.id);
    if (!automation || automation.userId !== identity.subject) {
      throw new Error("Automation not found");
    }

    const { id, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Activate an automation and schedule the first run
export const activate = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const automation = await ctx.db.get(args.id);
    if (!automation || automation.userId !== identity.subject) {
      throw new Error("Automation not found");
    }

    if (automation.isActive) {
      throw new Error("Automation is already active");
    }

    // Validate account has valid tokens
    const account = await ctx.db.get(automation.accountId);
    if (!account || !account.accessToken) {
      throw new Error("Account is not properly connected");
    }

    // Calculate next run time based on schedule
    const nextRunAt = calculateNextRunTime(
      automation.scheduleConfig,
      Date.now()
    );

    await ctx.db.patch(args.id, {
      isActive: true,
      nextRunAt,
      updatedAt: Date.now(),
    });

    // Create the first pending run
    await ctx.db.insert("automationRuns", {
      automationId: args.id,
      userId: identity.subject,
      status: "pending",
      scheduledFor: nextRunAt,
      createdAt: Date.now(),
    });

    return { nextRunAt };
  },
});

// Pause an automation
export const pause = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const automation = await ctx.db.get(args.id);
    if (!automation || automation.userId !== identity.subject) {
      throw new Error("Automation not found");
    }

    await ctx.db.patch(args.id, {
      isActive: false,
      nextRunAt: undefined,
      updatedAt: Date.now(),
    });

    // Cancel any pending runs
    const pendingRuns = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation_status", (q) =>
        q.eq("automationId", args.id).eq("status", "pending")
      )
      .collect();

    for (const run of pendingRuns) {
      await ctx.db.delete(run._id);
    }
  },
});

// Delete an automation and all associated runs
export const remove = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const automation = await ctx.db.get(args.id);
    if (!automation || automation.userId !== identity.subject) {
      throw new Error("Automation not found");
    }

    // Delete all runs
    const runs = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation", (q) => q.eq("automationId", args.id))
      .collect();

    for (const run of runs) {
      await ctx.db.delete(run._id);
    }

    // Delete the automation
    await ctx.db.delete(args.id);
  },
});

// Save preview content to automation (for edit mode)
export const savePreview = mutation({
  args: {
    automationId: v.id("automations"),
    contentId: v.id("content"),
    topic: v.string(),
    caption: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const automation = await ctx.db.get(args.automationId);
    if (!automation || automation.userId !== identity.subject) {
      throw new Error("Automation not found");
    }

    await ctx.db.patch(args.automationId, {
      lastPreviewContentId: args.contentId,
      lastPreviewTopic: args.topic,
      lastPreviewCaption: args.caption,
      updatedAt: Date.now(),
    });
  },
});

// Get stats for dashboard
export const getStats = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { total: 0, active: 0, totalRuns: 0, failedRuns24h: 0 };
    }

    const automations = await ctx.db
      .query("automations")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const activeCount = automations.filter((a) => a.isActive).length;

    // Get run stats
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let totalRuns = 0;
    let failedRuns24h = 0;

    for (const automation of automations) {
      const runs = await ctx.db
        .query("automationRuns")
        .withIndex("by_automation", (q) => q.eq("automationId", automation._id))
        .collect();

      totalRuns += runs.length;
      failedRuns24h += runs.filter(
        (r) => r.status === "failed" && r.createdAt > oneDayAgo
      ).length;
    }

    return {
      total: automations.length,
      active: activeCount,
      totalRuns,
      failedRuns24h,
    };
  },
});

// Helper function to calculate next run time
function calculateNextRunTime(
  scheduleConfig: {
    timezone: string;
    postingTimes: Array<{ dayOfWeek: number; hour: number; minute: number }>;
  },
  fromTimestamp: number
): number {
  const { timezone, postingTimes } = scheduleConfig;

  if (postingTimes.length === 0) {
    throw new Error("No posting times configured");
  }

  // Convert fromTimestamp to the target timezone
  const fromDate = new Date(fromTimestamp);

  // Get current time components in target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(fromDate);
  const getPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  const currentDayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    getPart("weekday")
  );
  const currentHour = parseInt(getPart("hour"), 10);
  const currentMinute = parseInt(getPart("minute"), 10);

  // Find the next posting time
  let minDaysAhead = 8; // More than a week
  let nextTime: { dayOfWeek: number; hour: number; minute: number } | null = null;

  for (const time of postingTimes) {
    let daysAhead = time.dayOfWeek - currentDayOfWeek;
    if (daysAhead < 0) daysAhead += 7;

    // If same day, check if the time has passed
    if (daysAhead === 0) {
      const timeInMinutes = time.hour * 60 + time.minute;
      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      if (timeInMinutes <= currentTimeInMinutes) {
        daysAhead = 7; // Next week
      }
    }

    if (daysAhead < minDaysAhead) {
      minDaysAhead = daysAhead;
      nextTime = time;
    }
  }

  if (!nextTime) {
    throw new Error("Could not calculate next run time");
  }

  // Calculate the actual timestamp
  const targetDate = new Date(fromTimestamp);
  targetDate.setDate(targetDate.getDate() + minDaysAhead);

  // Create date string in target timezone, then parse back
  const year = parseInt(getPart("year"), 10);
  const month = parseInt(getPart("month"), 10) - 1;
  const day = parseInt(getPart("day"), 10) + minDaysAhead;

  // Create a date in the target timezone
  const targetDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(nextTime.hour).padStart(2, "0")}:${String(nextTime.minute).padStart(2, "0")}:00`;

  // Parse as if it's in the target timezone
  const result = zonedTimeToUtc(targetDateStr, timezone);
  return result;
}

// Simple helper to convert zoned time to UTC
function zonedTimeToUtc(dateStr: string, timezone: string): number {
  // Create a date object and adjust for timezone
  const date = new Date(dateStr);

  // Get the offset for the target timezone
  const utcDate = new Date(
    date.toLocaleString("en-US", { timeZone: "UTC" })
  );
  const tzDate = new Date(
    date.toLocaleString("en-US", { timeZone: timezone })
  );
  const offset = utcDate.getTime() - tzDate.getTime();

  return date.getTime() + offset;
}
