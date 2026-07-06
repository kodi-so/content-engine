import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  artifactMediaKind,
  artifactMimeType,
} from "../references/referenceResolution";
import {
  appendAgentMessage,
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

export async function prepareDistributionDraftForThread(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  targetArtifactIds?: Id<"artifacts">[],
  options: { recordToolCall?: boolean } = {}
) {
  const artifactIds = await readyArtifactIdsForThread(ctx, thread, targetArtifactIds);
  if (!artifactIds.length) {
    await appendAgentMessage(ctx, thread, {
      content: "There are no ready media artifacts to prepare for publishing yet.",
      kind: "status",
    });
    return { distributionPlanId: null, artifactCount: 0 };
  }

  // Automation-origin threads bind the plan to the run: the plan targets the
  // automation's accounts and the run advances to awaiting_approval or straight
  // to publishing depending on the automation's approval mode.
  const automationRun = thread.automationRunId ? await ctx.db.get(thread.automationRunId) : null;
  const automation = automationRun ? await ctx.db.get(automationRun.automationId) : null;

  const now = Date.now();
  const distributionPlanId = await ctx.db.insert("distributionPlans", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    automationId: automation?._id,
    automationRunId: automationRun?._id,
    artifactIds,
    socialAccountIds: automation?.socialAccountIds ?? [],
    provider: automation ? "post_bridge" : "manual",
    status: "draft",
    caption: automation && automationRun
      ? automationRun.topic
      : "Prepared from Create Agent. Add accounts, caption, and schedule before publishing.",
    providerPayload: {
      source: automation ? "automation_run" : "create_agent",
      createThreadId: thread._id,
      note: automation
        ? `Distribution plan created by automation "${automation.name}".`
        : "Manual draft distribution plan created from Create Agent final review.",
    },
    createdAt: now,
    updatedAt: now,
  });

  if (automation && automationRun) {
    if (automation.approvalMode === "auto_publish") {
      await ctx.db.patch(automationRun._id, {
        distributionPlanId,
        status: "publishing",
      });
      await ctx.scheduler.runAfter(0, internal.publishing.distributionPlans.publishInternal, {
        id: distributionPlanId,
        mode: "now",
        userId: thread.userId,
        automationRunId: automationRun._id,
      });
    } else {
      await ctx.db.patch(automationRun._id, {
        distributionPlanId,
        status: "awaiting_approval",
      });
    }
  }

  if (options.recordToolCall ?? true) {
    await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      toolName: "publishing.prepare",
      dependsOnToolCallIds: [],
      status: "succeeded",
      label: "Prepared publishing draft",
      input: {
        artifactIds,
        provider: "manual",
      },
      output: {
        distributionPlanId,
        artifactIds,
        status: "draft",
      },
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await appendAgentMessage(ctx, thread, {
    content: `Prepared a draft distribution plan with ${artifactIds.length} media artifact${artifactIds.length === 1 ? "" : "s"}. Add accounts and scheduling before publishing.`,
    kind: "tool_result",
  });

  return { distributionPlanId, artifactCount: artifactIds.length };
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
