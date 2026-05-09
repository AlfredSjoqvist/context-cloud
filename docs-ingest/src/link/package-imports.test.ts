import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { readCodebaseDeps } from "./package-imports.js";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "pkg-imports-test-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

async function writePackageJson(contents: object): Promise<void> {
  await fs.writeFile(
    path.join(workdir, "package.json"),
    JSON.stringify(contents, null, 2),
    "utf8",
  );
}

describe("readCodebaseDeps", () => {
  it("returns runtime, dev, and merged 'all' Set correctly", async () => {
    await writePackageJson({
      name: "demo",
      dependencies: { lodash: "4.17.20", express: "4.19.2" },
      devDependencies: { typescript: "5.4.0" },
    });

    const deps = await readCodebaseDeps(workdir);
    expect(deps.packageName).toBe("demo");
    expect(deps.runtime).toEqual({ lodash: "4.17.20", express: "4.19.2" });
    expect(deps.dev).toEqual({ typescript: "5.4.0" });
    expect(deps.all instanceof Set).toBe(true);
    expect(deps.all.has("lodash")).toBe(true);
    expect(deps.all.has("express")).toBe(true);
    expect(deps.all.has("typescript")).toBe(true);
    expect(deps.all.size).toBe(3);
  });

  it("handles missing dependencies field (returns empty runtime)", async () => {
    await writePackageJson({
      name: "no-runtime",
      devDependencies: { vitest: "2.1.5" },
    });

    const deps = await readCodebaseDeps(workdir);
    expect(deps.runtime).toEqual({});
    expect(deps.dev).toEqual({ vitest: "2.1.5" });
    expect(deps.all.has("vitest")).toBe(true);
    expect(deps.all.size).toBe(1);
  });

  it("handles missing devDependencies field (returns empty dev)", async () => {
    await writePackageJson({
      name: "no-dev",
      dependencies: { zod: "3.23.8" },
    });

    const deps = await readCodebaseDeps(workdir);
    expect(deps.runtime).toEqual({ zod: "3.23.8" });
    expect(deps.dev).toEqual({});
  });

  it("handles totally empty package.json (no name, no deps)", async () => {
    await writePackageJson({});
    const deps = await readCodebaseDeps(workdir);
    expect(deps.packageName).toBeUndefined();
    expect(deps.runtime).toEqual({});
    expect(deps.dev).toEqual({});
    expect(deps.all.size).toBe(0);
  });

  it("merges peerDependencies and optionalDependencies into 'all'", async () => {
    await writePackageJson({
      name: "with-peer",
      dependencies: { a: "1.0.0" },
      peerDependencies: { react: "18.0.0" },
      optionalDependencies: { fsevents: "2.0.0" },
    });
    const deps = await readCodebaseDeps(workdir);
    expect(deps.all.has("a")).toBe(true);
    expect(deps.all.has("react")).toBe(true);
    expect(deps.all.has("fsevents")).toBe(true);
  });

  it("throws when package.json is missing", async () => {
    await expect(readCodebaseDeps(workdir)).rejects.toThrow();
  });
});
