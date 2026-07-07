import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  aiGenerationSettingsValidator,
  artifactLifecycleValidator,
  artifactTypeValidator,
  automationApprovalModeValidator,
  automationRunStatusValidator,
  automationScheduleValidator,
  contentRequestStatusValidator,
  contentFormatValidator,
  createCheckpointModeValidator,
  createCheckpointStatusValidator,
  createInferredOutputTypeValidator,
  createMessageKindValidator,
  createMessageRoleValidator,
  createReferenceMentionValidator,
  createThreadStatusValidator,
  createToolCallStatusValidator,
  creativeAssetKindValidator,
  creativeAssetMediaTypeValidator,
  distributionStatusValidator,
  metricsValidator,
  modelProviderValidator,
  platformValidator,
  providerModelCapabilitiesValidator,
  providerModelCategoryValidator,
  providerModelSchemaSnapshotValidator,
  publishingProviderValidator,
  reviewStatusValidator,
  slideshowStatusValidator,
  socialAccountStatusValidator,
  studioRenderRequestStatusValidator,
  videoAnalysisModeValidator,
  videoAnalysisSourcePlatformValidator,
  videoAnalysisSourceTypeValidator,
  videoAnalysisStatusValidator,
} from "./validators";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    subject: v.string(),
    tokenIdentifier: v.string(),
    issuer: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_subject", ["subject"])
    .index("by_token_identifier", ["tokenIdentifier"]),

  waitlistEntries: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    intendedUse: v.optional(v.string()),
    source: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
    approvedByUserId: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  workspaces: defineTable({
    name: v.string(),
    ownerUserId: v.string(),
    createdByUserId: v.string(),
    clerkOrganizationId: v.optional(v.string()),
    aiGenerationSettings: v.optional(aiGenerationSettingsValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_clerk_organization", ["clerkOrganizationId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("member"),
      v.literal("viewer")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("invited"),
      v.literal("removed")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_user_status", ["userId", "status"]),

  creativeAssets: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    assetKind: creativeAssetKindValidator,
    mediaType: creativeAssetMediaTypeValidator,
    storageUrl: v.string(),
    description: v.optional(v.string()),
    usageNotes: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  providerConnections: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
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
    .index("by_workspace", ["workspaceId"])
    .index("by_user_provider", ["userId", "provider"]),

  providerModels: defineTable({
    provider: modelProviderValidator,
    modelId: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    category: providerModelCategoryValidator,
    capabilities: providerModelCapabilitiesValidator,
    pricing: v.optional(v.any()),
    schemaSnapshot: providerModelSchemaSnapshotValidator,
    isActive: v.boolean(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
  })
    .index("by_provider", ["provider"])
    .index("by_provider_category", ["provider", "category"])
    .index("by_provider_model", ["provider", "modelId"]),

  videoAnalysisJobs: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    sourceType: videoAnalysisSourceTypeValidator,
    sourcePlatform: videoAnalysisSourcePlatformValidator,
    sourceUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    storageUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    byteLength: v.optional(v.number()),
    provider: modelProviderValidator,
    model: v.string(),
    mode: videoAnalysisModeValidator,
    customPrompt: v.optional(v.string()),
    status: videoAnalysisStatusValidator,
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    transcript: v.optional(v.string()),
    result: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  mcpApiKeys: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    scopes: v.array(v.string()),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_key_hash", ["keyHash"]),

  socialAccounts: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
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
    .index("by_workspace", ["workspaceId"])
    .index("by_user_provider", ["userId", "provider"])
    .index("by_external_account", ["provider", "externalAccountId"]),

  automations: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountIds: v.array(v.id("socialAccounts")),
    name: v.string(),
    brief: v.string(),
    pillars: v.array(v.string()),
    formatMix: v.optional(v.string()),
    scheduleConfig: automationScheduleValidator,
    approvalMode: automationApprovalModeValidator,
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
        maxUsdPerRun: v.optional(v.number()),
        maxUsdPerMonth: v.optional(v.number()),
      })
    ),
    isActive: v.boolean(),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_active_next_run", ["isActive", "nextRunAt"]),

  automationRuns: defineTable({
    automationId: v.id("automations"),
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    createThreadId: v.optional(v.id("createThreads")),
    topic: v.string(),
    pillar: v.optional(v.string()),
    status: automationRunStatusValidator,
    distributionPlanId: v.optional(v.id("distributionPlans")),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_automation", ["automationId"])
    .index("by_automation_started", ["automationId", "startedAt"])
    .index("by_status", ["status"]),

  contentRequests: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
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
    generation: v.optional(v.any()),
    referenceAssets: v.optional(
      v.array(
        v.object({
          assetId: v.id("creativeAssets"),
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
    .index("by_workspace", ["workspaceId"])
    .index("by_user_status", ["userId", "status"]),

  createThreads: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    origin: v.optional(v.union(v.literal("user"), v.literal("automation"))),
    automationRunId: v.optional(v.id("automationRuns")),
    title: v.optional(v.string()),
    status: createThreadStatusValidator,
    checkpointMode: createCheckpointModeValidator,
    decisionRunId: v.string(),
    turnDecisionCount: v.number(),
    lastPlanSignature: v.optional(v.string()),
    contextSummary: v.optional(v.string()),
    contextSummaryThroughMessageId: v.optional(v.id("createMessages")),
    lastInferredOutputType: v.optional(createInferredOutputTypeValidator),
    finalArtifactIds: v.optional(v.array(v.id("artifacts"))),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  createMessages: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    createThreadId: v.id("createThreads"),
    role: createMessageRoleValidator,
    content: v.string(),
    kind: v.optional(createMessageKindValidator),
    referenceMentions: v.optional(v.array(createReferenceMentionValidator)),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_thread", ["createThreadId"]),

  createToolCalls: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    createThreadId: v.id("createThreads"),
    messageId: v.optional(v.id("createMessages")),
    toolName: v.string(),
    dependsOnToolCallIds: v.array(v.id("createToolCalls")),
    status: createToolCallStatusValidator,
    label: v.string(),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_thread", ["createThreadId"])
    .index("by_thread_status", ["createThreadId", "status"]),

  createCheckpoints: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    createThreadId: v.id("createThreads"),
    status: createCheckpointStatusValidator,
    label: v.string(),
    message: v.string(),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    data: v.optional(v.any()),
    response: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_thread", ["createThreadId"])
    .index("by_thread_status", ["createThreadId", "status"]),

  artifacts: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    contentRequestId: v.optional(v.id("contentRequests")),
    automationId: v.optional(v.id("automations")),
    automationRunId: v.optional(v.id("automationRuns")),
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
    .index("by_workspace", ["workspaceId"])
    .index("by_content_request", ["contentRequestId"])
    .index("by_automation_run", ["automationRunId"])
    .index("by_type", ["type"]),

  slideshows: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    contentRequestId: v.optional(v.id("contentRequests")),
    automationId: v.optional(v.id("automations")),
    automationRunId: v.optional(v.id("automationRuns")),
    title: v.string(),
    status: slideshowStatusValidator,
    spec: v.any(),
    savedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_content_request", ["contentRequestId"])
    .index("by_automation_run", ["automationRunId"]),

  videoProjects: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    title: v.string(),
    status: v.union(v.literal("draft"), v.literal("archived")),
    draft: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastOpenedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  studioRenderRequests: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    createThreadId: v.optional(v.id("createThreads")),
    createToolCallId: v.optional(v.id("createToolCalls")),
    videoProjectId: v.id("videoProjects"),
    status: studioRenderRequestStatusValidator,
    draftSnapshot: v.any(),
    renderSettings: v.optional(v.any()),
    outputArtifactId: v.optional(v.id("artifacts")),
    progress: v.optional(v.number()),
    progressMessage: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_thread", ["createThreadId"])
    .index("by_project", ["videoProjectId"])
    .index("by_status", ["status"]),

  distributionPlans: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    automationId: v.optional(v.id("automations")),
    automationRunId: v.optional(v.id("automationRuns")),
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
    .index("by_workspace", ["workspaceId"])
    .index("by_automation_run", ["automationRunId"])
    .index("by_status", ["status"]),

  postMetrics: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    automationId: v.optional(v.id("automations")),
    automationRunId: v.optional(v.id("automationRuns")),
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
    .index("by_workspace", ["workspaceId"])
    .index("by_automation_run", ["automationRunId"])
    .index("by_distribution_plan", ["distributionPlanId"])
    .index("by_social_account", ["socialAccountId"])
    .index("by_external_post", ["platform", "externalPostId"]),
});
