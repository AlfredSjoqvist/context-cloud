import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConvexClient, Q } from "../convex.js";
import { safe } from "../log.js";

type Note = {
  _id: string;
  noteId?: string;
  body?: string;
  summary?: string;
  createdAt?: number;
  invalidatedAt?: number;
  injectCount?: number;
};

type NoteEdge = {
  noteId: string;
  path: string;
  weight?: number;
};

function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function formatNotes(notes: Note[]): string {
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
        const client = getConvexClient();
        const rows = (await client.query(Q.notesListActive as never, { limit: limit ?? 50 } as never)) as Note[];
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
        const client = getConvexClient();
        const edges = (await client.query(Q.notesListEdgesForPath as never, { path } as never)) as NoteEdge[];
        if (edges.length === 0) {
          return { content: [{ type: "text", text: `No NM notes attached to ${path}.` }] };
        }
        const allActive = (await client.query(Q.notesListActive as never, { limit: 500 } as never)) as Note[];
        const byId = new Map<string, Note>();
        for (const n of allActive) byId.set(n.noteId ?? n._id, n);
        const matched = edges
          .map((e) => byId.get(e.noteId))
          .filter((n): n is Note => Boolean(n));
        return {
          content: [
            { type: "text", text: formatNotes(matched) },
            { type: "text", text: `\n(${matched.length} active notes attached to ${path}; ${edges.length} edges total)` },
          ],
        };
      }),
  );
}
