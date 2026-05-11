/**
 * Tiny stderr logger for the MCP server. stdout is reserved for JSON-RPC, so all
 * diagnostics go to stderr where Claude Code / Cursor / Codex surface them.
 *
 * Disabled when HINDSIGHT_LOG=off. Default level=info. Set HINDSIGHT_LOG=debug
 * to also emit per-tool args + result counts.
 */

type Level = "debug" | "info" | "warn" | "error";

const RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function envLevel(): Level | "off" {
  const raw = (process.env.HINDSIGHT_LOG ?? "info").toLowerCase();
  if (raw === "off") return "off";
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

function ts(): string {
  return new Date().toISOString();
}

function format(level: Level, msg: string, fields?: Record<string, unknown>): string {
  const head = `[hindsight-mcp ${ts()} ${level}] ${msg}`;
  if (!fields || Object.keys(fields).length === 0) return head + "\n";
  const tail = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  return `${head} ${tail}\n`;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  const lvl = envLevel();
  if (lvl === "off") return;
  if (RANK[level] < RANK[lvl]) return;
  process.stderr.write(format(level, msg, fields));
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>): void => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>): void => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>): void => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>): void => emit("error", msg, fields),
};

export type CallResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function toolTimeoutMs(): number {
  const raw = process.env.HINDSIGHT_TOOL_TIMEOUT_MS;
  if (!raw) return 15_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 15_000;
}

/**
 * Wrap an MCP tool handler with timing + structured error capture. On throw, returns a
 * tool result with `isError: true` and the message — the editor sees the failure rather
 * than an opaque transport error, and the cause lands on stderr for debugging.
 *
 * Also enforces a per-call timeout (HINDSIGHT_TOOL_TIMEOUT_MS, default 15s). A slow
 * Convex query won't hang the editor indefinitely — instead it returns isError with
 * "tool.timeout" so the agent / user can retry or move on.
 */
export async function safe(
  name: string,
  args: Record<string, unknown>,
  fn: () => Promise<CallResult>,
): Promise<CallResult> {
  const t0 = Date.now();
  log.debug("tool.call", { name, args });
  const timeoutMs = toolTimeoutMs();
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`tool.timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    const out = await Promise.race([fn(), timeoutPromise]);
    log.info("tool.ok", { name, ms: Date.now() - t0 });
    return out;
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    log.error("tool.fail", { name, ms: Date.now() - t0, error: msg });
    return {
      content: [{ type: "text", text: `error calling ${name}: ${msg}` }],
      isError: true,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
