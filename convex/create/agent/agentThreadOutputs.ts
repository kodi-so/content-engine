import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { isRecord } from "../references/referenceResolution";
import {
  analysisJobIdFromToolOutput,
  contentRequestIdFromToolOutput,
  distributionPlanIdFromToolOutput,
  outputId,
  studioRenderRequestIdFromToolOutput,
  videoProjectIdFromToolOutput,
} from "../execution/toolExecutionShared";

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

export async function listThreadOutputsForThread(
  ctx: QueryCtx,
  thread: Doc<"createThreads">
) {
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
}
