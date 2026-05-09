import { describe, it, expect, vi } from "vitest";
import { verifyCitation } from "./citation";
import type { NiaClient } from "../tools/niaClient";
import type { Finding } from "./types";

const FILE_BODY = [
  "import { router } from \"./router\";",
  "",
  "router.post(\"/login\", handler);",
  "",
  "export {};",
].join("\n");

const FINDING: Finding = {
  path: "src/routes/login.ts",
  severity: "high",
  category: "intent_drift",
  codeCite: { line: 3, excerpt: "router.post(\"/login\", handler)" },
  constraintCite: {
    mdFile: ".context-map/leaves/login-constraints.md",
    line: 3,
    text: "All auth endpoints must verify CSRF.",
  },
  reasoning: "ok",
  suggestedFixDirection: "ok",
};

function makeNia(overrides: Partial<NiaClient> = {}): NiaClient {
  return {
    async readFile() {
      return FILE_BODY;
    },
    async verifyConstraintCite() {
      return true;
    },
    async searchCode() {
      return [];
    },
    async searchContext() {
      return [];
    },
    async recentDiff() {
      return "";
    },
    ...overrides,
  };
}

describe("verifyCitation", () => {
  it("passes when both code and constraint citations are accurate", async () => {
    const result = await verifyCitation({ finding: FINDING, nia: makeNia() });
    expect(result).toEqual({ ok: true });
  });

  it("fails when the cited code line does not contain the excerpt", async () => {
    const broken: Finding = {
      ...FINDING,
      codeCite: { line: 1, excerpt: "router.post(\"/login\", handler)" },
    };
    const result = await verifyCitation({ finding: broken, nia: makeNia() });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(/code/i);
  });

  it("fails when the constraint text is not in the .md file", async () => {
    const nia = makeNia({
      async verifyConstraintCite() {
        return false;
      },
    });
    const result = await verifyCitation({ finding: FINDING, nia });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(/constraint/i);
  });

  it("fails when the cited line number is out of range", async () => {
    const broken: Finding = { ...FINDING, codeCite: { line: 999, excerpt: "x" } };
    const result = await verifyCitation({ finding: broken, nia: makeNia() });
    expect(result.ok).toBe(false);
  });
});
