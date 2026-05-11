import { describe, it, expect } from "vitest";
import {
  mergeMcpServer,
  buildEntry,
  buildClaudeCodeHooks,
  mergeClaudeCodeHooks,
  isHindsightCommand,
  NM_CAPTURE_CMD,
  NM_INJECT_CMD,
} from "./installLib.js";

describe("buildEntry", () => {
  it("omits env when convexUrl is null", () => {
    expect(buildEntry("/a/b.js", null)).toEqual({ command: "node", args: ["/a/b.js"] });
  });
  it("includes HINDSIGHT_CONVEX_URL when convexUrl is provided", () => {
    expect(buildEntry("/a/b.js", "https://x.convex.cloud")).toEqual({
      command: "node",
      args: ["/a/b.js"],
      env: { HINDSIGHT_CONVEX_URL: "https://x.convex.cloud" },
    });
  });
});

describe("mergeMcpServer", () => {
  it("adds an entry when mcpServers does not exist", () => {
    const out = mergeMcpServer({}, "hindsight", { command: "node", args: ["/a/b.js"] });
    expect(out).toEqual({
      mcpServers: { hindsight: { command: "node", args: ["/a/b.js"] } },
    });
  });

  it("preserves unrelated entries", () => {
    const base = {
      mcpServers: { other: { command: "python", args: ["x.py"] } },
      unrelated: { keep: true },
    };
    const out = mergeMcpServer(base, "hindsight", { command: "node", args: ["/a/b.js"] });
    expect(out.unrelated).toEqual({ keep: true });
    expect((out.mcpServers as Record<string, unknown>).other).toEqual({
      command: "python",
      args: ["x.py"],
    });
    expect((out.mcpServers as Record<string, unknown>).hindsight).toEqual({
      command: "node",
      args: ["/a/b.js"],
    });
  });

  it("overwrites an existing hindsight entry idempotently", () => {
    const base = {
      mcpServers: { hindsight: { command: "node", args: ["/old.js"], env: { OLD: "1" } } },
    };
    const out = mergeMcpServer(base, "hindsight", {
      command: "node",
      args: ["/new.js"],
      env: { NEW: "1" },
    });
    expect((out.mcpServers as Record<string, unknown>).hindsight).toEqual({
      command: "node",
      args: ["/new.js"],
      env: { NEW: "1" },
    });
  });

  it("treats a non-object mcpServers value as empty", () => {
    const base = { mcpServers: "garbage" as unknown };
    const out = mergeMcpServer(base, "hindsight", { command: "node", args: ["/a/b.js"] });
    expect(out.mcpServers).toEqual({
      hindsight: { command: "node", args: ["/a/b.js"] },
    });
  });
});

describe("isHindsightCommand", () => {
  it("matches both NM scripts", () => {
    expect(isHindsightCommand(NM_CAPTURE_CMD)).toBe(true);
    expect(isHindsightCommand(NM_INJECT_CMD)).toBe(true);
    expect(isHindsightCommand("python C:/Users/Alfred/nm_capture.py")).toBe(true);
    expect(isHindsightCommand("/usr/bin/env python3 nm_inject.py")).toBe(true);
  });
  it("does not match unrelated commands", () => {
    expect(isHindsightCommand("node hook.js")).toBe(false);
    expect(isHindsightCommand("dippy")).toBe(false);
    expect(isHindsightCommand("python3 other_script.py")).toBe(false);
  });
});

describe("buildClaudeCodeHooks", () => {
  it("emits all five events with the canonical NM commands", () => {
    const h = buildClaudeCodeHooks();
    expect(Object.keys(h).sort()).toEqual(
      ["PostToolUse", "PreToolUse", "Stop", "SubagentStop", "UserPromptSubmit"].sort(),
    );
    expect(h.UserPromptSubmit[0].hooks[0].command).toBe(NM_CAPTURE_CMD);
    expect(h.PreToolUse[0].matcher).toBe("Read|Edit|Write|MultiEdit");
    expect(h.PreToolUse[0].hooks[0].command).toBe(NM_INJECT_CMD);
  });
});

describe("mergeClaudeCodeHooks", () => {
  it("creates the hooks block when none exists", () => {
    const out = mergeClaudeCodeHooks({}) as { hooks: Record<string, unknown> };
    expect(out.hooks).toBeDefined();
    const events = Object.keys(out.hooks);
    expect(events.sort()).toEqual(
      ["PostToolUse", "PreToolUse", "Stop", "SubagentStop", "UserPromptSubmit"].sort(),
    );
  });

  it("preserves unrelated hook entries on the same event", () => {
    const base = {
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "dippy" }] },
        ],
      },
    };
    const out = mergeClaudeCodeHooks(base) as { hooks: { PreToolUse: { matcher?: string; hooks: { command: string }[] }[] } };
    const entries = out.hooks.PreToolUse;
    expect(entries).toHaveLength(2);
    expect(entries[0].hooks[0].command).toBe("dippy");
    expect(entries[1].hooks[0].command).toBe(NM_INJECT_CMD);
  });

  it("strips stale NM entries before adding fresh ones (idempotent)", () => {
    const base = {
      hooks: {
        PreToolUse: [
          { matcher: "Read|Edit", hooks: [{ type: "command", command: "python C:/old/nm_inject.py" }] },
          { matcher: "Bash", hooks: [{ type: "command", command: "dippy" }] },
        ],
        PostToolUse: [{ hooks: [{ type: "command", command: "python /old/nm_capture.py" }] }],
      },
    };
    const out = mergeClaudeCodeHooks(base) as { hooks: { PreToolUse: unknown[]; PostToolUse: unknown[] } };
    // PreToolUse: dippy kept, stale inject stripped, fresh inject appended
    expect(out.hooks.PreToolUse).toHaveLength(2);
    const preCmds = (out.hooks.PreToolUse as { hooks: { command: string }[] }[]).map((e) => e.hooks[0].command);
    expect(preCmds).toContain("dippy");
    expect(preCmds).toContain(NM_INJECT_CMD);
    expect(preCmds).not.toContain("python C:/old/nm_inject.py");
    // PostToolUse: stale stripped, fresh appended (so length 1, not 2)
    expect(out.hooks.PostToolUse).toHaveLength(1);
    expect((out.hooks.PostToolUse as { hooks: { command: string }[] }[])[0].hooks[0].command).toBe(NM_CAPTURE_CMD);
  });

  it("running twice produces the same result", () => {
    const once = mergeClaudeCodeHooks({});
    const twice = mergeClaudeCodeHooks(once);
    expect(twice).toEqual(once);
  });
});
