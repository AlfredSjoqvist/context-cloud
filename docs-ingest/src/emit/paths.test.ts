import { describe, it, expect } from "vitest";
import path from "node:path";
import { leafPathForSource, topicSlugForSource } from "./paths.js";
import type { DocSource } from "../types.js";

function makeSource(overrides: Partial<DocSource> = {}): DocSource {
  return {
    id: "abc123def456",
    kind: "markdown_dir",
    uri: "file:///docs/lodash",
    defaultScope: "library",
    defaultLibraryName: "lodash",
    codebaseRoot: "/codebase",
    outputRoot: "/out",
    ...overrides,
  };
}

describe("topicSlugForSource", () => {
  it("slugifies the doc basename when given firstDocPath", () => {
    const slug = topicSlugForSource(makeSource(), "docs/Security Advisories.md");
    expect(slug).toBe("security-advisories");
  });

  it("strips the file extension before slugifying", () => {
    const slug = topicSlugForSource(makeSource(), "docs/foo.bar.md");
    expect(slug).toBe("foo-bar");
  });

  it("falls back to source URI basename when no firstDocPath", () => {
    const slug = topicSlugForSource(
      makeSource({ uri: "file:///path/to/My Webhook Security.md" }),
    );
    // basename is "My Webhook Security.md", slugified
    expect(slug).toBe("my-webhook-security-md");
  });

  it("falls back to 'advisories' when basename slugifies to empty", () => {
    // basename of this URI is "!!!" which slugifies to "" → fallback to "advisories"
    const slug = topicSlugForSource(makeSource({ uri: "file:///!!!/" }));
    expect(slug).toBe("advisories");
  });
});

describe("leafPathForSource", () => {
  it("library scope produces {root}/library/{lib}/{slug}.md", () => {
    const out = leafPathForSource(
      "/ctx",
      makeSource({ defaultScope: "library", defaultLibraryName: "lodash" }),
      "security-advisories",
    );
    expect(out).toBe(path.join("/ctx", "library", "lodash", "security-advisories.md"));
  });

  it("library scope falls back to 'unknown' when defaultLibraryName missing", () => {
    const noLib: DocSource = {
      id: "abc",
      kind: "markdown_dir",
      uri: "file:///x",
      defaultScope: "library",
      codebaseRoot: "/c",
      outputRoot: "/o",
    };
    const out = leafPathForSource("/ctx", noLib, "topic");
    expect(out).toBe(path.join("/ctx", "library", "unknown", "topic.md"));
  });

  it("non-library scope produces {root}/source/{sourceId}/{slug}.md", () => {
    const out = leafPathForSource(
      "/ctx",
      makeSource({ defaultScope: "module", id: "src-id-7" }),
      "rules",
    );
    expect(out).toBe(path.join("/ctx", "source", "src-id-7", "rules.md"));
  });

  it("file scope also routes to {root}/source/{sourceId}/{slug}.md", () => {
    const out = leafPathForSource(
      "/ctx",
      makeSource({ defaultScope: "file", id: "id-x" }),
      "x",
    );
    expect(out).toBe(path.join("/ctx", "source", "id-x", "x.md"));
  });
});
