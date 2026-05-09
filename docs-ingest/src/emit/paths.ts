import path from "node:path";
import type { DocSource } from "../types.js";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function leafPathForSource(
  contextMapRoot: string,
  source: DocSource,
  topicSlug: string,
): string {
  if (source.defaultScope === "library") {
    const lib = source.defaultLibraryName ?? "unknown";
    return path.join(contextMapRoot, "library", lib, `${topicSlug}.md`);
  }
  return path.join(contextMapRoot, "source", source.id, `${topicSlug}.md`);
}

export function topicSlugForSource(
  source: DocSource,
  firstDocPath?: string,
): string {
  if (firstDocPath) {
    const noExt = firstDocPath.replace(/\.[^.]+$/, "");
    const slug = slugify(path.basename(noExt));
    if (slug) return slug;
  }
  const base = path.basename(source.uri);
  return slugify(base) || "advisories";
}
