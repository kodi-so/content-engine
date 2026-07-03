import { referenceBriefFromResult } from "../analyze/referenceBriefModel";
import type { AgentCreateArtifact, AgentCreateArtifactKind } from "./agentCreateTypes";

type ContentRequestOutput = {
  request: {
    _id: string;
    contentFormat: string;
    errorMessage?: string;
    prompt: string;
    status: string;
    summary?: string;
  };
  artifacts: Array<{
    _id: string;
    data?: unknown;
    model?: string;
    prompt?: string;
    storageUrl?: string;
    title?: string;
    type: string;
  }>;
  slideshows: Array<{
    _id: string;
    status: string;
    title: string;
  }>;
};

type ThreadOutputs = {
  analysisJobs?: Array<{
    _id: string;
    errorMessage?: string;
    result?: unknown;
    sourcePlatform?: string;
    sourceType?: string;
    status: string;
    summary?: string;
    title?: string;
  }>;
  contentRequests?: ContentRequestOutput[];
  directArtifacts?: Array<{
    _id: string;
    data?: unknown;
    model?: string;
    prompt?: string;
    storageUrl?: string;
    title?: string;
    type: string;
  }>;
  distributionPlans?: Array<{
    _id: string;
    artifactIds: string[];
    status: string;
  }>;
  referenceResults?: Array<{
    id: string;
    mediaKind?: string;
    prompt?: string;
    source?: string;
    storageUrl: string;
    title: string;
  }>;
  studioRenderRequests?: Array<{
    _id: string;
    errorMessage?: string;
    outputArtifact?: {
      _id: string;
      data?: unknown;
      model?: string;
      prompt?: string;
      storageUrl?: string;
      title?: string;
      type: string;
    } | null;
    progress?: number;
    progressMessage?: string;
    status: string;
    videoProjectId?: string;
  }>;
  videoProjects?: Array<{
    _id: string;
    title: string;
  }>;
};

export function statusLabel(status?: string) {
  switch (status) {
    case "clarifying":
      return "Clarifying";
    case "planning":
      return "Planning";
    case "waiting_for_user":
      return "Waiting for review";
    case "running":
      return "Creating";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    case "saved":
      return "Saved";
    case "canceled":
      return "Canceled";
    case "blocked":
      return "Blocked";
    case "queued":
      return "Queued";
    case "rendering":
      return "Rendering";
    case "completed":
      return "Completed";
    case "idle":
    default:
      return "Idle";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function artifactKindForRecord(artifact: {
  data?: unknown;
  storageUrl?: string;
  type: string;
}): AgentCreateArtifactKind {
  const data = isRecord(artifact.data) ? artifact.data : {};
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : "";

  if (artifact.type === "image" || artifact.type === "thumbnail" || mimeType.startsWith("image/")) {
    return "image";
  }
  if (artifact.type === "video" || mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/") || data.kind === "audio") return "audio";
  if (
    artifact.type === "text_draft" ||
    artifact.type === "caption" ||
    artifact.type === "script" ||
    artifact.type === "scene_spec" ||
    artifact.type === "shot_list"
  ) {
    return "document";
  }
  return "file";
}

function artifactKindForReference(mediaKind?: string): AgentCreateArtifactKind {
  if (mediaKind === "image" || mediaKind === "video" || mediaKind === "audio") {
    return mediaKind;
  }
  return "file";
}

function artifactStatusFromRequest(status: string): AgentCreateArtifact["status"] {
  if (status === "ready" || status === "saved") return "ready";
  if (status === "failed") return "failed";
  if (status === "discarded") return "failed";
  return "generating";
}

export function buildAgentCreateOutputArtifacts(threadOutputs?: ThreadOutputs): AgentCreateArtifact[] {
  const artifacts: AgentCreateArtifact[] = [];

  for (const artifact of threadOutputs?.directArtifacts ?? []) {
    const kind = artifactKindForRecord(artifact);
    const data = isRecord(artifact.data) ? artifact.data : {};
    const generatedText = typeof data.text === "string" ? data.text : undefined;
    artifacts.push({
      id: String(artifact._id),
      kind,
      status: "ready",
      title: artifact.title ?? "Generated text",
      description: generatedText?.slice(0, 220) ?? artifact.prompt,
      modelLabel: artifact.model,
      text: generatedText,
      thumbnailUrl: kind === "image" || kind === "video" ? artifact.storageUrl : undefined,
      url: artifact.storageUrl,
    });
  }

  for (const reference of threadOutputs?.referenceResults ?? []) {
    const kind = artifactKindForReference(reference.mediaKind);
    artifacts.push({
      id: `reference:${reference.id}`,
      kind,
      status: "ready",
      title: reference.title,
      description: reference.prompt ?? "Reusable reference",
      modelLabel: reference.source,
      thumbnailUrl: kind === "image" || kind === "video" ? reference.storageUrl : undefined,
      url: reference.storageUrl,
    });
  }

  for (const job of threadOutputs?.analysisJobs ?? []) {
    artifacts.push({
      id: `analysis:${job._id}`,
      kind: "document",
      status: job.status === "completed" ? "ready" : job.status === "failed" ? "failed" : "generating",
      title: job.title ?? "Source analysis",
      description: job.summary ?? job.errorMessage ?? statusLabel(job.status),
      referenceBrief: referenceBriefFromResult(job.result, {
        summary: job.summary,
      }),
    });
  }

  for (const entry of threadOutputs?.contentRequests ?? []) {
    const request = entry.request;
    const requestStatus = artifactStatusFromRequest(request.status);

    if (request.contentFormat === "slideshow") {
      for (const slideshow of entry.slideshows) {
        artifacts.push({
          id: String(slideshow._id),
          kind: "slideshow",
          status: slideshow.status === "failed" ? "failed" : "ready",
          title: slideshow.title,
          description: statusLabel(slideshow.status),
          url: `/slideshows/${encodeURIComponent(String(slideshow._id))}`,
        });
      }
      continue;
    }

    if (!entry.artifacts.length && !entry.slideshows.length) {
      artifacts.push({
        id: `request:${request._id}`,
        kind: request.contentFormat === "image" ||
              request.contentFormat === "video" ||
              request.contentFormat === "lipsync" ||
              request.contentFormat === "audio"
            ? request.contentFormat === "lipsync"
              ? "video"
              : request.contentFormat
            : "file",
        status: requestStatus,
        title: request.prompt,
        description: request.errorMessage ?? statusLabel(request.status),
      });
      continue;
    }

    for (const artifact of entry.artifacts) {
      const kind = artifactKindForRecord(artifact);
      artifacts.push({
        id: String(artifact._id),
        kind,
        status: artifact.storageUrl ? "ready" : requestStatus,
        title: artifact.title ?? request.prompt,
        description: artifact.prompt ?? request.summary ?? undefined,
        modelLabel: artifact.model,
        thumbnailUrl: kind === "image" || kind === "video" ? artifact.storageUrl : undefined,
        url: artifact.storageUrl,
      });
    }

    for (const slideshow of entry.slideshows) {
      artifacts.push({
        id: String(slideshow._id),
        kind: "slideshow",
        status: slideshow.status === "failed" ? "failed" : "ready",
        title: slideshow.title,
        description: statusLabel(slideshow.status),
        url: `/slideshows/${encodeURIComponent(String(slideshow._id))}`,
      });
    }
  }

  for (const project of threadOutputs?.videoProjects ?? []) {
    artifacts.push({
      id: `studio:${project._id}`,
      kind: "video",
      status: "ready",
      title: project.title,
      description: "Studio project",
      url: `/studio?projectId=${encodeURIComponent(String(project._id))}`,
    });
  }

  for (const request of threadOutputs?.studioRenderRequests ?? []) {
    if (request.outputArtifact?.storageUrl) {
      const kind = artifactKindForRecord(request.outputArtifact);
      artifacts.push({
        id: String(request.outputArtifact._id),
        kind,
        status: "ready",
        title: request.outputArtifact.title ?? "Rendered Studio video",
        description: request.outputArtifact.prompt ?? "Completed Studio render",
        modelLabel: request.outputArtifact.model,
        thumbnailUrl: kind === "image" || kind === "video" ? request.outputArtifact.storageUrl : undefined,
        url: request.outputArtifact.storageUrl,
      });
      continue;
    }

    const progressPercent = typeof request.progress === "number"
      ? Math.round(Math.max(0, Math.min(1, request.progress)) * 100)
      : undefined;
    artifacts.push({
      id: `studio-render:${request._id}`,
      kind: "video",
      status: request.status === "completed"
        ? "ready"
        : request.status === "failed" || request.status === "canceled"
          ? "failed"
          : request.status === "blocked"
            ? "placeholder"
            : "generating",
      title: "Studio render",
      description: request.errorMessage ??
        (progressPercent !== undefined && request.status !== "blocked"
          ? `${request.progressMessage ?? statusLabel(request.status)} - ${progressPercent}%`
          : request.progressMessage ?? statusLabel(request.status)),
      url: request.status === "blocked" && request.videoProjectId
        ? `/studio?projectId=${encodeURIComponent(String(request.videoProjectId))}&renderRequestId=${encodeURIComponent(String(request._id))}&autoRender=1`
        : undefined,
    });
  }

  for (const plan of threadOutputs?.distributionPlans ?? []) {
    artifacts.push({
      id: `distribution:${plan._id}`,
      kind: "document",
      status: plan.status === "failed" ? "failed" : "ready",
      title: "Publishing draft",
      description: `${statusLabel(plan.status)} - ${plan.artifactIds.length} media item${plan.artifactIds.length === 1 ? "" : "s"}`,
    });
  }

  return artifacts;
}
