/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts_brandAssets from "../accounts/brandAssets.js";
import type * as accounts_brands from "../accounts/brands.js";
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
import type * as providers_errors from "../providers/errors.js";
import type * as providers_fal from "../providers/fal.js";
import type * as providers_gemini from "../providers/gemini.js";
import type * as providers_index from "../providers/index.js";
import type * as providers_model from "../providers/model.js";
import type * as providers_openrouter from "../providers/openrouter.js";
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
import type * as workflows_definitions from "../workflows/definitions.js";
import type * as workflows_distributionStep from "../workflows/distributionStep.js";
import type * as workflows_execution from "../workflows/execution.js";
import type * as workflows_modelSteps from "../workflows/modelSteps.js";
import type * as workflows_runner from "../workflows/runner.js";
import type * as workflows_runs from "../workflows/runs.js";
import type * as workflows_slideshowSteps from "../workflows/slideshowSteps.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "accounts/brandAssets": typeof accounts_brandAssets;
  "accounts/brands": typeof accounts_brands;
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
  "providers/errors": typeof providers_errors;
  "providers/fal": typeof providers_fal;
  "providers/gemini": typeof providers_gemini;
  "providers/index": typeof providers_index;
  "providers/model": typeof providers_model;
  "providers/openrouter": typeof providers_openrouter;
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
  "workflows/definitions": typeof workflows_definitions;
  "workflows/distributionStep": typeof workflows_distributionStep;
  "workflows/execution": typeof workflows_execution;
  "workflows/modelSteps": typeof workflows_modelSteps;
  "workflows/runner": typeof workflows_runner;
  "workflows/runs": typeof workflows_runs;
  "workflows/slideshowSteps": typeof workflows_slideshowSteps;
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
