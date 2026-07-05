import assert from "node:assert/strict";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
  AgentDecisionParseError,
  createAgentSystemPrompt,
  normalizeAgentDecision,
} from "../../../../convex/create/agent";
import {
  ALL_AGENT_PROMPT_MODULES,
  selectPromptModules,
} from "../../../../convex/create/agent/agentPromptModules";
import { fitRecentMessagesToBudget } from "../../../../convex/create/agent/agentTurnContextBuilder";
import { artifactCaptionFromPrompt } from "../../../../convex/content/artifactCaptions";
import {
  buildEffectiveBrief,
  buildPlannedToolInput,
  normalizePlannedToolInputForToolCall,
  toolDescriptorMap,
} from "../../../../convex/create/planning";
import { dependencyIndexesForPlannedToolCalls } from "../../../../convex/create/agent/agentToolPlanning";
import { validateToolCallInput } from "../../../../convex/create/tools/validateToolInput";
import { normalizeFalVideoDurationForModel } from "../../../../convex/providers/modelProviders/fal";

function userMessage(
  content: string,
  referenceMentions: Doc<"createMessages">["referenceMentions"] = []
) {
  return {
    _creationTime: 1,
    _id: `message_${content.length}`,
    content,
    createdAt: 1,
    createThreadId: "thread_1",
    referenceMentions,
    role: "user",
    userId: "user_1",
  } as unknown as Doc<"createMessages">;
}

const bananaReference = {
  token: "@Banana",
  label: "Banana Character",
  entityType: "creative_asset",
  entityId: "asset_1",
  mediaType: "image",
} as const;

const validChatDecision = normalizeAgentDecision(JSON.stringify({
  kind: "chat",
  response: "Happy to help.",
  outputType: null,
  toolCalls: null,
  planSteps: null,
  productionPlan: null,
  brief: null,
}));
assert.equal(validChatDecision.kind, "chat");
assert.equal(validChatDecision.response, "Happy to help.");

assert.throws(
  () => normalizeAgentDecision(`Here is the JSON:\n${JSON.stringify({
    kind: "chat",
    response: "Wrapped output.",
    outputType: null,
    toolCalls: null,
    planSteps: null,
    productionPlan: null,
    brief: null,
  })}`),
  AgentDecisionParseError
);

assert.throws(
  () => normalizeAgentDecision(JSON.stringify({
    kind: "dance",
    response: "Unknown kind.",
    outputType: null,
    toolCalls: null,
    planSteps: null,
    productionPlan: null,
    brief: null,
  })),
  AgentDecisionParseError
);

assert.deepEqual(
  validateToolCallInput("slideshow.render", {
    requestedRenderingMode: "background_plus_overlay",
  }),
  []
);

const wrongRenderingModeErrors = validateToolCallInput("slideshow.render", {
  requestedRenderingMode: "baked_text_sometimes",
});
assert.equal(wrongRenderingModeErrors.length, 1);
assert.match(wrongRenderingModeErrors[0], /requestedRenderingMode/);

assert.deepEqual(
  validateToolCallInput("media.makePoster", {}),
  ["Unknown tool name: media.makePoster"]
);

assert.equal(
  artifactCaptionFromPrompt("one two three four five", "Slide 2"),
  "Slide 2: one two three four five"
);
assert.match(
  artifactCaptionFromPrompt("Create ".repeat(40)) ?? "",
  /…$/
);

const budgetedMessages = fitRecentMessagesToBudget([
  { content: "oldest message", createdAt: 1, kind: "chat" },
  { content: "middle message", createdAt: 2, kind: "chat" },
  { content: "newest message", createdAt: 3, kind: "chat" },
] as unknown as Doc<"createMessages">[], 28);
assert.deepEqual(
  budgetedMessages.recentMessages.map((message) => message.content),
  ["middle message", "newest message"]
);
assert.deepEqual(
  budgetedMessages.droppedMessages.map((message) => message.content),
  ["oldest message"]
);

const fullAgentPrompt = createAgentSystemPrompt();
const movedPlannerGuidance = [
  "For slideshow requests, always use exactly one slideshow.render tool call. Do not decompose slideshow creation into separate media.generateImage calls for individual slides. The native slideshow pipeline plans slides, generates slide visuals, creates editable text blocks when appropriate, and assembles the slideshow artifact.",
  "For slideshow.render, default to editable text overlays. Set input.requestedRenderingMode=\"full_graphic_generation\" only when the user asks for fully designed/finished graphic slides, poster-style slides, text baked into the artwork, or similar. Otherwise use input.requestedRenderingMode=\"background_plus_overlay\".",
  "For image-to-video, default to Kling through fal unless the user explicitly asks for another video model. Use model=\"fal-ai/kling-video/v3/pro/image-to-video\" when animating image references and model=\"fal-ai/kling-video/v3/pro/text-to-video\" for prompt-only video.",
  "When the user asks to edit text on an existing generated slideshow, Studio video project, or current media artifact, use mediaOverlay.updateText with concrete overlay add/update/remove/replace operations. Do not regenerate the whole media artifact unless the user asks for new visuals or a full remake.",
  "When the user supplies a URL and asks to understand, study, analyze, use as inspiration, or adapt it, call analyze.source first. Treat its reference brief as the primary source context for later answers and generation.",
  "For multi-clip final videos, call studio.compose after generating or selecting the clips. If the user asks to create a finished video rather than only a Studio draft, call studio.render after studio.compose.",
  "When the requested artifact includes text, decide semantically where that text belongs: use Studio composition for video overlays/captions/lower thirds, slideshow tools for slide text, and image generation only when the artifact itself is a text-bearing graphic such as a poster, flyer, infographic, meme, title card, thumbnail, ad graphic, packaging, or specifically requested visible words.",
  "Do not add text, labels, captions, or UI-like annotations to ordinary photo/image assets or video clips unless the user's requested artifact calls for rendered text.",
];
for (const bullet of movedPlannerGuidance) {
  assert.ok(
    fullAgentPrompt.includes(bullet) || fullAgentPrompt.includes(bullet.replaceAll('"', '\\"')),
    `Expected prompt to include guidance: ${bullet}`
  );
}
assert.match(fullAgentPrompt, /input must be a compact JSON-encoded object string/);

assert.deepEqual(
  selectPromptModules({
    isContinuation: false,
    toolNames: [],
  }),
  ALL_AGENT_PROMPT_MODULES
);
assert.deepEqual(
  selectPromptModules({
    isContinuation: true,
    toolNames: ["media.generateImage"],
  }),
  ["production_planning", "visual_continuity"]
);
assert.deepEqual(
  selectPromptModules({
    isContinuation: true,
    toolNames: ["studio.compose"],
  }),
  ["production_planning", "assembly_and_render"]
);
assert.deepEqual(
  selectPromptModules({
    isContinuation: true,
    toolNames: [],
  }),
  ["production_planning"]
);

assert.deepEqual(
  dependencyIndexesForPlannedToolCalls([
    { toolName: "media.generateImage" },
    { toolName: "media.generateImage" },
    { toolName: "media.generateVideo", input: { usePriorImageOutputs: true } },
    { toolName: "studio.compose" },
  ]),
  [[], [], [0, 1], [0, 1, 2]]
);

const fruitBrief = userMessage(
  "I want an AI fruit drama video where a banana husband and strawberry wife win the lottery.",
  [bananaReference]
);
const goAheadBrief = buildEffectiveBrief({
  content: "go ahead",
  currentMentions: [],
});

assert.equal(goAheadBrief.content, "go ahead");
assert.deepEqual(goAheadBrief.referenceMentions, []);

const reviseBrief = buildEffectiveBrief({
  content: "revise it",
});
assert.equal(reviseBrief.content, "revise it");

const clarificationBrief = buildEffectiveBrief({
  content: "video",
});
assert.equal(clarificationBrief.content, "video");

const brainstormingBrief = buildEffectiveBrief({
  content: "I like the lottery idea but maybe it should be more dramatic.",
  currentMentions: [bananaReference],
});
assert.equal(brainstormingBrief.content, "I like the lottery idea but maybe it should be more dramatic.");
assert.deepEqual(brainstormingBrief.referenceMentions, [bananaReference]);

const imageToolInput = buildPlannedToolInput({
  content: "Create three vertical product images using provider fal model imagen-test.",
  outputType: "image",
  toolName: "media.generateImage",
});
assert.equal(imageToolInput.aspectRatio, "9:16");
assert.equal(imageToolInput.count, 3);
assert.equal(imageToolInput.provider, "fal");
assert.equal(imageToolInput.model, "imagen-test");

const videoToolInput = buildPlannedToolInput({
  content: "Create a landscape product video that is 8 seconds long.",
  outputType: "video",
  toolName: "media.generateVideo",
});
assert.equal(videoToolInput.aspectRatio, "16:9");
assert.equal(videoToolInput.durationSeconds, 8);

const slideshowToolInput = buildPlannedToolInput({
  content: "Create a five-slide Pilates abs workout slideshow with titles and captions.",
  outputType: "slideshow",
  toolName: "slideshow.render",
});
assert.equal(slideshowToolInput.requestedRenderingMode, "background_plus_overlay");
assert.equal(toolDescriptorMap().get("slideshow.render")?.checkpoint.behavior, "none");

const transformationBrief =
  "Create a vertical before and after fitness transformation video. Show a woman at the start of her fitness journey, then cut to six months later where she looks stronger and more confident. Add short motivational text overlays and make it feel like a TikTok/Reels transformation video.";
const transformationImageInput = buildPlannedToolInput({
  content: transformationBrief,
  outputType: "video",
  toolName: "media.generateImage",
});
assert.equal(transformationImageInput.aspectRatio, "9:16");
assert.equal(transformationImageInput.count, undefined);
assert.equal(transformationImageInput.prompt, transformationBrief);
assert.equal(transformationImageInput.brief, transformationBrief);

const twoImageTransformationInput = buildPlannedToolInput({
  content:
    "Create two images for a before-and-after fitness transformation. First image: a woman at the start of her fitness journey, standing in a gym mirror selfie. Second image: the same woman six months later, stronger and more confident in the same gym mirror selfie style.",
  outputType: "image",
  toolName: "media.generateImage",
});
assert.equal(twoImageTransformationInput.count, 2);
assert.equal(
  twoImageTransformationInput.prompt,
  "Create two images for a before-and-after fitness transformation. First image: a woman at the start of her fitness journey, standing in a gym mirror selfie. Second image: the same woman six months later, stronger and more confident in the same gym mirror selfie style."
);

const multiToolCallDecision = normalizeAgentDecision(JSON.stringify({
  kind: "create",
  response: "I'll create one before image and one after image.",
  outputType: "image",
  brief: "Create two images for a before-and-after fitness transformation.",
  toolCalls: [
    {
      tool: "media.generateImage",
      prompt: "Generate an image of a woman at the start of her fitness journey, standing in a gym mirror selfie.",
      planStep: "Create the before image.",
      input: { aspectRatio: "1:1" },
    },
    {
      tool: "media.generateImage",
      prompt: "Generate an image of the same woman six months later, stronger and more confident, in the same gym mirror selfie style.",
      planStep: "Create the after image.",
      input: { aspectRatio: "1:1", usePriorImageOutputs: true },
    },
  ],
}));

assert.equal(multiToolCallDecision.kind, "create");
assert.equal(multiToolCallDecision.toolCalls.length, 2);
assert.equal(multiToolCallDecision.toolCalls[0].toolName, "media.generateImage");
assert.equal(multiToolCallDecision.toolCalls[1].toolName, "media.generateImage");
assert.match(multiToolCallDecision.toolCalls[0].prompt ?? "", /start of her fitness journey/);
assert.match(multiToolCallDecision.toolCalls[1].prompt ?? "", /six months later/);
assert.equal(multiToolCallDecision.toolCalls[1].input?.usePriorImageOutputs, true);

const jsonStringInputDecision = normalizeAgentDecision(JSON.stringify({
  kind: "create",
  response: "I'll create the image.",
  outputType: "image",
  brief: "Create a vertical product image.",
  productionPlan: {
    finalArtifact: "Vertical product image.",
    sourceRoles: [],
    units: ["Image"],
    assembly: "None.",
    render: "Generate image.",
  },
  planSteps: ["Create the product image."],
  toolCalls: [
    {
      tool: "media.generateImage",
      prompt: "Create a vertical product image.",
      planStep: "Create the product image.",
      input: "{\"aspectRatio\":\"9:16\",\"count\":1}",
    },
  ],
}));
assert.equal(jsonStringInputDecision.kind, "create");
assert.equal(jsonStringInputDecision.toolCalls[0].input?.aspectRatio, "9:16");
assert.equal(jsonStringInputDecision.toolCalls[0].input?.count, 1);

const slideshowDecision = normalizeAgentDecision(JSON.stringify({
  kind: "create",
  response: "I'll create the slideshow.",
  outputType: "slideshow",
  brief: "Create a five-slide Pilates abs workout slideshow with generated images and captions.",
  toolCalls: [
    {
      tool: "media.generateImage",
      prompt: "Generate a title slide image.",
      planStep: "Generate the title slide image.",
      input: { count: 4 },
    },
    {
      tool: "media.generateImage",
      prompt: "Generate The Hundred exercise image.",
      planStep: "Generate The Hundred image.",
    },
  ],
}));

assert.equal(slideshowDecision.kind, "create");
assert.equal(slideshowDecision.toolCalls.length, 1);
assert.equal(slideshowDecision.toolCalls[0].toolName, "slideshow.render");
assert.equal(slideshowDecision.toolCalls[0].input?.requestedRenderingMode, "background_plus_overlay");
assert.equal(slideshowDecision.toolCalls[0].input?.count, undefined);
assert.match(slideshowDecision.toolCalls[0].prompt ?? "", /slideshow/i);

const designedSlideshowDecision = normalizeAgentDecision(JSON.stringify({
  kind: "create",
  response: "I'll create finished designed slides.",
  outputType: "slideshow",
  brief: "Create five fully designed poster-style slides with the text baked into each graphic.",
  toolCalls: [
    {
      tool: "slideshow.render",
      prompt: "Create five fully designed poster-style slides with the text baked into each graphic.",
      planStep: "Create the designed slideshow.",
      input: { requestedRenderingMode: "full_graphic_generation" },
    },
  ],
}));

assert.equal(designedSlideshowDecision.kind, "create");
assert.equal(designedSlideshowDecision.toolCalls.length, 1);
assert.equal(designedSlideshowDecision.toolCalls[0].toolName, "slideshow.render");
assert.equal(designedSlideshowDecision.toolCalls[0].input?.requestedRenderingMode, "full_graphic_generation");

const multiClipReferenceVideoDecision = normalizeAgentDecision(JSON.stringify({
  kind: "create",
  response: "I'll animate each product still as its own clip, then assemble and render the launch video.",
  outputType: "video",
  brief: "Create a launch video from two product stills: first the closed box, then the product opened on a desk.",
  productionPlan: {
    finalArtifact: "Finished vertical product launch video.",
    sourceRoles: [
      "Prior image 0 is the closed-box product moment.",
      "Prior image 1 is the opened-product desk moment.",
    ],
    units: [
      "Closed-box reveal clip.",
      "Opened-product detail clip.",
    ],
    assembly: "Sequence the two clips with a clean reveal cut.",
    render: "Render the Studio composition as the final video.",
  },
  toolCalls: [
    {
      tool: "media.generateVideo",
      prompt: "Animate the closed-box product still as a short premium reveal clip with a slow push-in camera move and soft studio light.",
      planStep: "Create the closed-box reveal clip.",
      input: {
        aspectRatio: "9:16",
        durationSeconds: 4,
        provider: "fal",
        model: "fal-ai/kling-video/v3/pro/image-to-video",
        priorImageOutputIndex: 0,
      },
    },
    {
      tool: "media.generateVideo",
      prompt: "Animate the opened-product desk still as a short detail clip with a gentle parallax move and polished product-lighting shimmer.",
      planStep: "Create the opened-product detail clip.",
      input: {
        aspectRatio: "9:16",
        durationSeconds: 4,
        provider: "fal",
        model: "fal-ai/kling-video/v3/pro/image-to-video",
        priorImageOutputIndex: 1,
      },
    },
    {
      tool: "studio.compose",
      prompt: "Sequence the closed-box clip, then the opened-product detail clip, with a clean reveal cut.",
      planStep: "Stitch the clips in Studio.",
      input: { aspectRatio: "9:16" },
    },
    {
      tool: "studio.render",
      prompt: "Render the stitched Studio composition as the final vertical product launch video.",
      planStep: "Render the final video.",
      input: { renderSettings: { aspectRatio: "9:16" } },
    },
  ],
}));

assert.equal(multiClipReferenceVideoDecision.kind, "create");
assert.equal(multiClipReferenceVideoDecision.productionPlan?.finalArtifact, "Finished vertical product launch video.");
assert.equal(multiClipReferenceVideoDecision.toolCalls.length, 4);
assert.deepEqual(
  multiClipReferenceVideoDecision.toolCalls.map((toolCall) => toolCall.toolName),
  ["media.generateVideo", "media.generateVideo", "studio.compose", "studio.render"]
);
assert.equal(multiClipReferenceVideoDecision.toolCalls[0].input?.priorImageOutputIndex, 0);
assert.equal(multiClipReferenceVideoDecision.toolCalls[1].input?.priorImageOutputIndex, 1);
assert.equal(
  multiClipReferenceVideoDecision.toolCalls[0].input?.model,
  "fal-ai/kling-video/v3/pro/image-to-video"
);

const multiStepImageInput = normalizePlannedToolInputForToolCall({
  input: {
    prompt: "Create the before gym mirror selfie image.",
    count: 2,
  },
  planStep: "Create the before reference still.",
  prompt: "Create the before gym mirror selfie image.",
  siblingToolNames: ["media.generateImage", "media.generateImage"],
  toolName: "media.generateImage",
});
assert.equal(multiStepImageInput.count, 2);

const variationImageInput = normalizePlannedToolInputForToolCall({
  input: {
    prompt: "Create four color options for the product package.",
    count: 4,
  },
  planStep: "Create four product color options.",
  prompt: "Create four color options for the product package.",
  siblingToolNames: ["media.generateImage", "media.generateImage"],
  toolName: "media.generateImage",
});
assert.equal(variationImageInput.count, 4);

const imageEditContinuityInput = normalizePlannedToolInputForToolCall({
  input: {
    prompt: "Edit the provided image so the man appears stronger, leaner, more muscular, and confident while preserving his identity, gym mirror selfie pose, setting, and casual iPhone realism.",
    usePriorImageOutputs: true,
  },
  planStep: "Create the after reference still.",
  prompt: "Edit the provided image so the man appears stronger, leaner, more muscular, and confident while preserving his identity, gym mirror selfie pose, setting, and casual iPhone realism.",
  siblingToolNames: ["media.generateImage", "media.generateImage"],
  toolName: "media.generateImage",
});
assert.equal(
  imageEditContinuityInput.prompt,
  "Edit the provided image so the man appears stronger, leaner, more muscular, and confident while preserving his identity, gym mirror selfie pose, setting, and casual iPhone realism."
);
assert.equal(imageEditContinuityInput.usePriorImageOutputs, true);

assert.equal(
  normalizeFalVideoDurationForModel("fal-ai/kling-video/v3/pro/image-to-video", 2),
  "3"
);
assert.equal(
  normalizeFalVideoDurationForModel("fal-ai/kling-video/v3/pro/image-to-video", 16),
  "15"
);
assert.equal(
  normalizeFalVideoDurationForModel("fal-ai/ltx-video", 2),
  2
);

const generatedContinuityVideoDecision = normalizeAgentDecision(JSON.stringify({
  kind: "create",
  response: "I'll create reference stills for the two moments, animate each still, then assemble the finished video.",
  outputType: "video",
  brief: "Create a casual phone-style transformation video with the same woman before and after a fitness journey.",
  productionPlan: {
    finalArtifact: "Finished vertical transformation video.",
    sourceRoles: [
      "Generated image 0 is the before moment.",
      "Generated image 1 is the after moment and uses image 0 for identity continuity.",
    ],
    units: [
      "Before reference still.",
      "After reference still.",
      "Before image-to-video clip.",
      "After image-to-video clip.",
    ],
    assembly: "Sequence the before clip, then the after clip.",
    render: "Render the Studio composition as the final video.",
  },
  toolCalls: [
    {
      tool: "media.generateImage",
      prompt: "Create a realistic casual iPhone-style gym mirror selfie of a woman at the beginning of a fitness journey.",
      planStep: "Create the before reference still.",
      input: { aspectRatio: "9:16" },
    },
    {
      tool: "media.generateImage",
      prompt: "Using the previous reference image for identity and gym continuity, create the later progress moment: the woman is stronger, leaner, more muscular, and confident in the same mirror selfie style.",
      planStep: "Create the after reference still.",
      input: { aspectRatio: "9:16", usePriorImageOutputs: true },
    },
    {
      tool: "media.generateVideo",
      prompt: "Animate the provided reference image as casual handheld iPhone gym mirror selfie footage with subtle phone movement, natural lighting, slight softness, and mild motion blur.",
      planStep: "Animate the before clip.",
      input: {
        aspectRatio: "9:16",
        durationSeconds: 4,
        provider: "fal",
        model: "fal-ai/kling-video/v3/pro/image-to-video",
        priorImageOutputIndex: 0,
      },
    },
    {
      tool: "media.generateVideo",
      prompt: "Animate the provided reference image as casual handheld iPhone gym mirror selfie footage with subtle phone movement, natural lighting, slight softness, and mild motion blur.",
      planStep: "Animate the after clip.",
      input: {
        aspectRatio: "9:16",
        durationSeconds: 4,
        provider: "fal",
        model: "fal-ai/kling-video/v3/pro/image-to-video",
        priorImageOutputIndex: 1,
      },
    },
    {
      tool: "studio.compose",
      prompt: "Sequence the before clip followed by the after clip with a simple cut.",
      planStep: "Combine the clips.",
      input: { aspectRatio: "9:16" },
    },
    {
      tool: "studio.render",
      prompt: "Render the combined vertical video.",
      planStep: "Render the final video.",
      input: { renderSettings: { aspectRatio: "9:16" } },
    },
  ],
}));

assert.equal(generatedContinuityVideoDecision.kind, "create");
assert.deepEqual(
  generatedContinuityVideoDecision.toolCalls.map((toolCall) => toolCall.toolName),
  [
    "media.generateImage",
    "media.generateImage",
    "media.generateVideo",
    "media.generateVideo",
    "studio.compose",
    "studio.render",
  ]
);
assert.equal(generatedContinuityVideoDecision.toolCalls[1].input?.usePriorImageOutputs, true);
assert.equal(generatedContinuityVideoDecision.toolCalls[2].input?.priorImageOutputIndex, 0);
assert.equal(generatedContinuityVideoDecision.toolCalls[3].input?.priorImageOutputIndex, 1);
assert.doesNotMatch(generatedContinuityVideoDecision.toolCalls[2].prompt ?? "", /same woman|six months later|previous/i);
assert.doesNotMatch(generatedContinuityVideoDecision.toolCalls[3].prompt ?? "", /same woman|six months later|previous/i);

const legacyToolsDecision = normalizeAgentDecision(JSON.stringify({
  kind: "create",
  response: "I'll create this.",
  outputType: "image",
  brief: "Create an image of an apple.",
  tools: ["media.generateImage"],
}));
assert.equal(legacyToolsDecision.kind, "clarify");
assert.match(legacyToolsDecision.response, /valid tool plan/i);

const transformationVideoInput = buildPlannedToolInput({
  content: transformationBrief,
  outputType: "video",
  toolName: "media.generateVideo",
});
assert.equal(transformationVideoInput.prompt, transformationBrief);

const videoRenderToolInput = buildPlannedToolInput({
  content: "AI render a vertical video for 6 seconds using provider bulkapis.",
  outputType: "video",
  toolName: "media.renderVideo",
});
assert.equal(videoRenderToolInput.aspectRatio, "9:16");
assert.equal(videoRenderToolInput.maxDurationSeconds, 6);
assert.equal(videoRenderToolInput.provider, "bulkapis");

const audioToolInput = buildPlannedToolInput({
  content: "Generate a voiceover for the launch script.",
  outputType: "audio",
  toolName: "media.generateAudio",
});
assert.equal(audioToolInput.mode, "voiceover");
assert.equal(audioToolInput.text, "Generate a voiceover for the launch script.");

const textToolInput = buildPlannedToolInput({
  content: "Write a short script for an AI fruit drama intro.",
  outputType: "text",
  toolName: "text.generate",
});
assert.equal(textToolInput.kind, "script");
assert.equal(textToolInput.prompt, "Write a short script for an AI fruit drama intro.");

const referenceAnalysisInput = buildPlannedToolInput({
  content: "Analyze @Banana for reusable visual style.",
  outputType: "analysis",
  referenceMentions: [bananaReference],
  toolName: "analyze.source",
});
assert.equal(referenceAnalysisInput.sourceType, "library_asset");
assert.equal(referenceAnalysisInput.source, "asset_1");

console.log("Agent Create planning contract passed");
