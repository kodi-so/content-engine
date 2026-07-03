import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  hasRecordAccess,
  sameOwnershipScope,
} from "./artifactAccess";

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

function recordData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function appendRevisionRequest(
  artifact: Doc<"artifacts">,
  args: { note?: string; requestedBy: string; requestedAt: number }
) {
  const data = recordData(artifact.data);
  const existingRequests = Array.isArray(data.revisionRequests)
    ? data.revisionRequests
    : [];
  const note = args.note?.trim();
  const revisionRequest = {
    note: note || "Needs revision.",
    requestedBy: args.requestedBy,
    requestedAt: args.requestedAt,
  };

  return {
    ...data,
    latestRevisionNote: revisionRequest.note,
    revisionRequestCount: existingRequests.length + 1,
    revisionRequests: [...existingRequests, revisionRequest],
  };
}

function imageEditInstructionFromPrompt(prompt: string | undefined) {
  if (!prompt) return undefined;

  const userPromptMarker = "User prompt:";
  const suffix =
    "Use the provided reference image as the source image. Apply only the requested edit. Preserve the original subject, composition, framing, background, lighting, colors, camera angle, and style unless the requested edit directly requires a change.";
  const markerIndex = prompt.lastIndexOf(userPromptMarker);
  const userPrompt = markerIndex >= 0
    ? prompt.slice(markerIndex + userPromptMarker.length).trim()
    : prompt.trim();
  const [instruction] = userPrompt.split(`\n\n${suffix}`);
  return instruction?.trim() || userPrompt || undefined;
}

export async function reconcileApprovalForArtifact(
  ctx: MutationCtx,
  artifact: Doc<"artifacts">
) {
  if (!artifact.workflowRunId || !artifact.workflowId) return;

  const plans = await ctx.db
    .query("distributionPlans")
    .withIndex("by_workflow_run", (q) =>
      q.eq("workflowRunId", artifact.workflowRunId!)
    )
    .collect();
  const relatedPlans = plans.filter((plan) =>
    plan.artifactIds.some((artifactId) => artifactId === artifact._id)
  );

  for (const plan of relatedPlans) {
    if (
      plan.status !== "waiting_for_approval" &&
      plan.status !== "needs_revision" &&
      plan.status !== "draft"
    ) {
      continue;
    }

    const planArtifacts = await Promise.all(
      plan.artifactIds.map((artifactId) => ctx.db.get(artifactId))
    );
    const resolution = reviewResolution(planArtifacts);
    const nextStatus =
      resolution === "approved"
        ? "draft"
        : resolution === "needs_revision"
          ? "needs_revision"
          : "waiting_for_approval";

    const statusChanged = plan.status !== nextStatus;
    if (statusChanged) {
      await ctx.db.patch(plan._id, {
        status: nextStatus,
        updatedAt: Date.now(),
      });
    }

    const run = await ctx.db.get(artifact.workflowRunId);
    if (run) {
      const nextRunStatus =
        resolution === "approved"
          ? "completed"
          : resolution === "needs_revision"
            ? "needs_revision"
            : "waiting_for_approval";

      if (
        run.status === "waiting_for_approval" ||
        run.status === "needs_revision" ||
        (run.status === "completed" && resolution === "needs_revision")
      ) {
        await ctx.db.patch(run._id, {
          status: nextRunStatus,
          summary:
            resolution === "approved"
              ? "Approved and ready for publishing."
              : resolution === "needs_revision"
                ? "Review requested revisions before publishing."
                : run.summary,
          completedAt: resolution === "approved" ? Date.now() : run.completedAt,
          updatedAt: Date.now(),
        });
      }
    }

    if (resolution !== "pending" && statusChanged) {
      await ctx.db.insert("workflowRunEvents", {
        userId: artifact.userId,
        workspaceId: artifact.workspaceId,
        workflowRunId: artifact.workflowRunId,
        workflowId: artifact.workflowId,
        type: "approval_resolved",
        message:
          resolution === "approved"
            ? "Distribution plan approved and ready for publishing."
            : "Distribution plan marked as needing revision.",
        data: {
          distributionPlanId: plan._id,
          status: nextStatus,
        },
        createdAt: Date.now(),
      });
    }
  }
}

export async function approveImageReplacementForUser(
  ctx: MutationCtx,
  args: {
    candidateArtifactId: Doc<"artifacts">["_id"];
    originalArtifactId: Doc<"artifacts">["_id"];
    userId: string;
  }
) {
  const original = await ctx.db.get(args.originalArtifactId);
  const candidate = await ctx.db.get(args.candidateArtifactId);

  if (!original || !(await hasRecordAccess(ctx, original, args.userId))) {
    throw new Error("Original image not found");
  }
  if (!candidate || !(await hasRecordAccess(ctx, candidate, args.userId))) {
    throw new Error("Candidate image not found");
  }
  const candidateMatchesOriginalScope = sameOwnershipScope(candidate, original);
  const candidateCanJoinOriginalScope =
    !candidate.workspaceId &&
    candidate.userId === args.userId &&
    candidate.lifecycle === "preview";

  if (!candidateMatchesOriginalScope && !candidateCanJoinOriginalScope) {
    throw new Error("Candidate image is not in the same workspace");
  }
  if (original.type !== "image" || candidate.type !== "image") {
    throw new Error("Only image assets can be replaced");
  }
  if (!candidate.storageUrl) {
    throw new Error("Candidate image has no output");
  }

  const originalData = recordData(original.data);
  const candidateData = recordData(candidate.data);
  const revisionHistory = Array.isArray(originalData.revisionHistory)
    ? originalData.revisionHistory
    : [];
  const now = Date.now();
  const candidateUserPrompt = typeof candidateData.userPrompt === "string"
    ? candidateData.userPrompt
    : candidate.prompt;
  const latestEditPrompt = imageEditInstructionFromPrompt(candidateUserPrompt);

  await ctx.db.patch(original._id, {
    title: original.title ?? candidate.title,
    storageUrl: candidate.storageUrl,
    data: {
      ...originalData,
      ...candidateData,
      originalPrompt: typeof originalData.originalPrompt === "string"
        ? originalData.originalPrompt
        : original.prompt,
      latestEditPrompt,
      replacedArtifactId: original._id,
      replacementCandidateArtifactId: candidate._id,
      previousStorageUrl: original.storageUrl,
      revisionHistory: [
        ...revisionHistory,
        {
          artifactId: candidate._id,
          approvedAt: now,
          editPrompt: latestEditPrompt,
          prompt: candidate.prompt,
          provider: candidate.provider,
          model: candidate.model,
          storageUrl: candidate.storageUrl,
        },
      ],
    },
    provider: candidate.provider,
    model: candidate.model,
    prompt: original.prompt,
    lifecycle: "saved",
    reviewStatus: "not_required",
    updatedAt: now,
  });

  await ctx.db.patch(candidate._id, {
    workspaceId: original.workspaceId,
    storageUrl: undefined,
    data: {
      source: "library_image_replacement",
      approvedIntoArtifactId: original._id,
      approvedAt: now,
    },
    lifecycle: "discarded",
    reviewStatus: "not_required",
    updatedAt: now,
  });

  return original._id;
}

export async function requestArtifactRevisionForUser(
  ctx: MutationCtx,
  args: {
    artifactId: Doc<"artifacts">["_id"];
    note?: string;
    userId: string;
  }
) {
  const artifact = await ctx.db.get(args.artifactId);
  if (!artifact || !(await hasRecordAccess(ctx, artifact, args.userId))) {
    throw new Error("Artifact not found");
  }

  const now = Date.now();
  const data = appendRevisionRequest(artifact, {
    note: args.note,
    requestedBy: args.userId,
    requestedAt: now,
  });

  await ctx.db.patch(args.artifactId, {
    reviewStatus: "needs_revision",
    data,
    updatedAt: now,
  });

  if (artifact.workflowRunId && artifact.workflowId) {
    await ctx.db.insert("workflowRunEvents", {
      userId: artifact.userId,
      workspaceId: artifact.workspaceId,
      workflowRunId: artifact.workflowRunId,
      workflowId: artifact.workflowId,
      type: "revision_requested",
      message: `Revision requested for ${artifact.title || artifact.type}.`,
      data: {
        artifactId: artifact._id,
        note: data.latestRevisionNote,
      },
      createdAt: now,
    });
  }

  await reconcileApprovalForArtifact(ctx, {
    ...artifact,
    reviewStatus: "needs_revision",
    data,
    updatedAt: now,
  });
}
