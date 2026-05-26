import { DEFAULT_PUBLISHING_PROVIDER } from "../publishingRouting";
import {
  agent,
  audioGeneration,
  commonInputs,
  exportNode,
  graph,
  imageGeneration,
  lipsync,
  media,
  note,
  postCompiler,
  runner,
  videoEditor,
  videoGeneration,
} from "./workflowTemplateBuilders";
import type { WorkflowTemplate } from "./workflowTemplateTypes";

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "persona_image_set",
    name: "Persona image set",
    category: "persona",
    description: "Generate reusable image variations for a selected persona.",
    purpose: "Create a consistent set of persona reference images to attach back to Persona Studio.",
    outputType: "image_set",
    defaultPublishingProvider: DEFAULT_PUBLISHING_PROVIDER,
    requiredInputs: [commonInputs.brand, commonInputs.persona, commonInputs.prompt],
    graph: graph(
      [
        runner({ x: 80, y: 270 }),
        media("persona_media", "Persona References", { x: 360, y: 90 }),
        agent({
          id: "persona_prompt_agent",
          label: "Persona Prompt Agent",
          position: { x: 360, y: 270 },
          mode: "image_prompting",
          request:
            "Write one production-ready image prompt for a reusable generated persona reference. Preserve the selected persona identity and create a natural everyday UGC-style image. Vary the setting, outfit, pose, phone camera, lighting direction, and small environmental imperfections. Output the full prompt only.",
          config: {
            aspectRatio: "9:16",
            lockedDetails:
              "Use the selected persona references and identity prompt. Keep face, age, skin tone, hair, body type, and recognizable identity consistent.",
            avoid: [
              "stock photo look",
              "beauty lighting",
              "flawless skin",
              "watermarks",
              "text overlays",
              "complex hand gestures",
            ],
          },
        }),
        imageGeneration({
          id: "generate_persona_images",
          label: "Generate Persona Images",
          position: { x: 680, y: 270 },
          count: 4,
        }),
        exportNode({ x: 1000, y: 270 }),
        note(
          "operator_note",
          "Select one or more personas in the Persona References node, tune the prompt agent, run the workflow, then attach approved outputs to the persona as generated assets in Persona Studio.",
          { x: 360, y: 520 }
        ),
      ],
      [
        { id: "runner-to-prompt-agent", sourceNodeId: "runner", sourcePort: "run", targetNodeId: "persona_prompt_agent", targetPort: "context" },
        { id: "persona-media-to-prompt-agent", sourceNodeId: "persona_media", sourcePort: "media", targetNodeId: "persona_prompt_agent", targetPort: "media" },
        { id: "persona-media-to-image-reference", sourceNodeId: "persona_media", sourcePort: "image", targetNodeId: "generate_persona_images", targetPort: "reference_image" },
        { id: "prompt-agent-to-image-generation", sourceNodeId: "persona_prompt_agent", sourcePort: "prompt", targetNodeId: "generate_persona_images", targetPort: "prompt" },
        { id: "image-generation-to-export", sourceNodeId: "generate_persona_images", sourcePort: "image", targetNodeId: "export", targetPort: "input" },
      ]
    ),
  },
  {
    id: "ai_ugc_ad",
    name: "AI UGC ad",
    category: "ugc",
    description: "Create a persona-led short video ad with script, avatar/source media, and final package.",
    purpose: "Produce an AI UGC video ad from a reusable persona, a product angle, and optional reference media.",
    outputType: "video",
    defaultPublishingProvider: DEFAULT_PUBLISHING_PROVIDER,
    requiredInputs: [commonInputs.brand, commonInputs.persona, commonInputs.product, commonInputs.prompt],
    graph: graph(
      [
        runner({ x: 80, y: 250 }),
        media("persona_media", "Persona And Product Media", { x: 330, y: 80 }),
        agent({
          id: "script_agent",
          label: "UGC Script Agent",
          position: { x: 330, y: 250 },
          mode: "script_writer",
          request:
            "Write a natural 20 to 30 second UGC ad script for {{PRODUCT_CONTEXT}}. Include a fast hook, relatable problem, product reveal, proof point, and soft CTA.",
          config: { scriptLengthSeconds: 25, hookStyle: "relatable problem", cta: "{{CTA}}" },
        }),
        agent({
          id: "video_prompt_agent",
          label: "Video Prompt Agent",
          position: { x: 650, y: 250 },
          mode: "video_prompting",
          request:
            "Turn the script and persona references into a single video generation prompt. Keep it selfie-style, natural, platform-native, and consistent with the persona.",
          config: { aspectRatio: "9:16", durationSeconds: 5, motionStyle: "subtle handheld selfie" },
        }),
        videoGeneration({ id: "ugc_video", label: "UGC Video", position: { x: 970, y: 250 } }),
        postCompiler("video", { x: 1290, y: 250 }),
        exportNode({ x: 1600, y: 250 }),
      ],
      [
        { id: "runner-to-script", sourceNodeId: "runner", sourcePort: "run", targetNodeId: "script_agent", targetPort: "context" },
        { id: "media-to-script", sourceNodeId: "persona_media", sourcePort: "media", targetNodeId: "script_agent", targetPort: "media" },
        { id: "script-to-video-prompt", sourceNodeId: "script_agent", sourcePort: "script", targetNodeId: "video_prompt_agent", targetPort: "request" },
        { id: "media-to-video-prompt", sourceNodeId: "persona_media", sourcePort: "media", targetNodeId: "video_prompt_agent", targetPort: "media" },
        { id: "media-to-video-image", sourceNodeId: "persona_media", sourcePort: "image", targetNodeId: "ugc_video", targetPort: "image" },
        { id: "video-prompt-to-generation", sourceNodeId: "video_prompt_agent", sourcePort: "prompt", targetNodeId: "ugc_video", targetPort: "prompt" },
        { id: "video-to-post", sourceNodeId: "ugc_video", sourcePort: "video", targetNodeId: "post_compiler", targetPort: "media" },
        { id: "script-to-caption", sourceNodeId: "script_agent", sourcePort: "script", targetNodeId: "post_compiler", targetPort: "caption" },
        { id: "post-to-export", sourceNodeId: "post_compiler", sourcePort: "post_package", targetNodeId: "export", targetPort: "post_package" },
      ]
    ),
  },
  {
    id: "before_after_transformation",
    name: "Before/after transformation",
    category: "transformation",
    description: "Generate before and after visuals, then assemble them into a transformation post.",
    purpose: "Create transformation content for fitness, wellness, productivity, finance, or app outcome narratives.",
    outputType: "video",
    defaultPublishingProvider: DEFAULT_PUBLISHING_PROVIDER,
    requiredInputs: [commonInputs.brand, commonInputs.persona, commonInputs.prompt],
    graph: graph(
      [
        runner({ x: 80, y: 280 }),
        media("persona_media", "Persona References", { x: 330, y: 80 }),
        agent({
          id: "before_prompt_agent",
          label: "Before Prompt Agent",
          position: { x: 330, y: 230 },
          mode: "image_prompting",
          request:
            "Write one natural image prompt for the BEFORE state of {{TRANSFORMATION_CONTEXT}}. Preserve persona identity. Make it everyday, imperfect, phone-shot, and emotionally grounded.",
        }),
        agent({
          id: "after_prompt_agent",
          label: "After Prompt Agent",
          position: { x: 330, y: 410 },
          mode: "image_prompting",
          request:
            "Write one natural image prompt for the AFTER state of {{TRANSFORMATION_CONTEXT}}. Preserve persona identity and environment realism while showing credible progress.",
        }),
        imageGeneration({ id: "before_image", label: "Before Image", position: { x: 680, y: 230 } }),
        imageGeneration({ id: "after_image", label: "After Image", position: { x: 680, y: 410 } }),
        videoEditor({
          id: "transformation_editor",
          label: "Transformation Editor",
          position: { x: 1030, y: 320 },
          prompt:
            "Assemble a vertical before-after transformation video. First show the before image, then the after image. Add a smooth transition beat and leave room for captions.",
        }),
        postCompiler("video", { x: 1350, y: 320 }),
        exportNode({ x: 1660, y: 320 }),
      ],
      [
        { id: "runner-to-before", sourceNodeId: "runner", sourcePort: "run", targetNodeId: "before_prompt_agent", targetPort: "context" },
        { id: "runner-to-after", sourceNodeId: "runner", sourcePort: "run", targetNodeId: "after_prompt_agent", targetPort: "context" },
        { id: "media-to-before", sourceNodeId: "persona_media", sourcePort: "media", targetNodeId: "before_prompt_agent", targetPort: "media" },
        { id: "media-to-after", sourceNodeId: "persona_media", sourcePort: "media", targetNodeId: "after_prompt_agent", targetPort: "media" },
        { id: "media-to-before-ref", sourceNodeId: "persona_media", sourcePort: "image", targetNodeId: "before_image", targetPort: "reference_image" },
        { id: "media-to-after-ref", sourceNodeId: "persona_media", sourcePort: "image", targetNodeId: "after_image", targetPort: "reference_image" },
        { id: "before-prompt-to-image", sourceNodeId: "before_prompt_agent", sourcePort: "prompt", targetNodeId: "before_image", targetPort: "prompt" },
        { id: "after-prompt-to-image", sourceNodeId: "after_prompt_agent", sourcePort: "prompt", targetNodeId: "after_image", targetPort: "prompt" },
        { id: "before-image-to-editor", sourceNodeId: "before_image", sourcePort: "image", targetNodeId: "transformation_editor", targetPort: "image" },
        { id: "after-image-to-editor", sourceNodeId: "after_image", sourcePort: "image", targetNodeId: "transformation_editor", targetPort: "image" },
        { id: "editor-to-post", sourceNodeId: "transformation_editor", sourcePort: "video", targetNodeId: "post_compiler", targetPort: "media" },
        { id: "post-to-export", sourceNodeId: "post_compiler", sourcePort: "post_package", targetNodeId: "export", targetPort: "post_package" },
      ]
    ),
  },
  {
    id: "slideshow_carousel",
    name: "Slideshow carousel",
    category: "slideshow",
    description: "Plan, render, package, and export a native slideshow carousel.",
    purpose: "Create educational, listicle, or sales carousel posts through the native slideshow renderer.",
    outputType: "carousel",
    defaultPublishingProvider: DEFAULT_PUBLISHING_PROVIDER,
    requiredInputs: [commonInputs.brand, commonInputs.media, commonInputs.prompt],
    graph: graph(
      [
        runner({ x: 80, y: 250 }),
        media("reference_media", "Reference Media", { x: 330, y: 80 }),
        {
          id: "slideshow_planner",
          type: "native_slideshow_planner",
          label: "Slideshow Planner",
          position: { x: 330, y: 250 },
          provider: "bulkapis",
          config: { prompt: "{{SLIDESHOW_TOPIC}}", slideCount: 5, aspectRatio: "9:16", platform: "tiktok", tone: "clear" },
          retention: { mode: "discard" },
        },
        {
          id: "slideshow_renderer",
          type: "native_slideshow_renderer",
          label: "Slideshow Renderer",
          position: { x: 680, y: 250 },
          config: { renderMode: "native", aspectRatio: "9:16", resolution: "1080x1920" },
          retention: { mode: "keep_on_failure" },
        },
        postCompiler("carousel", { x: 1010, y: 250 }, "instagram_carousel"),
        exportNode({ x: 1320, y: 250 }),
      ],
      [
        { id: "runner-to-planner", sourceNodeId: "runner", sourcePort: "run", targetNodeId: "slideshow_planner", targetPort: "brand_context" },
        { id: "media-to-planner", sourceNodeId: "reference_media", sourcePort: "media", targetNodeId: "slideshow_planner", targetPort: "media" },
        { id: "planner-to-renderer", sourceNodeId: "slideshow_planner", sourcePort: "slide_spec", targetNodeId: "slideshow_renderer", targetPort: "slide_spec" },
        { id: "media-to-renderer", sourceNodeId: "reference_media", sourcePort: "media", targetNodeId: "slideshow_renderer", targetPort: "media" },
        { id: "renderer-to-post", sourceNodeId: "slideshow_renderer", sourcePort: "slideshow", targetNodeId: "post_compiler", targetPort: "slideshow" },
        { id: "post-to-export", sourceNodeId: "post_compiler", sourcePort: "post_package", targetNodeId: "export", targetPort: "post_package" },
      ]
    ),
  },
  {
    id: "app_demo_video",
    name: "App demo video",
    category: "app_demo",
    description: "Turn app captures and a feature angle into a short demo video.",
    purpose: "Create app marketing clips from screenshots, screen recordings, and feature briefs.",
    outputType: "video",
    defaultPublishingProvider: DEFAULT_PUBLISHING_PROVIDER,
    requiredInputs: [commonInputs.brand, commonInputs.product, commonInputs.media, commonInputs.prompt],
    graph: graph(
      [
        runner({ x: 80, y: 250 }),
        media("app_media", "App Captures", { x: 330, y: 90 }),
        agent({
          id: "demo_prompt_agent",
          label: "Demo Prompt Agent",
          position: { x: 330, y: 250 },
          mode: "video_prompting",
          request:
            "Create a concise app demo video prompt for {{APP_FEATURE}}. Open with a hook, show the product interaction clearly, and end with a simple CTA.",
          config: { aspectRatio: "9:16", durationSeconds: 12, motionStyle: "clean screen-led demo" },
        }),
        videoEditor({
          id: "demo_editor",
          label: "Demo Editor",
          position: { x: 680, y: 250 },
          prompt:
            "Edit the provided app captures into a vertical demo video. Keep UI legible, pace quickly, and avoid covering important product details.",
        }),
        postCompiler("video", { x: 1010, y: 250 }),
        exportNode({ x: 1320, y: 250 }),
      ],
      [
        { id: "runner-to-demo-agent", sourceNodeId: "runner", sourcePort: "run", targetNodeId: "demo_prompt_agent", targetPort: "context" },
        { id: "media-to-demo-agent", sourceNodeId: "app_media", sourcePort: "media", targetNodeId: "demo_prompt_agent", targetPort: "media" },
        { id: "media-to-editor", sourceNodeId: "app_media", sourcePort: "media", targetNodeId: "demo_editor", targetPort: "media" },
        { id: "agent-to-editor", sourceNodeId: "demo_prompt_agent", sourcePort: "prompt", targetNodeId: "demo_editor", targetPort: "prompt" },
        { id: "editor-to-post", sourceNodeId: "demo_editor", sourcePort: "video", targetNodeId: "post_compiler", targetPort: "media" },
        { id: "post-to-export", sourceNodeId: "post_compiler", sourcePort: "post_package", targetNodeId: "export", targetPort: "post_package" },
      ]
    ),
  },
  {
    id: "talking_avatar",
    name: "Talking avatar",
    category: "ugc",
    description: "Write a script, generate narration, and lip-sync an avatar or persona video.",
    purpose: "Create talking-head style content from persona media, voice references, and a script angle.",
    outputType: "video",
    defaultPublishingProvider: DEFAULT_PUBLISHING_PROVIDER,
    requiredInputs: [commonInputs.persona, commonInputs.voice, commonInputs.prompt],
    graph: graph(
      [
        runner({ x: 80, y: 260 }),
        media("avatar_media", "Avatar Media", { x: 330, y: 80 }),
        agent({
          id: "script_agent",
          label: "Avatar Script Agent",
          position: { x: 330, y: 260 },
          mode: "script_writer",
          request:
            "Write a concise talking-avatar script for {{TOPIC}}. Keep it direct, natural, and easy to speak in under 25 seconds.",
          config: { scriptLengthSeconds: 25, hookStyle: "direct claim", cta: "{{CTA}}" },
        }),
        audioGeneration("voiceover", { x: 660, y: 260 }),
        lipsync("avatar_lipsync", { x: 990, y: 260 }),
        postCompiler("video", { x: 1320, y: 260 }),
        exportNode({ x: 1630, y: 260 }),
      ],
      [
        { id: "runner-to-script", sourceNodeId: "runner", sourcePort: "run", targetNodeId: "script_agent", targetPort: "context" },
        { id: "media-to-script", sourceNodeId: "avatar_media", sourcePort: "media", targetNodeId: "script_agent", targetPort: "media" },
        { id: "script-to-audio", sourceNodeId: "script_agent", sourcePort: "script", targetNodeId: "voiceover", targetPort: "text" },
        { id: "media-to-voice-ref", sourceNodeId: "avatar_media", sourcePort: "audio", targetNodeId: "voiceover", targetPort: "voice_reference" },
        { id: "media-to-lipsync-image", sourceNodeId: "avatar_media", sourcePort: "image", targetNodeId: "avatar_lipsync", targetPort: "image" },
        { id: "media-to-lipsync-video", sourceNodeId: "avatar_media", sourcePort: "video", targetNodeId: "avatar_lipsync", targetPort: "video" },
        { id: "audio-to-lipsync", sourceNodeId: "voiceover", sourcePort: "audio", targetNodeId: "avatar_lipsync", targetPort: "audio" },
        { id: "lipsync-to-post", sourceNodeId: "avatar_lipsync", sourcePort: "video", targetNodeId: "post_compiler", targetPort: "media" },
        { id: "script-to-caption", sourceNodeId: "script_agent", sourcePort: "script", targetNodeId: "post_compiler", targetPort: "caption" },
        { id: "post-to-export", sourceNodeId: "post_compiler", sourcePort: "post_package", targetNodeId: "export", targetPort: "post_package" },
      ]
    ),
  },
  {
    id: "hook_broll_voiceover_short",
    name: "Hook b-roll voiceover",
    category: "video",
    description: "Create a short voiceover video from a hook script and b-roll references.",
    purpose: "Produce narrated short-form videos for app marketing, education, and founder-led content.",
    outputType: "video",
    defaultPublishingProvider: DEFAULT_PUBLISHING_PROVIDER,
    requiredInputs: [commonInputs.brand, commonInputs.media, commonInputs.voice, commonInputs.prompt],
    graph: graph(
      [
        runner({ x: 80, y: 260 }),
        media("broll_media", "B-roll And Voice Media", { x: 330, y: 80 }),
        agent({
          id: "script_agent",
          label: "Hook Script Agent",
          position: { x: 330, y: 260 },
          mode: "script_writer",
          request:
            "Write a short voiceover script for {{TOPIC}}. Start with a strong hook, keep the pacing fast, and make each line easy to match with b-roll.",
          config: { scriptLengthSeconds: 30, hookStyle: "curiosity gap", cta: "{{CTA}}" },
        }),
        audioGeneration("voiceover", { x: 660, y: 260 }),
        videoEditor({
          id: "broll_editor",
          label: "B-roll Editor",
          position: { x: 990, y: 260 },
          prompt:
            "Edit the provided b-roll with the generated voiceover into a vertical short. Match visuals to spoken beats and leave room for subtitles.",
        }),
        postCompiler("video", { x: 1320, y: 260 }),
        exportNode({ x: 1630, y: 260 }),
      ],
      [
        { id: "runner-to-script", sourceNodeId: "runner", sourcePort: "run", targetNodeId: "script_agent", targetPort: "context" },
        { id: "media-to-script", sourceNodeId: "broll_media", sourcePort: "media", targetNodeId: "script_agent", targetPort: "media" },
        { id: "script-to-audio", sourceNodeId: "script_agent", sourcePort: "script", targetNodeId: "voiceover", targetPort: "text" },
        { id: "voice-ref-to-audio", sourceNodeId: "broll_media", sourcePort: "audio", targetNodeId: "voiceover", targetPort: "voice_reference" },
        { id: "media-to-editor", sourceNodeId: "broll_media", sourcePort: "media", targetNodeId: "broll_editor", targetPort: "media" },
        { id: "audio-to-editor", sourceNodeId: "voiceover", sourcePort: "audio", targetNodeId: "broll_editor", targetPort: "audio" },
        { id: "script-to-editor", sourceNodeId: "script_agent", sourcePort: "script", targetNodeId: "broll_editor", targetPort: "prompt" },
        { id: "editor-to-post", sourceNodeId: "broll_editor", sourcePort: "video", targetNodeId: "post_compiler", targetPort: "media" },
        { id: "script-to-caption", sourceNodeId: "script_agent", sourcePort: "script", targetNodeId: "post_compiler", targetPort: "caption" },
        { id: "post-to-export", sourceNodeId: "post_compiler", sourcePort: "post_package", targetNodeId: "export", targetPort: "post_package" },
      ]
    ),
  },
];
