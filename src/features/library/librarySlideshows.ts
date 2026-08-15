import type { SlideshowDoc } from "../../types";

export function visibleLibrarySlideshows(slideshows: SlideshowDoc[]) {
  return slideshows
    .filter((slideshow) => slideshow.status !== "discarded")
    .sort((first, second) => second.updatedAt - first.updatedAt);
}
