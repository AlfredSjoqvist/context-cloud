import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { SourceRegistry, makeSourceId } from "./registry.js";
import type { DocSource } from "../types.js";

let workdir: string;
let registryPath: string;

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "registry-test-"));
  registryPath = path.join(workdir, "sources.json");
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function makeSource(overrides: Partial<DocSource> = {}): Omit<DocSource, "id"> {
  return {
    kind: "markdown_dir",
    uri: "file:///docs/lodash",
    defaultScope: "library",
    defaultLibraryName: "lodash",
    codebaseRoot: "/codebase",
    outputRoot: "/out",
    ...overrides,
  };
}

describe("makeSourceId", () => {
  it("produces a 16-char hex id", () => {
    const id = makeSourceId("markdown_dir", "file:///docs/lodash");
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  it("is stable across calls with same args", () => {
    const a = makeSourceId("markdown_dir", "file:///x");
    const b = makeSourceId("markdown_dir", "file:///x");
    expect(a).toBe(b);
  });

  it("differs when kind differs", () => {
    const a = makeSourceId("markdown_dir", "file:///x");
    const b = makeSourceId("html_url", "file:///x");
    expect(a).not.toBe(b);
  });

  it("differs when uri differs", () => {
    const a = makeSourceId("markdown_dir", "file:///x");
    const b = makeSourceId("markdown_dir", "file:///y");
    expect(a).not.toBe(b);
  });
});

describe("SourceRegistry", () => {
  it("returns empty list when registry file does not exist", async () => {
    const reg = new SourceRegistry(registryPath);
    const list = await reg.list();
    expect(list).toEqual([]);
  });

  it("upserts and persists a source to disk", async () => {
    const reg = new SourceRegistry(registryPath);
    const inserted = await reg.upsert(makeSource());
    expect(inserted.id).toMatch(/^[a-f0-9]{16}$/);

    const onDisk = JSON.parse(await fs.readFile(registryPath, "utf8"));
    expect(onDisk.version).toBe(1);
    expect(onDisk.sources).toHaveLength(1);
    expect(onDisk.sources[0].uri).toBe("file:///docs/lodash");
  });

  it("round-trips: a fresh registry instance loads the persisted source", async () => {
    const a = new SourceRegistry(registryPath);
    const inserted = await a.upsert(makeSource());

    const b = new SourceRegistry(registryPath);
    const fetched = await b.get(inserted.id);
    expect(fetched).toBeDefined();
    expect(fetched?.uri).toBe("file:///docs/lodash");
    expect(fetched?.defaultLibraryName).toBe("lodash");
  });

  it("upsert replaces existing source with same id", async () => {
    const reg = new SourceRegistry(registryPath);
    const first = await reg.upsert(makeSource());
    const updated = await reg.upsert(
      makeSource({ defaultLibraryName: "lodash-renamed" }),
    );
    expect(updated.id).toBe(first.id);

    const list = await reg.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.defaultLibraryName).toBe("lodash-renamed");
  });

  it("markIngested updates ingestedAt timestamp", async () => {
    const reg = new SourceRegistry(registryPath);
    const inserted = await reg.upsert(makeSource());
    const ts = "2024-01-02T03:04:05.000Z";
    await reg.markIngested(inserted.id, ts);

    const fetched = await reg.get(inserted.id);
    expect(fetched?.ingestedAt).toBe(ts);

    // Persisted to disk
    const onDisk = JSON.parse(await fs.readFile(registryPath, "utf8"));
    expect(onDisk.sources[0].ingestedAt).toBe(ts);
  });

  it("markIngested throws on unknown id", async () => {
    const reg = new SourceRegistry(registryPath);
    await expect(reg.markIngested("doesnotexist", new Date().toISOString()))
      .rejects.toThrow(/Unknown source id/);
  });

  it("remove deletes a source and persists", async () => {
    const reg = new SourceRegistry(registryPath);
    const inserted = await reg.upsert(makeSource());
    const removed = await reg.remove(inserted.id);
    expect(removed).toBe(true);

    const list = await reg.list();
    expect(list).toHaveLength(0);

    const reloaded = new SourceRegistry(registryPath);
    expect(await reloaded.get(inserted.id)).toBeUndefined();
  });

  it("remove returns false for unknown id and does not throw", async () => {
    const reg = new SourceRegistry(registryPath);
    const removed = await reg.remove("nonexistent");
    expect(removed).toBe(false);
  });
});
