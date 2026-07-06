import type { ReferenceMentionOption } from "../../components/references/ReferenceAliasTextarea";
import type { CreateLocalFileFieldMeta } from "../../components/create/CreateGenerationConfigField";
import type { CreateMode, CreateNodeType } from "../../lib/create/createModes";
import { localReferenceFilesFromConfig, type LocalReferenceFileKind } from "../../lib/create/createConfigFields";

export function draftName(prompt: string) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!cleanPrompt) return "Untitled creation";
  return cleanPrompt.length > 54 ? `${cleanPrompt.slice(0, 54)}...` : cleanPrompt;
}

export function resultTitle(prompt: string, fallback: string) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!cleanPrompt) return fallback;
  return cleanPrompt.length > 48 ? `${cleanPrompt.slice(0, 48)}...` : cleanPrompt;
}

export function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function numberConfigValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function referenceAssetsFromConfig(
  config: Record<string, unknown>,
  key: string,
  kind: LocalReferenceFileKind
) {
  return localReferenceFilesFromConfig(config, key, kind).map((reference) => ({
    alias: reference.alias,
    url: reference.storageUrl,
    mimeType: reference.mimeType ?? "application/octet-stream",
    description: reference.title,
    temporary: reference.temporary === true,
    storageId: reference.storageId,
  }));
}

export function referenceMentionOptionsFromConfig(
  config: Record<string, unknown>
): ReferenceMentionOption[] {
  const referenceFields: Array<{ key: string; kind: LocalReferenceFileKind }> = [
    { key: "localReferenceImages", kind: "image" },
    { key: "localStartFrameImages", kind: "image" },
    { key: "localEndFrameImages", kind: "image" },
    { key: "localReferenceVideos", kind: "video" },
    { key: "localReferenceAudios", kind: "audio" },
  ];
  const seenAliases = new Set<string>();

  return referenceFields.flatMap(({ key, kind }) =>
    localReferenceFilesFromConfig(config, key, kind).flatMap((reference) => {
      const alias = reference.alias?.trim();
      if (!alias || seenAliases.has(alias.toLowerCase())) return [];
      seenAliases.add(alias.toLowerCase());
      return [{
        alias,
        kind,
        mimeType: reference.mimeType,
        storageUrl: reference.storageUrl,
        title: reference.title,
      }];
    })
  );
}

export function visibleConfigValues(
  config: Record<string, unknown>,
  fieldKeys: string[]
): Record<string, unknown> {
  const visibleKeys = new Set(fieldKeys);
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => visibleKeys.has(key))
  );
}

export function mediaPreviewTitle(kind: CreateMode) {
  switch (kind) {
    case "image":
      return "Generating image";
    case "video":
      return "Generating video";
    case "audio":
      return "Generating audio";
    case "slideshow":
      return "Queueing slideshow";
  }
}

export function createLocalFileFieldMeta(args: {
  createNodeType: CreateNodeType;
  fieldKey: string;
}): CreateLocalFileFieldMeta | null {
  if (args.fieldKey === "localReferenceImages") {
    return {
      accept: "image/*",
      kind: "image",
      multiple: true,
      maxCount: args.createNodeType === "image_generation" ? 4 : undefined,
    };
  }

  if (args.fieldKey === "localStartFrameImages" || args.fieldKey === "localEndFrameImages") {
    return {
      accept: "image/*",
      kind: "image",
      multiple: false,
      maxCount: 1,
    };
  }

  if (args.fieldKey === "localReferenceVideos") {
    return {
      accept: "video/*",
      kind: "video",
      multiple: true,
    };
  }

  if (args.fieldKey === "localReferenceAudios") {
    return {
      accept: "audio/*",
      kind: "audio",
      multiple: true,
    };
  }

  return null;
}
