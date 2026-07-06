import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  query,
} from "../_generated/server";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import { getModelProvider } from "../providers";
import type { ModelMessage } from "../providers/model";
import { isProviderError } from "../providers/errors";
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
  toolDescriptorMap,
} from "./planning";
import type { CreateToolName } from "./tools";
import {
  AGENT_DECISION_JSON_SCHEMA,
  AgentDecisionParseError,
  AgentDecisionValidationError,
  createAgentSystemPrompt,
  decisionInstructionForTurn,
  messagesForModel,
  normalizeAgentDecision,
  planSignatureForToolCalls,
  planMessageForCreateDecision,
  shouldPauseForRepeatedPlan,
  type AgentDecision,
} from "./agent/agentDecision";
import { selectPromptModules } from "./agent/agentPromptModules";
import {
  asyncFailureMessageForToolCall,
  createThreadScopeMatchesRecord,
  toolCallsForAsyncOutput,
} from "./agent/agentAsyncResults";
import {
  compactLogValue,
  createAgentDecisionErrorLog,
} from "./agent/agentDiagnostics";
import { buildTurnContextSections } from "./agent/agentTurnContextBuilder";
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
import {
  executeRunnableQueuedTools,
  prepareArtifactExportForThread,
  prepareDistributionDraftForThread,
  saveReadyOutputsForThread,
} from "./toolExecution";
import {
  artifactMediaKind,
  isRecord,
} from "./references/referenceResolution";
import {
  analysisJobIdFromToolOutput,
  contentRequestIdFromToolOutput,
  slideshowPromptReviewRequestId,
  studioRenderRequestIdFromToolOutput,
} from "./execution/toolExecutionShared";
import { stopCreateThread } from "./agent/agentStopActions";

export {
  AgentDecisionParseError,
  AgentDecisionValidationError,
  createAgentSystemPrompt,
  decisionInstructionForTurn,
  messagesForModel,
  normalizeAgentDecision,
  planSignatureForToolCalls,
  shouldPauseForRepeatedPlan,
} from "./agent/agentDecision";

const createAgentProvider = "openrouter";
const createAgentModel =
  process.env.CONTENT_ENGINE_CREATE_AGENT_MODEL?.trim() ||
  process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() ||
  "openai/gpt-4.1";
const continueWorkingCheckpointLabel = "Continue working?";

function artifactCaptionForResult(artifact: Doc<"artifacts">) {
  const data = isRecord(artifact.data) ? artifact.data : {};
  const caption = typeof data.caption === "string" ? data.caption.trim() : "";
  return caption || artifact.title || "Untitled artifact";
}

function artifactKindForResult(artifact: Doc<"artifacts">) {
  const mediaKind = artifactMediaKind(artifact);
  if (mediaKind === "image") return "Image artifact";
  if (mediaKind === "video") return "Video artifact";
  if (mediaKind === "audio") return "Audio artifact";
  return "Artifact";
}

function durationAdjustmentNote(toolCall: Doc<"createToolCalls">) {
  const output = isRecord(toolCall.output) ? toolCall.output : {};
  const requested = typeof output.requestedDurationSeconds === "number"
    ? output.requestedDurationSeconds
    : undefined;
  const duration = typeof output.durationSeconds === "number"
    ? output.durationSeconds
    : undefined;
  if (
    requested === undefined ||
    duration === undefined ||
    Math.abs(requested - duration) < 0.001
  ) {
    return "";
  }
  return ` Duration adjusted from ${requested}s to ${duration}s for the selected model.`;
}

function completionMessageForToolResult(
  toolCall: Doc<"createToolCalls">,
  artifacts: Doc<"artifacts">[]
) {
  const toolLabel = toolDescriptorMap().get(toolCall.toolName as CreateToolName)?.label ?? toolCall.label;
  const produced = artifacts.length
    ? ` Produced: ${artifacts.map((artifact) =>
        `${artifactKindForResult(artifact)} "${compactLogValue(artifactCaptionForResult(artifact), 90)}" (ready)`
      ).join(", ")}.`
    : "";
  return `Tool "${toolLabel}" completed successfully.${durationAdjustmentNote(toolCall)}${produced}`;
}

async function artifactsForContentRequest(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  requestId: Id<"contentRequests">
) {
  const artifacts = await ctx.db
    .query("artifacts")
    .withIndex("by_content_request", (q) => q.eq("contentRequestId", requestId))
    .collect();
  return artifacts.filter((artifact) =>
    thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId
  );
}

async function artifactsForCompletedAsyncTool(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">,
  readySource: Doc<"contentRequests"> | Doc<"videoAnalysisJobs"> | Doc<"studioRenderRequests">
) {
  const artifactIds = new Set<string>((toolCall.artifactIds ?? []).map(String));
  const contentRequestId = contentRequestIdFromToolOutput(toolCall.output);
  if (contentRequestId && readySource._id === contentRequestId) {
    const isSlideshowRequest = "contentFormat" in readySource && readySource.contentFormat === "slideshow";
    if (!isSlideshowRequest) {
      for (const artifact of await artifactsForContentRequest(ctx, thread, contentRequestId)) {
        artifactIds.add(String(artifact._id));
      }
    }
  }
  const studioRenderRequestId = studioRenderRequestIdFromToolOutput(toolCall.output);
  if (
    studioRenderRequestId &&
    readySource._id === studioRenderRequestId &&
    "outputArtifactId" in readySource &&
    readySource.outputArtifactId
  ) {
    artifactIds.add(String(readySource.outputArtifactId));
  }

  const artifacts = await Promise.all(
    [...artifactIds].flatMap((artifactId) => {
      const normalizedId = ctx.db.normalizeId("artifacts", artifactId);
      return normalizedId ? [ctx.db.get(normalizedId)] : [];
    })
  );
  return artifacts.filter((artifact): artifact is Doc<"artifacts"> => {
    if (!artifact) return false;
    return thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId;
  });
}

async function slideshowReadyMessageForRequest(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  request: Doc<"contentRequests">
) {
  const slideshows = await ctx.db
    .query("slideshows")
    .withIndex("by_content_request", (q) => q.eq("contentRequestId", request._id))
    .collect();
  const slideshow = slideshows.find((candidate) =>
    thread.workspaceId ? candidate.workspaceId === thread.workspaceId : candidate.userId === thread.userId
  );
  if (!slideshow) return "Your slideshow is ready to review.";

  const spec = isRecord(slideshow.spec) ? slideshow.spec : {};
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  const activeSlideCount = slides.filter((slide) =>
    isRecord(slide) ? slide.status !== "deleted" : true
  ).length;
  const slideSummary = activeSlideCount > 0
    ? `${activeSlideCount} slide${activeSlideCount === 1 ? "" : "s"}`
    : "an editable slideshow";
  return `Your slideshow "${slideshow.title}" is ready — ${slideSummary}. Want any copy, slide, or layout changes?`;
}

async function mediaArtifactsProducedSinceUserMessage(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  userMessage: Doc<"createMessages">
) {
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const artifactIds = [
    ...new Set(
      toolCalls
        .filter((toolCall) => toolCall.createdAt >= userMessage.createdAt)
        .flatMap((toolCall) => toolCall.artifactIds ?? [])
        .map(String)
    ),
  ];
  const artifacts = await Promise.all(
    artifactIds.flatMap((artifactId) => {
      const normalizedId = ctx.db.normalizeId("artifacts", artifactId);
      return normalizedId ? [ctx.db.get(normalizedId)] : [];
    })
  );

  return artifacts
    .filter((artifact): artifact is Doc<"artifacts"> => {
      if (!artifact?.storageUrl) return false;
      const mediaKind = artifactMediaKind(artifact);
      if (mediaKind !== "image" && mediaKind !== "video" && mediaKind !== "audio") return false;
      return thread.workspaceId ? artifact.workspaceId === thread.workspaceId : artifact.userId === thread.userId;
    })
    .map((artifact) => artifact._id);
}

function shouldAppendAsyncCompletionToolResult(
  toolCall: Doc<"createToolCalls">,
  readySource: Doc<"contentRequests"> | Doc<"videoAnalysisJobs"> | Doc<"studioRenderRequests">
) {
  return contentRequestIdFromToolOutput(toolCall.output) === readySource._id ||
    studioRenderRequestIdFromToolOutput(toolCall.output) === readySource._id;
}

function shouldRepairAgentDecision(error: unknown) {
  if (error instanceof AgentDecisionParseError) return true;
  if (error instanceof AgentDecisionValidationError) return true;
  if (!isProviderError(error)) return false;
  return error.operation === "generate_structured" &&
    error.message.toLowerCase().includes("invalid structured output");
}

function agentDecisionErrorMessage(error: unknown) {
  if (isProviderError(error) && error.cause instanceof Error) {
    return error.cause.message;
  }
  return error instanceof Error ? error.message : "Unknown model error";
}

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
    const toolCalls = await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .collect();
    const threadReferenceMentions = uniqueCreateReferenceMentions(
      messages.flatMap((message) => message.referenceMentions ?? [])
    );
    const effectiveBrief = buildEffectiveBrief({
      content: userMessage.content,
      currentMentions: threadReferenceMentions,
    });
    const sections = await buildTurnContextSections(ctx, {
      effectiveBrief: effectiveBrief.content,
      messages,
      thread,
      toolCalls,
      userMessage,
    });

    return {
      thread,
      userMessage,
      effectiveBrief,
      isContinuation: toolCalls.some((toolCall) => toolCall.createdAt > userMessage.createdAt),
      sections,
      toolNames: toolCalls.map((toolCall) => toolCall.toolName),
    };
  },
});

export const applyAgentDecision = internalMutation({
  args: {
    checkpointMode: createCheckpointModeValidator,
    decision: v.any(),
    decisionRunId: v.string(),
    effectiveContent: v.string(),
    currentReferenceMentions: v.optional(v.array(createReferenceMentionValidator)),
    referenceMentions: v.optional(v.array(createReferenceMentionValidator)),
    threadId: v.id("createThreads"),
    userMessageId: v.id("createMessages"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const userMessage = await ctx.db.get(args.userMessageId);
    if (!thread || !userMessage || userMessage.createThreadId !== thread._id) return;
    if (thread.decisionRunId !== args.decisionRunId) {
      console.info("[create.agent.apply] stale decision ignored", {
        createThreadId: String(thread._id),
        expectedDecisionRunId: thread.decisionRunId,
        receivedDecisionRunId: args.decisionRunId,
      });
      return;
    }

    const decision = args.decision as AgentDecision;
    const now = Date.now();
    const nextDecisionCount = thread.turnDecisionCount + 1;

    if (decision.kind === "chat") {
      const artifactIds = thread.turnDecisionCount > 0
        ? await mediaArtifactsProducedSinceUserMessage(ctx, thread, userMessage)
        : [];
      await appendMessage(ctx, thread, {
        role: "agent",
        content: decision.response,
        kind: "chat",
        ...(artifactIds.length ? { artifactIds } : {}),
      });
      await ctx.db.patch(thread._id, {
        status: "idle",
        turnDecisionCount: nextDecisionCount,
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
        turnDecisionCount: nextDecisionCount,
        title: thread.title === "New Chat" ? threadTitleFromMessage(userMessage.content) : thread.title,
        updatedAt: now,
      });
      return;
    }

    const planSignature = planSignatureForToolCalls(decision.toolCalls);
    const toolCallsSinceUserMessage = await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .collect();
    const hasFailedToolCallSinceUserMessage = toolCallsSinceUserMessage.some((toolCall) =>
      toolCall.createdAt >= userMessage.createdAt && toolCall.status === "failed"
    );
    if (shouldPauseForRepeatedPlan({
      hasFailedToolCallSinceUserMessage,
      isContinuation: thread.turnDecisionCount > 0,
      lastPlanSignature: thread.lastPlanSignature,
      planSignature,
    })) {
      await ctx.db.insert("createCheckpoints", {
        userId: thread.userId,
        workspaceId: thread.workspaceId,
        createThreadId: thread._id,
        status: "open",
        label: continueWorkingCheckpointLabel,
        message: `The agent planned the same tool sequence again after ${nextDecisionCount} planning steps on this request, so it is pausing before repeating work.`,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(thread._id, {
        status: "waiting_for_user",
        turnDecisionCount: nextDecisionCount,
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
      args.referenceMentions,
      args.currentReferenceMentions
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
      lastPlanSignature: planSignature,
      turnDecisionCount: nextDecisionCount,
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
    decisionRunId: v.string(),
    errorMessage: v.string(),
    threadId: v.id("createThreads"),
    userMessageId: v.id("createMessages"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const userMessage = await ctx.db.get(args.userMessageId);
    if (!thread || !userMessage || userMessage.createThreadId !== thread._id) return;
    if (thread.decisionRunId !== args.decisionRunId) {
      console.info("[create.agent.fail] stale decision failure ignored", {
        createThreadId: String(thread._id),
        expectedDecisionRunId: thread.decisionRunId,
        receivedDecisionRunId: args.decisionRunId,
      });
      return;
    }

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

export const persistTurnContextSummary = internalMutation({
  args: {
    contextSummary: v.string(),
    contextSummaryThroughMessageId: v.id("createMessages"),
    threadId: v.id("createThreads"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return;
    await ctx.db.patch(thread._id, {
      contextSummary: args.contextSummary,
      contextSummaryThroughMessageId: args.contextSummaryThroughMessageId,
      updatedAt: Date.now(),
    });
  },
});

export const decideAgentTurn = internalAction({
  args: {
    checkpointMode: createCheckpointModeValidator,
    decisionRunId: v.string(),
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

      const effectiveBrief = context.effectiveBrief;
      diagnosticContext = {
        ...diagnosticContext,
        workspaceId: context.thread.workspaceId ? String(context.thread.workspaceId) : undefined,
        threadStatus: context.thread.status,
        userMessageKind: context.userMessage.kind,
        userMessageLength: context.userMessage.content.length,
        effectiveBriefPreview: compactLogValue(effectiveBrief.content, 2400),
        currentMessageReferenceMentionCount: context.userMessage.referenceMentions?.length ?? 0,
        referenceMentionCount: effectiveBrief.referenceMentions?.length ?? 0,
        contextMessageCount: context.sections.recentMessages.length,
        droppedContextMessageCount: context.sections.droppedMessages.length,
      };

      const provider = getModelProvider(createAgentProvider);
      let earlierConversationSummary: string | undefined;
      const droppedMessages = context.sections.droppedMessages;
      const lastDroppedMessage = droppedMessages[droppedMessages.length - 1];
      if (
        lastDroppedMessage &&
        context.thread.contextSummary &&
        context.thread.contextSummaryThroughMessageId === lastDroppedMessage._id
      ) {
        earlierConversationSummary = context.thread.contextSummary;
      } else if (lastDroppedMessage) {
        try {
          const previousSummaryIndex = context.thread.contextSummaryThroughMessageId
            ? droppedMessages.findIndex((message) =>
                message._id === context.thread.contextSummaryThroughMessageId
              )
            : -1;
          const messagesToSummarize = previousSummaryIndex >= 0
            ? droppedMessages.slice(previousSummaryIndex + 1)
            : droppedMessages;
          const droppedTranscript = messagesToSummarize
            .map((message) => `${message.role}: ${message.content}`)
            .join("\n\n");
          const trimmedDroppedTranscript = droppedTranscript.trim();
          if (!trimmedDroppedTranscript && context.thread.contextSummary) {
            earlierConversationSummary = context.thread.contextSummary;
          }
          if (trimmedDroppedTranscript) {
            const summaryResult = await provider.generateText({
              model: createAgentModel,
              maxTokens: 600,
              temperature: 0.1,
              prompt: [
                "Summarize the earlier Create agent conversation for future planning.",
                "Keep a factual digest of what was requested, produced, decided, and rejected.",
                "Do not add advice, speculation, or new plans.",
                context.thread.contextSummary
                  ? `Previous summary:\n${context.thread.contextSummary}`
                  : "Previous summary: none.",
                `Newly dropped messages:\n${trimmedDroppedTranscript}`,
              ].join("\n\n"),
              metadata: {
                createThreadId: String(args.threadId),
                createMessageId: String(args.userMessageId),
                toolName: "create.agent.summarize_context",
              },
            });
            earlierConversationSummary = summaryResult.text.trim();
          }
          if (earlierConversationSummary && trimmedDroppedTranscript) {
            await ctx.runMutation(internal.create.agent.persistTurnContextSummary, {
              contextSummary: earlierConversationSummary,
              contextSummaryThroughMessageId: lastDroppedMessage._id,
              threadId: args.threadId,
            });
          }
        } catch (error) {
          console.error("[create.agent.decide] context summary failed", {
            ...diagnosticContext,
            error: createAgentDecisionErrorLog(error),
          });
        }
      }
      const promptModules = selectPromptModules({
        isContinuation: context.isContinuation,
        toolNames: context.toolNames,
      });
      const modelMessages: ModelMessage[] = [
        { role: "system", content: createAgentSystemPrompt(promptModules) },
        { role: "user", content: context.sections.contextBlock },
        ...(earlierConversationSummary
          ? [{ role: "user" as const, content: `Earlier conversation summary:\n${earlierConversationSummary}` }]
          : []),
        ...messagesForModel(context.sections.recentMessages),
        {
          role: "user",
          content: decisionInstructionForTurn({
            effectiveBrief: effectiveBrief.content,
            isContinuation: context.isContinuation,
          }),
        },
      ];

      const generateDecision = async (messages: ModelMessage[]) =>
        await provider.generateStructured<AgentDecision>({
          messages,
          model: createAgentModel,
          temperature: 0.2,
          maxTokens: 4000,
          schema: AGENT_DECISION_JSON_SCHEMA,
          schemaName: "create_agent_decision",
          parser: normalizeAgentDecision,
          metadata: {
            createThreadId: String(args.threadId),
            createMessageId: String(args.userMessageId),
            toolName: "create.agent.decide",
          },
        });

      let result;
      try {
        result = await generateDecision(modelMessages);
      } catch (error) {
        if (!shouldRepairAgentDecision(error)) throw error;
        console.error("[create.agent.decide] structured output repair", {
          ...diagnosticContext,
          error: createAgentDecisionErrorLog(error),
        });
        result = await generateDecision([
          ...modelMessages,
          {
            role: "user",
            content: `Your previous response was not valid: ${agentDecisionErrorMessage(error)}. Respond again following the required JSON schema exactly.`,
          },
        ]);
      }

      await ctx.runMutation(internal.create.agent.applyAgentDecision, {
        checkpointMode: args.checkpointMode,
        decision: result.object,
        decisionRunId: args.decisionRunId,
        effectiveContent: result.object.kind === "create"
          ? result.object.brief
          : effectiveBrief.content,
        currentReferenceMentions: context.userMessage.referenceMentions,
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
        decisionRunId: args.decisionRunId,
        errorMessage: agentDecisionErrorMessage(error),
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
    const decisionRunId = crypto.randomUUID();
    await ctx.db.patch(thread._id, {
      checkpointMode,
      decisionRunId,
      lastPlanSignature: undefined,
      status: "planning",
      title: thread.title === "New Chat" ? threadTitleFromMessage(content) : thread.title,
      turnDecisionCount: 0,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.create.agent.decideAgentTurn, {
      checkpointMode,
      decisionRunId,
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

    if (checkpoint.label === continueWorkingCheckpointLabel) {
      await ctx.db.patch(thread._id, {
        lastPlanSignature: undefined,
        turnDecisionCount: 0,
        updatedAt: now,
      });
      const updatedThread = await ctx.db.get(thread._id);
      if (!updatedThread) throw new Error("Create thread not found");
      return await executeRunnableQueuedTools(ctx, updatedThread);
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
        if (shouldAppendAsyncCompletionToolResult(toolCall, readySource)) {
          const artifacts = await artifactsForCompletedAsyncTool(ctx, thread, toolCall, readySource);
          await appendMessage(ctx, thread, {
            role: "agent",
            content: completionMessageForToolResult(toolCall, artifacts),
            kind: "tool_result",
            ...(artifacts.length ? { artifactIds: artifacts.map((artifact) => artifact._id) } : {}),
          });
          const costUsd = "costUsd" in readySource && typeof readySource.costUsd === "number"
            ? readySource.costUsd
            : undefined;
          if (artifacts.length || costUsd !== undefined) {
            await ctx.db.patch(toolCall._id, {
              ...(artifacts.length ? { artifactIds: artifacts.map((artifact) => artifact._id) } : {}),
              ...(costUsd !== undefined ? { costUsd } : {}),
              updatedAt: Date.now(),
            });
          }
        }
        if (
          !remainingQueued.length &&
          toolCall.toolName === "slideshow.render" &&
          "contentFormat" in readySource &&
          readySource.contentFormat === "slideshow"
        ) {
          await appendMessage(ctx, thread, {
            role: "agent",
            content: await slideshowReadyMessageForRequest(ctx, thread, readySource),
            kind: "chat",
          });
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
