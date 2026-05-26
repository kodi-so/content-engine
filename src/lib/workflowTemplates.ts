import {
  WORKFLOW_GRAPH_SCHEMA_VERSION,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowProviderName,
} from "./workflowGraph";
import { DEFAULT_PUBLISHING_PROVIDER } from "./publishingRouting";
import type { PostCompilerPresetId } from "./postCompilerPresets";
import type { PublishingProvider } from "../types";

export type WorkflowTemplateId =
  | "persona_image_set"
  | "ai_ugc_ad"
  | "before_after_transformation"
  | "slideshow_carousel"
  | "app_demo_video"
  | "talking_avatar"
  | "hook_broll_voiceover_short";

export type WorkflowTemplateCategory =
  | "persona"
  | "ugc"
  | "transformation"
  | "slideshow"
  | "app_demo"
  | "video";

export type WorkflowTemplatePlaceholderKind =
  | "brand_context"
  | "persona"
  | "media"
  | "prompt"
  | "product_context"
  | "voice"
  | "platform";

export type WorkflowTemplatePlaceholder = {
  key: string;
  label: string;
  kind: WorkflowTemplatePlaceholderKind;
  required: boolean;
  description: string;
};

export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  name: string;
  category: WorkflowTemplateCategory;
  description: string;
  purpose: string;
  outputType: "image_set" | "video" | "slideshow" | "carousel" | "post_package";
  defaultPublishingProvider: PublishingProvider;
  requiredInputs: WorkflowTemplatePlaceholder[];
  graph: WorkflowGraph;
};

export type WorkflowTemplateDraftInput = {
  creativeRequest?: string;
};

const defaultRunnerConfig = {
  trigger: "manual",
  scheduleType: "interval",
  intervalHours: 24,
  scheduleDayOfWeek: 1,
  scheduleHour: 9,
  scheduleMinute: 0,
  timezone: "America/Chicago",
  runsPerExecution: 1,
  retryCount: 0,
  timeoutSeconds: 1200,
  failureBehavior: "stop_workflow",
};

function runner(position: { x: number; y: number }): WorkflowNode {
  return {
    id: "runner",
    type: "runner",
    label: "Runner",
    position,
    config: { ...defaultRunnerConfig },
  };
}

function note(id: string, text: string, position: { x: number; y: number }): WorkflowNode {
  return {
    id,
    type: "comment",
    label: "Operator Note",
    position,
    config: { text },
  };
}

function media(
  id: string,
  label: string,
  position: { x: number; y: number },
  config: Record<string, unknown> = {}
): WorkflowNode {
  return {
    id,
    type: "media",
    label,
    position,
    config: {
      artifactIds: [],
      creativeAssetIds: [],
      personaIds: [],
      uploadedMedia: [],
      ...config,
    },
    retention: { mode: "keep", exposeInLibrary: false },
  };
}

function agent(args: {
  id: string;
  label: string;
  position: { x: number; y: number };
  mode: "script_writer" | "prompt_variation" | "image_prompting" | "video_prompting";
  request: string;
  config?: Record<string, unknown>;
  provider?: WorkflowProviderName;
}): WorkflowNode {
  return {
    id: args.id,
    type: "ai_agent",
    label: args.label,
    position: args.position,
    provider: args.provider ?? "bulkapis",
    config: {
      agentMode: args.mode,
      request: args.request,
      tone: "natural",
      platform: "tiktok",
      ...args.config,
    },
    retention: { mode: "discard" },
  };
}

function imageGeneration(args: {
  id: string;
  label: string;
  position: { x: number; y: number };
  count?: number;
  prompt?: string;
}): WorkflowNode {
  return {
    id: args.id,
    type: "image_generation",
    label: args.label,
    position: args.position,
    provider: "bulkapis",
    config: {
      prompt: args.prompt ?? "",
      aspectRatio: "9:16",
      count: args.count ?? 1,
    },
    retention: { mode: "keep", exposeInLibrary: true },
  };
}

function videoGeneration(args: {
  id: string;
  label: string;
  position: { x: number; y: number };
  prompt?: string;
}): WorkflowNode {
  return {
    id: args.id,
    type: "video_generation",
    label: args.label,
    position: args.position,
    provider: "bulkapis",
    config: {
      prompt: args.prompt ?? "",
      aspectRatio: "9:16",
      durationSeconds: 5,
    },
    retention: { mode: "keep_on_failure" },
  };
}

function audioGeneration(id: string, position: { x: number; y: number }): WorkflowNode {
  return {
    id,
    type: "audio_generation",
    label: "Voiceover",
    position,
    provider: "bulkapis",
    config: {
      mode: "tts",
      text: "",
      removeSilence: true,
    },
    retention: { mode: "keep_on_failure" },
  };
}

function lipsync(id: string, position: { x: number; y: number }): WorkflowNode {
  return {
    id,
    type: "lipsync",
    label: "Lip Sync",
    position,
    provider: "bulkapis",
    config: {},
    retention: { mode: "keep_on_failure" },
  };
}

function videoEditor(args: {
  id: string;
  label: string;
  position: { x: number; y: number };
  prompt: string;
}): WorkflowNode {
  return {
    id: args.id,
    type: "ai_video_editor",
    label: args.label,
    position: args.position,
    provider: "bulkapis",
    config: {
      renderMode: "video_render",
      prompt: args.prompt,
      aspectRatio: "9:16",
      maxDurationSeconds: 30,
    },
    retention: { mode: "keep_on_failure" },
  };
}

function postCompiler(
  postType: string,
  position: { x: number; y: number },
  platformPreset: PostCompilerPresetId = "tiktok_vertical_video"
): WorkflowNode {
  return {
    id: "post_compiler",
    type: "post_compiler",
    label: "Post Compiler",
    position,
    config: {
      postType,
      platformPreset,
      caption: "{{CAPTION}}",
      name: "{{POST_NAME}}",
    },
    retention: { mode: "keep", exposeInLibrary: true },
  };
}

function exportNode(position: { x: number; y: number }): WorkflowNode {
  return {
    id: "export",
    type: "export",
    label: "Export",
    position,
    config: {
      destination: "media_library",
      folder: "{{OUTPUT_FOLDER}}",
      fileName: "{{FILE_NAME}}",
      optimizeFor: "tiktok",
    },
    retention: { mode: "keep", exposeInLibrary: true },
  };
}

function graph(nodes: WorkflowNode[], edges: WorkflowGraph["edges"]): WorkflowGraph {
  return {
    schemaVersion: WORKFLOW_GRAPH_SCHEMA_VERSION,
    nodes,
    edges,
    canvas: {
      viewport: { x: 0, y: 0, zoom: 0.82 },
    },
    runSettings: {
      mode: "test",
      artifactRetention: "keep_all",
    },
  };
}

function input(
  key: string,
  label: string,
  kind: WorkflowTemplatePlaceholderKind,
  description: string,
  required = true
): WorkflowTemplatePlaceholder {
  return { key, label, kind, description, required };
}

const commonInputs = {
  brand: input("brand_context", "Brand context", "brand_context", "The brand, product, audience, offer, and creative constraints."),
  persona: input("persona", "Persona", "persona", "One or more reusable personas selected in the Media node."),
  media: input("media", "Reference media", "media", "Creative assets, product images, app captures, b-roll, or uploaded references."),
  prompt: input("creative_request", "Creative request", "prompt", "The angle, hook, transformation, or scene direction for this workflow."),
  product: input("product_context", "Product context", "product_context", "The app, feature, product, offer, or use case being promoted."),
  voice: input("voice_reference", "Voice reference", "voice", "An audio creative asset to guide speech, narration, or avatar voice.", false),
  platform: input("platform", "Platform", "platform", "The target posting surface and aspect ratio assumptions."),
};

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

export function getWorkflowTemplate(templateId: WorkflowTemplateId): WorkflowTemplate {
  const template = WORKFLOW_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error(`Unknown workflow template: ${String(templateId)}`);
  return template;
}

export function listWorkflowTemplates(): WorkflowTemplate[] {
  return [...WORKFLOW_TEMPLATES];
}

function requestPlaceholderValues(creativeRequest: string): Record<string, string> {
  return {
    APP_FEATURE: creativeRequest,
    CAPTION: creativeRequest,
    CREATIVE_REQUEST: creativeRequest,
    CTA: "Try it today",
    FILE_NAME: "workflow-draft",
    OUTPUT_FOLDER: "workflow-drafts",
    POST_NAME: creativeRequest,
    PRODUCT_CONTEXT: creativeRequest,
    SLIDESHOW_TOPIC: creativeRequest,
    TOPIC: creativeRequest,
    TRANSFORMATION_CONTEXT: creativeRequest,
  };
}

function hydrateTemplateValue(value: unknown, placeholders: Record<string, string>): unknown {
  if (typeof value === "string") {
    return Object.entries(placeholders).reduce(
      (currentValue, [key, replacement]) =>
        currentValue.split(`{{${key}}}`).join(replacement),
      value
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => hydrateTemplateValue(item, placeholders));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        hydrateTemplateValue(nestedValue, placeholders),
      ])
    );
  }

  return value;
}

function attachCreativeRequest(graph: WorkflowGraph, creativeRequest?: string): WorkflowGraph {
  const request = creativeRequest?.trim();
  if (!request) return graph;

  const placeholders = requestPlaceholderValues(request);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const config = hydrateTemplateValue(node.config, placeholders) as Record<string, unknown>;
      const prompt = typeof config.prompt === "string" ? config.prompt.trim() : "";
      const requestText = typeof config.request === "string" ? config.request.trim() : "";

      return {
        ...node,
        config: {
          ...config,
          ...(prompt ? { prompt } : node.type === "native_slideshow_planner" ? { prompt: request } : {}),
          ...(requestText ? { request: `${requestText}\n\nCreative request:\n${request}` } : {}),
        },
      };
    }),
  };
}

export function createWorkflowGraphFromTemplate(
  templateId: WorkflowTemplateId,
  draft?: WorkflowTemplateDraftInput
): WorkflowGraph {
  return attachCreativeRequest(
    structuredClone(getWorkflowTemplate(templateId).graph),
    draft?.creativeRequest
  );
}
