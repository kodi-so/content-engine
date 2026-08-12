import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { nextAutopilotRunAt } from "../../accounts/accountCadence";

function recordInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];
}

function generationDefaultsFromInput(value: unknown) {
  const input = recordInput(value);
  const result = {
    imageResolution: optionalString(input.imageResolution),
    aspectRatio: optionalString(input.aspectRatio),
    imageModel: optionalString(input.imageModel),
    videoModel: optionalString(input.videoModel),
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

function budgetFromInput(value: unknown) {
  const input = recordInput(value);
  const finiteNonnegative = (candidate: unknown) =>
    typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
      ? candidate
      : undefined;
  const result = {
    maxUsdPerPost: finiteNonnegative(input.maxUsdPerPost),
    maxUsdPerMonth: finiteNonnegative(input.maxUsdPerMonth),
  };
  return result.maxUsdPerPost !== undefined || result.maxUsdPerMonth !== undefined
    ? result
    : undefined;
}

async function completeToolCall(
  ctx: MutationCtx,
  toolCall: Doc<"createToolCalls">,
  output: Record<string, unknown>
) {
  const now = Date.now();
  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output,
    completedAt: now,
    updatedAt: now,
  });
}

async function accountsForThread(ctx: MutationCtx, thread: Doc<"createThreads">) {
  return thread.workspaceId
    ? await ctx.db
        .query("socialAccounts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", thread.workspaceId))
        .take(100)
    : await ctx.db
        .query("socialAccounts")
        .withIndex("by_user", (q) => q.eq("userId", thread.userId))
        .take(100);
}

async function accountForInput(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  input: Record<string, unknown>
) {
  const explicitId = optionalString(input.socialAccountId) as Id<"socialAccounts"> | undefined;
  if (explicitId) {
    const account = await ctx.db.get(explicitId);
    if (account && (thread.workspaceId
      ? account.workspaceId === thread.workspaceId
      : account.userId === thread.userId)) {
      return account;
    }
  }
  if (thread.socialAccountId) {
    const scoped = await ctx.db.get(thread.socialAccountId);
    if (scoped) return scoped;
  }
  const username = optionalString(input.username)?.replace(/^@/, "").toLowerCase();
  if (!username) throw new Error("Choose a social account");
  const account = (await accountsForThread(ctx, thread)).find((candidate) =>
    candidate.username.replace(/^@/, "").toLowerCase() === username ||
    candidate.displayName?.toLowerCase() === username
  );
  if (!account) throw new Error("Social account not found");
  return account;
}

function cadenceFromInput(value: unknown) {
  const cadence = recordInput(value);
  if (cadence.kind === "weekly") {
    const slots = Array.isArray(cadence.slots)
      ? cadence.slots.flatMap((value) => {
          const slot = recordInput(value);
          if (
            typeof slot.dayOfWeek !== "number" ||
            typeof slot.hour !== "number" ||
            typeof slot.minute !== "number"
          ) return [];
          return [{ dayOfWeek: slot.dayOfWeek, hour: slot.hour, minute: slot.minute }];
        })
      : [];
    return { kind: "weekly" as const, slots };
  }
  const times = Array.isArray(cadence.times)
    ? cadence.times.flatMap((value) => {
        const time = recordInput(value);
        if (typeof time.hour !== "number" || typeof time.minute !== "number") return [];
        return [{ hour: time.hour, minute: time.minute }];
      })
    : [];
  return { kind: "daily" as const, times: times.length ? times : [{ hour: 9, minute: 0 }] };
}

export async function listAccountsForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const accounts = await accountsForThread(ctx, thread);
  await completeToolCall(ctx, toolCall, {
    accounts: accounts.map((account) => ({
      id: account._id,
      username: account.username,
      displayName: account.displayName,
      platform: account.platform,
      connectionStatus: account.status,
      autopilotStatus: account.autopilotStatus ?? "off",
      nextAutopilotRunAt: account.nextAutopilotRunAt,
      playbookSummary: account.playbook?.summary,
    })),
  });
}

export async function getAccountForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const account = await accountForInput(ctx, thread, recordInput(toolCall.input));
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
    const asset = await ctx.db.get(link.creativeAssetId);
    if (asset) {
      references.push({
        id: link._id,
        creativeAssetId: asset._id,
        name: asset.name,
        role: link.role,
        instruction: link.instruction,
        isActive: link.isActive,
      });
    }
  }
  await completeToolCall(ctx, toolCall, {
    account: {
      id: account._id,
      username: account.username,
      displayName: account.displayName,
      platform: account.platform,
      connectionStatus: account.status,
      playbook: account.playbook,
      agentSummary: account.agentSummary,
      autopilotStatus: account.autopilotStatus ?? "off",
      autopilot: account.autopilot,
      nextAutopilotRunAt: account.nextAutopilotRunAt,
      references,
      insights: insights.map((insight) => ({
        id: insight._id,
        kind: insight.kind,
        statement: insight.statement,
        confidence: insight.confidence,
      })),
      recentPosts: posts.map((post) => ({
        id: post._id,
        status: post.status,
        origin: post.origin,
        caption: post.caption,
        publishedAt: post.publishedAt,
        latestMetrics: post.latestMetrics,
      })),
    },
  });
}

export async function addAccountReferenceForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = recordInput(toolCall.input);
  const account = await accountForInput(ctx, thread, input);
  const creativeAssetId = optionalString(input.creativeAssetId) as Id<"creativeAssets"> | undefined;
  if (!creativeAssetId) throw new Error("Choose a creative asset");
  const asset = await ctx.db.get(creativeAssetId);
  if (!asset || (thread.workspaceId
    ? asset.workspaceId !== thread.workspaceId
    : asset.userId !== thread.userId)) {
    throw new Error("Creative asset not found");
  }
  const role = input.role === "identity" || input.role === "style" || input.role === "voice" ||
    input.role === "logo" || input.role === "negative_reference" || input.role === "other"
    ? input.role
    : "other";
  const existing = await ctx.db
    .query("accountReferences")
    .withIndex("by_social_account_and_asset", (q) =>
      q.eq("socialAccountId", account._id).eq("creativeAssetId", asset._id)
    )
    .unique();
  const now = Date.now();
  const referenceId = existing?._id ?? await ctx.db.insert("accountReferences", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    socialAccountId: account._id,
    creativeAssetId: asset._id,
    role,
    instruction: optionalString(input.instruction),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  if (existing) {
    await ctx.db.patch(existing._id, {
      role,
      instruction: optionalString(input.instruction),
      isActive: true,
      updatedAt: now,
    });
  }
  await completeToolCall(ctx, toolCall, {
    accountReferenceId: referenceId,
    creativeAssetId: asset._id,
    name: asset.name,
    role,
    status: existing ? "updated" : "added",
  });
}

export async function removeAccountReferenceForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = recordInput(toolCall.input);
  const referenceId = optionalString(input.accountReferenceId) as Id<"accountReferences"> | undefined;
  if (!referenceId) throw new Error("Choose an account reference");
  const reference = await ctx.db.get(referenceId);
  if (!reference || (thread.workspaceId
    ? reference.workspaceId !== thread.workspaceId
    : reference.userId !== thread.userId)) {
    throw new Error("Account reference not found");
  }
  await ctx.db.delete(reference._id);
  await completeToolCall(ctx, toolCall, {
    accountReferenceId: reference._id,
    status: "removed",
  });
}

export async function updateAccountPlaybookForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = recordInput(toolCall.input);
  const account = await accountForInput(ctx, thread, input);
  const existing = account.playbook ?? {
    summary: `Create content that fits @${account.username}.`,
    goals: [],
    instructions: [],
    guardrails: [],
  };
  const playbook = {
    summary: optionalString(input.summary) ?? existing.summary,
    audience: input.audience === null ? undefined : optionalString(input.audience) ?? existing.audience,
    goals: input.goals === undefined ? existing.goals : stringArray(input.goals),
    creativeDirection: input.creativeDirection === null
      ? undefined
      : optionalString(input.creativeDirection) ?? existing.creativeDirection,
    instructions: input.instructions === undefined
      ? existing.instructions
      : stringArray(input.instructions),
    guardrails: input.guardrails === undefined
      ? existing.guardrails
      : stringArray(input.guardrails),
  };
  await ctx.db.patch(account._id, { playbook, updatedAt: Date.now() });
  await completeToolCall(ctx, toolCall, {
    socialAccountId: account._id,
    status: "updated",
    playbook,
  });
}

export async function updateAccountAutopilotForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = recordInput(toolCall.input);
  const account = await accountForInput(ctx, thread, input);
  const current = account.autopilot;
  const autopilot = {
    timezone: optionalString(input.timezone) ?? current?.timezone ?? "America/Chicago",
    cadence: input.cadence === undefined
      ? current?.cadence ?? { kind: "daily" as const, times: [{ hour: 9, minute: 0 }] }
      : cadenceFromInput(input.cadence),
    publishingMode: input.publishingMode === "auto_publish"
      ? "auto_publish" as const
      : input.publishingMode === "require_approval"
        ? "require_approval" as const
        : current?.publishingMode ?? "require_approval" as const,
    generationDefaults: input.generationDefaults === undefined
      ? current?.generationDefaults
      : generationDefaultsFromInput(input.generationDefaults),
    budget: input.budget === undefined ? current?.budget : budgetFromInput(input.budget),
  };
  const nextAccount = { ...account, autopilot };
  await ctx.db.patch(account._id, {
    autopilot,
    nextAutopilotRunAt: nextAutopilotRunAt(nextAccount),
    updatedAt: Date.now(),
  });
  await completeToolCall(ctx, toolCall, {
    socialAccountId: account._id,
    status: "updated",
    autopilot,
  });
}

export async function setAccountAutopilotForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = recordInput(toolCall.input);
  const account = await accountForInput(ctx, thread, input);
  const status: "active" | "paused" | "off" | undefined =
    input.status === "active" || input.status === "paused" || input.status === "off"
      ? input.status
      : undefined;
  if (!status) throw new Error("Autopilot status must be active, paused, or off");
  if (status === "active" && !account.autopilot) {
    throw new Error("Configure the account schedule before activating Autopilot");
  }
  const nextAccount = { ...account, autopilotStatus: status };
  await ctx.db.patch(account._id, {
    autopilotStatus: status,
    nextAutopilotRunAt: status === "active" ? nextAutopilotRunAt(nextAccount) : undefined,
    updatedAt: Date.now(),
  });
  await completeToolCall(ctx, toolCall, {
    socialAccountId: account._id,
    status,
    nextAutopilotRunAt: status === "active" ? nextAutopilotRunAt(nextAccount) : undefined,
  });
}

export async function runAccountNowForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const account = await accountForInput(ctx, thread, recordInput(toolCall.input));
  const now = Date.now();
  const runId = await ctx.db.insert("accountAgentRuns", {
    userId: account.userId,
    workspaceId: account.workspaceId,
    socialAccountId: account._id,
    trigger: "run_now",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.accounts.autopilotScheduling.startAccountAgentRun, {
    runId,
  });
  await completeToolCall(ctx, toolCall, {
    socialAccountId: account._id,
    accountAgentRunId: runId,
    status: "queued",
  });
}

export async function listAccountPostsForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const account = await accountForInput(ctx, thread, recordInput(toolCall.input));
  const posts = await ctx.db
    .query("accountPosts")
    .withIndex("by_social_account", (q) => q.eq("socialAccountId", account._id))
    .order("desc")
    .take(50);
  await completeToolCall(ctx, toolCall, {
    socialAccountId: account._id,
    posts: posts.map((post) => ({
      id: post._id,
      status: post.status,
      origin: post.origin,
      caption: post.caption,
      scheduledFor: post.scheduledFor,
      publishedAt: post.publishedAt,
      latestMetrics: post.latestMetrics,
      errorMessage: post.errorMessage,
    })),
  });
}

async function postForInput(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  input: Record<string, unknown>
) {
  const id = optionalString(input.accountPostId) as Id<"accountPosts"> | undefined;
  if (!id) throw new Error("Choose an account post");
  const post = await ctx.db.get(id);
  if (!post || (thread.workspaceId
    ? post.workspaceId !== thread.workspaceId
    : post.userId !== thread.userId)) {
    throw new Error("Account post not found");
  }
  return post;
}

export async function approveAccountPostForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const post = await postForInput(ctx, thread, recordInput(toolCall.input));
  if (post.status !== "awaiting_approval") {
    throw new Error(`Post is ${post.status}, not awaiting approval`);
  }
  await ctx.db.patch(post._id, { status: "draft", updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.publishing.accountPosts.publishInternal, {
    id: post._id,
    mode: "now",
    userId: thread.userId,
  });
  await completeToolCall(ctx, toolCall, {
    accountPostId: post._id,
    status: "publishing",
  });
}

export async function publishAccountPostForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const post = await postForInput(ctx, thread, recordInput(toolCall.input));
  if (post.status !== "draft" && post.status !== "failed") {
    throw new Error(`Post cannot be published from ${post.status}`);
  }
  await ctx.scheduler.runAfter(0, internal.publishing.accountPosts.publishInternal, {
    id: post._id,
    mode: "now",
    userId: thread.userId,
  });
  await completeToolCall(ctx, toolCall, {
    accountPostId: post._id,
    status: "publishing",
  });
}

export async function rejectAccountPostForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const input = recordInput(toolCall.input);
  const post = await postForInput(ctx, thread, input);
  if (post.status !== "awaiting_approval") {
    throw new Error(`Post is ${post.status}, not awaiting approval`);
  }
  await ctx.db.patch(post._id, {
    status: "canceled",
    errorMessage: optionalString(input.reason) ?? "Rejected by user",
    updatedAt: Date.now(),
  });
  await completeToolCall(ctx, toolCall, {
    accountPostId: post._id,
    status: "canceled",
  });
}
