import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for the original integration bug: the committed
 * .claude/settings.json had `python C:/Users/Alfred/Desktop/nozomio/nm_*.py`
 * paths that didn't resolve on macOS / Linux, so every NM hook silently
 * no-op'd. Claude Code swallows hook errors, and so do the scripts, so the
 * bug was invisible.
 *
 * This test extracts every hook command from .claude/settings.json, parses
 * out any `.py` reference, and asserts the file actually exists on disk.
 * It runs across platforms and would have caught the original bug at CI time.
 */

type HookCommand = { command?: unknown };
type HookEntry = { hooks?: unknown };
type Settings = { hooks?: Record<string, unknown> };

function repoRoot(): string {
  // this file: <repo>/mcp-server/src/settingsPaths.test.ts
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..");
}

function commandsFromSettings(settings: Settings): string[] {
  const out: string[] = [];
  const hooks = settings.hooks ?? {};
  for (const event of Object.keys(hooks)) {
    const entries = hooks[event];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries as HookEntry[]) {
      const inner = entry?.hooks;
      if (!Array.isArray(inner)) continue;
      for (const h of inner as HookCommand[]) {
        if (typeof h?.command === "string") out.push(h.command);
      }
    }
  }
  return out;
}

function extractPyTokens(cmd: string): string[] {
  // Split on whitespace; collect every token that ends in .py. Avoids over-clever
  // shell parsing — we just need to find the script reference.
  return cmd
    .split(/\s+/)
    .map((t) => t.replace(/^["']|["']$/g, ""))
    .filter((t) => t.toLowerCase().endsWith(".py"));
}

describe(".claude/settings.json hook commands", () => {
  const settingsPath = resolve(repoRoot(), ".claude", "settings.json");

  it("exists and is valid JSON", () => {
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Settings;
    expect(settings.hooks).toBeDefined();
  });

  it("every .py path referenced in hooks resolves on disk", () => {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Settings;
    const commands = commandsFromSettings(settings);
    expect(commands.length).toBeGreaterThan(0);

    const missing: { command: string; resolved: string }[] = [];
    for (const cmd of commands) {
      for (const pyToken of extractPyTokens(cmd)) {
        const absolute = pyToken.startsWith("/")
          ? pyToken
          : resolve(repoRoot(), pyToken);
        if (!existsSync(absolute)) {
          missing.push({ command: cmd, resolved: absolute });
        }
      }
    }
    if (missing.length > 0) {
      const detail = missing.map((m) => `  - "${m.command}" → ${m.resolved}`).join("\n");
      throw new Error(
        `.claude/settings.json references .py script(s) that do not exist on disk:\n${detail}\n\n` +
          "This is the same class of bug as the original Windows-path issue. " +
          "Use a path that resolves cross-platform (relative to cwd, since Claude Code runs hooks with cwd=project root).",
      );
    }
  });

  it("no hook command uses a hardcoded Windows drive path", () => {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Settings;
    const commands = commandsFromSettings(settings);
    const windows = commands.filter((c) => /[A-Za-z]:[\\\/]/.test(c));
    expect(windows).toEqual([]);
  });
});
