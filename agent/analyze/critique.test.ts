import { describe, it, expect, vi } from "vitest";
import { critiqueFinding } from "./critique";
import type { Finding } from "./types";

const FINDING: Finding = {
  path: "src/routes/login.ts",
  severity: "high",
  category: "intent_drift",
  codeCite: { line: 1, excerpt: "router.post(\"/login\", handler)" },
  constraintCite: {
    mdFile: ".context-map/leaves/login-constraints.md",
    line: 1,
    text: "All authentication endpoints MUST verify CSRF token.",
  },
  reasoning: "missing requireCsrfToken middleware",
  suggestedFixDirection: "add the middleware",
};

describe("critiqueFinding", () => {
  it("keeps the finding when the LLM returns confident=true", async () => {
    const callLLM = vi.fn(async () => ({ confident: true, reason: "obvious mismatch" }));
    const result = await critiqueFinding({ finding: FINDING, callLLM });
    expect(result.keep).toBe(true);
  });

  it("drops the finding when the LLM returns confident=false", async () => {
    const callLLM = vi.fn(async () => ({ confident: false, reason: "could be middleware applied elsewhere" }));
    const result = await critiqueFinding({ finding: FINDING, callLLM });
    expect(result.keep).toBe(false);
    expect(result.keep ? "" : result.reason).toContain("middleware applied elsewhere");
  });

  it("drops the finding when the LLM call throws", async () => {
    const callLLM = vi.fn(async () => {
      throw new Error("rate limit");
    });
    const result = await critiqueFinding({ finding: FINDING, callLLM });
    expect(result.keep).toBe(false);
  });
});
