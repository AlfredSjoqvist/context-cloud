import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Q, runQuery } from "../convex.js";
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

/**
 * Finding shape per convex/schema.ts. Citations are nested objects, not flat
 * fields — earlier versions of this type had them flat and the renderer
 * silently produced "(untitled)" for every real finding.
 */
export type Finding = {
  _id: string;
  status: string;
  fingerprint?: string;
  cycleDetected?: number;
  severity?: string;
  category?: string;
  path?: string;
  codeCite?: { line: number; excerpt?: string };
  constraintCite?: { mdFile: string; line: number; text?: string };
  reasoning?: string;
  suggestedFixDirection?: string;
  githubIssueNumber?: number;
  sharpenIterations?: number;
};

function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "No findings.";
  return findings
    .map((f) => {
      const codeLine = f.codeCite?.line;
      const loc = f.path && codeLine ? `${f.path}:${codeLine}` : f.path ?? "?";
      const cite = f.constraintCite
        ? ` (cites ${f.constraintCite.mdFile}:${f.constraintCite.line})`
        : "";
      const sev = f.severity ? ` [${f.severity}]` : "";
      const cat = f.category ? ` ${f.category}` : "";
      // No title field in the schema — show the reasoning (truncated) instead.
      const summary = truncate(f.reasoning, 140) || "(no reasoning)";
      const issue = f.githubIssueNumber ? ` issue=#${f.githubIssueNumber}` : "";
      return `- ${loc}${sev}${cat} — ${summary}${cite} — status=${f.status}${issue}, id=${f._id}`;
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
        severity: z
          .enum(["low", "medium", "high", "critical"])
          .optional()
          .describe("Optional severity filter — applied client-side after the Convex query."),
        limit: z.number().int().positive().max(200).optional().describe("Max rows to return (default 50)."),
      },
    },
    async ({ status, severity, limit }) =>
      safe("list_findings", { status, severity, limit }, async () => {
        const rows = await runQuery<Finding[]>(Q.findingsByStatus, { status });
        const filtered = severity ? rows.filter((f) => f.severity === severity) : rows;
        const slice = filtered.slice(0, limit ?? 50);
        const sevSuffix = severity ? `, severity=${severity}` : "";
        return {
          content: [
            { type: "text", text: formatFindings(slice) },
            {
              type: "text",
              text: `\n(returned ${slice.length} of ${filtered.length} findings with status=${status}${sevSuffix})`,
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
        path: z.string().min(1).describe("Repo-relative path, e.g. 'agent/main.ts'."),
      },
    },
    async ({ path }) =>
      safe("get_findings_for_file", { path }, async () => {
        const active = (
          await Promise.all(
            (["detected", "devin_running", "pr_open", "verifying", "reopened_sharpened"] as const).map((s) =>
              runQuery<Finding[]>(Q.findingsByStatus, { status: s }),
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
