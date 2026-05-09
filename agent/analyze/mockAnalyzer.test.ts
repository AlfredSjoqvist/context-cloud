import { describe, it, expect } from "vitest";
import { mockAnalyzeFile } from "./mockAnalyzer";

describe("mockAnalyzeFile", () => {
  it("returns the CSRF drift finding for the login route", async () => {
    const findings = await mockAnalyzeFile("src/routes/login.ts");
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.category).toBe("intent_drift");
    expect(f.constraintCite.mdFile).toContain("login-constraints");
    expect(f.constraintCite.text.toLowerCase()).toContain("csrf");
  });

  it("returns the sliding-TTL drift finding for db.ts", async () => {
    const findings = await mockAnalyzeFile("src/lib/db.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.constraintCite.text.toLowerCase()).toContain(
      "inactivity"
    );
  });

  it("returns no findings for files without a planted issue", async () => {
    const findings = await mockAnalyzeFile("src/middleware/auth.ts");
    expect(findings).toEqual([]);
  });
});
