import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Q, runQuery } from "../convex.js";
import { safe } from "../log.js";

export type Note = {
  _id: string;
  noteId?: string;
  body?: string;
  summary?: string;
  createdAt?: number;
  invalidatedAt?: number;
  injectCount?: number;
};

export type NoteEdge = {
  noteId: string;
  path: string;
  weight?: number;
};

export function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function formatNotes(notes: Note[]): string {
  if (notes.length === 0) return "No notes.";
  return notes
    .map((n) => {
      const id = n.noteId ?? n._id;
      const body = truncate(n.summary ?? n.body, 200);
      const injects = n.injectCount !== undefined ? ` injects=${n.injectCount}` : "";
      return `- ${id}${injects}: ${body}`;
    })
    .join("\n");
}

export function registerNotesTools(server: McpServer): void {
  server.registerTool(
    "list_notes",
    {
      title: "List active NM notes",
      description:
        "List Note Manager notes that have not been invalidated (active in the graph). " +
        "These are the compact lessons NM has distilled from prior Claude Code sessions.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional().describe("Max rows to return (default 50)."),
      },
    },
    async ({ limit }) =>
      safe("list_notes", { limit }, async () => {
        const rows = await runQuery<Note[]>(Q.notesListActive, { limit: limit ?? 50 });
        return {
          content: [
            { type: "text", text: formatNotes(rows) },
            { type: "text", text: `\n(${rows.length} active notes)` },
          ],
        };
      }),
  );

  server.registerTool(
    "get_notes_for_file",
    {
      title: "Notes attached to a file",
      description:
        "Return NM notes that have an edge to the given file path. Use this when an editor is " +
        "about to work on a file and wants the prior lessons surfaced.",
      inputSchema: {
        path: z.string().describe("Repo-relative path, e.g. 'agent/main.ts'."),
      },
    },
    async ({ path }) =>
      safe("get_notes_for_file", { path }, async () => {
        const edges = await runQuery<NoteEdge[]>(Q.notesListEdgesForPath, { path });
        if (edges.length === 0) {
          return { content: [{ type: "text", text: `No NM notes attached to ${path}.` }] };
        }
        // Note: listActive caps at this limit. If the deployment ever exceeds it we
        // could miss notes for the file. The cap is reported in the response so the
        // caller can tell when a re-query with a higher limit is needed.
        const ACTIVE_SCAN_LIMIT = 500;
        const allActive = await runQuery<Note[]>(Q.notesListActive, { limit: ACTIVE_SCAN_LIMIT });
        const byId = new Map<string, Note>();
        for (const n of allActive) byId.set(n.noteId ?? n._id, n);
        const matched = edges
          .map((e) => byId.get(e.noteId))
          .filter((n): n is Note => Boolean(n));
        const truncationNote =
          allActive.length >= ACTIVE_SCAN_LIMIT
            ? ` — WARNING: scanned only the most recent ${ACTIVE_SCAN_LIMIT} active notes; older notes attached to this file may not be shown`
            : "";
        return {
          content: [
            { type: "text", text: formatNotes(matched) },
            {
              type: "text",
              text: `\n(${matched.length} active notes attached to ${path}; ${edges.length} edges total${truncationNote})`,
            },
          ],
        };
      }),
  );
}
