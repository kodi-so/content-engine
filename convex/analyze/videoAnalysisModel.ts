import { fetchRemoteMediaForAnalysis, type RemoteMediaPartForAnalysis } from "./mediaResolver";
import {
  buildAnalysisPrompt,
  buildSlideshowAnalysisPrompt,
  normalizeSlideshowResult,
  parseAnalysisResult,
  slideshowAnalysisResponseSchema,
  type VideoAnalysisJob,
} from "./videoAnalysisContracts";

export {
  analysisSummary,
  analysisTitle,
  analysisTranscript,
  cleanOptionalText,
  type VideoAnalysisJob,
  type VideoAnalysisResult,
} from "./videoAnalysisContracts";

export const DEFAULT_ANALYSIS_MODEL = "gemini-2.5-flash";
export const GEMINI_PROVIDER = "gemini";
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const GEMINI_FILE_ACTIVE_TIMEOUT_MS = 60_000;
const GEMINI_FILE_POLL_INTERVAL_MS = 1_500;
const MAX_INLINE_SLIDESHOW_IMAGE_BYTES = 18 * 1024 * 1024;

function analysisLog(event: string, details: Record<string, unknown> = {}) {
  console.info(`[analyze.videoAnalysisModel] ${event}`, details);
}

function analysisError(event: string, details: Record<string, unknown> = {}) {
  console.error(`[analyze.videoAnalysisModel] ${event}`, details);
}

function sourceHostForLog(sourceUrl?: string) {
  if (!sourceUrl) return undefined;
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "invalid-url";
  }
}

function jobLogContext(job: VideoAnalysisJob) {
  return {
    jobId: job._id,
    sourceType: job.sourceType,
    sourcePlatform: job.sourcePlatform,
    sourceHost: sourceHostForLog(job.sourceUrl),
    mode: job.mode,
    model: job.model,
  };
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

async function analyzeMediaBytes(args: {
  bytes: ArrayBuffer;
  displayName: string;
  job: VideoAnalysisJob;
  metadata?: Record<string, unknown>;
  mimeType: string;
}) {
  analysisLog("media_analysis_upload_start", {
    ...jobLogContext(args.job),
    displayName: args.displayName,
    mimeType: args.mimeType,
    byteLength: args.bytes.byteLength,
  });
  const geminiFile = await uploadFileToGemini({
    bytes: args.bytes,
    displayName: args.displayName,
    mimeType: args.mimeType,
  });
  const prompt = buildAnalysisPrompt(args.job);
  analysisLog("media_analysis_generate_start", {
    ...jobLogContext(args.job),
    fileMimeType: geminiFile.mimeType,
  });
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
  analysisLog("media_analysis_generate_complete", jobLogContext(args.job));

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

async function uploadMediaPartToGemini(part: RemoteMediaPartForAnalysis) {
  return await uploadFileToGemini({
    bytes: part.bytes,
    displayName: part.fileName,
    mimeType: part.mimeType,
  });
}

function arrayBufferToBase64(bytes: ArrayBuffer) {
  const byteArray = new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < byteArray.byteLength; index += 1) {
    binary += String.fromCharCode(byteArray[index]);
  }
  return btoa(binary);
}

function inlineImagePart(part: RemoteMediaPartForAnalysis) {
  if (!part.mimeType.startsWith("image/")) {
    analysisError("slideshow_slide_not_image", {
      fileName: part.fileName,
      mimeType: part.mimeType,
      byteLength: part.byteLength,
    });
    throw new Error(`Slideshow slide ${part.fileName} resolved as ${part.mimeType}, not an image.`);
  }
  return {
    inlineData: {
      mimeType: part.mimeType,
      data: arrayBufferToBase64(part.bytes),
    },
  };
}

async function analyzeSlideshowMedia(args: {
  audio?: RemoteMediaPartForAnalysis;
  job: VideoAnalysisJob;
  metadata?: Record<string, unknown>;
  slides: RemoteMediaPartForAnalysis[];
}) {
  if (!args.slides.length) {
    throw new Error("Slideshow analysis needs at least one slide image.");
  }

  analysisLog("slideshow_analysis_start", {
    ...jobLogContext(args.job),
    slideCount: args.slides.length,
    hasResolvedAudio: Boolean(args.audio),
    slides: args.slides.map((slide, index) => ({
      index: index + 1,
      fileName: slide.fileName,
      mimeType: slide.mimeType,
      byteLength: slide.byteLength,
    })),
    audio: args.audio
      ? {
        fileName: args.audio.fileName,
        mimeType: args.audio.mimeType,
        byteLength: args.audio.byteLength,
      }
      : undefined,
  });

  let audioProcessingNote: string | undefined;
  if (args.audio) {
    audioProcessingNote = "Resolved TikTok slideshow audio was intentionally not uploaded; attached sounds are background audio, not source transcript.";
    analysisLog("slideshow_audio_upload_skipped", {
      ...jobLogContext(args.job),
      fileName: args.audio.fileName,
      mimeType: args.audio.mimeType,
      byteLength: args.audio.byteLength,
      reason: "attached_sound_not_transcript",
    });
  }

  const prompt = buildSlideshowAnalysisPrompt(args.job, args.slides.length, Boolean(args.audio));
  const totalSlideBytes = args.slides.reduce((sum, slide) => sum + slide.byteLength, 0);
  const shouldInlineSlides = totalSlideBytes <= MAX_INLINE_SLIDESHOW_IMAGE_BYTES;
  const parts: unknown[] = [
    {
      text: `Analyze this ordered ${args.job.sourcePlatform} slideshow. The next ${args.slides.length} file part${args.slides.length === 1 ? " is" : "s are"} the slide image${args.slides.length === 1 ? "" : "s"} in order.`,
    },
  ];

  analysisLog("slideshow_slide_input_strategy", {
    ...jobLogContext(args.job),
    slideCount: args.slides.length,
    totalSlideBytes,
    maxInlineBytes: MAX_INLINE_SLIDESHOW_IMAGE_BYTES,
    strategy: shouldInlineSlides ? "inline" : "files_api",
  });

  for (const [index, slide] of args.slides.entries()) {
    analysisLog("slideshow_slide_add_part", {
      ...jobLogContext(args.job),
      index: index + 1,
      fileName: slide.fileName,
      mimeType: slide.mimeType,
      byteLength: slide.byteLength,
      strategy: shouldInlineSlides ? "inline" : "files_api",
    });
    parts.push({ text: `Slide ${index + 1} of ${args.slides.length}.` });
    if (shouldInlineSlides) {
      parts.push(inlineImagePart(slide));
    } else {
      const uploadedSlide = await uploadMediaPartToGemini(slide);
      parts.push({
        fileData: {
          fileUri: uploadedSlide.uri,
          mimeType: uploadedSlide.mimeType,
        },
      });
    }
  }

  if (audioProcessingNote) {
    parts.push({ text: audioProcessingNote });
  }

  parts.push({ text: prompt });

  analysisLog("slideshow_generate_start", {
    ...jobLogContext(args.job),
    slideCount: args.slides.length,
    hasResolvedAudio: Boolean(args.audio),
    hasUploadedAudio: false,
    partCount: parts.length,
  });
  const analysis = await geminiGenerateContent({
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: slideshowAnalysisResponseSchema(args.slides.length),
      temperature: 0.25,
      maxOutputTokens: 12288,
    },
    model: args.job.model,
  });
  analysisLog("slideshow_generate_complete", {
    ...jobLogContext(args.job),
    slideCount: args.slides.length,
  });

  return {
    raw: analysis.data,
    result: {
      ...normalizeSlideshowResult(parseAnalysisResult(analysis.text), args.slides.length),
      resolverMetadata: {
        ...args.metadata,
        slideCount: args.slides.length,
        hasAudio: Boolean(args.audio),
        uploadedAudioForAnalysis: false,
        ...(audioProcessingNote ? { audioProcessingNote } : {}),
      },
    },
  };
}

export async function geminiGenerateContent(args: {
  contents: unknown[];
  generationConfig?: Record<string, unknown>;
  model?: string;
}) {
  const apiKey = getGeminiApiKey();
  const model = args.model ?? DEFAULT_ANALYSIS_MODEL;
  analysisLog("gemini_generate_request", {
    model,
    contentCount: args.contents.length,
    generationConfigKeys: args.generationConfig ? Object.keys(args.generationConfig).sort() : [],
  });
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
    const responseText = await response.text();
    analysisError("gemini_generate_failed", {
      model,
      status: response.status,
      responseText: responseText.slice(0, 2000),
    });
    throw new Error(`Gemini analysis failed: ${responseText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    analysisError("gemini_generate_empty_response", {
      model,
      candidateCount: Array.isArray(data.candidates) ? data.candidates.length : undefined,
      finishReason: data.candidates?.[0]?.finishReason,
    });
    throw new Error("Gemini returned an empty response");
  }

  analysisLog("gemini_generate_complete", {
    model,
    textLength: text.length,
    finishReason: data.candidates?.[0]?.finishReason,
  });

  return { data, text };
}

async function uploadFileToGemini(args: {
  bytes: ArrayBuffer;
  displayName: string;
  mimeType: string;
}) {
  const apiKey = getGeminiApiKey();
  analysisLog("gemini_file_upload_start", {
    displayName: args.displayName,
    mimeType: args.mimeType,
    byteLength: args.bytes.byteLength,
  });
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
    const responseText = await startResponse.text();
    analysisError("gemini_file_upload_start_failed", {
      displayName: args.displayName,
      mimeType: args.mimeType,
      status: startResponse.status,
      responseText: responseText.slice(0, 2000),
    });
    throw new Error(`Gemini file upload failed to start: ${responseText}`);
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
    const responseText = await uploadResponse.text();
    analysisError("gemini_file_upload_failed", {
      displayName: args.displayName,
      mimeType: args.mimeType,
      status: uploadResponse.status,
      responseText: responseText.slice(0, 2000),
    });
    throw new Error(`Gemini file upload failed: ${responseText}`);
  }

  const data = await uploadResponse.json();
  const file = data.file;
  if (!file?.name || !file?.uri) throw new Error("Gemini file upload returned no file URI");
  analysisLog("gemini_file_upload_complete", {
    displayName: args.displayName,
    mimeType: args.mimeType,
    fileName: file.name,
    fileState: file.state,
    returnedMimeType: file.mimeType,
  });

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
  analysisLog("gemini_file_wait_start", {
    fileName: file.name,
    state: file.state,
    mimeType: file.mimeType ?? args.fallbackMimeType,
  });

  while (file.state && file.state !== "ACTIVE") {
    if (file.state === "FAILED") {
      analysisError("gemini_file_processing_failed", {
        fileName: file.name,
        state: file.state,
        mimeType: file.mimeType ?? args.fallbackMimeType,
        error: file.error,
      });
      throw new Error(`Gemini file processing failed: ${file.error?.message ?? "unknown error"}`);
    }
    if (Date.now() - startedAt > GEMINI_FILE_ACTIVE_TIMEOUT_MS) {
      analysisError("gemini_file_processing_timeout", {
        fileName: file.name,
        state: file.state,
        mimeType: file.mimeType ?? args.fallbackMimeType,
      });
      throw new Error("Gemini file processing timed out. Try again with a shorter clip.");
    }

    await sleep(GEMINI_FILE_POLL_INTERVAL_MS);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${args.apiKey}`
    );
    if (!response.ok) {
      const responseText = await response.text();
      analysisError("gemini_file_status_check_failed", {
        fileName: file.name,
        status: response.status,
        responseText: responseText.slice(0, 2000),
      });
      throw new Error(`Gemini file status check failed: ${responseText}`);
    }

    file = await response.json();
    analysisLog("gemini_file_wait_poll", {
      fileName: file.name,
      state: file.state,
      mimeType: file.mimeType ?? args.fallbackMimeType,
    });
    file.uri = file.uri ?? args.file.uri;
    file.mimeType = file.mimeType ?? args.fallbackMimeType;
  }

  analysisLog("gemini_file_wait_complete", {
    fileName: file.name,
    state: file.state,
    mimeType: file.mimeType ?? args.fallbackMimeType,
    elapsedMs: Date.now() - startedAt,
  });
  return file;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeYoutubeUrl(job: VideoAnalysisJob) {
  if (!job.sourceUrl) throw new Error("Source URL is missing");
  analysisLog("youtube_analysis_start", jobLogContext(job));
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
  analysisLog("remote_url_analysis_start", jobLogContext(job));
  const media = await fetchRemoteMediaForAnalysis({
    maxBytes: MAX_UPLOAD_BYTES,
    sourcePlatform: job.sourcePlatform,
    sourceUrl: job.sourceUrl,
  });
  analysisLog("remote_url_media_resolved", {
    ...jobLogContext(job),
    mediaKind: media.kind,
    slideCount: media.kind === "slideshow" ? media.slides.length : undefined,
    hasAudio: media.kind === "slideshow" ? Boolean(media.audio) : undefined,
    mimeType: media.kind === "media" ? media.mimeType : undefined,
    byteLength: media.kind === "media" ? media.byteLength : undefined,
  });

  if (media.kind === "slideshow") {
    return await analyzeSlideshowMedia({
      audio: media.audio,
      job,
      metadata: media.metadata,
      slides: media.slides,
    });
  }

  return await analyzeMediaBytes({
    bytes: media.bytes,
    displayName: media.fileName,
    job,
    metadata: media.metadata,
    mimeType: media.mimeType,
  });
}

export async function analyzeUploadedSource(job: VideoAnalysisJob, storageUrl: string) {
  analysisLog("upload_analysis_fetch_start", jobLogContext(job));
  const response = await fetch(storageUrl);
  if (!response.ok) {
    analysisError("upload_analysis_fetch_failed", {
      ...jobLogContext(job),
      status: response.status,
      contentType: response.headers.get("content-type"),
    });
    throw new Error(`Could not fetch uploaded media: ${response.status}`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    analysisError("upload_analysis_too_large", {
      ...jobLogContext(job),
      byteLength: bytes.byteLength,
      maxBytes: MAX_UPLOAD_BYTES,
    });
    throw new Error("Upload is too large for inline analysis. Use a clip under 100 MB.");
  }

  const mimeType = job.mimeType ?? response.headers.get("content-type") ?? "video/mp4";
  analysisLog("upload_analysis_fetch_complete", {
    ...jobLogContext(job),
    byteLength: bytes.byteLength,
    mimeType,
  });
  return await analyzeMediaBytes({
    bytes,
    displayName: job.fileName ?? "Content Engine analysis upload",
    job,
    mimeType,
  });
}
