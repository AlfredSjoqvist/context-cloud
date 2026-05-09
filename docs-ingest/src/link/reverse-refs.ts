import { promises as fs } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".context-map",
  ".next",
  ".turbo",
  "coverage",
]);

const CODE_EXT = /\.(?:[mc]?[jt]sx?)$/i;

/**
 * Patterns that mention a `.md`/`.mdx` doc inside source code.
 *  - `@see foo.md`            (JSDoc/TSDoc)
 *  - `// see foo.md`, `# see foo.md`, `* see foo.md`   (free-form comments)
 *  - `// ref: foo.md`, `// doc: foo.md`                (informal)
 * We capture the doc reference (a .md or .mdx path) loosely; the linker
 * matches it against known doc names by basename.
 */
const REVERSE_REF_PATTERNS: RegExp[] = [
  /@see\s+([^\s)<>"']+\.(?:md|mdx))\b/gi,
  /(?:\/\/|#|\*)\s*(?:see|ref|doc)[:\s]+([^\s)<>"']+\.(?:md|mdx))\b/gi,
];

async function* walkCode(root: string): AsyncIterable<string> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) yield* walkCode(full);
    else if (entry.isFile() && CODE_EXT.test(entry.name)) yield full;
  }
}

export interface ReverseReference {
  /** Path relative to codebaseRoot, POSIX-style. */
  sourceFile: string;
  /** The raw doc reference as captured (e.g., "docs/api/payments.md"). */
  docRef: string;
  /** Just the filename portion of `docRef` (e.g., "payments.md"). */
  docBasename: string;
}

/**
 * Scan a codebase for source-side references back to documentation files.
 * Returns one entry per (file, docRef) pair found.
 *
 * Best-effort: file read errors are skipped silently; the walker ignores
 * `node_modules`, dotfiles, and common build directories.
 */
export async function scanReverseReferences(
  codebaseRoot: string,
  options: { searchDir?: string } = {},
): Promise<ReverseReference[]> {
  const searchRoot = path.join(codebaseRoot, options.searchDir ?? "src");
  const results: ReverseReference[] = [];
  const seen = new Set<string>();

  for await (const file of walkCode(searchRoot)) {
    let body: string;
    try {
      body = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    const sourceRel = path.relative(codebaseRoot, file).split(path.sep).join("/");

    for (const pattern of REVERSE_REF_PATTERNS) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(body)) !== null) {
        const docRef = m[1];
        if (!docRef) continue;
        const dedupeKey = `${sourceRel}::${docRef}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        results.push({
          sourceFile: sourceRel,
          docRef,
          docBasename: path.posix.basename(docRef),
        });
      }
    }
  }

  return results;
}

/**
 * Given the scanned references and a list of doc names emitted by this
 * source, return the source files that reference any of them. Matching
 * is by basename (so `docs/api/payments.md` and `payments.md` both
 * match a doc named `payments.md`).
 */
export function selectReferencingSourceFiles(
  refs: ReverseReference[],
  docNames: string[],
): string[] {
  const wanted = new Set(docNames.map((d) => path.posix.basename(d)));
  const out = new Set<string>();
  for (const r of refs) {
    if (wanted.has(r.docBasename)) out.add(r.sourceFile);
  }
  return [...out].sort();
}
