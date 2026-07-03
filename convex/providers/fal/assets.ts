import type { GeneratedAsset } from "../model";

function falGeneratedAssetMimeType(
  item: Record<string, unknown>,
  fallback: string
): string {
  if (typeof item.content_type === "string") return item.content_type;
  if (typeof item.mime_type === "string") return item.mime_type;
  return fallback;
}

function addFalAssetsFromList(
  assets: GeneratedAsset[],
  list: unknown[],
  fallbackMimeType: string
): void {
  for (const asset of list) {
    if (!asset || typeof asset !== "object") continue;
    const item = asset as Record<string, unknown>;
    if (typeof item.url === "string") {
      assets.push({
        url: item.url,
        data: item.url,
        mimeType: falGeneratedAssetMimeType(item, fallbackMimeType),
      });
    }
  }
}

export function normalizeFalAssets(payload: unknown): GeneratedAsset[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = payload as Record<string, unknown>;
  const assets: GeneratedAsset[] = [];

  addFalAssetsFromList(
    assets,
    Array.isArray(data.images) ? data.images : [],
    "image/png"
  );

  const singletonKeys = ["image", "video", "audio"] as const;
  for (const key of singletonKeys) {
    const value = data[key];
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    if (typeof item.url === "string") {
      assets.push({
        url: item.url,
        data: item.url,
        mimeType: falGeneratedAssetMimeType(
          item,
          key === "video"
            ? "video/mp4"
            : key === "audio"
              ? "audio/mpeg"
              : "image/png"
        ),
      });
    }
  }

  addFalAssetsFromList(
    assets,
    Array.isArray(data.videos) ? data.videos : [],
    "video/mp4"
  );
  addFalAssetsFromList(
    assets,
    Array.isArray(data.audios) ? data.audios : [],
    "audio/mpeg"
  );

  return assets;
}
