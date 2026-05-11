#!/usr/bin/env node
/**
 * hindsight-mcp-install — write Hindsight integration into a supported editor's config.
 *
 * Two things get written:
 *   1. The MCP server entry (mcpServers.hindsight) — into Cursor / Claude Code config.
 *   2. (Optional, --with-hooks, Claude Code only) The PreToolUse / PostToolUse hooks
 *      that wire nm_capture.py and nm_inject.py into the editor.
 *
 * Supported editors:
 *   - cursor               MCP only. ~/.cursor/mcp.json
 *   - claude-code          MCP to ~/.claude.json ; hooks to ~/.claude/settings.json
 *   - claude-code-project  MCP to ./.mcp.json    ; hooks to ./.claude/settings.json
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEntry, mergeMcpServer, mergeClaudeCodeHooks, findScriptRoot, renderCodexToml } from "./installLib.js";

type EditorKey = "cursor" | "claude-code" | "claude-code-project" | "codex";

type ParsedArgs = {
  editor: EditorKey | null;
  convexUrl: string | null;
  serverPath: string | null;
  hindsightRoot: string | null;
  withHooks: boolean;
  print: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    editor: null,
    convexUrl: null,
    serverPath: null,
    hindsightRoot: null,
    withHooks: false,
    print: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--print") out.print = true;
    else if (a === "--with-hooks") out.withHooks = true;
    else if (a === "--editor") out.editor = argv[++i] as EditorKey;
    else if (a === "--convex-url") out.convexUrl = argv[++i] ?? null;
    else if (a === "--server-path") out.serverPath = argv[++i] ?? null;
    else if (a === "--hindsight-root") out.hindsightRoot = argv[++i] ?? null;
  }
  return out;
}

function mcpConfigPathFor(editor: EditorKey): string {
  switch (editor) {
    case "cursor":
      return join(homedir(), ".cursor", "mcp.json");
    case "claude-code":
      return join(homedir(), ".claude.json");
    case "claude-code-project":
      return resolvePath(process.cwd(), ".mcp.json");
    case "codex":
      return join(homedir(), ".codex", "config.toml");
  }
}

function hooksConfigPathFor(editor: EditorKey): string | null {
  switch (editor) {
    case "cursor":
    case "codex":
      return null;
    case "claude-code":
      return join(homedir(), ".claude", "settings.json");
    case "claude-code-project":
      return resolvePath(process.cwd(), ".claude", "settings.json");
  }
}

function defaultServerPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "index.js");
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

function printHelp(): void {
  process.stdout.write(
    `hindsight-mcp-install — wire Hindsight into an editor

Usage:
  hindsight-mcp-install --editor <cursor|claude-code|claude-code-project|codex> [options]

Editors:
  cursor               JSON merge into ~/.cursor/mcp.json
  claude-code          JSON merge into ~/.claude.json (MCP); ~/.claude/settings.json (hooks)
  claude-code-project  JSON merge into ./.mcp.json (MCP); ./.claude/settings.json (hooks)
  codex                TOML snippet for ~/.codex/config.toml (print-only, no auto-merge)

Options:
  --convex-url <url>     Set HINDSIGHT_CONVEX_URL env on the MCP server entry.
  --server-path <path>   Override path to dist/index.js (defaults to this install's dist/index.js).
  --with-hooks           Also write Claude Code hooks (PreToolUse + PostToolUse + ...). Claude Code only.
  --hindsight-root <p>   Override the context-cloud root used for absolute hook paths.
                         Only relevant for --editor claude-code (user-scope). Auto-detected
                         by default by walking up from this install's location.
  --print                Dry-run: print the merged JSON to stdout instead of writing.
  --help                 Show this help.

Examples:
  hindsight-mcp-install --editor cursor
  hindsight-mcp-install --editor claude-code --with-hooks --convex-url https://x.convex.cloud
  hindsight-mcp-install --editor claude-code-project --with-hooks --print
`,
  );
}

function writeOrPrint(target: string, merged: Record<string, unknown>, print: boolean, label: string): void {
  if (print) {
    process.stdout.write(`# ${label}: would write to ${target}\n${JSON.stringify(merged, null, 2)}\n\n`);
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  process.stdout.write(`Wrote ${label} to ${target}\n`);
}

function main(): void {
  try {
    runInstall();
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message ?? String(err)}\n`);
    process.exit(4);
  }
}

function runInstall(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.editor) {
    printHelp();
    if (!args.editor && !args.help) process.exit(1);
    return;
  }

  if (args.withHooks && (args.editor === "cursor" || args.editor === "codex")) {
    process.stderr.write(
      `error: --with-hooks is only supported for claude-code and claude-code-project. ${args.editor} has no equivalent hook surface.\n`,
    );
    process.exit(2);
  }

  const serverPath = args.serverPath ?? defaultServerPath();

  // Codex uses TOML, not JSON. We emit a snippet to paste — auto-merging TOML
  // loses comments / ordering, and there's no canonical way to detect a prior
  // hindsight block without a real parser. The snippet is unambiguous and
  // safe to paste at the end of ~/.codex/config.toml.
  if (args.editor === "codex") {
    const snippet = renderCodexToml(serverPath, args.convexUrl);
    const target = mcpConfigPathFor(args.editor);
    process.stdout.write(`# Codex MCP entry — append to ${target}\n${snippet}`);
    return;
  }

  const entry = buildEntry(serverPath, args.convexUrl);

  const mcpTarget = mcpConfigPathFor(args.editor);
  const mcpCurrent = readJsonOrEmpty(mcpTarget);
  const mcpMerged = mergeMcpServer(mcpCurrent, "hindsight", entry);
  writeOrPrint(mcpTarget, mcpMerged, args.print, "MCP server config");

  if (args.withHooks) {
    const hooksTarget = hooksConfigPathFor(args.editor);
    if (!hooksTarget) throw new Error(`hooks not supported for editor=${args.editor}`);

    // Project-scope: relative paths work (cwd=project at hook time).
    // User-scope: absolute paths required (cwd=whatever-project-the-user-opened).
    let scriptRoot: string | null = null;
    if (args.editor === "claude-code") {
      scriptRoot = args.hindsightRoot ?? findScriptRoot(dirname(fileURLToPath(import.meta.url)));
      if (!scriptRoot) {
        process.stderr.write(
          "error: user-scoped --with-hooks needs absolute paths to nm_capture.py / nm_inject.py.\n" +
            "Could not auto-detect the context-cloud root from this install location.\n" +
            "Pass --hindsight-root /absolute/path/to/context-cloud\n",
        );
        process.exit(3);
      }
    }

    const hooksCurrent = readJsonOrEmpty(hooksTarget);
    const hooksMerged = mergeClaudeCodeHooks(hooksCurrent, scriptRoot);
    writeOrPrint(hooksTarget, hooksMerged, args.print, "Claude Code hooks");
  }
}

main();
