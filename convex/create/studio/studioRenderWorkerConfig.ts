import type { Id } from "../../_generated/dataModel";

export function studioRenderWorkerUrl() {
  return process.env.STUDIO_RENDER_WORKER_URL?.trim().replace(/\/+$/, "");
}

export function studioRenderWorkerApiKey() {
  return process.env.STUDIO_RENDER_WORKER_API_KEY?.trim();
}

export function studioRenderCallbackUrl() {
  return process.env.STUDIO_RENDER_CALLBACK_URL?.trim().replace(/\/+$/, "") ||
    process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/, "");
}

export function studioRenderCallbackApiKey() {
  return process.env.STUDIO_RENDER_CALLBACK_API_KEY?.trim() ||
    process.env.STUDIO_RENDER_WORKER_API_KEY?.trim();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function renderFpsFromSettings(settings: unknown) {
  if (!isRecord(settings)) return 30;
  const fps = settings.fps;
  return typeof fps === "number" && Number.isFinite(fps) && fps > 0
    ? Math.min(120, Math.floor(fps))
    : 30;
}

export function artifactIdsFromDraft(draft: unknown) {
  if (!isRecord(draft)) return [];
  const values = [
    ...(Array.isArray(draft.clips) ? draft.clips : []),
    ...(Array.isArray(draft.audioTracks) ? draft.audioTracks : []),
  ];
  return [
    ...new Set(
      values.flatMap((item) =>
        isRecord(item) && typeof item.artifactId === "string" ? [item.artifactId] : []
      )
    ),
  ] as Id<"artifacts">[];
}

export function aspectRatioFromDraft(draft: unknown) {
  return isRecord(draft) && typeof draft.aspectRatio === "string" ? draft.aspectRatio : undefined;
}

export function durationSecondsFromDraft(draft: unknown) {
  if (!isRecord(draft)) return undefined;
  const clipDurations = Array.isArray(draft.clips)
    ? draft.clips.map((clip) => {
        if (!isRecord(clip)) return 0;
        const duration = typeof clip.durationSeconds === "number" ? clip.durationSeconds : 0;
        const trimStart = typeof clip.trimStartSeconds === "number" ? clip.trimStartSeconds : 0;
        const trimEnd = typeof clip.trimEndSeconds === "number" ? clip.trimEndSeconds : duration;
        return Math.max(0, trimEnd - trimStart);
      })
    : [];
  const audioEnds = Array.isArray(draft.audioTracks)
    ? draft.audioTracks.map((track) => {
        if (!isRecord(track)) return 0;
        const start = typeof track.startSeconds === "number" ? track.startSeconds : 0;
        const duration = typeof track.durationSeconds === "number" ? track.durationSeconds : 0;
        const trimStart = typeof track.trimStartSeconds === "number" ? track.trimStartSeconds : 0;
        const trimEnd = typeof track.trimEndSeconds === "number" ? track.trimEndSeconds : duration;
        return start + Math.max(0, trimEnd - trimStart);
      })
    : [];
  const duration = Math.max(
    clipDurations.reduce((total, value) => total + value, 0),
    ...audioEnds,
    0
  );
  return duration > 0 ? duration : undefined;
}
