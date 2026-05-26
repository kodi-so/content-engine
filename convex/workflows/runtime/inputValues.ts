import type { ReferenceAsset } from "../../providers/model";

export type ResolvedInputsForRun = {
  inputs?: Record<string, {
    source?: string;
    value?: unknown;
    artifactIds?: string[];
    metadata?: Record<string, unknown>;
  }>;
  summary?: Record<string, unknown>;
};

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringFromValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const data = value as Record<string, unknown>;
  for (const key of ["caption", "text", "content", "prompt"]) {
    const candidate = data[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return undefined;
}

export function textFromInputValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const text = value.flatMap((item) => {
      const itemText = textFromInputValue(item);
      return itemText ? [itemText] : [];
    }).join("\n\n");
    return text.trim() || undefined;
  }
  if (!value || typeof value !== "object") return undefined;

  const data = value as Record<string, unknown>;
  for (const key of ["prompt", "text", "content", "caption", "script"]) {
    const candidate = textFromInputValue(data[key]);
    if (candidate) return candidate;
  }

  if (data.data && typeof data.data === "object") {
    const nestedText = textFromInputValue(data.data);
    if (nestedText) return nestedText;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

export function numberFromInputValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function stringArrayFromConfig(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function looksLikeUrl(value: string): boolean {
  return value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:");
}

function referenceAssetMimeType(
  value: Record<string, unknown>,
  fallbackMimeType = "image/png"
): string {
  const data = objectValue(value.data);
  const metadata = objectValue(value.metadata);
  const mimeType = value.mimeType ?? data.mimeType ?? metadata.mimeType;
  return typeof mimeType === "string" && mimeType.trim()
    ? mimeType.trim()
    : fallbackMimeType;
}

function collectReferenceAssetsFromValue(
  value: unknown,
  output: ReferenceAsset[],
  seenUrls: Set<string>,
  options: {
    acceptedKinds: string[];
    defaultMimeType: string;
    mimePrefix: string;
  } = {
    acceptedKinds: ["image"],
    defaultMimeType: "image/png",
    mimePrefix: "image/",
  }
) {
  if (typeof value === "string") {
    const url = value.trim();
    if (looksLikeUrl(url) && !seenUrls.has(url)) {
      seenUrls.add(url);
      output.push({ url, mimeType: options.defaultMimeType });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferenceAssetsFromValue(item, output, seenUrls, options);
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) {
    for (const item of record.items) {
      collectReferenceAssetsFromValue(item, output, seenUrls, options);
    }
  }

  const url = record.storageUrl ?? record.url;
  const kind = typeof record.kind === "string" ? record.kind : undefined;
  const mimeType = referenceAssetMimeType(record, options.defaultMimeType);
  if (
    typeof url === "string" &&
    looksLikeUrl(url.trim()) &&
    !seenUrls.has(url.trim()) &&
    (kind === undefined ||
      options.acceptedKinds.includes(kind) ||
      mimeType.startsWith(options.mimePrefix))
  ) {
    const trimmedUrl = url.trim();
    seenUrls.add(trimmedUrl);
    output.push({
      url: trimmedUrl,
      mimeType,
      description:
        typeof record.title === "string"
          ? record.title
          : typeof record.name === "string"
            ? record.name
            : undefined,
    });
  }

  if (record.data && typeof record.data === "object") {
    collectReferenceAssetsFromValue(record.data, output, seenUrls, options);
  }
}

export function referenceAssetsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): ReferenceAsset[] {
  const inputs = resolvedInputs.inputs ?? {};
  const seenUrls = new Set<string>();
  const referenceAssets: ReferenceAsset[] = [];

  for (const key of preferredKeys) {
    collectReferenceAssetsFromValue(inputs[key]?.value, referenceAssets, seenUrls);
  }

  return referenceAssets;
}

export function referenceVideoAssetsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): ReferenceAsset[] {
  const inputs = resolvedInputs.inputs ?? {};
  const seenUrls = new Set<string>();
  const referenceAssets: ReferenceAsset[] = [];

  for (const key of preferredKeys) {
    collectReferenceAssetsFromValue(inputs[key]?.value, referenceAssets, seenUrls, {
      acceptedKinds: ["video"],
      defaultMimeType: "video/mp4",
      mimePrefix: "video/",
    });
  }

  return referenceAssets;
}

export function referenceAudioAssetsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): ReferenceAsset[] {
  const inputs = resolvedInputs.inputs ?? {};
  const seenUrls = new Set<string>();
  const referenceAssets: ReferenceAsset[] = [];

  for (const key of preferredKeys) {
    collectReferenceAssetsFromValue(inputs[key]?.value, referenceAssets, seenUrls, {
      acceptedKinds: ["audio"],
      defaultMimeType: "audio/mpeg",
      mimePrefix: "audio/",
    });
  }

  return referenceAssets;
}

export function uniqueReferenceAssets(assets: ReferenceAsset[]): ReferenceAsset[] {
  const seen = new Set<string>();
  const uniqueAssets: ReferenceAsset[] = [];

  for (const asset of assets) {
    const key = asset.url ?? asset.base64Data;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueAssets.push(asset);
  }

  return uniqueAssets;
}

export function allMediaReferenceAssetsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): ReferenceAsset[] {
  return uniqueReferenceAssets([
    ...referenceAssetsFromInputs(resolvedInputs, preferredKeys),
    ...referenceVideoAssetsFromInputs(resolvedInputs, preferredKeys),
    ...referenceAudioAssetsFromInputs(resolvedInputs, preferredKeys),
  ]);
}
