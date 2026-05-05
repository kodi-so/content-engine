import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { getPublishingProvider } from "../providers";
import type { PublishContentInput, UploadedMedia } from "../providers/publishing";

export type DistributionPublishContext = {
  plan: Doc<"distributionPlans">;
  artifacts: Doc<"artifacts">[];
  socialAccounts: Doc<"socialAccounts">[];
};

function extractArtifactText(artifacts: Doc<"artifacts">[]): string | undefined {
  for (const artifact of artifacts) {
    if (artifact.type !== "caption" && artifact.type !== "text_draft") continue;
    if (!artifact.data || typeof artifact.data !== "object") continue;

    const data = artifact.data as Record<string, unknown>;
    const text = data.text ?? data.caption ?? data.content;
    if (typeof text === "string" && text.trim()) {
      return text.trim();
    }
  }

  return undefined;
}

function inferMimeType(artifact: Doc<"artifacts">): string {
  if (artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as Record<string, unknown>;
    if (typeof data.mimeType === "string") return data.mimeType;
  }
  if (artifact.type === "video") return "video/mp4";
  if (artifact.type === "rendered_slide") return "image/svg+xml";
  if (!artifact.storageUrl) return "image/png";
  if (artifact.storageUrl.endsWith(".jpg") || artifact.storageUrl.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (artifact.storageUrl.endsWith(".webp")) return "image/webp";
  return "image/png";
}

async function mediaFromArtifact(
  provider: ReturnType<typeof getPublishingProvider>,
  artifact: Doc<"artifacts">
): Promise<UploadedMedia | null> {
  if (
    artifact.type !== "image" &&
    artifact.type !== "video" &&
    artifact.type !== "rendered_slide" &&
    artifact.type !== "rendered_asset" &&
    artifact.type !== "thumbnail"
  ) {
    return null;
  }

  const data = artifact.data && typeof artifact.data === "object"
    ? (artifact.data as Record<string, unknown>)
    : {};
  const externalMediaId = data.externalMediaId;
  if (typeof externalMediaId === "string") {
    return {
      externalMediaId,
      url: typeof data.url === "string" ? data.url : artifact.storageUrl,
      metadata: data,
    };
  }

  const source = typeof data.url === "string" ? data.url : artifact.storageUrl;
  if (!source) return null;

  const mimeType =
    typeof data.mimeType === "string" ? data.mimeType : inferMimeType(artifact);

  if (source.startsWith("data:")) {
    return await provider.uploadMedia({
      filename: `${artifact._id}.${mimeType.split("/").pop() ?? "bin"}`,
      mimeType,
      data: source,
      encoding: "base64",
    });
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not fetch artifact media: ${response.status}`);
  }

  return await provider.uploadMedia({
    filename: `${artifact._id}.${mimeType.split("/").pop() ?? "bin"}`,
    mimeType: response.headers.get("content-type") ?? mimeType,
    data: await response.arrayBuffer(),
  });
}

export function mapProviderStatus(status: string):
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "canceled" {
  if (
    status === "draft" ||
    status === "scheduled" ||
    status === "publishing" ||
    status === "published" ||
    status === "failed" ||
    status === "canceled"
  ) {
    return status;
  }

  return "publishing";
}

export function compactMetrics(metrics: {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  followersGained?: number;
}) {
  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => value !== undefined)
  ) as {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    clicks?: number;
    followersGained?: number;
  };
}

export async function loadPublishInput(
  provider: ReturnType<typeof getPublishingProvider>,
  context: DistributionPublishContext
): Promise<PublishContentInput> {
  const text = context.plan.caption ?? extractArtifactText(context.artifacts);
  const media = (
    await Promise.all(
      context.artifacts.map((artifact) => mediaFromArtifact(provider, artifact))
    )
  ).filter((item): item is UploadedMedia => item !== null);

  return {
    targets: context.socialAccounts.map((account) => ({
      accountId: account.externalAccountId,
      platform:
        account.metadata &&
        typeof account.metadata === "object" &&
        typeof (account.metadata as Record<string, unknown>).identifier === "string"
          ? ((account.metadata as Record<string, unknown>).identifier as string)
          : account.platform,
      content: text,
      media,
    })),
    text,
    media,
    publishAt: context.plan.scheduledFor,
    timezone: context.plan.timezone,
    metadata: {
      distributionPlanId: context.plan._id,
    },
  };
}

export async function getDistributionPlanContext(
  ctx: ActionCtx,
  id: Id<"distributionPlans">,
  userId: string
): Promise<DistributionPublishContext | null> {
  return await ctx.runQuery(internal.publishing.distributionPlans.getPublishContext, {
    id,
    userId,
  });
}
