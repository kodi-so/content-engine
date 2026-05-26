import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import {
  WORKFLOW_GRAPH_SCHEMA_VERSION,
  WORKFLOW_NODE_TYPES,
} from "../../src/lib/workflow/workflowGraph";
import { listWorkflowNodeDefinitions } from "../../src/lib/workflow/workflowNodeCatalog";
import {
  WORKFLOW_AGENT_PRESETS,
  type WorkflowAgentPreset,
} from "../../src/lib/workflow/workflowAgentPresets";
import { listWorkflowTemplates } from "../../src/lib/workflow/workflowTemplates";

const JSON_MIME_TYPE = "application/json";
const MARKDOWN_MIME_TYPE = "text/markdown";

type McpResourceDescriptor = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
  annotations: {
    audience: ("assistant" | "user")[];
    priority: number;
  };
};

type McpResourceContent = {
  uri: string;
  mimeType: string;
  text: string;
};

type ResourceDefinition = McpResourceDescriptor & {
  access: "static" | "user";
};

const RESOURCE_DEFINITIONS = [
  {
    uri: "content-engine://architecture/guide",
    name: "content-engine-architecture",
    title: "Content Engine Architecture Guide",
    description: "Product direction, core workflow rules, provider decisions, and MCP strategy.",
    mimeType: MARKDOWN_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 1 },
  },
  {
    uri: "content-engine://workflows/graph-schema",
    name: "workflow-graph-schema",
    title: "Workflow Graph Schema",
    description: "Typed graph model, node types, data types, edge rules, and validation invariants.",
    mimeType: JSON_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 1 },
  },
  {
    uri: "content-engine://workflows/node-catalog",
    name: "workflow-node-catalog",
    title: "Workflow Node Catalog",
    description: "Available workflow node types, ports, defaults, provider requirements, and retention defaults.",
    mimeType: JSON_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 1 },
  },
  {
    uri: "content-engine://workflows/templates",
    name: "workflow-templates",
    title: "Built-In Workflow Templates",
    description: "Starter workflow graphs and required inputs for reusable content automation patterns.",
    mimeType: JSON_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 0.95 },
  },
  {
    uri: "content-engine://prompts/agent-recipes",
    name: "agent-prompt-recipes",
    title: "AI Agent Prompt Recipes",
    description: "Built-in AI agent modes and prompt-writing guidance for workflow builders.",
    mimeType: JSON_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 0.9 },
  },
  {
    uri: "content-engine://knowledge/prompting/ai-ugc",
    name: "ai-ugc-prompting-guide",
    title: "AI UGC Prompting Guide",
    description: "Creative guidance for persona-led AI UGC ads and organic UGC content workflows.",
    mimeType: JSON_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 0.9 },
  },
  {
    uri: "content-engine://knowledge/prompting/transformation",
    name: "transformation-prompting-guide",
    title: "Transformation Content Prompting Guide",
    description: "Guidance for before/after transformation identities, prompts, and workflow structure.",
    mimeType: JSON_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 0.88 },
  },
  {
    uri: "content-engine://knowledge/prompting/slideshow",
    name: "slideshow-prompting-guide",
    title: "Slideshow Prompting Guide",
    description: "Guidance for native slideshow/carousel planning, slide copy, and renderer workflows.",
    mimeType: JSON_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 0.88 },
  },
  {
    uri: "content-engine://knowledge/prompting/video",
    name: "video-prompting-guide",
    title: "Video Prompting Guide",
    description: "Guidance for short-form video prompting, clip generation, editing, audio, and continuity.",
    mimeType: JSON_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 0.88 },
  },
  {
    uri: "content-engine://knowledge/node-selection",
    name: "workflow-node-selection-heuristics",
    title: "Workflow Node Selection Heuristics",
    description: "Rules of thumb for choosing nodes, ports, and graph shapes for content workflows.",
    mimeType: JSON_MIME_TYPE,
    access: "static",
    annotations: { audience: ["assistant"], priority: 0.92 },
  },
  {
    uri: "content-engine://providers/model-catalog",
    name: "provider-model-catalog",
    title: "Provider Model Catalog Snapshot",
    description: "Active provider models, capabilities, pricing metadata, and cached schema snapshots.",
    mimeType: JSON_MIME_TYPE,
    access: "user",
    annotations: { audience: ["assistant"], priority: 0.9 },
  },
  {
    uri: "content-engine://accounts/brands",
    name: "brand-summaries",
    title: "Brand Summaries",
    description: "Authenticated user's brands and content strategy context.",
    mimeType: JSON_MIME_TYPE,
    access: "user",
    annotations: { audience: ["assistant"], priority: 0.85 },
  },
  {
    uri: "content-engine://accounts/personas",
    name: "persona-summaries",
    title: "Persona Summaries",
    description: "Authenticated user's AI people, mascots, customer avatars, and attached asset references.",
    mimeType: JSON_MIME_TYPE,
    access: "user",
    annotations: { audience: ["assistant"], priority: 0.85 },
  },
  {
    uri: "content-engine://accounts/creative-assets",
    name: "creative-asset-summaries",
    title: "Creative Asset Summaries",
    description: "Authenticated user's reusable media references for workflow inputs.",
    mimeType: JSON_MIME_TYPE,
    access: "user",
    annotations: { audience: ["assistant"], priority: 0.8 },
  },
] satisfies ResourceDefinition[];

function requireUserId(identity: { subject: string } | null) {
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

function resourceDescriptor(resource: ResourceDefinition): McpResourceDescriptor {
  const { access: _access, ...descriptor } = resource;
  return descriptor;
}

function resourceContent(
  resource: ResourceDefinition,
  text: string
): { contents: McpResourceContent[] } {
  return {
    contents: [
      {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text,
      },
    ],
  };
}

function jsonResource(resource: ResourceDefinition, value: unknown) {
  return resourceContent(resource, `${JSON.stringify(value, null, 2)}\n`);
}

function architectureGuide() {
  return [
    "# Content Engine MCP Architecture Guide",
    "",
    "Content Engine is a canvas-native content automation platform. External agents should build and operate workflows using the same domain model as the web app.",
    "",
    "Core rules:",
    "",
    "- Workflows are canvas-native graphs.",
    "- A workflow run produces one final post package.",
    "- Node execution is explicit only: manual run, schedule, or external MCP/API run.",
    "- Editing a workflow must never call providers or spend credits.",
    "- Graphs may branch and merge, but they must not contain cycles.",
    "- A graph should have one runner node.",
    "- Intermediate artifacts are retained according to workflow and node retention settings.",
    "- BulkAPIs is the default AI/media provider behind a swappable provider layer.",
    "- BulkAPIs should not be used for posting in the near-term platform plan.",
    "- Publishing should go through the publishing abstraction backed by Postiz or Post Bridge.",
    "- MCP resources are read-only context. MCP tools must enforce scopes before mutating data.",
    "",
    "Recommended workflow-building loop:",
    "",
    "1. Read the architecture guide, workflow graph schema, node catalog, and templates.",
    "2. Read brand, persona, creative asset, and model catalog summaries for the authenticated user.",
    "3. Choose the closest template or create a blank graph.",
    "4. Build a graph that starts at the runner, uses typed ports, and ends in export or auto_post.",
    "5. Validate the graph before saving.",
    "6. Run explicitly only when the user requests a run or a schedule fires.",
  ].join("\n");
}

function workflowGraphSchema() {
  return {
    schemaVersion: WORKFLOW_GRAPH_SCHEMA_VERSION,
    nodeTypes: WORKFLOW_NODE_TYPES,
    portDataTypes: [
      "any",
      "text",
      "json",
      "prompt",
      "image",
      "video",
      "audio",
      "media",
      "slide_spec",
      "slideshow",
      "post_package",
      "artifact",
    ],
    providerNames: [
      "bulkapis",
      "gemini",
      "fal",
      "openrouter",
      "postiz",
      "post_bridge",
      "manual",
    ],
    graphShape: {
      schemaVersion: "number",
      nodes: "WorkflowNode[]",
      edges: "WorkflowEdge[]",
      canvas: "optional viewport state",
      runSettings: "optional run mode and artifact retention settings",
    },
    nodeShape: {
      id: "stable string unique within graph",
      type: "one of nodeTypes",
      label: "human-readable canvas label",
      position: { x: "number", y: "number" },
      provider: "optional provider name",
      model: "optional provider model id",
      config: "node-specific JSON object",
      inputBindings: "optional map from input key to literal/node/artifact/media/persona binding",
      retention: "optional node retention override",
    },
    edgeShape: {
      id: "stable string unique within graph",
      sourceNodeId: "source node id",
      sourcePort: "source output port id",
      targetNodeId: "target node id",
      targetPort: "target input port id",
    },
    invariants: [
      "exactly one runner node",
      "runner nodes have no input ports",
      "comment nodes are annotations and should not be part of execution",
      "edges must reference existing nodes and valid ports",
      "graphs must be acyclic",
      "execution must be explicit and never triggered by graph edits",
      "terminal output nodes should be export or auto_post",
      "auto_post should keep autoPublish false unless the user explicitly configures publishing",
    ],
  };
}

function agentRecipes(presets: WorkflowAgentPreset[]) {
  return {
    guidance: [
      "AI Agent nodes should encode reusable creative judgment, not one-off chat replies.",
      "Prefer specific output contracts: one prompt, one script, one analysis, or structured JSON.",
      "Prompts should include constraints that prevent generic output, such as camera/source details, subject locks, platform target, and negative instructions.",
      "When an agent feeds a generation node, use the output port matching the intended downstream input, such as prompt or script.",
      "Keep provider/model settings configurable at the node level.",
    ],
    presets,
  };
}

function aiUgcPromptingGuide() {
  return {
    purpose:
      "Create persona-led short-form content that feels like platform-native UGC rather than a polished ad.",
    preferredWorkflowShape: [
      "runner -> media/persona references",
      "media/persona references -> script_writer AI agent",
      "script_writer -> video_prompting AI agent",
      "media/persona references + video prompt -> video_generation or lipsync",
      "script/caption + media -> post_compiler -> export or auto_post",
    ],
    promptPrinciples: [
      "Lock persona identity before varying setting, outfit, pose, and camera details.",
      "Name the platform and content style, such as TikTok selfie, iPhone front camera, or casual screen-recorded app demo.",
      "Make the content emotionally specific: pain point, realization, proof moment, and CTA.",
      "Prefer everyday imperfections over generic quality language.",
      "Keep physical actions simple and avoid complex hand gestures unless reference media supports them.",
      "Avoid words like photorealistic, high quality, 8K, flawless, studio lighting, stock photo, and DSLR unless the user explicitly wants that aesthetic.",
    ],
    scriptShape: [
      "Hook in the first 1 to 2 seconds.",
      "Name the relatable problem or desire.",
      "Show the product, app, habit, or transformation mechanism.",
      "Add one proof detail or concrete result.",
      "End with a soft CTA that fits the platform.",
    ],
    agentPromptTemplate:
      "Write one natural short-form UGC script/prompt for {brand_or_product}. Keep the persona identity consistent: {persona_lock}. Vary the setting, camera, lighting, and everyday imperfections. Make it platform-native for {platform}. Output only {script_or_prompt_output}.",
    usefulInputs: [
      "brand voice and offer",
      "persona identity prompt",
      "source images or video",
      "product context",
      "platform target",
      "desired CTA",
    ],
    commonMistakes: [
      "Building a single generic LLM prompt when a script agent plus video prompt agent would make the workflow reusable.",
      "Skipping persona references, then asking a video model to preserve identity from text alone.",
      "Using ad-copy language that sounds like a landing page instead of spoken UGC.",
      "Letting every run create totally different characters instead of locking identity and varying context.",
    ],
  };
}

function transformationPromptingGuide() {
  return {
    purpose:
      "Create credible before/after content that preserves identity while varying scene, condition, mood, and story context.",
    preferredWorkflowShape: [
      "runner -> persona media",
      "runner + persona media -> before prompt agent",
      "runner + persona media -> after prompt agent",
      "before prompt + persona reference -> image_generation",
      "after prompt + persona reference -> image_generation",
      "before/after images -> ai_video_editor or post_compiler",
      "post_compiler -> export or auto_post",
    ],
    identityRules: [
      "Treat the persona as the same person across before and after states.",
      "Keep face, age, skin tone, hair, body type baseline, and recognizable features consistent.",
      "Vary only the transformation-relevant traits and context.",
      "Do not overstate results. Credibility matters more than dramatic contrast.",
    ],
    beforePromptRules: [
      "Use relaxed posture, ordinary expression, and everyday environment.",
      "Include visible texture and small environmental imperfections.",
      "Avoid humiliation, shame, or medically extreme descriptions.",
      "Name camera, framing, lighting direction, and setting.",
    ],
    afterPromptRules: [
      "Show credible progress with similar identity and believable continuity.",
      "Use confident but natural posture.",
      "Keep lighting and styling improved without becoming a glossy stock image.",
      "Maintain the same approximate age and recognizable features.",
    ],
    agentPromptTemplate:
      "Output one {before_or_after} image prompt for a transformation story about {transformation_context}. Identity is locked: {persona_lock}. Vary setting, clothing, pose, lighting, camera, and environmental details. Keep the image natural, everyday, and believable. Output the full prompt only.",
    commonMistakes: [
      "Letting before and after prompts describe two different people.",
      "Making the before image cruel or stigmatizing.",
      "Making the after image too polished, flawless, or ad-like.",
      "Using one image generation node when separate before and after branches would be easier to debug.",
    ],
  };
}

function slideshowPromptingGuide() {
  return {
    purpose:
      "Create native carousel/slideshow content with a strong hook, coherent slide sequence, and renderer-friendly slide specs.",
    preferredWorkflowShape: [
      "runner + brand/media context -> native_slideshow_planner",
      "native_slideshow_planner + reference media -> native_slideshow_renderer",
      "native_slideshow_renderer -> post_compiler",
      "post_compiler -> export or auto_post",
    ],
    planningPrinciples: [
      "The planner should decide slide count, slide roles, hook, body sequence, and CTA.",
      "Each slide should have one job: hook, problem, insight, step, proof, objection, or CTA.",
      "Keep visible text concise enough for mobile reading.",
      "Use platform-native pacing: strong first slide, fast middle, clear final action.",
      "Prefer explicit slide specs over a single vague image prompt.",
    ],
    slideSpecFields: [
      "slideId",
      "role",
      "purpose",
      "visibleText",
      "backgroundPrompt or finalImagePrompt",
      "layout intent",
      "textBlocks when precise text placement matters",
    ],
    promptTemplate:
      "Plan a {slide_count}-slide vertical carousel for {topic}. Use brand context: {brand_context}. Create one clear job per slide, concise visible text, and specific visual direction. Output structured slide specs for the native renderer.",
    commonMistakes: [
      "Putting too much text on each slide.",
      "Skipping the native slideshow renderer and trying to generate each slide as unrelated images.",
      "Using generic motivational copy instead of a specific argument or sequence.",
      "Not including a final CTA or save/share reason.",
    ],
  };
}

function videoPromptingGuide() {
  return {
    purpose:
      "Create short-form videos by separating concept, script, generation prompts, assets, audio, editing, and final packaging.",
    preferredWorkflowShapes: {
      imageToVideo:
        "runner -> prompt agent -> image_generation -> video_generation -> post_compiler -> export",
      ugcVideo:
        "runner + persona media -> script agent -> video prompt agent -> video_generation/lipsync -> post_compiler -> export",
      editedVideo:
        "runner + media -> script/prompt agent -> audio_generation optional -> ai_video_editor -> post_compiler -> export",
      talkingAvatar:
        "runner + avatar media -> script agent -> audio_generation -> lipsync -> post_compiler -> export",
    },
    promptPrinciples: [
      "Choose the model based on required inputs: prompt-only, image-to-video, start/end frames, reference video, lipsync, or video render.",
      "Separate script writing from video prompting when the workflow needs spoken content.",
      "Use AI Video Editor when multiple clips, images, audio, or app captures need to become one coherent final video.",
      "Specify subject, scene, movement, timing, camera behavior, continuity, aspect ratio, and duration.",
      "Keep one video generation node focused on one clip unless the model is explicitly an editor/render model.",
    ],
    videoPromptTemplate:
      "Create one vertical short-form video prompt for {content_goal}. Subject: {subject_lock}. Scene: {scene}. Motion: {motion}. Camera: {camera}. Timing: {duration}. Preserve continuity with references. Output the video prompt only.",
    editorPromptTemplate:
      "Assemble the provided assets into one {aspect_ratio} video for {platform}. Follow this story beat order: {beats}. Match visuals to script/audio, keep pacing fast, preserve app/persona legibility, and leave room for captions.",
    commonMistakes: [
      "Asking a single video generation node to do editing, captioning, scripting, and identity preservation all at once.",
      "Using video_generation when ai_video_editor is the better fit for stitching assets.",
      "Forgetting audio/lipsync when the desired output is a talking person.",
      "Not exposing duration and aspect ratio in node config.",
    ],
  };
}

function nodeSelectionHeuristics() {
  return {
    purpose:
      "Help external agents choose the smallest useful workflow graph for a content idea.",
    defaultGraphRules: [
      "Start with exactly one runner.",
      "End with export for library/download workflows or auto_post for explicit publishing workflows.",
      "Use post_compiler before export/auto_post when the final output is a social post package.",
      "Keep comment nodes for operator notes only; they are not executable.",
      "Avoid cycles. Use branches for variants and merges for assembly.",
      "Do not run providers while editing graph structure.",
    ],
    chooseNodes: [
      {
        when: "The workflow needs reusable text, scripts, captions, prompt variations, or structured analysis.",
        choose: "ai_agent or llm",
        notes: "Use ai_agent for opinionated content-production roles; use llm for generic text/JSON generation.",
      },
      {
        when: "The workflow needs uploaded references, creative assets, persona media, app captures, voice references, or b-roll.",
        choose: "media",
        notes: "Connect media outputs to agent context and generation reference ports.",
      },
      {
        when: "The workflow needs new still images.",
        choose: "image_generation",
        notes: "Feed prompt from ai_agent/llm and reference_image from media/persona outputs when identity matters.",
      },
      {
        when: "The workflow needs one generated clip from prompt or image references.",
        choose: "video_generation",
        notes: "Use model catalog schemas to decide required reference image, start/end frame, or reference video inputs.",
      },
      {
        when: "The workflow needs narration, voiceover, or sound effects.",
        choose: "audio_generation",
        notes: "Feed text/script into text and optional voice reference into voice_reference.",
      },
      {
        when: "The workflow needs a person/avatar to speak an audio track.",
        choose: "lipsync",
        notes: "Feed image/video plus audio. Use after audio_generation for talking-avatar workflows.",
      },
      {
        when: "The workflow needs several clips/images/audio assets stitched into one final video.",
        choose: "ai_video_editor",
        notes: "Use this for app demo videos, before/after videos, b-roll voiceover edits, and multi-asset compositions.",
      },
      {
        when: "The workflow needs a native carousel or slideshow.",
        choose: "native_slideshow_planner plus native_slideshow_renderer",
        notes: "Plan structured slide specs first, then render. Avoid treating slideshows as unrelated image prompts.",
      },
      {
        when: "The workflow needs one final social payload with caption and media.",
        choose: "post_compiler",
        notes: "Compile media/slideshow plus caption/metadata before export or auto_post.",
      },
    ],
    debugTips: [
      "If a node has bad output, inspect its inputs first, then its prompt/config.",
      "If identity drifts, add stronger persona/media reference bindings upstream.",
      "If a workflow is hard to tune, split a generic node into a script agent, prompt agent, and generation node.",
      "If the library gets noisy, set intermediate nodes to discard or keep_on_failure.",
    ],
  };
}

async function modelCatalog(ctx: QueryCtx) {
  const models = await ctx.db.query("providerModels").collect();
  return models
    .filter((model) => model.isActive)
    .sort((a, b) => `${a.provider}:${a.displayName}`.localeCompare(`${b.provider}:${b.displayName}`))
    .map((model) => ({
      providerModelId: model._id,
      provider: model.provider,
      modelId: model.modelId,
      displayName: model.displayName,
      description: model.description,
      category: model.category,
      capabilities: model.capabilities,
      pricing: model.pricing,
      schemaSnapshot: model.schemaSnapshot,
      lastSyncedAt: model.lastSyncedAt,
    }));
}

async function brandSummaries(ctx: QueryCtx, userId: string) {
  const brands = await ctx.db
    .query("brands")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return brands
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((brand) => ({
      brandId: brand._id,
      name: brand.name,
      description: brand.description,
      niche: brand.niche,
      audience: brand.audience,
      voice: brand.voice,
      visualStyle: brand.visualStyle,
      offer: brand.offer,
      constraints: brand.constraints,
      examplePosts: brand.examplePosts,
      performanceNotes: brand.performanceNotes,
      isActive: brand.isActive,
      updatedAt: brand.updatedAt,
    }));
}

async function personaSummaries(ctx: QueryCtx, userId: string) {
  const personas = await ctx.db
    .query("personas")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return personas
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((persona) => ({
      personaId: persona._id,
      brandId: persona.brandId,
      name: persona.name,
      personaType: persona.personaType,
      description: persona.description,
      identityPrompt: persona.identityPrompt,
      visualConstraints: persona.visualConstraints,
      sourceAssetIds: persona.sourceAssetIds,
      generatedAssetIds: persona.generatedAssetIds,
      voiceAssetIds: persona.voiceAssetIds,
      usageNotes: persona.usageNotes,
      updatedAt: persona.updatedAt,
    }));
}

async function creativeAssetSummaries(ctx: QueryCtx, userId: string) {
  const assets = await ctx.db
    .query("creativeAssets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return assets
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((asset) => ({
      creativeAssetId: asset._id,
      brandId: asset.brandId,
      name: asset.name,
      assetKind: asset.assetKind,
      mediaType: asset.mediaType,
      storageUrl: asset.storageUrl,
      description: asset.description,
      usageNotes: asset.usageNotes,
      instruction:
        asset.metadata && typeof asset.metadata === "object" && "instruction" in asset.metadata
          ? asset.metadata.instruction
          : undefined,
      updatedAt: asset.updatedAt,
    }));
}

export const list = query({
  handler: async (ctx) => {
    requireUserId(await ctx.auth.getUserIdentity());
    return RESOURCE_DEFINITIONS.map(resourceDescriptor);
  },
});

export const read = query({
  args: { uri: v.string() },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const resource = RESOURCE_DEFINITIONS.find((candidate) => candidate.uri === args.uri);
    if (!resource) throw new Error("MCP resource not found");

    switch (resource.uri) {
      case "content-engine://architecture/guide":
        return resourceContent(resource, `${architectureGuide()}\n`);
      case "content-engine://workflows/graph-schema":
        return jsonResource(resource, workflowGraphSchema());
      case "content-engine://workflows/node-catalog":
        return jsonResource(resource, listWorkflowNodeDefinitions());
      case "content-engine://workflows/templates":
        return jsonResource(resource, listWorkflowTemplates());
      case "content-engine://prompts/agent-recipes":
        return jsonResource(resource, agentRecipes(WORKFLOW_AGENT_PRESETS));
      case "content-engine://knowledge/prompting/ai-ugc":
        return jsonResource(resource, aiUgcPromptingGuide());
      case "content-engine://knowledge/prompting/transformation":
        return jsonResource(resource, transformationPromptingGuide());
      case "content-engine://knowledge/prompting/slideshow":
        return jsonResource(resource, slideshowPromptingGuide());
      case "content-engine://knowledge/prompting/video":
        return jsonResource(resource, videoPromptingGuide());
      case "content-engine://knowledge/node-selection":
        return jsonResource(resource, nodeSelectionHeuristics());
      case "content-engine://providers/model-catalog":
        return jsonResource(resource, await modelCatalog(ctx));
      case "content-engine://accounts/brands":
        return jsonResource(resource, await brandSummaries(ctx, userId));
      case "content-engine://accounts/personas":
        return jsonResource(resource, await personaSummaries(ctx, userId));
      case "content-engine://accounts/creative-assets":
        return jsonResource(resource, await creativeAssetSummaries(ctx, userId));
      default:
        throw new Error("MCP resource not found");
    }
  },
});
