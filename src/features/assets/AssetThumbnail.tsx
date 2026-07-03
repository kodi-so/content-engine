import { File, Music, Play, Video } from "lucide-react";
import { useState } from "react";
import { isAudioAsset, isImageAsset, isVideoAsset } from "./assetMedia";
import type { AssetPreviewItem } from "./assetTypes";

function mediaSource(asset: AssetPreviewItem) {
  return asset.storageUrl ?? asset.thumbnailUrl ?? "";
}

export function AssetThumbnail({
  asset,
  audioControls = false,
  className = "",
  mediaClassName = "",
  onAspectRatio,
  videoPlayIndicator = "corner",
}: {
  asset: AssetPreviewItem;
  audioControls?: boolean;
  className?: string;
  mediaClassName?: string;
  onAspectRatio?: (aspectRatio: string) => void;
  videoPlayIndicator?: "corner" | "centerCompact";
}) {
  const [failed, setFailed] = useState(false);
  const source = mediaSource(asset);
  const imageSource = asset.thumbnailUrl ?? asset.storageUrl;
  const isImage = isImageAsset(asset);
  const isVideo = isVideoAsset(asset);
  const isAudio = isAudioAsset(asset);
  const shellClassName = `relative grid h-full w-full place-items-center overflow-hidden bg-[var(--color-page-quiet)] text-[var(--color-ink-muted)] ${className}`;
  const fitClassName = `h-full w-full object-cover ${mediaClassName}`;

  if (!source || failed) {
    const Icon = isVideo ? Video : isAudio ? Music : File;
    return (
      <div className={shellClassName}>
        <Icon size={22} />
      </div>
    );
  }

  if (isImage && imageSource) {
    return (
      <div className={shellClassName}>
        <img
          alt=""
          className={fitClassName}
          onError={() => setFailed(true)}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth && image.naturalHeight) {
              onAspectRatio?.(`${image.naturalWidth} / ${image.naturalHeight}`);
            }
          }}
          src={imageSource}
        />
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={shellClassName}>
        <video
          aria-label={asset.title}
          className={fitClassName}
          muted
          onError={() => setFailed(true)}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.videoWidth && video.videoHeight) {
              onAspectRatio?.(`${video.videoWidth} / ${video.videoHeight}`);
            }
          }}
          playsInline
          preload="metadata"
          src={asset.storageUrl ?? source}
        />
        <span
          className={
            videoPlayIndicator === "centerCompact"
              ? "absolute left-1/2 top-1/2 grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow-[0_4px_10px_rgb(15_23_42_/_0.18)]"
              : "absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-black/55 text-white shadow-[0_8px_18px_rgb(15_23_42_/_0.22)]"
          }
        >
          <Play
            size={videoPlayIndicator === "centerCompact" ? 8 : 13}
            fill="currentColor"
          />
        </span>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className={`${shellClassName} gap-[var(--space-2)] p-[var(--space-3)]`}>
        <Music size={24} />
        {audioControls && asset.storageUrl ? (
          <audio className="w-full" controls src={asset.storageUrl} />
        ) : null}
      </div>
    );
  }

  return (
    <div className={shellClassName}>
      <File size={22} />
    </div>
  );
}
