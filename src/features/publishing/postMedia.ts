import type { Id } from "../../../convex/_generated/dataModel";
import type { SlideshowDoc } from "../../types";
import type { LibraryOutput } from "../library/libraryTypes";

export type PostMediaItem = {
  artifactId?: Id<"artifacts">;
  storageUrl: string;
  mimeType?: string;
  kind: "image" | "video";
  title?: string;
};

export type PostComposerMedia =
  | { kind: "video"; title: string; item: PostMediaItem }
  | { kind: "slideshow"; title: string; slideshow: SlideshowDoc };

export function isVideoLibraryOutput(output: LibraryOutput) {
  return output.type === "video" || Boolean(output.mimeType?.startsWith("video/"));
}

export function postMediaForLibraryOutput(
  output: LibraryOutput
): PostComposerMedia | null {
  if (!isVideoLibraryOutput(output) || !output.storageUrl) return null;

  return {
    kind: "video",
    title: output.title,
    item: {
      artifactId: output.artifactId,
      storageUrl: output.storageUrl,
      mimeType: output.mimeType,
      kind: "video",
      title: output.title,
    },
  };
}

export function postMediaForSlideshow(slideshow: SlideshowDoc): PostComposerMedia {
  return {
    kind: "slideshow",
    title: slideshow.title,
    slideshow,
  };
}
