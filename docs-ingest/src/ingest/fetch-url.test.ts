import { describe, it, expect } from "vitest";
import {
  ingestFromUrl,
  detectGhsaApiUrl,
  USER_AGENT,
  type FetchFn,
} from "./fetch-url.js";

interface MockCallRecord {
  url: string;
  init: RequestInit | undefined;
}

function makeMockFetch(
  body: string,
  contentType: string,
  status = 200,
): { fn: FetchFn; calls: MockCallRecord[] } {
  const calls: MockCallRecord[] = [];
  const fn: FetchFn = async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    calls.push({ url, init });
    return new Response(body, {
      status,
      headers: { "content-type": contentType },
    });
  };
  return { fn, calls };
}

describe("detectGhsaApiUrl", () => {
  it("recognises canonical advisory URL", () => {
    expect(
      detectGhsaApiUrl(
        "https://api.github.com/advisories/GHSA-35jh-r3h4-6jhm",
      ),
    ).toBe("GHSA-35JH-R3H4-6JHM");
  });

  it("ignores other GitHub API endpoints", () => {
    expect(
      detectGhsaApiUrl("https://api.github.com/repos/foo/bar"),
    ).toBeNull();
  });

  it("ignores non-GitHub URLs", () => {
    expect(
      detectGhsaApiUrl("https://example.com/advisories/GHSA-aaaa-bbbb-cccc"),
    ).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(detectGhsaApiUrl("not a url")).toBeNull();
  });
});

describe("ingestFromUrl — GHSA", () => {
  const ghsaJson = JSON.stringify({
    ghsa_id: "GHSA-35jh-r3h4-6jhm",
    summary: "Command Injection in lodash",
    description:
      "Versions of lodash prior to 4.17.21 are vulnerable to Command Injection via the template function.\n\nUsers MUST upgrade to lodash 4.17.21 or later.",
    html_url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
    vulnerabilities: [
      {
        package: { ecosystem: "npm", name: "lodash" },
      },
    ],
  });

  it("derives library from package.name and synthesises a markdown source", async () => {
    const { fn, calls } = makeMockFetch(ghsaJson, "application/json");
    const result = await ingestFromUrl({
      url: "https://api.github.com/advisories/GHSA-35jh-r3h4-6jhm",
      codebaseRoot: "/code",
      outputRoot: "/out",
      fetchFn: fn,
    });
    expect(result.source.kind).toBe("markdown_dir");
    expect(result.source.defaultLibraryName).toBe("lodash");
    expect(result.source.defaultScope).toBe("library");
    expect(result.source.sourceUrl).toBe(
      "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
    );
    expect(result.docName).toBe("security-advisory-ghsa-35jh-r3h4-6jhm.md");
    expect(result.body).toContain("# GHSA-35jh-r3h4-6jhm");
    expect(result.body).toContain("MUST upgrade to lodash 4.17.21 or later");
    // Verify request shape
    expect(calls).toHaveLength(1);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(headers["Accept"]).toBe("application/vnd.github+json");
  });

  it("falls back to ghsa-id slug when package.name is absent", async () => {
    const noPkgJson = JSON.stringify({
      ghsa_id: "GHSA-aaaa-bbbb-cccc",
      description: "An advisory MUST be heeded by all consumers carefully.",
    });
    const { fn } = makeMockFetch(noPkgJson, "application/json");
    const result = await ingestFromUrl({
      url: "https://api.github.com/advisories/GHSA-aaaa-bbbb-cccc",
      codebaseRoot: "/code",
      outputRoot: "/out",
      fetchFn: fn,
    });
    expect(result.source.defaultLibraryName).toBe("ghsa-aaaa-bbbb-cccc");
    expect(result.source.sourceUrl).toBe(
      "https://api.github.com/advisories/GHSA-aaaa-bbbb-cccc",
    );
  });

  it("rejects non-JSON GHSA response", async () => {
    const { fn } = makeMockFetch("<html>nope</html>", "text/html");
    await expect(
      ingestFromUrl({
        url: "https://api.github.com/advisories/GHSA-zzzz-zzzz-zzzz",
        codebaseRoot: "/code",
        outputRoot: "/out",
        fetchFn: fn,
      }),
    ).rejects.toThrow(/did not return JSON/);
  });
});

describe("ingestFromUrl — plain markdown", () => {
  it("classifies *.md URLs as markdown", async () => {
    const md = "# Hello\n\nUsers MUST be polite to one another always.\n";
    const { fn } = makeMockFetch(md, "text/plain; charset=utf-8");
    const result = await ingestFromUrl({
      url: "https://example.com/docs/hello.md",
      codebaseRoot: "/code",
      outputRoot: "/out",
      fetchFn: fn,
    });
    expect(result.source.kind).toBe("markdown_dir");
    expect(result.source.defaultScope).toBe("module");
    expect(result.source.sourceUrl).toBe("https://example.com/docs/hello.md");
    expect(result.docName).toBe("hello.md");
    expect(result.body).toBe(md);
  });

  it("classifies text/markdown content-type as markdown", async () => {
    const md = "# Hi";
    const { fn } = makeMockFetch(md, "text/markdown; charset=utf-8");
    const result = await ingestFromUrl({
      url: "https://example.com/foo",
      codebaseRoot: "/code",
      outputRoot: "/out",
      fetchFn: fn,
    });
    expect(result.source.kind).toBe("markdown_dir");
  });
});

describe("ingestFromUrl — HTML", () => {
  it("classifies text/html content as html", async () => {
    const html = "<html><body><h1>Hello</h1></body></html>";
    const { fn } = makeMockFetch(html, "text/html; charset=utf-8");
    const result = await ingestFromUrl({
      url: "https://example.com/page",
      codebaseRoot: "/code",
      outputRoot: "/out",
      fetchFn: fn,
    });
    expect(result.source.kind).toBe("html_url");
    expect(result.source.sourceUrl).toBe("https://example.com/page");
    expect(result.docName).toBe("page.html");
    expect(result.body).toBe(html);
  });
});

describe("ingestFromUrl — error cases", () => {
  it("throws when format cannot be determined", async () => {
    const { fn } = makeMockFetch("binary blob", "application/octet-stream");
    await expect(
      ingestFromUrl({
        url: "https://example.com/blob",
        codebaseRoot: "/code",
        outputRoot: "/out",
        fetchFn: fn,
      }),
    ).rejects.toThrow(/Cannot determine document format/);
  });

  it("propagates non-2xx HTTP errors", async () => {
    const { fn } = makeMockFetch("not found", "text/plain", 404);
    await expect(
      ingestFromUrl({
        url: "https://example.com/missing.md",
        codebaseRoot: "/code",
        outputRoot: "/out",
        fetchFn: fn,
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("times out long-running fetches", async () => {
    const slowFetch: FetchFn = (_url, init) => {
      return new Promise((_resolve, reject) => {
        const sig = init?.signal as AbortSignal | undefined;
        sig?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };
    await expect(
      ingestFromUrl({
        url: "https://example.com/docs/x.md",
        codebaseRoot: "/code",
        outputRoot: "/out",
        fetchFn: slowFetch,
        timeoutMs: 30,
      }),
    ).rejects.toThrow(/timed out/);
  });
});
