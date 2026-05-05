import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { GeneratedAsset } from "../providers/model";

export type StoredGeneratedAsset = {
  storageId: Id<"_storage">;
  storageUrl: string;
  mimeType: string;
  byteLength: number;
};

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function blobFromGeneratedAsset(asset: GeneratedAsset): Promise<Blob> {
  if (asset.url) {
    const response = await fetch(asset.url);
    if (!response.ok) {
      throw new Error(`Could not fetch generated asset: ${response.status}`);
    }
    const blob = await response.blob();
    return blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: asset.mimeType });
  }

  if (asset.data.startsWith("data:")) {
    const response = await fetch(asset.data);
    const blob = await response.blob();
    return blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: asset.mimeType });
  }

  return new Blob([bytesFromBase64(asset.data)], { type: asset.mimeType });
}

export async function storeGeneratedAsset(
  ctx: ActionCtx,
  asset: GeneratedAsset
): Promise<StoredGeneratedAsset> {
  const blob = await blobFromGeneratedAsset(asset);
  const storageId = await ctx.storage.store(blob);
  const storageUrl = await ctx.storage.getUrl(storageId);
  if (!storageUrl) {
    throw new Error("Could not resolve Convex storage URL");
  }

  return {
    storageId,
    storageUrl,
    mimeType: blob.type || asset.mimeType,
    byteLength: blob.size,
  };
}
