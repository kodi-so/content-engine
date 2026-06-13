import type { Doc } from "../../../convex/_generated/dataModel";

export type AnalysisJob = Doc<"videoAnalysisJobs">;
export type AnalysisQuestion = Doc<"videoAnalysisQuestions">;
export type SourceMode = "url" | "upload";

export type Scene = {
  timestamp?: string;
  description?: string;
  visualNotes?: string;
  audioNotes?: string;
  creatorPurpose?: string;
};

export type AnalysisResult = {
  title?: string;
  summary?: string;
  platformRead?: string;
  durationEstimate?: string;
  transcript?: {
    text?: string;
    confidenceNotes?: string;
    notablePhrases?: string[];
  };
  visuals?: {
    style?: string;
    setting?: string;
    subjects?: string[];
    cameraAndEditing?: string;
    onScreenText?: string[];
    sceneBreakdown?: Scene[];
  };
  audio?: {
    speechDelivery?: string;
    musicAndSound?: string;
    extractableNotes?: string[];
  };
  creativeAnalysis?: {
    hook?: string;
    structure?: string[];
    pacing?: string;
    whyItWorks?: string[];
    risksToAvoid?: string[];
  };
  reuseBrief?: {
    copyablePattern?: string;
    originalVersionPrompt?: string;
    shotList?: string[];
    scriptTemplate?: string;
    generationPrompt?: string;
  };
};

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function resultFromJob(job?: AnalysisJob | null): AnalysisResult {
  return isRecord(job?.result) ? (job.result as AnalysisResult) : {};
}

export function formatDateTime(value?: number) {
  if (!value) return "Not started";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function statusLabel(status: AnalysisJob["status"]) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Analyzing";
  if (status === "completed") return "Ready";
  return "Failed";
}

export function statusClass(status: AnalysisJob["status"]) {
  if (status === "completed") return "text-[var(--color-accent-strong)]";
  if (status === "failed") return "text-[oklch(52%_0.18_25)]";
  return "text-[var(--color-primary)]";
}

export function sourceLabel(job: AnalysisJob) {
  if (job.sourceType === "upload") return job.fileName ?? "Uploaded media";
  if (job.sourcePlatform === "youtube") return "YouTube URL";
  if (job.sourcePlatform === "tiktok") return "TikTok URL";
  if (job.sourcePlatform === "instagram") return "Instagram URL";
  if (job.sourcePlatform === "facebook") return "Facebook URL";
  return "Source URL";
}

export function sourcePlatformForUrl(value: string): AnalysisJob["sourcePlatform"] {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube";
    if (hostname.includes("tiktok.com")) return "tiktok";
    if (hostname.includes("instagram.com")) return "instagram";
    if (hostname.includes("facebook.com") || hostname.includes("fb.watch")) return "facebook";
    if (/\.(mp4|mov|webm|m4v|mp3|wav|m4a)(\?|$)/i.test(value)) return "direct_file";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function textOrFallback(value: string | undefined, fallback = "Not detected") {
  return value?.trim() || fallback;
}
