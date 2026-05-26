import type {
  ArtifactDoc,
  DistributionPlanId,
  DistributionPlanDoc,
} from "../types";

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
        backgroundImageUrl?: string;
      })
    : {};

  return artifact.storageUrl ?? data.url ?? data.backgroundImageUrl;
}

export function isPrimaryReviewArtifact(artifact: ArtifactDoc): boolean {
  return (
    artifact.type === "caption" ||
    artifact.type === "script" ||
    artifact.type === "thumbnail" ||
    artifact.type === "video"
  );
}

export function artifactSummary(artifact: ArtifactDoc): string {
  if (artifact.type === "slide_spec" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as { hook?: string; slides?: unknown[] };
    return `${data.hook ?? "Slideshow spec"}${data.slides ? ` · ${data.slides.length} slides` : ""}`;
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

  if (artifact.type === "rendered_asset" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as {
      format?: string;
      slideIndex?: number;
      slideCount?: number;
      width?: number;
      height?: number;
      dimensions?: { width?: number; height?: number };
      mimeType?: string;
    };
    if (data.format === "native_slideshow") {
      return [
        "Native slideshow",
        data.slideCount ? `${data.slideCount} slides` : undefined,
        data.dimensions?.width && data.dimensions.height
          ? `${data.dimensions.width}x${data.dimensions.height}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    return [
      typeof data.slideIndex === "number" ? `Publish-ready slide ${data.slideIndex}` : "Publish-ready asset",
      data.width && data.height ? `${data.width}x${data.height}` : undefined,
      data.mimeType,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (artifact.type === "publish_payload" && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as {
      caption?: string;
      mediaArtifactIds?: string[];
      mediaItems?: unknown[];
      mediaSummary?: {
        total?: number;
        slideshowCount?: number;
        videoCount?: number;
        imageCount?: number;
      };
      exportStatus?: {
        destination?: string;
        status?: string;
      };
      publishingStatus?: {
        provider?: string;
        status?: string;
        autoPublish?: boolean;
      };
      primaryPlatformPreset?: {
        label?: string;
        platform?: string;
        surface?: string;
      };
      platformPackages?: unknown[];
      name?: string;
      postType?: string;
    };
    const mediaCount = data.mediaSummary?.total ?? data.mediaItems?.length ?? data.mediaArtifactIds?.length;
    return [
      data.name ?? "Post package",
      data.postType,
      data.primaryPlatformPreset?.label ??
        (data.primaryPlatformPreset?.platform && data.primaryPlatformPreset.surface
          ? `${data.primaryPlatformPreset.platform} ${data.primaryPlatformPreset.surface}`
          : undefined),
      data.platformPackages?.length ? `${data.platformPackages.length} platform packages` : undefined,
      mediaCount ? `${mediaCount} media refs` : undefined,
      data.exportStatus?.destination
        ? `${data.exportStatus.destination}: ${data.exportStatus.status ?? "export"}`
        : undefined,
      data.publishingStatus?.provider
        ? `${data.publishingStatus.provider}: ${data.publishingStatus.status ?? "publish"}`
        : undefined,
      data.caption ? "caption ready" : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
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
    artifact.type === "image"
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
  if (
    artifact.type !== "image" &&
    artifact.type !== "rendered_asset" &&
    artifact.type !== "thumbnail" &&
    artifact.type !== "video"
  ) {
    return undefined;
  }
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
