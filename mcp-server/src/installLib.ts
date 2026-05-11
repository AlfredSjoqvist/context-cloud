/**
 * Pure helpers for hindsight-mcp-install. Kept separate from install.ts so unit tests
 * can import without triggering the CLI's main() at import time.
 */
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

/**
 * Walk upward from `start` looking for nm_capture.py + nm_inject.py side-by-side.
 * Returns the absolute directory containing them, or null if not found.
 * Used to resolve absolute hook commands for user-scoped Claude Code installs.
 */
export function findScriptRoot(start: string): string | null {
  let cur = resolvePath(start);
  const root = resolvePath("/");
  while (true) {
    if (existsSync(resolvePath(cur, "nm_capture.py")) && existsSync(resolvePath(cur, "nm_inject.py"))) {
      return cur;
    }
    if (cur === root) return null;
    const next = dirname(cur);
    if (next === cur) return null;
    cur = next;
  }
}

export type ServerEntry = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export function buildEntry(serverPath: string, convexUrl: string | null): ServerEntry {
  const env: Record<string, string> = {};
  if (convexUrl) env.HINDSIGHT_CONVEX_URL = convexUrl;
  return {
    command: "node",
    args: [serverPath],
    ...(Object.keys(env).length ? { env } : {}),
  };
}

/**
 * Build an MCP server entry for the NM Python server. scriptRoot must be the
 * absolute path to the context-cloud root (the directory containing
 * nm_server.py). Project-scoped configs can pass null to use a relative path.
 */
export function buildNmEntry(scriptRoot: string | null): ServerEntry {
  const target = scriptRoot ? `${scriptRoot.replace(/\/$/, "")}/nm_server.py` : "nm_server.py";
  return {
    command: "python3",
    args: [target],
  };
}

export function mergeMcpServer(
  config: Record<string, unknown>,
  name: string,
  entry: ServerEntry,
): Record<string, unknown> {
  const next = { ...config };
  const existing = (next.mcpServers && typeof next.mcpServers === "object" ? next.mcpServers : {}) as Record<
    string,
    unknown
  >;
  next.mcpServers = { ...existing, [name]: entry };
  return next;
}

// ---------- Claude Code hooks ----------

export type HookCommand = { type: "command"; command: string; timeout?: number };
export type HookEntry = { matcher?: string; hooks: HookCommand[] };
export type HookEvent = "UserPromptSubmit" | "PostToolUse" | "Stop" | "SubagentStop" | "PreToolUse";

export const NM_CAPTURE_CMD = "python3 nm_capture.py";
export const NM_INJECT_CMD = "python3 nm_inject.py";
export const NM_INJECT_MATCHER = "Read|Edit|Write|MultiEdit";

/**
 * Build Hindsight's Claude Code hooks block.
 *
 * scriptRoot:
 *   null  → relative commands (`python3 nm_capture.py`). Use for project-scoped
 *           installs (./.claude/settings.json), where Claude Code runs hooks with
 *           cwd=context-cloud root and the relative path resolves.
 *   path  → absolute commands (`python3 /abs/path/nm_capture.py`). Use for
 *           user-scoped installs (~/.claude/settings.json), where Claude Code
 *           runs hooks with cwd=whatever-project-the-user-opened — a relative
 *           path would silently no-op (the bug we just fixed at the repo level).
 */
export function buildClaudeCodeHooks(scriptRoot: string | null = null): Record<HookEvent, HookEntry[]> {
  const capture = scriptRoot ? `python3 ${scriptRoot.replace(/\/$/, "")}/nm_capture.py` : NM_CAPTURE_CMD;
  const inject = scriptRoot ? `python3 ${scriptRoot.replace(/\/$/, "")}/nm_inject.py` : NM_INJECT_CMD;
  const captureEntry: HookEntry = { hooks: [{ type: "command", command: capture }] };
  const injectEntry: HookEntry = {
    matcher: NM_INJECT_MATCHER,
    hooks: [{ type: "command", command: inject }],
  };
  return {
    UserPromptSubmit: [captureEntry],
    PostToolUse: [captureEntry],
    Stop: [captureEntry],
    SubagentStop: [captureEntry],
    PreToolUse: [injectEntry],
  };
}

/**
 * Render a Codex CLI TOML snippet for the Hindsight MCP server. Codex expects
 * server entries under [mcp_servers.<name>] in ~/.codex/config.toml. We don't
 * auto-merge because TOML round-trips lose comments/ordering — we just emit a
 * snippet to append. Strings escape backslash and double-quote per TOML basic.
 */
export function renderCodexToml(serverPath: string, convexUrl: string | null): string {
  const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const lines: string[] = [
    "[mcp_servers.hindsight]",
    `command = "node"`,
    `args = ["${esc(serverPath)}"]`,
  ];
  if (convexUrl) {
    lines.push("", "[mcp_servers.hindsight.env]", `HINDSIGHT_CONVEX_URL = "${esc(convexUrl)}"`);
  }
  return lines.join("\n") + "\n";
}

export function isHindsightCommand(cmd: string): boolean {
  return cmd.includes("nm_capture.py") || cmd.includes("nm_inject.py");
}

function entryReferencesHindsight(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const hooks = (entry as { hooks?: unknown }).hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.some(
    (h) =>
      typeof h === "object" &&
      h !== null &&
      typeof (h as { command?: unknown }).command === "string" &&
      isHindsightCommand((h as { command: string }).command),
  );
}

/**
 * Merge Hindsight hook entries into an existing settings.json. Idempotent — strips any
 * pre-existing entries whose commands reference our scripts before appending the fresh
 * canonical block. Preserves all unrelated hooks. Pass scriptRoot for user-scoped installs
 * so the emitted commands use absolute paths to nm_capture.py / nm_inject.py.
 */
export function mergeClaudeCodeHooks(
  config: Record<string, unknown>,
  scriptRoot: string | null = null,
): Record<string, unknown> {
  const next = { ...config };
  const existing = (next.hooks && typeof next.hooks === "object" ? next.hooks : {}) as Record<string, unknown>;
  const fresh = buildClaudeCodeHooks(scriptRoot);
  const merged: Record<string, unknown> = { ...existing };

  for (const event of Object.keys(fresh) as HookEvent[]) {
    const existingEntries = Array.isArray(existing[event]) ? (existing[event] as unknown[]) : [];
    const cleaned = existingEntries.filter((e) => !entryReferencesHindsight(e));
    merged[event] = [...cleaned, ...fresh[event]];
  }

  next.hooks = merged;
  return next;
}
