import type {
  ArtifactDoc,
  DistributionPlanId,
  DistributionPlanDoc,
  SlideshowBundle,
  WorkflowDoc,
  WorkflowRunDoc,
  ContentRequestDoc,
  WorkflowRunId,
} from "../types";

export function buildSlideshowBundles(
  artifacts: ArtifactDoc[],
  runs: WorkflowRunDoc[],
  workflows: WorkflowDoc[],
  contentRequests: ContentRequestDoc[] = []
): SlideshowBundle[] {
  const runById = new Map(runs.map((run) => [String(run._id), run]));
  const workflowById = new Map(workflows.map((workflow) => [String(workflow._id), workflow]));
  const requestById = new Map(contentRequests.map((request) => [String(request._id), request]));
  const groups = new Map<string, ArtifactDoc[]>();

  for (const artifact of artifacts) {
    if (artifact.type !== "rendered_slide") continue;
    if (artifact.lifecycle === "preview" || artifact.lifecycle === "discarded") continue;
    const ownerId = artifact.workflowRunId ?? artifact.contentRequestId;
    if (!ownerId) continue;
    const key = String(ownerId);
    groups.set(key, [...(groups.get(key) ?? []), artifact]);
  }

  return Array.from(groups.entries())
    .map(([key, groupArtifacts]) => {
      const sortedArtifacts = [...groupArtifacts].sort(
        (first, second) => slideNumber(first) - slideNumber(second)
      );
      const run = runById.get(key);
      const workflow = sortedArtifacts[0]?.workflowId
        ? workflowById.get(String(sortedArtifacts[0].workflowId))
        : undefined;
      const request = sortedArtifacts[0]?.contentRequestId
        ? requestById.get(String(sortedArtifacts[0].contentRequestId))
        : undefined;
      const createdAt = Math.max(...sortedArtifacts.map((artifact) => artifact.createdAt));

      return {
        key,
        workflowRunId: sortedArtifacts[0]?.workflowRunId as WorkflowRunId | undefined,
        contentRequestId: sortedArtifacts[0]?.contentRequestId,
        title:
          run?.generatedTopic ||
          workflow?.name ||
          request?.summary ||
          request?.prompt ||
          sortedArtifacts[0]?.title?.replace(/\s*slide\s*\d+/i, "").trim() ||
          "Generated slideshow",
        subtitle: `${sortedArtifacts.length} slides · ${new Date(createdAt).toLocaleString()}`,
        reviewStatus: aggregateReviewStatus(sortedArtifacts),
        artifacts: sortedArtifacts,
      };
    })
    .sort((first, second) => {
      const firstCreatedAt = Math.max(...first.artifacts.map((artifact) => artifact.createdAt));
      const secondCreatedAt = Math.max(...second.artifacts.map((artifact) => artifact.createdAt));
      return secondCreatedAt - firstCreatedAt;
    });
}

export function aggregateReviewStatus(artifacts: ArtifactDoc[]): string {
  if (artifacts.some((artifact) => artifact.reviewStatus === "needs_revision")) {
    return "needs_revision";
  }
  if (
    artifacts.every(
      (artifact) =>
        artifact.reviewStatus === "approved" ||
        artifact.reviewStatus === "not_required"
    )
  ) {
    return "approved";
  }
  return "pending";
}

export function slideNumber(artifact: ArtifactDoc): number {
  if (artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { slideIndex?: number };
    if (typeof data.slideIndex === "number") return data.slideIndex;
  }

  const titleMatch = artifact.title?.match(/slide\s+(\d+)/i);
  if (titleMatch) return Number(titleMatch[1]);

  return artifact.createdAt;
}

export function artifactImageUrl(artifact: ArtifactDoc): string | undefined {
  const data = artifact.data && typeof artifact.data === "object"
    ? (artifact.data as {
        url?: string;
        renderedImageUrl?: string;
        backgroundImageUrl?: string;
      })
    : {};

  return artifact.storageUrl ?? data.renderedImageUrl ?? data.url ?? data.backgroundImageUrl;
}

export function isPrimaryReviewArtifact(artifact: ArtifactDoc): boolean {
  return (
    artifact.type === "caption" ||
    artifact.type === "script" ||
    artifact.type === "rendered_slide" ||
    artifact.type === "rendered_asset" ||
    artifact.type === "thumbnail" ||
    artifact.type === "video"
  );
}

export function artifactSummary(artifact: ArtifactDoc): string {
  if (artifact.type === "slide_spec" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { hook?: string; slides?: unknown[] };
    return `${data.hook ?? "Slideshow spec"}${data.slides ? ` · ${data.slides.length} slides` : ""}`;
  }

  if (artifact.type === "rendered_slide" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as {
      headline?: string;
      body?: string;
      renderedImageUrl?: string;
      backgroundImageUrl?: string;
      textBlocks?: Array<{ text?: string; items?: string[] }>;
    };
    const textBlockSummary = data.textBlocks
      ?.map((block) => block.text || block.items?.join(", "))
      .filter(Boolean)
      .join(" · ");
    return textBlockSummary || data.headline || data.body || data.renderedImageUrl || data.backgroundImageUrl || "Rendered slide";
  }

  if (artifact.type === "image_prompt" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { prompt?: string };
    return data.prompt ?? artifact.prompt ?? "Image prompt";
  }

  if ((artifact.type === "image" || artifact.type === "video") && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { status?: string; jobId?: string; url?: string };
    if (data.status || data.jobId) return `${data.status ?? "job"} · ${data.jobId ?? ""}`.trim();
    if (data.url) return data.url;
  }

  if (artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { text?: string };
    if (data.text) return data.text;
  }

  return artifact.prompt || "Artifact metadata will appear here as workflows run.";
}

export function providerErrorSummary(artifact: ArtifactDoc): string | undefined {
  if (!artifact.data || typeof artifact.data !== "object") return undefined;

  const data = artifact.data as {
    providerError?: {
      message?: string;
      operation?: string;
      statusCode?: number;
      code?: string;
    };
  };
  const error = data.providerError;
  if (!error) return undefined;

  const parts = [
    error.message,
    error.operation ? `operation: ${error.operation}` : undefined,
    error.statusCode ? `status: ${error.statusCode}` : undefined,
    error.code ? `code: ${error.code}` : undefined,
  ].filter(Boolean);

  return parts.join(" · ");
}

export function latestRevisionNote(artifact: ArtifactDoc): string | undefined {
  if (!artifact.data || typeof artifact.data !== "object") return undefined;

  const data = artifact.data as {
    latestRevisionNote?: string;
    revisionRequests?: Array<{ note?: string }>;
  };
  if (data.latestRevisionNote?.trim()) return data.latestRevisionNote;

  return data.revisionRequests?.[data.revisionRequests.length - 1]?.note;
}

export function supportsRegeneration(artifact: ArtifactDoc): boolean {
  return (
    artifact.type === "image_prompt" ||
    artifact.type === "image" ||
    artifact.type === "rendered_slide"
  );
}

export function replacementSourceIds(artifact: ArtifactDoc): Set<string> {
  const sourceIds = new Set<string>();
  artifact.parentArtifactIds?.forEach((artifactId) => sourceIds.add(String(artifactId)));

  if (!artifact.data || typeof artifact.data !== "object") return sourceIds;

  const data = artifact.data as {
    sourceArtifactId?: string;
    regeneration?: {
      requestedFromArtifactId?: string;
    };
  };
  if (data.sourceArtifactId) sourceIds.add(data.sourceArtifactId);
  if (data.regeneration?.requestedFromArtifactId) {
    sourceIds.add(data.regeneration.requestedFromArtifactId);
  }

  return sourceIds;
}

export function findPromotablePlanTarget(
  artifact: ArtifactDoc,
  plans: DistributionPlanDoc[]
): { planId: DistributionPlanId; oldArtifactId: ArtifactDoc["_id"] } | undefined {
  if (artifact.type !== "rendered_slide") return undefined;
  if (artifact.reviewStatus === "needs_revision") return undefined;

  const sourceIds = replacementSourceIds(artifact);
  if (sourceIds.size === 0) return undefined;

  for (const plan of plans) {
    if (plan.status !== "waiting_for_approval" && plan.status !== "needs_revision") {
      continue;
    }

    const oldArtifactId = plan.artifactIds.find((artifactId) =>
      sourceIds.has(String(artifactId))
    );
    if (oldArtifactId) {
      return {
        planId: plan._id as DistributionPlanId,
        oldArtifactId: oldArtifactId as ArtifactDoc["_id"],
      };
    }
  }

  return undefined;
}
