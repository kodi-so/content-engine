import type { ActionCtx } from "../_generated/server";
import type { GeneratedAsset } from "../providers/model";
import { publicUrlForKey, r2 } from "../storage/r2";

export type StoredGeneratedAsset = {
  // R2 object key for the stored media.
  storageId: string;
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
    const mimeType = response.headers.get("content-type") || asset.mimeType;
    return new Blob([await response.arrayBuffer()], { type: mimeType });
  }

  if (asset.data.startsWith("data:")) {
    const response = await fetch(asset.data);
    const mimeType = response.headers.get("content-type") || asset.mimeType;
    return new Blob([await response.arrayBuffer()], { type: mimeType });
  }

  return new Blob([bytesFromBase64(asset.data)], { type: asset.mimeType });
}

export async function storeGeneratedAsset(
  ctx: ActionCtx,
  asset: GeneratedAsset
): Promise<StoredGeneratedAsset> {
  const blob = await blobFromGeneratedAsset(asset);
  const mimeType = blob.type || asset.mimeType;
  const storageId = await r2.store(ctx, blob, { type: mimeType });

  return {
    storageId,
    storageUrl: publicUrlForKey(storageId),
    mimeType,
    byteLength: blob.size,
  };
}
