import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { listReferencesForToolCall } from "./references/referenceDiscovery";
import { updateMediaTextOverlaysForToolCall } from "./studio/mediaOverlayEditing";
import { updateVideoProjectCaptionsForToolCall } from "./studio/captionEditing";
import {
  approveAccountPostForToolCall,
  addAccountReferenceForToolCall,
  getAccountForToolCall,
  listAccountPostsForToolCall,
  listAccountsForToolCall,
  publishAccountPostForToolCall,
  removeAccountReferenceForToolCall,
  rejectAccountPostForToolCall,
  runAccountNowForToolCall,
  setAccountAutopilotForToolCall,
  updateAccountAutopilotForToolCall,
  updateAccountPlaybookForToolCall,
} from "./execution/accountManagementToolExecution";
import { createAnalysisJobForToolCall } from "./execution/sourceAnalysisExecution";
import { createSocialDiscoveryForToolCall } from "./execution/socialDiscoveryExecution";
import { createSocialTrendResearchForToolCall } from "./execution/socialTrendResearchExecution";
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
} from "./execution/studioToolExecution";
import {
  prepareArtifactExportForThread,
  prepareAccountPostForThread,
  saveReadyOutputsForThread,
} from "./execution/toolOutputActions";
import {
  appendAgentMessage,
  accountRunCostForThread,
  errorMessageFromUnknown,
  markAccountRunFailedForThread,
  modelProviderNameValidator,
} from "./execution/toolExecutionShared";
import { toolCallHasPendingAsyncOutput } from "./execution/toolCallReadiness";
import { hasPendingContentRequestsForThreadToolOutputs } from "./execution/threadToolOutputs";
import { insertCreateRunEvent } from "./observability/runEvents";

export {
  prepareArtifactExportForThread,
  prepareAccountPostForThread,
  saveReadyOutputsForThread,
} from "./execution/toolOutputActions";

export type MediaGenerationMode = "image" | "video" | "audio" | "lipsync";

async function recordAsyncToolTerminalEvent(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">,
  args: {
    status: "succeeded" | "failed";
    completedAt: number;
    output?: unknown;
    artifactIds?: Doc<"createToolCalls">["artifactIds"];
    actualCostUsd?: number;
    errorMessage?: string;
  }
) {
  await insertCreateRunEvent(ctx, thread, {
    decisionRunId: toolCall.decisionRunId ?? thread.decisionRunId,
    createMessageId: toolCall.messageId,
    createToolCallId: toolCall._id,
    operationId: `tool:${toolCall._id}`,
    parentOperationId: `turn:${toolCall.decisionRunId ?? thread.decisionRunId}`,
    scope: "tool",
    eventType: args.status === "failed" ? "tool.failed" : "tool.completed",
    status: args.status,
    estimatedCostUsd: toolCall.estimatedCostUsd,
    actualCostUsd: args.actualCostUsd,
    startedAt: toolCall.startedAt,
    completedAt: args.completedAt,
    durationMs: toolCall.startedAt ? args.completedAt - toolCall.startedAt : undefined,
    summary: args.status === "failed"
      ? `${toolCall.toolName} failed.`
      : `${toolCall.toolName} completed.`,
    details: {
      output: args.output,
      artifactIds: args.artifactIds,
    },
    errorMessage: args.errorMessage,
    occurredAt: args.completedAt,
  });
}

export const completeSocialResearch = internalMutation({
  args: {
    agentContext: v.string(),
    result: v.any(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return null;
    if (toolCall.status === "canceled") return null;

    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "succeeded",
      output: args.result,
      errorMessage: undefined,
      completedAt: now,
      updatedAt: now,
    });
    await recordAsyncToolTerminalEvent(ctx, thread, toolCall, {
      status: "succeeded",
      completedAt: now,
      output: args.result,
    });
    await appendAgentMessage(ctx, thread, {
      content: args.agentContext,
      kind: "tool_result",
    });

    await executeRunnableQueuedTools(ctx, thread);
    return null;
  },
});

export const failSocialResearch = internalMutation({
  args: {
    errorMessage: v.string(),
    threadId: v.id("createThreads"),
    toolCallId: v.id("createToolCalls"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!thread || !toolCall || toolCall.createThreadId !== thread._id) return null;
    if (toolCall.status === "canceled") return null;

    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: now,
      updatedAt: now,
    });
    await recordAsyncToolTerminalEvent(ctx, thread, toolCall, {
      status: "failed",
      completedAt: now,
      errorMessage: args.errorMessage,
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
    await markAccountRunFailedForThread(ctx, thread, args.errorMessage);
    return null;
  },
});

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
    await recordAsyncToolTerminalEvent(ctx, thread, toolCall, {
      status: "succeeded",
      completedAt: now,
      output: {
        artifactId: args.artifactId,
        text: args.text,
        provider: args.provider,
        model: args.model,
      },
      artifactIds: [args.artifactId],
      actualCostUsd: args.costUsd,
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
    await recordAsyncToolTerminalEvent(ctx, thread, toolCall, {
      status: "failed",
      completedAt: now,
      errorMessage: args.errorMessage,
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
    await markAccountRunFailedForThread(ctx, thread, args.errorMessage);
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
    await recordAsyncToolTerminalEvent(ctx, thread, toolCall, {
      status: "succeeded",
      completedAt: now,
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
      actualCostUsd: args.costUsd,
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
    await recordAsyncToolTerminalEvent(ctx, thread, toolCall, {
      status: "failed",
      completedAt: now,
      errorMessage: args.errorMessage,
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
    await markAccountRunFailedForThread(ctx, thread, args.errorMessage);
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

async function dependenciesReadyForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  for (const dependencyId of toolCall.dependsOnToolCallIds) {
    const dependency = await ctx.db.get(dependencyId);
    if (!dependency || dependency.createThreadId !== thread._id) return false;
    if (dependency.status !== "succeeded") return false;
    if (await toolCallHasPendingAsyncOutput(ctx, thread, dependency)) return false;
  }
  return true;
}

function maxParallelTools() {
  const parsed = Number.parseInt(process.env.CONTENT_ENGINE_AGENT_MAX_PARALLEL_TOOLS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
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

  if (thread.accountAgentRunId) {
    const run = await ctx.db.get(thread.accountAgentRunId);
    const account = run ? await ctx.db.get(run.socialAccountId) : null;
    const maxUsdPerPost = account?.autopilot?.budget?.maxUsdPerPost;
    if (run && maxUsdPerPost !== undefined) {
      const currentCost = await accountRunCostForThread(ctx, thread, run.costUsd ?? 0);
      if (currentCost >= maxUsdPerPost) {
        const errorMessage = `The account Agent reached its $${maxUsdPerPost.toFixed(2)} per-post budget.`;
        await markAccountRunFailedForThread(ctx, thread, errorMessage);
        await ctx.db.patch(thread._id, {
          status: "failed",
          errorMessage,
          updatedAt: Date.now(),
        });
        return {
          executedCount: 0,
          queuedCount: queuedToolCalls.length,
          errorMessage,
        };
      }
    }
  }

  if (await createDebugReadyOutputCheckpointIfNeeded(ctx, thread)) {
    return { executedCount: 0, queuedCount: queuedToolCalls.length, checkpointCreated: true };
  }

  let executedCount = 0;
  let skippedForDependencies = false;
  const runningToolCallsBeforeStart = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "running")
    )
    .collect();
  const succeededToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "succeeded")
    )
    .collect();
  let pendingAsyncOutputCount = 0;
  for (const toolCall of succeededToolCalls) {
    if (await toolCallHasPendingAsyncOutput(ctx, thread, toolCall)) pendingAsyncOutputCount += 1;
  }
  const availableSlots = Math.max(
    0,
    (thread.accountAgentRunId ? 1 : maxParallelTools()) -
      runningToolCallsBeforeStart.length -
      pendingAsyncOutputCount
  );
  if (availableSlots === 0 && queuedToolCalls.length) skippedForDependencies = true;
  for (const toolCall of queuedToolCalls) {
    if (executedCount >= availableSlots) break;
    if (!(await dependenciesReadyForToolCall(ctx, thread, toolCall))) {
      skippedForDependencies = true;
      continue;
    }
    const toolStartedAt = Date.now();
    await ctx.db.patch(toolCall._id, {
      startedAt: toolCall.startedAt ?? toolStartedAt,
      updatedAt: toolStartedAt,
    });
    await insertCreateRunEvent(ctx, thread, {
      decisionRunId: toolCall.decisionRunId ?? thread.decisionRunId,
      createMessageId: toolCall.messageId,
      createToolCallId: toolCall._id,
      operationId: `tool:${toolCall._id}`,
      parentOperationId: `turn:${toolCall.decisionRunId ?? thread.decisionRunId}`,
      scope: "tool",
      eventType: "tool.started",
      status: "running",
      estimatedCostUsd: toolCall.estimatedCostUsd,
      pricingSource: toolCall.costEstimate ? "pricing_estimate" : undefined,
      startedAt: toolCall.startedAt ?? toolStartedAt,
      summary: `Started ${toolCall.toolName}.`,
      details: {
        label: toolCall.label,
        input: toolCall.input,
        dependsOnToolCallIds: toolCall.dependsOnToolCallIds,
        costEstimate: toolCall.costEstimate,
      },
      occurredAt: toolStartedAt,
    });
    try {
      const mediaMode = mediaModeForToolName(toolCall.toolName);
      if (toolCall.toolName === "social.discoverContent") {
        await createSocialDiscoveryForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "social.researchTrends") {
        await createSocialTrendResearchForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "analyze.source") {
        await createAnalysisJobForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
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
      if (toolCall.toolName === "media.captions") {
        const result = await updateVideoProjectCaptionsForToolCall(ctx, thread, toolCall.input);
        const now = Date.now();
        await ctx.db.patch(toolCall._id, {
          status: "succeeded",
          output: result,
          completedAt: now,
          updatedAt: now,
        });
        await appendAgentMessage(ctx, thread, {
          content: "removed" in result && result.removed
            ? "Removed captions from the Studio video project."
            : `Added ${result.captionSegmentCount} caption segment${result.captionSegmentCount === 1 ? "" : "s"} to the Studio video project.`,
          kind: "tool_result",
        });
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "text.generate") {
        const started = await createTextGenerationForToolCall(ctx, thread, toolCall);
        if (started) executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "media.renderVideo") {
        const started = await createVideoRenderForToolCall(ctx, thread, toolCall);
        if (started) executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "slideshow.render") {
        await createSlideshowRequestForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "artifact.save") {
        const saved = await saveReadyOutputsForToolCall(ctx, thread, toolCall);
        if (saved) executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "artifact.export") {
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
        continue;
      }
      if (toolCall.toolName === "publishing.prepare") {
        const input = toolCall.input && typeof toolCall.input === "object" && !Array.isArray(toolCall.input)
          ? toolCall.input as Record<string, unknown>
          : {};
        const socialAccountId = typeof input.socialAccountId === "string"
          ? input.socialAccountId as never
          : undefined;
        const instructions = typeof input.instructions === "string" ? input.instructions : undefined;
        const result = await prepareAccountPostForThread(ctx, thread, undefined, {
          recordToolCall: false,
          socialAccountId,
          instructions,
        });
        if (result.accountPostId) {
          const now = Date.now();
          await ctx.db.patch(toolCall._id, {
            status: "succeeded",
            output: {
              accountPostId: result.accountPostId,
              artifactCount: result.artifactCount,
              status: "draft",
            },
            completedAt: now,
            updatedAt: now,
          });
          executedCount += 1;
        }
        continue;
      }
      if (toolCall.toolName === "account.list") {
        await listAccountsForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.get") {
        await getAccountForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.playbook.update") {
        await updateAccountPlaybookForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.autopilot.update") {
        await updateAccountAutopilotForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.autopilot.setStatus") {
        await setAccountAutopilotForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.runNow") {
        await runAccountNowForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.posts.list") {
        await listAccountPostsForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.reference.add") {
        await addAccountReferenceForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.reference.remove") {
        await removeAccountReferenceForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.post.approve") {
        await approveAccountPostForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.post.publish") {
        await publishAccountPostForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "account.post.reject") {
        await rejectAccountPostForToolCall(ctx, thread, toolCall);
        executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "studio.compose") {
        const composed = await createStudioProjectForToolCall(ctx, thread, toolCall);
        if (composed) executedCount += 1;
        continue;
      }
      if (toolCall.toolName === "studio.render") {
        const requested = await createStudioRenderRequestForToolCall(ctx, thread, toolCall);
        if (requested) executedCount += 1;
        continue;
      }
      if (!mediaMode) continue;
      await createGenerationRequestForToolCall(ctx, thread, toolCall, mediaMode);
      executedCount += 1;
      continue;
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
      await markAccountRunFailedForThread(ctx, thread, errorMessage);
      return {
        executedCount,
        queuedCount: queuedToolCalls.length,
        failedToolCallId: toolCall._id,
        errorMessage,
      };
    } finally {
      const terminalToolCall = await ctx.db.get(toolCall._id);
      if (
        terminalToolCall &&
        (terminalToolCall.status === "succeeded" ||
          terminalToolCall.status === "failed" ||
          terminalToolCall.status === "canceled")
      ) {
        const completedAt = terminalToolCall.completedAt ?? Date.now();
        const failed = terminalToolCall.status === "failed";
        await insertCreateRunEvent(ctx, thread, {
          decisionRunId: terminalToolCall.decisionRunId ?? thread.decisionRunId,
          createMessageId: terminalToolCall.messageId,
          createToolCallId: terminalToolCall._id,
          operationId: `tool:${terminalToolCall._id}`,
          parentOperationId: `turn:${terminalToolCall.decisionRunId ?? thread.decisionRunId}`,
          scope: "tool",
          eventType: failed ? "tool.failed" : "tool.completed",
          status: terminalToolCall.status === "canceled"
            ? "canceled"
            : failed
              ? "failed"
              : "succeeded",
          estimatedCostUsd: terminalToolCall.estimatedCostUsd,
          actualCostUsd: terminalToolCall.costUsd,
          startedAt: terminalToolCall.startedAt ?? toolStartedAt,
          completedAt,
          durationMs: completedAt - (terminalToolCall.startedAt ?? toolStartedAt),
          summary: failed
            ? `${terminalToolCall.toolName} failed.`
            : `${terminalToolCall.toolName} completed.`,
          details: {
            output: terminalToolCall.output,
            artifactIds: terminalToolCall.artifactIds,
          },
          errorMessage: terminalToolCall.errorMessage,
          occurredAt: completedAt,
        });
      }
    }
  }

  const now = Date.now();
  if (
    executedCount === 0 &&
    queuedToolCalls.length &&
    !skippedForDependencies
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
  const succeededToolCallsAfterStart = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "succeeded")
    )
    .collect();
  let hasPendingAsyncToolOutputs = false;
  for (const toolCall of succeededToolCallsAfterStart) {
    if (await toolCallHasPendingAsyncOutput(ctx, thread, toolCall)) {
      hasPendingAsyncToolOutputs = true;
      break;
    }
  }

  if (
    !remainingQueuedToolCalls.length &&
    !blockedToolCalls.length &&
    !runningToolCalls.length &&
    !hasPendingContentRequests &&
    !hasPendingAsyncToolOutputs &&
    (
      executedCount > 0 ||
      thread.status === "planning" ||
      thread.status === "running" ||
      thread.status === "waiting_for_user"
    ) &&
    await continueAgentLoopAfterToolCompletion(ctx, thread)
  ) {
    return { executedCount, queuedCount: 0, continuedAgentLoop: true };
  }

  await ctx.db.patch(thread._id, {
    status: blockedToolCalls.length
      ? "waiting_for_user"
      : runningToolCalls.length || hasPendingContentRequests || hasPendingAsyncToolOutputs
        ? "running"
      : remainingQueuedToolCalls.length
        ? "planning"
        : "idle",
    updatedAt: now,
  });

  return { executedCount, queuedCount: remainingQueuedToolCalls.length };
}
