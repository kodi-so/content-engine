import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  aiGenerationSettingsValidator,
  accountAgentRunStatusValidator,
  accountAutopilotStatusValidator,
  accountAutopilotValidator,
  accountPlaybookValidator,
  accountPostOriginValidator,
  accountPostStatusValidator,
  artifactLifecycleValidator,
  artifactTypeValidator,
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
    storageId: v.id("_storage"),
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

  providerPriceSnapshots: defineTable({
    provider: modelProviderValidator,
    endpointId: v.string(),
    unitPriceUsd: v.number(),
    unit: v.string(),
    currency: v.string(),
    raw: v.optional(v.any()),
    fetchedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_and_endpoint", ["provider", "endpointId"]),

  contentAnalyses: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    accountPostId: v.optional(v.id("accountPosts")),
    purpose: v.union(v.literal("standalone"), v.literal("account_memory")),
    mediaType: v.union(
      v.literal("video"),
      v.literal("image"),
      v.literal("slideshow")
    ),
    sourceArtifactIds: v.array(v.id("artifacts")),
    analysisVersion: v.string(),
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
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_account_post", ["accountPostId"])
    .index("by_account_post_and_version", ["accountPostId", "analysisVersion"]),

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

  mcpOauthClients: defineTable({
    clientId: v.string(),
    clientName: v.optional(v.string()),
    redirectUris: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_client_id", ["clientId"]),

  mcpOauthAuthorizationRequests: defineTable({
    clientId: v.string(),
    redirectUri: v.string(),
    state: v.optional(v.string()),
    scopes: v.array(v.string()),
    codeChallenge: v.string(),
    resource: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("expired")
    ),
    userId: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_status", ["status"]),

  mcpOauthAuthorizationCodes: defineTable({
    codeHash: v.string(),
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    clientId: v.string(),
    redirectUri: v.string(),
    scopes: v.array(v.string()),
    codeChallenge: v.string(),
    resource: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_code_hash", ["codeHash"]),

  mcpOauthTokens: defineTable({
    accessTokenHash: v.string(),
    refreshTokenHash: v.string(),
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    clientId: v.string(),
    scopes: v.array(v.string()),
    resource: v.string(),
    expiresAt: v.number(),
    refreshExpiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_access_token_hash", ["accessTokenHash"])
    .index("by_refresh_token_hash", ["refreshTokenHash"])
    .index("by_user", ["userId"]),

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
    avatarStorageId: v.optional(v.id("_storage")),
    status: socialAccountStatusValidator,
    capabilities: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    playbook: v.optional(accountPlaybookValidator),
    autopilotStatus: v.optional(accountAutopilotStatusValidator),
    autopilot: v.optional(accountAutopilotValidator),
    nextAutopilotRunAt: v.optional(v.number()),
    lastAutopilotRunAt: v.optional(v.number()),
    agentSummary: v.optional(v.string()),
    agentSummaryUpdatedAt: v.optional(v.number()),
    profileSyncedAt: v.optional(v.number()),
    feedSyncedAt: v.optional(v.number()),
    metricsSyncedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_user_provider", ["userId", "provider"])
    .index("by_external_account", ["provider", "externalAccountId"])
    .index("by_autopilot_status_and_next_run", [
      "autopilotStatus",
      "nextAutopilotRunAt",
    ]),

  accountAgentRuns: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.id("socialAccounts"),
    trigger: v.union(v.literal("scheduled"), v.literal("run_now")),
    status: accountAgentRunStatusValidator,
    scheduledFor: v.optional(v.number()),
    createThreadId: v.optional(v.id("createThreads")),
    accountPostId: v.optional(v.id("accountPosts")),
    decisionSummary: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_social_account", ["socialAccountId"])
    .index("by_social_account_and_created_at", ["socialAccountId", "createdAt"])
    .index("by_status", ["status"]),

  accountPosts: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.id("socialAccounts"),
    origin: accountPostOriginValidator,
    status: accountPostStatusValidator,
    createThreadId: v.optional(v.id("createThreads")),
    accountAgentRunId: v.optional(v.id("accountAgentRuns")),
    artifactIds: v.array(v.id("artifacts")),
    provider: publishingProviderValidator,
    scheduledFor: v.optional(v.number()),
    timezone: v.optional(v.string()),
    caption: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
    externalPostIds: v.optional(v.array(v.string())),
    latestMetrics: v.optional(metricsValidator),
    metricsUpdatedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_social_account", ["socialAccountId"])
    .index("by_social_account_and_status", ["socialAccountId", "status"])
    .index("by_social_account_and_published_at", ["socialAccountId", "publishedAt"])
    .index("by_account_agent_run", ["accountAgentRunId"])
    .index("by_status", ["status"]),

  accountReferences: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.id("socialAccounts"),
    creativeAssetId: v.id("creativeAssets"),
    role: v.union(
      v.literal("identity"),
      v.literal("style"),
      v.literal("voice"),
      v.literal("logo"),
      v.literal("negative_reference"),
      v.literal("other")
    ),
    instruction: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_social_account", ["socialAccountId"])
    .index("by_social_account_and_asset", ["socialAccountId", "creativeAssetId"])
    .index("by_creative_asset", ["creativeAssetId"]),

  accountInsights: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.id("socialAccounts"),
    kind: v.union(
      v.literal("creative_pattern"),
      v.literal("performance_pattern"),
      v.literal("audience_signal"),
      v.literal("preference")
    ),
    statement: v.string(),
    confidence: v.optional(v.number()),
    evidencePostIds: v.array(v.id("accountPosts")),
    status: v.union(
      v.literal("active"),
      v.literal("dismissed"),
      v.literal("superseded")
    ),
    sourceThreadId: v.optional(v.id("createThreads")),
    sourceMessageId: v.optional(v.id("createMessages")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_social_account", ["socialAccountId"])
    .index("by_social_account_and_status", ["socialAccountId", "status"]),

  contentRequests: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    createThreadId: v.optional(v.id("createThreads")),
    createToolCallId: v.optional(v.id("createToolCalls")),
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
    estimatedCostUsd: v.optional(v.number()),
    costEstimate: v.optional(v.any()),
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
    origin: v.optional(v.union(
      v.literal("user"),
      v.literal("account_schedule"),
      v.literal("mcp")
    )),
    socialAccountId: v.optional(v.id("socialAccounts")),
    accountAgentRunId: v.optional(v.id("accountAgentRuns")),
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
    .index("by_social_account", ["socialAccountId"])
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
    estimatedCostUsd: v.optional(v.number()),
    costEstimate: v.optional(v.any()),
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

  usageEvents: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    createThreadId: v.optional(v.id("createThreads")),
    createToolCallId: v.optional(v.id("createToolCalls")),
    contentRequestId: v.optional(v.id("contentRequests")),
    provider: modelProviderValidator,
    modelId: v.string(),
    operationKey: v.string(),
    providerRequestId: v.optional(v.string()),
    category: v.union(
      v.literal("agent"),
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("lipsync"),
      v.literal("render"),
      v.literal("other")
    ),
    eventKind: v.union(
      v.literal("estimate"),
      v.literal("provider_submission"),
      v.literal("charge"),
      v.literal("failure")
    ),
    source: v.union(
      v.literal("pricing_snapshot"),
      v.literal("static_pricing"),
      v.literal("provider_metadata"),
      v.literal("provider_billing_event")
    ),
    estimatedCostUsd: v.optional(v.number()),
    actualCostUsd: v.optional(v.number()),
    currency: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    unitPriceUsd: v.optional(v.number()),
    parameters: v.optional(v.any()),
    priceSnapshot: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread", ["createThreadId"])
    .index("by_tool_call", ["createToolCallId"])
    .index("by_content_request", ["contentRequestId"])
    .index("by_operation", ["operationKey"])
    .index("by_provider_request", ["provider", "providerRequestId"])
    .index("by_provider_and_event_kind", ["provider", "eventKind"])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"]),

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
    socialAccountId: v.optional(v.id("socialAccounts")),
    accountPostId: v.optional(v.id("accountPosts")),
    accountAgentRunId: v.optional(v.id("accountAgentRuns")),
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
    .index("by_social_account", ["socialAccountId"])
    .index("by_account_post", ["accountPostId"])
    .index("by_account_agent_run", ["accountAgentRunId"])
    .index("by_type", ["type"]),

  slideshows: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.optional(v.id("socialAccounts")),
    contentRequestId: v.optional(v.id("contentRequests")),
    accountPostId: v.optional(v.id("accountPosts")),
    accountAgentRunId: v.optional(v.id("accountAgentRuns")),
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
    .index("by_social_account", ["socialAccountId"])
    .index("by_account_post", ["accountPostId"])
    .index("by_account_agent_run", ["accountAgentRunId"]),

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

  postMetrics: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    socialAccountId: v.id("socialAccounts"),
    accountPostId: v.id("accountPosts"),
    platform: platformValidator,
    externalPostId: v.string(),
    metrics: metricsValidator,
    capturedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_account_post", ["accountPostId"])
    .index("by_social_account", ["socialAccountId"])
    .index("by_social_account_and_captured_at", ["socialAccountId", "capturedAt"])
    .index("by_external_post", ["platform", "externalPostId"]),
});
