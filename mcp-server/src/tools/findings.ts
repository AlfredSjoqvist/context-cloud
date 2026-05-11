import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConvexClient, Q } from "../convex.js";
import { safe } from "../log.js";

const FindingStatus = z.enum([
  "detected",
  "devin_running",
  "pr_open",
  "verifying",
  "resolved",
  "reopened_sharpened",
  "escalated",
]);

export type Finding = {
  _id: string;
  status: string;
  path?: string;
  mdFile?: string;
  mdLine?: number;
  codeLine?: number;
  severity?: string;
  title?: string;
  rationale?: string;
  fingerprint?: string;
  createdAt?: number;
};

export function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "No findings.";
  return findings
    .map((f) => {
      const loc = f.path && f.codeLine ? `${f.path}:${f.codeLine}` : f.path ?? "?";
      const cite = f.mdFile && f.mdLine ? ` (cites ${f.mdFile}:${f.mdLine})` : "";
      const sev = f.severity ? ` [${f.severity}]` : "";
      const title = f.title ?? "(untitled)";
      return `- ${loc}${sev} ${title}${cite} — status=${f.status}, id=${f._id}`;
    })
    .join("\n");
}

export function registerFindingsTools(server: McpServer): void {
  server.registerTool(
    "list_findings",
    {
      title: "List Guardian findings",
      description:
        "List Guardian findings filtered by lifecycle status. Returns code location, severity, " +
        "the .md constraint cited, and current status. Read-only.",
      inputSchema: {
        status: FindingStatus.describe(
          "Lifecycle status to filter on. Most useful: 'detected' (new), 'pr_open' (Devin handed off), 'verifying'.",
        ),
        limit: z.number().int().positive().max(200).optional().describe("Max rows to return (default 50)."),
      },
    },
    async ({ status, limit }) =>
      safe("list_findings", { status, limit }, async () => {
        const client = getConvexClient();
        const rows = (await client.query(Q.findingsByStatus as never, { status } as never)) as Finding[];
        const slice = rows.slice(0, limit ?? 50);
        return {
          content: [
            { type: "text", text: formatFindings(slice) },
            {
              type: "text",
              text: `\n(returned ${slice.length} of ${rows.length} findings with status=${status})`,
            },
          ],
        };
      }),
  );

  server.registerTool(
    "get_findings_for_file",
    {
      title: "Findings for a specific file",
      description:
        "Return active (non-resolved) Guardian findings whose code path matches the given file. " +
        "Useful when the user opens a file in their editor and wants to see what Guardian flagged.",
      inputSchema: {
        path: z.string().describe("Repo-relative path, e.g. 'agent/main.ts'."),
      },
    },
    async ({ path }) =>
      safe("get_findings_for_file", { path }, async () => {
        const client = getConvexClient();
        const active = (
          await Promise.all(
            (["detected", "devin_running", "pr_open", "verifying", "reopened_sharpened"] as const).map((s) =>
              client.query(Q.findingsByStatus as never, { status: s } as never) as Promise<Finding[]>,
            ),
          )
        ).flat();
        const matched = active.filter((f) => f.path === path);
        return {
          content: [
            { type: "text", text: formatFindings(matched) },
            { type: "text", text: `\n(${matched.length} active findings for ${path})` },
          ],
        };
      }),
  );
}
