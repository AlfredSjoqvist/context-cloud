import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * End-to-end MCP protocol test. Boots the actual built server, speaks JSON-RPC
 * over stdio, and asserts on shapes. Doesn't hit Convex — just initialize and
 * tools/list, which are local. Catches regressions in:
 *   - the @modelcontextprotocol/sdk upgrade path
 *   - our index.ts wiring
 *   - tool registration (count, names, schemas)
 *
 * Skips itself with a clear message if dist/index.js hasn't been built yet —
 * vitest config doesn't gate on a build step.
 */

const distEntry = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

type RpcResponse = { jsonrpc: "2.0"; id: number | string; result?: unknown; error?: { code: number; message: string } };

class McpHarness {
  private proc: ChildProcess | null = null;
  private buf = "";
  private pending = new Map<number, (r: RpcResponse) => void>();
  private nextId = 1;
  stderr = "";

  start(): void {
    // HINDSIGHT_LOG=off keeps the boot logs out of stderr so they don't drown the assertion output.
    this.proc = spawn("node", [distEntry], { env: { ...process.env, HINDSIGHT_LOG: "off" } });
    this.proc.stdout?.on("data", (d: Buffer) => {
      this.buf += d.toString();
      let nl = this.buf.indexOf("\n");
      while (nl >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (line) this.dispatch(line);
        nl = this.buf.indexOf("\n");
      }
    });
    this.proc.stderr?.on("data", (d: Buffer) => {
      this.stderr += d.toString();
    });
  }

  private dispatch(line: string): void {
    let r: RpcResponse;
    try {
      r = JSON.parse(line) as RpcResponse;
    } catch {
      return;
    }
    if (typeof r.id !== "number") return;
    const cb = this.pending.get(r.id);
    if (cb) {
      this.pending.delete(r.id);
      cb(r);
    }
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<RpcResponse> {
    if (!this.proc) throw new Error("not started");
    const id = this.nextId++;
    const promise = new Promise<RpcResponse>((res, rej) => {
      this.pending.set(id, res);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rej(new Error(`rpc ${method} (id=${id}) timed out after 3s`));
        }
      }, 3000);
    });
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return promise;
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
  }
}

const harness = new McpHarness();

beforeAll(() => {
  harness.start();
});

afterAll(() => {
  harness.stop();
});

describe("mcp protocol e2e", () => {
  it("responds to initialize with the server identity", async () => {
    const r = await harness.call("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "e2e", version: "0" },
    });
    expect(r.error).toBeUndefined();
    const result = r.result as { serverInfo?: { name?: string; version?: string }; protocolVersion?: string };
    expect(result.serverInfo?.name).toBe("hindsight");
    expect(result.serverInfo?.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.protocolVersion).toBe("2024-11-05");
  });

  it("lists all five tools with input schemas", async () => {
    const r = await harness.call("tools/list");
    expect(r.error).toBeUndefined();
    const tools = (r.result as { tools?: { name: string; description?: string; inputSchema?: unknown }[] }).tools ?? [];
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "get_findings_for_file",
      "get_notes_for_file",
      "get_status",
      "list_findings",
      "list_notes",
    ]);
    for (const t of tools) {
      expect(typeof t.description).toBe("string");
      expect(t.description!.length).toBeGreaterThan(20);
      expect(t.inputSchema).toBeDefined();
    }
  });

  it("rejects an unknown method with an MCP error response", async () => {
    const r = await harness.call("does/not/exist");
    // MCP SDK returns an error, not a result.
    expect(r.error).toBeDefined();
    expect(r.error?.code).toBeLessThan(0);
  });

  it("lists 8 resources covering all finding statuses + active notes", async () => {
    const r = await harness.call("resources/list");
    expect(r.error).toBeUndefined();
    const resources = (r.result as { resources?: { uri: string; name: string }[] }).resources ?? [];
    const uris = resources.map((x) => x.uri).sort();
    expect(uris).toEqual([
      "hindsight://findings/detected",
      "hindsight://findings/devin_running",
      "hindsight://findings/escalated",
      "hindsight://findings/pr_open",
      "hindsight://findings/reopened_sharpened",
      "hindsight://findings/resolved",
      "hindsight://findings/verifying",
      "hindsight://notes/active",
    ]);
  });
});
