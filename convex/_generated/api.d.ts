/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as artifacts from "../artifacts.js";
import type * as brands from "../brands.js";
import type * as crons from "../crons.js";
import type * as distributionPlans from "../distributionPlans.js";
import type * as http from "../http.js";
import type * as metrics from "../metrics.js";
import type * as providers_errors from "../providers/errors.js";
import type * as providers_gemini from "../providers/gemini.js";
import type * as providers_model from "../providers/model.js";
import type * as providers_publishing from "../providers/publishing.js";
import type * as socialAccounts from "../socialAccounts.js";
import type * as storage from "../storage.js";
import type * as validators from "../validators.js";
import type * as workflowRuns from "../workflowRuns.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  artifacts: typeof artifacts;
  brands: typeof brands;
  crons: typeof crons;
  distributionPlans: typeof distributionPlans;
  http: typeof http;
  metrics: typeof metrics;
  "providers/errors": typeof providers_errors;
  "providers/gemini": typeof providers_gemini;
  "providers/model": typeof providers_model;
  "providers/publishing": typeof providers_publishing;
  socialAccounts: typeof socialAccounts;
  storage: typeof storage;
  validators: typeof validators;
  workflowRuns: typeof workflowRuns;
  workflows: typeof workflows;
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
