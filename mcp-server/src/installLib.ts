/**
 * Pure helpers for hindsight-mcp-install. Kept separate from install.ts so unit tests
 * can import without triggering the CLI's main() at import time.
 */

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

/** Canonical Hindsight Claude Code hooks block. Relative paths — Claude Code runs hooks with cwd=project. */
export function buildClaudeCodeHooks(): Record<HookEvent, HookEntry[]> {
  const captureEntry: HookEntry = { hooks: [{ type: "command", command: NM_CAPTURE_CMD }] };
  const injectEntry: HookEntry = {
    matcher: NM_INJECT_MATCHER,
    hooks: [{ type: "command", command: NM_INJECT_CMD }],
  };
  return {
    UserPromptSubmit: [captureEntry],
    PostToolUse: [captureEntry],
    Stop: [captureEntry],
    SubagentStop: [captureEntry],
    PreToolUse: [injectEntry],
  };
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
 * canonical block. Preserves all unrelated hooks.
 */
export function mergeClaudeCodeHooks(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  const existing = (next.hooks && typeof next.hooks === "object" ? next.hooks : {}) as Record<string, unknown>;
  const fresh = buildClaudeCodeHooks();
  const merged: Record<string, unknown> = { ...existing };

  for (const event of Object.keys(fresh) as HookEvent[]) {
    const existingEntries = Array.isArray(existing[event]) ? (existing[event] as unknown[]) : [];
    const cleaned = existingEntries.filter((e) => !entryReferencesHindsight(e));
    merged[event] = [...cleaned, ...fresh[event]];
  }

  next.hooks = merged;
  return next;
}
