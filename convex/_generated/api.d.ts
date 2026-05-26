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
import type * as artifacts_records from "../artifacts/records.js";
import type * as artifacts_regeneration from "../artifacts/regeneration.js";
import type * as content_assetStorage from "../content/assetStorage.js";
import type * as content_dryRun from "../content/dryRun.js";
import type * as content_formatContracts from "../content/formatContracts.js";
import type * as content_planning from "../content/planning.js";
import type * as content_requests from "../content/requests.js";
import type * as content_slideshowAdapter from "../content/slideshowAdapter.js";
import type * as content_slideshowDimensions from "../content/slideshowDimensions.js";
import type * as content_slideshows from "../content/slideshows.js";
import type * as content_types from "../content/types.js";
import type * as lib_text from "../lib/text.js";
import type * as mcp_resources from "../mcp/resources.js";
import type * as mcp_runArtifacts from "../mcp/runArtifacts.js";
import type * as mcp_workflows from "../mcp/workflows.js";
import type * as providers_bulkapis from "../providers/bulkapis.js";
import type * as providers_bulkapisConfig from "../providers/bulkapisConfig.js";
import type * as providers_bulkapisModelCatalog from "../providers/bulkapisModelCatalog.js";
import type * as providers_errors from "../providers/errors.js";
import type * as providers_fal from "../providers/fal.js";
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
import type * as system_crons from "../system/crons.js";
import type * as system_http from "../system/http.js";
import type * as validators from "../validators.js";
import type * as workflows_agentPresets from "../workflows/agentPresets.js";
import type * as workflows_definitions from "../workflows/definitions.js";
import type * as workflows_inputResolver from "../workflows/inputResolver.js";
import type * as workflows_postCompilerPresets from "../workflows/postCompilerPresets.js";
import type * as workflows_runCreation from "../workflows/runCreation.js";
import type * as workflows_runner from "../workflows/runner.js";
import type * as workflows_runs from "../workflows/runs.js";
import type * as workflows_scheduling from "../workflows/scheduling.js";

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
  "artifacts/records": typeof artifacts_records;
  "artifacts/regeneration": typeof artifacts_regeneration;
  "content/assetStorage": typeof content_assetStorage;
  "content/dryRun": typeof content_dryRun;
  "content/formatContracts": typeof content_formatContracts;
  "content/planning": typeof content_planning;
  "content/requests": typeof content_requests;
  "content/slideshowAdapter": typeof content_slideshowAdapter;
  "content/slideshowDimensions": typeof content_slideshowDimensions;
  "content/slideshows": typeof content_slideshows;
  "content/types": typeof content_types;
  "lib/text": typeof lib_text;
  "mcp/resources": typeof mcp_resources;
  "mcp/runArtifacts": typeof mcp_runArtifacts;
  "mcp/workflows": typeof mcp_workflows;
  "providers/bulkapis": typeof providers_bulkapis;
  "providers/bulkapisConfig": typeof providers_bulkapisConfig;
  "providers/bulkapisModelCatalog": typeof providers_bulkapisModelCatalog;
  "providers/errors": typeof providers_errors;
  "providers/fal": typeof providers_fal;
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
  "system/crons": typeof system_crons;
  "system/http": typeof system_http;
  validators: typeof validators;
  "workflows/agentPresets": typeof workflows_agentPresets;
  "workflows/definitions": typeof workflows_definitions;
  "workflows/inputResolver": typeof workflows_inputResolver;
  "workflows/postCompilerPresets": typeof workflows_postCompilerPresets;
  "workflows/runCreation": typeof workflows_runCreation;
  "workflows/runner": typeof workflows_runner;
  "workflows/runs": typeof workflows_runs;
  "workflows/scheduling": typeof workflows_scheduling;
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
