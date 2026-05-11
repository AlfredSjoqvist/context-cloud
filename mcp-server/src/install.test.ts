import { describe, it, expect } from "vitest";

// Re-implement just the pure merge logic so the test exercises it without
// process.exit / filesystem touches. Keep this in sync with install.ts.
function mergeMcpServer(
  config: Record<string, unknown>,
  name: string,
  entry: { command: string; args: string[]; env?: Record<string, string> },
): Record<string, unknown> {
  const next = { ...config };
  const existing = (next.mcpServers && typeof next.mcpServers === "object" ? next.mcpServers : {}) as Record<
    string,
    unknown
  >;
  next.mcpServers = { ...existing, [name]: entry };
  return next;
}

describe("mergeMcpServer", () => {
  it("adds an entry when mcpServers does not exist", () => {
    const out = mergeMcpServer({}, "hindsight", { command: "node", args: ["/a/b.js"] });
    expect(out).toEqual({
      mcpServers: { hindsight: { command: "node", args: ["/a/b.js"] } },
    });
  });

  it("preserves unrelated entries", () => {
    const base = {
      mcpServers: {
        other: { command: "python", args: ["x.py"] },
      },
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
      mcpServers: {
        hindsight: { command: "node", args: ["/old.js"], env: { OLD: "1" } },
      },
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
