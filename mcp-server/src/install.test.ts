import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mergeMcpServer,
  removeMcpServer,
  buildEntry,
  buildNmEntry,
  buildClaudeCodeHooks,
  mergeClaudeCodeHooks,
  removeClaudeCodeHooks,
  isHindsightCommand,
  findScriptRoot,
  renderCodexToml,
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

  it("uses absolute paths when scriptRoot is provided", () => {
    const h = buildClaudeCodeHooks("/opt/hindsight");
    expect(h.UserPromptSubmit[0].hooks[0].command).toBe("python3 /opt/hindsight/nm_capture.py");
    expect(h.PreToolUse[0].hooks[0].command).toBe("python3 /opt/hindsight/nm_inject.py");
  });

  it("trims a trailing slash on scriptRoot", () => {
    const h = buildClaudeCodeHooks("/opt/hindsight/");
    expect(h.PostToolUse[0].hooks[0].command).toBe("python3 /opt/hindsight/nm_capture.py");
  });
});

describe("findScriptRoot", () => {
  it("returns null when neither script exists in any ancestor", () => {
    const tmp = mkdtempSync(join(tmpdir(), "find-root-"));
    try {
      // The /tmp ancestors definitely don't have nm_capture.py.
      expect(findScriptRoot(tmp)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("finds the directory containing both scripts", () => {
    const tmp = mkdtempSync(join(tmpdir(), "find-root-"));
    try {
      const root = join(tmp, "repo");
      mkdirSync(join(root, "nested", "deep"), { recursive: true });
      writeFileSync(join(root, "nm_capture.py"), "");
      writeFileSync(join(root, "nm_inject.py"), "");
      expect(findScriptRoot(join(root, "nested", "deep"))).toBe(root);
      expect(findScriptRoot(root)).toBe(root);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns null when only one of the two scripts exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "find-root-"));
    try {
      writeFileSync(join(tmp, "nm_capture.py"), "");
      // nm_inject.py intentionally missing
      expect(findScriptRoot(tmp)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
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

describe("removeMcpServer", () => {
  it("no-ops when the named entry is absent", () => {
    const base = { mcpServers: { other: { command: "x", args: [] } } };
    const out = removeMcpServer(base, "hindsight");
    expect(out.mcpServers).toEqual({ other: { command: "x", args: [] } });
  });
  it("removes the named entry, preserving others", () => {
    const base = {
      mcpServers: {
        hindsight: { command: "node", args: ["x.js"] },
        other: { command: "y", args: [] },
      },
    };
    const out = removeMcpServer(base, "hindsight");
    expect(out.mcpServers).toEqual({ other: { command: "y", args: [] } });
  });
  it("no-ops when mcpServers is absent or non-object", () => {
    expect(removeMcpServer({}, "hindsight")).toEqual({});
    expect(removeMcpServer({ mcpServers: "garbage" }, "hindsight")).toEqual({ mcpServers: "garbage" });
  });
});

describe("removeClaudeCodeHooks", () => {
  it("strips every entry that references nm scripts, preserves unrelated ones", () => {
    const base = {
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "dippy" }] },
          { matcher: "Read|Edit", hooks: [{ type: "command", command: NM_INJECT_CMD }] },
        ],
        PostToolUse: [{ hooks: [{ type: "command", command: NM_CAPTURE_CMD }] }],
      },
    };
    const out = removeClaudeCodeHooks(base) as { hooks: Record<string, unknown> };
    // PreToolUse: dippy survives, nm stripped
    expect((out.hooks.PreToolUse as { hooks: { command: string }[] }[]).length).toBe(1);
    expect((out.hooks.PreToolUse as { hooks: { command: string }[] }[])[0].hooks[0].command).toBe("dippy");
    // PostToolUse: only nm was there → key fully removed
    expect(out.hooks.PostToolUse).toBeUndefined();
  });
  it("no-ops when hooks is absent or non-object", () => {
    expect(removeClaudeCodeHooks({})).toEqual({});
    expect(removeClaudeCodeHooks({ hooks: null })).toEqual({ hooks: null });
  });
});

describe("buildNmEntry", () => {
  it("uses a relative path when scriptRoot is null", () => {
    expect(buildNmEntry(null)).toEqual({
      command: "python3",
      args: ["nm_server.py"],
    });
  });
  it("uses an absolute path when scriptRoot is set", () => {
    expect(buildNmEntry("/opt/hindsight")).toEqual({
      command: "python3",
      args: ["/opt/hindsight/nm_server.py"],
    });
  });
  it("trims a trailing slash on scriptRoot", () => {
    expect(buildNmEntry("/opt/hindsight/")).toEqual({
      command: "python3",
      args: ["/opt/hindsight/nm_server.py"],
    });
  });
});

describe("renderCodexToml", () => {
  it("emits the bare server block when no convexUrl is given", () => {
    const out = renderCodexToml("/opt/hindsight/dist/index.js", null);
    expect(out).toContain("[mcp_servers.hindsight]");
    expect(out).toContain('command = "node"');
    expect(out).toContain('args = ["/opt/hindsight/dist/index.js"]');
    expect(out).not.toContain("HINDSIGHT_CONVEX_URL");
    expect(out).not.toContain("[mcp_servers.hindsight.env]");
  });

  it("includes an env table when convexUrl is given", () => {
    const out = renderCodexToml("/opt/x.js", "https://x.convex.cloud");
    expect(out).toContain("[mcp_servers.hindsight.env]");
    expect(out).toContain('HINDSIGHT_CONVEX_URL = "https://x.convex.cloud"');
  });

  it("escapes backslashes and double-quotes in paths", () => {
    const out = renderCodexToml('C:\\path\\with "quote".js', null);
    expect(out).toContain('args = ["C:\\\\path\\\\with \\"quote\\".js"]');
  });

  it("terminates with a newline so concatenation with existing TOML is safe", () => {
    expect(renderCodexToml("/a.js", null).endsWith("\n")).toBe(true);
  });
});
