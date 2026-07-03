import type { Doc } from "../_generated/dataModel";

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

export function cleanOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function buildAnalysisPrompt(job: VideoAnalysisJob) {
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

export function buildSlideshowAnalysisPrompt(job: VideoAnalysisJob, slideCount: number, hasAudio: boolean) {
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

export function slideshowAnalysisResponseSchema(slideCount: number) {
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

export function parseAnalysisResult(text: string): VideoAnalysisResult {
  const parsed = JSON.parse(stripJsonFence(text)) as VideoAnalysisResult;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Gemini returned an invalid analysis object");
  }

  return parsed;
}

export function normalizeSlideshowResult(result: VideoAnalysisResult, slideCount: number): VideoAnalysisResult {
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
