/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts_brands from "../accounts/brands.js";
import type * as accounts_creativeAssets from "../accounts/creativeAssets.js";
import type * as accounts_personas from "../accounts/personas.js";
import type * as accounts_socialAccounts from "../accounts/socialAccounts.js";
import type * as analyze_mediaResolver from "../analyze/mediaResolver.js";
import type * as analyze_videoAnalysis from "../analyze/videoAnalysis.js";
import type * as analyze_videoAnalysisModel from "../analyze/videoAnalysisModel.js";
import type * as artifacts_records from "../artifacts/records.js";
import type * as artifacts_regeneration from "../artifacts/regeneration.js";
import type * as auth_actionAccess from "../auth/actionAccess.js";
import type * as auth_users from "../auth/users.js";
import type * as content_assetStorage from "../content/assetStorage.js";
import type * as content_createAssetRunner from "../content/createAssetRunner.js";
import type * as content_createAssets from "../content/createAssets.js";
import type * as content_dryRun from "../content/dryRun.js";
import type * as content_formatContracts from "../content/formatContracts.js";
import type * as content_planning from "../content/planning.js";
import type * as content_planningPrompts from "../content/planningPrompts.js";
import type * as content_requestExecutionHelpers from "../content/requestExecutionHelpers.js";
import type * as content_requests from "../content/requests.js";
import type * as content_slideshowAdapter from "../content/slideshowAdapter.js";
import type * as content_slideshowDimensions from "../content/slideshowDimensions.js";
import type * as content_slideshowRequestEditing from "../content/slideshowRequestEditing.js";
import type * as content_slideshowRequestMutations from "../content/slideshowRequestMutations.js";
import type * as content_slideshows from "../content/slideshows.js";
import type * as content_types from "../content/types.js";
import type * as content_videoProjects from "../content/videoProjects.js";
import type * as create_agent from "../create/agent.js";
import type * as create_planning from "../create/planning.js";
import type * as create_referenceDiscovery from "../create/referenceDiscovery.js";
import type * as create_referenceResolution from "../create/referenceResolution.js";
import type * as create_sourceAnalysisContext from "../create/sourceAnalysisContext.js";
import type * as create_studioComposition from "../create/studioComposition.js";
import type * as create_studioRenderRequests from "../create/studioRenderRequests.js";
import type * as create_threads from "../create/threads.js";
import type * as create_toolExecution from "../create/toolExecution.js";
import type * as create_tools_index from "../create/tools/index.js";
import type * as create_tools_registry from "../create/tools/registry.js";
import type * as create_tools_types from "../create/tools/types.js";
import type * as create_workflowExport from "../create/workflowExport.js";
import type * as http from "../http.js";
import type * as lib_text from "../lib/text.js";
import type * as library_assets from "../library/assets.js";
import type * as mcp_apiKeyRecords from "../mcp/apiKeyRecords.js";
import type * as mcp_apiKeys from "../mcp/apiKeys.js";
import type * as mcp_http from "../mcp/http.js";
import type * as mcp_resources from "../mcp/resources.js";
import type * as mcp_runArtifacts from "../mcp/runArtifacts.js";
import type * as mcp_workflowCommands from "../mcp/workflowCommands.js";
import type * as mcp_workflows from "../mcp/workflows.js";
import type * as providers_bulkapis from "../providers/bulkapis.js";
import type * as providers_bulkapisConfig from "../providers/bulkapisConfig.js";
import type * as providers_bulkapisModelCatalog from "../providers/bulkapisModelCatalog.js";
import type * as providers_errors from "../providers/errors.js";
import type * as providers_fal from "../providers/fal.js";
import type * as providers_falModelCatalog from "../providers/falModelCatalog.js";
import type * as providers_gemini from "../providers/gemini.js";
import type * as providers_index from "../providers/index.js";
import type * as providers_manual from "../providers/manual.js";
import type * as providers_model from "../providers/model.js";
import type * as providers_modelCatalog from "../providers/modelCatalog.js";
import type * as providers_openrouter from "../providers/openrouter.js";
import type * as providers_postBridge from "../providers/postBridge.js";
import type * as providers_postiz from "../providers/postiz.js";
import type * as providers_publishing from "../providers/publishing.js";
import type * as publishing_approval from "../publishing/approval.js";
import type * as publishing_distributionPlans from "../publishing/distributionPlans.js";
import type * as publishing_metrics from "../publishing/metrics.js";
import type * as publishing_publishInput from "../publishing/publishInput.js";
import type * as storage_files from "../storage/files.js";
import type * as storage_r2 from "../storage/r2.js";
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

import type { ComponentApi as R2ComponentApi } from "@convex-dev/r2/_generated/component.js";
import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "accounts/brands": typeof accounts_brands;
  "accounts/creativeAssets": typeof accounts_creativeAssets;
  "accounts/personas": typeof accounts_personas;
  "accounts/socialAccounts": typeof accounts_socialAccounts;
  "analyze/mediaResolver": typeof analyze_mediaResolver;
  "analyze/videoAnalysis": typeof analyze_videoAnalysis;
  "analyze/videoAnalysisModel": typeof analyze_videoAnalysisModel;
  "artifacts/records": typeof artifacts_records;
  "artifacts/regeneration": typeof artifacts_regeneration;
  "auth/actionAccess": typeof auth_actionAccess;
  "auth/users": typeof auth_users;
  "content/assetStorage": typeof content_assetStorage;
  "content/createAssetRunner": typeof content_createAssetRunner;
  "content/createAssets": typeof content_createAssets;
  "content/dryRun": typeof content_dryRun;
  "content/formatContracts": typeof content_formatContracts;
  "content/planning": typeof content_planning;
  "content/planningPrompts": typeof content_planningPrompts;
  "content/requestExecutionHelpers": typeof content_requestExecutionHelpers;
  "content/requests": typeof content_requests;
  "content/slideshowAdapter": typeof content_slideshowAdapter;
  "content/slideshowDimensions": typeof content_slideshowDimensions;
  "content/slideshowRequestEditing": typeof content_slideshowRequestEditing;
  "content/slideshowRequestMutations": typeof content_slideshowRequestMutations;
  "content/slideshows": typeof content_slideshows;
  "content/types": typeof content_types;
  "content/videoProjects": typeof content_videoProjects;
  "create/agent": typeof create_agent;
  "create/planning": typeof create_planning;
  "create/referenceDiscovery": typeof create_referenceDiscovery;
  "create/referenceResolution": typeof create_referenceResolution;
  "create/sourceAnalysisContext": typeof create_sourceAnalysisContext;
  "create/studioComposition": typeof create_studioComposition;
  "create/studioRenderRequests": typeof create_studioRenderRequests;
  "create/threads": typeof create_threads;
  "create/toolExecution": typeof create_toolExecution;
  "create/tools/index": typeof create_tools_index;
  "create/tools/registry": typeof create_tools_registry;
  "create/tools/types": typeof create_tools_types;
  "create/workflowExport": typeof create_workflowExport;
  http: typeof http;
  "lib/text": typeof lib_text;
  "library/assets": typeof library_assets;
  "mcp/apiKeyRecords": typeof mcp_apiKeyRecords;
  "mcp/apiKeys": typeof mcp_apiKeys;
  "mcp/http": typeof mcp_http;
  "mcp/resources": typeof mcp_resources;
  "mcp/runArtifacts": typeof mcp_runArtifacts;
  "mcp/workflowCommands": typeof mcp_workflowCommands;
  "mcp/workflows": typeof mcp_workflows;
  "providers/bulkapis": typeof providers_bulkapis;
  "providers/bulkapisConfig": typeof providers_bulkapisConfig;
  "providers/bulkapisModelCatalog": typeof providers_bulkapisModelCatalog;
  "providers/errors": typeof providers_errors;
  "providers/fal": typeof providers_fal;
  "providers/falModelCatalog": typeof providers_falModelCatalog;
  "providers/gemini": typeof providers_gemini;
  "providers/index": typeof providers_index;
  "providers/manual": typeof providers_manual;
  "providers/model": typeof providers_model;
  "providers/modelCatalog": typeof providers_modelCatalog;
  "providers/openrouter": typeof providers_openrouter;
  "providers/postBridge": typeof providers_postBridge;
  "providers/postiz": typeof providers_postiz;
  "providers/publishing": typeof providers_publishing;
  "publishing/approval": typeof publishing_approval;
  "publishing/distributionPlans": typeof publishing_distributionPlans;
  "publishing/metrics": typeof publishing_metrics;
  "publishing/publishInput": typeof publishing_publishInput;
  "storage/files": typeof storage_files;
  "storage/r2": typeof storage_r2;
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

export declare const components: {
  r2: R2ComponentApi;
};
