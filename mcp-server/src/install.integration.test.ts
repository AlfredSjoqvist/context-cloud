import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * End-to-end install/uninstall round-trip against a temp working directory.
 * Drives the dist/install.js bin as a subprocess (which is how users actually
 * invoke it) and asserts on the resulting files. Covers the project-scope
 * Claude Code flow because it writes both .mcp.json and .claude/settings.json,
 * exercising the most code paths.
 */

const distInstall = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist", "install.js");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "install-integ-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function runInstall(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const r = spawnSync("node", [distInstall, ...args], { cwd: tmp, encoding: "utf-8" });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

describe("install → uninstall round-trip", () => {
  it("creates expected files on install, removes them cleanly on uninstall", () => {
    const installR = runInstall([
      "--editor",
      "claude-code-project",
      "--with-hooks",
      "--convex-url",
      "https://test.convex.cloud",
    ]);
    expect(installR.status).toBe(0);
    expect(existsSync(join(tmp, ".mcp.json"))).toBe(true);
    expect(existsSync(join(tmp, ".claude", "settings.json"))).toBe(true);

    const mcp = JSON.parse(readFileSync(join(tmp, ".mcp.json"), "utf-8"));
    expect(mcp.mcpServers.hindsight).toBeDefined();
    expect(mcp.mcpServers.hindsight.env.HINDSIGHT_CONVEX_URL).toBe("https://test.convex.cloud");

    const settings = JSON.parse(readFileSync(join(tmp, ".claude", "settings.json"), "utf-8"));
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("python3 nm_inject.py");
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe("python3 nm_capture.py");

    const uninstallR = runInstall(["--editor", "claude-code-project", "--uninstall"]);
    expect(uninstallR.status).toBe(0);
    // Cleanup: when hindsight was the only entry, the files are deleted (not left as {}).
    expect(existsSync(join(tmp, ".mcp.json"))).toBe(false);
    expect(existsSync(join(tmp, ".claude", "settings.json"))).toBe(false);
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });

  it("preserves unrelated entries through install + uninstall", () => {
    // Pre-seed an unrelated mcp server
    const prePath = join(tmp, ".mcp.json");
    const seedConfig = { mcpServers: { other: { command: "echo", args: ["hi"] } } };
    require("node:fs").writeFileSync(prePath, JSON.stringify(seedConfig));

    runInstall(["--editor", "claude-code-project", "--convex-url", "https://x.convex.cloud"]);
    const mid = JSON.parse(readFileSync(prePath, "utf-8"));
    expect(mid.mcpServers.other).toEqual({ command: "echo", args: ["hi"] });
    expect(mid.mcpServers.hindsight).toBeDefined();

    runInstall(["--editor", "claude-code-project", "--uninstall"]);
    const after = JSON.parse(readFileSync(prePath, "utf-8"));
    expect(after.mcpServers.other).toEqual({ command: "echo", args: ["hi"] });
    expect(after.mcpServers.hindsight).toBeUndefined();
  });

  it("--uninstall against an empty dir doesn't create files", () => {
    const r = runInstall(["--editor", "claude-code-project", "--uninstall"]);
    expect(r.status).toBe(0);
    expect(existsSync(join(tmp, ".mcp.json"))).toBe(false);
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });
});
