import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, mkdtempSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { writeLeaf } from "./write-leaves.js";
import type { DocSource, ExtractedRule } from "../types.js";
import type { LibraryImportMap } from "../link/import-grep.js";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "write-leaves-test-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function makeSource(overrides: Partial<DocSource> = {}): DocSource {
  return {
    id: "srcid7890",
    kind: "markdown_dir",
    uri: "file:///docs/lodash",
    defaultScope: "library",
    defaultLibraryName: "lodash",
    codebaseRoot: "/codebase",
    outputRoot: "/out",
    ...overrides,
  };
}

function makeRule(text: string, overrides: Partial<ExtractedRule> = {}): ExtractedRule {
  return {
    id: `rule-${text.length}`,
    chunkId: "srcid7890:doc1#0",
    ruleText: text,
    modality: "must",
    category: "security",
    confidence: 0.7,
    citation: {
      sourceId: "srcid7890",
      chunkId: "srcid7890:doc1#0",
      anchorRef: "docs/lodash/security.md#a",
      originalText: "raw chunk text",
    },
    ...overrides,
  };
}

describe("writeLeaf", () => {
  it("writes a file at the expected path under the context-map root", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource(),
      rules: [makeRule("Files importing lodash MUST upgrade to 4.17.21.")],
      importMap: null,
      extractedAt: "2024-01-01T00:00:00.000Z",
      primaryDocPath: "docs/security.md",
    });

    expect(result.absolutePath).toBe(
      path.join(ctxRoot, "library", "lodash", "security.md"),
    );
    expect(existsSync(result.absolutePath)).toBe(true);
    expect(result.relativePath).toBe(path.join("library", "lodash", "security.md"));
    expect(result.ruleCount).toBe(1);
  });

  it("frontmatter contains scope, library, applies_to, source_id, chunk_id, extracted_at", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const importMap: LibraryImportMap = {
      library: "lodash",
      matches: [{ relativePath: "src/uses-lodash.ts", matchedLines: [1] }],
      globs: ["src/uses-lodash.ts"],
    };
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource(),
      rules: [makeRule("Files importing lodash MUST upgrade to 4.17.21.")],
      importMap,
      extractedAt: "2024-05-09T12:34:56.000Z",
      primaryDocPath: "docs/security.md",
    });
    const text = await fs.readFile(result.absolutePath, "utf8");
    expect(text).toMatch(/^---\n/);
    expect(text).toContain("scope: library");
    expect(text).toContain("library: lodash");
    expect(text).toContain('applies_to: ["src/uses-lodash.ts"]');
    expect(text).toContain("source_id: srcid7890");
    expect(text).toContain("chunk_id: srcid7890:doc1#0");
    expect(text).toContain("extracted_at: 2024-05-09T12:34:56.000Z");
  });

  it("body has '# Constraints — <lib>' heading", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource({ defaultLibraryName: "lodash" }),
      rules: [makeRule("Files importing lodash MUST upgrade.")],
      importMap: null,
      extractedAt: "2024-01-01T00:00:00.000Z",
    });
    const text = await fs.readFile(result.absolutePath, "utf8");
    expect(text).toContain("# Constraints — lodash");
  });

  it("body has a numbered list with one rule per line", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const rules = [
      makeRule("Files importing lodash MUST upgrade to 4.17.21 or later."),
      makeRule("Files importing lodash MUST NOT call _.template on user input."),
      makeRule("Files importing lodash SHOULD prefer Object.fromEntries."),
    ];
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource(),
      rules,
      importMap: null,
      extractedAt: "2024-01-01T00:00:00.000Z",
    });
    const text = await fs.readFile(result.absolutePath, "utf8");
    expect(text).toContain("1. Files importing lodash MUST upgrade to 4.17.21 or later.");
    expect(text).toContain("2. Files importing lodash MUST NOT call _.template on user input.");
    expect(text).toContain("3. Files importing lodash SHOULD prefer Object.fromEntries.");
  });

  it("each numbered body line is BYTE-IDENTICAL to its rule's text (verifyConstraintCite contract)", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const rules = [
      makeRule("Files importing lodash MUST upgrade to 4.17.21 or later."),
      makeRule("Files importing lodash MUST NOT call _.template on user-controlled input."),
    ];
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource(),
      rules,
      importMap: null,
      extractedAt: "2024-01-01T00:00:00.000Z",
    });
    const text = await fs.readFile(result.absolutePath, "utf8");
    const lines = text.split("\n");

    rules.forEach((rule, i) => {
      const expected = `${i + 1}. ${rule.ruleText}`;
      // Line must appear EXACTLY (byte-for-byte) somewhere in the file
      expect(lines).toContain(expected);
    });
  });

  it("falls back to default glob when importMap is null", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource(),
      rules: [makeRule("Files importing lodash MUST do something good.")],
      importMap: null,
      extractedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(result.appliesTo).toEqual(["src/**/*.{ts,tsx,js,mjs,cjs}"]);
    const text = await fs.readFile(result.absolutePath, "utf8");
    expect(text).toContain('applies_to: ["src/**/*.{ts,tsx,js,mjs,cjs}"]');
  });

  it("renders body without crashing when rules is empty", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource(),
      rules: [],
      importMap: null,
      extractedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(existsSync(result.absolutePath)).toBe(true);
    const text = await fs.readFile(result.absolutePath, "utf8");
    expect(text).toContain("# Constraints — lodash");
    expect(text).toContain("_No imperative rules were extracted");
    // No "1. " numbered line
    expect(text).not.toMatch(/^1\. /m);
  });

  it("emits source_url in frontmatter and a clickable URL line in ## Source when set", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource({
        sourceUrl: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
      }),
      rules: [makeRule("Files importing lodash MUST upgrade to 4.17.21.")],
      importMap: null,
      extractedAt: "2024-01-01T00:00:00.000Z",
    });
    const text = await fs.readFile(result.absolutePath, "utf8");
    expect(text).toContain(
      "source_url: https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
    );
    expect(text).toContain(
      "- URL: <https://github.com/advisories/GHSA-35jh-r3h4-6jhm>",
    );
  });

  it("omits source_url and URL line when sourceUrl is unset (fixture-backed)", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource(),
      rules: [makeRule("Files importing lodash MUST upgrade to 4.17.21.")],
      importMap: null,
      extractedAt: "2024-01-01T00:00:00.000Z",
    });
    const text = await fs.readFile(result.absolutePath, "utf8");
    expect(text).not.toContain("source_url:");
    expect(text).not.toMatch(/^- URL:/m);
  });

  it("merges importMap globs with additionalAppliesTo and dedupes", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const importMap: LibraryImportMap = {
      library: "lodash",
      matches: [{ relativePath: "src/lib/db.ts", matchedLines: [1] }],
      globs: ["src/lib/db.ts"],
    };
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource(),
      rules: [makeRule("Files importing lodash MUST upgrade to 4.17.21.")],
      importMap,
      additionalAppliesTo: [
        "src/api/payments/**", // path-convention
        "src/api/payments*",   // path-convention
        "src/lib/db.ts",       // duplicate of import-grep result — must dedupe
        "src/server.ts",       // reverse-ref
      ],
      extractedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(result.appliesTo).toEqual([
      "src/lib/db.ts",
      "src/api/payments/**",
      "src/api/payments*",
      "src/server.ts",
    ]);
  });

  it("uses additionalAppliesTo alone when importMap is null and additional is non-empty", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: makeSource(),
      rules: [makeRule("Routes MUST validate input.")],
      importMap: null,
      additionalAppliesTo: ["src/routes/payments/**", "src/routes/payments*"],
      extractedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(result.appliesTo).toEqual([
      "src/routes/payments/**",
      "src/routes/payments*",
    ]);
    // The default broad glob fallback must NOT fire when any signal is present.
    expect(result.appliesTo).not.toContain("src/**/*.{ts,tsx,js,mjs,cjs}");
  });

  it("uses srcid as title when defaultLibraryName is unset", async () => {
    const ctxRoot = path.join(workdir, "ctx");
    const noLibSource: DocSource = {
      id: "srcid7890",
      kind: "markdown_dir",
      uri: "file:///docs/raw",
      defaultScope: "module",
      codebaseRoot: "/codebase",
      outputRoot: "/out",
    };
    const result = await writeLeaf({
      contextMapRoot: ctxRoot,
      source: noLibSource,
      rules: [makeRule("Code MUST do the thing properly here.")],
      importMap: null,
      extractedAt: "2024-01-01T00:00:00.000Z",
      primaryDocPath: "docs/raw.md",
    });
    const text = await fs.readFile(result.absolutePath, "utf8");
    expect(text).toContain("# Constraints — srcid7890");
    // Should land under source/{id}/ not library/
    expect(result.relativePath).toBe(path.join("source", "srcid7890", "raw.md"));
  });
});
