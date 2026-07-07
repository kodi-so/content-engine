import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import {
  videoAnalysisStatusValidator,
} from "../validators";
import {
  analysisSummary,
  analysisTitle,
  analysisTranscript,
  analyzeRemoteUrlSource,
  analyzeUploadedSource,
  analyzeYoutubeUrl,
} from "./videoAnalysisModel";
import type { VideoAnalysisJob } from "./videoAnalysisModel";

function sourceHostForLog(sourceUrl?: string) {
  if (!sourceUrl) return undefined;
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "invalid-url";
  }
}

export const getForExecution = internalQuery({
  args: { jobId: v.id("videoAnalysisJobs") },
  handler: async (ctx, args) => await ctx.db.get(args.jobId),
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
      console.info("[analyze.videoAnalysis] execute_job_start", {
        jobId: args.jobId,
        sourceType: job.sourceType,
        sourcePlatform: job.sourcePlatform,
        sourceHost: sourceHostForLog(job.sourceUrl),
        hasStorageUrl: Boolean(job.storageUrl),
        mimeType: job.mimeType,
        byteLength: job.byteLength,
        mode: job.mode,
        model: job.model,
      });
      const analysis = job.sourceType === "upload"
        ? await analyzeUploadedSource(job, job.storageUrl ?? "")
        : job.sourcePlatform === "youtube"
          ? await analyzeYoutubeUrl(job)
          : await analyzeRemoteUrlSource(job);
      const fallbackTitle = job.fileName ?? job.sourceUrl ?? "Video analysis";
      console.info("[analyze.videoAnalysis] execute_job_complete", {
        jobId: args.jobId,
        title: analysisTitle(analysis.result, fallbackTitle),
        hasTranscript: Boolean(analysisTranscript(analysis.result)),
      });

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
      console.error("[analyze.videoAnalysis] execute_job_failed", {
        jobId: args.jobId,
        sourceType: job.sourceType,
        sourcePlatform: job.sourcePlatform,
        sourceHost: sourceHostForLog(job.sourceUrl),
        error: error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : { message: String(error) },
      });
      await ctx.runMutation(internal.analyze.videoAnalysis.patchJob, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Video analysis failed",
        completedAt: Date.now(),
      });
    }
  },
});
