import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Live e2e test — boots the server pointed at a real Convex deployment and
 * calls get_status end-to-end. Skipped automatically when
 * HINDSIGHT_LIVE_CONVEX_URL is unset, so this is safe to enable in CI
 * without provisioning a deployment.
 *
 * Run locally with:
 *   HINDSIGHT_LIVE_CONVEX_URL=https://your-deployment.convex.cloud npx vitest run server.live
 */

const liveUrl = process.env.HINDSIGHT_LIVE_CONVEX_URL;
const SKIP = !liveUrl;
const SKIP_REASON = SKIP ? "HINDSIGHT_LIVE_CONVEX_URL not set; live test skipped" : "";

const distEntry = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

type RpcResponse = { jsonrpc: "2.0"; id: number | string; result?: unknown; error?: { code: number; message: string } };

let proc: ChildProcess | null = null;
let buf = "";
const pending = new Map<number, (r: RpcResponse) => void>();
let nextId = 1;

function dispatch(line: string): void {
  let r: RpcResponse;
  try {
    r = JSON.parse(line) as RpcResponse;
  } catch {
    return;
  }
  if (typeof r.id !== "number") return;
  const cb = pending.get(r.id);
  if (cb) {
    pending.delete(r.id);
    cb(r);
  }
}

async function call(method: string, params: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<RpcResponse> {
  if (!proc) throw new Error("not started");
  const id = nextId++;
  const promise = new Promise<RpcResponse>((res, rej) => {
    pending.set(id, res);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rej(new Error(`rpc ${method} (id=${id}) timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
  });
  proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return promise;
}

beforeAll(() => {
  if (SKIP) return;
  proc = spawn("node", [distEntry], {
    env: { ...process.env, HINDSIGHT_CONVEX_URL: liveUrl, HINDSIGHT_LOG: "off" },
  });
  proc.stdout?.on("data", (d: Buffer) => {
    buf += d.toString();
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) dispatch(line);
      nl = buf.indexOf("\n");
    }
  });
});

afterAll(() => {
  proc?.kill();
  proc = null;
});

describe.skipIf(SKIP)("live convex round-trip", () => {
  it.runIf(!SKIP)(
    `get_status returns a populated server.identity + finding counts (${SKIP_REASON || "live"})`,
    async () => {
      await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "live", version: "0" } });
      const r = await call("tools/call", { name: "get_status", arguments: {} });
      expect(r.error).toBeUndefined();
      const result = r.result as { content: { type: string; text: string }[]; isError?: boolean };
      expect(result.isError).not.toBe(true);
      const text = result.content[0]?.text ?? "";
      expect(text).toMatch(/^hindsight-mcp v\d+\.\d+\.\d+/);
      expect(text).toContain(liveUrl!);
      // Every finding row should appear (count may be 0)
      for (const status of [
        "detected",
        "devin_running",
        "pr_open",
        "verifying",
        "resolved",
        "reopened_sharpened",
        "escalated",
      ]) {
        expect(text).toContain(status);
      }
      // Note count line must be present and either a number or ERR
      expect(text).toMatch(/active notes:\s+(\d+|ERR)/);
    },
    30_000,
  );
});
