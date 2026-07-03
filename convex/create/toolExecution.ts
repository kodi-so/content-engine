import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { listReferencesForToolCall } from "./references/referenceDiscovery";
import {
  hasPendingAnalysisContextForThreadToolOutputs,
} from "./references/sourceAnalysisContext";
import { updateMediaTextOverlaysForToolCall } from "./studio/mediaOverlayEditing";
import { createAnalysisJobForToolCall } from "./execution/sourceAnalysisExecution";
import {
  createGenerationRequestForToolCall,
  createSlideshowRequestForToolCall,
  mediaModeForToolName,
} from "./execution/mediaGenerationExecution";
import { createTextGenerationForToolCall } from "./execution/textGenerationExecution";
import { createVideoRenderForToolCall } from "./execution/videoRenderExecution";
import {
  continueAgentLoopAfterToolCompletion,
  createDebugReadyOutputCheckpointIfNeeded,
  reconcileAsyncToolFailures,
} from "./execution/asyncToolReconciliation";
import {
  createStudioProjectForToolCall,
  createStudioRenderRequestForToolCall,
  createWorkflowDraftForToolCall,
} from "./execution/studioToolExecution";
import {
  prepareArtifactExportForThread,
  prepareDistributionDraftForThread,
  saveReadyOutputsForThread,
} from "./execution/toolOutputActions";
import {
  appendAgentMessage,
  errorMessageFromUnknown,
  modelProviderNameValidator,
} from "./execution/toolExecutionShared";
import { hasPendingContentRequestsForThreadToolOutputs } from "./execution/threadToolOutputs";

export {
  prepareArtifactExportForThread,
  prepareDistributionDraftForThread,
  saveReadyOutputsForThread,
} from "./execution/toolOutputActions";

export type MediaGenerationMode = "image" | "video" | "audio" | "lipsync";

export const completeTextGeneration = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    costUsd: v.optional(v.number()),
    model: v.string(),
    provider: v.union(
      v.literal("bulkapis"),
      v.literal("gemini"),
      v.literal("fal"),
      v.literal("openrouter"),
      v.literal("manual")
    ),
    text: v.string(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return;
    if (toolCall.status === "canceled") return;

    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "succeeded",
      output: {
        artifactId: args.artifactId,
        text: args.text,
        provider: args.provider,
        model: args.model,
      },
      artifactIds: [args.artifactId],
      costUsd: args.costUsd,
      errorMessage: undefined,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: "Generated a text draft.",
      artifactIds: [args.artifactId],
      kind: "tool_result",
    });

    const remainingQueuedToolCalls = await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread_status", (q) =>
        q.eq("createThreadId", thread._id).eq("status", "queued")
      )
      .collect();
    if (remainingQueuedToolCalls.length) {
      await executeRunnableQueuedTools(ctx, thread);
      return;
    }

    if (await continueAgentLoopAfterToolCompletion(ctx, thread)) return;

    await ctx.db.patch(thread._id, {
      status: "ready",
      finalArtifactIds: [args.artifactId],
      updatedAt: now,
    });
  },
});

export const failTextGeneration = internalMutation({
  args: {
    errorMessage: v.string(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return;
    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: `${toolCall.label} failed: ${args.errorMessage}`,
      kind: "status",
    });
    await ctx.db.patch(thread._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      updatedAt: now,
    });
  },
});

export const completeVideoRender = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    costUsd: v.optional(v.number()),
    jobId: v.string(),
    mediaAssetCount: v.number(),
    model: v.string(),
    provider: modelProviderNameValidator,
    storageUrl: v.string(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return;
    if (toolCall.status === "canceled") return;

    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "succeeded",
      output: {
        artifactId: args.artifactId,
        jobId: args.jobId,
        mediaAssetCount: args.mediaAssetCount,
        model: args.model,
        provider: args.provider,
        status: "ready",
        storageUrl: args.storageUrl,
      },
      artifactIds: [args.artifactId],
      costUsd: args.costUsd,
      errorMessage: undefined,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: "AI video render completed.",
      artifactIds: [args.artifactId],
      kind: "tool_result",
    });

    const remainingQueuedToolCalls = await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread_status", (q) =>
        q.eq("createThreadId", thread._id).eq("status", "queued")
      )
      .collect();
    if (remainingQueuedToolCalls.length) {
      await executeRunnableQueuedTools(ctx, thread);
      return;
    }

    await ctx.db.patch(thread._id, {
      status: "ready",
      finalArtifactIds: [args.artifactId],
      updatedAt: now,
    });
  },
});

export const failVideoRender = internalMutation({
  args: {
    errorMessage: v.string(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return;
    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: now,
      updatedAt: now,
    });
    await appendAgentMessage(ctx, thread, {
      content: `${toolCall.label} failed: ${args.errorMessage}`,
      kind: "status",
    });
    await ctx.db.patch(thread._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      updatedAt: now,
    });
  },
});

async function saveReadyOutputsForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const result = await saveReadyOutputsForThread(ctx, thread, toolCall._id);

  if (!result.savedRequestIds.length) return false;

  await ctx.db.patch(toolCall._id, {
    status: "succeeded",
    output: {
      savedRequestIds: result.savedRequestIds,
      savedAt: result.savedAt,
    },
    completedAt: result.savedAt,
    updatedAt: result.savedAt,
  });

  return true;
}

async function waitForPendingAnalysisIfNeeded(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const hasPendingAnalysis = await hasPendingAnalysisContextForThreadToolOutputs(
    ctx,
    thread,
    toolCall._id
  );
  if (!hasPendingAnalysis) return false;

  await appendAgentMessage(ctx, thread, {
    content:
      "Waiting for source analysis to finish before generating new assets, so the recreation can use what was actually found in the source.",
    kind: "status",
  });
  return true;
}

async function waitForPendingContentRequestsIfNeeded(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const hasPendingContent = await hasPendingContentRequestsForThreadToolOutputs(
    ctx,
    thread,
    toolCall._id
  );
  if (!hasPendingContent) return false;

  await appendAgentMessage(ctx, thread, {
    content:
      "Waiting for the current preview to finish before using it in the next creation step.",
    kind: "status",
  });
  return true;
}

export async function executeRunnableQueuedTools(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const asyncFailure = await reconcileAsyncToolFailures(ctx, thread);
  if (asyncFailure) {
    return {
      executedCount: 0,
      queuedCount: 0,
      failedToolCallId: asyncFailure.failedToolCallId,
      errorMessage: asyncFailure.errorMessage,
    };
  }

  const queuedToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "queued")
    )
    .order("asc")
    .collect();

  if (await createDebugReadyOutputCheckpointIfNeeded(ctx, thread)) {
    return { executedCount: 0, queuedCount: queuedToolCalls.length, checkpointCreated: true };
  }

  let executedCount = 0;
  let pausedForPendingAnalysis = false;
  let pausedForPendingContent = false;
  for (const toolCall of queuedToolCalls) {
    try {
      const mediaMode = mediaModeForToolName(toolCall.toolName);
      if (toolCall.toolName === "analyze.source") {
        await createAnalysisJobForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        break;
      }
      if (toolCall.toolName === "references.list") {
        const references = await listReferencesForToolCall(ctx, thread, toolCall);
        await appendAgentMessage(ctx, thread, {
          content: references.length
            ? `Found ${references.length} reusable reference${references.length === 1 ? "" : "s"} in the library for this thread.`
            : "I did not find matching reusable references in the library.",
          kind: "tool_result",
        });
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "mediaOverlay.updateText") {
        const result = await updateMediaTextOverlaysForToolCall(ctx, thread, toolCall.input);
        const now = Date.now();
        await ctx.db.patch(toolCall._id, {
          status: "succeeded",
          output: result,
          completedAt: now,
          updatedAt: now,
        });
        await appendAgentMessage(ctx, thread, {
          content: result.targetKind === "slideshow"
            ? `Updated ${result.textOverlayCount} text overlay${result.textOverlayCount === 1 ? "" : "s"} on the slideshow.`
            : `Updated ${result.textOverlayCount} text overlay${result.textOverlayCount === 1 ? "" : "s"} on the Studio video project.`,
          kind: "tool_result",
        });
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "text.generate") {
        const started = await createTextGenerationForToolCall(ctx, thread, toolCall);
        if (started) executedCount += 1;
        break;
      }
      if (toolCall.toolName === "media.renderVideo") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        if (await waitForPendingAnalysisIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingAnalysis = true;
          break;
        }
        const started = await createVideoRenderForToolCall(ctx, thread, toolCall);
        if (started) executedCount += 1;
        break;
      }
      if (toolCall.toolName === "slideshow.render") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        if (await waitForPendingAnalysisIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingAnalysis = true;
          break;
        }
        await createSlideshowRequestForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        break;
      }
      if (toolCall.toolName === "artifact.save") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        const saved = await saveReadyOutputsForToolCall(ctx, thread, toolCall);
        if (saved) executedCount += 1;
        break;
      }
      if (toolCall.toolName === "artifact.export") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        const result = await prepareArtifactExportForThread(ctx, thread, undefined, {
          recordToolCall: false,
        });
        if (result.exportUrls.length) {
          const now = Date.now();
          await ctx.db.patch(toolCall._id, {
            status: "succeeded",
            output: {
              artifactIds: result.artifactIds,
              exportUrls: result.exportUrls,
              destination: "download",
            },
            completedAt: now,
            updatedAt: now,
          });
          executedCount += 1;
        }
        break;
      }
      if (toolCall.toolName === "publishing.prepare") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        const result = await prepareDistributionDraftForThread(ctx, thread, undefined, {
          recordToolCall: false,
        });
        if (result.distributionPlanId) {
          const now = Date.now();
          await ctx.db.patch(toolCall._id, {
            status: "succeeded",
            output: {
              distributionPlanId: result.distributionPlanId,
              artifactCount: result.artifactCount,
              status: "draft",
            },
            completedAt: now,
            updatedAt: now,
          });
          executedCount += 1;
        }
        break;
      }
      if (toolCall.toolName === "workflow.createDraft") {
        await createWorkflowDraftForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        break;
      }
      if (toolCall.toolName === "studio.compose") {
        if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
          pausedForPendingContent = true;
          break;
        }
        const composed = await createStudioProjectForToolCall(ctx, thread, toolCall);
        if (composed) executedCount += 1;
        break;
      }
      if (toolCall.toolName === "studio.render") {
        const requested = await createStudioRenderRequestForToolCall(ctx, thread, toolCall);
        if (requested) executedCount += 1;
        break;
      }
      if (!mediaMode) break;
      if (await waitForPendingContentRequestsIfNeeded(ctx, thread, toolCall)) {
        pausedForPendingContent = true;
        break;
      }
      if (await waitForPendingAnalysisIfNeeded(ctx, thread, toolCall)) {
        pausedForPendingAnalysis = true;
        break;
      }
      await createGenerationRequestForToolCall(ctx, thread, toolCall, mediaMode);
      executedCount += 1;
      break;
    } catch (error) {
      const now = Date.now();
      const errorMessage = errorMessageFromUnknown(error);
      await ctx.db.patch(toolCall._id, {
        status: "failed",
        errorMessage,
        completedAt: now,
        updatedAt: now,
      });
      await appendAgentMessage(ctx, thread, {
        content: `${toolCall.label} failed: ${errorMessage}`,
        kind: "status",
      });
      await ctx.db.patch(thread._id, {
        status: "failed",
        errorMessage,
        updatedAt: now,
      });
      return {
        executedCount,
        queuedCount: queuedToolCalls.length,
        failedToolCallId: toolCall._id,
        errorMessage,
      };
    }
  }

  const now = Date.now();
  if (
    executedCount === 0 &&
    queuedToolCalls.length &&
    !pausedForPendingAnalysis &&
    !pausedForPendingContent
  ) {
    await appendAgentMessage(ctx, thread, {
      content:
        "The next planned tool is queued, but its executable wrapper is not connected yet. I will keep the plan visible here while we wire the remaining creation tools.",
      kind: "status",
    });
  }

  const remainingQueuedToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "queued")
    )
    .collect();
  const blockedToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "blocked")
    )
    .collect();
  const runningToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "running")
    )
    .collect();
  const hasPendingContentRequests = await hasPendingContentRequestsForThreadToolOutputs(ctx, thread);

  if (
    !remainingQueuedToolCalls.length &&
    !blockedToolCalls.length &&
    !runningToolCalls.length &&
    !hasPendingContentRequests &&
    (
      executedCount > 0 ||
      thread.status === "planning" ||
      thread.status === "running" ||
      thread.status === "waiting_for_user"
    ) &&
    !pausedForPendingAnalysis &&
    !pausedForPendingContent &&
    await continueAgentLoopAfterToolCompletion(ctx, thread)
  ) {
    return { executedCount, queuedCount: 0, continuedAgentLoop: true };
  }

  await ctx.db.patch(thread._id, {
    status: blockedToolCalls.length
      ? "waiting_for_user"
      : runningToolCalls.length || hasPendingContentRequests
        ? "running"
      : remainingQueuedToolCalls.length
        ? "planning"
        : "idle",
    updatedAt: now,
  });

  return { executedCount, queuedCount: remainingQueuedToolCalls.length };
}
