import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  approvalPolicyValidator,
  artifactLifecycleValidator,
  artifactTypeValidator,
  contentRequestStatusValidator,
  contentFormatValidator,
  distributionStatusValidator,
  metricsValidator,
  modelProviderValidator,
  platformValidator,
  publishingPolicyValidator,
  publishingProviderValidator,
  reviewStatusValidator,
  scheduleConfigValidator,
  slideshowStatusValidator,
  socialAccountStatusValidator,
  workflowGraphValidator,
  workflowRunEventTypeValidator,
  workflowRunStatusValidator,
  workflowTriggerValidator,
} from "./validators";

export default defineSchema({
  brands: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    niche: v.optional(v.string()),
    audience: v.optional(v.string()),
    voice: v.optional(v.string()),
    visualStyle: v.optional(v.string()),
    offer: v.optional(v.string()),
    constraints: v.optional(v.array(v.string())),
    examplePosts: v.optional(v.array(v.string())),
    performanceNotes: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"]),

  brandAssets: defineTable({
    userId: v.string(),
    brandId: v.id("brands"),
    name: v.string(),
    type: v.union(
      v.literal("character"),
      v.literal("person"),
      v.literal("logo"),
      v.literal("style_reference"),
      v.literal("product"),
      v.literal("other")
    ),
    storageUrl: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"]),

  providerConnections: defineTable({
    userId: v.string(),
    provider: publishingProviderValidator,
    label: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("needs_attention"),
      v.literal("disabled")
    ),
    externalWorkspaceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  socialAccounts: defineTable({
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    providerConnectionId: v.optional(v.id("providerConnections")),
    provider: publishingProviderValidator,
    platform: platformValidator,
    externalAccountId: v.string(),
    username: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    status: socialAccountStatusValidator,
    capabilities: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_user_provider", ["userId", "provider"])
    .index("by_external_account", ["provider", "externalAccountId"]),

  workflows: defineTable({
    userId: v.string(),
    brandId: v.id("brands"),
    socialAccountId: v.optional(v.id("socialAccounts")),
    name: v.string(),
    description: v.optional(v.string()),
    contentFormat: contentFormatValidator,
    trigger: workflowTriggerValidator,
    scheduleConfig: v.optional(scheduleConfigValidator),
    approvalPolicy: approvalPolicyValidator,
    publishingPolicy: publishingPolicyValidator,
    activeVersionId: v.optional(v.id("workflowVersions")),
    isActive: v.boolean(),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_active_next_run", ["isActive", "nextRunAt"]),

  workflowVersions: defineTable({
    userId: v.string(),
    workflowId: v.id("workflows"),
    version: v.number(),
    strategy: v.optional(v.any()),
    graph: workflowGraphValidator,
    modelDefaults: v.optional(
      v.object({
        textProvider: v.optional(modelProviderValidator),
        mediaProvider: v.optional(modelProviderValidator),
        preferredTextModel: v.optional(v.string()),
        preferredImageModel: v.optional(v.string()),
        preferredVideoModel: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_workflow", ["workflowId"]),

  contentRequests: defineTable({
    userId: v.string(),
    brandId: v.id("brands"),
    socialAccountId: v.optional(v.id("socialAccounts")),
    contentFormat: contentFormatValidator,
    prompt: v.string(),
    revisionPrompt: v.optional(v.string()),
    requestedRenderingMode: v.optional(
      v.union(
        v.literal("background_plus_overlay"),
        v.literal("full_graphic_generation")
      )
    ),
    referenceAssets: v.optional(
      v.array(
        v.object({
          assetId: v.id("brandAssets"),
          instruction: v.optional(v.string()),
        })
      )
    ),
    status: contentRequestStatusValidator,
    plan: v.optional(v.any()),
    planArtifactId: v.optional(v.id("artifacts")),
    summary: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    savedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_user_status", ["userId", "status"]),

  workflowRuns: defineTable({
    userId: v.string(),
    workflowId: v.id("workflows"),
    workflowVersionId: v.id("workflowVersions"),
    brandId: v.id("brands"),
    socialAccountId: v.optional(v.id("socialAccounts")),
    trigger: workflowTriggerValidator,
    status: workflowRunStatusValidator,
    currentNodeId: v.optional(v.string()),
    generatedTopic: v.optional(v.string()),
    generatedHook: v.optional(v.string()),
    summary: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    errorNodeId: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workflow", ["workflowId"])
    .index("by_status", ["status"])
    .index("by_user_status", ["userId", "status"]),

  workflowRunEvents: defineTable({
    userId: v.string(),
    workflowRunId: v.id("workflowRuns"),
    workflowId: v.id("workflows"),
    type: workflowRunEventTypeValidator,
    nodeId: v.optional(v.string()),
    message: v.string(),
    data: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_run", ["workflowRunId"])
    .index("by_workflow", ["workflowId"]),

  artifacts: defineTable({
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    contentRequestId: v.optional(v.id("contentRequests")),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    parentArtifactIds: v.optional(v.array(v.id("artifacts"))),
    type: artifactTypeValidator,
    title: v.optional(v.string()),
    storageUrl: v.optional(v.string()),
    data: v.optional(v.any()),
    provider: v.optional(modelProviderValidator),
    model: v.optional(v.string()),
    prompt: v.optional(v.string()),
    lifecycle: v.optional(artifactLifecycleValidator),
    reviewStatus: reviewStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_content_request", ["contentRequestId"])
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_type", ["type"]),

  slideshows: defineTable({
    userId: v.string(),
    brandId: v.id("brands"),
    socialAccountId: v.optional(v.id("socialAccounts")),
    contentRequestId: v.optional(v.id("contentRequests")),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    title: v.string(),
    status: slideshowStatusValidator,
    spec: v.any(),
    savedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_content_request", ["contentRequestId"])
    .index("by_workflow_run", ["workflowRunId"]),

  distributionPlans: defineTable({
    userId: v.string(),
    brandId: v.id("brands"),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    artifactIds: v.array(v.id("artifacts")),
    socialAccountIds: v.array(v.id("socialAccounts")),
    provider: publishingProviderValidator,
    status: distributionStatusValidator,
    scheduledFor: v.optional(v.number()),
    timezone: v.optional(v.string()),
    caption: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
    externalPostIds: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_status", ["status"]),

  postMetrics: defineTable({
    userId: v.string(),
    brandId: v.optional(v.id("brands")),
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    distributionPlanId: v.optional(v.id("distributionPlans")),
    socialAccountId: v.id("socialAccounts"),
    platform: platformValidator,
    externalPostId: v.string(),
    metrics: metricsValidator,
    capturedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_distribution_plan", ["distributionPlanId"])
    .index("by_social_account", ["socialAccountId"])
    .index("by_external_post", ["platform", "externalPostId"]),
});
