import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function resolveLocalUri(uri: string): string {
  if (uri.startsWith("file://")) return fileURLToPath(uri);
  return uri;
}

async function fetchOpenApiSpec(source: DocSource): Promise<FetchResult> {
  const errors: FetchResult["errors"] = [];
  const raw: RawDoc[] = [];
  const filePath = resolveLocalUri(source.uri);

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      errors.push({
        stage: "fetch",
        message: `OpenAPI source URI is not a readable file.`,
        path: filePath,
      });
      return { raw, errors };
    }
    const text = await fs.readFile(filePath, "utf8");
    const basename = path.basename(filePath);
    raw.push({
      id: `${source.id}:${basename}`,
      sourceId: source.id,
      path: basename,
      title: path.basename(basename, path.extname(basename)),
      format: "openapi",
      text,
    });
  } catch (err) {
    errors.push({
      stage: "fetch",
      message: err instanceof Error ? err.message : String(err),
      path: filePath,
    });
  }

  return { raw, errors };
}

export async function fetchSource(source: DocSource): Promise<FetchResult> {
  if (source.kind === "openapi_spec") {
    return fetchOpenApiSpec(source);
  }

  const errors: FetchResult["errors"] = [];
  const raw: RawDoc[] = [];

  if (source.kind !== "markdown_dir") {
    errors.push({
      stage: "fetch",
      message: `Source kind '${source.kind}' not supported in v1 (markdown only).`,
      path: source.uri,
    });
    return { raw, errors };
  }

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
