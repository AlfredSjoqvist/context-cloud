#!/usr/bin/env node
/**
 * hindsight-mcp-verify — quick health check for an installed Hindsight MCP server.
 *
 * Doesn't speak MCP. Just does what tools would do: resolves CONVEX_URL, runs one
 * read-only query against each registered Convex function reference, prints OK + ms
 * per check, or a structured error + remediation. Exits non-zero if anything fails,
 * so it can be wired into CI.
 *
 * Usage:
 *   HINDSIGHT_CONVEX_URL=https://x.convex.cloud hindsight-mcp-verify
 *   hindsight-mcp-verify --convex-url https://x.convex.cloud
 *   hindsight-mcp-verify --timeout 5000
 */
import { ConvexHttpClient } from "convex/browser";

type Args = { convexUrl: string | null; timeoutMs: number; json: boolean; help: boolean };

function parseArgs(argv: string[]): Args {
  const out: Args = { convexUrl: null, timeoutMs: 10_000, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--convex-url") out.convexUrl = argv[++i] ?? null;
    else if (a === "--timeout") out.timeoutMs = Number(argv[++i] ?? "10000");
  }
  return out;
}

type Check = { name: string; ref: string; args: unknown };

const CHECKS: Check[] = [
  { name: "findings:byStatus", ref: "findings:byStatus", args: { status: "detected" } },
  { name: "notes:listActive", ref: "notes:listActive", args: { limit: 1 } },
  { name: "notes:listEdgesForPath", ref: "notes:listEdgesForPath", args: { path: "verify-probe.ts" } },
  { name: "cycles:latestCycle", ref: "cycles:latestCycle", args: {} },
];

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function printHelp(): void {
  process.stdout.write(
    `hindsight-mcp-verify — health-check an installed Hindsight MCP server

Usage:
  hindsight-mcp-verify [--convex-url <url>] [--timeout <ms>] [--json]

Reads HINDSIGHT_CONVEX_URL (or CONVEX_URL) and runs one read-only query per
Convex function reference the MCP server uses. Exits 0 on full success.
`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const url = args.convexUrl ?? process.env.HINDSIGHT_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!url) {
    process.stderr.write(
      "error: no Convex URL configured. Set HINDSIGHT_CONVEX_URL (or CONVEX_URL), or pass --convex-url.\n",
    );
    process.exit(2);
  }

  if (!args.json) {
    process.stdout.write(`hindsight-mcp-verify\n  convex: ${url}\n  timeout: ${args.timeoutMs}ms\n\n`);
  }

  const client = new ConvexHttpClient(url);
  const results: { name: string; ref: string; ok: boolean; ms: number; shape?: string; error?: string }[] = [];

  for (const check of CHECKS) {
    const t0 = Date.now();
    try {
      const result: unknown = await withTimeout(
        client.query(check.ref as never, check.args as never),
        args.timeoutMs,
        check.name,
      );
      const ms = Date.now() - t0;
      let shape: string;
      if (Array.isArray(result)) shape = `rows=${result.length}`;
      else if (result === null) shape = "null";
      else if (typeof result === "object") shape = "object";
      else shape = "scalar";
      results.push({ name: check.name, ref: check.ref, ok: true, ms, shape });
      if (!args.json) {
        process.stdout.write(`  ✓ ${check.name.padEnd(28)}  ${String(ms).padStart(4)}ms  (${shape})\n`);
      }
    } catch (err) {
      const ms = Date.now() - t0;
      const msg = (err as Error).message || String(err);
      results.push({ name: check.name, ref: check.ref, ok: false, ms, error: msg });
      if (!args.json) {
        process.stdout.write(`  ✗ ${check.name.padEnd(28)}  ${String(ms).padStart(4)}ms  ${msg}\n`);
      }
    }
  }

  const failed = results.filter((r) => !r.ok).length;

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ convexUrl: url, timeoutMs: args.timeoutMs, results, failed, passed: results.length - failed }, null, 2) +
        "\n",
    );
    if (failed > 0) process.exit(1);
    return;
  }

  if (failed > 0) {
    process.stderr.write(
      `\n${failed}/${CHECKS.length} check(s) failed.\n` +
        `Common causes:\n` +
        `  - CONVEX_URL points at *.convex.site (HTTP-action surface) instead of *.convex.cloud (query surface)\n` +
        `  - the Convex deployment is missing the referenced query (backend renamed or deleted)\n` +
        `  - the deployment is sleeping; first request can take ~10s\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`\nall ${CHECKS.length} check(s) passed.\n`);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).message ?? String(err)}\n`);
  process.exit(1);
});
