import { v } from "convex/values";

export const publishingProviderValidator = v.union(
  v.literal("postiz"),
  v.literal("post_bridge"),
  v.literal("manual")
);

export const modelProviderValidator = v.union(
  v.literal("bulkapis"),
  v.literal("gemini"),
  v.literal("fal"),
  v.literal("openrouter"),
  v.literal("manual")
);

export const generationModelProviderValidator = v.union(
  v.literal("bulkapis"),
  v.literal("gemini"),
  v.literal("fal")
);

export const aiGenerationSettingsValidator = v.object({
  imageProvider: v.optional(generationModelProviderValidator),
  imageModel: v.optional(v.string()),
  imageResolution: v.optional(v.string()),
  videoProvider: v.optional(generationModelProviderValidator),
  videoModel: v.optional(v.string()),
  audioProvider: v.optional(generationModelProviderValidator),
  audioModel: v.optional(v.string()),
  lipsyncProvider: v.optional(generationModelProviderValidator),
  lipsyncModel: v.optional(v.string()),
  videoAnalysisProvider: v.optional(generationModelProviderValidator),
});

export const videoAnalysisSourceTypeValidator = v.union(
  v.literal("url"),
  v.literal("upload")
);

export const videoAnalysisSourcePlatformValidator = v.union(
  v.literal("youtube"),
  v.literal("tiktok"),
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("direct_file"),
  v.literal("unknown")
);

export const videoAnalysisStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed")
);

export const videoAnalysisModeValidator = v.union(
  v.literal("inspiration"),
  v.literal("transcript"),
  v.literal("technical")
);

export const providerModelCategoryValidator = v.union(
  v.literal("chat"),
  v.literal("image"),
  v.literal("video"),
  v.literal("video_render"),
  v.literal("audio"),
  v.literal("lipsync"),
  v.literal("unknown")
);

export const providerModelCapabilitiesValidator = v.object({
  text: v.boolean(),
  structured: v.boolean(),
  image: v.boolean(),
  video: v.boolean(),
  audio: v.boolean(),
  music: v.boolean(),
  lipsync: v.boolean(),
  videoRender: v.boolean(),
  speechToText: v.boolean(),
  asyncJobs: v.boolean(),
  vision: v.boolean(),
});

export const providerModelSchemaSnapshotValidator = v.object({
  inputSchema: v.optional(v.any()),
  resultSchema: v.optional(v.any()),
  raw: v.optional(v.any()),
  source: v.optional(v.string()),
  sourceSyncedAt: v.optional(v.number()),
});

export const platformValidator = v.union(
  v.literal("tiktok"),
  v.literal("instagram"),
  v.literal("youtube"),
  v.literal("x"),
  v.literal("linkedin"),
  v.literal("facebook"),
  v.literal("threads"),
  v.literal("pinterest"),
  v.literal("bluesky"),
  v.literal("google_business")
);

export const creativeAssetKindValidator = v.union(
  v.literal("product"),
  v.literal("style_reference"),
  v.literal("mascot"),
  v.literal("voice"),
  v.literal("logo"),
  v.literal("character"),
  v.literal("person"),
  v.literal("other")
);

export const creativeAssetMediaTypeValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("file")
);

export const socialAccountStatusValidator = v.union(
  v.literal("connected"),
  v.literal("disconnected"),
  v.literal("needs_attention"),
  v.literal("disabled")
);

export const contentFormatValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("lipsync"),
  v.literal("slideshow"),
  v.literal("hook_demo_video"),
  v.literal("ai_ugc_video"),
  v.literal("talking_avatar"),
  v.literal("short_educational_video"),
  v.literal("static_image"),
  v.literal("thread"),
  v.literal("caption_set")
);

export const nodeInputBindingValidator = v.union(
  v.object({
    type: v.literal("literal"),
    value: v.any(),
  }),
  v.object({
    type: v.literal("node_output"),
    sourceNodeId: v.string(),
    sourcePort: v.string(),
    outputKey: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("artifact"),
    artifactId: v.string(),
  }),
  v.object({
    type: v.literal("media_asset"),
    assetId: v.string(),
  })
);

export const contentRequestStatusValidator = v.union(
  v.literal("queued"),
  v.literal("planning"),
  v.literal("generating"),
  v.literal("ready"),
  v.literal("saved"),
  v.literal("failed"),
  v.literal("discarded")
);

export const createThreadStatusValidator = v.union(
  v.literal("idle"),
  v.literal("clarifying"),
  v.literal("planning"),
  v.literal("waiting_for_user"),
  v.literal("running"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("canceled"),
  v.literal("saved")
);

export const createMessageRoleValidator = v.union(
  v.literal("user"),
  v.literal("agent"),
  v.literal("system")
);

export const createMessageKindValidator = v.union(
  v.literal("chat"),
  v.literal("clarification"),
  v.literal("plan"),
  v.literal("status"),
  v.literal("tool_result"),
  v.literal("final_review")
);

export const createToolCallStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("blocked"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled")
);

export const createCheckpointStatusValidator = v.union(
  v.literal("open"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("revised")
);

export const createCheckpointModeValidator = v.union(
  v.literal("debug"),
  v.literal("auto")
);

export const createInferredOutputTypeValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("slideshow"),
  v.literal("analysis"),
  v.literal("text"),
  v.literal("post"),
  v.literal("unknown")
);

export const accountPublishingModeValidator = v.union(
  v.literal("require_approval"),
  v.literal("auto_publish")
);

export const accountAutopilotStatusValidator = v.union(
  v.literal("off"),
  v.literal("active"),
  v.literal("paused")
);

const accountPostingTimeValidator = v.object({
  hour: v.number(),
  minute: v.number(),
});

export const accountCadenceValidator = v.union(
  v.object({
    kind: v.literal("daily"),
    times: v.array(accountPostingTimeValidator),
  }),
  v.object({
    kind: v.literal("weekly"),
    slots: v.array(
      v.object({
        dayOfWeek: v.number(),
        hour: v.number(),
        minute: v.number(),
      })
    ),
  })
);

export const accountPlaybookValidator = v.object({
  summary: v.string(),
  audience: v.optional(v.string()),
  goals: v.array(v.string()),
  creativeDirection: v.optional(v.string()),
  instructions: v.array(v.string()),
  guardrails: v.array(v.string()),
});

export const accountAutopilotValidator = v.object({
  timezone: v.string(),
  cadence: accountCadenceValidator,
  publishingMode: accountPublishingModeValidator,
  generationDefaults: v.optional(
    v.object({
      imageResolution: v.optional(v.string()),
      aspectRatio: v.optional(v.string()),
      imageModel: v.optional(v.string()),
      videoModel: v.optional(v.string()),
    })
  ),
  budget: v.optional(
    v.object({
      maxUsdPerPost: v.optional(v.number()),
      maxUsdPerMonth: v.optional(v.number()),
    })
  ),
});

export const accountAgentRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("skipped")
);

export const accountPostStatusValidator = v.union(
  v.literal("idea"),
  v.literal("draft"),
  v.literal("awaiting_approval"),
  v.literal("needs_revision"),
  v.literal("scheduled"),
  v.literal("publishing"),
  v.literal("published"),
  v.literal("failed"),
  v.literal("canceled")
);

export const accountPostOriginValidator = v.union(
  v.literal("imported"),
  v.literal("manual"),
  v.literal("agent_requested"),
  v.literal("agent_scheduled")
);

export const studioRenderRequestStatusValidator = v.union(
  v.literal("queued"),
  v.literal("blocked"),
  v.literal("rendering"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled")
);

export const createReferenceMentionValidator = v.object({
  token: v.string(),
  label: v.string(),
  entityType: v.union(
    v.literal("creative_asset"),
    v.literal("artifact"),
    v.literal("analysis"),
    v.literal("uploaded_reference"),
    v.literal("model")
  ),
  entityId: v.string(),
  mediaType: v.optional(creativeAssetMediaTypeValidator),
  mimeType: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  storageUrl: v.optional(v.string()),
  instruction: v.optional(v.string()),
});

export const artifactTypeValidator = v.union(
  v.literal("prompt"),
  v.literal("text_draft"),
  v.literal("caption"),
  v.literal("script"),
  v.literal("scene_spec"),
  v.literal("shot_list"),
  v.literal("image"),
  v.literal("image_prompt"),
  v.literal("slide_spec"),
  v.literal("rendered_asset"),
  v.literal("video"),
  v.literal("thumbnail"),
  v.literal("publish_payload")
);

export const reviewStatusValidator = v.union(
  v.literal("not_required"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("needs_revision")
);

export const artifactLifecycleValidator = v.union(
  v.literal("debug"),
  v.literal("preview"),
  v.literal("saved"),
  v.literal("discarded")
);

export const slideshowStatusValidator = v.union(
  v.literal("preview"),
  v.literal("saved"),
  v.literal("discarded")
);

export const metricsValidator = v.object({
  views: v.optional(v.number()),
  likes: v.optional(v.number()),
  comments: v.optional(v.number()),
  shares: v.optional(v.number()),
  saves: v.optional(v.number()),
  clicks: v.optional(v.number()),
  followersGained: v.optional(v.number()),
});
