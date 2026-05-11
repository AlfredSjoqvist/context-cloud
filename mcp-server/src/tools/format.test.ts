import { describe, it, expect } from "vitest";
import { formatFindings, type Finding } from "./findings.js";
import { formatNotes, truncate, type Note } from "./notes.js";

describe("formatFindings", () => {
  it("renders 'No findings.' for an empty array", () => {
    expect(formatFindings([])).toBe("No findings.");
  });

  it("renders a fully populated finding with nested code/constraint citations", () => {
    const f: Finding = {
      _id: "abc123",
      status: "detected",
      path: "agent/main.ts",
      codeCite: { line: 42, excerpt: "process.env.API_KEY" },
      severity: "high",
      category: "secrets",
      reasoning: "leaks API key",
      constraintCite: { mdFile: "context/auth.md", line: 17, text: "..." },
      githubIssueNumber: 42,
    };
    const out = formatFindings([f]);
    expect(out).toBe(
      "- agent/main.ts:42 [high] secrets — leaks API key (cites context/auth.md:17) — status=detected issue=#42, id=abc123",
    );
  });

  it("handles missing optional fields gracefully", () => {
    const f: Finding = { _id: "x", status: "pr_open" };
    const out = formatFindings([f]);
    expect(out).toBe("- ? — (no reasoning) — status=pr_open, id=x");
  });

  it("joins multiple findings with newlines", () => {
    const out = formatFindings([
      { _id: "a", status: "detected", path: "a.ts", codeCite: { line: 1 }, reasoning: "first issue" },
      { _id: "b", status: "detected", path: "b.ts", codeCite: { line: 2 }, reasoning: "second issue" },
    ]);
    expect(out.split("\n")).toHaveLength(2);
    expect(out).toContain("first issue");
    expect(out).toContain("second issue");
  });

  it("truncates long reasoning at 140 chars", () => {
    const long = "x".repeat(200);
    const out = formatFindings([{ _id: "z", status: "detected", path: "p.ts", reasoning: long }]);
    // 200 chars of x → truncated to 139 chars + ellipsis = 140 chars total
    const reasoning = out.match(/— (x+…)/)?.[1];
    expect(reasoning).toBeDefined();
    expect(reasoning!.length).toBe(140);
  });
});

describe("truncate", () => {
  it("returns empty string for undefined", () => {
    expect(truncate(undefined, 10)).toBe("");
  });
  it("returns string unchanged when shorter than n", () => {
    expect(truncate("hi", 10)).toBe("hi");
  });
  it("returns string unchanged when exactly n", () => {
    expect(truncate("1234567890", 10)).toBe("1234567890");
  });
  it("truncates with ellipsis at n-1 when longer than n", () => {
    expect(truncate("12345678901", 10)).toBe("123456789…");
    expect(truncate("12345678901", 10).length).toBe(10);
  });
});

describe("formatNotes", () => {
  it("renders 'No notes.' for an empty array", () => {
    expect(formatNotes([])).toBe("No notes.");
  });

  it("prefers noteId over _id, summary over body, and shows inject count when present", () => {
    const n: Note = {
      _id: "internalId",
      noteId: "humanId",
      body: "long body that should not be shown",
      summary: "short summary",
      injectCount: 5,
    };
    const out = formatNotes([n]);
    expect(out).toBe("- humanId injects=5: short summary");
  });

  it("falls back to _id and body when noteId / summary are absent", () => {
    expect(formatNotes([{ _id: "fallback", body: "the body" }])).toBe("- fallback: the body");
  });

  it("truncates long bodies at 200 chars", () => {
    const longBody = "x".repeat(300);
    const out = formatNotes([{ _id: "z", body: longBody }]);
    // line format: "- z: " (5 chars) + truncated body (200 chars including trailing …)
    expect(out.length).toBe(5 + 200);
    expect(out.endsWith("…")).toBe(true);
  });
});
