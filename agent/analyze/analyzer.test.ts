import { describe, it, expect, vi } from "vitest";
import { analyzeFile } from "./analyzer";
import type { NiaClient } from "../tools/niaClient";

const FILE_BODY = "router.post(\"/login\", handler);\n";

const niaStub: NiaClient = {
  async readFile() {
    return FILE_BODY;
  },
  async searchContext() {
    return [
      {
        path: ".context-map/leaves/login-constraints.md",
        line: 1,
        excerpt: "All authentication endpoints MUST verify CSRF token.",
      },
    ];
  },
  async searchCode() {
    return [];
  },
  async recentDiff() {
    return "";
  },
  async verifyConstraintCite() {
    return true;
  },
};

describe("analyzeFile", () => {
  it("returns findings parsed from the LLM structured output", async () => {
    const callLLM = vi.fn(async () => ({
      findings: [
        {
          severity: "high" as const,
          category: "intent_drift" as const,
          codeCite: { line: 1, excerpt: "router.post(\"/login\", handler)" },
          constraintCite: {
            mdFile: ".context-map/leaves/login-constraints.md",
            line: 1,
            text: "All authentication endpoints MUST verify CSRF token.",
          },
          reasoning: "no csrf middleware",
          suggestedFixDirection: "add it",
        },
      ],
    }));

    const findings = await analyzeFile("src/routes/login.ts", niaStub, callLLM);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.path).toBe("src/routes/login.ts");
    expect(findings[0]!.category).toBe("intent_drift");
  });

  it("returns empty when the LLM returns no findings", async () => {
    const callLLM = vi.fn(async () => ({ findings: [] }));
    const findings = await analyzeFile("src/routes/login.ts", niaStub, callLLM);
    expect(findings).toEqual([]);
  });

  it("returns empty when the LLM call throws", async () => {
    const callLLM = vi.fn(async () => {
      throw new Error("rate limit");
    });
    const findings = await analyzeFile("src/routes/login.ts", niaStub, callLLM);
    expect(findings).toEqual([]);
  });
});
