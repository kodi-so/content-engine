import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
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
import type { CreateToolName } from "./tools";
import {
  buildPlannedToolInput,
  buildEffectiveBrief,
  normalizePlannedToolInputForToolCall,
  threadTitleFromMessage,
  toolDescriptorMap,
  urlPattern,
  type CreateReferenceMention,
  type InferredOutputType,
} from "./planning";
import {
  executeRunnableQueuedTools,
  prepareArtifactExportForThread,
  prepareDistributionDraftForThread,
  saveReadyOutputsForThread,
} from "./toolExecution";
import { createWorkflowDraftFromThread } from "./workflowExport";

type WorkspaceOwnedRecord = {
  userId: string;
  workspaceId?: Id<"workspaces">;
};

type CreateDecisionIntent = {
  brief: string;
  kind: "create";
  outputType: Exclude<InferredOutputType, "unknown">;
  planSteps: string[];
  productionPlan?: Record<string, unknown>;
  summary: string;
  toolCalls: CreatePlannedToolCall[];
};

type CreatePlannedToolCall = {
  input?: Record<string, unknown>;
  planStep?: string;
  prompt?: string;
  toolName: CreateToolName;
};

type AgentDecision =
  | {
      kind: "chat";
      response: string;
    }
  | {
      kind: "clarify";
      response: string;
    }
  | CreateDecisionIntent;

const createAgentProvider = "openrouter";
const createAgentModel =
  process.env.CONTENT_ENGINE_CREATE_AGENT_MODEL?.trim() ||
  process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() ||
  "openai/gpt-4.1";

const outputTypes = ["image", "video", "audio", "slideshow", "analysis", "text"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function hasRecordAccess(
  ctx: MutationCtx | QueryCtx,
  record: WorkspaceOwnedRecord,
  userId: string
) {
  if (record.workspaceId) {
    await requireWorkspaceMember(ctx, record.workspaceId, userId);
    return true;
  }

  return record.userId === userId;
}

async function requireThreadAccess(
  ctx: MutationCtx | QueryCtx,
  threadId: Id<"createThreads">,
  userId: string
) {
  const thread = await ctx.db.get(threadId);
  if (!thread || !(await hasRecordAccess(ctx, thread, userId))) {
    throw new Error("Create thread not found");
  }

  return thread;
}

async function findThreadForReadAccess(
  ctx: QueryCtx,
  threadId: Id<"createThreads">,
  userId: string
) {
  const thread = await ctx.db.get(threadId);
  if (!thread) return null;
  if (!(await hasRecordAccess(ctx, thread, userId))) {
    throw new Error("Create thread not found");
  }

  return thread;
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function contentRequestIdFromToolOutput(output: unknown): Id<"contentRequests"> | null {
  if (!isRecord(output) || typeof output.contentRequestId !== "string") return null;
  return output.contentRequestId as Id<"contentRequests">;
}

function analysisJobIdFromToolOutput(output: unknown): Id<"videoAnalysisJobs"> | null {
  if (!isRecord(output) || typeof output.analysisJobId !== "string") return null;
  return output.analysisJobId as Id<"videoAnalysisJobs">;
}

function videoProjectIdFromToolOutput(output: unknown): Id<"videoProjects"> | null {
  if (!isRecord(output) || typeof output.projectId !== "string") return null;
  return output.projectId as Id<"videoProjects">;
}

function distributionPlanIdFromToolOutput(output: unknown): Id<"distributionPlans"> | null {
  if (!isRecord(output) || typeof output.distributionPlanId !== "string") return null;
  return output.distributionPlanId as Id<"distributionPlans">;
}

function studioRenderRequestIdFromToolOutput(output: unknown): Id<"studioRenderRequests"> | null {
  if (!isRecord(output) || typeof output.studioRenderRequestId !== "string") return null;
  return output.studioRenderRequestId as Id<"studioRenderRequests">;
}

function outputId(output: unknown, key: string) {
  if (!isRecord(output)) return undefined;
  const value = output[key];
  return typeof value === "string" ? value : undefined;
}

function createProductionPlanningPolicy() {
  return [
    "Before selecting tools for a create request, make a concise production plan. Think in terms of: final artifact, source/reference roles, atomic assets, shots/clips/scenes, assembly, render/export.",
    "Return that plan as productionPlan in the JSON. Keep it brief and structured; do not include hidden reasoning or long prose.",
    "Map each semantic production unit to the smallest appropriate tool call. Image tools create individual images/assets. Video tools create one coherent shot or clip. Studio tools sequence, stitch, overlay, transition, and render multi-part videos.",
    "If the user asks for multiple distinct assets, scenes, options, states, products, moments, or story beats, create separate toolCalls with distinct prompts instead of one call with count or one broad prompt.",
    "If multiple references represent different states or moments in the final output, do not pass them all as generic references to a single generation. Use them as separate source units, generate separate clips/assets as needed, then assemble.",
    "If a final video requires the same generated person, character, product, room, or object across multiple states/moments and the user has not supplied concrete visual references for those states, first create image reference stills for each state/moment. Then animate those stills with image-to-video clips.",
    "Do not use text-to-video as the first production step for newly imagined continuity-sensitive subjects. Use text-to-video only for standalone shots where identity/object continuity across generated outputs does not matter, or when the user explicitly asks for prompt-only video.",
    "Use one video generation call only when the desired output is one coherent shot, a deliberate blend/morph/interpolation, or the user explicitly asks for a single model-generated transition.",
    "Video generation prompts should describe the action, motion, performance, camera movement, and atmosphere of that exact shot or clip. They should not summarize the whole final edited video.",
    "Each tool call prompt must be local to that tool call's actual inputs. Do not say \"same person\", \"previous image\", \"six months later\", or similar cross-step references inside a generation prompt unless that tool call also receives the relevant reference asset. If it receives a reference image, describe it as the provided/reference image and only include the motion/action needed for that clip.",
    "Image edit/reference-image prompts should be instructions grounded in the actual provided image: say what should change and what important identity, composition, setting, lighting, camera quality, and style details should be preserved. Do not write them as free-floating scene descriptions.",
    "For multi-state continuity, use prior image outputs deliberately: create the first state image, create later state images with input.usePriorImageOutputs=true when identity continuity matters, then create video clips with input.priorImageOutputIndex pointing at the exact still for that clip.",
    "For multi-clip final videos, call studio.compose after generating or selecting the clips. If the user asks to create a finished video rather than only a Studio draft, call studio.render after studio.compose.",
    "When a generated clip should use one specific prior image, set input.priorImageOutputIndex to the zero-based prior image index for that clip. Use input.usePriorImageOutputs=true only when all prior images should act as continuity/style references.",
    "For image-to-video, default to Kling through fal unless the user explicitly asks for another video model. Use model=\"fal-ai/kling-video/v3/pro/image-to-video\" when animating image references and model=\"fal-ai/kling-video/v3/pro/text-to-video\" for prompt-only video.",
    "When the requested artifact includes text, decide semantically where that text belongs: use Studio composition for video overlays/captions/lower thirds, slideshow tools for slide text, and image generation only when the artifact itself is a text-bearing graphic such as a poster, flyer, infographic, meme, title card, thumbnail, ad graphic, packaging, or specifically requested visible words.",
    "Do not add text, labels, captions, or UI-like annotations to ordinary photo/image assets or video clips unless the user's requested artifact calls for rendered text.",
  ];
}

function createAgentSystemPrompt() {
  const tools = [...toolDescriptorMap().values()].map((tool) => ({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    category: tool.category,
    emitsArtifacts: tool.artifactBehavior.emitsArtifacts,
  }));

  return [
    "You are the Create agent inside Content Engine.",
    "You are a natural conversational chatbot with access to creation tools. Respond like a helpful creative collaborator, not like a rigid form or workflow router.",
    "Understand the user's intent semantically from the whole conversation.",
    "If the user is just greeting you, brainstorming, asking a question, or clarifying an idea, choose kind=\"chat\" and answer normally.",
    "If the user wants to create, analyze, edit, compose, render, save, export, publish, or convert something into a workflow, choose kind=\"create\" and select the necessary tools.",
    "If the user appears to want creation but the desired output or source is genuinely ambiguous, choose kind=\"clarify\" and ask one concise question.",
    "Do not ask for brand/platform unless the user makes that relevant.",
    "In Debug Mode the runtime will pause after the plan before spending generation or render resources.",
    "For create decisions, write planSteps as plain-English user-visible actions. Do not expose internal tool labels. Example: \"Create an image of an apple.\"",
    "For create decisions, toolCalls is required. It is an ordered list of exact tool invocations you want the runtime to make.",
    ...createProductionPlanningPolicy(),
    "You may call the same tool multiple times.",
    "If a later image/video must preserve the identity, setting, pose, or style of an earlier generated image, set input.usePriorImageOutputs=true on that later toolCall and write the prompt as an edit/continuity instruction that uses the prior image as reference.",
    "Only use count > 1 when the user wants variations/options of the same prompt, not separate semantic outputs.",
    "Available tools:",
    JSON.stringify(tools),
    "Return only JSON with this shape:",
    JSON.stringify({
      kind: "chat | clarify | create",
      response: "Natural message to show the user. For create, summarize what you will do in one sentence.",
      outputType: "image | video | audio | slideshow | analysis | text; required only for create",
      toolCalls: [
        {
          tool: "tool.name value; required for create",
          prompt: "Specific prompt or instructions for this exact tool call",
          planStep: "Plain-English user-visible step for this exact call",
          input: "Optional object with tool-specific fields like aspectRatio, durationSeconds, count, provider, model, or usePriorImageOutputs",
        },
      ],
      planSteps: ["Plain-English user-visible steps; required only for create"],
      productionPlan: {
        finalArtifact: "The final thing the user wants.",
        sourceRoles: ["How provided or prior references should be used."],
        units: ["Atomic assets, shots, clips, scenes, or sections to produce."],
        assembly: "How generated units should be combined, if needed.",
        render: "Whether a finished render/export is needed.",
      },
      brief: "Concise effective brief/instructions for the selected tools; required only for create",
    }),
  ].join("\n");
}

function messageForModel(message: Doc<"createMessages">): ModelMessage {
  return {
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
  };
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (isRecord(parsed)) return parsed;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (isRecord(parsed)) return parsed;
    }
  }

  throw new Error("Create agent returned an invalid decision.");
}

function stringFromDecision(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function outputTypeFromDecision(value: unknown): Exclude<InferredOutputType, "unknown"> | null {
  if (typeof value !== "string") return null;
  return outputTypes.includes(value as (typeof outputTypes)[number])
    ? value as Exclude<InferredOutputType, "unknown">
    : null;
}

function inputFromDecision(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function productionPlanFromDecision(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function formatStoppedDuration(ms: number) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function toolCallToolNameFromDecision(value: unknown): CreateToolName | null {
  if (typeof value !== "string") return null;
  const descriptors = toolDescriptorMap();
  return descriptors.has(value as CreateToolName) ? value as CreateToolName : null;
}

function toolCallsFromDecision(
  value: unknown,
  fallbackBrief: string
): CreatePlannedToolCall[] {
  if (!Array.isArray(value)) return [];

  const calls: CreatePlannedToolCall[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const toolName = toolCallToolNameFromDecision(item.tool ?? item.toolName ?? item.name);
    if (!toolName) continue;

    const prompt = stringFromDecision(item.prompt ?? item.instructions ?? item.brief);
    const planStep = stringFromDecision(item.planStep ?? item.step ?? item.label);
    calls.push({
      toolName,
      ...(prompt ? { prompt } : {}),
      ...(planStep ? { planStep } : {}),
      ...(inputFromDecision(item.input ?? item.arguments) ? { input: inputFromDecision(item.input ?? item.arguments) } : {}),
    });
  }

  return calls.slice(0, 12).map((call) => ({
    ...call,
    prompt: call.prompt || fallbackBrief,
  }));
}

function planStepsFromDecision(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function normalizeAgentDecision(text: string): AgentDecision {
  const parsed = parseJsonObject(text);
  const kind = stringFromDecision(parsed.kind).toLowerCase();
  const response = stringFromDecision(parsed.response);

  if (kind === "chat") {
    return {
      kind: "chat",
      response: response || "I am here. What would you like to make or think through?",
    };
  }

  if (kind === "clarify") {
    return {
      kind: "clarify",
      response: response || "What output should I create: video, slideshow, image, audio, analysis, or text?",
    };
  }

  if (kind === "create") {
    const outputType = outputTypeFromDecision(parsed.outputType);
    const brief = stringFromDecision(parsed.brief);
    const toolCalls = toolCallsFromDecision(parsed.toolCalls, brief);
    const planSteps = planStepsFromDecision(parsed.planSteps);
    const productionPlan = productionPlanFromDecision(parsed.productionPlan);
    if (!outputType || !toolCalls.length || !brief) {
      return {
        kind: "clarify",
        response:
          "I can help create that, but I need a valid tool plan before I start.",
      };
    }

    return {
      brief,
      kind: "create",
      outputType,
      planSteps,
      ...(productionPlan ? { productionPlan } : {}),
      summary: response || `I will treat this as a ${outputType} request and choose the right creation tools.`,
      toolCalls,
    };
  }

  return {
    kind: "chat",
    response: response || "I am here. What would you like to make or think through?",
  };
}

function planMessageForCreateDecision(intent: CreateDecisionIntent, usedConversationContext: boolean) {
  const descriptors = toolDescriptorMap();
  const steps = intent.planSteps.length
    ? intent.planSteps
    : intent.toolCalls.map((toolCall) => {
        if (toolCall.planStep) return toolCall.planStep;
        const tool = descriptors.get(toolCall.toolName);
        return toolCall.prompt || tool?.label || toolCall.toolName;
      });
  const formattedSteps = steps.length === 1
    ? steps
    : steps.map((step, index) => `${index + 1}. ${step}`);
  if (steps.length <= 1) {
    return [
      ...(usedConversationContext ? ["I will use the recent conversation as the brief for this creation."] : []),
      intent.summary,
    ].join("\n");
  }

  return [
    ...(usedConversationContext ? ["I will use the recent conversation as the brief for this creation."] : []),
    intent.summary,
    "Plan:",
    ...formattedSteps,
  ].join("\n");
}

function createThreadScopeMatchesRecord(
  thread: Doc<"createThreads">,
  record: { userId: string; workspaceId?: Id<"workspaces"> }
) {
  return thread.workspaceId
    ? record.workspaceId === thread.workspaceId
    : record.userId === thread.userId;
}

async function toolCallsForAsyncOutput(
  ctx: MutationCtx,
  source: Doc<"contentRequests"> | Doc<"videoAnalysisJobs"> | Doc<"studioRenderRequests">,
  matchesOutput: (output: unknown) => boolean
) {
  const candidates = source.workspaceId
    ? await ctx.db
        .query("createToolCalls")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", source.workspaceId))
        .collect()
    : await ctx.db
        .query("createToolCalls")
        .withIndex("by_user", (q) => q.eq("userId", source.userId))
        .collect();

  return candidates.filter((toolCall) =>
    (toolCall.status === "succeeded" || toolCall.status === "blocked") &&
    matchesOutput(toolCall.output)
  );
}

async function asyncFailureMessageForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  toolCall: Doc<"createToolCalls">
) {
  const requestId = contentRequestIdFromToolOutput(toolCall.output);
  if (requestId) {
    const request = await ctx.db.get(requestId);
    if (
      request &&
      (thread.workspaceId ? request.workspaceId === thread.workspaceId : request.userId === thread.userId) &&
      (request.status === "failed" || request.status === "discarded")
    ) {
      return request.errorMessage ?? "The queued generation request failed.";
    }
  }

  const jobId = analysisJobIdFromToolOutput(toolCall.output);
  if (jobId) {
    const job = await ctx.db.get(jobId);
    if (
      job &&
      (thread.workspaceId ? job.workspaceId === thread.workspaceId : job.userId === thread.userId) &&
      job.status === "failed"
    ) {
      return job.errorMessage ?? "The queued source analysis failed.";
    }
  }

  const renderRequestId = studioRenderRequestIdFromToolOutput(toolCall.output);
  if (renderRequestId) {
    const renderRequest = await ctx.db.get(renderRequestId);
    if (
      renderRequest &&
      (thread.workspaceId
        ? renderRequest.workspaceId === thread.workspaceId
        : renderRequest.userId === thread.userId) &&
      (renderRequest.status === "failed" || renderRequest.status === "canceled")
    ) {
      return renderRequest.errorMessage ?? "The Studio render request failed.";
    }
  }

  return null;
}

function referenceResultsFromToolOutput(output: unknown) {
  if (!isRecord(output) || !Array.isArray(output.references)) return [];
  return output.references.filter(isRecord).flatMap((reference) => {
    const id = typeof reference.id === "string" ? reference.id : undefined;
    const storageUrl = typeof reference.storageUrl === "string" ? reference.storageUrl : undefined;
    const title = typeof reference.title === "string" ? reference.title : undefined;
    const mediaKind = typeof reference.mediaKind === "string" ? reference.mediaKind : undefined;
    if (!id || !storageUrl || !title || !mediaKind) return [];

    return [{
      id,
      source: typeof reference.source === "string" ? reference.source : undefined,
      sourceId: typeof reference.sourceId === "string" ? reference.sourceId : undefined,
      title,
      mediaKind,
      storageUrl,
      mimeType: typeof reference.mimeType === "string" ? reference.mimeType : undefined,
      prompt: typeof reference.prompt === "string" ? reference.prompt : undefined,
      provider: typeof reference.provider === "string" ? reference.provider : undefined,
      model: typeof reference.model === "string" ? reference.model : undefined,
      createdAt: typeof reference.createdAt === "number" ? reference.createdAt : undefined,
    }];
  });
}

async function createThreadForTurn(
  ctx: MutationCtx,
  args: {
    checkpointMode: "debug" | "auto";
    initialMessage: string;
    referenceMentions?: CreateReferenceMention[];
    title?: string;
    userId: string;
    workspaceId?: Id<"workspaces">;
  }
) {
  const now = Date.now();
  const threadId = await ctx.db.insert("createThreads", {
    userId: args.userId,
    workspaceId: args.workspaceId,
    title: normalizeOptionalText(args.title) ?? threadTitleFromMessage(args.initialMessage),
    status: "idle",
    checkpointMode: args.checkpointMode,
    createdAt: now,
    updatedAt: now,
  });

  return await requireThreadAccess(ctx, threadId, args.userId);
}

async function appendMessage(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  args: {
    artifactIds?: Id<"artifacts">[];
    content: string;
    kind?: "chat" | "clarification" | "plan" | "status" | "tool_result" | "final_review";
    referenceMentions?: CreateReferenceMention[];
    role: "user" | "agent" | "system";
  }
) {
  const now = Date.now();
  return await ctx.db.insert("createMessages", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    createThreadId: thread._id,
    role: args.role,
    content: args.content,
    kind: args.kind,
    referenceMentions: args.referenceMentions,
    artifactIds: args.artifactIds,
    createdAt: now,
  });
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

    const toolCalls = await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .collect();
    const contentRequestIds = [
      ...new Set(
        toolCalls.flatMap((toolCall) => {
          const requestId = contentRequestIdFromToolOutput(toolCall.output);
          return requestId ? [requestId] : [];
        })
      ),
    ];
    const analysisJobIds = [
      ...new Set(
        toolCalls.flatMap((toolCall) => {
          const jobId = analysisJobIdFromToolOutput(toolCall.output);
          return jobId ? [jobId] : [];
        })
      ),
    ];
    const videoProjectIds = [
      ...new Set(
        toolCalls.flatMap((toolCall) => {
          const projectId = videoProjectIdFromToolOutput(toolCall.output);
          return projectId ? [projectId] : [];
        })
      ),
    ];
    const distributionPlanIds = [
      ...new Set(
        toolCalls.flatMap((toolCall) => {
          const distributionPlanId = distributionPlanIdFromToolOutput(toolCall.output);
          return distributionPlanId ? [distributionPlanId] : [];
        })
      ),
    ];
    const studioRenderRequestIds = [
      ...new Set(
        toolCalls.flatMap((toolCall) => {
          const requestId = studioRenderRequestIdFromToolOutput(toolCall.output);
          return requestId ? [requestId] : [];
        })
      ),
    ];
    const directArtifactIds = [
      ...new Set(
        toolCalls.flatMap((toolCall) => {
          const explicitArtifactIds = toolCall.artifactIds ?? [];
          const outputArtifactId = outputId(toolCall.output, "artifactId");
          return [
            ...explicitArtifactIds,
            ...(outputArtifactId ? [outputArtifactId as Id<"artifacts">] : []),
          ].map(String);
        })
      ),
    ];
    const referenceResults = toolCalls.flatMap((toolCall) =>
      toolCall.toolName === "references.list"
        ? referenceResultsFromToolOutput(toolCall.output)
        : []
    );

    const contentRequests = [];
    for (const requestId of contentRequestIds) {
      const request = await ctx.db.get(requestId);
      if (!request) continue;
      if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
        continue;
      }
      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_content_request", (q) => q.eq("contentRequestId", requestId))
        .collect();
      const slideshows = await ctx.db
        .query("slideshows")
        .withIndex("by_content_request", (q) => q.eq("contentRequestId", requestId))
        .collect();
      contentRequests.push({ request, artifacts, slideshows });
    }

    const analysisJobs = [];
    for (const jobId of analysisJobIds) {
      const job = await ctx.db.get(jobId);
      if (!job) continue;
      if (thread.workspaceId ? job.workspaceId !== thread.workspaceId : job.userId !== thread.userId) {
        continue;
      }
      analysisJobs.push(job);
    }

    const videoProjects = [];
    for (const projectId of videoProjectIds) {
      const project = await ctx.db.get(projectId);
      if (!project || project.status === "archived") continue;
      if (thread.workspaceId ? project.workspaceId !== thread.workspaceId : project.userId !== thread.userId) {
        continue;
      }
      videoProjects.push(project);
    }

    const distributionPlans = [];
    for (const planId of distributionPlanIds) {
      const plan = await ctx.db.get(planId);
      if (!plan) continue;
      if (thread.workspaceId ? plan.workspaceId !== thread.workspaceId : plan.userId !== thread.userId) {
        continue;
      }
      distributionPlans.push(plan);
    }

    const studioRenderRequestsByThread = await ctx.db
      .query("studioRenderRequests")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .collect();
    const studioRenderRequests: Array<
      Doc<"studioRenderRequests"> & { outputArtifact?: Doc<"artifacts"> | null }
    > = [];
    const seenStudioRenderRequestIds = new Set(
      studioRenderRequestsByThread.map((request) => request._id)
    );
    for (const request of studioRenderRequestsByThread) {
      const outputArtifact = request.outputArtifactId
        ? await ctx.db.get(request.outputArtifactId)
        : null;
      studioRenderRequests.push({ ...request, outputArtifact });
    }
    for (const requestId of studioRenderRequestIds) {
      if (seenStudioRenderRequestIds.has(requestId)) continue;
      const request = await ctx.db.get(requestId);
      if (!request) continue;
      if (thread.workspaceId ? request.workspaceId !== thread.workspaceId : request.userId !== thread.userId) {
        continue;
      }
      const outputArtifact = request.outputArtifactId
        ? await ctx.db.get(request.outputArtifactId)
        : null;
      studioRenderRequests.push({ ...request, outputArtifact });
      seenStudioRenderRequestIds.add(request._id);
    }

    const directArtifacts = [];
    for (const artifactIdValue of directArtifactIds) {
      const artifactId = ctx.db.normalizeId("artifacts", artifactIdValue);
      if (!artifactId) continue;
      const artifact = await ctx.db.get(artifactId);
      if (!artifact) continue;
      if (thread.workspaceId ? artifact.workspaceId !== thread.workspaceId : artifact.userId !== thread.userId) {
        continue;
      }
      directArtifacts.push(artifact);
    }

    return {
      contentRequests,
      analysisJobs,
      directArtifacts,
      videoProjects,
      distributionPlans,
      studioRenderRequests,
      referenceResults,
    };
  },
});

async function recordPlannedTools(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  messageId: Id<"createMessages">,
  intent: CreateDecisionIntent,
  content: string,
  referenceMentions?: CreateReferenceMention[]
) {
  const descriptors = toolDescriptorMap();
  const now = Date.now();
  const siblingToolNames = intent.toolCalls.map((toolCall) => toolCall.toolName);

  for (const plannedCall of intent.toolCalls) {
    const tool = descriptors.get(plannedCall.toolName);
    const callContent = plannedCall.prompt || content;
    const inferredInput = buildPlannedToolInput({
      content: callContent,
      outputType: intent.outputType,
      referenceMentions,
      toolName: plannedCall.toolName,
    });
    const input = normalizePlannedToolInputForToolCall({
      input: {
        ...inferredInput,
        ...(plannedCall.input ?? {}),
        ...(plannedCall.prompt ? { prompt: plannedCall.prompt, brief: callContent } : {}),
      },
      planStep: plannedCall.planStep,
      prompt: plannedCall.prompt,
      siblingToolNames,
      toolName: plannedCall.toolName,
    });
    await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      messageId,
      toolName: plannedCall.toolName,
      status: "queued",
      label: plannedCall.planStep || tool?.label || plannedCall.toolName,
      input,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function supersedeOpenCheckpointsForNewTurn(ctx: MutationCtx, thread: Doc<"createThreads">) {
  const checkpoints = await ctx.db
    .query("createCheckpoints")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const openCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "open");
  if (!openCheckpoints.length) return;

  const now = Date.now();
  await Promise.all(
    openCheckpoints.map((checkpoint) =>
      ctx.db.patch(checkpoint._id, {
        status: "revised",
        response: "Superseded by a new user message.",
        updatedAt: now,
      })
    )
  );

  const queuedToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread_status", (q) =>
      q.eq("createThreadId", thread._id).eq("status", "queued")
    )
    .collect();
  await Promise.all(
    queuedToolCalls.map((toolCall) =>
      ctx.db.patch(toolCall._id, {
        status: "canceled",
        completedAt: now,
        updatedAt: now,
      })
    )
  );
}

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

    return {
      thread,
      userMessage,
      messages: messages
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-16),
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
    usedConversationContext: v.boolean(),
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
      content: planMessageForCreateDecision(decision, args.usedConversationContext),
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

    const nextStatus = args.checkpointMode === "debug" ? "waiting_for_user" : "planning";
    if (args.checkpointMode === "debug") {
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

    if (args.checkpointMode === "auto") {
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
    try {
      const context = await ctx.runQuery(internal.create.agent.agentTurnContext, {
        threadId: args.threadId,
        userMessageId: args.userMessageId,
      });
      if (!context) return;

      const previousUserMessages = context.messages.filter(
        (message) =>
          message.role === "user" &&
          message._id !== context.userMessage._id &&
          message.createdAt < context.userMessage.createdAt
      );
      const effectiveBrief = buildEffectiveBrief({
        content: context.userMessage.content,
        currentMentions: context.userMessage.referenceMentions,
        previousMessages: previousUserMessages,
        thread: context.thread,
      });

      const provider = getModelProvider(createAgentProvider);
      const modelMessages: ModelMessage[] = [
        { role: "system", content: createAgentSystemPrompt() },
        ...context.messages.map(messageForModel),
        {
          role: "user",
          content: [
            "Decide the next assistant action for the latest user message.",
            `Effective brief for creation, if relevant: ${effectiveBrief.content}`,
            `Use conversation context for creation: ${effectiveBrief.usedConversationContext ? "yes" : "no"}`,
          ].join("\n"),
        },
      ];

      const result = await provider.generateStructured<AgentDecision>({
        messages: modelMessages,
        model: createAgentModel,
        temperature: 0.2,
        maxTokens: 1400,
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
        usedConversationContext: effectiveBrief.usedConversationContext,
        userMessageId: args.userMessageId,
      });
    } catch (error) {
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
    const now = Date.now();
    const toolCalls = await ctx.db
      .query("createToolCalls")
      .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
      .collect();
    const activeToolCalls = toolCalls.filter((toolCall) =>
      toolCall.status === "queued" ||
      toolCall.status === "running" ||
      toolCall.status === "blocked"
    );
    const activeContentRequestIds = [
      ...new Set(
        toolCalls.flatMap((toolCall) => {
          const requestId = contentRequestIdFromToolOutput(toolCall.output);
          return requestId ? [requestId] : [];
        })
      ),
    ];
    const activeStudioRenderRequestIds = [
      ...new Set(
        toolCalls.flatMap((toolCall) => {
          const requestId = studioRenderRequestIdFromToolOutput(toolCall.output);
          return requestId ? [requestId] : [];
        })
      ),
    ];
    const activeContentRequests: Doc<"contentRequests">[] = [];
    for (const requestId of activeContentRequestIds) {
      const request = await ctx.db.get(requestId);
      if (
        request &&
        createThreadScopeMatchesRecord(thread, request) &&
        (
          request.status === "queued" ||
          request.status === "planning" ||
          request.status === "generating"
        )
      ) {
        activeContentRequests.push(request);
      }
    }
    const activeContentRequestIdSet = new Set(activeContentRequests.map((request) => String(request._id)));
    const stoppedToolCalls = [
      ...new Map(
        [
          ...activeToolCalls,
          ...toolCalls.filter((toolCall) => {
            if (toolCall.status !== "succeeded") return false;
            const requestId = contentRequestIdFromToolOutput(toolCall.output);
            return requestId ? activeContentRequestIdSet.has(String(requestId)) : false;
          }),
        ].map((toolCall) => [String(toolCall._id), toolCall])
      ).values(),
    ];
    const activeStudioRenderRequests: Doc<"studioRenderRequests">[] = [];
    for (const requestId of activeStudioRenderRequestIds) {
      const request = await ctx.db.get(requestId);
      if (
        request &&
        createThreadScopeMatchesRecord(thread, request) &&
        (
          request.status === "queued" ||
          request.status === "rendering" ||
          request.status === "blocked"
        )
      ) {
        activeStudioRenderRequests.push(request);
      }
    }

    if (
      !activeToolCalls.length &&
      !activeContentRequests.length &&
      !activeStudioRenderRequests.length &&
      (thread.status === "idle" || thread.status === "ready" || thread.status === "canceled")
    ) {
      return {
        canceledContentRequestCount: 0,
        canceledStudioRenderRequestCount: 0,
        canceledToolCallCount: 0,
        elapsedMs: 0,
      };
    }

    const startTimestamps = [
      ...stoppedToolCalls.flatMap((toolCall) => [
        toolCall.startedAt,
        toolCall.createdAt,
      ]),
      ...activeContentRequests.flatMap((request) => [
        request.startedAt,
        request.createdAt,
      ]),
      ...activeStudioRenderRequests.map((request) => request.createdAt),
      thread.updatedAt,
      thread.createdAt,
    ].filter((value): value is number => typeof value === "number");
    const elapsed = startTimestamps.length ? now - Math.min(...startTimestamps) : 0;

    await Promise.all([
      ...stoppedToolCalls.map((toolCall) =>
        ctx.db.patch(toolCall._id, {
          status: "canceled" as const,
          completedAt: now,
          updatedAt: now,
        })
      ),
      ...activeContentRequests.map((request) =>
        ctx.db.patch(request._id, {
          status: "discarded" as const,
          errorMessage: "Stopped by user.",
          completedAt: now,
          updatedAt: now,
        })
      ),
      ...activeStudioRenderRequests.map((request) =>
        ctx.db.patch(request._id, {
          status: "canceled" as const,
          errorMessage: "Stopped by user.",
          completedAt: now,
          updatedAt: now,
        })
      ),
    ]);

    await appendMessage(ctx, thread, {
      role: "agent",
      content: `You stopped after ${formatStoppedDuration(elapsed)}.`,
      kind: "status",
    });
    await ctx.db.patch(thread._id, {
      status: "idle",
      updatedAt: now,
    });

    return {
      canceledContentRequestCount: activeContentRequests.length,
      canceledStudioRenderRequestCount: activeStudioRenderRequests.length,
      canceledToolCallCount: stoppedToolCalls.length,
      elapsedMs: Math.max(0, elapsed),
    };
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
    const thread = await requireThreadAccess(ctx, args.threadId, userId);
    const result = await createWorkflowDraftFromThread(ctx, thread, {
      name: normalizeOptionalText(args.name),
    });
    const now = Date.now();

    await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      toolName: "workflow.createDraft",
      status: "succeeded",
      label: "Saved workflow draft",
      input: {
        name: args.name,
      },
      output: {
        workflowId: result.workflowId,
        convertedToolCount: result.convertedToolCount,
        unsupportedToolNames: result.unsupportedToolNames,
      },
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await appendMessage(ctx, thread, {
      role: "agent",
      content: result.unsupportedToolNames.length
        ? `Saved this conversation as a workflow draft. Some Studio steps were preserved as comments because they are not repeatable workflow nodes yet: ${result.unsupportedToolNames.join(", ")}.`
        : "Saved this conversation as a workflow draft.",
      kind: "tool_result",
    });
    await ctx.db.patch(thread._id, { updatedAt: now });

    return result;
  },
});
