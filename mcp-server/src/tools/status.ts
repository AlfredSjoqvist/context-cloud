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
        "One-shot health + summary. Returns the Convex URL the server is reading from " +
        "(and whether it's the default demo deployment), the server version, the latest " +
        "Guardian cycle, the active-note count, and findings broken down across all 7 " +
        "lifecycle statuses. Cheap (≈10 parallel queries with allSettled — a single " +
        "slow query degrades to 'ERR' instead of black-holing the whole status).",
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

        // Guardian cycle — latest only. If the agent runtime isn't firing, this stays
        // null; the status renders "no cycles recorded yet" so the user can tell the
        // backend has data but the agent loop isn't running.
        let cycleLine = "guardian last cycle: (no cycles recorded yet)";
        try {
          const latest = (await client.query(Q.cyclesLatest as never, {} as never)) as
            | { cycleNumber?: number; startedAt?: number; finishedAt?: number; status?: string }
            | null;
          if (latest) {
            const num = latest.cycleNumber ?? "?";
            const started = latest.startedAt ? new Date(latest.startedAt).toISOString() : "?";
            const finished = latest.finishedAt ? new Date(latest.finishedAt).toISOString() : "in-progress";
            const st = latest.status ?? "?";
            cycleLine = `guardian last cycle: #${num} ${st}  started=${started}  finished=${finished}`;
          }
        } catch {
          cycleLine = "guardian last cycle: ERR";
        }

        const truncationFlag = typeof noteCount === "number" && noteCount >= 500 ? " (scan limit)" : "";
        // Build the lines as an array of (string | null), then filter only null. Empty
        // strings are intentional blank-line separators; filter(Boolean) would drop them.
        const lines = [
          `hindsight-mcp v${SERVER_VERSION}`,
          `  convex: ${url}  (source=${source})`,
          source === "default" ? `  ⚠️  reading the project's demo deployment — set HINDSIGHT_CONVEX_URL to override.` : null,
          ``,
          cycleLine,
          ``,
          `active notes:    ${noteCount}${truncationFlag}`,
          `findings:`,
          ...findingCounts.map(([s, n]) => `  ${s.padEnd(22)} ${n}`),
        ].filter((line): line is string => line !== null);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      }),
  );
}
