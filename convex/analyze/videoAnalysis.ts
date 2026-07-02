import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { ensureCurrentUser, requireBetaAccess } from "../auth/users";
import { publicUrlForKey } from "../storage/r2";
import {
  videoAnalysisModeValidator,
  videoAnalysisSourcePlatformValidator,
  videoAnalysisStatusValidator,
} from "../validators";
import {
  requireWorkspaceMember,
  resolveWritableWorkspace,
} from "../workspaces/workspaces";
import {
  DEFAULT_ANALYSIS_MODEL,
  GEMINI_PROVIDER,
  MAX_UPLOAD_BYTES,
  analysisSummary,
  analysisTitle,
  analysisTranscript,
  analyzeRemoteUrlSource,
  analyzeUploadedSource,
  analyzeYoutubeUrl,
  cleanOptionalText,
  geminiGenerateContent,
  sourcePlatformForUrl,
  type VideoAnalysisJob,
} from "./videoAnalysisModel";

function currentUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

async function hasJobAccess(
  ctx: QueryCtx | MutationCtx,
  job: VideoAnalysisJob,
  userId: string
) {
  if (job.workspaceId) {
    await requireWorkspaceMember(ctx, job.workspaceId, userId);
    return true;
  }

  return job.userId === userId;
}

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const userId = currentUserId(identity);

    if (args.workspaceId) {
      await requireWorkspaceMember(ctx, args.workspaceId, userId);
      return await ctx.db
        .query("videoAnalysisJobs")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .take(30);
    }

    return await ctx.db
      .query("videoAnalysisJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
  },
});

export const get = query({
  args: { id: v.id("videoAnalysisJobs") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const userId = currentUserId(identity);
    const job = await ctx.db.get(args.id);
    if (!job || !(await hasJobAccess(ctx, job, userId))) return null;
    return job;
  },
});

export const listQuestions = query({
  args: { jobId: v.id("videoAnalysisJobs") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const userId = currentUserId(identity);
    const job = await ctx.db.get(args.jobId);
    if (!job || !(await hasJobAccess(ctx, job, userId))) return [];

    return await ctx.db
      .query("videoAnalysisQuestions")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});

export const createFromUrl = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    url: v.string(),
    mode: v.optional(videoAnalysisModeValidator),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    const url = args.url.trim();
    if (!url) throw new Error("Video URL is required");
    const platform = sourcePlatformForUrl(url);
    const workspace = args.workspaceId
      ? await resolveWritableWorkspace(ctx, userId, args.workspaceId)
      : defaultWorkspace;
    if (!workspace) throw new Error("Workspace not found");

    const now = Date.now();
    const jobId = await ctx.db.insert("videoAnalysisJobs", {
      userId,
      workspaceId: workspace._id,
      sourceType: "url",
      sourcePlatform: platform,
      sourceUrl: url,
      provider: GEMINI_PROVIDER,
      model: DEFAULT_ANALYSIS_MODEL,
      mode: args.mode ?? "inspiration",
      customPrompt: cleanOptionalText(args.customPrompt),
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.analyze.videoAnalysis.executeJob, { jobId });
    return jobId;
  },
});

export const createFromUpload = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    storageKey: v.string(),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    byteLength: v.optional(v.number()),
    mode: v.optional(videoAnalysisModeValidator),
    customPrompt: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourcePlatform: v.optional(videoAnalysisSourcePlatformValidator),
  },
  handler: async (ctx, args) => {
    const { userId, defaultWorkspace } = await ensureCurrentUser(ctx);
    if (args.byteLength && args.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error("Upload a clip under 100 MB for analysis");
    }
    const workspace = args.workspaceId
      ? await resolveWritableWorkspace(ctx, userId, args.workspaceId)
      : defaultWorkspace;
    if (!workspace) throw new Error("Workspace not found");

    const storageUrl = publicUrlForKey(args.storageKey);

    const now = Date.now();
    const jobId = await ctx.db.insert("videoAnalysisJobs", {
      userId,
      workspaceId: workspace._id,
      sourceType: "upload",
      sourcePlatform: args.sourcePlatform ?? "unknown",
      sourceUrl: cleanOptionalText(args.sourceUrl),
      storageId: args.storageKey,
      storageUrl,
      fileName: cleanOptionalText(args.fileName),
      mimeType: cleanOptionalText(args.mimeType),
      byteLength: args.byteLength,
      provider: GEMINI_PROVIDER,
      model: DEFAULT_ANALYSIS_MODEL,
      mode: args.mode ?? "inspiration",
      customPrompt: cleanOptionalText(args.customPrompt),
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.analyze.videoAnalysis.executeJob, { jobId });
    return jobId;
  },
});

export const saveAsInspiration = mutation({
  args: { id: v.id("videoAnalysisJobs") },
  handler: async (ctx, args) => {
    const identity = await requireBetaAccess(ctx);
    const userId = currentUserId(identity);
    const job = await ctx.db.get(args.id);
    if (!job || !(await hasJobAccess(ctx, job, userId))) {
      throw new Error("Analysis not found");
    }

    await ctx.db.patch(args.id, {
      savedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const getForExecution = internalQuery({
  args: { jobId: v.id("videoAnalysisJobs") },
  handler: async (ctx, args) => await ctx.db.get(args.jobId),
});

export const getAccessibleForAction = internalQuery({
  args: {
    jobId: v.id("videoAnalysisJobs"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !(await hasJobAccess(ctx, job, args.userId))) return null;
    return job;
  },
});

export const patchJob = internalMutation({
  args: {
    jobId: v.id("videoAnalysisJobs"),
    status: v.optional(videoAnalysisStatusValidator),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    transcript: v.optional(v.string()),
    result: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Partial<VideoAnalysisJob> = { updatedAt: Date.now() };
    if (args.status) patch.status = args.status;
    if (args.title !== undefined) patch.title = args.title;
    if (args.summary !== undefined) patch.summary = args.summary;
    if (args.transcript !== undefined) patch.transcript = args.transcript;
    if (args.result !== undefined) patch.result = args.result;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    if (args.startedAt !== undefined) patch.startedAt = args.startedAt;
    if (args.completedAt !== undefined) patch.completedAt = args.completedAt;
    await ctx.db.patch(args.jobId, patch);
    if (args.status === "completed" || args.status === "failed") {
      await ctx.scheduler.runAfter(0, internal.create.agent.continueAfterAsyncResult, {
        analysisJobId: args.jobId,
      });
    }
  },
});

export const executeJob = internalAction({
  args: { jobId: v.id("videoAnalysisJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.analyze.videoAnalysis.getForExecution, {
      jobId: args.jobId,
    });
    if (!job) return;

    await ctx.runMutation(internal.analyze.videoAnalysis.patchJob, {
      jobId: args.jobId,
      status: "running",
      startedAt: Date.now(),
      errorMessage: undefined,
    });

    try {
      const analysis = job.sourceType === "upload"
        ? await analyzeUploadedSource(job, job.storageUrl ?? "")
        : job.sourcePlatform === "youtube"
          ? await analyzeYoutubeUrl(job)
          : await analyzeRemoteUrlSource(job);
      const fallbackTitle = job.fileName ?? job.sourceUrl ?? "Video analysis";

      await ctx.runMutation(internal.analyze.videoAnalysis.patchJob, {
        jobId: args.jobId,
        status: "completed",
        title: analysisTitle(analysis.result, fallbackTitle),
        summary: analysisSummary(analysis.result),
        transcript: analysisTranscript(analysis.result),
        result: {
          ...analysis.result,
          rawProviderResponse: analysis.raw,
        },
        completedAt: Date.now(),
      });
    } catch (error) {
      await ctx.runMutation(internal.analyze.videoAnalysis.patchJob, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Video analysis failed",
        completedAt: Date.now(),
      });
    }
  },
});

export const createQuestion = internalMutation({
  args: {
    jobId: v.id("videoAnalysisJobs"),
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("videoAnalysisQuestions", {
      userId: args.userId,
      workspaceId: args.workspaceId,
      jobId: args.jobId,
      question: args.question,
      status: "running",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const patchQuestion = internalMutation({
  args: {
    questionId: v.id("videoAnalysisQuestions"),
    status: videoAnalysisStatusValidator,
    answer: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.questionId, {
      status: args.status,
      answer: args.answer,
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const askQuestion = action({
  args: {
    jobId: v.id("videoAnalysisJobs"),
    question: v.string(),
  },
  handler: async (ctx, args): Promise<{ questionId: Id<"videoAnalysisQuestions">; answer: string }> => {
    const identity = await requireBetaAccessForAction(ctx);
    const userId = identity.subject;
    const question = args.question.trim();
    if (!question) throw new Error("Question is required");

    const job: VideoAnalysisJob | null = await ctx.runQuery(internal.analyze.videoAnalysis.getAccessibleForAction, {
      jobId: args.jobId,
      userId,
    });
    if (!job) {
      throw new Error("Analysis not found");
    }
    if (job.status !== "completed") {
      throw new Error("Wait for the analysis to finish before asking questions");
    }

    const questionId: Id<"videoAnalysisQuestions"> = await ctx.runMutation(
      internal.analyze.videoAnalysis.createQuestion,
      {
        jobId: args.jobId,
        userId,
        workspaceId: job.workspaceId,
        question,
      }
    );

    try {
      const context = JSON.stringify(job.result ?? {}, null, 2).slice(0, 120_000);
      const response = await geminiGenerateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "Answer the user's question using this saved video analysis context.",
                  "Be specific. If the context does not contain enough evidence, say what is missing.",
                  "",
                  `Question: ${question}`,
                  "",
                  "Analysis context:",
                  context,
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 1600,
        },
        model: job.model,
      });

      await ctx.runMutation(internal.analyze.videoAnalysis.patchQuestion, {
        questionId,
        status: "completed",
        answer: response.text,
      });

      return { questionId, answer: response.text };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Question failed";
      await ctx.runMutation(internal.analyze.videoAnalysis.patchQuestion, {
        questionId,
        status: "failed",
        errorMessage,
      });
      throw new Error(errorMessage);
    }
  },
});
