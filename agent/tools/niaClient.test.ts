import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { createNiaClient } from "./niaClient";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "nia-test-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("niaClient (filesystem fallback)", () => {
  it("readFile returns file contents from the filesystem when SKIP_NIA is true", async () => {
    mkdirSync(join(workdir, "src"));
    writeFileSync(join(workdir, "src/login.ts"), "export const x = 1;\n");

    const nia = createNiaClient({
      skipNia: true,
      mcpUrl: "https://invalid",
      apiKey: "k",
      filesystemRoot: workdir,
    });

    const body = await nia.readFile("src/login.ts");
    expect(body).toBe("export const x = 1;\n");
  });

  it("verifyConstraintCite is true when the line text matches", async () => {
    mkdirSync(join(workdir, "leaves"));
    writeFileSync(
      join(workdir, "leaves/login-constraints.md"),
      "# Constraints\n\n1. Must verify CSRF token\n2. Must rate limit\n",
    );

    const nia = createNiaClient({
      skipNia: true,
      mcpUrl: "https://invalid",
      apiKey: "k",
      filesystemRoot: workdir,
    });

    const ok = await nia.verifyConstraintCite(
      "leaves/login-constraints.md",
      3,
      "1. Must verify CSRF token",
    );
    expect(ok).toBe(true);
  });

  it("verifyConstraintCite is false when the line text does not match", async () => {
    mkdirSync(join(workdir, "leaves"));
    writeFileSync(
      join(workdir, "leaves/login-constraints.md"),
      "# Constraints\n\n1. Must verify CSRF token\n",
    );

    const nia = createNiaClient({
      skipNia: true,
      mcpUrl: "https://invalid",
      apiKey: "k",
      filesystemRoot: workdir,
    });

    const ok = await nia.verifyConstraintCite(
      "leaves/login-constraints.md",
      3,
      "Must rate limit",
    );
    expect(ok).toBe(false);
  });
});
