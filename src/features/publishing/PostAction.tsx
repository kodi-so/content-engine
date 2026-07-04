import { Send } from "lucide-react";
import { useState } from "react";
import { PostComposerModal } from "./PostComposerModal";
import type { PostComposerMedia } from "./postMedia";

/**
 * Self-contained "Post" button + composer modal. Drop it anywhere a video or
 * slideshow is displayed to offer publishing through the shared composer.
 */
export function PostAction({
  className = "secondary-button",
  iconSize = 15,
  label = "Post",
  media,
}: {
  className?: string;
  iconSize?: number;
  label?: string;
  media: PostComposerMedia;
}) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  return (
    <>
      <button
        className={className}
        onClick={() => setIsComposerOpen(true)}
        type="button"
      >
        <Send size={iconSize} />
        {label}
      </button>
      {isComposerOpen ? (
        <PostComposerModal media={media} onClose={() => setIsComposerOpen(false)} />
      ) : null}
    </>
  );
}
