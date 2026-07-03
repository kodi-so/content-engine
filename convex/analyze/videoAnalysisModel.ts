import type { Doc } from "../_generated/dataModel";
import { fetchRemoteMediaForAnalysis, type RemoteMediaPartForAnalysis } from "./mediaResolver";

export const DEFAULT_ANALYSIS_MODEL = "gemini-2.5-flash";
export const GEMINI_PROVIDER = "gemini";
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const GEMINI_FILE_ACTIVE_TIMEOUT_MS = 60_000;
const GEMINI_FILE_POLL_INTERVAL_MS = 1_500;
const MAX_INLINE_SLIDESHOW_IMAGE_BYTES = 18 * 1024 * 1024;

export type VideoAnalysisJob = Doc<"videoAnalysisJobs">;
export type VideoAnalysisResult = {
  title?: string;
  summary?: string;
  platformRead?: string;
  durationEstimate?: string;
  referenceBrief?: {
    sourceType?: "video" | "slideshow" | "image" | "audio" | "unknown";
    oneLineSummary?: string;
    coreIdea?: string;
    hook?: string;
    structure?: string[];
    keyVisuals?: string[];
    visibleText?: string[];
    audioRole?: string;
    reusablePattern?: string;
    doNotCopy?: string[];
    suggestedUses?: string[];
  };
  slideshow?: {
    slideCount?: number;
    slides?: Array<{
      index?: number;
      imageDescription?: string;
      visibleText?: string[];
      textLayout?: string;
      subjects?: string[];
      visualStyle?: string;
      creatorPurpose?: string;
      audioNotes?: string;
    }>;
  };
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
    "Also return referenceBrief as the concise reusable understanding of the source for both the Analyze screen and Agent mode. It should be compact, source-grounded, and useful for later questions or original content creation.",
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
      referenceBrief: {
        sourceType: "video, slideshow, image, audio, or unknown",
        oneLineSummary: "One sentence that says what this source is",
        coreIdea: "The central concept or promise",
        hook: "The first thing that earns attention",
        structure: ["short ordered beats or slide/scene roles"],
        keyVisuals: ["important subjects, settings, images, compositions, or visual motifs"],
        visibleText: ["important readable on-screen or slide text"],
        audioRole: "How speech, original audio, music, or silence functions",
        reusablePattern: "The adaptable pattern to use without copying the source",
        doNotCopy: ["creator-specific details, claims, visuals, phrasing, or IP to avoid"],
        suggestedUses: ["ways this source can inform original content"],
      },
      slideshow: {
        slideCount: 0,
        slides: [
          {
            index: 1,
            imageDescription: "Detailed description of this slide image",
            visibleText: ["exact readable text on this slide"],
            textLayout: "Where text appears and how it is arranged",
            subjects: ["people, products, UI, objects, places, or scenes shown on this slide"],
            visualStyle: "Slide-specific visual style",
            creatorPurpose: "Why this slide exists in the post",
            audioNotes: "How audio relates to this slide, or empty string",
          },
        ],
      },
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

function buildSlideshowAnalysisPrompt(job: VideoAnalysisJob, slideCount: number, hasAudio: boolean) {
  return [
    `This source is an ordered social slideshow/photo post with ${slideCount} slide image${slideCount === 1 ? "" : "s"}${hasAudio ? " and a background audio track" : ""}.`,
    "The slide images are the primary source of truth. The post is not a video scene and should not be analyzed as a cinematic clip.",
    "Analyze each slide individually before synthesizing the overall creative pattern.",
    `Return exactly ${slideCount} item${slideCount === 1 ? "" : "s"} in slideshow.slides, one per supplied slide, with indexes 1 through ${slideCount}.`,
    "Do not merge slides. Do not skip slides. If a slide has no readable text, set visibleText to an empty array and textLayout to an empty string.",
    "For every slideshow.slides item, describe the image, exact visible text, text placement/layout, key objects/subjects, visual style, creator purpose, and any audio relationship.",
    "In visuals.sceneBreakdown, include one entry per slide in order. Use timestamps like \"Slide 1\", \"Slide 2\", and so on.",
    "Put all readable slide text in visuals.onScreenText, preserving slide order where possible.",
    "In referenceBrief, set sourceType to \"slideshow\" and summarize the slide sequence, visible text, image subjects, and reusable structure for Agent mode.",
    "For slideshow posts, transcript.text must be an empty string unless the slide images themselves show written dialogue that belongs in visibleText. Do not transcribe songs, original sounds, movie clips, or reused TikTok audio as the source transcript.",
    hasAudio
      ? "A TikTok background/original sound is attached, but it is not provided as transcript material. Mention it only as background audio if useful; do not infer visuals or scenes from it."
      : "If there is no audio, keep audio fields empty or explicitly note that no audio track was provided.",
    buildAnalysisPrompt(job),
  ].join("\n");
}

function textArraySchema(description: string) {
  return {
    description,
    items: { type: "string" },
    type: "array",
  };
}

function slideshowAnalysisResponseSchema(slideCount: number) {
  const stringField = (description: string) => ({ description, type: "string" });

  return {
    type: "object",
    properties: {
      title: stringField("Short descriptive title."),
      summary: stringField("Plain-language summary of what happens and why it matters."),
      platformRead: stringField("What platform/style this resembles."),
      durationEstimate: stringField("Approximate duration if detectable."),
      referenceBrief: {
        type: "object",
        properties: {
          sourceType: stringField("Must be slideshow for TikTok slideshow/photo posts."),
          oneLineSummary: stringField("One sentence that says what this slideshow is."),
          coreIdea: stringField("The central concept or promise."),
          hook: stringField("What the first slide uses to earn attention."),
          structure: textArraySchema("Short ordered slide beats or roles."),
          keyVisuals: textArraySchema("Important slide subjects, settings, images, compositions, or visual motifs."),
          visibleText: textArraySchema("Important readable slide text, preserving order."),
          audioRole: stringField("How the background/original sound functions without transcribing it."),
          reusablePattern: stringField("The adaptable pattern to use without copying the source."),
          doNotCopy: textArraySchema("Creator-specific details, claims, visuals, phrasing, or IP to avoid."),
          suggestedUses: textArraySchema("Ways this source can inform original content."),
        },
        required: [
          "sourceType",
          "oneLineSummary",
          "coreIdea",
          "hook",
          "structure",
          "keyVisuals",
          "visibleText",
          "audioRole",
          "reusablePattern",
          "doNotCopy",
          "suggestedUses",
        ],
      },
      slideshow: {
        type: "object",
        properties: {
          slideCount: {
            description: `The number of slides analyzed. Must be ${slideCount}.`,
            type: "integer",
          },
          slides: {
            description: "One object per slide, preserving the input order.",
            type: "array",
            items: {
              type: "object",
              properties: {
                index: {
                  description: "One-based slide number matching the input order.",
                  type: "integer",
                },
                imageDescription: stringField("Specific description of the slide image."),
                visibleText: textArraySchema("Exact readable text on this slide, in reading order."),
                textLayout: stringField("Where the text appears and how it is arranged."),
                subjects: textArraySchema("People, products, UI, objects, places, or scenes shown on this slide."),
                visualStyle: stringField("Slide-specific style, composition, color, and edit treatment."),
                creatorPurpose: stringField("Why this slide exists in the post."),
                audioNotes: stringField("How the post's background sound affects this slide, or empty string."),
              },
              required: [
                "index",
                "imageDescription",
                "visibleText",
                "textLayout",
                "subjects",
                "visualStyle",
                "creatorPurpose",
                "audioNotes",
              ],
            },
          },
        },
        required: ["slideCount", "slides"],
      },
      transcript: {
        type: "object",
        properties: {
          text: stringField("For TikTok slideshow/photo posts this must be an empty string. Do not transcribe attached sounds."),
          confidenceNotes: stringField("Explain that attached TikTok sounds are background audio, not source transcript."),
          notablePhrases: textArraySchema("Phrases worth reusing structurally. For slideshow posts, prefer visible slide text, not lyrics or reused sound dialogue."),
        },
        required: ["text", "confidenceNotes", "notablePhrases"],
      },
      visuals: {
        type: "object",
        properties: {
          style: stringField("Overall visual style and art direction."),
          setting: stringField("Primary environment."),
          subjects: textArraySchema("People, products, props, UI, or scenes shown."),
          cameraAndEditing: stringField("Framing, movement, cuts, overlays, captions."),
          onScreenText: textArraySchema("All readable visible text across slides, in order."),
          sceneBreakdown: {
            type: "array",
            items: {
              type: "object",
              properties: {
                timestamp: stringField("Slide label such as Slide 1."),
                description: stringField("What appears on the slide."),
                visualNotes: stringField("Composition, text, objects, and slide-specific visual details."),
                audioNotes: stringField("Background sound note, or empty string."),
                creatorPurpose: stringField("Why this slide exists."),
              },
              required: ["timestamp", "description", "visualNotes", "audioNotes", "creatorPurpose"],
            },
          },
        },
        required: ["style", "setting", "subjects", "cameraAndEditing", "onScreenText", "sceneBreakdown"],
      },
      audio: {
        type: "object",
        properties: {
          speechDelivery: stringField("For slideshow/photo posts, leave empty unless there is source-recorded speech separate from the attached sound."),
          musicAndSound: stringField("Background/original sound description if known from context; do not transcribe it."),
          extractableNotes: textArraySchema("Reusable timing or vibe notes from the background sound, not transcript lines."),
        },
        required: ["speechDelivery", "musicAndSound", "extractableNotes"],
      },
      creativeAnalysis: {
        type: "object",
        properties: {
          hook: stringField("What makes the first slide work."),
          structure: textArraySchema("Slide-by-slide narrative structure."),
          pacing: stringField("How the slides progress."),
          whyItWorks: textArraySchema("Specific strengths."),
          risksToAvoid: textArraySchema("Things to avoid copying directly or weak points."),
        },
        required: ["hook", "structure", "pacing", "whyItWorks", "risksToAvoid"],
      },
      reuseBrief: {
        type: "object",
        properties: {
          copyablePattern: stringField("The reusable pattern without copying the creator's IP."),
          originalVersionPrompt: stringField("Prompt for making an original concept from this pattern."),
          shotList: textArraySchema("Slides or shots to create an original version."),
          scriptTemplate: stringField("Reusable slide text/template."),
          generationPrompt: stringField("Detailed prompt another LLM or image tool can use."),
        },
        required: ["copyablePattern", "originalVersionPrompt", "shotList", "scriptTemplate", "generationPrompt"],
      },
    },
    required: [
      "title",
      "summary",
      "platformRead",
      "durationEstimate",
      "referenceBrief",
      "slideshow",
      "transcript",
      "visuals",
      "audio",
      "creativeAnalysis",
      "reuseBrief",
    ],
  };
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

function normalizeSlideshowResult(result: VideoAnalysisResult, slideCount: number): VideoAnalysisResult {
  const slides = result.slideshow?.slides ?? [];
  const usableSlides = slides.filter((slide) =>
    Boolean(
      slide &&
      (
        cleanOptionalText(slide.imageDescription) ||
        cleanOptionalText(slide.textLayout) ||
        cleanOptionalText(slide.visualStyle) ||
        cleanOptionalText(slide.creatorPurpose) ||
        (slide.visibleText ?? []).some((item) => cleanOptionalText(item)) ||
        (slide.subjects ?? []).some((item) => cleanOptionalText(item))
      )
    )
  );

  if (usableSlides.length !== slideCount) {
    analysisError("slideshow_per_slide_result_incomplete", {
      expectedSlideCount: slideCount,
      returnedSlideCount: slides.length,
      usableSlideCount: usableSlides.length,
    });
    throw new Error(
      `Slideshow analysis did not return one usable result per slide. Expected ${slideCount}, got ${usableSlides.length}.`
    );
  }

  return {
    ...result,
    referenceBrief: {
      ...result.referenceBrief,
      sourceType: "slideshow",
    },
    slideshow: {
      ...result.slideshow,
      slideCount,
      slides: usableSlides.map((slide, index) => ({
        ...slide,
        index: slide.index ?? index + 1,
      })),
    },
    transcript: {
      ...result.transcript,
      text: "",
      confidenceNotes:
        "No source-recorded speech transcript was extracted. Attached TikTok sounds are treated as background audio, not the slideshow transcript.",
    },
  };
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
