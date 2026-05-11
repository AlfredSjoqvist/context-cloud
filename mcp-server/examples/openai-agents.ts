/**
 * Example: use the Hindsight MCP server from the OpenAI Agents SDK (@openai/agents).
 *
 * The SDK has first-class MCP-over-stdio support via MCPServerStdio. Point it at the
 * built mcp-server entry, give it your CONVEX_URL via env, and Hindsight's findings +
 * notes are usable as agent tools.
 *
 * Run from the repo root after building both this package and ensuring you have
 * OPENAI_API_KEY set:
 *
 *   cd mcp-server && npm run build && cd ..
 *   OPENAI_API_KEY=... HINDSIGHT_CONVEX_URL=... \
 *     npx tsx mcp-server/examples/openai-agents.ts
 *
 * This is a documentation example. It's not built or linted by the mcp-server
 * tsconfig (excluded by the include glob); the comments below are the integration
 * recipe.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, run, MCPServerStdio } from "@openai/agents";

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const serverEntry = resolve(here, "..", "dist", "index.js");

  const hindsight = new MCPServerStdio({
    name: "hindsight",
    command: "node",
    args: [serverEntry],
    env: {
      HINDSIGHT_CONVEX_URL: process.env.HINDSIGHT_CONVEX_URL ?? "",
      HINDSIGHT_LOG: "off",
    },
  });

  await hindsight.connect();
  try {
    const agent = new Agent({
      name: "Hindsight Investigator",
      instructions:
        "You answer questions about an org's Guardian findings and Note-Manager notes. " +
        "Always call get_status first to know what's available, then use the more specific tools.",
      mcpServers: [hindsight],
    });

    const result = await run(agent, "Summarize the state of the codebase based on Hindsight.");
    process.stdout.write((result.finalOutput ?? "(no final output — agent didn't terminate cleanly)") + "\n");
  } finally {
    await hindsight.close();
  }
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).message ?? String(err)}\n`);
  process.exit(1);
});
