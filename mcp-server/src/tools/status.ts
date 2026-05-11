import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConvexClient, Q, resolveConvexUrl } from "../convex.js";
import { safe } from "../log.js";

const STATUSES = [
  "detected",
  "devin_running",
  "pr_open",
  "verifying",
  "resolved",
  "reopened_sharpened",
  "escalated",
] as const;

const SERVER_VERSION = "0.1.0";

export function registerStatusTool(server: McpServer): void {
  server.registerTool(
    "get_status",
    {
      title: "Hindsight server + data status",
      description:
        "One-shot health + summary. Returns the Convex URL the server is reading from, " +
        "whether it's the default demo deployment, server version, and total counts of " +
        "active notes + findings by lifecycle status. Cheap (one query per status); a fast " +
        "way for an agent to ask 'is Hindsight live and what does it know?'",
      inputSchema: {},
    },
    async () =>
      safe("get_status", {}, async () => {
        const { url, source } = resolveConvexUrl();
        const client = getConvexClient();

        // Use allSettled so a single slow / missing query doesn't black-hole the whole
        // status response. A failed status row renders as "ERR" instead of a count.
        const findingResults = await Promise.allSettled(
          STATUSES.map((s) => client.query(Q.findingsByStatus as never, { status: s } as never)),
        );
        const findingCounts: [string, number | "ERR"][] = findingResults.map((r, i) => [
          STATUSES[i],
          r.status === "fulfilled" && Array.isArray(r.value) ? (r.value as unknown[]).length : "ERR",
        ]);

        let noteCount: number | "ERR" = "ERR";
        try {
          const notes = (await client.query(
            Q.notesListActive as never,
            { limit: 500 } as never,
          )) as unknown[];
          noteCount = Array.isArray(notes) ? notes.length : "ERR";
        } catch {
          // noteCount stays ERR; the cause is on stderr via the safe wrapper if it bubbles,
          // but here we already swallowed it to keep partial status useful.
        }

        const truncationFlag = typeof noteCount === "number" && noteCount >= 500 ? " (scan limit)" : "";
        const lines: string[] = [
          `hindsight-mcp v${SERVER_VERSION}`,
          `  convex: ${url}  (source=${source})`,
          source === "default" ? `  ⚠️  reading the project's demo deployment — set HINDSIGHT_CONVEX_URL to override.` : "",
          ``,
          `active notes:    ${noteCount}${truncationFlag}`,
          `findings:`,
          ...findingCounts.map(([s, n]) => `  ${s.padEnd(22)} ${n}`),
        ].filter(Boolean);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      }),
  );
}
