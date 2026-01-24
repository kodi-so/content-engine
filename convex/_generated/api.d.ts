/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as analytics from "../analytics.js";
import type * as automations_feedback from "../automations/feedback.js";
import type * as automations_generate from "../automations/generate.js";
import type * as automations_index from "../automations/index.js";
import type * as automations_internal from "../automations/internal.js";
import type * as automations_process from "../automations/process.js";
import type * as automations_schedule from "../automations/schedule.js";
import type * as content from "../content.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as products from "../products.js";
import type * as providers_gemini from "../providers/gemini.js";
import type * as referenceImages from "../referenceImages.js";
import type * as scheduledPosts from "../scheduledPosts.js";
import type * as slideshows_generate from "../slideshows/generate.js";
import type * as storage from "../storage.js";
import type * as tiktok from "../tiktok.js";
import type * as tiktokAnalytics from "../tiktokAnalytics.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  analytics: typeof analytics;
  "automations/feedback": typeof automations_feedback;
  "automations/generate": typeof automations_generate;
  "automations/index": typeof automations_index;
  "automations/internal": typeof automations_internal;
  "automations/process": typeof automations_process;
  "automations/schedule": typeof automations_schedule;
  content: typeof content;
  crons: typeof crons;
  http: typeof http;
  products: typeof products;
  "providers/gemini": typeof providers_gemini;
  referenceImages: typeof referenceImages;
  scheduledPosts: typeof scheduledPosts;
  "slideshows/generate": typeof slideshows_generate;
  storage: typeof storage;
  tiktok: typeof tiktok;
  tiktokAnalytics: typeof tiktokAnalytics;
  validators: typeof validators;
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
