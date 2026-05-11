import { ConvexHttpClient } from "convex/browser";
import { log } from "./log.js";

/**
 * Hindsight MCP server reads from Convex over HTTP.
 *
 * Resolution order:
 *   1. HINDSIGHT_CONVEX_URL  — preferred; namespaced to this package.
 *   2. CONVEX_URL            — convenience fallback so users with an existing
 *                              Convex env don't have to duplicate it.
 *   3. DEFAULT_CONVEX_URL    — the project's own demo deployment. Only used
 *                              when neither env var is set; logs a loud warn
 *                              so misconfigured installs are visible at boot.
 *
 * The URL must point at a *.convex.cloud deployment (NOT *.convex.site, which
 * is the HTTP-action surface used by NM's Python writer).
 */
const DEFAULT_CONVEX_URL = "https://colorless-porcupine-926.convex.cloud";

let client: ConvexHttpClient | null = null;

export function resolveConvexUrl(): { url: string; source: "HINDSIGHT_CONVEX_URL" | "CONVEX_URL" | "default" } {
  if (process.env.HINDSIGHT_CONVEX_URL) {
    return { url: process.env.HINDSIGHT_CONVEX_URL, source: "HINDSIGHT_CONVEX_URL" };
  }
  if (process.env.CONVEX_URL) {
    return { url: process.env.CONVEX_URL, source: "CONVEX_URL" };
  }
  return { url: DEFAULT_CONVEX_URL, source: "default" };
}

export function getConvexClient(): ConvexHttpClient {
  if (client) return client;
  const { url, source } = resolveConvexUrl();
  if (source === "default") {
    log.warn("convex.fallback_to_demo", {
      url,
      hint: "Set HINDSIGHT_CONVEX_URL to your own deployment so you stop reading the demo's data.",
    });
  } else {
    log.debug("convex.client_init", { url, source });
  }
  client = new ConvexHttpClient(url);
  return client;
}

/**
 * Run a Convex query and rewrite the error to name (a) which query failed and
 * (b) the configured Convex URL. The raw convex client error often has an empty
 * .message on network failures, so a naked `error: ` bubbles up to the MCP
 * caller. This wrapper guarantees an actionable diagnostic string.
 */
export async function runQuery<T>(ref: string, args: Record<string, unknown>): Promise<T> {
  const client = getConvexClient();
  const { url } = resolveConvexUrl();
  try {
    return (await client.query(ref as never, args as never)) as T;
  } catch (err) {
    const original = err as { message?: string; code?: string; name?: string };
    const inner = original.message || original.code || original.name || "(no detail)";
    throw new Error(`convex query '${ref}' failed against ${url}: ${inner}`);
  }
}

/**
 * Convex function references are strings in the form "module:export". The deployed
 * functions we read here are owned by the Convex/backend agent — we are a downstream
 * consumer. If a name drifts, every tool call below will surface a clear server error
 * naming the missing reference, which is the signal to update this file.
 */
export const Q = {
  findingsByStatus: "findings:byStatus",
  notesListActive: "notes:listActive",
  notesListEdgesForPath: "notes:listEdgesForPath",
  notesListEdgesForNote: "notes:listEdgesForNote",
} as const;
