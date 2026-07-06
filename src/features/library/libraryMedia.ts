import type { MediaLightboxItem } from "../../components/MediaLightbox";
import type { LibraryOutput } from "./libraryTypes";

export function formatDateTime(value: number) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function isImageOutput(output: LibraryOutput) {
  return output.mimeType?.startsWith("image/") || output.type === "image";
}

export function isVideoOutput(output: LibraryOutput) {
  return output.mimeType?.startsWith("video/") || output.type === "video";
}

export function lightboxMediaForOutput(output: LibraryOutput): MediaLightboxItem {
  return {
    kind: isVideoOutput(output) ? "video" : "image",
    src: output.storageUrl,
    title: output.title,
    meta: [
      output.source === "create"
        ? "Create"
        : "Reusable asset",
      output.provider,
      output.model,
    ].filter(Boolean).join(" · "),
  };
}

export function editableImageOutput(output: LibraryOutput) {
  return Boolean(
    output.artifactId &&
      output.source === "create" &&
      (output.type === "image" || output.mimeType?.startsWith("image/"))
  );
}

export function generationAspectRatio(output: LibraryOutput) {
  const aspectRatio = output.aspectRatio?.replace(/\s*\/\s*/g, ":");
  return aspectRatio && /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(aspectRatio)
    ? aspectRatio
    : undefined;
}

export function libraryImageEditPrompt(instruction: string) {
  return [
    instruction.trim(),
    "Use the provided reference image as the source image. Apply only the requested edit. Preserve the original subject, composition, framing, background, lighting, colors, camera angle, and style unless the requested edit directly requires a change.",
  ].join("\n\n");
}

export function libraryImageReference(output: LibraryOutput) {
  return {
    url: output.storageUrl,
    mimeType: output.mimeType?.startsWith("image/") ? output.mimeType : "image/png",
    description: "Current saved image to edit",
  };
}

export function extensionFromMimeType(mimeType: string) {
  const subtype = mimeType.split("/")[1]?.split("+")[0];
  if (!subtype) return "bin";
  return subtype === "jpeg" ? "jpg" : subtype;
}

export function mediaTypeFromFile(file?: File): "image" | "video" | "audio" | "file" {
  if (file?.type.startsWith("image/")) return "image";
  if (file?.type.startsWith("video/")) return "video";
  if (file?.type.startsWith("audio/")) return "audio";
  return "file";
}

export function assetKindFromFile(file: File) {
  if (file.type.startsWith("audio/")) return "voice" as const;
  if (file.type.startsWith("image/")) return "style_reference" as const;
  return "other" as const;
}

export async function clipboardMediaFilesFromRead() {
  const read = (navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>;
  } | undefined)?.read;
  if (!read) return [];

  const items = await read.call(navigator.clipboard);
  const files: File[] = [];

  for (const item of items) {
    const type = item.types.find((itemType) =>
      itemType.startsWith("image/") ||
        itemType.startsWith("video/") ||
        itemType.startsWith("audio/")
    );
    if (!type) continue;
    const blob = await item.getType(type);
    files.push(
      new File([blob], `pasted-${Date.now()}.${extensionFromMimeType(type)}`, {
        type,
      })
    );
  }

  return files;
}
