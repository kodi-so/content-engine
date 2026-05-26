import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { objectValue, stringArrayFromConfig } from "./inputValues";
import type { MediaKindForRun, MediaNodeItemForRun } from "./outputRefs";

function mediaKindFromMimeType(mimeType?: string): MediaKindForRun {
  if (!mimeType) return "media";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "media";
}

function mediaKindFromArtifact(artifact: {
  type: string;
  data?: unknown;
}): MediaKindForRun {
  const data = objectValue(artifact.data);
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : undefined;
  const mimeKind = mediaKindFromMimeType(mimeType);
  if (mimeKind !== "media") return mimeKind;

  if (artifact.type === "image" || artifact.type === "thumbnail") return "image";
  if (artifact.type === "video") return "video";
  return "media";
}

function mediaKindFromAsset(asset: { mediaType: string }): MediaKindForRun {
  if (
    asset.mediaType === "image" ||
    asset.mediaType === "video" ||
    asset.mediaType === "audio"
  ) {
    return asset.mediaType;
  }

  return "media";
}

function uploadedMediaItemsFromConfig(value: unknown): MediaNodeItemForRun[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index): MediaNodeItemForRun[] => {
    if (typeof item === "string" && item.trim()) {
      return [{
        id: `uploaded:${index}`,
        source: "uploaded",
        kind: "media",
        storageUrl: item.trim(),
      } satisfies MediaNodeItemForRun];
    }

    const record = objectValue(item);
    const storageUrl = record.storageUrl ?? record.url;
    if (typeof storageUrl !== "string" || !storageUrl.trim()) return [];
    const mimeType = typeof record.mimeType === "string" ? record.mimeType : undefined;
    const configuredKind = record.kind;
    const kind =
      configuredKind === "image" ||
      configuredKind === "video" ||
      configuredKind === "audio" ||
      configuredKind === "media"
        ? configuredKind
        : mediaKindFromMimeType(mimeType);

    return [{
      id: typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `uploaded:${index}`,
      source: "uploaded",
      kind,
      title: typeof record.title === "string" ? record.title : undefined,
      storageUrl: storageUrl.trim(),
      metadata: record,
    } satisfies MediaNodeItemForRun];
  });
}

export async function resolveMediaNodeItemsForRun(
  ctx: QueryCtx,
  args: { runId: Id<"workflowRuns">; nodeId: string }
): Promise<MediaNodeItemForRun[]> {
  const run = await ctx.db.get(args.runId);
  if (!run) throw new Error("Workflow run not found");

  const workflow = await ctx.db.get(run.workflowId);
  if (!workflow) throw new Error("Workflow not found");

  const node = workflow.graph.nodes.find((candidateNode) => candidateNode.id === args.nodeId);
  if (!node || node.type !== "media") throw new Error("Media node not found");

  const config = objectValue(node.config);
  const artifactIds = stringArrayFromConfig(config.artifactIds);
  const creativeAssetIds = stringArrayFromConfig(config.creativeAssetIds);
  const personaIds = stringArrayFromConfig(config.personaIds);
  const items: MediaNodeItemForRun[] = [];

  for (const artifactId of artifactIds) {
    const artifact = await ctx.db.get(artifactId as Id<"artifacts">);
    if (!artifact || artifact.userId !== run.userId) continue;

    items.push({
      id: String(artifact._id),
      source: "artifact",
      kind: mediaKindFromArtifact(artifact),
      title: artifact.title,
      storageUrl: artifact.storageUrl,
      data: artifact.data,
      metadata: {
        artifactType: artifact.type,
        reviewStatus: artifact.reviewStatus,
      },
    });
  }

  for (const assetId of creativeAssetIds) {
    const asset = await ctx.db.get(assetId as Id<"creativeAssets">);
    if (!asset || asset.userId !== run.userId) continue;

    items.push({
      id: String(asset._id),
      source: "creative_asset",
      kind: mediaKindFromAsset(asset),
      title: asset.name,
      storageUrl: asset.storageUrl,
      metadata: {
        assetKind: asset.assetKind,
        mediaType: asset.mediaType,
        description: asset.description,
        usageNotes: asset.usageNotes,
        metadata: asset.metadata,
      },
    });
  }

  for (const personaId of personaIds) {
    const persona = await ctx.db.get(personaId as Id<"personas">);
    if (!persona || persona.userId !== run.userId) continue;

    const attachedAssets = [
      ...persona.sourceAssetIds.map((assetId) => ({ assetId, role: "source" })),
      ...persona.generatedAssetIds.map((assetId) => ({ assetId, role: "generated" })),
      ...persona.voiceAssetIds.map((assetId) => ({ assetId, role: "voice" })),
    ];

    for (const { assetId, role } of attachedAssets) {
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.userId !== run.userId) continue;

      items.push({
        id: `${String(persona._id)}:${String(asset._id)}`,
        source: "persona",
        kind: mediaKindFromAsset(asset),
        title: `${persona.name} · ${asset.name}`,
        storageUrl: asset.storageUrl,
        metadata: {
          personaId: persona._id,
          personaName: persona.name,
          personaType: persona.personaType,
          personaDescription: persona.description,
          identityPrompt: persona.identityPrompt,
          visualConstraints: persona.visualConstraints,
          personaUsageNotes: persona.usageNotes,
          personaAssetRole: role,
          assetId: asset._id,
          assetKind: asset.assetKind,
          mediaType: asset.mediaType,
          description: asset.description,
          usageNotes: asset.usageNotes,
          metadata: asset.metadata,
        },
      });
    }
  }

  items.push(...uploadedMediaItemsFromConfig(config.uploadedMedia));

  return items;
}
