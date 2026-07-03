import type { Doc } from "../_generated/dataModel";
import type {
  OverlayPlannerSlide,
  SlideshowPlannerOutput,
  SlideshowRenderingMode,
  SlideshowTextBlock,
} from "./types";

export type PlannerReference = {
  assetId: string;
  name: string;
  type: string;
  description?: string;
  instruction?: string;
};

export type RequestedRenderingMode = SlideshowRenderingMode;
export const IMAGE_PROMPT_WRITER_SYSTEM_PROMPT =
  "You are a specialist image prompt writer for short-form social visuals. You write natural, concrete image generation prompts that faithfully expand the user's creative brief without turning it into a rigid template.";

type PromptArgs = {
  prompt: string;
  revisionPrompt?: string;
  socialAccount?: Doc<"socialAccounts"> | null;
  references: PlannerReference[];
};

type ImagePromptWriterArgs = PromptArgs & {
  plan: SlideshowPlannerOutput;
  requestedRenderingMode: RequestedRenderingMode;
};

type SingleImagePromptWriterArgs = ImagePromptWriterArgs & {
  slide: unknown;
};

function overlayPromptPlannerSlide(slide: OverlayPlannerSlide) {
  return {
    slideId: slide.slideId,
    purpose: slide.purpose,
    useReferenceImage: slide.useReferenceImage,
    sceneCues: slide.textBlocks.map((block) => block.text).filter((cue) => Boolean(cue.trim())),
  };
}

function promptCreativeBriefForImageWriter(plan: SlideshowPlannerOutput) {
  return {
    narrativePattern: plan.creativeBrief.narrativePattern,
    reasoning: plan.creativeBrief.reasoning,
    visualStyle: plan.creativeBrief.visualStyle,
    tone: plan.creativeBrief.tone,
  };
}

function promptPlanForImageWriter(
  plan: SlideshowPlannerOutput,
  renderingMode: RequestedRenderingMode
) {
  if (renderingMode === "full_graphic_generation") return plan;
  if (plan.renderingMode !== "background_plus_overlay") return plan;

  return {
    format: plan.format,
    creativeBrief: promptCreativeBriefForImageWriter(plan),
    visualSystem: plan.visualSystem,
    title: plan.title,
    aspectRatio: plan.aspectRatio,
    slides: plan.slides.map(overlayPromptPlannerSlide),
  };
}

function promptSlideForImageWriter(
  slide: unknown,
  renderingMode: RequestedRenderingMode
) {
  if (renderingMode === "full_graphic_generation") return slide;
  const data = slide as Partial<OverlayPlannerSlide>;
  if (!data || typeof data !== "object") return slide;
  return overlayPromptPlannerSlide({
    slideId: data.slideId,
    purpose: data.purpose ?? "",
    useReferenceImage: data.useReferenceImage === true,
    textBlocks: Array.isArray(data.textBlocks) ? data.textBlocks as SlideshowTextBlock[] : [],
    layout: {
      intent: data.layout?.intent ?? "",
      density: data.layout?.density ?? "sparse",
      contrastStrategy: data.layout?.contrastStrategy ?? "none",
    },
  });
}

function sharedPromptLines(args: PromptArgs): Array<string | undefined> {
  const referenceLines = args.references.length
    ? args.references.flatMap((reference, index) => [
        `Reference ${index + 1}: ${reference.name}`,
        `- Asset id: ${reference.assetId}`,
        `- Type: ${reference.type}`,
        reference.description ? `- Description: ${reference.description}` : undefined,
        reference.instruction ? `- User instruction: ${reference.instruction}` : undefined,
      ])
    : ["Reference assets: []"];

  return [
    "Create a production slideshow plan from the user's prompt.",
    "",
    "SOURCE OF TRUTH:",
    "- Treat the user prompt as the creative source of truth.",
    "- Preserve a named slideshow title as title and hook.",
    "- Preserve explicit slide count, slide order, slide text, visual style, subjects, camera direction, references, and examples from the user prompt.",
    "- When the user provides a sequence of scenes and a sequence of slides, pair them by order.",
    "- Fill unspecified choices with simple, coherent defaults that match the prompt.",
    "- Use aspectRatio 9:16 for TikTok, Reels, Shorts, vertical, or mobile slideshow requests.",
    "- Choose the slide count semantically from the requested format, explicit slide list, numbered list, and narrative needs.",
    "REFERENCES:",
    ...referenceLines,
    "- Set useReferenceImage true for a slide when selected reference assets are part of that slide image.",
    "- For a selected person or character reference, useReferenceImage true applies when that person or character appears as the subject, reflection, visible face, visible body, or visible body part.",
    "- Selfie, mirror selfie, portrait, and creator-in-frame scenes are person-visible scenes for selected person references.",
    "- Do not turn object closeups, POV shots, food, phone/app, sink, or routine detail scenes into person-visible scenes just because a person reference is selected.",
    "- Set useReferenceImage false for a slide when selected reference assets are background context for the slideshow.",
    "",
    args.socialAccount ? `Account/platform: ${args.socialAccount.username} on ${args.socialAccount.platform}` : undefined,
    `User prompt: ${args.prompt}`,
    args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
  ];
}

export function buildOverlayPlannerPrompt(args: PromptArgs): string {
  return [
    ...sharedPromptLines(args),
    "",
    "PRODUCTION MODE:",
    "- Use renderingMode exactly: background_plus_overlay.",
    "- Plan on-screen copy and one visual purpose per slide.",
    "- Each slide purpose should preserve the paired scene cue from the user prompt, including subject, setting, action, camera/framing, and reference visibility when specified.",
    "- Preserve object/detail scenes as object/detail scenes unless the user explicitly says a person, reflection, body, hand, or selfie is visible.",
    "- Do not add hands, faces, bodies, or reflections to object/detail scenes when the user only names the object or place.",
    "- visualSystem summarizes the image style requested by the user.",
    "",
    "SLIDE COPY:",
    "- Each slide has textBlocks: independent editable text boxes, not primary/secondary/bullet fields.",
    "- Preserve user-provided slide text exactly inside textBlocks when the prompt gives explicit slides.",
    "- Use textBlocks to represent the user's intended on-slide copy structure. If a slide has multiple distinct pieces of copy, keep them as separate editable text blocks instead of collapsing them into one.",
    "- User wording such as title, label, exercise name, caption, cue, note, CTA, and supporting copy describes on-slide text intent; model each distinct piece as editable slide text.",
    "- Give each block sensible default geometry: x/y/width as percentages of the 9:16 slide, large readable font sizes, and mobile-safe placement.",
    "- For TikTok-style overlay copy, default to white text, 16px black stroke, high font weight, centered alignment, and no background unless the user requests a sticker/card/background.",
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}

export function buildFullGraphicPlannerPrompt(args: PromptArgs): string {
  return [
    ...sharedPromptLines(args),
    "",
    "PRODUCTION MODE:",
    "- Use renderingMode exactly: full_graphic_generation.",
    "- visibleText is the text intended inside the generated image.",
    "- visualSystem summarizes the finished graphic style requested by the user.",
    "",
    "FULL GRAPHIC SLIDES:",
    "- Match explicit user-provided slide text in visibleText.",
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}

export function buildImagePromptWriterPrompt(args: ImagePromptWriterArgs): string {
  const referenceLines = args.references.length
    ? args.references.flatMap((reference, index) => [
        `Reference ${index + 1}: ${reference.name}`,
        `- Asset id: ${reference.assetId}`,
        `- Type: ${reference.type}`,
        reference.description ? `- Description: ${reference.description}` : undefined,
        reference.instruction ? `- User instruction: ${reference.instruction}` : undefined,
      ])
    : ["Reference assets: []"];
  const planJson = JSON.stringify(
    promptPlanForImageWriter(args.plan, args.requestedRenderingMode),
    null,
    2
  );
  const sourceRequestLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "SOURCE REQUEST:",
        `User prompt: ${args.prompt}`,
        args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
      ]
    : [
        "SOURCE REQUEST:",
        `User prompt: ${args.prompt}`,
        args.revisionPrompt ? `Revision context: ${args.revisionPrompt}` : undefined,
      ];

  const sharedLines = [
    "Write image prompts for the planned slideshow.",
    "",
    ...sourceRequestLines,
    "",
    "REFERENCES:",
    ...referenceLines,
    "- useReferenceImage true means selected reference assets are attached to that slide generation.",
    "- useReferenceImage false means visual continuity comes from the written prompt, visualSystem, scene, objects, and style.",
    "- For useReferenceImage true, write as if the selected reference assets are the visible subject, character, or style source; avoid weak wording like 'resembling the reference'.",
    "- For useReferenceImage false, do not mention selected reference assets in the image prompt.",
    "- For useReferenceImage false object/detail scenes, do not add a creator, person, face, body, hand, or reflection unless the current slide purpose explicitly includes one.",
    "",
    args.socialAccount ? `Account/platform: ${args.socialAccount.username} on ${args.socialAccount.platform}` : undefined,
    "",
    "SLIDESHOW PLAN:",
    planJson,
    "",
    "PROMPT WRITING:",
    "- Treat the user prompt and slideshow plan as the source material.",
    "- Preserve concrete user-specified style, subjects, camera angles, text, colors, references, and examples.",
    "- Faithfully expand compact scene cues into plausible visual specifics that match the user's stated aesthetic.",
    "- Prefer concrete visible details over abstract labels like motivating, premium, cinematic, or professional.",
    "- Name setting-specific objects, materials, textures, and spatial relationships instead of broad categories.",
    "- Add grounded details for setting, objects, composition, lighting, camera/framing, style, and reference usage when they help the image render clearly.",
    "- Avoid adding inferred emotions, body transformations, or narrative labels when concrete camera-visible details would be more useful.",
    "- Avoid generic stock-photo staging unless the user asked for it.",
  ];

  const modeLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "",
        "FULL GRAPHIC PROMPTS:",
        "- Use renderingMode exactly: full_graphic_generation.",
        "- Return visualBrief and one finalImagePrompt for each slideId in the slideshow plan.",
        "- finalImagePrompt describes a complete finished graphic with the image scene and designed text.",
        "- Use visibleText as the text inside the graphic.",
        "- Write finalImagePrompt as one plain text prompt using markdown-style section headings in this exact order: ### Create, ### Shared style, ### Visible text exact line breaks, ### Typography, ### Scene, ### Camera and framing, ### Style consistency.",
        "- Typography section states placement, style, color, and treatment for the visible text.",
        "- Scene section states the subject, action, objects, environment, and spatial relationships.",
        "- Camera and framing section states angle, crop, distance, subject scale, and visible frame geometry.",
      ]
    : [
        "",
        "BACKGROUND PROMPTS:",
        "- Use renderingMode exactly: background_plus_overlay.",
        "- Return visualBrief and one backgroundPrompt for each slideId in the slideshow plan.",
        "- backgroundPrompt describes only the generated picture: scene, subject, setting, action, objects, lighting, palette, mood, camera/framing, style, and reference usage.",
        "- On-screen copy belongs to textBlocks; backgroundPrompt focuses on the photo or illustration content.",
        "- Write backgroundPrompt as natural plain text, usually one or two concise paragraphs. Do not use markdown headings or production checklist labels.",
        "- For candid, UGC, camera-roll, selfie, POV, or phone-photo requests, expand with lived-in details such as imperfect crop, mundane surroundings, visible clutter, reflections, motion blur, low light, phone-camera grain, and non-centered handheld framing when appropriate.",
        "- For realistic public spaces, include incidental background activity when it fits the user's brief.",
        "- Do not over-constrain identity visibility; let normal phone-photo framing apply unless the user asks for a clear portrait.",
        "- Do not request slide headlines, captions, typography, labels, or designed text overlays in overlay background images.",
        "- Fixed app, phone, screenshot, or CTA placeholder scenes may include realistic UI text only inside the photographed/screenshot content.",
      ];

  return [
    ...sharedLines,
    ...modeLines,
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}

export function buildSingleImagePromptWriterPrompt(args: SingleImagePromptWriterArgs): string {
  const referenceLines = args.references.length
    ? args.references.flatMap((reference, index) => [
        `Reference ${index + 1}: ${reference.name}`,
        `- Asset id: ${reference.assetId}`,
        `- Type: ${reference.type}`,
        reference.description ? `- Description: ${reference.description}` : undefined,
        reference.instruction ? `- User instruction: ${reference.instruction}` : undefined,
      ])
    : ["Reference assets: []"];
  const planJson = JSON.stringify(
    promptPlanForImageWriter(args.plan, args.requestedRenderingMode),
    null,
    2
  );
  const slideJson = JSON.stringify(
    promptSlideForImageWriter(args.slide, args.requestedRenderingMode),
    null,
    2
  );
  const sourceRequestLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "SOURCE REQUEST:",
        `User prompt: ${args.prompt}`,
        args.revisionPrompt ? `Revision request: ${args.revisionPrompt}` : undefined,
      ]
    : [
        "SOURCE REQUEST:",
        `User prompt: ${args.prompt}`,
        args.revisionPrompt ? `Revision context: ${args.revisionPrompt}` : undefined,
      ];

  const sharedLines = [
    "Write one image prompt for the current slideshow slide.",
    "",
    ...sourceRequestLines,
    "",
    "REFERENCES:",
    ...referenceLines,
    "- useReferenceImage true means selected reference assets are attached to this slide generation.",
    "- useReferenceImage false means visual continuity comes from the written prompt, visualSystem, scene, objects, and style.",
    "- For useReferenceImage true, write as if the selected reference assets are the visible subject, character, or style source; avoid weak wording like 'resembling the reference'.",
    "- For useReferenceImage false, do not mention selected reference assets in the image prompt.",
    "- For useReferenceImage false object/detail scenes, do not add a creator, person, face, body, hand, or reflection unless the current slide purpose explicitly includes one.",
    "",
    args.socialAccount ? `Account/platform: ${args.socialAccount.username} on ${args.socialAccount.platform}` : undefined,
    "",
    "FULL SLIDESHOW PLAN:",
    planJson,
    "",
    "CURRENT SLIDE:",
    slideJson,
    "",
    "PROMPT WRITING:",
    "- Treat the user prompt, slideshow plan, and current slide as the source material.",
    "- Preserve concrete user-specified style, subjects, camera angles, text, colors, references, and examples.",
    "- Faithfully expand compact scene cues into plausible visual specifics that match the user's stated aesthetic.",
    "- Prefer concrete visible details over abstract labels like motivating, premium, cinematic, or professional.",
    "- Name setting-specific objects, materials, textures, and spatial relationships instead of broad categories.",
    "- Add grounded details for setting, objects, composition, lighting, camera/framing, style, and reference usage when they help the image render clearly.",
    "- Avoid adding inferred emotions, body transformations, or narrative labels when concrete camera-visible details would be more useful.",
    "- Avoid generic stock-photo staging unless the user asked for it.",
  ];

  const modeLines = args.requestedRenderingMode === "full_graphic_generation"
    ? [
        "",
        "FULL GRAPHIC PROMPT:",
        "- Return visualBrief and one finalImagePrompt for the current slideId.",
        "- finalImagePrompt describes a complete finished graphic with the image scene and designed text.",
        "- Use visibleText as the text inside the graphic.",
        "- Write finalImagePrompt as one plain text prompt using markdown-style section headings in this exact order: ### Create, ### Shared style, ### Visible text exact line breaks, ### Typography, ### Scene, ### Camera and framing, ### Style consistency.",
        "- Typography section states placement, style, color, and treatment for the visible text.",
        "- Scene section states the subject, action, objects, environment, and spatial relationships.",
        "- Camera and framing section states angle, crop, distance, subject scale, and visible frame geometry.",
      ]
    : [
        "",
        "BACKGROUND PROMPT:",
        "- Return visualBrief and one backgroundPrompt for the current slideId.",
        "- backgroundPrompt describes only the generated picture: scene, subject, setting, action, objects, lighting, palette, mood, camera/framing, style, and reference usage.",
        "- On-screen copy belongs to textBlocks; backgroundPrompt focuses on the photo or illustration content.",
        "- Write backgroundPrompt as natural plain text, usually one or two concise paragraphs. Do not use markdown headings or production checklist labels.",
        "- For candid, UGC, camera-roll, selfie, POV, or phone-photo requests, expand with lived-in details such as imperfect crop, mundane surroundings, visible clutter, reflections, motion blur, low light, phone-camera grain, and non-centered handheld framing when appropriate.",
        "- For realistic public spaces, include incidental background activity when it fits the user's brief.",
        "- Do not over-constrain identity visibility; let normal phone-photo framing apply unless the user asks for a clear portrait.",
        "- Do not request slide headlines, captions, typography, labels, or designed text overlays in overlay background images.",
        "- Fixed app, phone, screenshot, or CTA placeholder scenes may include realistic UI text only inside the photographed/screenshot content.",
      ];

  return [
    ...sharedLines,
    ...modeLines,
    "",
    "Return exactly the requested JSON schema.",
  ].filter((line) => line !== undefined).join("\n");
}
