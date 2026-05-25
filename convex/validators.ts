import { v } from "convex/values";

export const publishingProviderValidator = v.union(
  v.literal("postiz"),
  v.literal("post_bridge"),
  v.literal("reel_farm"),
  v.literal("manual")
);

export const modelProviderValidator = v.union(
  v.literal("bulkapis"),
  v.literal("gemini"),
  v.literal("fal"),
  v.literal("openrouter"),
  v.literal("manual")
);

export const providerModelCategoryValidator = v.union(
  v.literal("chat"),
  v.literal("image"),
  v.literal("video"),
  v.literal("video_render"),
  v.literal("audio"),
  v.literal("music"),
  v.literal("lipsync"),
  v.literal("speech_to_text"),
  v.literal("upscale"),
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
  v.literal("pinterest")
);

export const socialAccountStatusValidator = v.union(
  v.literal("connected"),
  v.literal("disconnected"),
  v.literal("needs_attention"),
  v.literal("disabled")
);

export const contentFormatValidator = v.union(
  v.literal("slideshow"),
  v.literal("hook_demo_video"),
  v.literal("ai_ugc_video"),
  v.literal("talking_avatar"),
  v.literal("short_educational_video"),
  v.literal("static_image"),
  v.literal("thread"),
  v.literal("caption_set")
);

export const workflowTriggerValidator = v.union(
  v.literal("manual"),
  v.literal("schedule"),
  v.literal("event"),
  v.literal("metric")
);

export const workflowRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting_for_approval"),
  v.literal("needs_revision"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled")
);

export const workflowRunNodeStatusValidator = v.union(
  v.literal("idle"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("blocked"),
  v.literal("skipped")
);

export const workflowRunProviderJobValidator = v.object({
  provider: v.string(),
  model: v.optional(v.string()),
  externalJobId: v.string(),
  status: v.optional(v.string()),
  submittedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  raw: v.optional(v.any()),
});

export const workflowRunOutputRefValidator = v.object({
  nodeId: v.string(),
  port: v.string(),
  artifactIds: v.optional(v.array(v.id("artifacts"))),
  value: v.optional(v.any()),
});

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
  }),
  v.object({
    type: v.literal("persona"),
    personaId: v.string(),
    assetKey: v.optional(v.string()),
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

export const workflowRunEventTypeValidator = v.union(
  v.literal("run_created"),
  v.literal("node_started"),
  v.literal("node_completed"),
  v.literal("tool_call"),
  v.literal("model_call"),
  v.literal("artifact_created"),
  v.literal("approval_requested"),
  v.literal("approval_resolved"),
  v.literal("revision_requested"),
  v.literal("publish_requested"),
  v.literal("publish_completed"),
  v.literal("metric_synced"),
  v.literal("error")
);

export const workflowGraphValidator = v.object({
  schemaVersion: v.literal(1),
  nodes: v.array(
    v.object({
      id: v.string(),
      type: v.string(),
      label: v.string(),
      position: v.object({
        x: v.number(),
        y: v.number(),
      }),
      provider: v.optional(v.string()),
      model: v.optional(v.string()),
      config: v.record(v.string(), v.any()),
      inputBindings: v.optional(v.record(v.string(), nodeInputBindingValidator)),
      retention: v.optional(v.any()),
    })
  ),
  edges: v.array(
    v.object({
      id: v.string(),
      sourceNodeId: v.string(),
      sourcePort: v.string(),
      targetNodeId: v.string(),
      targetPort: v.string(),
    })
  ),
  canvas: v.optional(
    v.object({
      viewport: v.optional(
        v.object({
          x: v.number(),
          y: v.number(),
          zoom: v.number(),
        })
      ),
    })
  ),
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
  v.literal("preview"),
  v.literal("saved"),
  v.literal("discarded")
);

export const slideshowStatusValidator = v.union(
  v.literal("preview"),
  v.literal("saved"),
  v.literal("discarded")
);

export const distributionStatusValidator = v.union(
  v.literal("draft"),
  v.literal("waiting_for_approval"),
  v.literal("needs_revision"),
  v.literal("scheduled"),
  v.literal("publishing"),
  v.literal("published"),
  v.literal("failed"),
  v.literal("canceled")
);

export const scheduleConfigValidator = v.object({
  timezone: v.string(),
  postingTimes: v.array(
    v.object({
      dayOfWeek: v.number(),
      hour: v.number(),
      minute: v.number(),
    })
  ),
});

export const approvalPolicyValidator = v.object({
  mode: v.union(
    v.literal("always"),
    v.literal("first_run_only"),
    v.literal("never")
  ),
});

export const publishingPolicyValidator = v.object({
  provider: publishingProviderValidator,
  autoPublish: v.boolean(),
  defaultPlatforms: v.array(platformValidator),
});

export const metricsValidator = v.object({
  views: v.optional(v.number()),
  likes: v.optional(v.number()),
  comments: v.optional(v.number()),
  shares: v.optional(v.number()),
  saves: v.optional(v.number()),
  clicks: v.optional(v.number()),
  followersGained: v.optional(v.number()),
});
