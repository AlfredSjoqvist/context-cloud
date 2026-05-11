import { ConvexHttpClient } from "convex/browser";

/**
 * Hindsight MCP server reads from Convex over HTTP.
 *
 * CONVEX_URL must point at a *.convex.cloud deployment (not *.convex.site, which is the
 * HTTP-action surface used by NM's Python writer). Defaults to the colorless-porcupine-926
 * deployment from CLAUDE.md if unset, but real installs should set it explicitly.
 */
const DEFAULT_CONVEX_URL = "https://colorless-porcupine-926.convex.cloud";

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (client) return client;
  const url = process.env.HINDSIGHT_CONVEX_URL || process.env.CONVEX_URL || DEFAULT_CONVEX_URL;
  if (!url) {
    throw new Error(
      "Hindsight MCP server needs CONVEX_URL (or HINDSIGHT_CONVEX_URL) set to a *.convex.cloud deployment.",
    );
  }
  client = new ConvexHttpClient(url);
  return client;
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
