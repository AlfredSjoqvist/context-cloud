#!/usr/bin/env node
/**
 * hindsight-mcp-install — write the MCP server entry into a supported editor's config.
 *
 * Supported editors (JSON configs only for now; TOML editors like Codex print the snippet to paste):
 *   - cursor       ~/.cursor/mcp.json
 *   - claude-code  ~/.claude.json  (mcpServers key)
 *   - claude-code-project  ./.mcp.json (project-scoped)
 *
 * Usage:
 *   npx hindsight-mcp-install --editor cursor
 *   npx hindsight-mcp-install --editor claude-code --convex-url https://x.convex.cloud
 *   npx hindsight-mcp-install --print --editor cursor      # dry-run, just print the JSON
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

type EditorKey = "cursor" | "claude-code" | "claude-code-project";

type ParsedArgs = {
  editor: EditorKey | null;
  convexUrl: string | null;
  serverPath: string | null;
  print: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { editor: null, convexUrl: null, serverPath: null, print: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--print") out.print = true;
    else if (a === "--editor") out.editor = argv[++i] as EditorKey;
    else if (a === "--convex-url") out.convexUrl = argv[++i] ?? null;
    else if (a === "--server-path") out.serverPath = argv[++i] ?? null;
  }
  return out;
}

function configPathFor(editor: EditorKey): string {
  switch (editor) {
    case "cursor":
      return join(homedir(), ".cursor", "mcp.json");
    case "claude-code":
      return join(homedir(), ".claude.json");
    case "claude-code-project":
      return resolvePath(process.cwd(), ".mcp.json");
  }
}

function defaultServerPath(): string {
  // dist/install.js -> dist/index.js (sibling)
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "index.js");
}

type ServerEntry = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

function buildEntry(serverPath: string, convexUrl: string | null): ServerEntry {
  const env: Record<string, string> = {};
  if (convexUrl) env.HINDSIGHT_CONVEX_URL = convexUrl;
  return {
    command: "node",
    args: [serverPath],
    ...(Object.keys(env).length ? { env } : {}),
  };
}

function readJsonOrEmpty(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${path} as JSON: ${(err as Error).message}`);
  }
}

function mergeMcpServer(config: Record<string, unknown>, name: string, entry: ServerEntry): Record<string, unknown> {
  const next = { ...config };
  const existing = (next.mcpServers && typeof next.mcpServers === "object" ? next.mcpServers : {}) as Record<
    string,
    unknown
  >;
  next.mcpServers = { ...existing, [name]: entry };
  return next;
}

function printHelp(): void {
  process.stdout.write(
    `hindsight-mcp-install — wire Hindsight MCP server into an editor

Usage:
  hindsight-mcp-install --editor <cursor|claude-code|claude-code-project> [options]

Options:
  --convex-url <url>     Set HINDSIGHT_CONVEX_URL env on the server entry.
  --server-path <path>   Override path to dist/index.js (defaults to this install's dist/index.js).
  --print                Dry-run: print the merged JSON config to stdout instead of writing.
  --help                 Show this help.

Examples:
  hindsight-mcp-install --editor cursor --convex-url https://example.convex.cloud
  hindsight-mcp-install --editor claude-code-project --print
`,
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.editor) {
    printHelp();
    if (!args.editor && !args.help) process.exit(1);
    return;
  }

  const serverPath = args.serverPath ?? defaultServerPath();
  const entry = buildEntry(serverPath, args.convexUrl);
  const target = configPathFor(args.editor);
  const current = readJsonOrEmpty(target);
  const merged = mergeMcpServer(current, "hindsight", entry);

  if (args.print) {
    process.stdout.write(
      `# Would write to: ${target}\n${JSON.stringify(merged, null, 2)}\n`,
    );
    return;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  process.stdout.write(`Wrote hindsight MCP server entry to ${target}\n`);
}

main();
