import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  mediaKindForClip,
  type VideoComposerAudioTrack,
  type VideoComposerClip,
} from "./videoComposerModel";

function mediaDurationForUrl(url: string, kind: "audio" | "video") {
  return new Promise<number>((resolve) => {
    const element = document.createElement(kind);
    element.preload = "metadata";
    element.crossOrigin = "anonymous";
    element.onloadedmetadata = () => resolve(element.duration || 0);
    element.onerror = () => resolve(0);
    element.src = url;
  });
}

export function useVideoComposerMediaDurations({
  audioTracks,
  clips,
  setAudioTracks,
  setClips,
}: {
  audioTracks: VideoComposerAudioTrack[];
  clips: VideoComposerClip[];
  setAudioTracks: Dispatch<SetStateAction<VideoComposerAudioTrack[]>>;
  setClips: Dispatch<SetStateAction<VideoComposerClip[]>>;
}) {
  useEffect(() => {
    const missingDurationClips = clips.filter((clip) =>
      !clip.durationSeconds && mediaKindForClip(clip) !== "image"
    );
    if (!missingDurationClips.length) return;
    let canceled = false;
    for (const clip of missingDurationClips) {
      void mediaDurationForUrl(clip.storageUrl, "video").then((durationSeconds) => {
        if (canceled || !durationSeconds) return;
        setClips((current) =>
          current.map((currentClip) =>
            currentClip.id === clip.id
              ? {
                  ...currentClip,
                  durationSeconds,
                  trimEndSeconds: currentClip.trimEndSeconds ?? durationSeconds,
                }
              : currentClip
          )
        );
      });
    }
    return () => {
      canceled = true;
    };
  }, [clips, setClips]);

  useEffect(() => {
    const missingDurationTracks = audioTracks.filter((track) => !track.durationSeconds);
    if (!missingDurationTracks.length) return;
    let canceled = false;
    for (const track of missingDurationTracks) {
      void mediaDurationForUrl(track.storageUrl, "audio").then((durationSeconds) => {
        if (canceled || !durationSeconds) return;
        setAudioTracks((current) =>
          current.map((currentTrack) =>
            currentTrack.id === track.id
              ? {
                  ...currentTrack,
                  durationSeconds,
                  trimEndSeconds: currentTrack.trimEndSeconds ?? durationSeconds,
                }
              : currentTrack
          )
        );
      });
    }
    return () => {
      canceled = true;
    };
  }, [audioTracks, setAudioTracks]);
}
