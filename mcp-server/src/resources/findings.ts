import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConvexClient, Q } from "../convex.js";
import { log } from "../log.js";
import { formatFindings, type Finding } from "../tools/findings.js";

const STATUSES = [
  "detected",
  "devin_running",
  "pr_open",
  "verifying",
  "resolved",
  "reopened_sharpened",
  "escalated",
] as const;

/**
 * Expose Guardian findings as MCP resources. URI scheme: hindsight://findings/<status>.
 * Editors that prefer resources to tools (Cursor's resource picker, etc.) can browse
 * these without having to call a tool. Each resource is the same plain-text rendering
 * that the equivalent tool returns.
 */
export function registerFindingsResources(server: McpServer): void {
  for (const status of STATUSES) {
    server.registerResource(
      `findings-${status}`,
      `hindsight://findings/${status}`,
      {
        title: `Findings — ${status}`,
        description: `Guardian findings currently in the '${status}' lifecycle state.`,
        mimeType: "text/plain",
      },
      async (uri) => {
        const t0 = Date.now();
        try {
          const client = getConvexClient();
          const rows = (await client.query(Q.findingsByStatus as never, { status } as never)) as Finding[];
          log.info("resource.ok", { uri: uri.href, ms: Date.now() - t0, rows: rows.length });
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "text/plain",
                text: formatFindings(rows) + `\n\n(${rows.length} ${status})`,
              },
            ],
          };
        } catch (err) {
          const msg = (err as Error).message ?? String(err);
          log.error("resource.fail", { uri: uri.href, ms: Date.now() - t0, error: msg });
          return {
            contents: [
              { uri: uri.href, mimeType: "text/plain", text: `error reading ${uri.href}: ${msg}` },
            ],
          };
        }
      },
    );
  }
}
