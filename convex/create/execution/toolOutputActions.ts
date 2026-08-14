import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { recordCreatedPostMemory } from "../../accounts/accountMemory";
import {
  artifactMediaKind,
  artifactMimeType,
} from "../references/referenceResolution";
import {
  appendAgentMessage,
  accountRunCostForThread,
  contentRequestIdFromToolOutput,
} from "./toolExecutionShared";

async function contentRequestIdsForThreadToolOutputs(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">
) {
  const threadToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  return [
    ...new Set(
      threadToolCalls.flatMap((candidate) => {
        if (excludeToolCallId && candidate._id === excludeToolCallId) return [];
        const requestId = contentRequestIdFromToolOutput(candidate.output);
        return requestId ? [requestId] : [];
      })
    ),
  ];
}

async function readyArtifactIdsForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  targetArtifactIds?: Id<"artifacts">[]
) {
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread);
  const targetArtifactIdSet = targetArtifactIds?.length
    ? new Set(targetArtifactIds.map(String))
    : null;
  const artifactIds: Id<"artifacts">[] = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request || (request.status !== "ready" && request.status !== "saved")) continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    artifactIds.push(
      ...artifacts.flatMap((artifact) =>
        artifact.storageUrl &&
        (!targetArtifactIdSet || targetArtifactIdSet.has(String(artifact._id))) &&
        (thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId)
          ? [artifact._id]
          : []
      )
    );
  }

  return [...new Set(artifactIds)];
}

export async function saveReadyOutputsForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">,
  targetArtifactIds?: Id<"artifacts">[]
) {
  const requestIds = await contentRequestIdsForThreadToolOutputs(ctx, thread, excludeToolCallId);
  const targetArtifactIdSet = targetArtifactIds?.length
    ? new Set(targetArtifactIds.map(String))
    : null;
  const readyRequests = [];

  for (const requestId of requestIds) {
    const request = await ctx.db.get(requestId);
    if (!request) continue;
    if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
      continue;
    }
    if (request.status === "ready" || request.status === "saved") {
      if (!targetArtifactIdSet) {
        readyRequests.push(request);
        continue;
      }

      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
        .collect();
      if (artifacts.some((artifact) => targetArtifactIdSet.has(String(artifact._id)))) {
        readyRequests.push(request);
      }
    }
  }

  if (!readyRequests.length) {
    await appendAgentMessage(ctx, thread, {
      content: "There are no ready previews to save yet. Wait for the current generation or render request to finish, then continue.",
      kind: "status",
    });
    return { savedRequestIds: [], savedAt: Date.now() };
  }

  const now = Date.now();
  for (const request of readyRequests) {
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    for (const artifact of artifacts) {
      if (targetArtifactIdSet && !targetArtifactIdSet.has(String(artifact._id))) {
        continue;
      }
      if (thread.workspaceId ? artifact.workspaceId !== thread.workspaceId : artifact.userId !== thread.userId) {
        continue;
      }
      await ctx.db.patch(artifact._id, {
        lifecycle: "saved",
        reviewStatus: "approved",
        updatedAt: now,
      });
    }

    const slideshows = await ctx.db
      .query("slideshows")
      .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
      .collect();
    for (const slideshow of slideshows) {
      if (targetArtifactIdSet) continue;
      if (thread.workspaceId ? slideshow.workspaceId !== thread.workspaceId : slideshow.userId !== thread.userId) {
        continue;
      }
      await ctx.db.patch(slideshow._id, {
        status: "saved",
        savedAt: now,
        updatedAt: now,
      });
    }

    if (!targetArtifactIdSet) {
      await ctx.db.patch(request._id, {
        status: "saved",
        savedAt: now,
        updatedAt: now,
      });
    }
  }

  await appendAgentMessage(ctx, thread, {
    content: `Saved ${readyRequests.length} ready preview${readyRequests.length === 1 ? "" : "s"} to the library.`,
    kind: "tool_result",
  });

  return {
    savedRequestIds: readyRequests.map((request) => request._id),
    savedAt: now,
  };
}

export async function prepareAccountPostForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  targetArtifactIds?: Id<"artifacts">[],
  options: {
    recordToolCall?: boolean;
    socialAccountId?: Id<"socialAccounts">;
    instructions?: string;
  } = {}
) {
  const artifactIds = await readyArtifactIdsForThread(ctx, thread, targetArtifactIds);
  if (!artifactIds.length) {
    await appendAgentMessage(ctx, thread, {
      content: "There are no ready media artifacts to prepare for publishing yet.",
      kind: "status",
    });
    return { accountPostId: null, artifactCount: 0 };
  }

  const socialAccountId = options.socialAccountId ?? thread.socialAccountId;
  if (!socialAccountId) {
    await appendAgentMessage(ctx, thread, {
      content: "Choose a social account before preparing this post.",
      kind: "status",
    });
    return { accountPostId: null, artifactCount: 0 };
  }
  const account = await ctx.db.get(socialAccountId);
  if (!account || (thread.workspaceId
    ? account.workspaceId !== thread.workspaceId
    : account.userId !== thread.userId)) {
    throw new Error("Social account not found");
  }
  const accountRun = thread.accountAgentRunId
    ? await ctx.db.get(thread.accountAgentRunId)
    : null;

  const now = Date.now();
  const requiresApproval = accountRun && account.autopilot?.publishingMode !== "auto_publish";
  const accountPostId = await ctx.db.insert("accountPosts", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    socialAccountId: account._id,
    origin: accountRun ? "agent_scheduled" : "agent_requested",
    createThreadId: thread._id,
    accountAgentRunId: accountRun?._id,
    artifactIds,
    provider: account.provider,
    status: requiresApproval ? "awaiting_approval" : "draft",
    caption: options.instructions?.trim() || accountRun?.decisionSummary || "Prepared by the Agent.",
    providerPayload: {
      source: accountRun ? "account_autopilot" : "create_agent",
      createThreadId: thread._id,
      note: `Post prepared for @${account.username}.`,
    },
    createdAt: now,
    updatedAt: now,
  });

  for (const artifactId of artifactIds) {
    await ctx.db.patch(artifactId, {
      socialAccountId: account._id,
      accountPostId,
      ...(accountRun ? { accountAgentRunId: accountRun._id } : {}),
      updatedAt: now,
    });
  }
  await recordCreatedPostMemory(ctx, {
    accountPostId,
    artifactIds,
    caption: options.instructions?.trim() || accountRun?.decisionSummary || "Prepared by the Agent.",
    socialAccountId: account._id,
    userId: thread.userId,
    workspaceId: thread.workspaceId,
  });

  if (accountRun) {
    const costUsd = await accountRunCostForThread(ctx, thread, accountRun.costUsd ?? 0);
    await ctx.db.patch(accountRun._id, {
      accountPostId,
      status: "completed",
      costUsd,
      completedAt: now,
      updatedAt: now,
    });
    if (account.autopilot?.publishingMode === "auto_publish") {
      await ctx.scheduler.runAfter(0, internal.publishing.accountPosts.publishInternal, {
        id: accountPostId,
        mode: "now",
        userId: thread.userId,
      });
    }
  }

  if (options.recordToolCall ?? true) {
    await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      decisionRunId: thread.decisionRunId,
      toolName: "publishing.prepare",
      dependsOnToolCallIds: [],
      status: "succeeded",
      label: "Prepared account post",
      input: {
        artifactIds,
        socialAccountId: account._id,
        provider: account.provider,
      },
      output: {
        accountPostId,
        artifactIds,
        status: requiresApproval ? "awaiting_approval" : "draft",
      },
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await appendAgentMessage(ctx, thread, {
    content: requiresApproval
      ? `Prepared a post for @${account.username} with ${artifactIds.length} media artifact${artifactIds.length === 1 ? "" : "s"}. It is waiting for approval.`
      : `Prepared a post for @${account.username} with ${artifactIds.length} media artifact${artifactIds.length === 1 ? "" : "s"}.`,
    kind: "tool_result",
  });

  return { accountPostId, artifactCount: artifactIds.length };
}

export async function prepareArtifactExportForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  targetArtifactIds?: Id<"artifacts">[],
  options: { recordToolCall?: boolean } = {}
) {
  const artifactIds = await readyArtifactIdsForThread(ctx, thread, targetArtifactIds);
  if (!artifactIds.length) {
    await appendAgentMessage(ctx, thread, {
      content: "There are no ready media artifacts to export yet.",
      kind: "status",
    });
    return { artifactIds: [], exportUrls: [], exportedAt: Date.now() };
  }

  const exportUrls = [];
  for (const artifactId of artifactIds) {
    const artifact = await ctx.db.get(artifactId);
    if (!artifact?.storageUrl) continue;
    if (thread.workspaceId ? artifact.workspaceId !== thread.workspaceId : artifact.userId !== thread.userId) {
      continue;
    }
    exportUrls.push({
      artifactId,
      title: artifact.title ?? "Exported artifact",
      storageUrl: artifact.storageUrl,
      mediaKind: artifactMediaKind(artifact),
      mimeType: artifactMimeType(artifact),
    });
  }

  if (!exportUrls.length) {
    await appendAgentMessage(ctx, thread, {
      content: "The selected artifacts are not exportable yet.",
      kind: "status",
    });
    return { artifactIds: [], exportUrls: [], exportedAt: Date.now() };
  }

  const now = Date.now();
  if (options.recordToolCall ?? true) {
    await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      decisionRunId: thread.decisionRunId,
      toolName: "artifact.export",
      dependsOnToolCallIds: [],
      status: "succeeded",
      label: "Exported output",
      input: {
        artifactIds,
        destination: "download",
      },
      output: {
        artifactIds,
        exportUrls,
        destination: "download",
      },
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await appendAgentMessage(ctx, thread, {
    content: `Prepared ${exportUrls.length} exportable artifact${exportUrls.length === 1 ? "" : "s"} for download.`,
    kind: "tool_result",
  });

  return { artifactIds, exportUrls, exportedAt: now };
}
