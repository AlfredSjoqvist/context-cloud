import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import { createIssueForFinding } from "./github";
import type { GithubAuth } from "./githubAuth";
import type { Finding } from "../analyze/types";

const FINDING: Finding = {
  path: "src/routes/login.ts",
  severity: "high",
  category: "intent_drift",
  codeCite: { line: 42, excerpt: "router.post(\"/login\", handler)" },
  constraintCite: {
    mdFile: ".context-map/leaves/login-constraints.md",
    line: 3,
    text: "1. All authentication endpoints MUST verify CSRF token via the `requireCsrfToken` middleware.",
  },
  reasoning: "Login route is mounted without the CSRF middleware required by the constraint.",
  suggestedFixDirection: "Add `requireCsrfToken` to the route mount.",
};

function makeMockAuth(create: ReturnType<typeof vi.fn>): GithubAuth {
  return {
    async forRepo() {
      return {
        rest: {
          issues: {
            create,
          },
        },
      } as unknown as Octokit;
    },
  };
}

describe("createIssueForFinding", () => {
  it("calls octokit issues.create with a structured body and returns the issue number", async () => {
    const create = vi.fn(async () => ({ data: { number: 42 } }));
    const auth = makeMockAuth(create);

    const result = await createIssueForFinding({
      auth,
      owner: "alice",
      repo: "demo",
      finding: FINDING,
      cycleNumber: 7,
    });

    expect(result).toEqual({ issueNumber: 42 });
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(args.owner).toBe("alice");
    expect(args.repo).toBe("demo");
    expect(args.title).toContain("intent_drift");
    expect(args.body).toContain(FINDING.constraintCite.text);
    expect(args.body).toContain("src/routes/login.ts:42");
    expect(args.body).toContain("cycle 7");
    expect(args.labels).toEqual(["guardian", "intent_drift", "severity:high"]);
  });
});
