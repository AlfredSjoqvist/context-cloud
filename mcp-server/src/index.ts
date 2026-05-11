#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerFindingsTools } from "./tools/findings.js";
import { registerNotesTools } from "./tools/notes.js";

const SERVER_NAME = "hindsight";
const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = `Hindsight surfaces an org's coding-agent memory to editors.

Tools:
- list_findings(status, limit?): Guardian findings by lifecycle status
- get_findings_for_file(path): active Guardian findings on a file
- list_notes(limit?): active Note-Manager notes (lessons distilled from past sessions)
- get_notes_for_file(path): notes attached to a file (the same notes NM injects at session start)

All tools are read-only against the Convex deployment configured via HINDSIGHT_CONVEX_URL
(or CONVEX_URL). They never mutate. NM capture and Guardian's own write paths are out of band.
`;

async function main(): Promise<void> {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerFindingsTools(server);
  registerNotesTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // The transport keeps the process alive on stdin. Surface unhandled rejections
  // so a misbehaving tool doesn't silently hang the server.
  process.on("unhandledRejection", (err) => {
    process.stderr.write(`[hindsight-mcp] unhandledRejection: ${String(err)}\n`);
  });
}

main().catch((err) => {
  process.stderr.write(`[hindsight-mcp] fatal: ${String(err)}\n`);
  process.exit(1);
});
