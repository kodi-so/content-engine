import { drawCoverImage, drawTextOverlays } from "../../lib/composition/canvasText";
import { dimensionsForAspectRatio } from "../../lib/composition/aspectRatios";
import {
  activeTextOverlaysAtTime,
  clipDuration,
  compositionDuration,
  type VideoCompositionDraft,
  type VideoComposerClip,
} from "./videoComposerModel";

type RenderProgress = {
  clipIndex: number;
  progress: number;
  timeSeconds: number;
};

type RenderOptions = {
  fps?: number;
  onProgress?: (progress: RenderProgress) => void;
};

function recorderMimeType() {
  const supportedTypes = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function waitForEvent<T extends Event>(
  target: EventTarget,
  eventName: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onEvent = (event: Event) => {
      cleanup();
      resolve(event as T);
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Unable to load media for ${eventName}`));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function loadVideo(clip: VideoComposerClip) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.preload = "auto";
  video.src = clip.storageUrl;
  await waitForEvent(video, "loadedmetadata");
  return video;
}

function seekVideo(video: HTMLVideoElement, timeSeconds: number) {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to seek video"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = timeSeconds;
  });
}

function nextAnimationFrame() {
  return new Promise<number>((resolve) => requestAnimationFrame(resolve));
}

async function playVideo(video: HTMLVideoElement) {
  try {
    await video.play();
  } catch {
    video.muted = true;
    await video.play();
  }
}

export async function renderVideoCompositionToBlob(
  draft: VideoCompositionDraft,
  options: RenderOptions = {}
) {
  if (draft.clips.length === 0) {
    throw new Error("Add at least one video clip before exporting.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support video export.");
  }

  const fps = options.fps ?? 30;
  const dimensions = dimensionsForAspectRatio(draft.aspectRatio);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create video renderer.");

  const canvasStream = canvas.captureStream(fps);
  const AudioContextConstructor = window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  const audioContext = AudioContextConstructor ? new AudioContextConstructor() : undefined;
  const audioDestination = audioContext?.createMediaStreamDestination();
  const stream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(audioDestination?.stream.getAudioTracks() ?? []),
  ]);
  const chunks: Blob[] = [];
  const mimeType = recorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const totalDuration = compositionDuration(draft.clips);

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("stop", () => {
      resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
    }, { once: true });
    recorder.addEventListener("error", () => {
      reject(new Error("Video export failed."));
    }, { once: true });
  });

  if (audioContext?.state === "suspended") {
    await audioContext.resume();
  }

  recorder.start(250);

  let timelineCursor = 0;
  for (let clipIndex = 0; clipIndex < draft.clips.length; clipIndex += 1) {
    const clip = draft.clips[clipIndex];
    const video = await loadVideo(clip);
    const source = audioContext && audioDestination
      ? audioContext.createMediaElementSource(video)
      : undefined;
    source?.connect(audioDestination!);

    const trimStart = Math.min(clip.trimStartSeconds, Math.max(0, video.duration - 0.05));
    const trimEnd = Math.min(clip.trimEndSeconds ?? video.duration, video.duration);
    const targetDuration = Math.max(0, trimEnd - trimStart);
    if (targetDuration <= 0) continue;

    await seekVideo(video, trimStart);
    await playVideo(video);

    while (!video.ended && video.currentTime < trimEnd) {
      const localTime = Math.min(targetDuration, video.currentTime - trimStart);
      const globalTime = timelineCursor + localTime;
      ctx.fillStyle = "#111513";
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);
      drawCoverImage(ctx, video, dimensions.width, dimensions.height);
      drawTextOverlays(
        ctx,
        activeTextOverlaysAtTime(draft.textOverlays, globalTime, totalDuration),
        dimensions
      );
      options.onProgress?.({
        clipIndex,
        progress: totalDuration ? Math.min(1, globalTime / totalDuration) : 0,
        timeSeconds: globalTime,
      });
      await nextAnimationFrame();
    }

    video.pause();
    source?.disconnect();
    timelineCursor += clipDuration({
      ...clip,
      durationSeconds: video.duration,
      trimEndSeconds: trimEnd,
    });
  }

  recorder.stop();
  canvasStream.getTracks().forEach((track) => track.stop());
  await audioContext?.close();
  return await completed;
}
