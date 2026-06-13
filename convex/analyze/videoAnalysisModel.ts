import type { Doc } from "../_generated/dataModel";
import { fetchRemoteMediaForAnalysis } from "./mediaResolver";

export const DEFAULT_ANALYSIS_MODEL = "gemini-2.5-flash";
export const GEMINI_PROVIDER = "gemini";
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const GEMINI_FILE_ACTIVE_TIMEOUT_MS = 60_000;
const GEMINI_FILE_POLL_INTERVAL_MS = 1_500;

export type VideoAnalysisJob = Doc<"videoAnalysisJobs">;
export type VideoAnalysisResult = {
  title?: string;
  summary?: string;
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
    sceneBreakdown?: Array<{
      timestamp?: string;
      description?: string;
      visualNotes?: string;
      audioNotes?: string;
      creatorPurpose?: string;
    }>;
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

export function cleanOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for video analysis");
  }

  return apiKey;
}

export function sourcePlatformForUrl(urlValue: string): VideoAnalysisJob["sourcePlatform"] {
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube";
    if (hostname.includes("tiktok.com")) return "tiktok";
    if (hostname.includes("instagram.com")) return "instagram";
    if (hostname.includes("facebook.com") || hostname.includes("fb.watch")) return "facebook";
    if (/\.(mp4|mov|webm|m4v|mp3|wav|m4a)(\?|$)/i.test(urlValue)) return "direct_file";
    return "unknown";
  } catch {
    throw new Error("Paste a valid video URL");
  }
}

function buildAnalysisPrompt(job: VideoAnalysisJob) {
  const modeInstructions: Record<VideoAnalysisJob["mode"], string> = {
    inspiration:
      "Extract everything important: transcript, on-screen text, visual scenes, audio cues, hook, structure, pacing, creator strategy, reusable patterns, and a practical brief for making an original version. If the source is a tutorial, also capture steps, tools, commands, settings, code, and implementation caveats.",
    technical:
      "Prioritize exact steps, commands, UI actions, tools, code, file paths, settings, and implementation caveats shown or mentioned.",
    transcript:
      "Prioritize a clean transcript, speaker/audio notes, on-screen text, and timestamps. Still include a concise visual scene breakdown.",
  };

  return [
    "Analyze this source for a creator using Content Engine.",
    modeInstructions[job.mode],
    "Default behavior is comprehensive analysis. The user should not need to choose between transcript, visuals, audio, or creative strategy.",
    "Return only valid JSON. Do not wrap it in Markdown.",
    "If details are not visible or audible, use an empty string or empty array instead of guessing.",
    "For transcript text, preserve meaningful wording but remove filler only when it improves readability.",
    "For scene timestamps, use approximate mm:ss timestamps.",
    "Every reuseBrief field must be grounded in the observed source. Preserve the source's actual category, transformation, setting, subjects, timing, text, and audio cues unless the user explicitly asks for a different domain.",
    "Do not invent unrelated example concepts. If a reusable generation prompt would require details not present in the source, return an empty string for that field.",
    job.customPrompt ? `User focus: ${job.customPrompt}` : "",
    "",
    "JSON shape:",
    JSON.stringify({
      title: "Short descriptive title",
      summary: "Plain-language summary of what happens and why it matters",
      platformRead: "What platform/style this resembles",
      durationEstimate: "Approximate duration if detectable",
      transcript: {
        text: "Speech transcript or empty string",
        confidenceNotes: "Any uncertainty about speech/audio",
        notablePhrases: ["phrases worth reusing structurally"],
      },
      visuals: {
        style: "Visual style and art direction",
        setting: "Primary environment",
        subjects: ["people, products, props, UI, or scenes shown"],
        cameraAndEditing: "Framing, camera movement, cuts, overlays, captions",
        onScreenText: ["visible text"],
        sceneBreakdown: [
          {
            timestamp: "00:00",
            description: "What happens",
            visualNotes: "Composition, text, motion, objects",
            audioNotes: "Speech, music, sound, silence",
            creatorPurpose: "Why this moment exists",
          },
        ],
      },
      audio: {
        speechDelivery: "Voice, tone, speed, speaker dynamics",
        musicAndSound: "Music, sound effects, audio bed, rhythm",
        extractableNotes: ["audio cues or reusable timing notes"],
      },
      creativeAnalysis: {
        hook: "What makes the first moment work",
        structure: ["beat-by-beat narrative structure"],
        pacing: "How fast the piece moves",
        whyItWorks: ["specific strengths"],
        risksToAvoid: ["things to avoid copying directly or weak points"],
      },
      reuseBrief: {
        copyablePattern: "The reusable pattern without copying the creator's IP",
        originalVersionPrompt: "Prompt for making an original concept from this pattern",
        shotList: ["shots to create an original version"],
        scriptTemplate: "Reusable script template",
        generationPrompt: "Detailed prompt another LLM/video tool can use",
      },
    }),
  ].filter(Boolean).join("\n");
}

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseAnalysisResult(text: string): VideoAnalysisResult {
  const parsed = JSON.parse(stripJsonFence(text)) as VideoAnalysisResult;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Gemini returned an invalid analysis object");
  }

  return parsed;
}

export function analysisTitle(result: VideoAnalysisResult, fallback: string) {
  return cleanOptionalText(result.title)?.slice(0, 120) ?? fallback;
}

export function analysisSummary(result: VideoAnalysisResult) {
  return cleanOptionalText(result.summary)?.slice(0, 1400);
}

export function analysisTranscript(result: VideoAnalysisResult) {
  return cleanOptionalText(result.transcript?.text);
}

async function analyzeMediaBytes(args: {
  bytes: ArrayBuffer;
  displayName: string;
  job: VideoAnalysisJob;
  metadata?: Record<string, unknown>;
  mimeType: string;
}) {
  const geminiFile = await uploadFileToGemini({
    bytes: args.bytes,
    displayName: args.displayName,
    mimeType: args.mimeType,
  });
  const prompt = buildAnalysisPrompt(args.job);
  const analysis = await geminiGenerateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: {
              fileUri: geminiFile.uri,
              mimeType: geminiFile.mimeType,
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.25,
      maxOutputTokens: 8192,
    },
    model: args.job.model,
  });

  return {
    raw: analysis.data,
    result: args.metadata
      ? {
        ...parseAnalysisResult(analysis.text),
        resolverMetadata: args.metadata,
      }
      : parseAnalysisResult(analysis.text),
  };
}

export async function geminiGenerateContent(args: {
  contents: unknown[];
  generationConfig?: Record<string, unknown>;
  model?: string;
}) {
  const apiKey = getGeminiApiKey();
  const model = args.model ?? DEFAULT_ANALYSIS_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: args.contents,
        generationConfig: args.generationConfig,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini analysis failed: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response");

  return { data, text };
}

async function uploadFileToGemini(args: {
  bytes: ArrayBuffer;
  displayName: string;
  mimeType: string;
}) {
  const apiKey = getGeminiApiKey();
  const startResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(args.bytes.byteLength),
        "X-Goog-Upload-Header-Content-Type": args.mimeType,
        "X-Goog-Upload-Protocol": "resumable",
      },
      body: JSON.stringify({
        file: { display_name: args.displayName },
      }),
    }
  );

  if (!startResponse.ok) {
    throw new Error(`Gemini file upload failed to start: ${await startResponse.text()}`);
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini did not return an upload URL");

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(args.bytes.byteLength),
      "Content-Type": args.mimeType,
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    body: args.bytes,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Gemini file upload failed: ${await uploadResponse.text()}`);
  }

  const data = await uploadResponse.json();
  const file = data.file;
  if (!file?.name || !file?.uri) throw new Error("Gemini file upload returned no file URI");

  const activeFile = await waitForGeminiFileActive({
    apiKey,
    fallbackMimeType: args.mimeType,
    file,
  });

  return {
    mimeType: activeFile.mimeType ?? args.mimeType,
    uri: activeFile.uri as string,
  };
}

async function waitForGeminiFileActive(args: {
  apiKey: string;
  fallbackMimeType: string;
  file: {
    error?: { message?: string };
    mimeType?: string;
    name: string;
    state?: string;
    uri: string;
  };
}) {
  let file = args.file;
  const startedAt = Date.now();

  while (file.state && file.state !== "ACTIVE") {
    if (file.state === "FAILED") {
      throw new Error(`Gemini file processing failed: ${file.error?.message ?? "unknown error"}`);
    }
    if (Date.now() - startedAt > GEMINI_FILE_ACTIVE_TIMEOUT_MS) {
      throw new Error("Gemini file processing timed out. Try again with a shorter clip.");
    }

    await sleep(GEMINI_FILE_POLL_INTERVAL_MS);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${args.apiKey}`
    );
    if (!response.ok) {
      throw new Error(`Gemini file status check failed: ${await response.text()}`);
    }

    file = await response.json();
    file.uri = file.uri ?? args.file.uri;
    file.mimeType = file.mimeType ?? args.fallbackMimeType;
  }

  return file;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeYoutubeUrl(job: VideoAnalysisJob) {
  if (!job.sourceUrl) throw new Error("Source URL is missing");
  const prompt = buildAnalysisPrompt(job);
  const response = await geminiGenerateContent({
    contents: [
      {
        role: "user",
        parts: [
          { fileData: { fileUri: job.sourceUrl } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.25,
      maxOutputTokens: 8192,
    },
    model: job.model,
  });

  return {
    raw: response.data,
    result: parseAnalysisResult(response.text),
  };
}

export async function analyzeRemoteUrlSource(job: VideoAnalysisJob) {
  if (!job.sourceUrl) throw new Error("Source URL is missing");
  const media = await fetchRemoteMediaForAnalysis({
    maxBytes: MAX_UPLOAD_BYTES,
    sourcePlatform: job.sourcePlatform,
    sourceUrl: job.sourceUrl,
  });

  return await analyzeMediaBytes({
    bytes: media.bytes,
    displayName: media.fileName,
    job,
    metadata: media.metadata,
    mimeType: media.mimeType,
  });
}

export async function analyzeUploadedSource(job: VideoAnalysisJob, storageUrl: string) {
  const response = await fetch(storageUrl);
  if (!response.ok) {
    throw new Error(`Could not fetch uploaded media: ${response.status}`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Upload is too large for inline analysis. Use a clip under 100 MB.");
  }

  const mimeType = job.mimeType ?? response.headers.get("content-type") ?? "video/mp4";
  return await analyzeMediaBytes({
    bytes,
    displayName: job.fileName ?? "Content Engine analysis upload",
    job,
    mimeType,
  });
}
