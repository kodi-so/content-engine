import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

function reviewResolution(
  artifacts: Array<{ reviewStatus: string } | null>
): "approved" | "needs_revision" | "pending" {
  if (
    artifacts.some(
      (artifact) =>
        artifact?.reviewStatus === "needs_revision" ||
        artifact?.reviewStatus === "rejected"
    )
  ) {
    return "needs_revision";
  }

  if (
    artifacts.every(
      (artifact) =>
        artifact &&
        (artifact.reviewStatus === "approved" ||
          artifact.reviewStatus === "not_required")
    )
  ) {
    return "approved";
  }

  return "pending";
}

function statusFromReviewResolution(
  resolution: "approved" | "needs_revision" | "pending"
): "draft" | "needs_revision" | "waiting_for_approval" {
  if (resolution === "approved") return "draft";
  if (resolution === "needs_revision") return "needs_revision";
  return "waiting_for_approval";
}

function replacementSourceId(artifact: Doc<"artifacts">): string | undefined {
  if (!artifact.data || typeof artifact.data !== "object") return undefined;

  const data = artifact.data as Record<string, unknown>;
  if (typeof data.sourceArtifactId === "string") return data.sourceArtifactId;

  const regeneration = data.regeneration;
  if (!regeneration || typeof regeneration !== "object") return undefined;

  const requestedFromArtifactId = (regeneration as Record<string, unknown>)
    .requestedFromArtifactId;
  return typeof requestedFromArtifactId === "string"
    ? requestedFromArtifactId
    : undefined;
}

export async function replaceArtifactInPlan(
  ctx: MutationCtx,
  args: {
    id: Id<"distributionPlans">;
    oldArtifactId: Id<"artifacts">;
    newArtifactId: Id<"artifacts">;
  },
  userId: string
) {
  const plan = await ctx.db.get(args.id);
  if (!plan || plan.userId !== userId) {
    throw new Error("Distribution plan not found");
  }
  if (!plan.artifactIds.some((artifactId) => artifactId === args.oldArtifactId)) {
    throw new Error("Original artifact is not in this distribution plan");
  }

  const oldArtifact = await ctx.db.get(args.oldArtifactId);
  const newArtifact = await ctx.db.get(args.newArtifactId);
  if (!oldArtifact || oldArtifact.userId !== userId) {
    throw new Error("Original artifact not found");
  }
  if (!newArtifact || newArtifact.userId !== userId) {
    throw new Error("Replacement artifact not found");
  }
  if (oldArtifact.automationRunId !== plan.automationRunId) {
    throw new Error("Original artifact does not belong to this plan's automation run");
  }
  if (newArtifact.automationRunId !== plan.automationRunId) {
    throw new Error("Replacement artifact must belong to the same automation run");
  }

  const parentIds = new Set((newArtifact.parentArtifactIds ?? []).map(String));
  const sourceId = replacementSourceId(newArtifact);
  if (!parentIds.has(String(args.oldArtifactId)) && sourceId !== String(args.oldArtifactId)) {
    throw new Error("Replacement artifact is not linked to the original artifact");
  }

  const artifactIds = plan.artifactIds.map((artifactId) =>
    artifactId === args.oldArtifactId ? args.newArtifactId : artifactId
  );
  const planArtifacts = await Promise.all(
    artifactIds.map((artifactId) => ctx.db.get(artifactId))
  );
  const nextStatus = statusFromReviewResolution(reviewResolution(planArtifacts));
  const now = Date.now();

  await ctx.db.patch(plan._id, {
    artifactIds,
    status: nextStatus,
    errorMessage: undefined,
    providerPayload: {
      ...(plan.providerPayload &&
      typeof plan.providerPayload === "object" &&
      !Array.isArray(plan.providerPayload)
        ? (plan.providerPayload as Record<string, unknown>)
        : {}),
      replacement: {
        oldArtifactId: args.oldArtifactId,
        newArtifactId: args.newArtifactId,
        replacedAt: now,
      },
    },
    updatedAt: now,
  });

  return { status: nextStatus, artifactIds };
}
