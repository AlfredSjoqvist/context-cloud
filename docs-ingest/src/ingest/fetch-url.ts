import { z } from "zod";
import type { DocSource, SourceKind } from "../types.js";
import { makeSourceId } from "../sources/registry.js";

export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
export const USER_AGENT = "docs-ingest/0.1";

/**
 * Minimal fetcher abstraction so tests can inject a mock without hitting
 * the network. Production calls pass `globalThis.fetch`.
 */
export type FetchFn = typeof globalThis.fetch;

const GhsaPackageSchema = z.object({
  ecosystem: z.string().optional(),
  name: z.string().optional(),
});

const GhsaVulnerabilitySchema = z.object({
  package: GhsaPackageSchema.optional(),
});

const GhsaAdvisorySchema = z.object({
  ghsa_id: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  html_url: z.string().url().optional(),
  vulnerabilities: z.array(GhsaVulnerabilitySchema).optional(),
});

export type GhsaAdvisory = z.infer<typeof GhsaAdvisorySchema>;

export interface UrlIngestResult {
  /** An ephemeral, in-memory source describing the fetched doc. */
  source: DocSource;
  /** Raw doc body, ready to be handed to the matching parser. */
  body: string;
  /** Display name used for downstream `path`/`title` derivation. */
  docName: string;
}

export interface FetchUrlOptions {
  url: string;
  codebaseRoot: string;
  outputRoot: string;
  /** Defaults to `globalThis.fetch`. */
  fetchFn?: FetchFn;
  /** Defaults to {@link DEFAULT_FETCH_TIMEOUT_MS}. */
  timeoutMs?: number;
}

interface UrlFetchOk {
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
}

const GHSA_API_PATH_RE =
  /^\/advisories\/(GHSA-[0-9a-z-]+)\/?$/i;

export function detectGhsaApiUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "api.github.com") return null;
  const m = GHSA_API_PATH_RE.exec(parsed.pathname);
  if (!m || !m[1]) return null;
  return m[1].toUpperCase();
}

function buildHeaders(isGhsaApi: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "text/html, text/markdown, text/plain, application/json;q=0.9, */*;q=0.5",
  };
  if (isGhsaApi) {
    headers["Accept"] = "application/vnd.github+json";
    headers["X-GitHub-Api-Version"] = "2022-11-28";
  }
  return headers;
}

async function fetchWithTimeout(
  url: string,
  fetchFn: FetchFn,
  timeoutMs: number,
  isGhsaApi: boolean,
): Promise<UrlFetchOk> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      headers: buildHeaders(isGhsaApi),
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText} for ${url}`,
      );
    }
    const text = await response.text();
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body: text,
      finalUrl: response.url || url,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Fetch timed out after ${timeoutMs}ms: ${url}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface SyntheticSourceArgs {
  kind: SourceKind;
  uri: string;
  defaultLibraryName?: string;
  sourceUrl: string;
  codebaseRoot: string;
  outputRoot: string;
}

function makeEphemeralSource(args: SyntheticSourceArgs): DocSource {
  const id = makeSourceId(args.kind, args.uri);
  const base: DocSource = {
    id,
    kind: args.kind,
    uri: args.uri,
    defaultScope: args.defaultLibraryName ? "library" : "module",
    codebaseRoot: args.codebaseRoot,
    outputRoot: args.outputRoot,
    sourceUrl: args.sourceUrl,
    ...(args.defaultLibraryName
      ? { defaultLibraryName: args.defaultLibraryName }
      : {}),
  };
  return base;
}

function buildGhsaResult(
  advisory: GhsaAdvisory,
  url: string,
  codebaseRoot: string,
  outputRoot: string,
): UrlIngestResult {
  const ghsaId = advisory.ghsa_id;
  const ghsaIdLower = ghsaId.toLowerCase();
  const firstVuln = advisory.vulnerabilities?.[0];
  const pkgName = firstVuln?.package?.name?.trim();
  const lib = pkgName && pkgName.length > 0 ? pkgName : ghsaIdLower;
  const description = advisory.description?.trim();
  const summary = advisory.summary?.trim();
  // Build a markdown body with H1 title + summary + description so the
  // downstream parser produces a sensible chunk and rule pool.
  const titleLine = `# ${ghsaId}${summary ? `: ${summary}` : ""}`;
  const bodyParts = [titleLine, ""];
  if (summary && summary.length > 0) {
    bodyParts.push(summary, "");
  }
  if (description && description.length > 0) {
    bodyParts.push(description, "");
  }
  const body = bodyParts.join("\n");

  // Use the canonical public URL (html_url) when provided; fall back to
  // the API URL we were called with so source_url is always set.
  const sourceUrl = advisory.html_url ?? url;

  const docName = `security-advisory-${ghsaIdLower}.md`;
  // Synthetic uri must be unique; encode the GHSA id so makeSourceId is stable.
  const syntheticUri = `ghsa://${ghsaIdLower}`;
  const source = makeEphemeralSource({
    kind: "markdown_dir",
    uri: syntheticUri,
    defaultLibraryName: lib,
    sourceUrl,
    codebaseRoot,
    outputRoot,
  });
  return { source, body, docName };
}

function classifyByContent(
  url: string,
  contentType: string,
): "markdown" | "html" | null {
  const ct = contentType.toLowerCase();
  if (ct.includes("text/markdown")) return "markdown";
  if (ct.includes("text/html") || ct.includes("application/xhtml+xml"))
    return "html";
  // URL pathname heuristic
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (/\.mdx?$/i.test(pathname)) return "markdown";
  if (/\.html?$/i.test(pathname)) return "html";
  return null;
}

function buildPlainResult(
  format: "markdown" | "html",
  body: string,
  url: string,
  codebaseRoot: string,
  outputRoot: string,
): UrlIngestResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  const baseName =
    parsed.pathname.split("/").filter(Boolean).pop() ?? parsed.hostname;
  const slug = slugify(baseName.replace(/\.[^.]+$/, "")) || "doc";
  const docName =
    format === "markdown" ? `${slug}.md` : `${slug}.html`;
  const kind: SourceKind = format === "markdown" ? "markdown_dir" : "html_url";
  const source = makeEphemeralSource({
    kind,
    uri: url,
    sourceUrl: url,
    codebaseRoot,
    outputRoot,
  });
  return { source, body, docName };
}

/**
 * Fetch a remote URL and synthesise an ephemeral DocSource + raw doc body.
 *
 * Supported forms (in detection order):
 *   1. GitHub Security Advisory API:
 *      `https://api.github.com/advisories/GHSA-xxxx-yyyy-zzzz` (JSON)
 *   2. Plain markdown — content-type `text/markdown` or `*.md(x)` URL
 *   3. Plain HTML — content-type `text/html` or `*.html` URL
 *
 * Throws when the format cannot be determined.
 */
export async function ingestFromUrl(
  opts: FetchUrlOptions,
): Promise<UrlIngestResult> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error(
      "global fetch is unavailable; require Node 18+ or pass fetchFn explicitly",
    );
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  const ghsaId = detectGhsaApiUrl(opts.url);
  const isGhsa = ghsaId !== null;

  const fetched = await fetchWithTimeout(
    opts.url,
    fetchFn,
    timeoutMs,
    isGhsa,
  );

  if (isGhsa) {
    let json: unknown;
    try {
      json = JSON.parse(fetched.body);
    } catch {
      throw new Error(
        `GHSA endpoint did not return JSON: ${opts.url}`,
      );
    }
    const advisory = GhsaAdvisorySchema.parse(json);
    return buildGhsaResult(
      advisory,
      opts.url,
      opts.codebaseRoot,
      opts.outputRoot,
    );
  }

  const format = classifyByContent(opts.url, fetched.contentType);
  if (format === null) {
    throw new Error(
      `Cannot determine document format for ${opts.url} (content-type=${fetched.contentType || "unknown"})`,
    );
  }
  return buildPlainResult(
    format,
    fetched.body,
    opts.url,
    opts.codebaseRoot,
    opts.outputRoot,
  );
}
