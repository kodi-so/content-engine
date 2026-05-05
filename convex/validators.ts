import { v } from "convex/values";

export const publishingProviderValidator = v.union(
  v.literal("postiz"),
  v.literal("post_bridge"),
  v.literal("reel_farm"),
  v.literal("manual")
);

export const modelProviderValidator = v.union(
  v.literal("gemini"),
  v.literal("fal"),
  v.literal("openrouter"),
  v.literal("manual")
);

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
  v.literal("step_started"),
  v.literal("step_completed"),
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

export const workflowStepTypeValidator = v.union(
  v.literal("generate_text"),
  v.literal("generate_structured"),
  v.literal("create_image_prompts"),
  v.literal("generate_image"),
  v.literal("generate_video"),
  v.literal("resolve_model_job"),
  v.literal("create_slideshow"),
  v.literal("render_asset"),
  v.literal("create_caption"),
  v.literal("create_distribution_plan"),
  v.literal("request_approval"),
  v.literal("publish")
);

export const workflowStepValidator = v.object({
  id: v.string(),
  name: v.string(),
  type: workflowStepTypeValidator,
  config: v.optional(v.any()),
  inputRefs: v.optional(v.array(v.string())),
  outputRef: v.optional(v.string()),
});

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
