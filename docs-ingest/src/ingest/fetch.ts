import { promises as fs } from "node:fs";
import path from "node:path";
import type { DocSource, RawDoc } from "../types.js";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".context-map",
  ".next",
  ".turbo",
]);

async function* walkMarkdown(root: string): AsyncIterable<string> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdown(full);
    } else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) {
      yield full;
    }
  }
}

export interface FetchResult {
  raw: RawDoc[];
  errors: Array<{ stage: string; message: string; path?: string }>;
}

export async function fetchSource(source: DocSource): Promise<FetchResult> {
  const errors: FetchResult["errors"] = [];
  const raw: RawDoc[] = [];

  if (source.kind === "markdown_dir") {
    return fetchMarkdownDir(source, raw, errors);
  }

  if (source.kind === "html_url") {
    return fetchHtmlUrl(source, raw, errors);
  }

  errors.push({
    stage: "fetch",
    message: `Source kind '${source.kind}' not supported in v1.`,
    path: source.uri,
  });
  return { raw, errors };
}

async function fetchMarkdownDir(
  source: DocSource,
  raw: RawDoc[],
  errors: FetchResult["errors"],
): Promise<FetchResult> {
  const stat = await fs.stat(source.uri).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    errors.push({
      stage: "fetch",
      message: `Source URI is not a readable directory.`,
      path: source.uri,
    });
    return { raw, errors };
  }

  for await (const filePath of walkMarkdown(source.uri)) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const relativePath = path.relative(source.uri, filePath);
      raw.push({
        id: `${source.id}:${relativePath}`,
        sourceId: source.id,
        path: relativePath,
        title: path.basename(filePath, path.extname(filePath)),
        format: "md",
        text,
      });
    } catch (err) {
      errors.push({
        stage: "fetch",
        message: err instanceof Error ? err.message : String(err),
        path: filePath,
      });
    }
  }

  return { raw, errors };
}

function htmlPathFromUri(uri: string): string {
  // Derive a reasonable filename from the URL pathname's basename.
  // Falls back to "index.html" if the URL has no path component.
  let pathname: string;
  try {
    const url = new URL(uri);
    pathname = url.pathname;
  } catch {
    pathname = uri;
  }
  const base = path.posix.basename(pathname.replace(/\/+$/, ""));
  if (!base || base === "/" || base === ".") return "index.html";
  return base;
}

async function fetchHtmlUrl(
  source: DocSource,
  raw: RawDoc[],
  errors: FetchResult["errors"],
): Promise<FetchResult> {
  try {
    const docPath = htmlPathFromUri(source.uri);
    let text: string;

    if (source.uri.startsWith("file://")) {
      const filePath = new URL(source.uri).pathname;
      text = await fs.readFile(filePath, "utf8");
    } else {
      const response = await fetch(source.uri);
      if (!response.ok) {
        errors.push({
          stage: "fetch",
          message: `HTTP ${response.status} ${response.statusText} for ${source.uri}`,
          path: source.uri,
        });
        return { raw, errors };
      }
      text = await response.text();
    }

    raw.push({
      id: `${source.id}:${docPath}`,
      sourceId: source.id,
      path: docPath,
      title: docPath,
      format: "html",
      text,
    });
  } catch (err) {
    errors.push({
      stage: "fetch",
      message: err instanceof Error ? err.message : String(err),
      path: source.uri,
    });
  }

  return { raw, errors };
}
