import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConvexClient, Q } from "../convex.js";
import { log } from "../log.js";
import { formatNotes, type Note } from "../tools/notes.js";

const NOTES_LIMIT = 100;

/**
 * Expose the most recent active NM notes as a single browseable resource at
 * hindsight://notes/active. Capped at 100 to keep payload small — editors that
 * need more can still call list_notes(limit=...). The cap is reported in the
 * trailing line so callers can tell when they're hitting it.
 */
export function registerNotesResource(server: McpServer): void {
  server.registerResource(
    "notes-active",
    "hindsight://notes/active",
    {
      title: "Active NM notes",
      description: `The ${NOTES_LIMIT} most recent active Note-Manager notes.`,
      mimeType: "text/plain",
    },
    async (uri) => {
      const t0 = Date.now();
      try {
        const client = getConvexClient();
        const rows = (await client.query(Q.notesListActive as never, { limit: NOTES_LIMIT } as never)) as Note[];
        log.info("resource.ok", { uri: uri.href, ms: Date.now() - t0, rows: rows.length });
        const trunc = rows.length >= NOTES_LIMIT ? " (scan limit)" : "";
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: formatNotes(rows) + `\n\n(${rows.length} active notes${trunc})`,
            },
          ],
        };
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        log.error("resource.fail", { uri: uri.href, ms: Date.now() - t0, error: msg });
        return {
          contents: [{ uri: uri.href, mimeType: "text/plain", text: `error reading ${uri.href}: ${msg}` }],
        };
      }
    },
  );
}
