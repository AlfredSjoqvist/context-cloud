import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findImporters, buildLibraryImportMap } from "./import-grep.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// docs-ingest/fixtures/mini-codebase
const FIXTURE = path.resolve(here, "..", "..", "fixtures", "mini-codebase");

describe("findImporters", () => {
  it("finds files importing lodash (multiple importers)", async () => {
    const matches = await findImporters(FIXTURE, "lodash");
    const rels = matches.map((m) => m.relativePath).sort();
    // uses-lodash.ts, uses-both.ts, uses-subpath.ts, uses-require.ts all import lodash
    expect(rels).toContain(path.join("src", "uses-lodash.ts"));
    expect(rels).toContain(path.join("src", "uses-both.ts"));
    expect(rels).toContain(path.join("src", "uses-subpath.ts"));
    expect(rels).toContain(path.join("src", "uses-require.ts"));
    // no-imports.ts and uses-express.ts must NOT be in the result
    expect(rels).not.toContain(path.join("src", "no-imports.ts"));
    expect(rels).not.toContain(path.join("src", "uses-express.ts"));
  });

  it("returns an empty array for an unused library", async () => {
    const matches = await findImporters(FIXTURE, "zod");
    expect(matches).toEqual([]);
  });

  it("detects subpath imports like 'lodash/get'", async () => {
    const matches = await findImporters(FIXTURE, "lodash");
    const rels = matches.map((m) => m.relativePath);
    expect(rels).toContain(path.join("src", "uses-subpath.ts"));
  });

  it("detects require('lodash')", async () => {
    const matches = await findImporters(FIXTURE, "lodash");
    const rels = matches.map((m) => m.relativePath);
    expect(rels).toContain(path.join("src", "uses-require.ts"));
  });

  it("does NOT traverse node_modules (skipped dir)", async () => {
    const matches = await findImporters(FIXTURE, "lodash", { searchDir: "." });
    const rels = matches.map((m) => m.relativePath);
    // Even searching from the codebase root (".") the node_modules tree must be skipped
    for (const r of rels) {
      expect(r.split(path.sep)).not.toContain("node_modules");
    }
  });
});

describe("buildLibraryImportMap", () => {
  it("returns library, matches, and globs for found importers", async () => {
    const map = await buildLibraryImportMap(FIXTURE, ["lodash"]);
    expect(map).toHaveLength(1);
    const entry = map[0];
    expect(entry?.library).toBe("lodash");
    expect(entry?.matches.length).toBeGreaterThan(0);
    // globs should mirror the matched relative paths when there ARE matches
    expect(entry?.globs).toEqual(entry?.matches.map((m) => m.relativePath));
  });

  it("falls back to default glob when no importers found", async () => {
    const map = await buildLibraryImportMap(FIXTURE, ["nonexistent-lib"]);
    expect(map).toHaveLength(1);
    const entry = map[0];
    expect(entry?.matches).toEqual([]);
    expect(entry?.globs).toEqual(["src/**/*.{ts,tsx,js,mjs,cjs}"]);
  });

  it("processes multiple libraries independently", async () => {
    const map = await buildLibraryImportMap(FIXTURE, ["lodash", "express"]);
    expect(map).toHaveLength(2);
    const lodash = map.find((m) => m.library === "lodash");
    const express = map.find((m) => m.library === "express");
    expect(lodash?.matches.length).toBeGreaterThan(0);
    expect(express?.matches.length).toBeGreaterThan(0);
  });
});
