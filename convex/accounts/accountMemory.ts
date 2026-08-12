import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

function artifactMimeType(artifact: Doc<"artifacts">) {
  if (!artifact.data || typeof artifact.data !== "object" || Array.isArray(artifact.data)) {
    return undefined;
  }
  const mimeType = (artifact.data as Record<string, unknown>).mimeType;
  return typeof mimeType === "string" ? mimeType : undefined;
}

function accountMemoryMediaType(artifacts: Doc<"artifacts">[]) {
  if (artifacts.some((artifact) => artifact.type === "video" || artifactMimeType(artifact)?.startsWith("video/"))) {
    return "video" as const;
  }
  return artifacts.length > 1 ? "slideshow" as const : "image" as const;
}

export async function recordCreatedPostMemory(
  ctx: MutationCtx,
  args: {
    accountPostId: Id<"accountPosts">;
    artifactIds: Id<"artifacts">[];
    caption?: string;
    socialAccountId: Id<"socialAccounts">;
    userId: string;
    workspaceId?: Id<"workspaces">;
  }
) {
  const existing = await ctx.db
    .query("contentAnalyses")
    .withIndex("by_account_post_and_version", (q) =>
      q.eq("accountPostId", args.accountPostId).eq("analysisVersion", "created-post-v1")
    )
    .unique();
  if (existing) return existing._id;

  const loadedArtifacts = await Promise.all(args.artifactIds.map((id) => ctx.db.get(id)));
  const artifacts = loadedArtifacts.filter(
    (artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact)
  );
  const account = await ctx.db.get(args.socialAccountId);
  const summaryParts = [
    args.caption?.trim(),
    ...artifacts.flatMap((artifact) => artifact.title?.trim() || artifact.prompt?.trim() || []),
  ].filter((value): value is string => Boolean(value));
  const now = Date.now();
  return await ctx.db.insert("contentAnalyses", {
    userId: args.userId,
    workspaceId: args.workspaceId,
    accountPostId: args.accountPostId,
    purpose: "account_memory",
    mediaType: accountMemoryMediaType(artifacts),
    sourceArtifactIds: args.artifactIds,
    analysisVersion: "created-post-v1",
    sourceType: "upload",
    sourcePlatform: "direct_file",
    storageUrl: artifacts[0]?.storageUrl,
    mimeType: artifacts[0] ? artifactMimeType(artifacts[0]) : undefined,
    provider: "manual",
    model: "created-content-record",
    mode: "inspiration",
    status: "completed",
    title: account ? `Post for @${account.username}` : "Account post",
    summary: summaryParts.join(" — ").slice(0, 4_000) || "Created media post",
    result: {
      source: "created_content",
      caption: args.caption,
      artifacts: artifacts.map((artifact) => ({
        id: artifact._id,
        title: artifact.title,
        type: artifact.type,
        prompt: artifact.prompt,
        mimeType: artifactMimeType(artifact),
      })),
    },
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}
