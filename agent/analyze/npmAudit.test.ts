import { describe, it, expect, vi } from "vitest";
import { auditPackageJson } from "./npmAudit";

const SAMPLE_AUDIT = JSON.stringify({
  vulnerabilities: {
    lodash: {
      name: "lodash",
      severity: "critical",
      via: [
        {
          source: 1094499,
          name: "lodash",
          dependency: "lodash",
          title: "Command Injection in lodash",
          url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
          severity: "critical",
          range: "<4.17.21",
        },
      ],
      effects: [],
      range: "<4.17.21",
      nodes: ["node_modules/lodash"],
      fixAvailable: { name: "lodash", version: "4.17.21", isSemVerMajor: false },
    },
  },
});

const PACKAGE_JSON = JSON.stringify(
  {
    name: "demo-target",
    dependencies: { lodash: "4.17.20" },
  },
  null,
  2,
);

describe("auditPackageJson", () => {
  it("turns each vulnerability into a Finding cited at package.json", async () => {
    const findings = await auditPackageJson({
      cwd: "/fake/demo",
      readPackageJson: async () => PACKAGE_JSON,
      runAudit: vi.fn(async () => SAMPLE_AUDIT),
    });

    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.path).toBe("package.json");
    expect(f.category).toBe("security");
    expect(f.severity).toBe("critical");
    expect(f.codeCite.excerpt).toContain("lodash");
    expect(f.constraintCite.mdFile).toBe("npm-audit");
    expect(f.constraintCite.text).toContain("Command Injection in lodash");
    expect(f.reasoning).toContain("CVE");
    expect(f.suggestedFixDirection).toContain("4.17.21");
  });

  it("returns an empty array when audit reports no vulnerabilities", async () => {
    const findings = await auditPackageJson({
      cwd: "/fake/demo",
      readPackageJson: async () => "{}",
      runAudit: async () => JSON.stringify({ vulnerabilities: {} }),
    });
    expect(findings).toEqual([]);
  });
});
