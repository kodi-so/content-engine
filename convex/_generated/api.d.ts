/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts_accountAccess from "../accounts/accountAccess.js";
import type * as accounts_accountCadence from "../accounts/accountCadence.js";
import type * as accounts_accountMemory from "../accounts/accountMemory.js";
import type * as accounts_accountReferenceContext from "../accounts/accountReferenceContext.js";
import type * as accounts_autopilotScheduling from "../accounts/autopilotScheduling.js";
import type * as accounts_creativeAssets from "../accounts/creativeAssets.js";
import type * as accounts_managedAccounts from "../accounts/managedAccounts.js";
import type * as accounts_profileImages from "../accounts/profileImages.js";
import type * as accounts_socialAccounts from "../accounts/socialAccounts.js";
import type * as analyze_mediaResolver from "../analyze/mediaResolver.js";
import type * as analyze_videoAnalysis from "../analyze/videoAnalysis.js";
import type * as analyze_videoAnalysisContracts from "../analyze/videoAnalysisContracts.js";
import type * as analyze_videoAnalysisModel from "../analyze/videoAnalysisModel.js";
import type * as artifacts_artifactAccess from "../artifacts/artifactAccess.js";
import type * as artifacts_artifactReviewActions from "../artifacts/artifactReviewActions.js";
import type * as artifacts_records from "../artifacts/records.js";
import type * as artifacts_regeneration from "../artifacts/regeneration.js";
import type * as auth_actionAccess from "../auth/actionAccess.js";
import type * as auth_users from "../auth/users.js";
import type * as content_artifactCaptions from "../content/artifactCaptions.js";
import type * as content_assets_assetStorage from "../content/assets/assetStorage.js";
import type * as content_createAssetRunner from "../content/createAssetRunner.js";
import type * as content_createAssets from "../content/createAssets.js";
import type * as content_dryRun from "../content/dryRun.js";
import type * as content_formatContracts from "../content/formatContracts.js";
import type * as content_planning from "../content/planning.js";
import type * as content_planningPrompts from "../content/planningPrompts.js";
import type * as content_requestExecution_contentRequestExecution from "../content/requestExecution/contentRequestExecution.js";
import type * as content_requestExecution_generationWaiters from "../content/requestExecution/generationWaiters.js";
import type * as content_requestExecution_requestExecutionHelpers from "../content/requestExecution/requestExecutionHelpers.js";
import type * as content_requests from "../content/requests.js";
import type * as content_slideshow_slideshowAdapter from "../content/slideshow/slideshowAdapter.js";
import type * as content_slideshow_slideshowDimensions from "../content/slideshow/slideshowDimensions.js";
import type * as content_slideshow_slideshowRequestEditing from "../content/slideshow/slideshowRequestEditing.js";
import type * as content_slideshow_slideshowRequestMutations from "../content/slideshow/slideshowRequestMutations.js";
import type * as content_slideshows from "../content/slideshows.js";
import type * as content_types from "../content/types.js";
import type * as content_videoProjects from "../content/videoProjects.js";
import type * as create_agent from "../create/agent.js";
import type * as create_agent_agentAccountReferences from "../create/agent/agentAccountReferences.js";
import type * as create_agent_agentAsyncResults from "../create/agent/agentAsyncResults.js";
import type * as create_agent_agentDecision from "../create/agent/agentDecision.js";
import type * as create_agent_agentDiagnostics from "../create/agent/agentDiagnostics.js";
import type * as create_agent_agentPromptModules from "../create/agent/agentPromptModules.js";
import type * as create_agent_agentStopActions from "../create/agent/agentStopActions.js";
import type * as create_agent_agentThreadOutputs from "../create/agent/agentThreadOutputs.js";
import type * as create_agent_agentThreadRecords from "../create/agent/agentThreadRecords.js";
import type * as create_agent_agentToolPlanning from "../create/agent/agentToolPlanning.js";
import type * as create_agent_agentTurnContextBuilder from "../create/agent/agentTurnContextBuilder.js";
import type * as create_commands_runtime from "../create/commands/runtime.js";
import type * as create_execution_accountManagementToolExecution from "../create/execution/accountManagementToolExecution.js";
import type * as create_execution_asyncToolReconciliation from "../create/execution/asyncToolReconciliation.js";
import type * as create_execution_mediaGenerationExecution from "../create/execution/mediaGenerationExecution.js";
import type * as create_execution_socialContentContext from "../create/execution/socialContentContext.js";
import type * as create_execution_socialDiscoveryExecution from "../create/execution/socialDiscoveryExecution.js";
import type * as create_execution_socialTrendResearchExecution from "../create/execution/socialTrendResearchExecution.js";
import type * as create_execution_sourceAnalysisExecution from "../create/execution/sourceAnalysisExecution.js";
import type * as create_execution_studioToolExecution from "../create/execution/studioToolExecution.js";
import type * as create_execution_textGenerationExecution from "../create/execution/textGenerationExecution.js";
import type * as create_execution_threadToolOutputs from "../create/execution/threadToolOutputs.js";
import type * as create_execution_toolCallReadiness from "../create/execution/toolCallReadiness.js";
import type * as create_execution_toolExecutionShared from "../create/execution/toolExecutionShared.js";
import type * as create_execution_toolOutputActions from "../create/execution/toolOutputActions.js";
import type * as create_execution_toolReferenceCollection from "../create/execution/toolReferenceCollection.js";
import type * as create_execution_videoRenderExecution from "../create/execution/videoRenderExecution.js";
import type * as create_observability_modelTracing from "../create/observability/modelTracing.js";
import type * as create_observability_providerTracing from "../create/observability/providerTracing.js";
import type * as create_observability_runEvents from "../create/observability/runEvents.js";
import type * as create_observability_sanitization from "../create/observability/sanitization.js";
import type * as create_observability_trace from "../create/observability/trace.js";
import type * as create_observability_validators from "../create/observability/validators.js";
import type * as create_planning from "../create/planning.js";
import type * as create_references_referenceDiscovery from "../create/references/referenceDiscovery.js";
import type * as create_references_referenceResolution from "../create/references/referenceResolution.js";
import type * as create_references_sourceAnalysisContext from "../create/references/sourceAnalysisContext.js";
import type * as create_studio_captionEditing from "../create/studio/captionEditing.js";
import type * as create_studio_mediaOverlayEditing from "../create/studio/mediaOverlayEditing.js";
import type * as create_studio_studioComposition from "../create/studio/studioComposition.js";
import type * as create_studio_studioRenderAccess from "../create/studio/studioRenderAccess.js";
import type * as create_studio_studioRenderWorkerConfig from "../create/studio/studioRenderWorkerConfig.js";
import type * as create_studioRenderRequests from "../create/studioRenderRequests.js";
import type * as create_threads from "../create/threads.js";
import type * as create_toolExecution from "../create/toolExecution.js";
import type * as create_tools_index from "../create/tools/index.js";
import type * as create_tools_registry from "../create/tools/registry.js";
import type * as create_tools_types from "../create/tools/types.js";
import type * as create_tools_validateToolInput from "../create/tools/validateToolInput.js";
import type * as http from "../http.js";
import type * as lib_captionTiming from "../lib/captionTiming.js";
import type * as lib_mediaTextOverlays from "../lib/mediaTextOverlays.js";
import type * as lib_overlayLayoutDesigner from "../lib/overlayLayoutDesigner.js";
import type * as lib_text from "../lib/text.js";
import type * as library_assets from "../library/assets.js";
import type * as mcp_apiKeyRecords from "../mcp/apiKeyRecords.js";
import type * as mcp_apiKeys from "../mcp/apiKeys.js";
import type * as mcp_appResource from "../mcp/appResource.js";
import type * as mcp_artifactLinks from "../mcp/artifactLinks.js";
import type * as mcp_commands from "../mcp/commands.js";
import type * as mcp_http from "../mcp/http.js";
import type * as mcp_oauth from "../mcp/oauth.js";
import type * as mcp_oauthCrypto from "../mcp/oauthCrypto.js";
import type * as mcp_oauthHttp from "../mcp/oauthHttp.js";
import type * as mcp_oauthRecords from "../mcp/oauthRecords.js";
import type * as mcp_resources from "../mcp/resources.js";
import type * as mcp_scopes from "../mcp/scopes.js";
import type * as mcp_toolCatalog from "../mcp/toolCatalog.js";
import type * as providers_bulkapis_client from "../providers/bulkapis/client.js";
import type * as providers_bulkapis_config from "../providers/bulkapis/config.js";
import type * as providers_bulkapisModelCatalog from "../providers/bulkapisModelCatalog.js";
import type * as providers_errors from "../providers/errors.js";
import type * as providers_fal_assets from "../providers/fal/assets.js";
import type * as providers_fal_billing from "../providers/fal/billing.js";
import type * as providers_fal_client from "../providers/fal/client.js";
import type * as providers_fal_payloads from "../providers/fal/payloads.js";
import type * as providers_fal_pricing from "../providers/fal/pricing.js";
import type * as providers_falModelCatalog from "../providers/falModelCatalog.js";
import type * as providers_index from "../providers/index.js";
import type * as providers_model from "../providers/model.js";
import type * as providers_modelCatalog from "../providers/modelCatalog.js";
import type * as providers_modelProviders_bulkapis from "../providers/modelProviders/bulkapis.js";
import type * as providers_modelProviders_fal from "../providers/modelProviders/fal.js";
import type * as providers_modelProviders_gemini from "../providers/modelProviders/gemini.js";
import type * as providers_modelProviders_manual from "../providers/modelProviders/manual.js";
import type * as providers_modelProviders_openrouter from "../providers/modelProviders/openrouter.js";
import type * as providers_postBridge_client from "../providers/postBridge/client.js";
import type * as providers_postiz_client from "../providers/postiz/client.js";
import type * as providers_publishing from "../providers/publishing.js";
import type * as providers_publishingProviders_postBridge from "../providers/publishingProviders/postBridge.js";
import type * as providers_publishingProviders_postiz from "../providers/publishingProviders/postiz.js";
import type * as providers_runtime_providerInputs from "../providers/runtime/providerInputs.js";
import type * as providers_scrapeCreators_client from "../providers/scrapeCreators/client.js";
import type * as providers_scrapeCreators_normalizers from "../providers/scrapeCreators/normalizers.js";
import type * as providers_scrapeCreators_profileClient from "../providers/scrapeCreators/profileClient.js";
import type * as providers_scrapeCreators_profileTarget from "../providers/scrapeCreators/profileTarget.js";
import type * as providers_scrapeCreators_request from "../providers/scrapeCreators/request.js";
import type * as providers_scrapeCreators_trendClient from "../providers/scrapeCreators/trendClient.js";
import type * as providers_scrapeCreators_trendNormalizers from "../providers/scrapeCreators/trendNormalizers.js";
import type * as providers_scrapeCreators_types from "../providers/scrapeCreators/types.js";
import type * as publishing_accountPosts from "../publishing/accountPosts.js";
import type * as publishing_approval from "../publishing/approval.js";
import type * as publishing_composer from "../publishing/composer.js";
import type * as publishing_metrics from "../publishing/metrics.js";
import type * as publishing_publishInput from "../publishing/publishInput.js";
import type * as storage_files from "../storage/files.js";
import type * as system_crons from "../system/crons.js";
import type * as system_http from "../system/http.js";
import type * as usage_costEstimation from "../usage/costEstimation.js";
import type * as usage_estimates from "../usage/estimates.js";
import type * as usage_records from "../usage/records.js";
import type * as usage_threadSummary from "../usage/threadSummary.js";
import type * as validators from "../validators.js";
import type * as waitlist from "../waitlist.js";
import type * as workspaces_workspaces from "../workspaces/workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "accounts/accountAccess": typeof accounts_accountAccess;
  "accounts/accountCadence": typeof accounts_accountCadence;
  "accounts/accountMemory": typeof accounts_accountMemory;
  "accounts/accountReferenceContext": typeof accounts_accountReferenceContext;
  "accounts/autopilotScheduling": typeof accounts_autopilotScheduling;
  "accounts/creativeAssets": typeof accounts_creativeAssets;
  "accounts/managedAccounts": typeof accounts_managedAccounts;
  "accounts/profileImages": typeof accounts_profileImages;
  "accounts/socialAccounts": typeof accounts_socialAccounts;
  "analyze/mediaResolver": typeof analyze_mediaResolver;
  "analyze/videoAnalysis": typeof analyze_videoAnalysis;
  "analyze/videoAnalysisContracts": typeof analyze_videoAnalysisContracts;
  "analyze/videoAnalysisModel": typeof analyze_videoAnalysisModel;
  "artifacts/artifactAccess": typeof artifacts_artifactAccess;
  "artifacts/artifactReviewActions": typeof artifacts_artifactReviewActions;
  "artifacts/records": typeof artifacts_records;
  "artifacts/regeneration": typeof artifacts_regeneration;
  "auth/actionAccess": typeof auth_actionAccess;
  "auth/users": typeof auth_users;
  "content/artifactCaptions": typeof content_artifactCaptions;
  "content/assets/assetStorage": typeof content_assets_assetStorage;
  "content/createAssetRunner": typeof content_createAssetRunner;
  "content/createAssets": typeof content_createAssets;
  "content/dryRun": typeof content_dryRun;
  "content/formatContracts": typeof content_formatContracts;
  "content/planning": typeof content_planning;
  "content/planningPrompts": typeof content_planningPrompts;
  "content/requestExecution/contentRequestExecution": typeof content_requestExecution_contentRequestExecution;
  "content/requestExecution/generationWaiters": typeof content_requestExecution_generationWaiters;
  "content/requestExecution/requestExecutionHelpers": typeof content_requestExecution_requestExecutionHelpers;
  "content/requests": typeof content_requests;
  "content/slideshow/slideshowAdapter": typeof content_slideshow_slideshowAdapter;
  "content/slideshow/slideshowDimensions": typeof content_slideshow_slideshowDimensions;
  "content/slideshow/slideshowRequestEditing": typeof content_slideshow_slideshowRequestEditing;
  "content/slideshow/slideshowRequestMutations": typeof content_slideshow_slideshowRequestMutations;
  "content/slideshows": typeof content_slideshows;
  "content/types": typeof content_types;
  "content/videoProjects": typeof content_videoProjects;
  "create/agent": typeof create_agent;
  "create/agent/agentAccountReferences": typeof create_agent_agentAccountReferences;
  "create/agent/agentAsyncResults": typeof create_agent_agentAsyncResults;
  "create/agent/agentDecision": typeof create_agent_agentDecision;
  "create/agent/agentDiagnostics": typeof create_agent_agentDiagnostics;
  "create/agent/agentPromptModules": typeof create_agent_agentPromptModules;
  "create/agent/agentStopActions": typeof create_agent_agentStopActions;
  "create/agent/agentThreadOutputs": typeof create_agent_agentThreadOutputs;
  "create/agent/agentThreadRecords": typeof create_agent_agentThreadRecords;
  "create/agent/agentToolPlanning": typeof create_agent_agentToolPlanning;
  "create/agent/agentTurnContextBuilder": typeof create_agent_agentTurnContextBuilder;
  "create/commands/runtime": typeof create_commands_runtime;
  "create/execution/accountManagementToolExecution": typeof create_execution_accountManagementToolExecution;
  "create/execution/asyncToolReconciliation": typeof create_execution_asyncToolReconciliation;
  "create/execution/mediaGenerationExecution": typeof create_execution_mediaGenerationExecution;
  "create/execution/socialContentContext": typeof create_execution_socialContentContext;
  "create/execution/socialDiscoveryExecution": typeof create_execution_socialDiscoveryExecution;
  "create/execution/socialTrendResearchExecution": typeof create_execution_socialTrendResearchExecution;
  "create/execution/sourceAnalysisExecution": typeof create_execution_sourceAnalysisExecution;
  "create/execution/studioToolExecution": typeof create_execution_studioToolExecution;
  "create/execution/textGenerationExecution": typeof create_execution_textGenerationExecution;
  "create/execution/threadToolOutputs": typeof create_execution_threadToolOutputs;
  "create/execution/toolCallReadiness": typeof create_execution_toolCallReadiness;
  "create/execution/toolExecutionShared": typeof create_execution_toolExecutionShared;
  "create/execution/toolOutputActions": typeof create_execution_toolOutputActions;
  "create/execution/toolReferenceCollection": typeof create_execution_toolReferenceCollection;
  "create/execution/videoRenderExecution": typeof create_execution_videoRenderExecution;
  "create/observability/modelTracing": typeof create_observability_modelTracing;
  "create/observability/providerTracing": typeof create_observability_providerTracing;
  "create/observability/runEvents": typeof create_observability_runEvents;
  "create/observability/sanitization": typeof create_observability_sanitization;
  "create/observability/trace": typeof create_observability_trace;
  "create/observability/validators": typeof create_observability_validators;
  "create/planning": typeof create_planning;
  "create/references/referenceDiscovery": typeof create_references_referenceDiscovery;
  "create/references/referenceResolution": typeof create_references_referenceResolution;
  "create/references/sourceAnalysisContext": typeof create_references_sourceAnalysisContext;
  "create/studio/captionEditing": typeof create_studio_captionEditing;
  "create/studio/mediaOverlayEditing": typeof create_studio_mediaOverlayEditing;
  "create/studio/studioComposition": typeof create_studio_studioComposition;
  "create/studio/studioRenderAccess": typeof create_studio_studioRenderAccess;
  "create/studio/studioRenderWorkerConfig": typeof create_studio_studioRenderWorkerConfig;
  "create/studioRenderRequests": typeof create_studioRenderRequests;
  "create/threads": typeof create_threads;
  "create/toolExecution": typeof create_toolExecution;
  "create/tools/index": typeof create_tools_index;
  "create/tools/registry": typeof create_tools_registry;
  "create/tools/types": typeof create_tools_types;
  "create/tools/validateToolInput": typeof create_tools_validateToolInput;
  http: typeof http;
  "lib/captionTiming": typeof lib_captionTiming;
  "lib/mediaTextOverlays": typeof lib_mediaTextOverlays;
  "lib/overlayLayoutDesigner": typeof lib_overlayLayoutDesigner;
  "lib/text": typeof lib_text;
  "library/assets": typeof library_assets;
  "mcp/apiKeyRecords": typeof mcp_apiKeyRecords;
  "mcp/apiKeys": typeof mcp_apiKeys;
  "mcp/appResource": typeof mcp_appResource;
  "mcp/artifactLinks": typeof mcp_artifactLinks;
  "mcp/commands": typeof mcp_commands;
  "mcp/http": typeof mcp_http;
  "mcp/oauth": typeof mcp_oauth;
  "mcp/oauthCrypto": typeof mcp_oauthCrypto;
  "mcp/oauthHttp": typeof mcp_oauthHttp;
  "mcp/oauthRecords": typeof mcp_oauthRecords;
  "mcp/resources": typeof mcp_resources;
  "mcp/scopes": typeof mcp_scopes;
  "mcp/toolCatalog": typeof mcp_toolCatalog;
  "providers/bulkapis/client": typeof providers_bulkapis_client;
  "providers/bulkapis/config": typeof providers_bulkapis_config;
  "providers/bulkapisModelCatalog": typeof providers_bulkapisModelCatalog;
  "providers/errors": typeof providers_errors;
  "providers/fal/assets": typeof providers_fal_assets;
  "providers/fal/billing": typeof providers_fal_billing;
  "providers/fal/client": typeof providers_fal_client;
  "providers/fal/payloads": typeof providers_fal_payloads;
  "providers/fal/pricing": typeof providers_fal_pricing;
  "providers/falModelCatalog": typeof providers_falModelCatalog;
  "providers/index": typeof providers_index;
  "providers/model": typeof providers_model;
  "providers/modelCatalog": typeof providers_modelCatalog;
  "providers/modelProviders/bulkapis": typeof providers_modelProviders_bulkapis;
  "providers/modelProviders/fal": typeof providers_modelProviders_fal;
  "providers/modelProviders/gemini": typeof providers_modelProviders_gemini;
  "providers/modelProviders/manual": typeof providers_modelProviders_manual;
  "providers/modelProviders/openrouter": typeof providers_modelProviders_openrouter;
  "providers/postBridge/client": typeof providers_postBridge_client;
  "providers/postiz/client": typeof providers_postiz_client;
  "providers/publishing": typeof providers_publishing;
  "providers/publishingProviders/postBridge": typeof providers_publishingProviders_postBridge;
  "providers/publishingProviders/postiz": typeof providers_publishingProviders_postiz;
  "providers/runtime/providerInputs": typeof providers_runtime_providerInputs;
  "providers/scrapeCreators/client": typeof providers_scrapeCreators_client;
  "providers/scrapeCreators/normalizers": typeof providers_scrapeCreators_normalizers;
  "providers/scrapeCreators/profileClient": typeof providers_scrapeCreators_profileClient;
  "providers/scrapeCreators/profileTarget": typeof providers_scrapeCreators_profileTarget;
  "providers/scrapeCreators/request": typeof providers_scrapeCreators_request;
  "providers/scrapeCreators/trendClient": typeof providers_scrapeCreators_trendClient;
  "providers/scrapeCreators/trendNormalizers": typeof providers_scrapeCreators_trendNormalizers;
  "providers/scrapeCreators/types": typeof providers_scrapeCreators_types;
  "publishing/accountPosts": typeof publishing_accountPosts;
  "publishing/approval": typeof publishing_approval;
  "publishing/composer": typeof publishing_composer;
  "publishing/metrics": typeof publishing_metrics;
  "publishing/publishInput": typeof publishing_publishInput;
  "storage/files": typeof storage_files;
  "system/crons": typeof system_crons;
  "system/http": typeof system_http;
  "usage/costEstimation": typeof usage_costEstimation;
  "usage/estimates": typeof usage_estimates;
  "usage/records": typeof usage_records;
  "usage/threadSummary": typeof usage_threadSummary;
  validators: typeof validators;
  waitlist: typeof waitlist;
  "workspaces/workspaces": typeof workspaces_workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
