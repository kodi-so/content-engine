/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts_creativeAssets from "../accounts/creativeAssets.js";
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
import type * as content_assets_assetStorage from "../content/assets/assetStorage.js";
import type * as content_createAssetRunner from "../content/createAssetRunner.js";
import type * as content_createAssets from "../content/createAssets.js";
import type * as content_dryRun from "../content/dryRun.js";
import type * as content_formatContracts from "../content/formatContracts.js";
import type * as content_planning from "../content/planning.js";
import type * as content_planningPrompts from "../content/planningPrompts.js";
import type * as content_requestExecution_contentRequestExecution from "../content/requestExecution/contentRequestExecution.js";
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
import type * as create_agent_agentAsyncResults from "../create/agent/agentAsyncResults.js";
import type * as create_agent_agentDecision from "../create/agent/agentDecision.js";
import type * as create_agent_agentDiagnostics from "../create/agent/agentDiagnostics.js";
import type * as create_agent_agentStopActions from "../create/agent/agentStopActions.js";
import type * as create_agent_agentThreadOutputs from "../create/agent/agentThreadOutputs.js";
import type * as create_agent_agentThreadRecords from "../create/agent/agentThreadRecords.js";
import type * as create_agent_agentToolPlanning from "../create/agent/agentToolPlanning.js";
import type * as create_agent_agentWorkflowDraftActions from "../create/agent/agentWorkflowDraftActions.js";
import type * as create_execution_asyncToolReconciliation from "../create/execution/asyncToolReconciliation.js";
import type * as create_execution_mediaGenerationExecution from "../create/execution/mediaGenerationExecution.js";
import type * as create_execution_sourceAnalysisExecution from "../create/execution/sourceAnalysisExecution.js";
import type * as create_execution_studioToolExecution from "../create/execution/studioToolExecution.js";
import type * as create_execution_textGenerationExecution from "../create/execution/textGenerationExecution.js";
import type * as create_execution_threadToolOutputs from "../create/execution/threadToolOutputs.js";
import type * as create_execution_toolExecutionShared from "../create/execution/toolExecutionShared.js";
import type * as create_execution_toolOutputActions from "../create/execution/toolOutputActions.js";
import type * as create_execution_toolReferenceCollection from "../create/execution/toolReferenceCollection.js";
import type * as create_execution_videoRenderExecution from "../create/execution/videoRenderExecution.js";
import type * as create_planning from "../create/planning.js";
import type * as create_references_referenceDiscovery from "../create/references/referenceDiscovery.js";
import type * as create_references_referenceResolution from "../create/references/referenceResolution.js";
import type * as create_references_sourceAnalysisContext from "../create/references/sourceAnalysisContext.js";
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
import type * as create_workflowExport from "../create/workflowExport.js";
import type * as http from "../http.js";
import type * as lib_mediaTextOverlays from "../lib/mediaTextOverlays.js";
import type * as lib_text from "../lib/text.js";
import type * as library_assets from "../library/assets.js";
import type * as mcp_apiKeyRecords from "../mcp/apiKeyRecords.js";
import type * as mcp_apiKeys from "../mcp/apiKeys.js";
import type * as mcp_http from "../mcp/http.js";
import type * as mcp_resources from "../mcp/resources.js";
import type * as mcp_runArtifacts from "../mcp/runArtifacts.js";
import type * as mcp_workflowCommands from "../mcp/workflowCommands.js";
import type * as mcp_workflows from "../mcp/workflows.js";
import type * as providers_bulkapis_client from "../providers/bulkapis/client.js";
import type * as providers_bulkapis_config from "../providers/bulkapis/config.js";
import type * as providers_bulkapisModelCatalog from "../providers/bulkapisModelCatalog.js";
import type * as providers_errors from "../providers/errors.js";
import type * as providers_fal_assets from "../providers/fal/assets.js";
import type * as providers_fal_client from "../providers/fal/client.js";
import type * as providers_fal_payloads from "../providers/fal/payloads.js";
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
import type * as publishing_approval from "../publishing/approval.js";
import type * as publishing_distributionPlans from "../publishing/distributionPlans.js";
import type * as publishing_metrics from "../publishing/metrics.js";
import type * as publishing_publishInput from "../publishing/publishInput.js";
import type * as storage_files from "../storage/files.js";
import type * as system_crons from "../system/crons.js";
import type * as system_http from "../system/http.js";
import type * as validators from "../validators.js";
import type * as waitlist from "../waitlist.js";
import type * as workflows_agentPresets from "../workflows/agentPresets.js";
import type * as workflows_definitions from "../workflows/definitions.js";
import type * as workflows_handlers_generation_audioGenerationNodeHandler from "../workflows/handlers/generation/audioGenerationNodeHandler.js";
import type * as workflows_handlers_generation_imageGenerationNodeHandler from "../workflows/handlers/generation/imageGenerationNodeHandler.js";
import type * as workflows_handlers_generation_videoGenerationNodeHandler from "../workflows/handlers/generation/videoGenerationNodeHandler.js";
import type * as workflows_handlers_generation_videoTransformNodeHandlers from "../workflows/handlers/generation/videoTransformNodeHandlers.js";
import type * as workflows_handlers_generationNodeHandlers from "../workflows/handlers/generationNodeHandlers.js";
import type * as workflows_handlers_mediaNodeHandlers from "../workflows/handlers/mediaNodeHandlers.js";
import type * as workflows_handlers_publishingNodeHandlers from "../workflows/handlers/publishingNodeHandlers.js";
import type * as workflows_handlers_slideshowNodeHandlers from "../workflows/handlers/slideshowNodeHandlers.js";
import type * as workflows_handlers_textNodeHandlers from "../workflows/handlers/textNodeHandlers.js";
import type * as workflows_inputResolver from "../workflows/inputResolver.js";
import type * as workflows_postCompilerPresets from "../workflows/postCompilerPresets.js";
import type * as workflows_runCreation from "../workflows/runCreation.js";
import type * as workflows_runner from "../workflows/runner.js";
import type * as workflows_runs from "../workflows/runs.js";
import type * as workflows_runtime_artifactInputs from "../workflows/runtime/artifactInputs.js";
import type * as workflows_runtime_executionTypes from "../workflows/runtime/executionTypes.js";
import type * as workflows_runtime_generationWaiters from "../workflows/runtime/generationWaiters.js";
import type * as workflows_runtime_graphExecution from "../workflows/runtime/graphExecution.js";
import type * as workflows_runtime_inputValues from "../workflows/runtime/inputValues.js";
import type * as workflows_runtime_libraryReferences from "../workflows/runtime/libraryReferences.js";
import type * as workflows_runtime_mediaNodeItems from "../workflows/runtime/mediaNodeItems.js";
import type * as workflows_runtime_nodeRuntime from "../workflows/runtime/nodeRuntime.js";
import type * as workflows_runtime_outputRefs from "../workflows/runtime/outputRefs.js";
import type * as workflows_runtime_providerInputs from "../workflows/runtime/providerInputs.js";
import type * as workflows_runtime_publishPackaging from "../workflows/runtime/publishPackaging.js";
import type * as workflows_scheduling from "../workflows/scheduling.js";
import type * as workspaces_workspaces from "../workspaces/workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "accounts/creativeAssets": typeof accounts_creativeAssets;
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
  "content/assets/assetStorage": typeof content_assets_assetStorage;
  "content/createAssetRunner": typeof content_createAssetRunner;
  "content/createAssets": typeof content_createAssets;
  "content/dryRun": typeof content_dryRun;
  "content/formatContracts": typeof content_formatContracts;
  "content/planning": typeof content_planning;
  "content/planningPrompts": typeof content_planningPrompts;
  "content/requestExecution/contentRequestExecution": typeof content_requestExecution_contentRequestExecution;
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
  "create/agent/agentAsyncResults": typeof create_agent_agentAsyncResults;
  "create/agent/agentDecision": typeof create_agent_agentDecision;
  "create/agent/agentDiagnostics": typeof create_agent_agentDiagnostics;
  "create/agent/agentStopActions": typeof create_agent_agentStopActions;
  "create/agent/agentThreadOutputs": typeof create_agent_agentThreadOutputs;
  "create/agent/agentThreadRecords": typeof create_agent_agentThreadRecords;
  "create/agent/agentToolPlanning": typeof create_agent_agentToolPlanning;
  "create/agent/agentWorkflowDraftActions": typeof create_agent_agentWorkflowDraftActions;
  "create/execution/asyncToolReconciliation": typeof create_execution_asyncToolReconciliation;
  "create/execution/mediaGenerationExecution": typeof create_execution_mediaGenerationExecution;
  "create/execution/sourceAnalysisExecution": typeof create_execution_sourceAnalysisExecution;
  "create/execution/studioToolExecution": typeof create_execution_studioToolExecution;
  "create/execution/textGenerationExecution": typeof create_execution_textGenerationExecution;
  "create/execution/threadToolOutputs": typeof create_execution_threadToolOutputs;
  "create/execution/toolExecutionShared": typeof create_execution_toolExecutionShared;
  "create/execution/toolOutputActions": typeof create_execution_toolOutputActions;
  "create/execution/toolReferenceCollection": typeof create_execution_toolReferenceCollection;
  "create/execution/videoRenderExecution": typeof create_execution_videoRenderExecution;
  "create/planning": typeof create_planning;
  "create/references/referenceDiscovery": typeof create_references_referenceDiscovery;
  "create/references/referenceResolution": typeof create_references_referenceResolution;
  "create/references/sourceAnalysisContext": typeof create_references_sourceAnalysisContext;
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
  "create/workflowExport": typeof create_workflowExport;
  http: typeof http;
  "lib/mediaTextOverlays": typeof lib_mediaTextOverlays;
  "lib/text": typeof lib_text;
  "library/assets": typeof library_assets;
  "mcp/apiKeyRecords": typeof mcp_apiKeyRecords;
  "mcp/apiKeys": typeof mcp_apiKeys;
  "mcp/http": typeof mcp_http;
  "mcp/resources": typeof mcp_resources;
  "mcp/runArtifacts": typeof mcp_runArtifacts;
  "mcp/workflowCommands": typeof mcp_workflowCommands;
  "mcp/workflows": typeof mcp_workflows;
  "providers/bulkapis/client": typeof providers_bulkapis_client;
  "providers/bulkapis/config": typeof providers_bulkapis_config;
  "providers/bulkapisModelCatalog": typeof providers_bulkapisModelCatalog;
  "providers/errors": typeof providers_errors;
  "providers/fal/assets": typeof providers_fal_assets;
  "providers/fal/client": typeof providers_fal_client;
  "providers/fal/payloads": typeof providers_fal_payloads;
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
  "publishing/approval": typeof publishing_approval;
  "publishing/distributionPlans": typeof publishing_distributionPlans;
  "publishing/metrics": typeof publishing_metrics;
  "publishing/publishInput": typeof publishing_publishInput;
  "storage/files": typeof storage_files;
  "system/crons": typeof system_crons;
  "system/http": typeof system_http;
  validators: typeof validators;
  waitlist: typeof waitlist;
  "workflows/agentPresets": typeof workflows_agentPresets;
  "workflows/definitions": typeof workflows_definitions;
  "workflows/handlers/generation/audioGenerationNodeHandler": typeof workflows_handlers_generation_audioGenerationNodeHandler;
  "workflows/handlers/generation/imageGenerationNodeHandler": typeof workflows_handlers_generation_imageGenerationNodeHandler;
  "workflows/handlers/generation/videoGenerationNodeHandler": typeof workflows_handlers_generation_videoGenerationNodeHandler;
  "workflows/handlers/generation/videoTransformNodeHandlers": typeof workflows_handlers_generation_videoTransformNodeHandlers;
  "workflows/handlers/generationNodeHandlers": typeof workflows_handlers_generationNodeHandlers;
  "workflows/handlers/mediaNodeHandlers": typeof workflows_handlers_mediaNodeHandlers;
  "workflows/handlers/publishingNodeHandlers": typeof workflows_handlers_publishingNodeHandlers;
  "workflows/handlers/slideshowNodeHandlers": typeof workflows_handlers_slideshowNodeHandlers;
  "workflows/handlers/textNodeHandlers": typeof workflows_handlers_textNodeHandlers;
  "workflows/inputResolver": typeof workflows_inputResolver;
  "workflows/postCompilerPresets": typeof workflows_postCompilerPresets;
  "workflows/runCreation": typeof workflows_runCreation;
  "workflows/runner": typeof workflows_runner;
  "workflows/runs": typeof workflows_runs;
  "workflows/runtime/artifactInputs": typeof workflows_runtime_artifactInputs;
  "workflows/runtime/executionTypes": typeof workflows_runtime_executionTypes;
  "workflows/runtime/generationWaiters": typeof workflows_runtime_generationWaiters;
  "workflows/runtime/graphExecution": typeof workflows_runtime_graphExecution;
  "workflows/runtime/inputValues": typeof workflows_runtime_inputValues;
  "workflows/runtime/libraryReferences": typeof workflows_runtime_libraryReferences;
  "workflows/runtime/mediaNodeItems": typeof workflows_runtime_mediaNodeItems;
  "workflows/runtime/nodeRuntime": typeof workflows_runtime_nodeRuntime;
  "workflows/runtime/outputRefs": typeof workflows_runtime_outputRefs;
  "workflows/runtime/providerInputs": typeof workflows_runtime_providerInputs;
  "workflows/runtime/publishPackaging": typeof workflows_runtime_publishPackaging;
  "workflows/scheduling": typeof workflows_scheduling;
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
