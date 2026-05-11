#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerFindingsTools } from "./tools/findings.js";
import { registerNotesTools } from "./tools/notes.js";
import { registerStatusTool } from "./tools/status.js";
import { registerFindingsResources } from "./resources/findings.js";
import { registerNotesResource } from "./resources/notes.js";
import { log } from "./log.js";

const SERVER_NAME = "hindsight";
const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = `Hindsight surfaces an org's coding-agent memory to editors.

Tools:
- get_status(): one-shot health + summary (Convex URL + finding + note counts)
- list_findings(status, limit?): Guardian findings by lifecycle status
- get_findings_for_file(path): active Guardian findings on a file
- list_notes(limit?): active Note-Manager notes (lessons distilled from past sessions)
- get_notes_for_file(path): notes attached to a file (the same notes NM injects at session start)

All tools are read-only against the Convex deployment configured via HINDSIGHT_CONVEX_URL
(or CONVEX_URL). They never mutate. NM capture and Guardian's own write paths are out of band.

Resources (alternative to tools — editors that prefer browsing):
- hindsight://findings/<status>   one per lifecycle state
- hindsight://notes/active        the 100 most recent active NM notes
`;

async function main(): Promise<void> {
  const convexUrl = process.env.HINDSIGHT_CONVEX_URL ?? process.env.CONVEX_URL ?? "<unset>";
  log.info("boot", { version: SERVER_VERSION, convex: convexUrl, logLevel: process.env.HINDSIGHT_LOG ?? "info" });

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerFindingsTools(server);
  registerNotesTools(server);
  registerStatusTool(server);
  registerFindingsResources(server);
  registerNotesResource(server);
  log.debug("tools.registered", { tools: 5, resources: 8 });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("ready", { transport: "stdio" });

  process.on("unhandledRejection", (err) => {
    log.error("unhandledRejection", { error: String(err) });
  });
}

main().catch((err) => {
  log.error("fatal", { error: (err as Error).message ?? String(err) });
  process.exit(1);
});
