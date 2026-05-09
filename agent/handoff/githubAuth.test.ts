import { describe, it, expect } from "vitest";
import { PatAuth } from "./githubAuth";

describe("PatAuth", () => {
  it("returns an Octokit instance authenticated with the PAT", async () => {
    const auth = new PatAuth("ghp_dummy");
    const octokit = await auth.forRepo("owner", "repo");
    expect(typeof octokit.rest.issues.create).toBe("function");
    expect(typeof octokit.rest.pulls.get).toBe("function");
  });
});
