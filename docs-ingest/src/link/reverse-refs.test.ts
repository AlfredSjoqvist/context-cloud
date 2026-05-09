import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  scanReverseReferences,
  selectReferencingSourceFiles,
} from "./reverse-refs.js";

let tmp: string;

async function writeFile(rel: string, content: string): Promise<void> {
  const full = path.join(tmp, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "revref-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("scanReverseReferences", () => {
  it("finds @see JSDoc references", async () => {
    await writeFile(
      "src/api/payments.ts",
      `
/**
 * Payment routes.
 * @see docs/api/payments.md
 */
export const router = {};
`,
    );
    const refs = await scanReverseReferences(tmp);
    expect(refs).toEqual([
      {
        sourceFile: "src/api/payments.ts",
        docRef: "docs/api/payments.md",
        docBasename: "payments.md",
      },
    ]);
  });

  it("finds // see, // ref, // doc inline comments", async () => {
    await writeFile(
      "src/middleware/csrf.ts",
      [
        "// see csrf-policy.md",
        "// ref: docs/csrf-deep-dive.md",
        "// doc: docs/security/notes.md",
        "export const csrf = () => {};",
      ].join("\n"),
    );
    const refs = await scanReverseReferences(tmp);
    expect(refs.map((r) => r.docRef).sort()).toEqual([
      "csrf-policy.md",
      "docs/csrf-deep-dive.md",
      "docs/security/notes.md",
    ]);
  });

  it("finds star-comment lines (block comment continuation)", async () => {
    await writeFile(
      "src/server.ts",
      [
        "/*",
        " * see helmet-tips.md",
        " */",
        "export const server = {};",
      ].join("\n"),
    );
    const refs = await scanReverseReferences(tmp);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.docRef).toBe("helmet-tips.md");
  });

  it("dedupes repeat references in the same file", async () => {
    await writeFile(
      "src/dup.ts",
      [
        "// @see same.md",
        "// @see same.md",
        "// see same.md",
      ].join("\n"),
    );
    const refs = await scanReverseReferences(tmp);
    // Two distinct patterns matched, but only one (file, docRef) pair survives.
    expect(refs).toHaveLength(1);
    expect(refs[0]?.docRef).toBe("same.md");
  });

  it("ignores non-code files and node_modules", async () => {
    await writeFile("src/keep.ts", "// @see keep.md");
    await writeFile("src/skip.txt", "// @see skip.md");
    await writeFile(
      "src/node_modules/dep/index.ts",
      "// @see vendor.md",
    );
    const refs = await scanReverseReferences(tmp);
    expect(refs.map((r) => r.docRef).sort()).toEqual(["keep.md"]);
  });

  it("returns an empty array when the search dir doesn't exist", async () => {
    const refs = await scanReverseReferences(tmp, { searchDir: "no-such-dir" });
    expect(refs).toEqual([]);
  });
});

describe("selectReferencingSourceFiles", () => {
  it("matches by basename so paths and bare names both work", () => {
    const refs = [
      {
        sourceFile: "src/a.ts",
        docRef: "docs/api/payments.md",
        docBasename: "payments.md",
      },
      { sourceFile: "src/b.ts", docRef: "payments.md", docBasename: "payments.md" },
      { sourceFile: "src/c.ts", docRef: "other.md", docBasename: "other.md" },
    ];
    expect(
      selectReferencingSourceFiles(refs, ["payments.md"]).sort(),
    ).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("returns an empty array when no doc names are provided", () => {
    const refs = [
      {
        sourceFile: "src/a.ts",
        docRef: "x.md",
        docBasename: "x.md",
      },
    ];
    expect(selectReferencingSourceFiles(refs, [])).toEqual([]);
  });
});
