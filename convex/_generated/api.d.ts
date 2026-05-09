/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cycles from "../cycles.js";
import type * as dashboard from "../dashboard.js";
import type * as devinRuns from "../devinRuns.js";
import type * as docsIngestRuns from "../docsIngestRuns.js";
import type * as events from "../events.js";
import type * as fileScanHistory from "../fileScanHistory.js";
import type * as findings from "../findings.js";
import type * as gc from "../gc.js";
import type * as http from "../http.js";
import type * as hurdles from "../hurdles.js";
import type * as injections from "../injections.js";
import type * as libraries from "../libraries.js";
import type * as notes from "../notes.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cycles: typeof cycles;
  dashboard: typeof dashboard;
  devinRuns: typeof devinRuns;
  docsIngestRuns: typeof docsIngestRuns;
  events: typeof events;
  fileScanHistory: typeof fileScanHistory;
  findings: typeof findings;
  gc: typeof gc;
  http: typeof http;
  hurdles: typeof hurdles;
  injections: typeof injections;
  libraries: typeof libraries;
  notes: typeof notes;
  seed: typeof seed;
  sessions: typeof sessions;
  users: typeof users;
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
