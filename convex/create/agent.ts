import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import { getModelProvider } from "../providers";
import type { ModelMessage } from "../providers/model";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  createCheckpointModeValidator,
  createReferenceMentionValidator,
} from "../validators";
import {
  buildEffectiveBrief,
  threadTitleFromMessage,
} from "./planning";
import {
  createAgentSystemPrompt,
  messageForModel,
  normalizeAgentDecision,
  planMessageForCreateDecision,
  type AgentDecision,
} from "./agent/agentDecision";
import {
  asyncFailureMessageForToolCall,
  createThreadScopeMatchesRecord,
  toolCallsForAsyncOutput,
} from "./agent/agentAsyncResults";
import {
  compactLogValue,
  createAgentDecisionErrorLog,
} from "./agent/agentDiagnostics";
import {
  appendMessage,
  createThreadForTurn,
  findThreadForReadAccess,
  normalizeOptionalText,
  requireThreadAccess,
  supersedeOpenCheckpointsForNewTurn,
  uniqueCreateReferenceMentions,
} from "./agent/agentThreadRecords";
import {
  hasDebugGatedToolCalls,
  recordPlannedTools,
} from "./agent/agentToolPlanning";
import { listThreadOutputsForThread } from "./agent/agentThreadOutputs";
import { isRecord } from "./references/referenceResolution";
import {
  executeRunnableQueuedTools,
  prepareArtifactExportForThread,
  prepareDistributionDraftForThread,
  saveReadyOutputsForThread,
} from "./toolExecution";
import {
  analysisJobIdFromToolOutput,
  contentRequestIdFromToolOutput,
  slideshowPromptReviewRequestId,
  studioRenderRequestIdFromToolOutput,
} from "./execution/toolExecutionShared";
import { saveThreadAsWorkflowDraft } from "./agent/agentWorkflowDraftActions";
import { stopCreateThread } from "./agent/agentStopActions";

export { normalizeAgentDecision } from "./agent/agentDecision";

const createAgentProvider = "openrouter";
const createAgentModel =
  process.env.CONTENT_ENGINE_CREATE_AGENT_MODEL?.trim() ||
  process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() ||
  "openai/gpt-4.1";

export const listThreadOutputs = query({
  args: { threadId: v.id("createThreads") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const thread = await findThreadForReadAccess(ctx, args.threadId, identity.subject);
    if (!thread) {
      return {
        contentRequests: [],
        analysisJobs: [],
        directArtifacts: [],
        videoProjects: [],
        distributionPlans: [],
        studioRenderRequests: [],
        referenceResults: [],
      };
    }

    return await listThreadOutputsForThread(ctx, thread);
  },
});

export const agentTurnContext = internalQuery({
  args: {
    threadId: v.id("createThreads"),
    userMessageId: v.id("createMessages"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const userMessage = await ctx.db.get(args.userMessageId);
    if (!thread || !userMessage || userMessage.createThreadId !== thread._id) {
      return null;
    }

    const messages = await ctx.db
      .query("createMessages")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .collect();
    const recentMessages = messages
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-16);
    const artifactIds = [
      ...new Set(
        recentMessages.flatMap((message) => message.artifactIds ?? [])
      ),
    ];
    const artifacts = await Promise.all(artifactIds.map((artifactId) => ctx.db.get(artifactId)));
    const generatedTextByArtifactId = new Map<string, string>();
    for (const artifact of artifacts) {
      if (!artifact) continue;
      const data = isRecord(artifact.data) ? artifact.data : {};
      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (text) generatedTextByArtifactId.set(String(artifact._id), text);
    }

    return {
      thread,
      userMessage,
      messages: recentMessages.map((message) => {
        const generatedTextContext = (message.artifactIds ?? [])
          .map((artifactId) => generatedTextByArtifactId.get(String(artifactId)))
          .filter((text): text is string => Boolean(text))
          .map((text) => compactLogValue(text, 6000))
          .filter((text): text is string => Boolean(text))
          .join("\n\n");
        return generatedTextContext ? { ...message, generatedTextContext } : message;
      }),
    };
  },
});

export const applyAgentDecision = internalMutation({
  args: {
    checkpointMode: createCheckpointModeValidator,
    decision: v.any(),
    effectiveContent: v.string(),
    referenceMentions: v.optional(v.array(createReferenceMentionValidator)),
    threadId: v.id("createThreads"),
    userMessageId: v.id("createMessages"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const userMessage = await ctx.db.get(args.userMessageId);
    if (!thread || !userMessage || userMessage.createThreadId !== thread._id) return;

    const decision = args.decision as AgentDecision;
    const now = Date.now();

    if (decision.kind === "chat") {
      await appendMessage(ctx, thread, {
        role: "agent",
        content: decision.response,
        kind: "chat",
      });
      await ctx.db.patch(thread._id, {
        status: "idle",
        title: thread.title === "New Chat" ? threadTitleFromMessage(userMessage.content) : thread.title,
        updatedAt: now,
      });
      return;
    }

    if (decision.kind === "clarify") {
      await appendMessage(ctx, thread, {
        role: "agent",
        content: decision.response,
        kind: "clarification",
      });
      await ctx.db.patch(thread._id, {
        status: "clarifying",
        lastInferredOutputType: "unknown",
        title: thread.title === "New Chat" ? threadTitleFromMessage(userMessage.content) : thread.title,
        updatedAt: now,
      });
      return;
    }

    const planMessageId = await appendMessage(ctx, thread, {
      role: "agent",
      content: planMessageForCreateDecision(decision),
      kind: "plan",
    });
    await recordPlannedTools(
      ctx,
      thread,
      planMessageId,
      decision,
      args.effectiveContent,
      args.referenceMentions
    );

    const requiresDebugReview = args.checkpointMode === "debug" && hasDebugGatedToolCalls(decision);
    const nextStatus = requiresDebugReview ? "waiting_for_user" : "planning";
    if (requiresDebugReview) {
      await ctx.db.insert("createCheckpoints", {
        userId: thread.userId,
        workspaceId: thread.workspaceId,
        createThreadId: thread._id,
        status: "open",
        label: "Review plan",
        message: "Approve this plan before the agent starts spending generation or render resources.",
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(thread._id, {
      status: nextStatus,
      lastInferredOutputType: decision.outputType,
      title: thread.title === "New Chat" ? threadTitleFromMessage(userMessage.content) : thread.title,
      updatedAt: now,
    });

    if (!requiresDebugReview) {
      await executeRunnableQueuedTools(ctx, thread);
    }
  },
});

export const failAgentDecision = internalMutation({
  args: {
    errorMessage: v.string(),
    threadId: v.id("createThreads"),
    userMessageId: v.id("createMessages"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const userMessage = await ctx.db.get(args.userMessageId);
    if (!thread || !userMessage || userMessage.createThreadId !== thread._id) return;

    await appendMessage(ctx, thread, {
      role: "agent",
      content: `I am having trouble thinking through that request right now: ${args.errorMessage}`,
      kind: "chat",
    });
    await ctx.db.patch(thread._id, {
      status: "idle",
      updatedAt: Date.now(),
    });
  },
});

export const decideAgentTurn = internalAction({
  args: {
    checkpointMode: createCheckpointModeValidator,
    threadId: v.id("createThreads"),
    userMessageId: v.id("createMessages"),
  },
  handler: async (ctx, args) => {
    let diagnosticContext: Record<string, unknown> = {
      createThreadId: String(args.threadId),
      createMessageId: String(args.userMessageId),
      modelProvider: createAgentProvider,
      model: createAgentModel,
    };

    try {
      const context = await ctx.runQuery(internal.create.agent.agentTurnContext, {
        threadId: args.threadId,
        userMessageId: args.userMessageId,
      });
      if (!context) return;

      const threadReferenceMentions = uniqueCreateReferenceMentions(
        context.messages.flatMap((message) => message.referenceMentions ?? [])
      );
      const effectiveBrief = buildEffectiveBrief({
        content: context.userMessage.content,
        currentMentions: threadReferenceMentions,
      });
      diagnosticContext = {
        ...diagnosticContext,
        workspaceId: context.thread.workspaceId ? String(context.thread.workspaceId) : undefined,
        threadStatus: context.thread.status,
        userMessageKind: context.userMessage.kind,
        userMessageLength: context.userMessage.content.length,
        effectiveBriefPreview: compactLogValue(effectiveBrief.content, 2400),
        currentMessageReferenceMentionCount: context.userMessage.referenceMentions?.length ?? 0,
        referenceMentionCount: effectiveBrief.referenceMentions?.length ?? 0,
        contextMessageCount: context.messages.length,
      };

      const provider = getModelProvider(createAgentProvider);
      const modelMessages: ModelMessage[] = [
        { role: "system", content: createAgentSystemPrompt() },
        ...context.messages.map(messageForModel),
        {
          role: "user",
          content: [
            "Decide the next assistant action for the latest user message.",
            `Effective brief for creation, if relevant: ${effectiveBrief.content}`,
            "Use the conversation messages and prior tool results above as normal chat context. Do not rely on hard-coded phrases to infer follow-up intent.",
          ].join("\n"),
        },
      ];

      const result = await provider.generateStructured<AgentDecision>({
        messages: modelMessages,
        model: createAgentModel,
        temperature: 0.2,
        maxTokens: 4000,
        parser: normalizeAgentDecision,
        metadata: {
          createThreadId: String(args.threadId),
          createMessageId: String(args.userMessageId),
          toolName: "create.agent.decide",
        },
      });

      await ctx.runMutation(internal.create.agent.applyAgentDecision, {
        checkpointMode: args.checkpointMode,
        decision: result.object,
        effectiveContent: result.object.kind === "create"
          ? result.object.brief
          : effectiveBrief.content,
        referenceMentions: effectiveBrief.referenceMentions,
        threadId: args.threadId,
        userMessageId: args.userMessageId,
      });
    } catch (error) {
      console.error("[create.agent.decide] failed", {
        ...diagnosticContext,
        error: createAgentDecisionErrorLog(error),
      });
      await ctx.runMutation(internal.create.agent.failAgentDecision, {
        errorMessage: error instanceof Error ? error.message : "Unknown model error",
        threadId: args.threadId,
        userMessageId: args.userMessageId,
      });
    }
  },
});

export const submit = mutation({
  args: {
    threadId: v.optional(v.id("createThreads")),
    workspaceId: v.optional(v.id("workspaces")),
    checkpointMode: v.optional(createCheckpointModeValidator),
    content: v.string(),
    referenceMentions: v.optional(v.array(createReferenceMentionValidator)),
  },
  handler: async (ctx, args) => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    const content = args.content.trim();
    if (!content) throw new Error("Message content is required");

    const thread = args.threadId
      ? await requireThreadAccess(ctx, args.threadId, userId)
      : await createThreadForTurn(ctx, {
          userId,
          workspaceId: args.workspaceId
            ? (await resolveWritableWorkspace(ctx, userId, args.workspaceId))._id
            : defaultWorkspace._id,
          checkpointMode: args.checkpointMode ?? "debug",
          initialMessage: content,
          referenceMentions: args.referenceMentions,
          title: threadTitleFromMessage(content),
        });
    const checkpointMode = args.checkpointMode ?? thread.checkpointMode;
    const now = Date.now();

    if (args.workspaceId && args.threadId) {
      await requireWorkspaceMember(ctx, args.workspaceId, userId);
    }

    await supersedeOpenCheckpointsForNewTurn(ctx, thread);

    const userMessageId = await appendMessage(ctx, thread, {
      role: "user",
      content,
      kind: "chat",
      referenceMentions: args.referenceMentions,
    });
    await ctx.db.patch(thread._id, {
      checkpointMode,
      status: "planning",
      title: thread.title === "New Chat" ? threadTitleFromMessage(content) : thread.title,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.create.agent.decideAgentTurn, {
      checkpointMode,
      threadId: thread._id,
      userMessageId,
    });

    return { threadId: thread._id, userMessageId, intent: "thinking" };
  },
});

export const approveCheckpoint = mutation({
  args: {
    checkpointId: v.id("createCheckpoints"),
    response: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const checkpoint = await ctx.db.get(args.checkpointId);
    if (!checkpoint) throw new Error("Create checkpoint not found");

    const thread = await requireThreadAccess(ctx, checkpoint.createThreadId, userId);
    const now = Date.now();

    await ctx.db.patch(checkpoint._id, {
      status: "approved",
      response: normalizeOptionalText(args.response),
      updatedAt: now,
    });

    const pausedSlideshowRequestId = slideshowPromptReviewRequestId(checkpoint.data);
    if (pausedSlideshowRequestId) {
      const request = await ctx.db.get(pausedSlideshowRequestId);
      if (
        request &&
        request.status === "planning" &&
        (thread.workspaceId ? request.workspaceId === thread.workspaceId : request.userId === thread.userId)
      ) {
        await ctx.scheduler.runAfter(0, internal.content.requests.execute, {
          requestId: request._id,
        });
      }
    }

    return await executeRunnableQueuedTools(ctx, thread);
  },
});

export const continueThread = mutation({
  args: { threadId: v.id("createThreads") },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);

    return await executeRunnableQueuedTools(ctx, thread);
  },
});

export const stopThread = mutation({
  args: { threadId: v.id("createThreads") },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);
    return await stopCreateThread(ctx, thread);
  },
});

export const continueAfterAsyncResult = internalMutation({
  args: {
    contentRequestId: v.optional(v.id("contentRequests")),
    analysisJobId: v.optional(v.id("videoAnalysisJobs")),
    studioRenderRequestId: v.optional(v.id("studioRenderRequests")),
  },
  handler: async (ctx, args) => {
    const toolCalls: Doc<"createToolCalls">[] = [];
    const sourceRecords: Array<
      Doc<"contentRequests"> | Doc<"videoAnalysisJobs"> | Doc<"studioRenderRequests">
    > = [];

    if (args.contentRequestId) {
      const request = await ctx.db.get(args.contentRequestId);
      if (request) {
        sourceRecords.push(request);
        toolCalls.push(
          ...(await toolCallsForAsyncOutput(
            ctx,
            request,
            (output) => contentRequestIdFromToolOutput(output) === request._id
          ))
        );
      }
    }

    if (args.analysisJobId) {
      const job = await ctx.db.get(args.analysisJobId);
      if (job) {
        sourceRecords.push(job);
        toolCalls.push(
          ...(await toolCallsForAsyncOutput(
            ctx,
            job,
            (output) => analysisJobIdFromToolOutput(output) === job._id
          ))
        );
      }
    }

    if (args.studioRenderRequestId) {
      const request = await ctx.db.get(args.studioRenderRequestId);
      if (request) {
        sourceRecords.push(request);
        toolCalls.push(
          ...(await toolCallsForAsyncOutput(
            ctx,
            request,
            (output) => studioRenderRequestIdFromToolOutput(output) === request._id
          ))
        );
      }
    }

    const continuedThreadIds = new Set<string>();
    let continuedThreadCount = 0;
    for (const toolCall of toolCalls) {
      if (continuedThreadIds.has(String(toolCall.createThreadId))) continue;
      const thread = await ctx.db.get(toolCall.createThreadId);
      if (!thread) continue;
      const belongsToSource = sourceRecords.some((source) =>
        createThreadScopeMatchesRecord(thread, source)
      );
      if (!belongsToSource) continue;

      continuedThreadIds.add(String(thread._id));
      const readySource = sourceRecords.find((source) =>
        (
          ("status" in source && (source.status === "ready" || source.status === "completed"))
        ) &&
        (
          contentRequestIdFromToolOutput(toolCall.output) === source._id ||
          analysisJobIdFromToolOutput(toolCall.output) === source._id ||
          studioRenderRequestIdFromToolOutput(toolCall.output) === source._id
        )
      );
      if (readySource) {
        const remainingQueued = await ctx.db
          .query("createToolCalls")
          .withIndex("by_thread_status", (q) =>
            q.eq("createThreadId", thread._id).eq("status", "queued")
          )
          .collect();
        await appendMessage(ctx, thread, {
          role: "agent",
          content: remainingQueued.length
            ? `Finished ${toolCall.label}. Continuing to the next step.`
            : `Finished ${toolCall.label}.`,
          kind: "status",
        });
        if (
          !remainingQueued.length &&
          toolCall.toolName === "slideshow.render" &&
          "contentFormat" in readySource &&
          readySource.contentFormat === "slideshow"
        ) {
          await ctx.db.patch(thread._id, {
            status: "ready",
            updatedAt: Date.now(),
          });
          continuedThreadCount += 1;
          continue;
        }
      }
      await executeRunnableQueuedTools(ctx, thread);
      continuedThreadCount += 1;
    }

    return { continuedThreadCount };
  },
});

export const retryToolCall = mutation({
  args: { toolCallId: v.id("createToolCalls") },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!toolCall) throw new Error("Create tool call not found");
    const thread = await requireThreadAccess(ctx, toolCall.createThreadId, userId);
    const asyncFailureMessage = await asyncFailureMessageForToolCall(ctx, thread, toolCall);
    if (toolCall.status !== "failed" && !asyncFailureMessage) {
      throw new Error("Only failed tool calls can be retried");
    }

    const now = Date.now();
    await ctx.db.patch(toolCall._id, {
      status: "queued",
      errorMessage: undefined,
      output: undefined,
      completedAt: undefined,
      updatedAt: now,
    });
    await appendMessage(ctx, thread, {
      role: "agent",
      content: `Retrying ${toolCall.label}.`,
      kind: "status",
    });
    await ctx.db.patch(thread._id, {
      status: "planning",
      errorMessage: undefined,
      updatedAt: now,
    });

    return await executeRunnableQueuedTools(ctx, thread);
  },
});

export const saveThreadOutputs = mutation({
  args: {
    threadId: v.id("createThreads"),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);

    return await saveReadyOutputsForThread(ctx, thread, undefined, args.artifactIds);
  },
});

export const preparePublishDraft = mutation({
  args: {
    threadId: v.id("createThreads"),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);

    return await prepareDistributionDraftForThread(ctx, thread, args.artifactIds);
  },
});

export const exportThreadOutputs = mutation({
  args: {
    threadId: v.id("createThreads"),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    const thread = await requireThreadAccess(ctx, args.threadId, userId);

    return await prepareArtifactExportForThread(ctx, thread, args.artifactIds);
  },
});

export const saveAsWorkflowDraft = mutation({
  args: {
    threadId: v.id("createThreads"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCurrentUser(ctx);
    return await saveThreadAsWorkflowDraft(ctx, { ...args, userId });
  },
});
